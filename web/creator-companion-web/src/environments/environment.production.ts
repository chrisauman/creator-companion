export const environment = {
  production: true,
  // Relative URL — all API calls go through the SAME origin as the
  // SPA (app.creatorcompanionapp.com) and are then proxied to the
  // Railway API by a Vercel rewrite (see web/.../vercel.json).
  //
  // Why a proxy instead of calling Railway directly:
  //   1. The custom api.creatorcompanionapp.com hostname's SSL cert
  //      was misconfigured on Railway (served CN=*.up.railway.app
  //      instead of *.creatorcompanionapp.com) — mobile Chrome
  //      refused the cross-origin connection with a cert mismatch.
  //   2. Even with a valid cert, mobile Chrome's tracking protection
  //      blocks cross-origin cookies (the HttpOnly refresh cookie
  //      was being rejected as third-party on reload, silently
  //      logging users out within 10 seconds).
  //
  // Proxying both fixes: the browser only ever talks to
  // app.creatorcompanionapp.com (valid Vercel cert, same-origin
  // cookies). The Railway upstream is hidden behind Vercel's edge.
  apiBaseUrl: '/v1',
  // Cloudflare Turnstile site key — public, embedded in HTML on
  // every auth surface (login, register, forgot-password). The
  // matching secret key lives in Railway env var Turnstile__SecretKey
  // and is read server-side by ITurnstileVerifier.
  turnstileSiteKey: '0x4AAAAAADW2dlAs0vEOFM1i',
  // Sentry DSN injected at build time from the SENTRY_DSN env var by
  // scripts/inject-version.mjs. Sentile sentinel `__SENTRY_DSN__`
  // is text-replaced before Vercel deploys the bundle. SDK no-ops if
  // empty so the app still ships when the env var is missing.
  sentryDsn: '__SENTRY_DSN__',
  // Release SHA injected alongside sentryDsn — same script, same pass.
  // Tags every Sentry event with the release that produced it so you
  // can see "this error started in commit abc123" instead of just
  // "this error exists."
  releaseSha: '__RELEASE_SHA__'
};
