// Creator Companion Service Worker
// Handles Web Push notifications + fast PWA loads via cached HTML.

const OFFLINE_PAGE = '/offline.html';
const NAV_CACHE    = 'cc-nav-v1';     // app-shell HTML responses
const OFFLINE_CACHE = 'cc-offline-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then(cache => cache.add(OFFLINE_PAGE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Clean old cache versions if we ever bump them.
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => k !== NAV_CACHE && k !== OFFLINE_CACHE)
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for navigation requests (the HTML shell). The
// previous network-first strategy meant every PWA launch waited on a
// full round-trip before the shell rendered — on iOS Safari with a
// cold edge that's the difference between "instant" and "10+ seconds
// of blank screen". Now the cached HTML serves immediately and we
// refresh it in the background for the next launch.
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;

  event.respondWith((async () => {
    const cache  = await caches.open(NAV_CACHE);
    const cached = await cache.match(event.request);

    // Always kick off a background refresh so the next launch gets
    // the latest deploy. Failures (offline) are silently ignored.
    const networkPromise = fetch(event.request)
      .then(res => {
        // Only cache successful, basic-type (same-origin) HTML.
        if (res && res.ok && res.type === 'basic') {
          cache.put(event.request, res.clone()).catch(() => {});
        }
        return res;
      })
      .catch(() => null);

    if (cached) return cached;

    // First-ever launch (no cache yet): wait on network. If the
    // network fails too, fall back to the offline page.
    const fresh = await networkPromise;
    return fresh || (await caches.match(OFFLINE_PAGE));
  })());
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
