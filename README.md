# Librito

Librito is a cozy, mobile-first library platform concept for scanning books, organizing them into shelves, and tracking spending. It is intentionally simple as a website so it can run on phones without app-store packaging.

## What is included
- Responsive library dashboard with a cozy banner, warm paper tones, and bookish styling
- Book cards use a single top-right three-dot button to open a menu with the cover, title, author, favorite toggle, reading and ownership statuses, shelf management, sharing, and applicable purchase and removal actions. On mobile it opens as a bottom sheet; on desktop it opens at the click location, stays within the viewport as it expands or the window resizes, and scrolls if needed. **Book Page** opens the book's profile at the top. Status choices expand within the menu; Escape, the close button, or clicking outside dismisses it.
- Book profiles place the cover and description beside a details column, with favorite/shelf actions above metadata and reading/ownership controls below it. Bookmark progress remains available for currently reading books. Editions use horizontal cover-and-details cards, followed by author recommendations, similar books, and the audiobook panel; the layout stacks on smaller screens.
- Signed-in readers see a softly framed cover with side arrows, a top-right image counter, an expand control, and mini-gallery thumbnails on books in their library. **Add Photos** opens a modal popup with file upload, a drag-and-drop area, uploaded-photo previews, and mobile/touch camera capture. It supports selecting or dropping multiple files, uploaded sequentially; if a later file fails, already uploaded photos remain saved and the popup reports partial completion. Upload JPEG, PNG, or WebP photos (up to 5 MB each), then select a thumbnail or use previous/next controls (including arrow keys on the buttons) to cycle between the primary cover and private photos. Uploaded images show a small **Your photo** badge and a camera icon in the counter; the primary cover remains available and unchanged, including when choosing another edition. Expand opens the selected image in a keyboard-dismissible dialog, which is cleaned up on sign-out or when leaving the profile. Delete photo removes the selected upload. Photos never replace catalog covers or appear to other readers; database-enforced storage policies require ownership of the library book. Downloads use authenticated requests and temporary browser object URLs, not public or shareable signed URLs, and bypass the service worker image cache. Removing a book deletes its photos first; permanent account deletion also removes uploaded photos. If cleanup fails, deletion stops with an error and can be retried.
- Local demo library with mock data
- Books are added to the library by default and can optionally be assigned to user-created shelves
- Open a custom shelf to use **Rename shelf** or **Delete shelf**, both in local/demo mode and when signed in. Renaming keeps its books and saved items; deleting requires confirmation, keeps library books and their other shelf memberships, and removes items saved only to the deleted shelf. Built-in collections, including Wishlist, cannot be renamed or deleted.
- Currently Reading and Completed Books are dedicated shelves; completed books can be restarted or managed for selling or donating
- Welcome prompt for visitors to sign in or create an account, with the option to continue browsing
- Adding a book starts with a choice to look it up or enter it manually. Lookup supports title and/or author searches, ISBN entry, and camera scanning; title lookup and Discover catalog results default to the browser language and use matching edition titles and covers. Book detail pages let users choose from available editions and covers in that language.
- Discover and add-book lookup retry empty title/author searches with spelling-tolerant catalog matching, including missing letters and swapped letters (for example, `paulo celoho` finds Paulo Coelho). Exact catalog results take priority; closest spelling matches are labeled and retain the selected language. Local typo matches also respect genre and page-count constraints. Catalog recovery checks up to 100 candidates per retry, so not every misspelling is guaranteed to match.
- **Buy this book** appears above author/similar-book recommendations, with a horizontally scrollable row of purchase cards. Available Librito copies come first, showing the seller's price, shipping, condition, and listing photo; matches use ISBN or exact title and author and can include other editions. Only active, in-stock listings are included (up to 12), and listing buttons open the marketplace details. The existing admin-only marketplace launch gate remains in place: visitors see a **Coming soon** Librito card, while admins can preview matching listings. Failed requests show an error and retry option.
- Purchase cards and edition shopping share retailer search links for Amazon, Bookshop.org, Barnes & Noble, ThriftBooks, and Better World Books. Links use the selected ISBN when possible, otherwise title/author. Outside cards say **Check retailer for price** until authorized retailer price feeds and affiliate accounts are connected; these are not affiliate links yet. Google Books catalog prices appear only as a separate reference in edition shopping, never as a retailer's quoted price. Verify ISBN, format, availability, shipping, and final totals before buying.
- Camera-based barcode scan attempt on supported mobile browsers
- Supabase-ready SQL schema for books, shelves, and profiles
- Vercel-friendly static deployment structure

