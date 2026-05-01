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
      if (err.status !== 401) return throwError(() => err);

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
