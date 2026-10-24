# Librito

Librito is a cozy, mobile-first library platform concept for scanning books, organizing them into shelves, and tracking spending. It is intentionally simple as a website so it can run on phones without app-store packaging.

## What is included
- Responsive library dashboard with a cozy banner, warm paper tones, and bookish styling
- Local demo library with mock data
- Books are added to the library by default and can optionally be assigned to user-created shelves
- Currently Reading and Completed Books are dedicated shelves; completed books can be restarted or managed for selling or donating
- Welcome prompt for visitors to sign in or create an account, with the option to continue browsing
- Adding a book starts with a choice to look it up or enter it manually. Lookup supports title and/or author searches, ISBN entry, and camera scanning; title lookup and Discover catalog results default to the browser language and use matching edition titles and covers. Book detail pages let users choose from available editions and covers in that language.
- Edition shopping shows Google Books catalog pricing when available and searches retailers by the selected edition's ISBN when possible. Retailer results and prices can differ, so verify the ISBN and format before buying.
- Camera-based barcode scan attempt on supported mobile browsers
- Supabase-ready SQL schema for books, shelves, and profiles
- Vercel-friendly static deployment structure

## Local preview
Run the site locally:

```bash
python3 -m http.server 3000
```

Then open http://127.0.0.1:3000/.

## Admin dashboard
`/admin.html` is an unlinked, noindex report page (users, activity, books, shelves). Access is enforced in Supabase: run [the admin migration](supabase/migrations/20261021190000_admin_dashboard.sql) and [the v2 reports migration](supabase/migrations/20261021200000_admin_dashboard_v2.sql), then grant yourself access in SQL Editor with `insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';`. Non-admins only see "Not found" and the `admin_stats` RPC rejects them. "Active" users are those with a recent `last_sign_in_at`.