## Local preview
Before deploying private photo uploads, run [the private book photos migration](supabase/migrations/20261101160000_private_book_photos.sql) in Supabase SQL Editor. It configures the private bucket, allowed formats, 5 MB file limit, and owner/library-only access policies; it is safe to rerun. This storage setup is separate from the public schema script and requires Supabase Storage. Local/demo mode does not upload photos; sign in and add the book to your library first.

The **Add Photos** popup offers **Upload Photos** and, on mobile/touch devices, **+ Camera**, requesting the rear camera through the browser's native photo picker; browsers without camera capture support fall back to a picker. Both options and drag-and-drop use the same private upload validation and 5 MB limit; unsupported formats or oversized photos show an error. Close, Escape, or the backdrop dismisses the popup; uploads already underway continue while the profile remains active. Popup previews are cleared on sign-out or when leaving the book page. Mobile book profiles use touch-friendly controls and a decorative background anchored behind the cover rather than halfway down the stacked profile.

For signed-in shelf management, apply [the shelf-management migration](supabase/migrations/20261025040000_shelf_management.sql) before deploying the updated app. It synchronizes legacy book shelf names atomically when a shelf is renamed or deleted; shelf memberships and saved items continue to use the existing foreign-key cascades.

Run the site locally:

```bash
python3 -m http.server 3000
```

Then open http://127.0.0.1:3000/.

## Branding and home loading states

The site follows the [cozy dashboard reference](assets/Librito%20Cozy%20Digital%20Library%20Dashboard.png) and [sage/terracotta palette](assets/palette.png): Warm Sand (`#F3E6D8`) backgrounds, Deep Sage (`#5E6F4F`) buttons and menus, Sage (`#7F9270`) / Soft Sage (`#9CAF88`) accents, and Blush Adobe (`#E8C3AE`) borders. Terracotta (`#C26A4A`) highlights reading progress; Deep Clay (`#A9553A`) and Warm Peach Clay (`#D98B6B`) provide warm accents. Cream (`#FFFAF2`) card surfaces and dark text keep content readable; darker sage (`#45523A`) is used for text and hover states where the lighter palette shades lack contrast.

The sidebar uses the [Elegant Botanical Green Bookmark](assets/Elegant%20Botanical%20Green%20Bookmark.png) unchanged, preserving its leafy olive texture, parchment border, and green tassel. Sidebar text and icons use Parchment (`#E5D4AE`); popup menus pair it with Botanical Green (`#4B543D`) surfaces and dark Botanical Ink (`#303B29`) hover/selected states. Navigation uses selected-only parchment borders; keyboard-focus outlines remain visible. The [logo](assets/Librito%20Digital%20Home%20Library%20Logo.png) and book covers remain unfiltered. The slim desktop panel is 13.5–15rem wide, with navigation inset inside the artwork border and scrollable content. The mobile bookmark extends below the viewport with its tassel offscreen to leave room for navigation. Its close control is a botanical-green circle with a parchment X and border, positioned at the upper inset corner with safe-area spacing, an accessible label, and keyboard focus. The bookmark and logo are precached for offline use. The dashboard reference is design guidance, not a rendered screenshot or source of account data.

Popup menus reuse the botanical bookmark artwork as a cropped leafy texture beneath a dark readability wash, with serif typography, an inset parchment frame, and soft shadows. No filters are applied to menu text or book covers.

