# Librito

Librito is a cozy, mobile-first library platform concept for scanning books, organizing them into shelves, and tracking spending. It is intentionally simple as a website so it can run on phones without app-store packaging.

## What is included
- Responsive library dashboard with a cozy banner, warm paper tones, and bookish styling
- Local demo library with mock data
- Books are added to the library by default and can optionally be assigned to user-created shelves
- Open a custom shelf to use **Rename shelf** or **Delete shelf**, both in local/demo mode and when signed in. Renaming keeps its books and saved items; deleting requires confirmation, keeps library books and their other shelf memberships, and removes items saved only to the deleted shelf. Built-in collections, including Wishlist, cannot be renamed or deleted.
- Currently Reading and Completed Books are dedicated shelves; completed books can be restarted or managed for selling or donating
- Welcome prompt for visitors to sign in or create an account, with the option to continue browsing
- Adding a book starts with a choice to look it up or enter it manually. Lookup supports title and/or author searches, ISBN entry, and camera scanning; title lookup and Discover catalog results default to the browser language and use matching edition titles and covers. Book detail pages let users choose from available editions and covers in that language.
- Edition shopping shows Google Books catalog pricing when available and searches retailers by the selected edition's ISBN when possible. Retailer results and prices can differ, so verify the ISBN and format before buying.
- Camera-based barcode scan attempt on supported mobile browsers
- Supabase-ready SQL schema for books, shelves, and profiles
- Vercel-friendly static deployment structure

## Local preview
For signed-in shelf management, apply [the shelf-management migration](supabase/migrations/20261025040000_shelf_management.sql) before deploying the updated app. It synchronizes legacy book shelf names atomically when a shelf is renamed or deleted; shelf memberships and saved items continue to use the existing foreign-key cascades.

Run the site locally:

```bash
python3 -m http.server 3000
```

Then open http://127.0.0.1:3000/.

## Branding and home loading states

The sidebar is a simple CSS panel matching the hero's warm brown background, cream text, terracotta accent, and softly rounded corners. It uses text branding without book-cover effects, page edges, or PNG artwork. On desktop and in the mobile library drawer, the content scrolls within the viewport-height panel so navigation and shelves remain accessible on short screens.

Home rows use the bouncing-book loader while the account library or catalog requests are pending (animation respects reduced-motion preferences). Once a new account's empty library has loaded, Currently reading and Recently added show prompts to add books, and author recommendations need books in the library first. These empty states are not ongoing loading states; general recommendations remain available under Picked for your library.

## Admin dashboard
`/admin.html` is an unlinked, noindex report page (users, activity, books, shelves). Access is enforced in Supabase: run [the admin migration](supabase/migrations/20261021190000_admin_dashboard.sql) and [the v2 reports migration](supabase/migrations/20261021200000_admin_dashboard_v2.sql), then grant yourself access in SQL Editor with `insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';`. Non-admins only see "Not found" and the `admin_stats` RPC rejects them. "Active" users are those with a recent `last_sign_in_at`.

## Support, account deletion, and legal readiness

### My account

