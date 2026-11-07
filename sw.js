const CACHE_NAME = "librito-cache-v109";
const IMAGE_CACHE = "librito-covers-v1";
const IMAGE_CACHE_LIMIT = 400;
const ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/lib/search-language.js", "/lib/language-detector.js", "/lib/book-photos.js", "/lib/book-purchases.js", "/lib/marketplace-photos.js", "/lib/image-validation.js", "/translations.js", "/cookie-consent.js", "/manifest.webmanifest", "/assets/DancingScript.ttf", "/assets/CormorantGaramond-Semibold.ttf", "/assets/Elegant%20Botanical%20Green%20Bookmark.png", "/assets/Librito%20Digital%20Home%20Library%20Logo.png", "/assets/Ornate%20Golden%20X%20Medallion.png", ...Array.from({ length: 6 }, (_, index) => `/assets/divider-botanical-${index + 1}.png`)];
ASSETS.push("/lib/book-ordering.js");
ASSETS.push("/lib/marketplace-ui.js", "/lib/entitlements.js", "/lib/csv.js");

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== IMAGE_CACHE && key !== "librito-search-v1").map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

async function trimCache(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - IMAGE_CACHE_LIMIT)).map((key) => cache.delete(key)));
}

// Cache-first for images.
async function handleImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  // A CORS fetch exposes the status so failed lookups (404 covers) are never cached.
  try {
    const response = await fetch(request.url, { mode: "cors", credentials: "omit" });
    if (response.ok) {
      await cache.put(request, response.clone());
      trimCache(cache);
    }
    return response;
  } catch {
    return fetch(request);
  }
}

self.addEventListener("fetch", (event) => {
  // Private photos must never enter the shared, persistent cover cache.
  if (new URL(event.request.url).pathname.includes("/storage/v1/")) return;
  if (event.request.method === "GET" && event.request.destination === "image") {
    event.respondWith(handleImage(event.request).catch(() => caches.match(event.request).then((r) => r || Response.error())));
    return;
  }
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin || !ASSETS.includes(requestUrl.pathname)) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