## Account tiers
Accounts are **Lite Reader** (free) or **Book Lover** (paid), stored in `profiles.tier`. Lite Reader is limited to 100 books, 5 custom shelves (Library, Liked Books and the built-in Wishlist shelf don't count) and 5 Currently Reading books; Book Lover is unlimited and can export library reports from the Stats page. Limits are enforced by database triggers as well as in the app. Users cannot change their own tier. Admins can grant or revoke complimentary Book Lover access from the Users page of `/admin.html`; removing a complimentary grant does not cancel a paid subscription. Run these migrations in order after the admin ones: `20261024190000_account_tiers`, `20261024200000_lite_reader_limits`, `20261024210000_lite_reader_reading_limit`, `20261024220000_admin_account_tiers` and `20261024240000_builtin_wishlist_shelf`. The last one gives every user a permanent Wishlist shelf that can't be renamed or deleted, and turns any existing user-made "Wishlist" shelf into it. Then apply [the Stripe billing migration](supabase/migrations/20261024250000_stripe_billing.sql). It preserves existing Book Lover accounts as complimentary grants and makes the effective tier the union of complimentary and Stripe access.

## Stripe billing

### Integration design

Librito sells its own digital subscription, not books or marketplace payouts. Use Stripe Billing with hosted Checkout, one **Book Lover** Product, and two recurring USD Prices: **$2.99/month** and **$24.99/year**. Lite Reader stays free without a Stripe subscription. The Customer Portal manages payment methods, billing intervals, invoices and cancellation. No Stripe.js or publishable API key is needed for this hosted flow.

The upgrade page calls authenticated Vercel functions. The server validates the Supabase access token, chooses an allowlisted Price, and verifies that the amount, currency and interval match the UI. Server-only billing tables map each Supabase user to one Stripe Customer. Per-account leases and Stripe idempotency keys prevent concurrent duplicate checkouts; an open Checkout Session is reused or expired when switching intervals.

Signed webhooks reconcile current Stripe subscription state rather than trusting redirects or old event payloads. Deliveries are recorded for deduplication, and concurrent updates are serialized. Active, trialing and past-due subscriptions retain access; canceled, unpaid, paused or expired incomplete subscriptions do not. Configure Stripe's retry policy to move exhausted subscriptions to **canceled or unpaid**, not leave them past due forever. Cancellation at period end preserves access until Stripe ends the subscription. Downgrades never delete books or shelves; existing database limits apply when adding books, shelves or reading entries.

The plan page shows the days remaining (rounded up in 24-hour periods) and the exact end or renewal date. Canceled but still-active subscriptions offer **Resume renewal**, with a confirmation before restoring automatic renewal on the same subscription; this does not create a second subscription. Once access has ended, **Resubscribe to Book Lover** opens Checkout. Resuming requires **Subscriptions: Write** on the restricted Stripe key.

Billing-status requests reconcile directly with Stripe under the same account lock as webhooks, so refreshing also repairs stale cancellation flags from missed or older webhook deliveries. If Stripe cannot be reached, the page shows a retry error instead of presenting cached renewal information as current. Webhooks are still required for updates while the user is away.

In-app banners remind signed-in readers when canceled access ends or automatic renewal approaches, within 30 days, 7 days, and 1 day. They also cover trial endings and direct past-due customers to update payment details. Dismissing a banner hides that milestone for the current browser session; the next milestone, changed end date, or changed cancellation state gets a new reminder. Status is checked on library load, focus, and while the visible app is open (at most every five minutes). No email, push notification, scheduled job, or reminder delivery while the app is closed is included. Complimentary-only accounts have no expiry reminder.

### Sandbox setup

1. In Stripe Dashboard, create a separate **sandbox** for development. Keep production and CI credentials/data separate. No live Stripe resources have been created by this setup.
2. Apply all existing Supabase migrations, followed by [the billing migration](supabase/migrations/20261024250000_stripe_billing.sql), preferably in a development Supabase project first.
3. In the sandbox, create the Book Lover Product and the two Prices above (quantity one, interval count one). Copy their `price_...` IDs. Treat these Price IDs as stable; adding replacement Prices requires planning how existing subscriptions will remain entitled.
4. Set server environment variables using [.env.example](.env.example) as a list of names:
   - `APP_URL`: the exact application origin, such as `https://librito.casa` or `http://localhost:3000`. HTTPS is required except on localhost.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: match the project used by the browser's `config.js`. The service-role key must never enter browser configuration.
   - `STRIPE_SECRET_KEY`: prefer a sandbox **restricted API key** with only the permissions needed to read/write Customers, Checkout Sessions and Subscriptions, read Prices and Charges, and create Customer Portal sessions. Subscriptions write access is required to resume renewal. Adjust permissions if Stripe reports an authorization error.
   - `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_ANNUAL`: the sandbox Price IDs.
   - `STRIPE_WEBHOOK_SECRET`: the endpoint's signing secret, not an API key. For local forwarding, use the signing secret printed by `stripe listen`.
   Store secrets in Vercel's **sensitive environment variables**. For local development only, use an ignored `.env.local`; never paste keys into chat, commit them, or log them. The deployment only publishes explicitly selected browser assets.
5. Configure the sandbox Customer Portal: allow payment-method updates and cancellation **at period end**. If enabling monthly/annual switching, allow only the two Book Lover Prices and explicitly review proration and change timing. Configure Billing payment retries and customer emails.
6. Register a webhook endpoint at `https://YOUR_DEPLOYMENT/api/stripe-webhook`, using an event destination/API version matching the installed Stripe SDK. Subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `charge.dispute.created`
   - `charge.refunded`
   - `radar.early_fraud_warning.created`
7. For full local development, install dependencies with `npm install`, then use `npx vercel dev --listen 3000` (requires Vercel project setup). In another terminal, with Stripe CLI authenticated to the sandbox, run `stripe listen --forward-to localhost:3000/api/stripe-webhook` and set its printed signing secret locally. The Python/static preview still works for browsing, but cannot execute billing endpoints.
8. Open the Upgrade page while signed in. Checkout returns to that page without granting access; use **Refresh billing status** after webhook confirmation. **Manage billing** remains available for existing Stripe Customers, even after paid access ends.

### Validation and operations

Run `npm test` for API/authentication, signed-webhook, checkout, concurrency and PostgreSQL migration/permission tests. No real API keys are needed for these tests.

If billing logs report PostgreSQL `42703` (missing column), check that the Stripe billing migration was applied to the Supabase project configured on the server. Earlier account-tier migrations do not create the billing tables or complimentary-access field. The upgrade page hides billing-management details for readers without a billing account; failed status requests show a friendly, centered retry message rather than raw server errors.

Before launch, exercise the deployed sandbox with Stripe's documented test payment methods: monthly and annual purchases, 3DS, decline and retry, duplicate clicks, abandoned checkout, asynchronous payment success/failure, renewals (using test clocks), period-end cancellation, failed-payment exhaustion, portal changes, complimentary grants, and downgrades while over free-tier limits. Replay webhook deliveries and confirm only the correct user's tier changes. Check that secrets and server files are not publicly served.

Refunds do not automatically cancel subscriptions, and disputes/fraud signals need an explicit business decision. The integration persists these events in `billing_events` with `requires_review = true`, reconciles subscription state, and emits a warning without payment details or credentials. Monitor Vercel logs and Stripe Dashboard notifications. Review the queue in Supabase SQL Editor:

```sql
select event_id, event_type, user_id, created_at
from public.billing_events
where requires_review
order by created_at;
```

Review the associated payment in Stripe, cancel the subscription or take other action as appropriate, and clear `requires_review` after handling it. Alert on webhook delivery failures; non-2xx responses must be retried. An expired server lease can be reclaimed after two minutes. Account deletion and billing cancellation are separate operations: cancel subscriptions before deleting Supabase accounts. Keep the event ledger for as long as delivery deduplication/audit requirements need it.

**Tax:** review sales-tax/VAT/GST obligations for digital subscriptions, including Stripe Tax and product tax codes. Automatic tax is deliberately not enabled: confirm applicable active tax registrations and inclusive/exclusive price behavior first.

For production, repeat Product/Price/Portal/webhook setup in live mode with separate restricted credentials, set the production `APP_URL`, and run the go-live checklist. Sandbox IDs and signing secrets cannot be reused in live mode.

### Stripe agent tooling

[.vscode/mcp.json](.vscode/mcp.json) configures `https://mcp.stripe.com` using OAuth. Start the `stripe` server through **MCP: List Servers**, approve Stripe authentication, then reload tools or start a new chat. Confirm `stripe_implementation_planner` is available before using it; installing server configuration alone does not authenticate the session.

The Claude plugin install could not run in this environment because `claude` is unavailable. The requested fallback, `npx skills add https://docs.stripe.com`, installed Stripe's official guidance under [.agents/skills](.agents/skills), with versions recorded in [skills-lock.json](skills-lock.json). The integration design above uses that guidance; it is not output from the unavailable planner tool.

## Supabase setup
1. Create a new Supabase project.
2. For a new project, open SQL Editor and run [supabase/schema.sql](supabase/schema.sql), then [supabase/auth-setup.sql](supabase/auth-setup.sql). For an existing project, run [the progress and shelves migration](supabase/migrations/20261013192727_library_progress_and_likes.sql), followed by [the completed-book disposition migration](supabase/migrations/20261013195700_completed_book_disposition.sql), [the bookmark timestamp migration](supabase/migrations/20261013223000_bookmark_timestamps.sql), and [the edition-specific reading progress migration](supabase/migrations/20261018143300_edition_specific_reading_progress.sql) in SQL Editor; they add fields without replacing existing rows. The completed-book migration renames any user-created “Completed Books” shelf so the generated shelf can use that name. The schema script is also safe to re-run on existing projects. The auth script creates a profile for each newly registered Supabase user.
3. Set the project's URL and anon key in `config.js`. Users can choose Google or email/password to register or sign in; these are alternative methods, so Google users do not need to provide a separate email/password in Librito. If email confirmation is enabled, email/password users must confirm their email before signing in. Signed-in books and shelves are loaded from Supabase.
4. To enable Google sign-in, create a Google OAuth client and add the callback URL shown under Supabase Authentication > Providers > Google as an authorized redirect URI in Google Cloud. Add the client ID and secret to that Google provider in Supabase, then enable it.
5. In Supabase Authentication > URL Configuration, set the Site URL to `https://librito.casa` and add `https://librito.casa/**` and your local preview URL (for example, `http://localhost:3000/**`) to the allowed redirect URLs. The app sends Google sign-in, sign-up confirmation, and password-reset redirects to the custom domain (or localhost during local development). Vercel-hosted URLs redirect to `https://librito.casa`; only add a Vercel preview URL to Supabase if you intentionally need to use one.

The Google button supports both registration and sign-in. Supabase returns users to the app after authorization, and the profile trigger uses Google's name metadata when creating their Librito profile; no extra profile details are required. Keep the Google client secret in Supabase; it does not belong in `config.js`.

## Vercel deployment
1. Push this repository to GitHub.
2. Import it into Vercel.
3. Set the project root to the repository root.
4. Vercel will serve the static files automatically.

## Scanner notes
- ISBN lookup uses Open Library metadata. The app first tries its `/api/scan` endpoint, then falls back to Open Library directly.
- Camera scanning requires a secure context (HTTPS when deployed; localhost is allowed for local development) and camera permission.
- The scanner uses the browser's `BarcodeDetector` when available and otherwise loads ZXing from jsDelivr. Manual ISBN entry and Lookup remain available if camera scanning is unsupported or unavailable.
