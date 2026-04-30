import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenService } from '../services/token.service';
import { AuthService } from '../services/auth.service';
import { catchError, map, of, switchMap, take } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const auth   = inject(AuthService);
  const router = inject(Router);

  // Access token is valid in memory — let through
  if (tokens.hasTokens()) {
    if (auth.user()) return true;
    return auth.loadUser().pipe(
      map(() => true),
      catchError(() => { router.navigate(['/login']); return of(false); })
    );
  }

  // No access token (e.g. page refresh) — try to restore session from HttpOnly cookie
  return auth.refreshToken().pipe(
    switchMap(() => auth.loadUser()),
    map(() => true),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    })
  );
};

export const adminGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (tokens.hasTokens()) {
    if (!tokens.isAdmin()) { router.navigate(['/dashboard']); return false; }
    return true;
  }

  // Try cookie restore for admin routes too
  return auth.refreshToken().pipe(
    map(() => {
      if (!tokens.isAdmin()) { router.navigate(['/dashboard']); return false; }
      return true;
    }),
    catchError(() => { router.navigate(['/login']); return of(false); })
  );
};

export const publicGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (tokens.hasTokens()) {
    router.navigate(['/dashboard']);
    return false;
  }

  // Show the login page immediately — don't block on a cold API round-trip.
  // Fire the refresh check in the background; if the cookie is still valid
  // the user will be silently redirected to the dashboard once it resolves.
  auth.refreshToken().subscribe({
    next:  () => router.navigate(['/dashboard']),
    error: () => {} // no valid cookie — user stays on the login page
  });

  return true;
};
