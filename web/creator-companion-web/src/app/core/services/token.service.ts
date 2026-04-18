import { Injectable } from '@angular/core';

const ACCESS_KEY  = 'cc_access_token';
const REFRESH_KEY = 'cc_refresh_token';
const EXPIRES_KEY = 'cc_token_expires';

@Injectable({ providedIn: 'root' })
export class TokenService {

  setTokens(accessToken: string, refreshToken: string, expiresAt: string): void {
    localStorage.setItem(ACCESS_KEY,  accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(EXPIRES_KEY, expiresAt);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  isAccessTokenExpired(): boolean {
    const expires = localStorage.getItem(EXPIRES_KEY);
    if (!expires) return true;
    return new Date(expires) <= new Date();
  }

  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  }

  hasTokens(): boolean {
    return !!this.getAccessToken() && !!this.getRefreshToken();
  }

  isAdmin(): boolean {
    const token = this.getAccessToken();
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
