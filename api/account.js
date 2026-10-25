import {
  authenticate, billingDependencies, BillingError, checked, respondError, withAccount,
} from "../lib/server/billing.js";

async function stopAccountBilling(stripe, account, save) {
  if (!account.customer_id) return;
  const customer = await stripe.customers.retrieve(account.customer_id);
  if (customer.deleted) return;
  for await (const session of stripe.checkout.sessions.list({
    customer: account.customer_id, status: "open", limit: 100,
  })) {
    await stripe.checkout.sessions.expire(session.id);
    await save({ deletion_pending: true });
  }
  for await (const subscription of stripe.subscriptions.list({
    customer: account.customer_id, status: "all", limit: 100,
  })) {
    if (["canceled", "incomplete_expired"].includes(subscription.status)) continue;
    await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false });
    await save({ deletion_pending: true });
  }
  // Deleting the dedicated Customer prevents old portal sessions from creating new subscriptions.
  const deleted = await stripe.customers.del(account.customer_id);
  if (!deleted.deleted) throw new Error("Stripe did not confirm customer deletion.");
  await save({ has_access: false, has_subscription: false, subscription_status: "canceled", period_end: null });
}

export function createAccountHandler(dependencies = billingDependencies) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      const { db, stripe, config } = dependencies();
      if (req.headers.origin !== config.origin) {
        throw new BillingError(403, "Account deletion must be opened from Librito.");
      }
      const user = await authenticate(req, db);
      if (req.body?.confirmation !== "DELETE") {
        throw new BillingError(400, "Type DELETE to confirm permanent account deletion.");
      }
      await withAccount(db, user.id, async (account, save) => {
        if (!config.livemode) {
          const liveAccount = checked(await db.from("billing_accounts").select("customer_id")
            .eq("user_id", user.id).eq("livemode", true).maybeSingle());
          if (liveAccount?.customer_id) {
            throw new BillingError(409, "This account has live billing records. Delete it from the live deployment, or contact support@librito.casa.");
          }
        }
        await save({ deletion_pending: true });
        await stopAccountBilling(stripe, account, save);
        // Recheck the lease after external calls before the irreversible Auth deletion.
        await save({ deletion_pending: true });
        const removed = checked(await db.auth.admin.deleteUser(user.id, false));
        if (removed?.user?.id !== user.id) throw new Error("Supabase did not confirm account deletion.");
      }, config.livemode, true);
      return res.status(200).json({ deleted: true });
    } catch (error) {
      return respondError(res, error,
        "We couldn't confirm account deletion. Billing may already have stopped. Check whether you can still sign in, then retry deletion or contact support@librito.casa.");
    }
  };
}

export default createAccountHandler();
