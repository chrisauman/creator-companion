export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:5254/v1',
  // Sentry DSN — leave empty in dev so we don't pollute the Sentry
  // project with noise from every hot-reload error. Set to a real
  // DSN here only when actively testing the Sentry integration
  // locally. Production reads from environment.production.ts where
  // the DSN is set at build time.
  sentryDsn: '',
  // SHA injected by scripts/inject-version.mjs at build time so each
  // Sentry event is tagged with the release that produced it. In dev
  // this is left blank; Sentry falls back to its own auto-detection.
  releaseSha: ''
};
