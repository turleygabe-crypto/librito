import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { MEMBERSHIP_PRICING } from "../membership-pricing.js";

export class BillingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class BillingBusyError extends BillingError {
  constructor() {
    super(409, "Billing is busy. Please try again.");
  }
}

function required(env, name) {
  if (!env[name]) throw new BillingError(503, "Billing is not configured yet.");
  return env[name];
}

function priceId(env, primary, legacy) {
  const configured = env[primary] || env[legacy];
  if (!configured) throw new BillingError(503, "Billing is not configured yet.");
  return configured;
}

export function billingConfig(env = process.env) {
  const key = required(env, "STRIPE_SECRET_KEY");
  const keyMode = /^(?:sk|rk)_(test|live)_/.exec(key)?.[1];
  if (!keyMode || !["test", "live"].includes(env.STRIPE_MODE) || keyMode !== env.STRIPE_MODE) {
    throw new BillingError(503, "Stripe key and billing mode must match.");
  }
  const appUrl = required(env, "APP_URL");
  if (!URL.canParse(appUrl)) throw new BillingError(503, "Billing requires a valid application URL.");
  const origin = new URL(appUrl);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) {
    throw new BillingError(503, "Billing requires a secure application URL.");
  }
  const planPrices = {
    book_lover: {
      monthly: priceId(env, "STRIPE_PRICE_BOOK_LOVER_MONTHLY", "STRIPE_PRICE_MONTHLY"),
      annual: priceId(env, "STRIPE_PRICE_BOOK_LOVER_ANNUAL", "STRIPE_PRICE_ANNUAL"),
    },
    bookshop_pro: {
      monthly: env.STRIPE_PRICE_BOOKSHOP_PRO_MONTHLY || null,
      annual: env.STRIPE_PRICE_BOOKSHOP_PRO_ANNUAL || null,
    },
  };
  const prices = {
    ...planPrices.book_lover,
    ...planPrices,
  };
  return {
    livemode: keyMode === "live",
    origin: origin.origin,
    membershipPlansAvailable: env.MEMBERSHIP_PLANS_AVAILABLE === "true",
    planPrices,
    prices,
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

export async function authenticate(req, db, signInMessage = "Sign in to manage billing.") {
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || "");
  if (!match) throw new BillingError(401, signInMessage);
  const { data, error } = await db.auth.getUser(match[1]);
  if (error || !data?.user) throw new BillingError(401, "Your session expired. Sign in again.");
  return data.user;
}

export async function withAccount(db, userId, work, livemode = false, allowDeletion = false) {
  const owner = randomUUID();
  let result;
  const retryDelays = [250, 500, 1000, 2000];
  for (let attempt = 0; ; attempt++) {
    result = await db.rpc("billing_lock", {
      target_user: userId, owner, target_livemode: livemode,
      ...(allowDeletion ? { allow_deletion: true } : {}),
    });
    if (result.error?.code === "55000") {
      throw new BillingError(409, "Account deletion is in progress. Retry Delete account, or contact support@librito.casa.");
    }
    if (result.error?.code !== "55P03") break;
    if (attempt === retryDelays.length) throw new BillingBusyError();
    await delay(retryDelays[attempt]);
  }
  const account = checked(result);
  try {
    const save = async (values) => {
      const updated = checked(await db.from("billing_accounts").update(values)
        .eq("user_id", userId).eq("livemode", livemode).eq("lock_owner", owner).gt("locked_until", new Date().toISOString())
        .select("*").single());
      Object.assign(account, updated);
    };
    return await work(account, save);
  } finally {
    checked(await db.from("billing_accounts").update({ lock_owner: null, locked_until: null })
      .eq("user_id", userId).eq("livemode", livemode).eq("lock_owner", owner));
  }
}

