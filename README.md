# Librito

Librito is a cozy, mobile-first library platform concept for scanning books, organizing them into shelves, and tracking spending. It is intentionally simple as a website so it can run on phones without app-store packaging.

## What is included
- Mobile-first layout with cozy, bookish styling
- Local demo library with mock data
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
2. Open SQL Editor and run the script in [supabase/schema.sql](supabase/schema.sql).
3. In the app, replace the placeholder local storage logic with Supabase calls later.

## Vercel deployment
1. Push this repository to GitHub.
2. Import it into Vercel.
3. Set the project root to the repository root.
4. Vercel will serve the static files automatically.

## Scanner notes
- On many phones, the camera scanner works best in Chrome or Edge.
- The browser must allow camera access.
- If the browser does not support BarcodeDetector, the flow falls back to manual ISBN entry.
