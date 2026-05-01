import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TokenService } from '../services/token.service';
import { AuthService } from '../services/auth.service';
import { catchError, map, of, switchMap } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const auth   = inject(AuthService);
  const router = inject(Router);

  // ── 1. Valid access token in memory — let through immediately ──────────
  if (tokens.hasTokens()) {
    if (auth.user()) return true;
    return auth.loadUser().pipe(
      map(() => true),
      catchError(() => { router.navigate(['/login']); return of(false); })
    );
  }

  // ── 2. Optimistic auth — cached session exists in localStorage ─────────
  // Show the route immediately and refresh the token in the background.
  // This prevents a blank screen during Railway cold starts. If the
  // refresh returns a definitive 401 the user is logged out then.
  const cachedUser = tokens.getCachedUser();
  const hasStoredToken = !!tokens.getRefreshToken();

  if (cachedUser && hasStoredToken) {
    // Allow navigation right away
    auth.refreshToken().pipe(
      switchMap(() => auth.loadUser()),
      catchError((err: HttpErrorResponse) => {
        // Only log out on a definitive "not authenticated" response.
        // 5xx / network errors mean the API is temporarily down — keep the
        // cached session so the user isn't logged out unnecessarily.
        if (err?.status === 401 || err?.status === 403) {
          tokens.clear();
          router.navigate(['/login']);
        }
        return of(null);
      })
    ).subscribe();
    return true;
  }

  // ── 3. No cache — full blocking refresh (first-time or cleared storage) ─
  return auth.refreshToken().pipe(
    switchMap(() => auth.loadUser()),
    map(() => true),
    catchError((err: HttpErrorResponse) => {
      // Only send to login on auth failures, not server errors
      if (err?.status !== 0 && err?.status < 500) {
        router.navigate(['/login']);
      } else {
        // Server/network error — send to login but don't clear stored token
        router.navigate(['/login']);
      }
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
