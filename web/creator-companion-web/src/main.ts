import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// ── Sentry init (MUST run before bootstrapApplication) ───────────
// SDK gracefully no-ops when `sentryDsn` is empty, so dev builds
// (where the sentinel sits unreplaced or env var is unset) simply
// skip reporting. Production builds get the DSN injected by
// scripts/inject-version.mjs at deploy time.
//
// What we configure:
//  - tracesSampleRate 0.1 — 10% of page loads get performance traces.
//    Higher would burn through the free tier; lower would miss
//    enough samples to surface real perf regressions.
//  - Session Replay is intentionally OFF. For a journaling app, a
//    full DOM recording of the user's session would capture the
//    text they were typing. Privacy trumps the debugging utility.
//    If we ever turn this on, it MUST be paired with `maskAllText`
//    and `blockAllMedia` and even then I'd want to think hard.
//  - beforeSend/beforeBreadcrumb scrub sensitive request data so
//    entry content and auth headers don't ride along with errors.
if (environment.sentryDsn && environment.sentryDsn !== '__SENTRY_DSN__') {
  Sentry.init({
    dsn:         environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    release:     environment.releaseSha && environment.releaseSha !== '__RELEASE_SHA__'
                   ? environment.releaseSha
                   : undefined,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,

    beforeSend(event) {
      try {
        // Strip auth headers if Sentry somehow attached them. The
        // SDK doesn't normally capture request headers but better
        // safe than sorry — a stolen JWT in a Sentry event is a
        // credential leak waiting to happen.
        if (event.request?.headers) {
          const h = event.request.headers as Record<string, unknown>;
          delete h['Authorization']; delete h['authorization'];
          delete h['Cookie'];        delete h['cookie'];
        }
      } catch { /* never break event delivery on a scrub error */ }
      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      try {
        // XHR/fetch breadcrumbs include the URL + status code. We
        // want those for context but NOT the request body, which on
        // entry/draft/journal POST/PUT contains user-authored text.
        if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
          const url = String(breadcrumb.data?.['url'] ?? '');
          if (/\/v1\/(entries|drafts|journals|auth|users\/me|admin\/email-templates)/i.test(url)) {
            if (breadcrumb.data) {
              delete breadcrumb.data['body'];
              delete breadcrumb.data['response_body_size'];
            }
          }
        }
      } catch { /* swallow */ }
      return breadcrumb;
    }
  });
}

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
