import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { PGlite } from "@electric-sql/pglite";
import Stripe from "stripe";
import {
  authenticate, billingConfig, BillingBusyError, BillingError, cancelRenewal, eventCustomer, respondError, resumeRenewal, startCheckout, subscriptionSnapshot, processWebhook, withAccount,
} from "../lib/server/billing.js";
import { createHandler } from "../api/billing.js";
import { createWebhookHandler } from "../api/stripe-webhook.js";

const sql = new PGlite();
const userId = "11111111-1111-4111-8111-111111111111";
const config = { livemode: false, origin: "https://librito.casa", prices: { monthly: "price_month", annual: "price_year" } };
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
  await sql.exec(await readFile(new URL("../supabase/migrations/20261024260000_stripe_billing_modes.sql", import.meta.url), "utf8"));
});

after(() => sql.close());

function database() {
  return {
    rpc: async (name, args) => {
      try {
        const params = name === "billing_assert_mode" ? [args.target_livemode]
          : [args.target_user, args.owner, args.target_livemode];
        const result = await sql.query(`select public.${name}(${params.map((_, i) => `$${i + 1}`).join(", ")}) as account`, params);
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
      id, livemode: false, active: true, currency: "usd", unit_amount: id === "price_month" ? 299 : 2499,
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
  const env = {
    APP_URL: "http://localhost:3000", STRIPE_PRICE_MONTHLY: "m", STRIPE_PRICE_ANNUAL: "y",
    STRIPE_MODE: "test", STRIPE_SECRET_KEY: "rk_test_placeholder",
  };
  assert.throws(() => billingConfig({}), BillingError);
  assert.throws(() => billingConfig({ ...env, APP_URL: "not a URL" }), { status: 503 });
  assert.throws(() => billingConfig({ ...env, APP_URL: "http://librito.casa" }), BillingError);
  assert.throws(() => billingConfig({ ...env, STRIPE_PRICE_ANNUAL: "" }), BillingError);
  assert.equal(billingConfig(env).origin, "http://localhost:3000");
});

test("billing requires an explicit mode matching a server-side test or live key", () => {
  const env = { APP_URL: "https://librito.casa", STRIPE_PRICE_MONTHLY: "m", STRIPE_PRICE_ANNUAL: "y" };
  for (const mode of ["test", "live"]) {
    for (const prefix of ["rk", "sk"]) {
      assert.equal(billingConfig({ ...env, STRIPE_MODE: mode, STRIPE_SECRET_KEY: `${prefix}_${mode}_placeholder` }).livemode, mode === "live");
    }
  }
  for (const [mode, key] of [[undefined, "rk_test_placeholder"], ["live", "rk_test_placeholder"],
    ["test", "rk_live_placeholder"], ["test", "pk_test_placeholder"], ["invalid", "sk_test_placeholder"]]) {
    assert.throws(() => billingConfig({ ...env, STRIPE_MODE: mode, STRIPE_SECRET_KEY: key }), { status: 503 });
  }
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
    assert.deepEqual(params, { cancel_at_period_end: false });
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

test("direct cancellation preserves access, is repeat-safe, and does not refund or cancel immediately", async () => {
  const sub = { ...subscription("active"), id: "sub_cancel", cancel_at_period_end: false };
  const stripe = stripeMock([sub]);
  let updates = 0;
  stripe.subscriptions.update = async (id, params) => {
    updates++;
    assert.equal(id, sub.id);
    assert.deepEqual(params, { cancel_at_period_end: true });
    sub.cancel_at_period_end = true;
  };
  let saved;
  const save = async (value) => { saved = value; };
  await cancelRenewal({ stripe, config }, { customer_id: "cus_reader" }, save);
  assert.equal(saved.has_access, true);
  assert.equal(saved.cancel_at_period_end, true);
  await cancelRenewal({ stripe, config }, { customer_id: "cus_reader" }, save);
  assert.equal(updates, 1);
  sub.cancel_at_period_end = false;
  sub.cancel_at = 1799000000;
  await cancelRenewal({ stripe, config }, { customer_id: "cus_reader" }, save);
  assert.equal(updates, 1);
  assert.equal(saved.period_end, new Date(sub.cancel_at * 1000).toISOString());
});

test("direct cancellation rejects missing, unrelated, ended or ambiguous subscriptions and propagates Stripe failures", async () => {
  for (const subscriptions of [[], [subscription("canceled")], [subscription("active", "price_other")],
    [subscription("active"), subscription("active")]]) {
    await assert.rejects(cancelRenewal({ stripe: stripeMock(subscriptions), config },
      { customer_id: "cus_reader" }, async () => {}), { status: 409 });
  }
  const stripe = stripeMock([{ ...subscription("active"), cancel_at_period_end: false }]);
  stripe.subscriptions.update = async () => { throw new Error("permission denied"); };
  await assert.rejects(cancelRenewal({ stripe, config }, { customer_id: "cus_reader" },
    async () => { assert.fail("Must not report success"); }), /permission denied/);
});

test("resuming a timestamp-scheduled cancellation only clears cancel_at", async () => {
  const sub = { ...subscription("active"), id: "sub_timestamp", cancel_at_period_end: false, cancel_at: 1800000000 };
  const stripe = stripeMock([sub]);
  stripe.subscriptions.update = async (id, params) => {
    assert.equal(id, "sub_timestamp");
    assert.deepEqual(params, { cancel_at: "" });
    sub.cancel_at = null;
  };
  let saved;
  await resumeRenewal({ stripe, config }, { customer_id: "cus_reader" }, async (values) => { saved = values; });
  assert.equal(saved.cancel_at_period_end, false);
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

test("a competing billing request waits for the lock and executes exactly once", async () => {
  const db = database();
  let release;
  let started;
  const acquired = new Promise((resolve) => { started = resolve; });
  const held = withAccount(db, userId, async () => {
    started();
    await new Promise((resolve) => { release = resolve; });
  });
  await acquired;
  const rpc = db.rpc;
  let attempts = 0;
  let executions = 0;
  const contender = {
    ...db,
    rpc: async (...args) => { attempts++; return rpc(...args); },
  };
  const waiting = withAccount(contender, userId, async () => { executions++; return "done"; });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(executions, 0);
  release();
  await held;
  assert.equal(await waiting, "done");
  assert.ok(attempts >= 2);
  assert.equal(executions, 1);
});

test("non-contention database failures and work failures are never retried", async () => {
  let attempts = 0;
  let executions = 0;
  const error = { code: "42703", message: "Missing column" };
  await assert.rejects(withAccount({
    rpc: async () => { attempts++; return { error }; },
  }, userId, async () => { executions++; }), (actual) => actual === error);
  assert.equal(attempts, 1);
  assert.equal(executions, 0);
  await assert.rejects(withAccount(database(), userId, async () => {
    executions++;
    throw new Error("Stripe request failed");
  }), /Stripe request failed/);
  assert.equal(executions, 1);
});

test("exhausted lock contention remains retryable and is logged as a warning", () => {
  const originalWarn = console.warn;
  let logged;
  console.warn = (...args) => { logged = args; };
  try {
    const res = response();
    respondError(res, new BillingBusyError());
    assert.equal(res.code, 409);
    assert.equal(res.headers["Retry-After"], "2");
    assert.match(logged[0], /still busy after retrying/);
  } finally {
    console.warn = originalWarn;
  }
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
  const event = { id: "evt_paid", livemode: false, type: "invoice.paid", data: { object: { customer: "cus_reader" } } };
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
    id: "evt_unrelated", livemode: false, type: "charge.refunded", data: { object: { customer: null } },
  });
});

test("webhook handler accepts signed raw payloads and rejects tampering", async () => {
  const stripe = new Stripe("sk_test_placeholder");
  const secret = "whsec_placeholder";
  const payload = JSON.stringify({ id: "evt_ignored", livemode: false, type: "unhandled.event", data: { object: {} } });
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
  const payload = JSON.stringify({ id: "evt_failure", livemode: false, type: "invoice.paid", data: { object: { customer: "cus_reader" } } });
  const db = { rpc() { throw new Error("database unavailable"); } };
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

test("cancel endpoint targets the authenticated account and preserves complimentary access", async () => {
  const db = database();
  db.auth = { getUser: async () => ({ data: { user } }) };
  const sub = { ...subscription("active"), id: "sub_cancel_owned", cancel_at_period_end: false };
  const stripe = stripeMock([sub]);
  stripe.subscriptions.update = async (id, params) => {
    assert.equal(id, "sub_cancel_owned");
    assert.equal(params.cancel_at_period_end, true);
    sub.cancel_at_period_end = true;
  };
  const res = response();
  await createHandler(() => ({ db, stripe, config }))({
    method: "POST", headers: { origin: config.origin, authorization: "Bearer valid" },
    body: { action: "cancel", customer: "cus_attacker" },
  }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { canceled: true });
  assert.equal((await sql.query("select complimentary_book_lover, tier from profiles")).rows[0].complimentary_book_lover, true);
  assert.equal((await sql.query("select tier from profiles")).rows[0].tier, "book_lover");
  const rejected = response();
  await createHandler(() => ({ db, stripe, config }))({
    method: "POST", headers: { origin: "https://evil.example" }, body: { action: "cancel" },
  }, rejected);
  assert.equal(rejected.code, 403);
});

async function lifecycleFixture(id, customer, price = "price_month") {
  await sql.query("insert into auth.users(id, email) values ($1, $2)", [id, "billing-test@example.test"]);
  await sql.query("insert into profiles(id) values ($1)", [id]);
  await sql.query("insert into billing_accounts(user_id, customer_id) values ($1, $2)", [id, customer]);
  await sql.query("insert into books(user_id) values ($1)", [id]);
  await sql.query("insert into shelves(user_id) values ($1)", [id]);
  const db = database();
  db.auth = { getUser: async () => ({ data: { user: { id } } }) };
  const stripe = stripeMock();
  const signing = new Stripe("sk_test_placeholder");
  stripe.webhooks = signing.webhooks;
  const secret = "whsec_lifecycle_placeholder";
  const handler = createWebhookHandler(() => ({ db, stripe, config }), () => secret);
  let sequence = 0;
  return {
    db, stripe,
    tier: async () => (await sql.query("select tier from profiles where id = $1", [id])).rows[0].tier,
    async deliver(type, state, eventId = `evt_${customer}_${++sequence}`) {
      stripe.subscriptions = stripeMock([subscription(state, price)]).subscriptions;
      const payload = JSON.stringify({
        id: eventId, livemode: false, type, data: { object: { customer } },
      });
      const req = Readable.from([Buffer.from(payload)]);
      req.method = "POST";
      req.headers = { "stripe-signature": signing.webhooks.generateTestHeaderString({ payload, secret }) };
      const res = response();
      await handler(req, res);
      assert.equal(res.code, 200, JSON.stringify(res.body));
      return eventId;
    },
  };
}

for (const billing of ["monthly", "annual"]) {
  test(`${billing} authenticated checkout uses the exact price and does not grant access before payment confirmation`, async () => {
    const id = billing === "monthly" ? "22222222-2222-4222-8222-222222222222" : "33333333-3333-4333-8333-333333333333";
    const fixture = await lifecycleFixture(id, `cus_${billing}_test`, config.prices[billing]);
    let params;
    fixture.stripe.checkout.sessions.create = async (value) => {
      params = value;
      return { id: `cs_${billing}_test`, url: "https://checkout.stripe.com/test" };
    };
    const res = response();
    await createHandler(() => ({ db: fixture.db, stripe: fixture.stripe, config }))({
      method: "POST", headers: { origin: config.origin, authorization: "Bearer valid" },
      body: { action: "checkout", billing, price: "price_attacker", userId },
    }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(params.line_items, [{ price: config.prices[billing], quantity: 1 }]);
    assert.equal(params.client_reference_id, id);
    assert.equal(await fixture.tier(), "lite_reader");
    // Signed confirmation, not the browser redirect, enables Book Lover.
    await fixture.deliver("invoice.paid", "active");
    assert.equal(await fixture.tier(), "book_lover");
  });
}

test("signed failed-payment lifecycle denies initial access, retains access during retries, and downgrades after exhaustion without deleting library data", async () => {
  const id = "44444444-4444-4444-8444-444444444444";
  const fixture = await lifecycleFixture(id, "cus_failed_test");
  await fixture.deliver("invoice.payment_failed", "incomplete");
  assert.equal(await fixture.tier(), "lite_reader");
  await fixture.deliver("checkout.session.async_payment_failed", "incomplete_expired");
  assert.equal(await fixture.tier(), "lite_reader");
  await fixture.deliver("checkout.session.async_payment_succeeded", "active");
  assert.equal(await fixture.tier(), "book_lover");
  await fixture.deliver("invoice.payment_failed", "past_due");
  assert.equal(await fixture.tier(), "book_lover");
  await fixture.deliver("customer.subscription.updated", "unpaid");
  assert.equal(await fixture.tier(), "lite_reader");
  await fixture.deliver("invoice.paid", "active");
  assert.equal(await fixture.tier(), "book_lover");
  await fixture.deliver("customer.subscription.deleted", "canceled");
  assert.equal(await fixture.tier(), "lite_reader");
  for (const table of ["books", "shelves"]) {
    assert.equal(Number((await sql.query(`select count(*) as count from ${table} where user_id = $1`, [id])).rows[0].count), 1);
  }
});

test("signed period-end cancellation keeps access until ended and never changes another user's tier", async () => {
  const id = "55555555-5555-4555-8555-555555555555";
  const fixture = await lifecycleFixture(id, "cus_end_test");
  const otherTier = (await sql.query("select tier from profiles where id = $1", [userId])).rows[0].tier;
  await fixture.deliver("customer.subscription.updated", "active");
  assert.equal(await fixture.tier(), "book_lover");
  const record = (await sql.query("select cancel_at_period_end from billing_accounts where user_id = $1", [id])).rows[0];
  assert.equal(record.cancel_at_period_end, true);
  const eventId = await fixture.deliver("customer.subscription.deleted", "canceled");
  assert.equal(await fixture.tier(), "lite_reader");
  await fixture.deliver("customer.subscription.deleted", "canceled", eventId);
  assert.equal(Number((await sql.query("select count(*) as count from billing_events where event_id = $1", [eventId])).rows[0].count), 1);
  assert.equal((await sql.query("select tier from profiles where id = $1", [userId])).rows[0].tier, otherTier);
});

test("signed webhooks reject cross-mode and missing-mode events before touching billing data", async () => {
  const stripe = new Stripe("sk_test_placeholder");
  const secret = "whsec_mode_placeholder";
  const handler = createWebhookHandler(() => ({
    stripe, config,
    db: { rpc() { assert.fail("Mismatched events must not touch the database"); } },
  }), () => secret);
  for (const livemode of [true, undefined]) {
    const payload = JSON.stringify({ id: "evt_wrong_mode", livemode, type: "invoice.paid", data: { object: { customer: "cus_reader" } } });
    const req = Readable.from([Buffer.from(payload)]);
    req.method = "POST";
    req.headers = { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret }) };
    const res = response();
    await handler(req, res);
    assert.equal(res.code, 400);
    assert.match(res.body.error, /mode/);
  }
});

test("switching to live preserves sandbox history and grants, isolates checkout and events, and rejects stale deployments", async () => {
  const id = "66666666-6666-4666-8666-666666666666";
  const fixture = await lifecycleFixture(id, "cus_mode_sandbox");
  await fixture.deliver("invoice.paid", "active", "evt_shared_mode");
  assert.equal(await fixture.tier(), "book_lover");
  const count = Number((await sql.query("select count(*) as count from billing_accounts")).rows[0].count);

  await sql.exec("set role authenticated");
  try {
    await assert.rejects(sql.exec("select * from billing_environment"), /permission denied/);
    await assert.rejects(sql.exec("update billing_environment set livemode = true"), /permission denied/);
    await assert.rejects(sql.exec("select billing_assert_mode(true)"), /permission denied/);
  } finally {
    await sql.exec("reset role");
  }
  await withAccount(fixture.db, id, async () => {
    await assert.rejects(sql.exec("update billing_environment set livemode = true"), /requests are in progress/);
  });
  await sql.exec("update billing_environment set livemode = true");
  try {
    assert.equal(await fixture.tier(), "lite_reader");
    assert.equal((await sql.query("select tier from profiles where id = $1", [userId])).rows[0].tier, "book_lover");
    assert.equal(Number((await sql.query("select count(*) as count from billing_accounts")).rows[0].count), count);
    assert.equal((await sql.query("select has_access from billing_accounts where user_id = $1 and not livemode", [id])).rows[0].has_access, true);
    await assert.rejects(withAccount(fixture.db, id, async () => assert.fail("Sandbox work must be blocked")), /does not match/);
    await assert.rejects(sql.query("update billing_accounts set has_access = false where user_id = $1 and not livemode", [id]), /does not match/);
    await assert.rejects(processWebhook({ db: fixture.db, stripe: fixture.stripe, config }, {
      id: "evt_stale_sandbox", livemode: false, type: "invoice.paid", data: { object: { customer: "cus_mode_sandbox" } },
    }), /does not match/);
    const staleStatus = response();
    await createHandler(() => ({ db: fixture.db, stripe: fixture.stripe, config }))({
      method: "GET", headers: { authorization: "Bearer valid" },
    }, staleStatus);
    assert.equal(staleStatus.code, 500);

    const liveConfig = { ...config, livemode: true };
    const stripe = stripeMock();
    let creates = 0;
    stripe.customers.create = async (params, options) => {
      creates++;
      assert.equal(params.metadata.librito_user_id, id);
      assert.equal(options.idempotencyKey, `librito-customer-live-${id}`);
      return { id: "cus_mode_live" };
    };
    stripe.checkout.sessions.create = async (params, options) => {
      assert.equal(params.customer, "cus_mode_live");
      assert.equal(options.idempotencyKey, `librito-checkout-live-${id}-first-monthly`);
      return { id: "cs_mode_live", url: "https://checkout.stripe.com/live" };
    };
    const deps = { db: fixture.db, stripe, config: liveConfig };
    const handler = createHandler(() => deps);
    const status = response();
    await handler({ method: "GET", headers: { authorization: "Bearer valid" } }, status);
    assert.equal(status.code, 200);
    assert.equal(status.body.canManage, false);
    const req = { method: "POST", headers: { origin: config.origin, authorization: "Bearer valid" },
      body: { action: "checkout", billing: "monthly" } };
    const wrongPrice = response();
    await handler(req, wrongPrice);
    assert.equal(wrongPrice.code, 503);
    const retrieve = stripe.prices.retrieve;
    stripe.prices.retrieve = async (price) => ({ ...await retrieve(price), livemode: true });
    const checkout = response();
    await handler(req, checkout);
    assert.equal(checkout.code, 200);
    assert.equal(creates, 1);
    assert.equal(await fixture.tier(), "lite_reader");
    assert.equal(Number((await sql.query("select count(*) as count from billing_accounts where user_id = $1", [id])).rows[0].count), 2);

    stripe.subscriptions = stripeMock([subscription("active")]).subscriptions;
    await processWebhook(deps, {
      id: "evt_unowned_live", livemode: true, type: "invoice.paid", data: { object: { customer: "cus_mode_sandbox" } },
    });
    assert.equal(await fixture.tier(), "lite_reader");
    const event = { id: "evt_shared_mode", livemode: true, type: "invoice.paid", data: { object: { customer: "cus_mode_live" } } };
    await processWebhook(deps, event);
    assert.equal(await fixture.tier(), "book_lover");
    assert.equal(Number((await sql.query("select count(*) as count from billing_events where event_id = 'evt_shared_mode'")).rows[0].count), 2);
    stripe.subscriptions = stripeMock().subscriptions;
    await processWebhook(deps, event);
    assert.equal(await fixture.tier(), "book_lover");
    await processWebhook(deps, { ...event, id: "evt_mode_live_ended", type: "customer.subscription.deleted" });
    assert.equal(await fixture.tier(), "lite_reader");
    for (const table of ["books", "shelves"]) {
      assert.equal(Number((await sql.query(`select count(*) as count from ${table} where user_id = $1`, [id])).rows[0].count), 1);
    }
  } finally {
    await sql.exec("update billing_environment set livemode = false");
  }
  assert.equal(await fixture.tier(), "book_lover");
});
