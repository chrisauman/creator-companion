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
  // Refresh token lives EXCLUSIVELY in the HttpOnly Secure SameSite=None
  // cookie issued by the backend; it is intentionally never visible to
  // JavaScript. A previous version mirrored it into localStorage as a
  // "Safari ITP fallback" — that defeated the HttpOnly mitigation
  // entirely (XSS could read the token) and opened a CSRF-via-body path
  // on /v1/auth/refresh. Both are now closed.
  private _accessToken  = signal<string | null>(null);
  private _expiresAt    = signal<Date | null>(null);

  private static readonly RT_KEY    = 'cc_rt'; // legacy — kept for migration cleanup only
  private static readonly USER_KEY  = 'cc_user';

  // Backend stopped sending refresh tokens in the response body
  // 2026-05-25. The parameter was already a no-op (cookie-only),
  // so it's fully removed from the signature now. Legacy localStorage
  // cleanup still runs in case any browser still has the old key
  // from before the prior cookie-only rollout.
  setTokens(accessToken: string, expiresAt: string): void {
    this._accessToken.set(accessToken);
    this._expiresAt.set(new Date(expiresAt));
    try { localStorage.removeItem(TokenService.RT_KEY); } catch {}
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
      // RT_KEY removal kept for users with stale localStorage from
      // the pre-cookie-only era. Safe to no-op once it's been gone
      // for a release cycle.
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
