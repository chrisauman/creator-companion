import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TokenService {
  // Access token lives in memory only (lost on page close — by design).
  // Refresh token is stored in an HttpOnly cookie (primary) AND in
  // localStorage (fallback for browsers that block cross-origin cookies,
  // e.g. Safari ITP, iOS, private browsing).
  private _accessToken  = signal<string | null>(null);
  private _expiresAt    = signal<Date | null>(null);

  private static readonly RT_KEY = 'cc_rt';

  setTokens(accessToken: string, refreshToken: string, expiresAt: string): void {
    this._accessToken.set(accessToken);
    this._expiresAt.set(new Date(expiresAt));
    if (refreshToken) {
      try { localStorage.setItem(TokenService.RT_KEY, refreshToken); } catch {}
    }
  }

  getRefreshToken(): string | null {
    try { return localStorage.getItem(TokenService.RT_KEY); } catch { return null; }
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
    try { localStorage.removeItem(TokenService.RT_KEY); } catch {}
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
