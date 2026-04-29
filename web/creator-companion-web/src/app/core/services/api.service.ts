import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse, User, Journal, Entry, EntryListItem,
  Draft, StreakStats, Capabilities, MediaItem, Tag, Pause, MotivationEntry,
  ReminderConfigResponse, UpdateReminderConfigRequest
} from '../models/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  // ── Auth ────────────────────────────────────────────────────────────────
  // withCredentials: true is required so the browser sends the HttpOnly
  // refresh-token cookie on cross-origin requests to the Railway API.
  register(username: string, email: string, password: string, timeZoneId: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/auth/register`,
      { username, email, password, timeZoneId }, { withCredentials: true });
  }

  login(emailOrUsername: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/auth/login`,
      { emailOrUsername, password }, { withCredentials: true });
  }

  refresh(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/auth/refresh`, {}, { withCredentials: true });
  }

  revoke(): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/revoke`, {}, { withCredentials: true });
  }

  forgotPassword(email: string): Observable<{ message: string; resetToken: string }> {
    return this.http.post<any>(`${this.base}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<any>(`${this.base}/auth/reset-password`, { token, newPassword });
  }

  // ── Users ───────────────────────────────────────────────────────────────
  getMe(): Observable<User> {
    return this.http.get<User>(`${this.base}/users/me`);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/users/me/password`, { currentPassword, newPassword });
  }

  updateTimezone(timeZoneId: string): Observable<{ timeZoneId: string }> {
    return this.http.patch<{ timeZoneId: string }>(`${this.base}/users/me/timezone`, { timeZoneId });
  }

  completeOnboarding(): Observable<{ onboardingCompleted: boolean }> {
    return this.http.patch<{ onboardingCompleted: boolean }>(
      `${this.base}/users/me/onboarding`, { completed: true });
  }

  getCapabilities(): Observable<Capabilities> {
    return this.http.get<Capabilities>(`${this.base}/users/me/capabilities`);
  }

  // ── Journals ────────────────────────────────────────────────────────────
  getJournals(): Observable<Journal[]> {
    return this.http.get<Journal[]>(`${this.base}/journals`);
  }

  createJournal(name: string, description?: string): Observable<Journal> {
    return this.http.post<Journal>(`${this.base}/journals`, { name, description });
  }

  // ── Entries ─────────────────────────────────────────────────────────────
  getEntries(journalId?: string, includeDeleted = false, tagName?: string, skip?: number, take?: number): Observable<EntryListItem[]> {
    let params = new HttpParams();
    if (journalId) params = params.set('journalId', journalId);
    if (includeDeleted) params = params.set('includeDeleted', 'true');
    if (tagName) params = params.set('tagName', tagName);
    if (skip != null) params = params.set('skip', skip.toString());
    if (take != null) params = params.set('take', take.toString());
    return this.http.get<EntryListItem[]>(`${this.base}/entries`, { params });
  }

  getEntry(id: string): Observable<Entry> {
    return this.http.get<Entry>(`${this.base}/entries/${id}`);
  }

  createEntry(journalId: string, entryDate: string, title: string, contentText: string, metadata = '{}', mood?: string, tags?: string[]): Observable<Entry> {
    return this.http.post<Entry>(`${this.base}/entries`, { journalId, entryDate, title, contentText, metadata, mood, tags });
  }

  updateEntry(id: string, title: string, contentText: string, metadata?: string, mood?: string, tags?: string[]): Observable<Entry> {
    return this.http.put<Entry>(`${this.base}/entries/${id}`, { title, contentText, metadata, mood, tags });
  }

  deleteEntry(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/entries/${id}`);
  }

  recoverEntry(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/entries/${id}/recover`, {});
  }

  hardDeleteEntry(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/entries/${id}/permanent`);
  }

  toggleFavorite(id: string): Observable<{ isFavorited: boolean }> {
    return this.http.post<{ isFavorited: boolean }>(`${this.base}/entries/${id}/favorite`, {});
  }

  getStreak(): Observable<StreakStats> {
    return this.http.get<StreakStats>(`${this.base}/entries/streak`);
  }

  // ── Pauses ──────────────────────────────────────────────────────────────
  getActivePause(): Observable<Pause | null> {
    return this.http.get<Pause | null>(`${this.base}/pauses/active`);
  }

  createPause(startDate: string, endDate: string, reason?: string): Observable<Pause> {
    return this.http.post<Pause>(`${this.base}/pauses`, { startDate, endDate, reason });
  }

  cancelPause(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/pauses/${id}`);
  }

  // ── Drafts ──────────────────────────────────────────────────────────────
  upsertDraft(journalId: string, entryDate: string, contentText: string, metadata = '{}'): Observable<Draft> {
    return this.http.put<Draft>(`${this.base}/drafts`, { journalId, entryDate, contentText, metadata });
  }

  getDraft(journalId: string, entryDate: string): Observable<Draft | null> {
    const params = new HttpParams().set('journalId', journalId).set('entryDate', entryDate);
    return this.http.get<Draft | null>(`${this.base}/drafts`, { params });
  }

  discardDraft(journalId: string, entryDate: string): Observable<void> {
    const params = new HttpParams().set('journalId', journalId).set('entryDate', entryDate);
    return this.http.delete<void>(`${this.base}/drafts`, { params });
  }

  // ── Tags ────────────────────────────────────────────────────────────────
  getTags(): Observable<Tag[]> {
    return this.http.get<Tag[]>(`${this.base}/tags`);
  }

  createTag(name: string): Observable<Tag> {
    return this.http.post<Tag>(`${this.base}/tags`, { name });
  }

  renameTag(id: string, name: string): Observable<Tag> {
    return this.http.patch<Tag>(`${this.base}/tags/${id}`, { name });
  }

  deleteTag(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/tags/${id}`);
  }

  // ── Reminders ───────────────────────────────────────────────────────────
  getReminders(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/reminders`);
  }

  createReminder(time: string, message?: string): Observable<any> {
    return this.http.post<any>(`${this.base}/reminders`, { time, message });
  }

  updateReminder(id: string, time: string, message: string | undefined, isEnabled: boolean): Observable<any> {
    return this.http.put<any>(`${this.base}/reminders/${id}`, { time, message, isEnabled });
  }

  deleteReminder(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/reminders/${id}`);
  }

  // ── Push ────────────────────────────────────────────────────────────────
  getPushVapidKey(): Observable<{ publicKey: string }> {
    return this.http.get<{ publicKey: string }>(`${this.base}/push/vapid-public-key`);
  }

  pushSubscribe(payload: { endpoint: string; p256dh: string; auth: string; platform: string }): Observable<any> {
    return this.http.post<any>(`${this.base}/push/subscribe`, payload);
  }

  pushUnsubscribe(endpoint: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/push/subscribe`, { body: { endpoint } });
  }

  // ── Motivation ──────────────────────────────────────────────────────────
  getTodayMotivation(): Observable<MotivationEntry | null> {
    return this.http.get<MotivationEntry | null>(`${this.base}/motivation/today`);
  }

  updateMotivationPreference(show: boolean): Observable<{ showMotivation: boolean }> {
    return this.http.patch<{ showMotivation: boolean }>(`${this.base}/motivation/preference`, { show });
  }

  // ── Admin Motivation ─────────────────────────────────────────────────────
  adminGetMotivation(): Observable<MotivationEntry[]> {
    return this.http.get<MotivationEntry[]>(`${this.base}/admin/motivation`);
  }

  adminCreateMotivation(payload: { takeaway: string; fullContent: string; category: string }): Observable<MotivationEntry> {
    return this.http.post<MotivationEntry>(`${this.base}/admin/motivation`, payload);
  }

  adminUpdateMotivation(id: string, payload: { takeaway: string; fullContent: string; category: string }): Observable<MotivationEntry> {
    return this.http.put<MotivationEntry>(`${this.base}/admin/motivation/${id}`, payload);
  }

  adminDeleteMotivation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/motivation/${id}`);
  }

  // ── Admin ───────────────────────────────────────────────────────────────
  adminGetStats(): Observable<any> {
    return this.http.get<any>(`${this.base}/admin/stats`);
  }

  adminGetUsers(page = 1, pageSize = 25, search?: string): Observable<any> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) params = params.set('search', search);
    return this.http.get<any>(`${this.base}/admin/users`, { params });
  }

  adminGetUser(id: string): Observable<any> {
    return this.http.get<any>(`${this.base}/admin/users/${id}`);
  }

  adminSetTier(id: string, tier: string): Observable<any> {
    return this.http.patch<any>(`${this.base}/admin/users/${id}/tier`, { tier });
  }

  adminSetActive(id: string, isActive: boolean): Observable<any> {
    return this.http.patch<any>(`${this.base}/admin/users/${id}/active`, { isActive });
  }

  adminGetUserEntries(id: string, page = 1, pageSize = 10): Observable<any> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<any>(`${this.base}/admin/users/${id}/entries`, { params });
  }

  adminUpdateUser(id: string, payload: {
    username: string; email: string; newPassword?: string; tier: string;
    timeZoneId: string; isAdmin: boolean; isActive: boolean;
    onboardingCompleted: boolean; trialEndsAt?: string | null;
  }): Observable<any> {
    return this.http.patch<any>(`${this.base}/admin/users/${id}`, payload);
  }

  adminDeleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/users/${id}`);
  }

  adminCancelUserPause(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/users/${id}/pause`);
  }

  adminClearAllPauses(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/users/${id}/pauses/all`);
  }

  adminGetPushSubscriptions(id: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/admin/users/${id}/push-subscriptions`);
  }

  adminSendTestNotification(id: string): Observable<{ sent: number; failed: number; message: string }> {
    return this.http.post<any>(`${this.base}/admin/users/${id}/test-notification`, {});
  }

  // ── Stripe ──────────────────────────────────────────────────────────────
  getStripeConfig(): Observable<{ publishableKey: string; monthlyPriceId: string; annualPriceId: string }> {
    return this.http.get<any>(`${this.base}/stripe/config`);
  }

  createCheckoutSession(priceId: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.base}/stripe/checkout`, { priceId });
  }

  createPortalSession(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.base}/stripe/portal`, {});
  }

  // ── Media ───────────────────────────────────────────────────────────────
  getImageUrl(storagePath: string): string {
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) return storagePath;
    return this.base.replace(/\/v1$/, '') + storagePath;
  }

  uploadMedia(entryId: string, file: File): Observable<MediaItem> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<MediaItem>(`${this.base}/media/entries/${entryId}`, form);
  }

  deleteMedia(mediaId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/media/${mediaId}`);
  }

  // ── Admin: Reminder Config ───────────────────────────────────────────────
  adminGetReminderConfig(): Observable<ReminderConfigResponse> {
    return this.http.get<ReminderConfigResponse>(`${this.base}/admin/reminder-config`);
  }

  adminUpdateReminderConfig(payload: UpdateReminderConfigRequest): Observable<ReminderConfigResponse> {
    return this.http.put<ReminderConfigResponse>(`${this.base}/admin/reminder-config`, payload);
  }

  // ── Admin: Email Templates ───────────────────────────────────────────────
  adminGetEmailTemplate(key: string): Observable<any> {
    return this.http.get<any>(`${this.base}/admin/email-templates/${key}`);
  }

  adminSaveEmailTemplate(key: string, subject: string, htmlContent: string): Observable<any> {
    return this.http.put<any>(`${this.base}/admin/email-templates/${key}`, { subject, htmlContent });
  }
}
