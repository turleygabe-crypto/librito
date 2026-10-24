import { billingDependencies, processWebhook, respondError } from "../lib/server/billing.js";

export const config = { api: { bodyParser: false } };

export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error("Webhook payload is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function createWebhookHandler(dependencies = billingDependencies, secret = () => process.env.STRIPE_WEBHOOK_SECRET) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      const deps = dependencies();
      if (!secret()) return res.status(503).json({ error: "Billing webhook is not configured yet." });
      let event;
      try {
        event = deps.stripe.webhooks.constructEvent(await readBody(req), req.headers["stripe-signature"], secret());
      } catch (error) {
        console.error("Stripe webhook rejected", { name: error.name });
        return res.status(400).json({ error: "Invalid webhook signature or payload." });
      }
      await processWebhook(deps, event);
      return res.status(200).json({ received: true });
    } catch (error) {
      return respondError(res, error);
    }
  };
}

export default createWebhookHandler();