The book-actions popup uses a single parchment outer frame and roomy inner spacing. Its Reading status and Ownership rows are borderless until expanded; inline suboptions share the parent texture without a nested frame or deep indentation.

The account trigger shows the saved display name (the signup username), falling back to signup metadata and then the sign-in email when no name is set. Long names/emails are ellipsized within the trigger, with the full value in its tooltip. Account dropdown links use dark botanical surfaces rather than brown fills.

Typography echoes the logo with a Georgia/Times serif stack, warm logo cream (`#F2C88F`) on botanical-green menus and controls, and bronze (`#735032`) headings on light surfaces. The hero uses a bold serif heading with warm cream-gold copy. Green action surfaces are dark enough for the gold text to meet normal-text contrast requirements; body copy remains dark on cream and sand.

The home hero uses self-hosted Dancing Script cursive only when the browser's primary language is English (`en` or `en-*`); other browser languages retain the basic serif heading. The font is cached offline and distributed under the [SIL Open Font License](assets/DancingScript-OFL.txt). The search language label wraps instead of truncating, with a second search-control row on narrow screens. Olive/bronze actions and plum headings add color variety without recoloring book artwork or changing the botanical sidebar. Home rows share the page background. Dividers cycle through a sage tapered line with a leaf accent, terracotta solid/dotted lines with a circle, and bronze double lines with a diamond. Shared controls use a single clean parchment border rather than tightly stacked inset rings.

Outside the bookmark sidebar, olive controls turn bronze on hover/open/selection, and bronze controls turn olive, including button-style links and admin actions. Reading status starts olive and Ownership bronze. Popup options share the botanical texture without alternating row fills; hovered/selected options use the complementary olive/bronze color. The hero recommendation action follows this shared olive/bronze palette.

Dropdown surfaces match the trigger's interaction color: green triggers open brown menus and brown triggers open green menus. Detached popovers copy that color from their trigger before moving to the document body. The sidebar close control is a compact 2rem circle inset beneath the bookmark's top-right ornamental corner.

Shared primary and secondary actions (buttons and button-style links) use parchment trim across pages, including marketplace/retailer links, audiobook actions, account forms, membership, cookie consent, and admin actions. Plain text links, cover links, and unselected sidebar navigation remain unframed.

Menu-control exceptions retain a simple parchment border: three-dot buttons, language and account controls, book favorite/shelf/status controls, bookmark actions (including Currently Reading cards), and the edition refresh button. Sidebar navigation remains selected-only. Borders do not replace keyboard-focus outlines. The home hero banner has outer and inset parchment borders; its decorative frame does not intercept clicks.

Home rows use the bouncing-book loader while the account library or catalog requests are pending (animation respects reduced-motion preferences). Once a new account's empty library has loaded, Currently reading and Recently added show prompts to add books, and author recommendations need books in the library first. These empty states are not ongoing loading states; general recommendations remain available under Picked for your library.

Currently reading shows every in-progress book in a compact, cover-first card, with the book above its title, author, page progress, and bookmark control. The row scrolls horizontally on desktop and mobile, including with the left and right arrow keys when focused. The sage/terracotta colors, existing bookmark actions, and missing-page-count handling are unchanged.

## Admin dashboard
`/admin.html` is an unlinked, noindex report page (users, activity, books, shelves). Access is enforced in Supabase: run [the admin migration](supabase/migrations/20261021190000_admin_dashboard.sql) and [the v2 reports migration](supabase/migrations/20261021200000_admin_dashboard_v2.sql), then grant yourself access in SQL Editor with `insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';`. Non-admins only see "Not found" and the `admin_stats` RPC rejects them. "Active" users are those with a recent `last_sign_in_at`.

### Managing roles and test accounts

