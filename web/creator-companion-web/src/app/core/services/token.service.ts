import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TokenService {
  // Access token lives in memory only — never touches localStorage.
  // Refresh token is stored in an HttpOnly cookie managed by the API.
  private _accessToken  = signal<string | null>(null);
  private _expiresAt    = signal<Date | null>(null);

  setTokens(accessToken: string, _refreshToken: string, expiresAt: string): void {
    this._accessToken.set(accessToken);
    this._expiresAt.set(new Date(expiresAt));
  }

  getAccessToken(): string | null {
    return this._accessToken();
  }

  isAccessTokenExpired(): boolean {
    const exp = this._expiresAt();
    if (!exp) return true;
    return exp <= new Date();
  }

  clear(): void {
    this._accessToken.set(null);
    this._expiresAt.set(null);
  }

  hasTokens(): boolean {
    return !!this._accessToken() && !this.isAccessTokenExpired();
  }

  getUserId(): string {
    const token = this._accessToken();
    if (!token) return 'anonymous';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload['sub'] ?? payload['nameid'] ?? payload['nameidentifier'] ?? 'anonymous';
    } catch {
      return 'anonymous';
    }
  }

  isAdmin(): boolean {
    const token = this._accessToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const roles: string | string[] | undefined =
        payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ??
        payload['role'] ??
        payload['roles'];
      if (!roles) return false;
      return Array.isArray(roles) ? roles.includes('Admin') : roles === 'Admin';
    } catch {
      return false;
    }
  }
}
