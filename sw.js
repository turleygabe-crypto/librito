const CACHE_NAME = "librito-cache-v19";
const IMAGE_CACHE = "librito-covers-v1";
const IMAGE_CACHE_LIMIT = 400;
const ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/cookie-consent.js", "/manifest.webmanifest"];

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