Apply [the roles and test-account migration](supabase/migrations/20261101210000_admin_roles_and_test_accounts.sql) after the existing migrations, before deploying. In **Users**, the **Role** selector grants or revokes Admin access independently of membership plans. Changes require confirmation and are enforced by the `admin_set_role` RPC; admins cannot remove their own access. The initial admin still needs the SQL bootstrap above.

**Create test account** creates a real, immediately confirmed password-login account with a unique `support+test-<plan>-<uuid>@librito.casa` alias. No separate mailbox is needed. Create one for each **Free**, **Book Lover**, and **Bookshop Pro** plan; paid-plan features are complimentary grants, not Stripe subscriptions or charges. Accounts start as Readers; the existing admin-only marketplace preview gate still applies even to Bookshop Pro. Names use 1-24 lowercase letters, numbers, or hyphens, and passwords use 12-128 characters plus any additional Supabase project password requirements. Save the generated email and your chosen password; delivery of password-reset emails to `support@librito.casa` depends on your email provider supporting plus-addressing.

The creation confirmation and each marked test-account row offer **Sign in**. Enter the account's password to open the main app as that account, replacing the browser's admin session. Sign out and use your admin credentials to return, or use a separate browser profile for simultaneous sessions. These accounts use ordinary persistent data and billing rules, not a special sandbox; avoid initiating real payments. Remove them through the existing billing-aware **My account → Delete account** flow after testing.

