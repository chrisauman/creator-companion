import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// ── Sentry init (MUST run before bootstrapApplication) ───────────
// Activates only when environment.sentryDsn looks like a real DSN
// URL. Two failure modes we're guarding against:
//
//  1. Build-time SENTRY_DSN env var was empty → inject-version.mjs
//     replaces the __SENTRY_DSN__ sentinel with empty string →
//     environment.sentryDsn is "" (falsy) → init skipped.
//  2. inject-version.mjs didn't run at all (local dev, broken
//     pipeline) → environment.sentryDsn is still the literal
//     "__SENTRY_DSN__" → doesn't start with "https://" → init
//     skipped, no crash from passing a bogus DSN to Sentry.
//
// The `startsWith('https://')` check is intentional rather than
// comparing against the sentinel string '__SENTRY_DSN__': the
// inject-version.mjs script does a global replaceAll on that exact
// string in every JS bundle, INCLUDING the conditional. The
// previous version of this code compared sentryDsn against a
// literal '__SENTRY_DSN__' — after replacement, the comparison was
// effectively `dsn !== dsn` → always false → init never ran. The
// minified output was the smoking gun:
//   be.sentryDsn && be.sentryDsn !== "https://...sentry.io/..."
//   && Us({dsn:be.sentryDsn, ...})
// → 0 events ever sent to Sentry.
//
// What we configure:
//  - tracesSampleRate 0.1 — 10% of page loads get performance traces.
//  - Session Replay is intentionally OFF (journaling app, would
//    capture user's writing).
//  - beforeSend/beforeBreadcrumb scrub sensitive request data.
if (environment.sentryDsn && environment.sentryDsn.startsWith('https://')) {
  Sentry.init({
    dsn:         environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    // Release is a commit SHA — alphanumeric, 7+ chars. If the
    // sentinel wasn't replaced (still literal "__RELEASE_SHA__"),
    // it contains underscores so the regex fails and we pass
    // undefined (Sentry auto-detects then).
    release:     /^[a-f0-9]{7,40}$/i.test(environment.releaseSha)
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
