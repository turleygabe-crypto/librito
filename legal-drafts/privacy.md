# Librito Privacy Policy - UNPUBLISHED DRAFT

**Not in force. Do not publish or link from Stripe or the app yet.** Prepared October 25, 2026 for owner and qualified legal review. This draft describes the inspected application and owner-provided practices, not a legal-compliance certification.

## Publication blockers

- Identify the actual operator/data controller, effective date, applicable jurisdictions, required contact/address details, lawful bases where relevant, and any required international-transfer information.
- Verify Supabase and Vercel deployment regions, processor terms, actual log/back-up retention, and the support-email provider and retention process.
- Review all production scripts and providers, including any enabled Vercel analytics, third-party SDKs, browser storage and affiliate integrations.
- The existing cookie banner offers functional-storage preferences, but the inspected application does not consistently enforce those choices. Resolve this before describing optional storage as consent-controlled or relying on the banner for compliance.
- Choose and implement the age/parental-agreement approach. Terms alone do not establish parental agreement or authorize processing children's data.
- Define a retention schedule and a tested process for requests, identity verification, deletion, exceptions, and legally required response periods.

The sections below are proposed content only.

## 1. Who is responsible

Librito is a home-library application. The actual responsible legal operator will be identified before this Policy is published; an unformed LLC must not be listed as the operator.

Privacy questions and requests: support@librito.casa.

## 2. Information processed

- **Account information:** account identifier, email, display name and authentication information. Supabase manages authentication; if you use Google sign-in, the service receives the account/profile information made available through that sign-in. Librito does not need access to your Google inbox.
- **Library information:** books, editions/ISBNs, shelves, liked books, wishlist entries, notes, reading progress, dates and purchase prices you choose to record.
- **Billing information:** Stripe customer/subscription identifiers, selected plan, status, access/end dates and billing-event references. Stripe processes payment details. Librito does not receive or store full card numbers or security codes.
- **Technical information:** hosting and service providers may process IP addresses, browser/device information, timestamps, request/error logs and security data. Administrative reports include account activity, counts and plan information.
- **Support information:** your email address and the messages or attachments you send to support.
- **Browser information:** sign-in sessions, local/demo library data, preferences, catalog/book metadata, cached covers, and temporary billing/reminder state stored on your device.

Library choices and notes may reveal sensitive interests even though the service concerns books. Avoid putting information into notes or support messages that you do not want processed by the service.

## 3. How information is used

We use information to create and authenticate accounts, save and display libraries, provide book search and recommendations, manage subscriptions, respond to support/privacy requests, prevent abuse, diagnose problems and meet applicable legal obligations.

Recommendations may be informed by titles, authors or other library/catalog information. Search terms, ISBNs, and related book queries can be sent to catalog providers; do not describe the entire library as staying only on the device.

## 4. Providers and external links

- **Supabase:** authentication and hosted account/library/billing data.
- **Vercel:** hosting, server functions and related operational/security logs.
- **Stripe:** Checkout, recurring billing, payment processing, invoices and the Customer Portal. Stripe may retain financial records and process information for its own legal and fraud-prevention purposes.
- **Google:** optional Google sign-in, Google Books metadata/search/pricing, and Google services reached through external links.
- **Open Library:** catalog queries, editions, ratings and cover images. Some lookups are made by the browser and some through Librito's server.
- **Apple:** book/audio catalog lookups where those features are used.
- **jsDelivr:** delivery of the Supabase browser SDK.
- **Support email provider:** identify the actual provider and its processing/retention terms before publication.

Requests to external services may disclose IP address, request terms and other normal request metadata. Linked retailers and other external sites process information under their own policies; Librito does not control their checkouts.

The owner reports no current marketing-email program, advertising program, or sale/sharing of personal information for targeted advertising. Verify production settings before publication. This draft does not promise that no provider ever collects technical data.

Affiliate links are planned but are not represented as active. Before adding them, review what identifiers/cookies the program uses, update disclosures and any required consent, and clearly disclose the commission relationship near affected links. Do not silently convert this draft's future plans into claims about current tracking.

## 5. Cookies and similar storage

Librito uses browser storage for sign-in, security, local/demo libraries, preferences and caches. A service worker caches application files and covers for performance. Third-party services may use their own cookies or similar technologies under their own policies.

Browser settings can clear or restrict site storage, which may sign you out, remove local-only information or affect functionality. The current implementation's functional-consent controls require review and correction before promising that selecting a category prevents all corresponding storage. The published policy and controls must accurately match the deployed implementation.

## 6. Retention and deletion

Active account/library information is retained to provide the service until deleted or otherwise no longer needed for a stated purpose. A final policy must specify the retention periods or meaningful criteria for each category, including logs, support records and backups.

Self-service account deletion cancels current-environment billing before removing the active Librito account/profile and associated library data. It also deletes the dedicated Stripe Customer; Stripe may retain invoices and other financial records under its retention rules. This does not promise cancellation of an already-processing payment or automatic refunds.

Deletion clears Librito browser data on the device where the process finishes, when browser access permits. It cannot remotely erase files you exported, other browsers' local caches, emails you received, or copies kept by independent retailers. Backups, security logs and records needed for legal/accounting/dispute purposes may persist under documented retention rules.

Contact support if deletion fails or if you cannot access your account. If billing cancellation succeeds but account deletion fails, new billing is blocked while deletion is retried or support assists.

## 7. Choices and requests

You can edit library information in the app, manage subscriptions through the plan page and Stripe portal, and permanently delete your account using Delete account.

Email support@librito.casa for access, correction, export, deletion or other privacy requests. Do not email passwords, sign-in codes or payment-card details. We may verify identity and account ownership and apply lawful exceptions. Available rights and required response periods depend on applicable law; the published policy must reflect the places actually served.

Paid CSV/print inventory reports are a convenience feature, not a substitute for responding to a legally required personal-data access/export request. Such requests can be submitted through support regardless of subscription tier.

## 8. Children and teenagers

The proposed service is for people aged 13 or older. Users under 18 must have a parent/legal guardian review and agree to the Terms, supervise use, and authorize paid subscriptions. This proposed wording is not a parental-consent verification mechanism.

Librito is not intended for children under 13. If you believe a child under 13 provided personal information, contact support so we can investigate and take appropriate steps. Confirm the age-screening, notice, handling and deletion procedures with legal counsel before publication.

## 9. Security, locations and changes

We use service-provider authentication, access controls and other reasonable safeguards, but cannot guarantee absolute security. Do not share credentials or send sensitive secrets through support.

Providers may process information in countries other than yours. Confirm processing locations and any required transfer mechanisms before publishing jurisdiction-specific claims.

A published version should state its effective date, remain accessible without signing in, and explain how material changes will be communicated.
