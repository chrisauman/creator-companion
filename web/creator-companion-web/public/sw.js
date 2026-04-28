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
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(clients.openWindow(url));
});
