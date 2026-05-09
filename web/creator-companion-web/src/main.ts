import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

/**
 * Register the service worker on app boot. The SW handles two things:
 *   1. Cache-first delivery of JS / CSS / fonts / images, so repeat
 *      launches don't re-download ~100 kB of bundles. This is the
 *      reason the PWA was taking 10+ seconds to render the login
 *      screen on mobile — without a registered SW, nothing was cached.
 *   2. Web Push notification handling (delivery + click routing).
 *
 * Previously the SW was only registered when the user enabled push
 * notifications, which meant most users never got the perf benefit.
 * Registering eagerly here is safe — `sw.js` is served with
 * Cache-Control: no-cache so deploys roll out reliably.
 *
 * Wrapped in a load-event listener so SW registration doesn't compete
 * with the initial bundle download for network bandwidth.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}
