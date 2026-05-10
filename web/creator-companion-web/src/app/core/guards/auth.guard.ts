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

  // ── 2. Optimistic auth — cached user exists in localStorage ─────────
  // Show the route immediately and refresh in the background. The
  // refresh-token cookie is HttpOnly so we can't observe it from JS;
  // the presence of a cached user is our proxy for "had a session,
  // try the cookie." If the refresh returns a definitive 401 the user
  // is logged out then.
  const cachedUser = tokens.getCachedUser();

  if (cachedUser) {
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

  // ── 3. No cache — redirect to login immediately. Don't block on a
  //       refreshToken round-trip; the API may be cold-starting (Railway
  //       sleeps when idle) and that 10+ s wait was making the PWA feel
  //       broken on mobile launches from the home screen.
  //
  //       The login page's publicGuard tries refreshToken() in the
  //       background and will silently bounce the user to /dashboard
  //       if the HttpOnly refresh cookie turns out to be valid — so
  //       this isn't a regression for users with valid sessions, just
  //       a UI re-arrange (login flashes briefly then redirects).
  router.navigate(['/login']);
  return of(false);
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

  // If the user just clicked Logout, the HttpOnly refresh-token cookie may
  // still be valid until the server-side revoke completes. Skip the silent
  // refresh attempt for this page load so logout sticks on the first click.
  // (Flag is read once and cleared — subsequent visits to /login restore
  // the optimistic-restore behaviour.)
  if (AuthService.consumeJustLoggedOut()) return true;

  // Show the login page immediately — don't block on a cold API round-trip.
  // Fire the refresh check in the background; if the cookie is still valid
  // the user will be silently redirected to the dashboard once it resolves.
  auth.refreshToken().subscribe({
    next:  () => router.navigate(['/dashboard']),
    error: () => {} // no valid cookie — user stays on the login page
  });

  return true;
};