The authenticated, same-origin `POST /api/admin` endpoint requires server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_URL` (the deployment origin), but no Stripe credentials. It verifies the caller's current admin grant, generates the alias itself, and sets the protected Auth `app_metadata.is_test_account` flag; user-editable metadata cannot mark ordinary accounts as test accounts. Profile setup verifies the requested tier and attempts to remove the newly created account if setup fails, reporting incomplete cleanup explicitly. The service-role key and passwords must never be included in public configuration, committed, or logged. The static Python preview cannot execute this endpoint; test creation using a Vercel deployment or a local Vercel function runtime.

## Support, account deletion, and legal readiness

### My account

The Account menu opens a responsive [My account](https://librito.casa/#/account) area with Overview, Account settings, Billing & subscription, and Support & policies. Account settings saves the display name to the authenticated user's profile, shows the sign-in email, and provides sign-in help and the existing permanent-deletion flow. Signing in again preserves saved profile names instead of overwriting them with original signup metadata. Email changes are handled through support; this update does not add unverified email changes or a new password-recovery implementation.

The billing section reuses the existing upgrade page, subscription status, Checkout, Portal and cancel/renew dialogs rather than introducing a second billing implementation. Direct upgrade and Stripe return URLs continue to work. Signed-out visitors see a sign-in invitation rather than private settings. Support links remain public; the policy section explicitly says Terms and Privacy are not yet published and does not expose the drafts. Marketplace orders and shipping addresses are managed separately from My account; marketing preferences are not included.

The top account dropdown contains My account, Membership plans, and Sign out (Sign in when signed out), plus an Admin dashboard shortcut only after admin access is verified. Settings, support and account deletion remain inside My account; authorized administrators can also reach their dashboard from the account overview. The plan page offers Show plans / Hide plans to collapse the price comparison and billing-period selector without hiding subscription-management controls. Plans are initially expanded.

Account navigation uses dark text on the light panels, cream text for the selected section, and distinct hover/keyboard-focus states. Navigation and account-help link colors have regression checks for at least 4.5:1 normal-text contrast.

Public [Contact us](contact.html) and [Billing Support](billing-support.html) pages use **support@librito.casa** for customer help, billing and privacy requests. They are reachable without signing in; the app links to support in the account menu, footer, sign-in dialog and upgrade screen. The approved refund approach is **no routine partial-period or renewal refunds**, with billing errors, exceptional cases and mandatory consumer rights reviewed through support. Do not request passwords, sign-in codes or full payment-card information by email.

### Deploying self-service account deletion

Apply [the account-deletion migration](supabase/migrations/20261025010000_account_deletion.sql) **after** both Stripe billing migrations, then apply the marketplace, pagination, and [marketplace admin launch-gate migrations](supabase/migrations/20261101200000_marketplace_admin_launch_gate.sql), all **before deploying this code**. The account migration adds a persistent deletion barrier and an Auth-to-profile cascading foreign key. The key is initially `NOT VALID` to avoid deleting or failing the upgrade on legacy orphan profiles; it immediately enforces new writes and cascades deletion for existing linked accounts. A privileged operator can audit legacy orphans separately and then validate the constraint. Old JWTs cannot recreate a deleted profile because the Auth user must still exist.

Signed-in users can choose **Account -> Delete account**. The Librito dialog explains permanent library removal, immediate subscription cancellation, forfeiture of remaining access, no automatic refund, and financial/back-up retention. The user must type **DELETE**. This does not replace ordinary period-end subscription cancellation, and the deletion dialog does not waive statutory refund rights.

`POST /api/account` requires a Supabase-verified access token, the application origin, and exact confirmation. It ignores client-supplied account/customer IDs. Under the existing per-user/mode billing lease, it:

1. Refuses sandbox deletion of accounts with live Stripe Customer records.
2. Sets `billing_accounts.deletion_pending`, which survives errors and blocks new Checkout, Portal and subscription mutations. A database mode switch is also blocked until pending deletions finish.
3. Expires all open Checkout Sessions for the account's dedicated Stripe Customer.
4. Immediately cancels all nonterminal subscriptions on that Customer, including paused/incomplete subscriptions and old Price IDs, with `invoice_now=false` and `prorate=false`. It never calls a refund API.
5. Deletes the dedicated Stripe Customer to prevent old portal sessions from opening new subscriptions. Stripe may retain invoices and legally required financial records. Already-processing payments are not guaranteed to be reversed.
6. Checks for live marketplace payment history and refuses deletion until it is resolved; real transaction records must not be erased. Then removes seller-uploaded marketplace photos and private book photos through Supabase Storage. A storage error stops deletion and allows retry; photos already removed are not restored.
7. Removes non-live marketplace orders, listings, and related personal marketplace records, then rechecks lease ownership and permanently deletes the Supabase Auth user. The database cascades the profile, books, shelves, memberships, likes, shelf items, admin grant, and local billing mappings/event ledger.

Stripe, Storage, and Auth deletion are not one transaction. If Stripe fails, the account/library is not removed. If Stripe succeeds but Storage or Auth fails, the account remains marked for deletion and billing may already have stopped. The dialog preserves the error and allows retry; retries recognize an already-deleted Stripe Customer and continue. Do not blindly clear `deletion_pending` or promise that a partially completed deletion restores paid access. Diagnose and finish deletion, or contact the owner about a deliberate recovery plan.

The client only clears the local session, Librito-prefixed browser storage/caches, and redirects to a lasting completion notice after a verified success response. If local cleanup fails, it explicitly asks the user to clear site data. Deletion cannot remotely erase another device's local caches, exports, emails, support correspondence, logs or provider backups.

The server needs Customers read/write/delete, Checkout Sessions read/write, Subscriptions read/write/cancel, and the existing Supabase service-role access. Test permissions in the sandbox; never place server keys in browser configuration. When the production database is live, deletion handles its live Customer; historical sandbox Customers are not real charges and are not accessed with live credentials. Keep separate sandbox projects for ongoing tests.

Never manually delete Auth users as a substitute for the billing-aware endpoint: database cascades cannot call Stripe to stop recurring charges. Do not introduce provider storage uploads without extending deletion to remove owned objects before Auth deletion.

### Unpublished policies and launch blockers

Original [Terms draft](legal-drafts/terms.md) and [Privacy draft](legal-drafts/privacy.md) are **not in force** and are excluded from Vercel uploads/static publishing. Do not enter their paths in Stripe's public legal fields. They contain no personal operator name or invented LLC identity. They are intended for owner and qualified legal review, not as a legal-compliance guarantee.

The proposed age rule is **13+**, with parental/guardian agreement and supervision for under-18 users and parental authorization of paid subscriptions. **It is not yet an implemented age or parental-consent gate.** Finalize actual operator details, jurisdictions served, the signup/recurring-payment consent flows, required privacy disclosures and retention rules before publishing legal pages or opening live payments.

The existing cookie banner's optional functional-storage preference is not consistently enforced by the app's storage/cache code. Resolve that mismatch before claiming consent-controlled optional storage. Identify the support-email provider and verify production analytics/logging settings. Affiliate links are planned, not enabled by this work: disclose commissions clearly near affected recommendations/links and review affiliate tracking/consent before introducing them.

## Account tiers
Plans are **Free**, **Book Lover**, and **Bookshop Pro**, represented by `profiles.tier`. Free includes an unlimited personal library and custom shelves and up to five books marked Currently Reading; marketplace buying and selling are planned for launch. Book Lover adds unlimited current reads, personal library exports/reports, advanced organization and reading/collection insights. Bookshop Pro includes Book Lover and gates professional storefront, inventory and business tools. New paid-plan enrollment is paused by default; existing subscribers and their entitlements are preserved. Marketplace purchase payments and seller payouts are not live.

Existing Book Lover Stripe subscriptions and customer records are retained and mapped to Book Lover; existing complimentary Book Lover grants remain intact. Users cannot change their own tier. Admins can grant or revoke complimentary Book Lover or Bookshop Pro access from `/admin.html`; removing a complimentary grant does not cancel a paid subscription. Marketplace access is admin-only until launch. Apply Supabase migrations in timestamp order. The existing account-tier migrations retain the five-current-read Free limit and built-in Wishlist behavior; `20261101170000_unlimited_free_library` removes historical book and shelf caps. The Stripe billing migration (`20261024250000_stripe_billing.sql`) preserves existing Book Lover accounts, and `20261101180000_membership_marketplace.sql` adds the Bookshop Pro plan and marketplace schema/security.

## Stripe billing

### Integration design

Librito sells digital memberships through Stripe Billing with hosted Checkout, reusing the existing Customer, subscription, webhook, and billing-account records. Configure Book Lover recurring USD Prices at **$2.99/month** and **$24.99/year**, and Bookshop Pro recurring USD Prices at **$19.99/month** or **$199.99/year** (save $39.89 compared with monthly billing). Checkout validates each configured Price against its plan amount and interval. Free requires no Stripe subscription. No Stripe.js or publishable API key is needed for this hosted flow.

The plan page calls authenticated Vercel functions. The server validates the Supabase access token and chooses an allowlisted Price, enforcing mode, USD currency, recurrence interval and the exact Book Lover prices. Bookshop Pro's amount is controlled by its configured Stripe Price. Server-only billing tables map each Supabase user to one Stripe Customer per mode. Per-account leases and mode-specific Stripe idempotency keys prevent concurrent duplicate checkouts; an open Checkout Session is reused or expired when changing plan or interval.

Signed webhooks reconcile current Stripe subscription state rather than trusting redirects or old event payloads. Deliveries are recorded for deduplication, and concurrent updates are serialized. Active, trialing and past-due subscriptions retain access; canceled, unpaid, paused or expired incomplete subscriptions do not. Configure Stripe's retry policy to move exhausted subscriptions to **canceled or unpaid**, not leave them past due forever. Cancellation at period end preserves access until Stripe ends the subscription. Downgrades never delete books or shelves; the Free Currently Reading limit applies when adding reading entries.

The plan page shows the days remaining (rounded up in 24-hour periods) and the exact end or renewal date. Canceled but still-active subscriptions offer **Renew subscription**, with a confirmation before restoring automatic renewal on the same subscription; this does not create a second subscription. Switching between paid tiers must be enabled and reviewed in the existing Stripe Customer Portal; the webhook maps the changed Price to its tier. A Bookshop Pro subscription grants Book Lover entitlements without a second subscription. Resuming requires **Subscriptions: Write** on the restricted Stripe key.

Renewal confirmation uses Librito's existing dialog rather than a native browser prompt. It disables duplicate submissions while saving, keeps failures inside the dialog with retry/cancel options, and only reports success after the server confirms the update. Resume requests clear the subscription's applicable cancellation field, not both cancellation parameters together. Billing logs include a bounded, credential-redacted diagnostic message and Stripe request ID where available; customer responses remain generic for unexpected failures.

The **Your subscription** panel offers **Cancel subscription** directly for renewing active/trialing/past-due plans. The Librito dialog uses **Cancel subscription** / **Keep subscription**, explains when access ends, preserves books/shelves and complimentary grants, and makes clear that cancellation is not a refund or forgiveness of an outstanding balance. The authenticated, account-locked server action schedules cancellation at period end; repeat requests preserve an existing cancellation date. Ended, complimentary-only and already-canceling plans do not offer this action. **Manage billing** remains available for saved payment methods and downloadable invoices. Both cancellation and renewal require Subscriptions write permission. A failure refreshing the UI after a confirmed change is reported separately from the completed billing action.

Successful cancellation opens a lasting **Sorry to see you go** dialog confirming the end date, with an optional **Renew subscription** action that still requires explicit confirmation. Renewing opens a warm success dialog. Successful checkout returns show a **Welcome to Book Lover** dialog listing unlocked features only after the authenticated billing status and profile confirm access, never just from a success URL. A user-scoped pending flag in session storage prevents repeat welcomes on refresh; canceled checkout clears it. These dialogs stay open until dismissed instead of relying on short-lived toasts.

Billing-status requests reconcile directly with Stripe under the same account lock as webhooks, so refreshing also repairs stale cancellation flags from missed or older webhook deliveries. If Stripe cannot be reached, the page shows a retry error instead of presenting cached renewal information as current. Webhooks are still required for updates while the user is away.

Concurrent billing requests and webhooks briefly retry account-lock acquisition (250ms, 500ms, 1s, 2s) instead of immediately failing while another request saves the subscription. Only lock acquisition is retried, never Stripe mutations or failed database writes. If contention persists, the endpoint returns HTTP 409 with `Retry-After: 2` and logs a warning; webhook responses remain non-2xx so Stripe retries delivery. Other failures remain errors.

In-app banners remind signed-in readers when canceled access ends or automatic renewal approaches, within 30 days, 7 days, and 1 day. They also cover trial endings and direct past-due customers to update payment details. Dismissing a banner hides that milestone for the current browser session; the next milestone, changed end date, or changed cancellation state gets a new reminder. Status is checked on library load, focus, and while the visible app is open (at most every five minutes). No email, push notification, scheduled job, or reminder delivery while the app is closed is included. Complimentary-only accounts have no expiry reminder.

### Sandbox setup

1. In Stripe Dashboard, create a separate **sandbox** for development. Keep production and CI credentials/data separate. No live Stripe resources have been created by this setup.
2. Apply all Supabase migrations in timestamp order, preferably in a development project first. Confirm the Stripe billing migration (`20261024250000_stripe_billing.sql`), billing-mode migration (`20261024260000_stripe_billing_modes.sql`), account-deletion migration (`20261025010000_account_deletion.sql`), membership and marketplace migration (`20261101180000_membership_marketplace.sql`), marketplace pagination migration (`20261101190000_marketplace_search_pagination.sql`), and marketplace admin launch-gate migration (`20261101200000_marketplace_admin_launch_gate.sql`) are applied. The database initially accepts sandbox billing only.
3. In the sandbox, create a Book Lover Product with monthly and annual Prices at $2.99 and $24.99, and a separate Bookshop Pro Product with monthly and annual Prices at $19.99 and $199.99 (quantity one, interval count one). Copy their `price_...` IDs. Treat these Price IDs as stable; adding replacement Prices requires planning how existing subscriptions will remain entitled.
4. Set server environment variables using [.env.example](.env.example) as a list of names:
   - `APP_URL`: the exact application origin, such as `https://librito.casa` or `http://localhost:3000`. HTTPS is required except on localhost.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: match the project used by the browser's `config.js`. The service-role key must never enter browser configuration.
   - `STRIPE_SECRET_KEY`: prefer a sandbox **restricted API key** with only the permissions needed to read/write Customers, Checkout Sessions and Subscriptions, read Prices and Charges, and create Customer Portal sessions. Subscriptions write access is required to resume renewal. Adjust permissions if Stripe reports an authorization error.
   - `STRIPE_MODE`: `test` for a sandbox, `live` for real payments. Required; must match the API key prefix and the database billing environment.
   - `STRIPE_PRICE_BOOK_LOVER_MONTHLY` and `STRIPE_PRICE_BOOK_LOVER_ANNUAL`: Book Lover sandbox Price IDs. The legacy `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_ANNUAL` names remain supported.
   - `STRIPE_PRICE_BOOKSHOP_PRO_MONTHLY` and `STRIPE_PRICE_BOOKSHOP_PRO_ANNUAL`: Bookshop Pro sandbox Price IDs. Do not configure them until its customer-portal switching behavior is reviewed.
   - `MEMBERSHIP_PLANS_AVAILABLE`: defaults to `false`; leave false while new paid-plan signups are coming soon. Existing subscribers can still manage, renew, and cancel their subscriptions. Keep Stripe Customer Portal plan switching disabled while this is false. Set true only when paid-plan enrollment is ready.
   - `STRIPE_WEBHOOK_SECRET`: the endpoint's signing secret, not an API key. For local forwarding, use the signing secret printed by `stripe listen`.
   Store secrets in Vercel's **sensitive environment variables**. For local development only, use an ignored `.env.local`; never paste keys into chat, commit them, or log them. The deployment only publishes explicitly selected browser assets.