export async function subscriptionSnapshot(stripe, customer, config) {
  const pricePlans = config.planPrices || {
    book_lover: { monthly: config.prices.monthly, annual: config.prices.annual },
  };
  const planByPrice = new Map(Object.entries(pricePlans)
    .flatMap(([plan, prices]) => Object.values(prices).filter(Boolean).map((price) => [price, plan])));
  const subscriptions = [];
  for await (const subscription of stripe.subscriptions.list({ customer, status: "all", limit: 100 })) {
    const matchingItems = subscription.items.data.filter((item) => planByPrice.has(item.price.id));
    if (!matchingItems.length) continue;
    const live = !["canceled", "incomplete_expired"].includes(subscription.status);
    const entitled = ["active", "trialing", "past_due"].includes(subscription.status);
    const plan = matchingItems.map((item) => planByPrice.get(item.price.id))
      .sort((first, second) => (second === "bookshop_pro" ? 1 : 0) - (first === "bookshop_pro" ? 1 : 0))[0];
    subscriptions.push({ subscription, matchingItems, live, entitled, plan });
  }
  subscriptions.sort((first, second) => Number(second.entitled) - Number(first.entitled)
    || Number(second.live) - Number(first.live)
    || Number(second.plan === "bookshop_pro") - Number(first.plan === "bookshop_pro"));
  const selected = subscriptions[0];
  const periodEnd = Math.min(...(selected?.matchingItems || []).map((item) => item.current_period_end || 0),
    selected?.subscription.cancel_at || Infinity);
  return {
    has_access: subscriptions.some((item) => item.entitled),
    has_subscription: subscriptions.some((item) => item.live),
    subscription_plan: selected?.entitled ? selected.plan : null,
    subscription_status: selected?.subscription.status || null,
    cancel_at_period_end: Boolean(selected?.subscription.cancel_at_period_end || selected?.subscription.cancel_at),
    period_end: Number.isFinite(periodEnd) && periodEnd > 0 ? new Date(periodEnd * 1000).toISOString() : null,
  };
}

function configuredPrice(config, plan, billing) {
  const price = (config.planPrices || {})[plan]?.[billing];
  if (price) return price;
  if (plan === "book_lover" && billing === "monthly") return config.prices.monthly;
  if (plan === "book_lover" && billing === "annual") return config.prices.annual;
  return null;
}

async function renewableSubscriptions({ stripe, config }, account) {
  if (!account.customer_id) throw new BillingError(409, "There is no paid subscription to manage.");
  const configuredPrices = Object.values(config.planPrices || {
    book_lover: { monthly: config.prices.monthly, annual: config.prices.annual },
  }).flatMap((prices) => Object.values(prices).filter(Boolean));
  const candidates = [];
  for await (const subscription of stripe.subscriptions.list({ customer: account.customer_id, status: "all", limit: 100 })) {
    if (["active", "trialing", "past_due"].includes(subscription.status)
      && subscription.items.data.some((item) => configuredPrices.includes(item.price.id))) {
      candidates.push(subscription);
    }
  }
  return candidates;
}

export async function resumeRenewal({ stripe, config }, account, save) {
  const candidates = (await renewableSubscriptions({ stripe, config }, account))
    .filter((subscription) => subscription.cancel_at_period_end || subscription.cancel_at);
  if (candidates.length !== 1) throw new BillingError(409, "Your subscription changed. Wait for billing status to update, then try again.");
  const subscription = candidates[0];
  const params = subscription.cancel_at_period_end ? { cancel_at_period_end: false } : { cancel_at: "" };
  await stripe.subscriptions.update(subscription.id, params);
  await save(await subscriptionSnapshot(stripe, account.customer_id, config));
}

export async function cancelRenewal({ stripe, config }, account, save) {
  const candidates = await renewableSubscriptions({ stripe, config }, account);
  if (candidates.length !== 1) throw new BillingError(409, "Your subscription changed. Wait for billing status to update, then try again.");
  const subscription = candidates[0];
  if (!subscription.cancel_at_period_end && !subscription.cancel_at) {
    await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
  }
  await save(await subscriptionSnapshot(stripe, account.customer_id, config));
}

