// Creator Companion Service Worker
// Handles Web Push notifications. When Capacitor is added, this file
// is replaced by Capacitor's native push plugin.

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
