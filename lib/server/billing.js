import { randomUUID, createHash } from "node:crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export class BillingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function required(env, name) {
  if (!env[name]) throw new BillingError(503, "Billing is not configured yet.");
  return env[name];
}

export function billingConfig(env = process.env) {
  const appUrl = required(env, "APP_URL");
  if (!URL.canParse(appUrl)) throw new BillingError(503, "Billing requires a valid application URL.");
  const origin = new URL(appUrl);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) {
    throw new BillingError(503, "Billing requires a secure application URL.");
  }
  return {
    origin: origin.origin,
    prices: {
      monthly: required(env, "STRIPE_PRICE_MONTHLY"),
      annual: required(env, "STRIPE_PRICE_ANNUAL"),
    },
  };
}

export function billingDependencies(env = process.env) {
  return {
    config: billingConfig(env),
    stripe: new Stripe(required(env, "STRIPE_SECRET_KEY"), { timeout: 15000, maxNetworkRetries: 1 }),
    db: createClient(required(env, "SUPABASE_URL"), required(env, "SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function authenticate(req, db) {
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || "");
  if (!match) throw new BillingError(401, "Sign in to manage billing.");
  const { data, error } = await db.auth.getUser(match[1]);
  if (error || !data?.user) throw new BillingError(401, "Your session expired. Sign in again.");
  return data.user;
}

export async function withAccount(db, userId, work) {
  const owner = randomUUID();
  const result = await db.rpc("billing_lock", { target_user: userId, owner });
  if (result.error?.code === "55P03") throw new BillingError(409, "Billing is busy. Please try again.");
  const account = checked(result);
  try {
    const save = async (values) => {
      const updated = checked(await db.from("billing_accounts").update(values)
        .eq("user_id", userId).eq("lock_owner", owner).gt("locked_until", new Date().toISOString())
        .select("*").single());
      Object.assign(account, updated);
    };
    return await work(account, save);
  } finally {
    checked(await db.from("billing_accounts").update({ lock_owner: null, locked_until: null })
      .eq("user_id", userId).eq("lock_owner", owner));
  }
}

export async function subscriptionSnapshot(stripe, customer, config) {
  let hasAccess = false;
  let hasSubscription = false;
  let selected = null;
  for await (const subscription of stripe.subscriptions.list({ customer, status: "all", limit: 100 })) {
    const matches = subscription.items.data.some((item) => Object.values(config.prices).includes(item.price.id));
    if (!matches) continue;
    const live = !["canceled", "incomplete_expired"].includes(subscription.status);
    const entitled = ["active", "trialing", "past_due"].includes(subscription.status);
    hasSubscription ||= live;
    hasAccess ||= entitled;
    if (!selected || entitled || (live && !hasAccess)) selected = subscription;
  }
  const matchingItems = selected?.items.data.filter((item) => Object.values(config.prices).includes(item.price.id)) || [];
  const periodEnd = Math.min(...matchingItems.map((item) => item.current_period_end || 0),
    selected?.cancel_at || Infinity);
  return {
    has_access: hasAccess,
    has_subscription: hasSubscription,
    subscription_status: selected?.status || null,
    cancel_at_period_end: Boolean(selected?.cancel_at_period_end || selected?.cancel_at),
    period_end: Number.isFinite(periodEnd) && periodEnd > 0 ? new Date(periodEnd * 1000).toISOString() : null,
  };
}

export async function resumeRenewal({ stripe, config }, account, save) {
  if (!account.customer_id) throw new BillingError(409, "There is no subscription to resume.");
  const candidates = [];
  for await (const subscription of stripe.subscriptions.list({ customer: account.customer_id, status: "all", limit: 100 })) {
    if (["active", "trialing", "past_due"].includes(subscription.status)
      && (subscription.cancel_at_period_end || subscription.cancel_at)
      && subscription.items.data.some((item) => Object.values(config.prices).includes(item.price.id))) {
      candidates.push(subscription);
    }
  }
  if (candidates.length !== 1) throw new BillingError(409, "Your subscription changed. Refresh billing status and try again.");
  const subscription = candidates[0];
  const params = subscription.cancel_at_period_end ? { cancel_at_period_end: false } : { cancel_at: "" };
  await stripe.subscriptions.update(subscription.id, params);
  await save(await subscriptionSnapshot(stripe, account.customer_id, config));
}

export async function startCheckout({ stripe, config }, user, account, save, billing) {
  if (!Object.hasOwn(config.prices, billing)) throw new BillingError(400, "Choose monthly or annual billing.");
  if (!account.customer_id) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { librito_user_id: user.id },
    }, { idempotencyKey: `librito-customer-${user.id}` });
    await save({ customer_id: customer.id });
  }
  const snapshot = await subscriptionSnapshot(stripe, account.customer_id, config);
  await save(snapshot);
  if (snapshot.has_subscription) throw new BillingError(409, "You already have a subscription. Use Manage billing.");
  if (account.checkout_session_id) {
    const previous = await stripe.checkout.sessions.retrieve(account.checkout_session_id);
    if (previous.status === "open") {
      if (previous.metadata?.billing === billing) return previous.url;
      await stripe.checkout.sessions.expire(previous.id);
    } else if (previous.status === "complete") {
      if (previous.payment_status === "unpaid" && previous.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          typeof previous.subscription === "string" ? previous.subscription : previous.subscription.id,
        );
        if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
          throw new BillingError(409, "Your payment is processing. Please try again later.");
        }
      }
    }
  }
  const price = await stripe.prices.retrieve(config.prices[billing]);
  const interval = billing === "monthly" ? "month" : "year";
  if (!price.active || price.currency !== "usd" || price.unit_amount !== (billing === "monthly" ? 299 : 2499)
    || price.recurring?.interval !== interval || price.recurring?.interval_count !== 1) {
    throw new BillingError(503, "The billing price configuration does not match this plan.");
  }
  const idempotencyKey = `librito-checkout-${user.id}-${account.checkout_session_id || "first"}-${billing}`;
  const suffix = Array.from(createHash("sha256").update(idempotencyKey).digest().subarray(0, 8),
    (byte) => String.fromCharCode(97 + byte % 26)).join("");
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: account.customer_id,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { billing },
    subscription_data: { metadata: { librito_user_id: user.id } },
    success_url: `${config.origin}/#/upgrade?checkout=success`,
    cancel_url: `${config.origin}/#/upgrade?checkout=canceled`,
    integration_identifier: `librito_checkout_${suffix}`,
  }, { idempotencyKey });
  await save({ checkout_session_id: session.id });
  return session.url;
}

