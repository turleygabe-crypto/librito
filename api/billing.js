import {
  authenticate, billingDependencies, BillingError, checked, respondError, resumeRenewal, startCheckout, subscriptionSnapshot, withAccount,
} from "../lib/server/billing.js";

export function createHandler(dependencies = billingDependencies) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "POST"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      const deps = dependencies();
      const { db, stripe, config } = deps;
      if (req.method === "POST" && req.headers.origin !== config.origin) {
        throw new BillingError(403, "Billing must be opened from Librito.");
      }
      const user = await authenticate(req, db);
      if (req.method === "GET") {
        let account = checked(await db.from("billing_accounts")
          .select("customer_id, has_subscription, subscription_status, cancel_at_period_end, period_end")
          .eq("user_id", user.id).maybeSingle());
        if (account?.customer_id) {
          account = await withAccount(db, user.id, async (current, save) => {
            await save(await subscriptionSnapshot(stripe, current.customer_id, config));
            return current;
          });
        }
        return res.status(200).json({
          canManage: Boolean(account?.customer_id),
          hasSubscription: account?.has_subscription || false,
          status: account?.subscription_status || null,
          cancelAtPeriodEnd: account?.cancel_at_period_end || false,
          periodEnd: account?.period_end || null,
        });
      }
      const { action, billing } = req.body || {};
      if (!["checkout", "portal", "resume"].includes(action)) throw new BillingError(400, "Invalid billing action.");
      if (action === "checkout") {
        const profile = checked(await db.from("profiles").select("complimentary_book_lover").eq("id", user.id).single());
        if (profile.complimentary_book_lover) throw new BillingError(409, "You already have complimentary Book Lover access.");
        if (!["monthly", "annual"].includes(billing)) throw new BillingError(400, "Choose monthly or annual billing.");
      }
      const url = await withAccount(db, user.id, async (account, save) => {
        if (action === "checkout") return startCheckout(deps, user, account, save, billing);
        if (action === "resume") {
          await resumeRenewal(deps, account, save);
          return null;
        }
        if (!account.customer_id) throw new BillingError(409, "There is no billing account to manage yet.");
        const session = await stripe.billingPortal.sessions.create({
          customer: account.customer_id, return_url: `${config.origin}/#/upgrade`,
        });
        return session.url;
      });
      return res.status(200).json(action === "resume" ? { resumed: true } : { url });
    } catch (error) {
      return respondError(res, error);
    }
  };
}

export default createHandler();
