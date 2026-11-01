import {
  authenticate, billingDependencies, BillingError, cancelRenewal, checked, respondError, resumeRenewal, startCheckout, subscriptionSnapshot, withAccount,
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
      checked(await db.rpc("billing_assert_mode", { target_livemode: config.livemode }));
      if (req.method === "GET") {
        let account = checked(await db.from("billing_accounts")
          .select("customer_id, has_access, has_subscription, subscription_plan, subscription_status, cancel_at_period_end, period_end, deletion_pending")
          .eq("user_id", user.id).eq("livemode", config.livemode).maybeSingle());
        if (account?.deletion_pending) {
          throw new BillingError(409, "Account deletion is in progress. Retry Delete account, or contact support@librito.casa.");
        }
        if (account?.customer_id) {
          account = await withAccount(db, user.id, async (current, save) => {
            await save(await subscriptionSnapshot(stripe, current.customer_id, config));
            return current;
          }, config.livemode);
        }
        return res.status(200).json({
          canManage: Boolean(account?.customer_id),
          hasSubscription: account?.has_subscription || false,
          plan: account?.subscription_plan || "free",
          status: account?.subscription_status || null,
          cancelAtPeriodEnd: account?.cancel_at_period_end || false,
          periodEnd: account?.period_end || null,
          membershipPlansAvailable: config.membershipPlansAvailable === true,
        });
      }
      const { action } = req.body || {};
      if (!["checkout", "portal", "resume", "cancel"].includes(action)) throw new BillingError(400, "Invalid billing action.");
      if (action === "checkout" && config.membershipPlansAvailable !== true) {
        throw new BillingError(503, "Paid memberships are coming soon.");
      }
      const url = await withAccount(db, user.id, async (account, save) => {
        if (action === "checkout") {
          return startCheckout(deps, user, account, save, req.body.billing, req.body.plan || "book_lover");
        }
        if (action === "resume") {
          await resumeRenewal(deps, account, save);
          return null;
        }
        if (action === "cancel") {
          await cancelRenewal(deps, account, save);
          return null;
        }
        if (!account.customer_id) throw new BillingError(409, "There is no billing account to manage yet.");
        const session = await stripe.billingPortal.sessions.create({
          customer: account.customer_id, return_url: `${config.origin}/#/upgrade`,
        });
        return session.url;
      }, config.livemode);
      return res.status(200).json(action === "resume" ? { resumed: true }
        : action === "cancel" ? { canceled: true } : { url });
    } catch (error) {
      return respondError(res, error);
    }
  };
}

export default createHandler();
