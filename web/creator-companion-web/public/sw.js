// Creator Companion Service Worker
// Handles Web Push notifications + fast PWA loads via cache-first
// strategies for HTML, JS, CSS, and font assets.

const OFFLINE_PAGE  = '/offline.html';
const NAV_CACHE     = 'cc-nav-v1';     // app-shell HTML responses
const ASSET_CACHE   = 'cc-assets-v1';  // hashed JS / CSS / fonts
const OFFLINE_CACHE = 'cc-offline-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then(cache => cache.add(OFFLINE_PAGE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Drop any cache that isn't part of the current set so version bumps
  // (cc-nav-v1 → v2 etc.) free their old contents.
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => k !== NAV_CACHE && k !== ASSET_CACHE && k !== OFFLINE_CACHE)
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Only handle same-origin GETs from this scope. POSTs / API calls /
  // cross-origin requests fall through to the network unchanged.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ── 1. Navigation requests → stale-while-revalidate on the HTML ──
  // The previous network-first strategy meant every PWA launch waited
  // on a full round-trip before the shell rendered. Now the cached
  // HTML serves instantly and we refresh it in the background.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache  = await caches.open(NAV_CACHE);
      const cached = await cache.match(req);
      const networkPromise = fetch(req)
        .then(res => {
          if (res && res.ok && res.type === 'basic') {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => null);
      if (cached) return cached;
      const fresh = await networkPromise;
      return fresh || (await caches.match(OFFLINE_PAGE));
    })());
    return;
  }

  // ── 2. Static assets (JS / CSS / fonts / images) → cache-first ──
  // Angular emits content-hashed filenames (chunk-XXXXXXXX.js etc.)
  // so it's safe to keep them forever — a new deploy gets new file
  // names and the cache simply grows. Without this, every PWA launch
  // re-downloads ~100 kB of bundles, which is what was making the
  // login screen take 10 s to appear on mobile.
  const dest = req.destination;
  const isStaticAsset =
    dest === 'script' ||
    dest === 'style'  ||
    dest === 'font'   ||
    dest === 'image'  ||
    /\.(?:js|css|woff2?|ttf|otf|svg|png|jpg|jpeg|webp|ico)$/.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith((async () => {
      const cache  = await caches.open(ASSET_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && fresh.type === 'basic') {
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        // Network failed and nothing in cache — let the browser
        // surface the failure naturally.
        return Response.error();
      }
    })());
    return;
  }

  // ── 3. Everything else (API calls, etc.) → straight to network ──
  // Authenticated API requests change frequently and shouldn't be
  // cached at the SW layer.
});

self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Creator Companion', body: event.data.text() }; }

  const title   = data.title ?? 'Creator Companion';
  const options = {
    body: data.body ?? "Remember to log today's progress to keep your streak alive!",
    // App icon shown next to the notification body. Filenames in
    // /public/icons follow the WIDTHxHEIGHT convention so the path
    // here must match exactly — earlier versions referenced
    // /icons/icon-192.png which 404'd silently and left the
    // notification with no icon at all.
    icon: '/icons/icon-192x192.png',
    // Badge appears in the OS status bar / Android notification
    // tray. A smaller monochrome-friendly file works best — the
    // 96x96 PNG is fine.
    badge: '/icons/icon-96x96.png',
    data: { url: data.url ?? '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(clients.openWindow(url));
});
