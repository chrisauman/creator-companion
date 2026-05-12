export const environment = {
  production: true,
  // Use the custom api.creatorcompanionapp.com hostname (Railway's
  // CNAME-mapped custom domain), NOT the default
  // creator-companion-api-production.up.railway.app. Reason: the
  // HttpOnly refresh cookie needs to live on the same eTLD+1 as the
  // SPA (app.creatorcompanionapp.com) so the browser treats it as a
  // first-party cookie. With the Railway default URL the two are on
  // completely different registrable domains and mobile Chrome's
  // tracking-protection logic blocks the cookie as third-party,
  // breaking silent refresh on reload (May 2026 incident).
  apiBaseUrl: 'https://api.creatorcompanionapp.com/v1'
};
