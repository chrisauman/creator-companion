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
      // On 401, try to get a new access token via the HttpOnly refresh cookie
      if (err.status === 401) {
        return auth.refreshToken().pipe(
          switchMap(() => {
            const newToken = tokens.getAccessToken();
            const retried  = req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
            return next(retried);
          }),
          catchError(refreshErr => {
            // Only force a full logout when the server definitively rejects the
            // refresh token. 5xx / network errors mean Railway is cold-starting —
            // don't log the user out just because the API is momentarily down.
            if (refreshErr?.status === 401 || refreshErr?.status === 403) {
              auth.logout();
            }
            return throwError(() => refreshErr);
          })
        );
      }
      return throwError(() => err);
    })
  );
};
