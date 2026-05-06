// Creator Companion Service Worker
// Handles Web Push notifications and offline fallback.

const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('cc-offline-v1').then(cache => cache.add(OFFLINE_PAGE))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_PAGE))
  );
});

self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'Creator Companion', body: event.data.text() }; }

  const title   = data.title ?? 'Creator Companion';
  const options = {
    body: data.body ?? "Remember to log an entry to keep your streak alive.",
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
