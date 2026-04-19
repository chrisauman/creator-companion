import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { TokenService } from './token.service';
import { User, AuthResponse } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api    = inject(ApiService);
  private tokens = inject(TokenService);
  private router = inject(Router);

  private _user = signal<User | null>(null);

  readonly user     = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());

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

  logout(): void {
    this.api.revoke().subscribe({ error: () => {} });
    this.tokens.clear();
    this._user.set(null);
    this.router.navigate(['/login']);
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