5. Configure the sandbox Customer Portal: allow payment-method updates and cancellation **at period end**. If enabling plan switching, allow only reviewed Book Lover and Bookshop Pro Prices, and explicitly review proration and change timing. Switching uses the existing Stripe Customer and subscription through the portal; Bookshop Pro includes Book Lover entitlements and does not create a second subscription. Configure Billing payment retries and customer emails.
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
8. Open the plans page while signed in. Checkout returns to that page without granting access; billing status refreshes automatically every 10 seconds while the page is visible. **Manage billing** remains available for existing Stripe Customers, even after paid access ends.

### Marketplace payment safety

The membership Stripe Billing integration is not a marketplace payment integration. Marketplace listings, seller-uploaded photos, messaging, wishlist alerts, and test-only order records use the existing Supabase project and its row-level security. Marketplace discovery searches on the server and returns 24 listings per page. The marketplace is currently coming soon for the public; the app and database restrict marketplace access to verified admin accounts until launch. Premium plan enrollment is also coming soon by default; existing subscribers retain their entitlements and can still manage billing.

Marketplace live charges, Connect account onboarding, transfers, and payouts are intentionally not implemented or enabled. Before adding them, approve the Connect charge model, platform liability for fees/refunds/disputes, negative-balance exposure, transfer recovery, seller identity verification, and support operations. Do not treat the Book Lover Stripe Customer or subscription as a seller payout account.

For isolated UI/order-flow testing only, enable mock checkout in a non-production database:

```sql
update public.marketplace_settings
set deployment_environment = 'test', mock_payments_enabled = true
where id;
```

Mock orders are labeled as simulations, do not charge a payment method, and do not create real shipments. Keep `live_payments_enabled` false. Every plan initially pays the same configurable marketplace commission (default 5% of book price only; shipping excluded). The seller estimate separately accounts for estimated processing on the order amount; any future real integration must reconcile actual processing fees from Stripe balance transactions before reporting proceeds.

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
