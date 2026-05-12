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
  apiBaseUrl: '/v1'
};