The Account menu opens a responsive [My account](https://librito.casa/#/account) area with Overview, Account settings, Billing & subscription, and Support & policies. Account settings saves the display name to the authenticated user's profile, shows the sign-in email, and provides sign-in help and the existing permanent-deletion flow. Signing in again preserves saved profile names instead of overwriting them with original signup metadata. Email changes are handled through support; this update does not add unverified email changes or a new password-recovery implementation.

The billing section reuses the existing upgrade page, subscription status, Checkout, Portal and cancel/renew dialogs rather than introducing a second billing implementation. Direct upgrade and Stripe return URLs continue to work. Signed-out visitors see a sign-in invitation rather than private settings. Support links remain public; the policy section explicitly says Terms and Privacy are not yet published and does not expose the drafts. No order history, shipping addresses or marketing preferences are included.

The top account dropdown contains My account, Book Lover plan, and Sign out (Sign in when signed out), plus an Admin dashboard shortcut only after admin access is verified. Settings, support and account deletion remain inside My account; authorized administrators can also reach their dashboard from the account overview. The plan page offers Show plans / Hide plans to collapse the price comparison and billing-period selector without hiding subscription-management controls. Plans are initially expanded.

Account navigation uses dark text on the light panels, cream text for the selected section, and distinct hover/keyboard-focus states. Navigation and account-help link colors have regression checks for at least 4.5:1 normal-text contrast.

Public [Contact us](contact.html) and [Billing Support](billing-support.html) pages use **support@librito.casa** for customer help, billing and privacy requests. They are reachable without signing in; the app links to support in the account menu, footer, sign-in dialog and upgrade screen. The approved refund approach is **no routine partial-period or renewal refunds**, with billing errors, exceptional cases and mandatory consumer rights reviewed through support. Do not request passwords, sign-in codes or full payment-card information by email.

### Deploying self-service account deletion

Apply [the account-deletion migration](supabase/migrations/20261025010000_account_deletion.sql) **after** both Stripe billing migrations and **before deploying this code**. It adds a persistent deletion barrier and an Auth-to-profile cascading foreign key. The key is initially `NOT VALID` to avoid deleting or failing the upgrade on legacy orphan profiles; it immediately enforces new writes and cascades deletion for existing linked accounts. A privileged operator can audit legacy orphans separately and then validate the constraint. Old JWTs cannot recreate a deleted profile because the Auth user must still exist.

Signed-in users can choose **Account -> Delete account**. The Librito dialog explains permanent library removal, immediate subscription cancellation, forfeiture of remaining access, no automatic refund, and financial/back-up retention. The user must type **DELETE**. This does not replace ordinary period-end subscription cancellation, and the deletion dialog does not waive statutory refund rights.

`POST /api/account` requires a Supabase-verified access token, the application origin, and exact confirmation. It ignores client-supplied account/customer IDs. Under the existing per-user/mode billing lease, it:

1. Refuses sandbox deletion of accounts with live Stripe Customer records.
2. Sets `billing_accounts.deletion_pending`, which survives errors and blocks new Checkout, Portal and subscription mutations. A database mode switch is also blocked until pending deletions finish.
3. Expires all open Checkout Sessions for the account's dedicated Stripe Customer.
4. Immediately cancels all nonterminal subscriptions on that Customer, including paused/incomplete subscriptions and old Price IDs, with `invoice_now=false` and `prorate=false`. It never calls a refund API.
5. Deletes the dedicated Stripe Customer to prevent old portal sessions from opening new subscriptions. Stripe may retain invoices and legally required financial records. Already-processing payments are not guaranteed to be reversed.
6. Rechecks lease ownership and permanently deletes the Supabase Auth user. The database cascades the profile, books, shelves, memberships, likes, shelf items, admin grant, and local billing mappings/event ledger.

Stripe and Auth deletion are not one transaction. If Stripe fails, the account/library is not removed. If Stripe succeeds but Auth fails, the account remains marked for deletion and billing may already have stopped. The dialog preserves the error and allows retry; retries recognize an already-deleted Stripe Customer and continue. Do not blindly clear `deletion_pending` or promise that a partially completed deletion restores paid access. Diagnose and finish deletion, or contact the owner about a deliberate recovery plan.

The client only clears the local session, Librito-prefixed browser storage/caches, and redirects to a lasting completion notice after a verified success response. If local cleanup fails, it explicitly asks the user to clear site data. Deletion cannot remotely erase another device's local caches, exports, emails, support correspondence, logs or provider backups.

The server needs Customers read/write/delete, Checkout Sessions read/write, Subscriptions read/write/cancel, and the existing Supabase service-role access. Test permissions in the sandbox; never place server keys in browser configuration. When the production database is live, deletion handles its live Customer; historical sandbox Customers are not real charges and are not accessed with live credentials. Keep separate sandbox projects for ongoing tests.

Never manually delete Auth users as a substitute for the billing-aware endpoint: database cascades cannot call Stripe to stop recurring charges. Do not introduce provider storage uploads without extending deletion to remove owned objects before Auth deletion.

### Unpublished policies and launch blockers

Original [Terms draft](legal-drafts/terms.md) and [Privacy draft](legal-drafts/privacy.md) are **not in force** and are excluded from Vercel uploads/static publishing. Do not enter their paths in Stripe's public legal fields. They contain no personal operator name or invented LLC identity. They are intended for owner and qualified legal review, not as a legal-compliance guarantee.

The proposed age rule is **13+**, with parental/guardian agreement and supervision for under-18 users and parental authorization of paid subscriptions. **It is not yet an implemented age or parental-consent gate.** Finalize actual operator details, jurisdictions served, the signup/recurring-payment consent flows, required privacy disclosures and retention rules before publishing legal pages or opening live payments.

The existing cookie banner's optional functional-storage preference is not consistently enforced by the app's storage/cache code. Resolve that mismatch before claiming consent-controlled optional storage. Identify the support-email provider and verify production analytics/logging settings. Affiliate links are planned, not enabled by this work: disclose commissions clearly near affected recommendations/links and review affiliate tracking/consent before introducing them.

## Account tiers
Accounts are **Lite Reader** (free) or **Book Lover** (paid), stored in `profiles.tier`. Lite Reader is limited to 100 books, 5 custom shelves (Library, Liked Books and the built-in Wishlist shelf don't count) and 5 Currently Reading books; Book Lover is unlimited and can export library reports from the Stats page. Limits are enforced by database triggers as well as in the app. Users cannot change their own tier. Admins can grant or revoke complimentary Book Lover access from the Users page of `/admin.html`; removing a complimentary grant does not cancel a paid subscription. Run these migrations in order after the admin ones: `20261024190000_account_tiers`, `20261024200000_lite_reader_limits`, `20261024210000_lite_reader_reading_limit`, `20261024220000_admin_account_tiers` and `20261024240000_builtin_wishlist_shelf`. The last one gives every user a permanent Wishlist shelf that can't be renamed or deleted, and turns any existing user-made "Wishlist" shelf into it. Then apply [the Stripe billing migration](supabase/migrations/20261024250000_stripe_billing.sql). It preserves existing Book Lover accounts as complimentary grants and makes the effective tier the union of complimentary and Stripe access.

## Stripe billing

### Paid upgrades paused

Book Lover is currently shown as **Coming soon**, with prices, billing-interval choices and purchase actions removed from the plan page (including My account's Billing section). `POST /api/billing` rejects every `checkout` action with HTTP 503 before loading Stripe configuration or contacting external services, including requests from cached clients and former subscribers. Admins can still grant or revoke complimentary Book Lover access; existing entitlements, limits and report exports are unchanged. Existing paid subscriptions can still be managed, canceled or renewed, and webhooks continue reconciling them. This does not cancel existing subscriptions or expire previously issued Stripe Checkout links.

To launch paid upgrades later, deliberately restore the plan-page purchase controls and authenticated checkout routing, update their tests and public billing-support copy, and complete the production checklist below. The integration details below describe the retained, currently inactive new-purchase flow.

### Integration design

Librito sells its own digital subscription, not books or marketplace payouts. Use Stripe Billing with hosted Checkout, one **Book Lover** Product, and two recurring USD Prices: **$2.99/month** and **$24.99/year**. Lite Reader stays free without a Stripe subscription. The Customer Portal manages payment methods, billing intervals, invoices and cancellation. No Stripe.js or publishable API key is needed for this hosted flow.

The upgrade page calls authenticated Vercel functions. The server validates the Supabase access token, chooses an allowlisted Price, and verifies that the mode, amount, currency and interval match the UI. Server-only billing tables map each Supabase user to one Stripe Customer per mode. Per-account leases and mode-specific Stripe idempotency keys prevent concurrent duplicate checkouts; an open Checkout Session is reused or expired when switching intervals.

Signed webhooks reconcile current Stripe subscription state rather than trusting redirects or old event payloads. Deliveries are recorded for deduplication, and concurrent updates are serialized. Active, trialing and past-due subscriptions retain access; canceled, unpaid, paused or expired incomplete subscriptions do not. Configure Stripe's retry policy to move exhausted subscriptions to **canceled or unpaid**, not leave them past due forever. Cancellation at period end preserves access until Stripe ends the subscription. Downgrades never delete books or shelves; existing database limits apply when adding books, shelves or reading entries.

The plan page shows the days remaining (rounded up in 24-hour periods) and the exact end or renewal date. Canceled but still-active subscriptions offer **Renew subscription**, with a confirmation before restoring automatic renewal on the same subscription; this does not create a second subscription. The dialog explicitly states that the subscription is currently canceled and no payments are scheduled: **Renew subscription** restores automatic renewal, while **Continue cancellation** leaves the cancellation unchanged. Once access has ended, resubscription is blocked while paid upgrades are paused. Resuming requires **Subscriptions: Write** on the restricted Stripe key.

Renewal confirmation uses Librito's existing dialog rather than a native browser prompt. It disables duplicate submissions while saving, keeps failures inside the dialog with retry/cancel options, and only reports success after the server confirms the update. Resume requests clear the subscription's applicable cancellation field, not both cancellation parameters together. Billing logs include a bounded, credential-redacted diagnostic message and Stripe request ID where available; customer responses remain generic for unexpected failures.

The **Your subscription** panel offers **Cancel subscription** directly for renewing active/trialing/past-due plans. The Librito dialog uses **Cancel subscription** / **Keep subscription**, explains when access ends, preserves books/shelves and complimentary grants, and makes clear that cancellation is not a refund or forgiveness of an outstanding balance. The authenticated, account-locked server action schedules cancellation at period end; repeat requests preserve an existing cancellation date. Ended, complimentary-only and already-canceling plans do not offer this action. **Manage billing** remains available for saved payment methods and downloadable invoices. Both cancellation and renewal require Subscriptions write permission. A failure refreshing the UI after a confirmed change is reported separately from the completed billing action.

Successful cancellation opens a lasting **Sorry to see you go** dialog confirming the end date, with an optional **Renew subscription** action that still requires explicit confirmation. Renewing opens a warm success dialog. Successful checkout returns show a **Welcome to Book Lover** dialog listing unlocked features only after the authenticated billing status and profile confirm access, never just from a success URL. A user-scoped pending flag in session storage prevents repeat welcomes on refresh; canceled checkout clears it. These dialogs stay open until dismissed instead of relying on short-lived toasts.

Billing-status requests reconcile directly with Stripe under the same account lock as webhooks, so refreshing also repairs stale cancellation flags from missed or older webhook deliveries. If Stripe cannot be reached, the page shows a retry error instead of presenting cached renewal information as current. Webhooks are still required for updates while the user is away.

Concurrent billing requests and webhooks briefly retry account-lock acquisition (250ms, 500ms, 1s, 2s) instead of immediately failing while another request saves the subscription. Only lock acquisition is retried, never Stripe mutations or failed database writes. If contention persists, the endpoint returns HTTP 409 with `Retry-After: 2` and logs a warning; webhook responses remain non-2xx so Stripe retries delivery. Other failures remain errors.

In-app banners remind signed-in readers when canceled access ends or automatic renewal approaches, within 30 days, 7 days, and 1 day. They also cover trial endings and direct past-due customers to update payment details. Dismissing a banner hides that milestone for the current browser session; the next milestone, changed end date, or changed cancellation state gets a new reminder. Status is checked on library load, focus, and while the visible app is open (at most every five minutes). No email, push notification, scheduled job, or reminder delivery while the app is closed is included. Complimentary-only accounts have no expiry reminder.

### Sandbox setup

1. In Stripe Dashboard, create a separate **sandbox** for development. Keep production and CI credentials/data separate. No live Stripe resources have been created by this setup.
2. Apply all existing Supabase migrations, followed by [the billing migration](supabase/migrations/20261024250000_stripe_billing.sql) and [the billing-mode migration](supabase/migrations/20261024260000_stripe_billing_modes.sql), preferably in a development Supabase project first. The database initially accepts sandbox billing only.
3. In the sandbox, create the Book Lover Product and the two Prices above (quantity one, interval count one). Copy their `price_...` IDs. Treat these Price IDs as stable; adding replacement Prices requires planning how existing subscriptions will remain entitled.
4. Set server environment variables using [.env.example](.env.example) as a list of names:
   - `APP_URL`: the exact application origin, such as `https://librito.casa` or `http://localhost:3000`. HTTPS is required except on localhost.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: match the project used by the browser's `config.js`. The service-role key must never enter browser configuration.
   - `STRIPE_SECRET_KEY`: prefer a sandbox **restricted API key** with only the permissions needed to read/write Customers, Checkout Sessions and Subscriptions, read Prices and Charges, and create Customer Portal sessions. Subscriptions write access is required to resume renewal. Adjust permissions if Stripe reports an authorization error.
   - `STRIPE_MODE`: `test` for a sandbox, `live` for real payments. Required; must match the API key prefix and the database billing environment.
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

The automated lifecycle scenarios exercise authenticated monthly/annual Checkout requests, signed webhook delivery through the real signature verifier, failed initial payments, asynchronous failure/success, renewal retries, retry exhaustion, payment recovery, period-end cancellation, duplicate delivery, library preservation and user isolation. Mode-isolation regressions cover key/mode mismatch, wrong-mode Prices and signed events, separate customers/Checkout idempotency keys/event ledgers, database environment switching, blocked stale sandbox deployments, preserved sandbox history, and independent complimentary grants. Stripe API responses are simulated; these tests do not charge cards or validate the Dashboard's live configuration, real payment authentication, or tax settings.

If billing logs report PostgreSQL `42703` (missing column), check that the Stripe billing migration was applied to the Supabase project configured on the server. Earlier account-tier migrations do not create the billing tables or complimentary-access field. The upgrade page hides billing-management details for readers without a billing account; failed status requests show a friendly, centered retry message rather than raw server errors.

Before launch, exercise the deployed sandbox with Stripe's documented test payment methods: monthly and annual purchases, 3DS, decline and retry, duplicate clicks, abandoned checkout, asynchronous payment success/failure, renewals (using test clocks), period-end cancellation, failed-payment exhaustion, portal changes, complimentary grants, and downgrades while over free-tier limits. Replay webhook deliveries and confirm only the correct user's tier changes. Check that secrets and server files are not publicly served.

Refunds do not automatically cancel subscriptions, and disputes/fraud signals need an explicit business decision. The integration persists these events in `billing_events` with `requires_review = true`, reconciles subscription state, and emits a warning without payment details or credentials. Monitor Vercel logs and Stripe Dashboard notifications. Review the queue in Supabase SQL Editor:

```sql
select event_id, event_type, user_id, livemode, created_at
from public.billing_events
where requires_review
order by created_at;
```

Review the associated payment in Stripe, cancel the subscription or take other action as appropriate, and clear `requires_review` after handling it. Alert on webhook delivery failures; non-2xx responses must be retried. An expired server lease can be reclaimed after two minutes. Use the billing-aware account-deletion endpoint rather than manually deleting Auth users. The local event ledger cascades with account deletion; later signed events for the deleted customer's removed mapping are acknowledged without restoring access. Define any separate lawful financial/risk retention requirements before launch; do not retain library data unnecessarily.

**Tax:** review sales-tax/VAT/GST obligations for digital subscriptions, including Stripe Tax and product tax codes. Automatic tax is deliberately not enabled: confirm applicable active tax registrations and inclusive/exclusive price behavior first.

### Moving an existing sandbox deployment to live

The billing-mode migration labels all existing billing records as sandbox (`livemode = false`), preserves them, and adds a database-wide active billing environment. Only that environment contributes paid access to `profiles.tier`; complimentary grants always remain independent. Changing environments never deletes books, shelves, profiles, or Stripe records. This migration assumes this installation has only used sandbox Stripe credentials so far; do not use it unchanged to label an already-live installation.

Use a separate Supabase project for ongoing sandbox development/CI after launch. A database has **one active billing environment**: a preview with sandbox credentials pointed at a live database deliberately fails rather than granting sandbox access to production users.

1. **Prepare without changing Stripe credentials.** Apply [the billing-mode migration](supabase/migrations/20261024260000_stripe_billing_modes.sql) in Supabase SQL Editor. Set `STRIPE_MODE=test` in Vercel and deploy this version with the existing sandbox variables. Verify sandbox billing still works. Keep [vercel.json](vercel.json): it routes extensionless billing requests to the server functions and limits published static files.
2. **Create live resources.** In the activated Stripe account's **live mode**, create one Book Lover Product with USD $2.99/month and $24.99/year recurring Prices, interval count one. Configure the live Customer Portal with payment-method updates, invoices and period-end cancellation. If allowing interval switching, allow only these two Prices and review proration/timing. Set payment retries to end subscriptions as canceled or unpaid after exhaustion.
3. **Create the required live webhook.** Use `https://librito.casa/api/stripe-webhook`, snapshot events for your account, an API version compatible with the installed SDK, and all **11 events** listed above. Save its live signing secret securely. Deliveries will not succeed until the live deployment is ready; retry failed deliveries afterward.
4. **Prepare live credentials.** Create a live restricted API key with the permissions listed above. Store it and the webhook secret as Vercel sensitive environment variables, not in chat, browser configuration or source control. Prepare the live Price IDs. Do not mix live and sandbox values.
5. **Cut over during a short billing maintenance window.** Pause new billing activity and disable the old sandbox webhook destination pointing at production. In Supabase SQL Editor run:

   ```sql
   update public.billing_environment set livemode = true where id = true;
   select livemode from public.billing_environment where id = true;
   ```

   If a billing lease is active, the switch fails and rolls back; wait for requests to finish (abandoned leases expire after two minutes), then retry. Sandbox-only paid access ends at this switch; admin complimentary access remains. Old sandbox deployments can no longer mutate billing or return authoritative billing status.

   Together, set Vercel Production's `STRIPE_MODE=live`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, and `STRIPE_WEBHOOK_SECRET` to their live values, keep `APP_URL=https://librito.casa`, then redeploy. Supabase variables do not change when keeping the existing database. Between the database switch and deployment, billing intentionally reports an error rather than mixing environments.
6. **Verify before announcing launch.** Check deployment success, sign in, and confirm sandbox purchases no longer appear as real subscriptions. Live Checkout must show the correct live Product, price, currency, return URL and no test-mode indicator. With explicit owner approval, make a genuine live purchase using a real payment method, confirm the paid invoice, successful live webhook deliveries, Book Lover access, Portal access, cancellation and renewal. Test cards do not work in live mode. A complimentary account cannot start Checkout; use a separate non-complimentary owner account. Live testing creates real charges and any refunds are a separate deliberate action.

Review tax obligations/registrations, price tax behavior, customer support contact, cancellation/refund policies, account activation and payout details before opening payments publicly. Automatic tax remains off until active registrations are confirmed.

For rollback before accepting real purchases, revert the database environment to `false` and redeploy with the entire sandbox configuration including `STRIPE_MODE=test`; preserve all billing rows. **After accepting live purchases, do not switch production back to sandbox**: use a separate development project and fix forward so real subscribers retain access. Switching database modes does not cancel either live or sandbox subscriptions in Stripe.

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
