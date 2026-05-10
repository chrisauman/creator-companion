// Creator Companion Service Worker — push delivery only.
//
// History: an earlier version cached responses and a slow iOS PWA
// launch was traced (with the kill-switch SW that immediately
// unregistered) NOT to the cache layer but to iOS WebKit standalone
// process startup. This SW deliberately keeps zero fetch interception
// — it passes through to network exactly as if there were no SW —
// so we don't reintroduce any of the suspected pain points. Its only
// job is to wake up on push events and surface a system notification.
//
// Bump SW_VERSION when this file changes so older clients pick up
// the new registration on first navigation.
const SW_VERSION = 'cc-sw-v2-push-only';

self.addEventListener('install', () => {
  // Activate immediately on first install / version bump so push
  // delivery doesn't wait for a tab close-and-reopen cycle.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Drop any caches a previous SW version may have created. We don't
  // create caches in this version, but a user upgrading from an older
  // SW could still have them sitting around taking up disk.
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// No fetch handler — every request goes to the network unchanged.
// Adding one here was a suspected (later disproven) cause of slow
// iOS PWA launch; keep the path empty until there's a real need.

// ── Push handler ────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'Creator Companion', body: event.data.text() }; }

  const title = payload.title || 'Creator Companion';
  const body  = payload.body  || '';

  // Filenames are icon-NNNxNNN.png (NOT icon-NNN.png) — CLAUDE.md
  // gotcha. The 192/512 sizes are the ones Chrome/Edge use for the
  // notification tray; Safari ignores icon for native rendering
  // (install as PWA to get the app icon).
  const options = {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'creator-companion',  // collapses bursts into a single notification
    renotify: false,
    data: {
      // Used by notificationclick to open the right view. Default to
      // dashboard; server can override per-event by including `url`
      // in the JSON payload.
      url: payload.url || '/dashboard'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ──────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    // If a tab is already open, focus it and navigate there.
    for (const client of clientList) {
      // Use string Contains so we focus whichever existing tab is on
      // the same origin, regardless of which path they're on.
      if (client.url && 'focus' in client) {
        try {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(target); } catch { /* cross-origin nav block */ }
          }
          return;
        } catch { /* fall through to open a new window */ }
      }
    }

    // No open tab — open one.
    if (self.clients.openWindow) {
      await self.clients.openWindow(target);
    }
  })());
});

// Optional: respect explicit "clear my badges" sync messages from
// the app. The client posts { type: 'clear-notifications' } and we
// dismiss any pending Creator Companion notifications.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'clear-notifications') {
    self.registration.getNotifications({ tag: 'creator-companion' })
      .then(list => list.forEach(n => n.close()));
  }
});
