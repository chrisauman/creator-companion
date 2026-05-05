import { Injectable, signal } from '@angular/core';

/** Subset of the User record we keep client-side for fast renders.
 *  Mirrors the AuthDtos.UserSummary shape returned by login/register. */
export interface CachedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  tier: string;
  profileImageUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class TokenService {
  // Access token lives in memory only (lost on page close — by design).
  // Refresh token is stored in an HttpOnly cookie (primary) AND in
  // localStorage (fallback for browsers that block cross-origin cookies,
  // e.g. Safari ITP, iOS, private browsing).
  private _accessToken  = signal<string | null>(null);
  private _expiresAt    = signal<Date | null>(null);

  private static readonly RT_KEY   = 'cc_rt';
  private static readonly USER_KEY  = 'cc_user';

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

  /** Cached user — held in a signal so components (e.g. the sidebar
   *  avatar) re-render the moment a profile field changes after an
   *  in-app update like uploading a new profile picture. Initialised
   *  from localStorage on first read so a hard refresh keeps the
   *  cached identity. */
  private _cachedUser = signal<CachedUser | null>(this.readCachedUserFromStorage());

  /** Cache minimal user info so the guard can load optimistically. */
  cacheUser(user: CachedUser): void {
    this._cachedUser.set(user);
    try { localStorage.setItem(TokenService.USER_KEY, JSON.stringify(user)); } catch {}
  }

  /** Merge new fields onto the cached user (e.g. after a profile
   *  image upload). Keeps the in-memory signal and localStorage in
   *  sync so a refresh doesn't lose the change. No-op if no user
   *  is cached. */
  updateCachedUser(patch: Partial<CachedUser>): void {
    const current = this._cachedUser();
    if (!current) return;
    const next = { ...current, ...patch };
    this._cachedUser.set(next);
    try { localStorage.setItem(TokenService.USER_KEY, JSON.stringify(next)); } catch {}
  }

  getCachedUser(): CachedUser | null {
    return this._cachedUser();
  }

  private readCachedUserFromStorage(): CachedUser | null {
    try {
      const raw = localStorage.getItem(TokenService.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
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
    this._cachedUser.set(null);
    try {
      localStorage.removeItem(TokenService.RT_KEY);
      localStorage.removeItem(TokenService.USER_KEY);
    } catch {}
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
