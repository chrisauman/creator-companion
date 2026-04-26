import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, tap, catchError, throwError } from 'rxjs';
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
    return this.api.refresh().pipe(
      tap(res => this.handleAuth(res)),
      catchError(err => {
        this.tokens.clear();
        this._user.set(null);
        return throwError(() => err);
      })
    );
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
      tap(user => this._user.set(user))
    );
  }

  setUser(user: User): void {
    this._user.set(user);
  }

  private handleAuth(res: AuthResponse): void {
    this.tokens.setTokens(res.accessToken, res.refreshToken, res.expiresAt);
    this._user.set(res.user);
  }
}
