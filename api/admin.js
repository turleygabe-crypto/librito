import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { authenticate, BillingError, checked, respondError } from "../lib/server/billing.js";

export function adminDependencies(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !URL.canParse(env.APP_URL)) {
    throw new BillingError(503, "Admin account creation is not configured yet.");
  }
  const url = new URL(env.APP_URL);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new BillingError(503, "Admin account creation requires a secure application URL.");
  }
  return {
    origin: url.origin,
    db: createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export function createAdminHandler(dependencies = adminDependencies) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      const { db, origin } = dependencies();
      if (req.headers.origin !== origin) {
        throw new BillingError(403, "Test accounts must be created from Librito.");
      }
      const user = await authenticate(req, db, "Sign in to manage test accounts.");
      const admin = checked(await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle());
      if (!admin) throw new BillingError(403, "Only admins can create test accounts.");
      const { name, password, plan } = req.body || {};
      if (typeof name !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/.test(name)) {
        throw new BillingError(400, "Use 1-24 lowercase letters, numbers, or hyphens for the account name, starting and ending with a letter or number.");
      }
      if (typeof password !== "string" || password.length < 12 || password.length > 128) {
        throw new BillingError(400, "Use a password between 12 and 128 characters.");
      }
      if (!["free", "book_lover", "bookshop_pro"].includes(plan)) {
        throw new BillingError(400, "Choose Free, Book Lover, or Bookshop Pro.");
      }
      const email = `support+test-${plan}-${randomUUID()}@librito.casa`;
      const { data, error } = await db.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: `Test: ${name}` },
        app_metadata: { is_test_account: true },
      });
      if (error) {
        if ([400, 422].includes(error.status)) {
          throw new BillingError(400, "Supabase rejected the test account. Check the password against your project's password policy and try again.");
        }
        throw error;
      }
      if (!data?.user?.id || data.user.email !== email) {
        throw new Error("Supabase did not confirm test account creation.");
      }
      try {
        const profile = checked(await db.from("profiles").upsert({
          id: data.user.id, email, full_name: `Test: ${name}`,
          complimentary_book_lover: plan === "book_lover",
          complimentary_bookshop_pro: plan === "bookshop_pro",
        }, { onConflict: "id" }).select("tier").single());
        if (profile?.tier !== plan) throw new Error("Supabase did not confirm the requested plan.");
      } catch (setupError) {
        console.error("Test account plan setup failed", { userId: data.user.id, code: setupError.code });
        try {
          const removed = checked(await db.auth.admin.deleteUser(data.user.id, false));
          if (removed?.user?.id !== data.user.id) throw new Error("Account cleanup was not confirmed.");
        } catch (cleanupError) {
          console.error("Test account cleanup failed", { userId: data.user.id, code: cleanupError.code });
          throw new BillingError(500, `Account ${email} was created, but its plan could not be confirmed or the account removed. Refresh Users and set its complimentary access before retrying.`);
        }
        throw setupError;
      }
      return res.status(201).json({ user: { id: data.user.id, email, tier: plan, is_test_account: true } });
    } catch (error) {
      return respondError(res, error, "Test account creation could not be confirmed. Refresh Users before retrying.");
    }
  };
}

export default createAdminHandler();
