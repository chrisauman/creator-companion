import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenService } from './token.service';
import {
  AuthResponse, User, Journal, Entry, EntryListItem,
  Draft, StreakStats, StreakHistoryItem, Capabilities, MediaItem, Tag, Pause, MotivationEntry,
  FavoritesPage,
  ReminderConfigResponse, UpdateReminderConfigRequest, ActionItem, Faq, DailyPrompt
} from '../models/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http   = inject(HttpClient);
  private tokens = inject(TokenService);
  private base   = environment.apiBaseUrl;

  // ── Auth ────────────────────────────────────────────────────────────────
  // withCredentials: true is required so the browser sends the HttpOnly
  // refresh-token cookie on cross-origin requests to the Railway API.
  register(firstName: string, lastName: string, email: string, password: string, timeZoneId: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/auth/register`,
      { firstName, lastName, email, password, timeZoneId }, { withCredentials: true });
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/auth/login`,
      { email, password }, { withCredentials: true });
  }

  /** Update the current user's first + last name. */
  updateName(firstName: string, lastName: string): Observable<{ firstName: string; lastName: string }> {
    return this.http.patch<{ firstName: string; lastName: string }>(
      `${this.base}/users/me/name`, { firstName, lastName });
  }

  refresh(): Observable<AuthResponse> {
    // Cookie-only — the HttpOnly cc_refresh_token cookie is the sole
    // source of authentication for refresh. The earlier body-fallback
    // was removed (it both defeated HttpOnly and opened a CSRF path).
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

  /** Past completed streaks (chapters), most recent first. Excludes the
   *  currently-ongoing streak. Powers the Streak History view in
   *  column 3 of the dashboard. */
  getStreakHistory(): Observable<StreakHistoryItem[]> {
    return this.http.get<StreakHistoryItem[]>(`${this.base}/entries/streak/history`);
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
  // Reminders are now five fixed slots per user (lazy-created server-side
  // on first GET). createReminder / deleteReminder are kept for backwards
  // compatibility but the UI no longer calls them — slots are always
  // there to be edited.
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

  /** Called once when the user first enables push notifications and no
   *  reminders are currently active — the server flips slot #1 on so
   *  they immediately get one active reminder. No-op server-side if any
   *  reminder is already enabled, so it's safe to call repeatedly. */
  autoEnableFirstReminder(): Observable<void> {
    return this.http.post<void>(`${this.base}/reminders/auto-enable-first`, {});
  }

  /** Wipes the user's reminders and recreates exactly five disabled noon
   *  slots. Triggered by the Reset button on the notifications page —
   *  destructive, so the UI confirms first. Returns the fresh five. */
  resetReminders(): Observable<any[]> {
    return this.http.post<any[]>(`${this.base}/reminders/reset`, {});
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

  /** Fires a test notification to every registered subscription for the
   *  current user, immediately. Used by the "Send test" button on the
   *  notifications settings page so users can verify push delivery
   *  independently of the daily reminder schedule. */
  sendTestPush(): Observable<{ sent: number; total: number; expired: number; errors: string[] | null; message: string }> {
    return this.http.post<{ sent: number; total: number; expired: number; errors: string[] | null; message: string }>(
      `${this.base}/push/test`, {});
  }

  // ── Motivation ──────────────────────────────────────────────────────────
  getTodayMotivation(): Observable<MotivationEntry | null> {
    return this.http.get<MotivationEntry | null>(`${this.base}/motivation/today`);
  }

  updateMotivationPreference(show: boolean): Observable<{ showMotivation: boolean }> {
    return this.http.patch<{ showMotivation: boolean }>(`${this.base}/motivation/preference`, { show });
  }

  toggleSparkFavorite(id: string): Observable<{ isFavorited: boolean }> {
    return this.http.post<{ isFavorited: boolean }>(`${this.base}/motivation/${id}/favorite`, {});
  }

  getFavoriteSparks(): Observable<MotivationEntry[]> {
    return this.http.get<MotivationEntry[]>(`${this.base}/motivation/favorites`);
  }

  /** Unified Favorites endpoint — sparks + journal entries merged
   *  and sorted by favoritedAt DESC. Powers the /favorites surface.
   *  Page size is server-clamped (1..100); default 25 if take is
   *  omitted. The hasMore flag drives the "Load more" CTA. */
  getFavorites(skip: number = 0, take: number = 25): Observable<FavoritesPage> {
    return this.http.get<FavoritesPage>(
      `${this.base}/favorites?skip=${skip}&take=${take}`);
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
    firstName: string; lastName: string; email: string; newPassword?: string; tier: string;
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

  /** Upload a new profile picture for the current user. Server returns
   *  the public URL of the uploaded image (already cropped/resized
   *  server-side). */
  uploadProfileImage(file: File): Observable<{ profileImageUrl: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ profileImageUrl: string }>(`${this.base}/users/me/profile-image`, form);
  }

  /** Remove the current profile picture (revert to initial-letter avatar). */
  deleteProfileImage(): Observable<void> {
    return this.http.delete<void>(`${this.base}/users/me/profile-image`);
  }

  // ── Admin: Reminder Config ───────────────────────────────────────────────
  adminGetReminderConfig(): Observable<ReminderConfigResponse> {
    return this.http.get<ReminderConfigResponse>(`${this.base}/admin/reminder-config`);
  }

  adminUpdateReminderConfig(payload: UpdateReminderConfigRequest): Observable<ReminderConfigResponse> {
    return this.http.put<ReminderConfigResponse>(`${this.base}/admin/reminder-config`, payload);
  }

  deleteAccount(password: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/users/me`, { body: { password } });
  }

  updateActionItemsPreference(show: boolean): Observable<{ showActionItems: boolean }> {
    return this.http.patch<{ showActionItems: boolean }>(`${this.base}/users/me/action-items-preference`, { show });
  }

  // ── Action Items ─────────────────────────────────────────────────────────
  getActionItems(): Observable<ActionItem[]> {
    return this.http.get<ActionItem[]>(`${this.base}/action-items`);
  }

  createActionItem(text: string): Observable<ActionItem> {
    return this.http.post<ActionItem>(`${this.base}/action-items`, { text });
  }

  updateActionItem(id: number, text: string): Observable<ActionItem> {
    return this.http.put<ActionItem>(`${this.base}/action-items/${id}`, { text });
  }

  toggleActionItem(id: number): Observable<ActionItem> {
    return this.http.post<ActionItem>(`${this.base}/action-items/${id}/toggle`, {});
  }

  reorderActionItems(ids: number[]): Observable<void> {
    return this.http.put<void>(`${this.base}/action-items/reorder`, { ids });
  }

  deleteActionItem(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/action-items/${id}`);
  }

  clearCompletedActionItems(): Observable<void> {
    return this.http.delete<void>(`${this.base}/action-items/completed`);
  }

  // ── Admin: Email Templates ───────────────────────────────────────────────
  adminGetEmailTemplate(key: string): Observable<any> {
    return this.http.get<any>(`${this.base}/admin/email-templates/${key}`);
  }

  adminSaveEmailTemplate(key: string, subject: string, htmlContent: string): Observable<any> {
    return this.http.put<any>(`${this.base}/admin/email-templates/${key}`, { subject, htmlContent });
  }

  // ── FAQs (public, authenticated) ────────────────────────────────────────
  getFaqs(): Observable<Faq[]> {
    return this.http.get<Faq[]>(`${this.base}/faq`);
  }

  // ── Admin: FAQs ──────────────────────────────────────────────────────────
  adminGetFaqs(): Observable<Faq[]> {
    return this.http.get<Faq[]>(`${this.base}/admin/faq`);
  }

  adminCreateFaq(question: string, answer: string, category: string, isPublished: boolean): Observable<Faq> {
    return this.http.post<Faq>(`${this.base}/admin/faq`, { question, answer, category, isPublished });
  }

  adminUpdateFaq(id: string, question: string, answer: string, category: string, isPublished: boolean): Observable<Faq> {
    return this.http.put<Faq>(`${this.base}/admin/faq/${id}`, { question, answer, category, isPublished });
  }

  adminDeleteFaq(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/faq/${id}`);
  }

  adminReorderFaqs(ids: string[]): Observable<void> {
    return this.http.post<void>(`${this.base}/admin/faq/reorder`, { ids });
  }

  // ── Daily Prompts (published, authenticated) ────────────────────────────
  getDailyPrompts(): Observable<DailyPrompt[]> {
    return this.http.get<DailyPrompt[]>(`${this.base}/daily-prompts`);
  }

  // ── Admin: Daily Prompts ────────────────────────────────────────────────
  adminGetDailyPrompts(): Observable<DailyPrompt[]> {
    return this.http.get<DailyPrompt[]>(`${this.base}/admin/daily-prompts`);
  }

  adminCreateDailyPrompt(text: string, isPublished: boolean): Observable<DailyPrompt> {
    return this.http.post<DailyPrompt>(`${this.base}/admin/daily-prompts`, { text, isPublished });
  }

  adminUpdateDailyPrompt(id: string, text: string, isPublished: boolean): Observable<DailyPrompt> {
    return this.http.put<DailyPrompt>(`${this.base}/admin/daily-prompts/${id}`, { text, isPublished });
  }

  adminDeleteDailyPrompt(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/daily-prompts/${id}`);
  }

  adminReorderDailyPrompts(ids: string[]): Observable<void> {
    return this.http.post<void>(`${this.base}/admin/daily-prompts/reorder`, { ids });
  }

  // ── Admin: Substack auto-poster ────────────────────────────────────────
  adminGetSubstackSettings(): Observable<SubstackSettings> {
    return this.http.get<SubstackSettings>(`${this.base}/admin/substack/settings`);
  }

  adminUpdateSubstackSettings(payload: { active: boolean; timeZoneId: string; cookie?: string | null }): Observable<SubstackSettings> {
    return this.http.put<SubstackSettings>(`${this.base}/admin/substack/settings`, payload);
  }

  adminSubstackTestPost(): Observable<SubstackTestPostResult> {
    return this.http.post<SubstackTestPostResult>(`${this.base}/admin/substack/test-post`, {});
  }

  /** Today's plan row (null if the worker hasn't created one yet). */
  adminGetSubstackToday(): Observable<SubstackPlan | null> {
    return this.http.get<SubstackPlan | null>(`${this.base}/admin/substack/today`);
  }

  /** Drop today's pending plan so the worker rolls a new one next tick. */
  adminSubstackRerollToday(): Observable<void> {
    return this.http.post<void>(`${this.base}/admin/substack/today/reroll`, {});
  }

  /** Force-fire today's post right now, bypassing the random schedule. */
  adminSubstackFireNow(): Observable<SubstackTestPostResult> {
    return this.http.post<SubstackTestPostResult>(`${this.base}/admin/substack/today/fire-now`, {});
  }

  /** Last 60 daily plans, newest first. */
  adminGetSubstackHistory(): Observable<SubstackPlan[]> {
    return this.http.get<SubstackPlan[]>(`${this.base}/admin/substack/history`);
  }

  /** How many sparks remain unposted — powers the "running low" warning. */
  adminGetSubstackEligibleCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base}/admin/substack/eligible-count`);
  }
}

// Shape returned by GET/PUT /admin/substack/settings. The actual cookie
// never leaves the server; only the boolean cookieIsSet does.
export interface SubstackSettings {
  active: boolean;
  timeZoneId: string;
  cookieIsSet: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
  consecutiveFailures: number;
  updatedAt: string;
}

// Outcome of a manual "send a test post now" attempt.
export interface SubstackTestPostResult {
  success: boolean;
  statusCode: number | null;
  noteId: string | null;
  errorMessage: string | null;
  rawResponse: string | null;
}

// One day's plan row. Date is ISO YYYY-MM-DD string from DateOnly.
// Status is the C# enum name: 'Pending' | 'Posted' | 'Failed'.
export interface SubstackPlan {
  id: number;
  date: string;
  scheduledFor: string;
  status: 'Pending' | 'Posted' | 'Failed';
  postedAt: string | null;
  substackNoteId: string | null;
  errorMessage: string | null;
  sparkId: string;
  sparkTakeaway: string;
}
