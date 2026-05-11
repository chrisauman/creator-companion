import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, tap, catchError, throwError, shareReplay, finalize, timeout } from 'rxjs';
import { ApiService } from './api.service';
import { TokenService } from './token.service';
import { User, AuthResponse, Capabilities } from '../models/models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api    = inject(ApiService);
  private tokens = inject(TokenService);
  private router = inject(Router);

  private _user         = signal<User | null>(null);
  private _capabilities = signal<Capabilities | null>(null);

  // Shared in-flight refresh — any caller that arrives while a refresh is
  // already in progress gets the same Observable instead of firing a second
  // HTTP request. This prevents token-rotation race conditions when the guard
  // and the HTTP interceptor both try to refresh at the same time (e.g. on
  // page reload before the new access token is back in memory).
  private _refresh$: Observable<AuthResponse> | null = null;

  readonly user         = this._user.asReadonly();
  readonly capabilities = this._capabilities.asReadonly();
  readonly isLoggedIn   = computed(() => !!this._user());

  register(firstName: string, lastName: string, email: string, password: string, timeZoneId: string): Observable<AuthResponse> {
    return this.api.register(firstName, lastName, email, password, timeZoneId).pipe(
      tap(res => this.handleAuth(res))
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.api.login(email, password).pipe(
      tap(res => this.handleAuth(res))
    );
  }

  refreshToken(): Observable<AuthResponse> {
    if (this._refresh$) return this._refresh$;

    this._refresh$ = this.api.refresh().pipe(
      timeout(15000), // fail fast if Railway is cold-starting rather than hanging forever
      tap(res => this.handleAuth(res)),
      catchError(err => {
        // Only clear stored tokens on a definitive "not authenticated" response.
        // 5xx / network errors mean the API is temporarily down — keep the
        // cached session so the user isn't logged out unnecessarily on reload.
        if (err?.status === 401 || err?.status === 403) {
          this.tokens.clear();
          this._user.set(null);
        }
        return throwError(() => err);
      }),
      // shareReplay(1) lets late subscribers (e.g. the HTTP interceptor arriving
      // just after the guard's refresh completes) still get the cached result
      // without firing a second HTTP request. We clear _refresh$ after a short
      // delay so any in-flight 401 retries can still join the same observable,
      // but subsequent independent refreshes start fresh.
      shareReplay(1),
      finalize(() => { setTimeout(() => { this._refresh$ = null; }, 5000); })
    );

    return this._refresh$;
  }

  loadCapabilities(): Observable<Capabilities> {
    const cached = this._capabilities();
    if (cached) return of(cached);
    return this.api.getCapabilities().pipe(
      tap(caps => this._capabilities.set(caps))
    );
  }

  invalidateCapabilities(): void {
    this._capabilities.set(null);
  }

  /** Fire-and-forget revoke that survives the imminent navigation.
   *  Falls back to a regular fetch with `keepalive: true` if
   *  sendBeacon isn't available (older browsers). The empty-object
   *  body matches the cookie-only refresh/revoke contract. */
  private beaconRevoke(): void {
    const url = `${environment.apiBaseUrl}/auth/revoke`;
    const blob = new Blob(['{}'], { type: 'application/json' });
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(url, blob);
        return;
      }
    } catch { /* fall through */ }
    // Fallback for environments without sendBeacon — keepalive lets
    // the request continue past unload.
    try {
      fetch(url, {
        method: 'POST',
        credentials: 'include',
        body: '{}',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    } catch { /* swallow — logout should never throw */ }
  }

  /** Sessionstorage key set during logout. The publicGuard reads this on the
   *  next page load and skips its background refresh attempt — otherwise the
   *  HttpOnly refresh-token cookie (still valid until the server-side revoke
   *  completes) would silently log the user back in, requiring a second
   *  logout click. The flag is one-shot — read once, deleted. */
  private static readonly LOGOUT_FLAG = 'cc_just_logged_out';

  /** True if logout was just initiated (this page load). Public guard
   *  consumes the flag once and clears it. */
  static consumeJustLoggedOut(): boolean {
    try {
      const present = sessionStorage.getItem(AuthService.LOGOUT_FLAG) === '1';
      if (present) sessionStorage.removeItem(AuthService.LOGOUT_FLAG);
      return present;
    } catch { return false; }
  }

  logout(): void {
    this.tokens.clear();
    this._user.set(null);
    this._capabilities.set(null);
    // Mark the next page load as a fresh-from-logout transition so the
    // publicGuard skips its silent refresh attempt. Without this flag, the
    // HttpOnly refresh-token cookie (still valid until the server-side
    // revoke completes) would log the user right back in, making logout
    // appear to take two clicks. See publicGuard in auth.guard.ts.
    try { sessionStorage.setItem(AuthService.LOGOUT_FLAG, '1'); } catch {}
    // Use navigator.sendBeacon to guarantee the revoke request actually
    // leaves the browser even though we're about to navigate. A plain
    // fetch/XHR may be aborted by the unload — Railway cold-start
    // delays then leave the server-side refresh-token cookie valid
    // even after the user "logged out", which was the original
    // motivation for the cookie-revoke-on-unload pattern. sendBeacon
    // is fire-and-forget but the browser commits to delivering it.
    this.beaconRevoke();
    window.location.replace('/login');
  }

  loadUser(): Observable<User> {
    return this.api.getMe().pipe(
      tap(user => {
        this._user.set(user);
        this.tokens.cacheUser({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          tier: user.tier,
          profileImageUrl: user.profileImageUrl ?? null
        });
      })
    );
  }

  setUser(user: User): void {
    this._user.set(user);
  }

  private handleAuth(res: AuthResponse): void {
    this.tokens.setTokens(res.accessToken, res.refreshToken, res.expiresAt);
    this._user.set(res.user);
    // Cache minimal user info for optimistic auth on next page load
    if (res.user) {
      this.tokens.cacheUser({
        id: res.user.id,
        firstName: res.user.firstName,
        lastName: res.user.lastName,
        email: res.user.email,
        tier: res.user.tier,
        profileImageUrl: res.user.profileImageUrl ?? null
      });
    }
  }
}