export const WEBHOOK_EVENTS = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "invoice.paid", "invoice.payment_failed",
  "charge.dispute.created", "charge.refunded", "radar.early_fraud_warning.created",
]);

export async function eventCustomer(stripe, event) {
  const object = event.data.object;
  if (event.type === "charge.dispute.created" || event.type === "radar.early_fraud_warning.created") {
    const charge = typeof object.charge === "string" ? await stripe.charges.retrieve(object.charge) : object.charge;
    return typeof charge?.customer === "string" ? charge.customer : charge?.customer?.id;
  }
  return typeof object.customer === "string" ? object.customer : object.customer?.id;
}

export async function processWebhook({ db, stripe, config }, event) {
  if (!WEBHOOK_EVENTS.has(event.type)) return;
  const customer = await eventCustomer(stripe, event);
  if (!customer) {
    if (["charge.dispute.created", "charge.refunded", "radar.early_fraud_warning.created"].includes(event.type)) {
      console.info("Ignoring Stripe payment event without a customer", { eventId: event.id, type: event.type });
      return;
    }
    throw new Error("Stripe event is missing its customer.");
  }
  const account = checked(await db.from("billing_accounts").select("user_id").eq("customer_id", customer).maybeSingle());
  // Other Stripe products in the same account do not belong to Librito.
  if (!account) return;
  await withAccount(db, account.user_id, async (current, save) => {
    const seen = checked(await db.from("billing_events").select("event_id").eq("event_id", event.id).maybeSingle());
    if (seen) return;
    await save(await subscriptionSnapshot(stripe, customer, config));
    const riskEvent = ["charge.dispute.created", "charge.refunded", "radar.early_fraud_warning.created"].includes(event.type);
    checked(await db.from("billing_events").insert({
      event_id: event.id, user_id: account.user_id, event_type: event.type,
      requires_review: riskEvent,
    }));
    if (riskEvent) console.warn("Billing event requires review", { eventId: event.id, type: event.type });
  });
}

export function respondError(res, error) {
  const message = typeof error.message === "string"
    ? error.message.replace(/\b(?:[srp]k_(?:test|live)_|whsec_|sb_secret_)[A-Za-z0-9_-]+/g, "[redacted]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500)
    : undefined;
  console.error("Billing request failed", {
    name: error.name, code: error.code, status: error.status, message, requestId: error.requestId,
  });
  return res.status(error instanceof BillingError ? error.status : 500)
    .json({ error: error instanceof BillingError ? error.message : "Billing could not be completed. Please try again." });
}
