# Librito

Librito is a cozy, mobile-first library platform concept for scanning books, organizing them into shelves, and tracking spending. It is intentionally simple as a website so it can run on phones without app-store packaging.

## What is included
- Responsive library dashboard with a cozy banner, warm paper tones, and bookish styling
- Local demo library with mock data
- Books are added to the library by default and can optionally be assigned to user-created shelves
- Currently Reading and Completed Books are dedicated shelves; completed books can be restarted or managed for selling or donating
- Welcome prompt for visitors to sign in or create an account, with the option to continue browsing
- Adding a book starts with a choice to look it up or enter it manually. Lookup supports title and/or author searches, ISBN entry, and camera scanning; title lookup and Discover catalog results default to the browser language and use matching edition titles and covers. Book detail pages let users choose from available editions and covers in that language.
- Camera-based barcode scan attempt on supported mobile browsers
- Supabase-ready SQL schema for books, shelves, and profiles
- Vercel-friendly static deployment structure

## Local preview
Run the site locally:

```bash
python3 -m http.server 3000
```

Then open http://127.0.0.1:3000/.

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
