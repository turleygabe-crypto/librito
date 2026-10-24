import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { PGlite } from "@electric-sql/pglite";
import Stripe from "stripe";
import {
  authenticate, billingConfig, BillingError, eventCustomer, resumeRenewal, startCheckout, subscriptionSnapshot, processWebhook, withAccount,
} from "../lib/server/billing.js";
import { createHandler } from "../api/billing.js";
import { createWebhookHandler } from "../api/stripe-webhook.js";

const sql = new PGlite();
const userId = "11111111-1111-4111-8111-111111111111";
const config = { origin: "https://librito.casa", prices: { monthly: "price_month", annual: "price_year" } };
const user = { id: userId, email: "reader@example.test" };

before(async () => {
  await sql.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (
      id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
      created_at timestamptz default now(), last_sign_in_at timestamptz
    );
    create table public.profiles (
      id uuid primary key references auth.users(id), email text, full_name text,
      tier text not null default 'lite_reader'
    );
    create table public.books (user_id uuid);
    create table public.shelves (user_id uuid);
    create table public.liked_books (user_id uuid);
    create table public.admins (user_id uuid);
    create function public.is_admin() returns boolean language sql as
      $$ select coalesce(current_setting('test.admin', true), 'false') = 'true' $$;
    grant usage on schema public to authenticated, anon, service_role;
    grant select, insert, update on public.profiles to authenticated;
    insert into auth.users(id, email) values ('${userId}', 'reader@example.test');
    insert into public.profiles(id, tier) values ('${userId}', 'book_lover');
  `);
  await sql.exec(await readFile(new URL("../supabase/migrations/20261024250000_stripe_billing.sql", import.meta.url), "utf8"));
});

after(() => sql.close());

function database() {
  return {
    rpc: async (name, args) => {
      try {
        const result = await sql.query(`select public.${name}($1, $2) as account`, [args.target_user, args.owner]);
        return { data: result.rows[0].account };
      } catch (error) { return { error }; }
    },
    from(table) {
      let operation = "select";
      let values;
      let columns = "*";
      const filters = [];
      const params = [];
      let single = false;
      let required = false;
      const query = {
        select(value) { columns = value; return query; },
        update(value) { operation = "update"; values = value; return query; },
        insert(value) { operation = "insert"; values = value; return query; },
        eq(key, value) { params.push(value); filters.push(`${key} = $${params.length}`); return query; },
        gt(key, value) { params.push(value); filters.push(`${key} > $${params.length}`); return query; },
        single() { single = true; required = true; return query; },
        maybeSingle() { single = true; return query; },
        async then(resolve, reject) {
          try {
            let statement;
            const where = filters.length ? ` where ${filters.join(" and ")}` : "";
            if (operation === "select") statement = `select ${columns} from ${table}${where}`;
            else {
              const entries = Object.entries(values);
              const refs = entries.map(([, value]) => { params.push(value); return `$${params.length}`; });
              statement = operation === "update"
                ? `update ${table} set ${entries.map(([key], i) => `${key} = ${refs[i]}`).join(", ")}${where} returning ${columns}`
                : `insert into ${table} (${entries.map(([key]) => key).join(", ")}) values (${refs.join(", ")}) returning ${columns}`;
            }
            const { rows } = await sql.query(statement, params);
            if (required && rows.length !== 1) throw new Error("Expected one database row");
            return resolve({ data: single ? rows[0] || null : rows });
          } catch (error) { return resolve({ error }); }
        },
      };
      return query;
    },
  };
}

function stripeMock(subscriptions = []) {
  return {
    subscriptions: { list: () => (async function* () { yield* subscriptions; })() },
    customers: { create: async () => ({ id: "cus_reader" }) },
    prices: { retrieve: async (id) => ({
      id, active: true, currency: "usd", unit_amount: id === "price_month" ? 299 : 2499,
      recurring: { interval: id === "price_month" ? "month" : "year", interval_count: 1 },
    }) },
    checkout: { sessions: {
      create: async () => ({ id: "cs_reader", url: "https://checkout.stripe.com/test" }),
    } },
  };
}

function subscription(status, price = "price_month") {
  return { status, cancel_at_period_end: true, items: { data: [{ price: { id: price }, current_period_end: 1800000000 }] } };
}

function response() {
  return {
    headers: {}, code: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("billing config validates origin and requires both configured prices", () => {
  assert.throws(() => billingConfig({}), BillingError);
  assert.throws(() => billingConfig({ APP_URL: "not a URL" }), { status: 503 });
  assert.throws(() => billingConfig({ APP_URL: "http://librito.casa" }), BillingError);
  assert.equal(billingConfig({
    APP_URL: "http://localhost:3000", STRIPE_PRICE_MONTHLY: "m", STRIPE_PRICE_ANNUAL: "y",
  }).origin, "http://localhost:3000");
});

test("authentication validates the token with Supabase rather than trusting client identity", async () => {
  const db = { auth: { getUser: async (token) => token === "valid" ? { data: { user } } : { error: new Error("invalid") } } };
  await assert.rejects(authenticate({ headers: {} }, db), { status: 401 });
  await assert.rejects(authenticate({ headers: { authorization: "Bearer forged" } }, db), { status: 401 });
  assert.equal((await authenticate({ headers: { authorization: "Bearer valid" } }, db)).id, userId);
});

test("migration preserves grants, protects entitlements and keeps Stripe/admin access independent", async () => {
  let profile = (await sql.query("select * from profiles")).rows[0];
  assert.equal(profile.complimentary_book_lover, true);
  await sql.exec("set role authenticated");
  try {
    await assert.rejects(sql.exec("update profiles set complimentary_book_lover = false"), /permission denied/);
    await assert.rejects(sql.exec("update profiles set tier = 'book_lover'"), /permission denied/);
    await assert.rejects(sql.exec(`select billing_lock('${userId}', '${userId}')`), /permission denied/);
    await assert.rejects(sql.exec("select * from billing_accounts"), /permission denied/);
    await sql.exec("update profiles set full_name = 'Reader'");
  } finally {
    await sql.exec("reset role");
  }
  await sql.exec("set test.admin = 'true'");
  await sql.query("select admin_set_tier($1, 'lite_reader')", [userId]);
  assert.equal((await sql.query("select tier from profiles")).rows[0].tier, "lite_reader");
  await sql.query("insert into billing_accounts(user_id, has_access) values ($1, true)", [userId]);
  assert.equal((await sql.query("select tier from profiles")).rows[0].tier, "book_lover");
  await sql.query("select admin_set_tier($1, 'lite_reader')", [userId]);
  assert.equal((await sql.query("select tier from profiles")).rows[0].tier, "book_lover");
  await sql.query("select admin_set_tier($1, 'book_lover')", [userId]);
  await sql.exec("update billing_accounts set has_access = false");
  assert.equal((await sql.query("select tier from profiles")).rows[0].tier, "book_lover");
  await sql.query("select admin_set_tier($1, 'lite_reader')", [userId]);
});

test("subscription lifecycle preserves access during retries, ends it on cancellation or unpaid, ignores unrelated Prices", async () => {
  for (const [status, access, live] of [
    ["active", true, true], ["trialing", true, true], ["past_due", true, true],
    ["unpaid", false, true], ["paused", false, true], ["incomplete", false, true],
    ["canceled", false, false], ["incomplete_expired", false, false],
  ]) {
    const snapshot = await subscriptionSnapshot(stripeMock([subscription(status)]), "cus_reader", config);
    assert.equal(snapshot.has_access, access, status);
    assert.equal(snapshot.has_subscription, live, status);
  }
  assert.equal((await subscriptionSnapshot(stripeMock([subscription("active", "price_other")]), "cus_reader", config)).has_access, false);
});

test("scheduled cancellation uses its actual end date and ignores unrelated item periods", async () => {
  const sub = subscription("active");
  sub.cancel_at_period_end = false;
  sub.cancel_at = 1799000000;
  sub.items.data.push({ price: { id: "price_other" }, current_period_end: 1809000000 });
  const snapshot = await subscriptionSnapshot(stripeMock([sub]), "cus_reader", config);
  assert.equal(snapshot.cancel_at_period_end, true);
  assert.equal(snapshot.period_end, new Date(sub.cancel_at * 1000).toISOString());
});

test("resuming renewal updates the existing owned subscription and reconciles access without Checkout", async () => {
  const sub = { ...subscription("active"), id: "sub_existing" };
  const stripe = stripeMock([sub]);
  let saved;
  stripe.subscriptions.update = async (id, params) => {
    assert.equal(id, "sub_existing");
    assert.deepEqual(params, { cancel_at_period_end: false, cancel_at: "" });
    sub.cancel_at_period_end = false;
  };
  await resumeRenewal({ stripe, config }, { customer_id: "cus_reader" }, async (values) => { saved = values; });
  assert.equal(saved.cancel_at_period_end, false);
  assert.equal(saved.has_access, true);
  await assert.rejects(resumeRenewal({ stripe, config }, { customer_id: "cus_reader" }, async () => {}), { status: 409 });
  sub.status = "canceled";
  sub.cancel_at_period_end = true;
  await assert.rejects(resumeRenewal({ stripe, config }, { customer_id: "cus_reader" }, async () => {}), { status: 409 });
});

test("resume failures propagate and never mark renewal as restored", async () => {
  const stripe = stripeMock([{ ...subscription("active"), id: "sub_existing" }]);
  stripe.subscriptions.update = async () => { throw new Error("Stripe permission denied"); };
  let saved = false;
  await assert.rejects(resumeRenewal({ stripe, config }, { customer_id: "cus_reader" }, async () => { saved = true; }), /permission denied/);
  assert.equal(saved, false);
});

test("account lock rejects concurrent work and releases on errors", async () => {
  const db = database();
  await assert.rejects(withAccount(db, userId, async () => {
    await assert.rejects(withAccount(db, userId, async () => {}), { status: 409 });
    throw new Error("deliberate failure");
  }), /deliberate failure/);
  assert.equal((await sql.query("select lock_owner from billing_accounts")).rows[0].lock_owner, null);
  await withAccount(db, userId, async (account, save) => {
    await sql.exec("update billing_accounts set locked_until = now() - interval '1 second'");
    await assert.rejects(save({ has_access: true }), /Expected one database row/);
  });
  await withAccount(db, userId, async () => {});
});

test("checkout uses server Prices and verified user, validates amount, reuses open sessions and blocks duplicate subscriptions", async () => {
  const stripe = stripeMock();
  const account = {};
  const save = async (values) => Object.assign(account, values);
  let created;
  stripe.checkout.sessions.create = async (params) => {
    created = params;
    return { id: "cs_reader", url: "https://checkout.stripe.com/test" };
  };
  await assert.rejects(startCheckout({ stripe, config }, user, account, save, "forged_price"), { status: 400 });
  assert.equal(await startCheckout({ stripe, config }, user, account, save, "annual"), "https://checkout.stripe.com/test");
  assert.equal(created.mode, "subscription");
  assert.deepEqual(created.line_items, [{ price: "price_year", quantity: 1 }]);
  assert.equal(created.client_reference_id, userId);
  assert.equal(created.success_url, "https://librito.casa/#/upgrade?checkout=success");
  assert.equal(created.payment_method_types, undefined);
  stripe.checkout.sessions.retrieve = async () => ({ status: "open", metadata: { billing: "annual" }, url: "https://checkout.stripe.com/existing" });
  assert.equal(await startCheckout({ stripe, config }, user, account, save, "annual"), "https://checkout.stripe.com/existing");
  stripe.subscriptions = stripeMock([subscription("active")]).subscriptions;
  await assert.rejects(startCheckout({ stripe, config }, user, account, save, "monthly"), { status: 409 });
  stripe.subscriptions = stripeMock().subscriptions;
  account.checkout_session_id = null;
  stripe.prices.retrieve = async () => ({ active: true, currency: "eur", unit_amount: 299 });
  await assert.rejects(startCheckout({ stripe, config }, user, account, save, "monthly"), { status: 503 });
});

test("webhooks reconcile live state, deduplicate deliveries, preserve complimentary grants and record risks", async () => {
  const db = database();
  await sql.query("update billing_accounts set customer_id = 'cus_reader' where user_id = $1", [userId]);
  const event = { id: "evt_paid", type: "invoice.paid", data: { object: { customer: "cus_reader" } } };
  await processWebhook({ db, stripe: stripeMock([subscription("active")]), config }, event);
  assert.equal((await sql.query("select tier from profiles")).rows[0].tier, "book_lover");
  await processWebhook({ db, stripe: stripeMock(), config }, event);
  assert.equal((await sql.query("select tier from profiles")).rows[0].tier, "book_lover");
  // An old event must read current Stripe state, not restore its old payload.
  await processWebhook({ db, stripe: stripeMock([subscription("canceled")]), config }, { ...event, id: "evt_old", type: "customer.subscription.updated" });
  assert.equal((await sql.query("select tier from profiles")).rows[0].tier, "lite_reader");
  await sql.query("select admin_set_tier($1, 'book_lover')", [userId]);
  await processWebhook({ db, stripe: stripeMock(), config }, { ...event, id: "evt_deleted", type: "customer.subscription.deleted" });
  assert.equal((await sql.query("select tier from profiles")).rows[0].tier, "book_lover");
  await processWebhook({ db, stripe: stripeMock(), config }, { ...event, id: "evt_refund", type: "charge.refunded" });
  assert.equal((await sql.query("select requires_review from billing_events where event_id = 'evt_refund'")).rows[0].requires_review, true);
});

test("checkout retries keep identical Stripe parameters when persisting a newly created Session fails", async () => {
  const stripe = stripeMock();
  const requests = [];
  stripe.checkout.sessions.create = async (params, options) => {
    requests.push({ params, options });
    return { id: "cs_retry", url: "https://checkout.stripe.com/retry" };
  };
  const account = { customer_id: "cus_reader" };
  const save = async (values) => {
    if (values.checkout_session_id) throw new Error("database unavailable");
    Object.assign(account, values);
  };
  for (let i = 0; i < 2; i++) {
    await assert.rejects(startCheckout({ stripe, config }, user, account, save, "monthly"), /database unavailable/);
  }
  assert.deepEqual(requests[0], requests[1]);
  assert.match(requests[0].params.integration_identifier, /^librito_checkout_[a-z]{8}$/);
});

test("asynchronous pending payments block duplicates but expired incomplete subscriptions allow a retry", async () => {
  const stripe = stripeMock();
  stripe.checkout.sessions.retrieve = async () => ({ status: "complete", payment_status: "unpaid", subscription: "sub_pending" });
  stripe.subscriptions.retrieve = async () => ({ status: "incomplete" });
  const account = { customer_id: "cus_reader", checkout_session_id: "cs_pending" };
  const save = async (values) => Object.assign(account, values);
  await assert.rejects(startCheckout({ stripe, config }, user, account, save, "monthly"), { status: 409 });
  stripe.subscriptions.retrieve = async () => ({ status: "incomplete_expired" });
  assert.equal(await startCheckout({ stripe, config }, user, account, save, "monthly"), "https://checkout.stripe.com/test");
});

test("changing billing intervals expires the old open Checkout before creating a new one", async () => {
  const stripe = stripeMock();
  const calls = [];
  stripe.checkout.sessions.retrieve = async () => ({ id: "cs_month", status: "open", metadata: { billing: "monthly" } });
  stripe.checkout.sessions.expire = async (id) => { calls.push(["expire", id]); };
  stripe.checkout.sessions.create = async (params) => {
    calls.push(["create", params.line_items[0].price]);
    return { id: "cs_year", url: "https://checkout.stripe.com/year" };
  };
  const account = { customer_id: "cus_reader", checkout_session_id: "cs_month" };
  await startCheckout({ stripe, config }, user, account, async (values) => Object.assign(account, values), "annual");
  assert.deepEqual(calls, [["expire", "cs_month"], ["create", "price_year"]]);
  assert.equal(account.checkout_session_id, "cs_year");
});

test("risk events resolve their charge's Customer; unrelated customerless payments are acknowledged", async () => {
  const stripe = { charges: { retrieve: async (id) => {
    assert.equal(id, "ch_risk");
    return { customer: "cus_reader" };
  } } };
  for (const type of ["charge.dispute.created", "radar.early_fraud_warning.created"]) {
    assert.equal(await eventCustomer(stripe, { type, data: { object: { charge: "ch_risk" } } }), "cus_reader");
  }
  await processWebhook({ db: database(), stripe, config }, {
    id: "evt_unrelated", type: "charge.refunded", data: { object: { customer: null } },
  });
});

test("webhook handler accepts signed raw payloads and rejects tampering", async () => {
  const stripe = new Stripe("sk_test_placeholder");
  const secret = "whsec_placeholder";
  const payload = JSON.stringify({ id: "evt_ignored", type: "unhandled.event", data: { object: {} } });
  const handler = createWebhookHandler(() => ({ stripe, config, db: database() }), () => secret);
  const signed = stripe.webhooks.generateTestHeaderString({ payload, secret });
  for (const [body, status] of [[payload, 200], [`${payload} `, 400]]) {
    const req = Readable.from([Buffer.from(body)]);
    req.method = "POST";
    req.headers = { "stripe-signature": signed };
    const res = response();
    await handler(req, res);
    assert.equal(res.code, status);
  }
});

test("webhook processing failures return non-2xx so Stripe retries, and unconfigured signing is explicit", async () => {
  const stripe = new Stripe("sk_test_placeholder");
  const secret = "whsec_placeholder";
  const payload = JSON.stringify({ id: "evt_failure", type: "invoice.paid", data: { object: { customer: "cus_reader" } } });
  const db = { from() { throw new Error("database unavailable"); } };
  const handler = createWebhookHandler(() => ({ stripe, config, db }), () => secret);
  const req = Readable.from([Buffer.from(payload)]);
  req.method = "POST";
  req.headers = { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret }) };
  const res = response();
  await handler(req, res);
  assert.equal(res.code, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /database unavailable/);
  const missing = response();
  await createWebhookHandler(() => ({ stripe }), () => undefined)({ method: "POST", headers: {} }, missing);
  assert.equal(missing.code, 503);
});

test("billing endpoint rejects methods, cross-origin requests and missing auth; provides portal and safe setup errors", async () => {
  const db = database();
  db.auth = { getUser: async () => ({ data: { user } }) };
  const stripe = { ...stripeMock(), billingPortal: { sessions: { create: async (params) => {
    assert.equal(params.customer, "cus_reader");
    return { url: "https://billing.stripe.com/test" };
  } } } };
  const handler = createHandler(() => ({ db, stripe, config }));
  for (const [req, status] of [
    [{ method: "DELETE", headers: {} }, 405],
    [{ method: "POST", headers: { origin: "https://evil.example" } }, 403],
    [{ method: "GET", headers: {} }, 401],
    [{ method: "GET", headers: { authorization: "Bearer valid" } }, 200],
    [{ method: "POST", headers: { authorization: "Bearer valid", origin: config.origin }, body: { action: "portal" } }, 200],
    [{ method: "POST", headers: { authorization: "Bearer valid", origin: config.origin }, body: { action: "checkout", billing: "monthly" } }, 409],
  ]) {
    const res = response();
    await handler(req, res);
    assert.equal(res.code, status);
    assert.equal(res.headers["Cache-Control"], "no-store");
    if (req.body?.action === "portal") assert.equal(res.body.url, "https://billing.stripe.com/test");
  }
  const res = response();
  await createHandler(() => { throw new BillingError(503, "Billing is not configured yet."); })({ method: "GET", headers: {} }, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.error, "Billing is not configured yet.");
});

test("status refresh replaces a stale renewal flag with Stripe cancellation even without webhook delivery", async () => {
  const db = database();
  db.auth = { getUser: async () => ({ data: { user } }) };
  await sql.exec("update billing_accounts set cancel_at_period_end = false, has_subscription = true, subscription_status = 'active'");
  const sub = { ...subscription("active"), cancel_at_period_end: false, cancel_at: 1800000000 };
  const stripe = stripeMock([sub]);
  const req = { method: "GET", headers: { authorization: "Bearer valid" } };
  const res = response();
  await createHandler(() => ({ db, stripe, config }))(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.cancelAtPeriodEnd, true);
  assert.equal(res.body.hasSubscription, true);
  assert.equal(new Date(res.body.periodEnd).toISOString(), new Date(sub.cancel_at * 1000).toISOString());
  assert.equal((await sql.query("select cancel_at_period_end from billing_accounts")).rows[0].cancel_at_period_end, true);
  assert.equal((await sql.query("select tier from profiles")).rows[0].tier, "book_lover");
});

test("status refresh does not return stale renewal information if Stripe is unavailable", async () => {
  const db = database();
  db.auth = { getUser: async () => ({ data: { user } }) };
  const stripe = { subscriptions: { list() { throw new Error("Stripe unavailable"); } } };
  const res = response();
  await createHandler(() => ({ db, stripe, config }))({
    method: "GET", headers: { authorization: "Bearer valid" },
  }, res);
  assert.equal(res.code, 500);
  assert.equal(res.body.cancelAtPeriodEnd, undefined);
  assert.equal((await sql.query("select lock_owner from billing_accounts")).rows[0].lock_owner, null);
});

test("resume endpoint uses the authenticated Customer and rejects cross-origin mutations", async () => {
  const db = database();
  db.auth = { getUser: async () => ({ data: { user } }) };
  const sub = { ...subscription("active"), id: "sub_owned" };
  const stripe = stripeMock([sub]);
  const list = stripe.subscriptions.list;
  stripe.subscriptions.list = (params) => {
    assert.equal(params.customer, "cus_reader");
    return list(params);
  };
  stripe.subscriptions.update = async (id) => {
    assert.equal(id, "sub_owned");
    sub.cancel_at_period_end = false;
  };
  const handler = createHandler(() => ({ db, stripe, config }));
  const res = response();
  await handler({
    method: "POST", headers: { origin: config.origin, authorization: "Bearer valid" },
    body: { action: "resume", customer: "cus_attacker", userId: "someone_else" },
  }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { resumed: true });
  assert.equal((await sql.query("select cancel_at_period_end from billing_accounts")).rows[0].cancel_at_period_end, false);
  const rejected = response();
  await handler({ method: "POST", headers: { origin: "https://evil.example" }, body: { action: "resume" } }, rejected);
  assert.equal(rejected.code, 403);
});