export async function startCheckout({ stripe, config }, user, account, save, billing, plan = "book_lover") {
  if (!["book_lover", "bookshop_pro"].includes(plan)) throw new BillingError(400, "Choose a paid plan.");
  if (!["monthly", "annual"].includes(billing)) throw new BillingError(400, "Choose monthly or annual billing.");
  const selectedPrice = configuredPrice(config, plan, billing);
  if (!selectedPrice) throw new BillingError(503, "This plan's Stripe Price is not configured.");
  if (!account.customer_id) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { librito_user_id: user.id },
    }, { idempotencyKey: `librito-customer-${config.livemode ? "live" : "test"}-${user.id}` });
    await save({ customer_id: customer.id });
  }
  const snapshot = await subscriptionSnapshot(stripe, account.customer_id, config);
  await save(snapshot);
  if (snapshot.has_subscription) throw new BillingError(409, "You already have a subscription. Use Manage billing.");
  if (account.checkout_session_id) {
    const previous = await stripe.checkout.sessions.retrieve(account.checkout_session_id);
    if (previous.status === "open") {
      if (previous.metadata?.billing === billing && previous.metadata?.plan === plan) return previous.url;
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
  const price = await stripe.prices.retrieve(selectedPrice);
  const interval = billing === "monthly" ? "month" : "year";
  const expectedAmount = MEMBERSHIP_PRICING[plan][billing === "monthly" ? "monthlyCents" : "annualCents"];
  if (price.livemode !== config.livemode || !price.active || price.currency !== "usd"
    || price.recurring?.interval !== interval || price.recurring?.interval_count !== 1
    || !Number.isInteger(price.unit_amount) || price.unit_amount <= 0
    || price.unit_amount !== expectedAmount) {
    throw new BillingError(503, "The configured Stripe Price is not an active USD recurring price for this billing interval.");
  }
  const idempotencyKey = `librito-checkout-${config.livemode ? "live" : "test"}-${user.id}-${account.checkout_session_id || "first"}-${plan}-${billing}`;
  const suffix = Array.from(createHash("sha256").update(idempotencyKey).digest().subarray(0, 8),
    (byte) => String.fromCharCode(97 + byte % 26)).join("");
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: account.customer_id,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { billing, plan },
    subscription_data: { metadata: { librito_user_id: user.id, librito_plan: plan } },
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
  if (event.livemode !== config.livemode) throw new BillingError(400, "Stripe webhook mode does not match billing mode.");
  checked(await db.rpc("billing_assert_mode", { target_livemode: config.livemode }));
  if (!WEBHOOK_EVENTS.has(event.type)) return;
  const customer = await eventCustomer(stripe, event);
  if (!customer) {
    if (["charge.dispute.created", "charge.refunded", "radar.early_fraud_warning.created"].includes(event.type)) {
      console.info("Ignoring Stripe payment event without a customer", { eventId: event.id, type: event.type });
      return;
    }
    throw new Error("Stripe event is missing its customer.");
  }
  const account = checked(await db.from("billing_accounts").select("user_id")
    .eq("customer_id", customer).eq("livemode", config.livemode).maybeSingle());
  // Other Stripe products in the same account do not belong to Librito.
  if (!account) return;
  await withAccount(db, account.user_id, async (current, save) => {
    const seen = checked(await db.from("billing_events").select("event_id")
      .eq("event_id", event.id).eq("livemode", config.livemode).maybeSingle());
    if (seen) return;
    await save(await subscriptionSnapshot(stripe, customer, config));
    const riskEvent = ["charge.dispute.created", "charge.refunded", "radar.early_fraud_warning.created"].includes(event.type);
    checked(await db.from("billing_events").insert({
      event_id: event.id, user_id: account.user_id, event_type: event.type, livemode: config.livemode,
      requires_review: riskEvent,
    }));
    if (riskEvent) console.warn("Billing event requires review", { eventId: event.id, type: event.type });
  }, config.livemode);
}

export function respondError(res, error, fallback = "Billing could not be completed. Please try again.") {
  const message = typeof error.message === "string"
    ? error.message.replace(/\b(?:[srp]k_(?:test|live)_|whsec_|sb_secret_)[A-Za-z0-9_-]+/g, "[redacted]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500)
    : undefined;
  const log = error instanceof BillingBusyError ? console.warn : console.error;
  log(error instanceof BillingBusyError ? "Billing account still busy after retrying" : "Billing request failed", {
    name: error.name, code: error.code, status: error.status, message, requestId: error.requestId,
  });
  if (error instanceof BillingBusyError) res.setHeader("Retry-After", "2");
  return res.status(error instanceof BillingError ? error.status : 500)
    .json({ error: error instanceof BillingError ? error.message : fallback });
}
