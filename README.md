# Librito

Librito is a cozy, mobile-first library platform concept for scanning books, organizing them into shelves, and tracking spending. It is intentionally simple as a website so it can run on phones without app-store packaging.

## What is included
- Mobile-first layout with cozy, bookish styling
- Local demo library with mock data
- Books are added to the library by default and can optionally be assigned to user-created shelves
- Welcome prompt for visitors to sign in or create an account, with the option to continue browsing
- ISBN lookup using Open Library metadata
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
2. Open SQL Editor and run [supabase/schema.sql](supabase/schema.sql), then [supabase/auth-setup.sql](supabase/auth-setup.sql). The second script creates a profile for each newly registered Supabase user.
3. Set the project's URL and anon key in `config.js`. Users can choose Google or email/password to register or sign in; these are alternative methods, so Google users do not need to provide a separate email/password in Librito. If email confirmation is enabled, email/password users must confirm their email before signing in. Signed-in books and shelves are loaded from Supabase.
4. To enable Google sign-in, create a Google OAuth client and add the callback URL shown under Supabase Authentication > Providers > Google as an authorized redirect URI in Google Cloud. Add the client ID and secret to that Google provider in Supabase, then enable it.
5. In Supabase Authentication > URL Configuration, set the site URL to the deployed app URL and add the deployed URL and local preview URL (for example, `http://localhost:3000/`) to the allowed redirect URLs. The Google button uses the current app URL as its post-login redirect.

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
