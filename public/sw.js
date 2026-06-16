/**
 * Service Worker for FoodPass PWA
 * - Caches the /scan page and key assets
 * - Returns cached version when offline
 * - Serves app shell from cache first for speed
 */

const CACHE_NAME = 'foodpass-v1';

// Assets to cache immediately on install
const PRECACHE_URLS = [
  '/',
  '/scan',
  '/admin',
];

// ── Install ────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Non-fatal: some resources may not be cacheable at install time
      });
    })
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: Network-first with cache fallback ───────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't intercept API calls (let them fail naturally for offline handling)
  if (url.pathname.startsWith('/api/')) return;

  // Don't intercept non-GET requests
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful GET responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: return from cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Fallback for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/scan');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
