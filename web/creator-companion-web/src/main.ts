import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

/**
 * Service worker registration is intentionally disabled while we
 * diagnose a 10-second slow launch on the iOS standalone PWA. The
 * sw.js file currently in production is a kill-switch that
 * unregisters itself + clears caches on activate; not registering
 * here means clean PWA state with zero SW interference. If the
 * slow launch persists with NO SW, the bottleneck is iOS WebKit
 * standalone process / network — not anything we control.
 *
 * Once we identify the actual cause, we can reintroduce a SW for
 * web-push delivery + asset caching with confidence.
 */
