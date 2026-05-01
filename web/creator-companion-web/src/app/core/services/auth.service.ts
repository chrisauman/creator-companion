import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, tap, catchError, throwError, shareReplay, delay, finalize } from 'rxjs';
import { ApiService } from './api.service';
import { TokenService } from './token.service';
import { User, AuthResponse, Capabilities } from '../models/models';

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

  register(username: string, email: string, password: string, timeZoneId: string): Observable<AuthResponse> {
    return this.api.register(username, email, password, timeZoneId).pipe(
      tap(res => this.handleAuth(res))
    );
  }

  login(emailOrUsername: string, password: string): Observable<AuthResponse> {
    return this.api.login(emailOrUsername, password).pipe(
      tap(res => this.handleAuth(res))
    );
  }

  refreshToken(): Observable<AuthResponse> {
    if (this._refresh$) return this._refresh$;

    this._refresh$ = this.api.refresh().pipe(
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

  logout(): void {
    this.tokens.clear();
    this._user.set(null);
    this._capabilities.set(null);
    // Must wait for revoke to complete before navigating — the refresh token lives
    // in an HttpOnly cookie, so if we reload before the server invalidates it the
    // app will silently restore the session on the next page load.
    this.api.revoke().subscribe({
      next:  () => window.location.replace('/login'),
      error: () => window.location.replace('/login')
    });
  }

  loadUser(): Observable<User> {
    return this.api.getMe().pipe(
      tap(user => {
        this._user.set(user);
        this.tokens.cacheUser({
          id: user.id, username: user.username,
          email: user.email, tier: user.tier
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
        username: res.user.username,
        email: res.user.email,
        tier: res.user.tier
      });
    }
  }
}
