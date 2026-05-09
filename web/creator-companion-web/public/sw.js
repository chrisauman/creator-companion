// Creator Companion Service Worker — KILL SWITCH MODE
//
// We've been chasing a slow PWA launch ("10 seconds white screen"
// after icon tap, fine in Chrome browser). After ruling out Beasties
// inlining + Angular's NgSw + cache headers, the remaining suspect
// is OUR own SW interfering with the iOS standalone PWA load. To
// definitively diagnose, this version of sw.js does nothing except
// remove itself: on activate it unregisters the SW and tells all
// clients to reload, dropping us to a no-SW state. If the user's
// PWA still loads slowly after this, the bottleneck is iOS WebKit
// standalone process startup or the network — not the SW. If it
// loads fast, we know to redesign the SW more carefully.
//
// Push notifications stop working in this kill-switch state. We can
// reintroduce a proper SW once we've isolated the slowness cause.

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Drop every cache we may have created across versions.
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    // Unregister this SW so future page loads have no SW at all.
    await self.registration.unregister();
    // Tell every open client to reload, so they drop their SW
    // controller reference and pick up the un-registered state.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch { /* iOS may block navigate */ }
    }
  })());
});

// No fetch handler — pass-through to network, exactly as if no SW
// were installed. Same for push: if the SW isn't here, no push.
