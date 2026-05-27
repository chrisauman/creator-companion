import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { TokenService } from '../services/token.service';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const tokens = inject(TokenService);
  const auth   = inject(AuthService);

  const token   = tokens.getAccessToken();
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // 402 Payment Required. Two distinct flavours, both surfaced by
      // the global takeover signals in AuthService — we just need to
      // refresh capabilities so the correct overlay renders.
      //
      // - code: "trial_expired"     → showPaywall takes over (existing)
      // - code: "email_unverified"  → showVerifyEmail takes over (Risk #6)
      //
      // We don't transform the response — the caller still sees the
      // 402 and can show a local error toast if appropriate; the
      // global takeover covers the long-term path. The code dispatch
      // is implicit in capabilities (hasAccess vs emailVerified), so
      // both 402 flavours flow through the same invalidate+refetch.
      if (err.status === 402) {
        auth.invalidateCapabilities();
        auth.loadCapabilities().subscribe({ error: () => {} });
        return throwError(() => err);
      }

      if (err.status !== 401) return throwError(() => err);

      // ── Auth-endpoint passthrough ─────────────────────────────────────────
      // 401 on the auth endpoints themselves (login, register, refresh,
      // password-reset) means "those credentials are wrong" — NOT "your
      // session expired." Trying to refresh against the same endpoint that
      // just rejected you produces a cascading failure that surfaces in
      // the login form as "Couldn't reach the server" (because the refresh
      // error overrides the original 401 by the time it reaches the
      // component). Pass the 401 through unchanged so login/register
      // forms can show their real "Email or password is incorrect" message.
      const url = req.url.toLowerCase();
      const isAuthEndpoint =
        url.includes('/auth/login')           ||
        url.includes('/auth/register')        ||
        url.includes('/auth/refresh')         ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/reset-password')  ||
        url.includes('/auth/verify-email');
      if (isAuthEndpoint) return throwError(() => err);

      // ── Race-condition guard ──────────────────────────────────────────────
      // The auth guard fires a background refresh on page load. By the time a
      // 401 bounces back from the API, that refresh may have already completed
      // and placed a fresh token in memory. If so, skip the refresh entirely
      // and just retry the original request with the token we already have.
      const freshToken = tokens.getAccessToken();
      if (freshToken && !tokens.isAccessTokenExpired()) {
        const retried = req.clone({ setHeaders: { Authorization: `Bearer ${freshToken}` } });
        return next(retried);
      }

      // ── Normal 401 refresh path ───────────────────────────────────────────
      // refreshToken() deduplicates concurrent calls via shareReplay, so if
      // the guard's refresh is still in-flight this subscribes to the same
      // Observable instead of issuing a second HTTP request.
      return auth.refreshToken().pipe(
        switchMap(() => {
          const newToken = tokens.getAccessToken();
          const retried  = req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
          return next(retried);
        }),
        catchError(refreshErr => {
          // Only force a full logout on a definitive auth rejection.
          // 5xx / network errors = Railway cold-starting; keep the session.
          if (refreshErr?.status === 401 || refreshErr?.status === 403) {
            auth.logout();
          }
          return throwError(() => refreshErr);
        })
      );
    })
  );
};
