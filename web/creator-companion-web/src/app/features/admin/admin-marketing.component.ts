import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ApiService, SocialSettings, SocialAccount, SocialPlan,
  SocialEligibleCount, AdHocPost,
} from '../../core/services/api.service';
import { AdminShellComponent } from './admin-shell.component';

/**
 * Admin Marketing — the multi-platform social auto-poster console.
 *
 * Four tabs:
 *  - Settings : global kill switch + auto-hashtag toggle, and a connect/
 *               schedule card per platform (Bluesky, Mastodon).
 *  - Today    : each platform's plan for today — post-now / reroll, plus
 *               the remaining-spark "running low" counts.
 *  - Compose  : ad-hoc post — text (+ optional image), platform pick
 *               (default all connected), auto-hashtag toggle, now/schedule.
 *  - History  : recent daily-spark plans across platforms.
 *
 * All firing logic lives server-side (SocialPostingService); this is
 * config + manual triggers + status. Visual language mirrors the other
 * admin pages via <app-admin-shell>.
 */
interface AccountForm {
  platform: string;
  enabled: boolean;
  handle: string;
  endpoint: string;
  credential: string;      // blank = keep stored secret
  // YouTube only: three OAuth values (blank = keep stored).
  ytClientId: string;
  ytClientSecret: string;
  ytRefresh: string;
  eveningEnabled: boolean;
  eveningPostHourLocal: number;
  eveningPostMinuteLocal: number;
  postHourLocal: number;
  postMinuteLocal: number;
  jitterMinutes: number;
  hasCredentials: boolean;
  characterLimit: number;
  supportsImages: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
  consecutiveFailures: number;
  saving: boolean;
  savedMsg: string;
}

@Component({
  selector: 'app-admin-marketing',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminShellComponent],
  template: `
    <app-admin-shell active="marketing">
      <div class="mk">
        <div class="mk-head">
          <h2>Marketing</h2>
          <p class="mk-sub">
            Auto-post your Daily Sparks to social, and fire off ad-hoc posts on demand.
          </p>
        </div>

        <!-- Tabs -->
        <div class="mk-tabs">
          <button class="mk-tab" [class.mk-tab--active]="tab() === 'settings'" (click)="tab.set('settings')">Settings</button>
          <button class="mk-tab" [class.mk-tab--active]="tab() === 'today'"    (click)="tab.set('today')">Today</button>
          <button class="mk-tab" [class.mk-tab--active]="tab() === 'compose'"  (click)="tab.set('compose')">Compose</button>
          <button class="mk-tab" [class.mk-tab--active]="tab() === 'history'"  (click)="tab.set('history')">History</button>
        </div>

        @if (loading()) {
          <p class="mk-muted">Loading…</p>
        }

        <!-- ── SETTINGS ─────────────────────────────────────────────── -->
        @if (tab() === 'settings' && settings()) {
          <section class="mk-card mk-global">
            <label class="mk-switch">
              <input type="checkbox" [(ngModel)]="autoPostEnabled" (change)="saveGlobal()" />
              <span><strong>Daily auto-posting</strong> — master kill switch. When off, nothing posts automatically.</span>
            </label>
            <label class="mk-switch">
              <input type="checkbox" [(ngModel)]="autoHashtagsEnabled" (change)="saveGlobal()" />
              <span><strong>Auto-hashtags</strong> — append AI-generated hashtags to daily posts.</span>
            </label>
            <label class="mk-switch">
              <input type="checkbox" [(ngModel)]="dailyQuoteCardsEnabled" (change)="saveGlobal()" />
              <span><strong>Daily quote cards</strong> — attach a branded image of the spark to each daily post.</span>
            </label>
            @if (!settings()!.hashtagsAvailable) {
              <p class="mk-warn">
                Hashtag generation is off — no Anthropic API key is configured on the server.
                Posts still go out, just without auto-hashtags.
              </p>
            }
            @if (!settings()!.quoteCardsAvailable) {
              <p class="mk-warn">
                Quote-card rendering is unavailable on the server (fonts not loaded).
                Posts still go out, just without the branded image.
              </p>
            }
            @if (globalMsg()) { <p class="mk-ok">{{ globalMsg() }}</p> }
          </section>

          @for (a of accountForms(); track a.platform) {
            <section class="mk-card">
              <div class="mk-acct-head">
                <h3>{{ a.platform }}</h3>
                <span class="mk-pill" [class.mk-pill--on]="a.enabled && a.hasCredentials">
                  {{ a.hasCredentials ? (a.enabled ? 'Active' : 'Connected, paused') : 'Not connected' }}
                </span>
              </div>

              <p class="mk-hint">{{ connectHint(a.platform) }}</p>

              <div class="mk-field">
                <label>Handle</label>
                <input type="text" [(ngModel)]="a.handle" [placeholder]="handlePlaceholder(a.platform)" />
              </div>

              @if (a.platform === 'Mastodon') {
                <div class="mk-field">
                  <label>Instance URL</label>
                  <input type="text" [(ngModel)]="a.endpoint" placeholder="https://mastodon.social" />
                </div>
              } @else if (a.platform === 'Bluesky') {
                <div class="mk-field">
                  <label>PDS host <span class="mk-optional">(optional)</span></label>
                  <input type="text" [(ngModel)]="a.endpoint" placeholder="https://bsky.social" />
                </div>
              }

              @if (a.platform === 'YouTube') {
                <div class="mk-field">
                  <label>OAuth Client ID</label>
                  <input type="password" [(ngModel)]="a.ytClientId"
                         [placeholder]="a.hasCredentials ? 'Stored — leave all three blank to keep' : 'xxxxx.apps.googleusercontent.com'" />
                </div>
                <div class="mk-field">
                  <label>OAuth Client Secret</label>
                  <input type="password" [(ngModel)]="a.ytClientSecret"
                         [placeholder]="a.hasCredentials ? 'Stored — leave blank to keep' : 'GOCSPX-…'" />
                </div>
                <div class="mk-field">
                  <label>Refresh token</label>
                  <input type="password" [(ngModel)]="a.ytRefresh"
                         [placeholder]="a.hasCredentials ? 'Stored — leave blank to keep' : '1//0…'" />
                </div>
              } @else {
                <div class="mk-field">
                  <label>{{ credentialLabel(a.platform) }}</label>
                  <input type="password" [(ngModel)]="a.credential"
                         [placeholder]="a.hasCredentials ? 'Stored — leave blank to keep' : 'Paste here'" />
                </div>
              }

              <div class="mk-row">
                <div class="mk-field mk-field--sm">
                  <label>Post time (ET)</label>
                  <div class="mk-time">
                    <input type="number" min="0" max="23" [(ngModel)]="a.postHourLocal" />
                    <span>:</span>
                    <input type="number" min="0" max="59" [(ngModel)]="a.postMinuteLocal" />
                  </div>
                </div>
                <div class="mk-field mk-field--sm">
                  <label>Jitter (± min)</label>
                  <input type="number" min="0" max="240" [(ngModel)]="a.jitterMinutes" />
                </div>
              </div>

              <label class="mk-switch">
                <input type="checkbox" [(ngModel)]="a.eveningEnabled" />
                <span>Evening Spark — post a second, dark card later in the day (its own spark)</span>
              </label>
              @if (a.eveningEnabled) {
                <div class="mk-row">
                  <div class="mk-field mk-field--sm">
                    <label>Evening time (ET)</label>
                    <div class="mk-time">
                      <input type="number" min="0" max="23" [(ngModel)]="a.eveningPostHourLocal" />
                      <span>:</span>
                      <input type="number" min="0" max="59" [(ngModel)]="a.eveningPostMinuteLocal" />
                    </div>
                  </div>
                </div>
              }

              <label class="mk-switch">
                <input type="checkbox" [(ngModel)]="a.enabled" />
                <span>Enabled — include in the daily auto-post run</span>
              </label>

              <p class="mk-meta">
                {{ a.characterLimit }} char limit · {{ a.supportsImages ? 'images supported' : 'text only' }}
                @if (a.lastSuccessAt) { · last posted {{ a.lastSuccessAt | date:'MMM d, h:mm a' }} }
                @if (a.consecutiveFailures > 0) { · <span class="mk-danger">{{ a.consecutiveFailures }} recent failures</span> }
              </p>
              @if (a.lastFailureMessage && a.consecutiveFailures > 0) {
                <p class="mk-danger mk-small">{{ a.lastFailureMessage }}</p>
              }

              <div class="mk-actions">
                <button class="btn btn--sm" [disabled]="a.saving" (click)="saveAccount(a)">
                  {{ a.saving ? 'Saving…' : 'Save' }}
                </button>
                @if (a.savedMsg) { <span class="mk-ok">{{ a.savedMsg }}</span> }
              </div>
            </section>
          }
        }

        <!-- ── TODAY ────────────────────────────────────────────────── -->
        @if (tab() === 'today') {
          <section class="mk-card">
            <div class="mk-eligible">
              @for (e of eligible(); track e.platform) {
                <span class="mk-chip" [class.mk-chip--low]="e.count < 10">
                  {{ e.platform }}: {{ e.count }} sparks left
                </span>
              }
            </div>
            @if (eligible().length && lowPool()) {
              <p class="mk-warn">A platform is running low on unused sparks — add more in Content Library.</p>
            }
          </section>

          @if (!today().length) {
            <p class="mk-muted">No plans yet for today. They're created at each platform's scheduled time (or post now below).</p>
          }

          @for (p of today(); track p.id) {
            <section class="mk-card">
              <div class="mk-acct-head">
                <h3>{{ p.platform }} <span class="mk-slot-tag" [class.mk-slot-tag--evening]="p.slot === 'Evening'">{{ p.slot }}</span></h3>
                <span class="mk-pill" [ngClass]="statusClass(p.status)">{{ p.status }}</span>
              </div>
              <p class="mk-spark">{{ p.sparkTakeaway }}</p>
              <p class="mk-meta">Scheduled {{ p.scheduledFor | date:'MMM d, h:mm a' }}</p>
              @if (p.status === 'Posted' && p.postedUrl) {
                <p><a [href]="p.postedUrl" target="_blank" rel="noopener" class="mk-link">View post ↗</a></p>
              }
              @if (p.status === 'Failed' && p.errorMessage) {
                <p class="mk-danger mk-small">{{ p.errorMessage }}</p>
              }
              <div class="mk-actions">
                <button class="btn btn--sm" [disabled]="busyPlatform() === p.platform + ':' + p.slot" (click)="fireNow(p.platform, p.slot)">
                  {{ busyPlatform() === p.platform + ':' + p.slot ? 'Posting…' : (p.status === 'Pending' ? 'Post now' : 'Re-post (new spark)') }}
                </button>
                @if (p.status === 'Pending') {
                  <button class="btn btn--sm btn--ghost" (click)="reroll(p.platform, p.slot)">Reroll spark</button>
                }
              </div>
            </section>
          }
        }

        <!-- ── COMPOSE ──────────────────────────────────────────────── -->
        @if (tab() === 'compose') {
          <section class="mk-card">
            <div class="mk-field">
              <label>Post text</label>
              <textarea rows="4" [(ngModel)]="composeBody" placeholder="What do you want to share?"></textarea>
            </div>

            <div class="mk-field">
              <label>Platforms</label>
              @if (!connectedPlatforms().length) {
                <p class="mk-muted">No connected platforms yet — connect one in Settings.</p>
              }
              <div class="mk-checks">
                @for (a of connectedPlatforms(); track a.platform) {
                  <label class="mk-check">
                    <input type="checkbox" [checked]="composePlatforms()[a.platform]"
                           (change)="toggleComposePlatform(a.platform)" />
                    <span>{{ a.platform }}</span>
                  </label>
                }
              </div>
            </div>

            <div class="mk-field">
              <label>Image <span class="mk-optional">(optional)</span></label>
              <input type="file" accept="image/*" (change)="onImagePicked($event)" />
            </div>

            <label class="mk-switch">
              <input type="checkbox" [(ngModel)]="composeIncludeHashtags" />
              <span>Append auto-hashtags</span>
            </label>

            <label class="mk-switch">
              <input type="checkbox" [(ngModel)]="composeGenerateCard" [disabled]="!!composeImage" />
              <span>Generate a branded quote card from the text {{ composeImage ? '(disabled — image attached)' : '' }}</span>
            </label>

            <div class="mk-field">
              <label>Schedule <span class="mk-optional">(optional — leave blank to post now)</span></label>
              <input type="datetime-local" [(ngModel)]="composeSchedule" />
            </div>

            @if (composeError()) { <p class="mk-danger">{{ composeError() }}</p> }

            <div class="mk-actions">
              <button class="btn" [disabled]="composeBusy() || !canCompose()" (click)="submitCompose()">
                {{ composeBusy() ? 'Working…' : (composeSchedule ? 'Schedule post' : 'Post now') }}
              </button>
            </div>

            @if (composeResult(); as r) {
              <div class="mk-result">
                <p class="mk-ok">{{ r.scheduledFor ? 'Scheduled.' : 'Sent.' }}</p>
                @for (t of r.targets; track t.platform) {
                  <p class="mk-small">
                    <strong>{{ t.platform }}:</strong>
                    <span [ngClass]="statusClass(t.status)">{{ t.status }}</span>
                    @if (t.postedUrl) { — <a [href]="t.postedUrl" target="_blank" rel="noopener" class="mk-link">view ↗</a> }
                    @if (t.errorMessage) { — <span class="mk-danger">{{ t.errorMessage }}</span> }
                  </p>
                }
              </div>
            }
          </section>

          @if (posts().length) {
            <section class="mk-card">
              <h3>Recent ad-hoc posts</h3>
              @for (post of posts(); track post.id) {
                <div class="mk-post">
                  <p class="mk-spark">{{ post.body || '(image only)' }}</p>
                  <p class="mk-meta">
                    {{ post.createdAt | date:'MMM d, h:mm a' }}
                    @for (t of post.targets; track t.platform) {
                      · {{ t.platform }} <span [ngClass]="statusClass(t.status)">{{ t.status }}</span>
                    }
                  </p>
                </div>
              }
            </section>
          }
        }

        <!-- ── HISTORY ──────────────────────────────────────────────── -->
        @if (tab() === 'history') {
          @if (!history().length) {
            <p class="mk-muted">No history yet.</p>
          } @else {
            <section class="mk-card">
              <table class="mk-table">
                <thead>
                  <tr><th>Date</th><th>Platform</th><th>Status</th><th>Spark</th><th></th></tr>
                </thead>
                <tbody>
                  @for (p of history(); track p.id) {
                    <tr>
                      <td>{{ p.date | date:'MMM d' }}</td>
                      <td>{{ p.platform }}</td>
                      <td><span [ngClass]="statusClass(p.status)">{{ p.status }}</span></td>
                      <td class="mk-td-spark">{{ p.sparkTakeaway }}</td>
                      <td>
                        @if (p.postedUrl) { <a [href]="p.postedUrl" target="_blank" rel="noopener" class="mk-link">↗</a> }
                        @if (p.errorMessage) { <span class="mk-danger" [title]="p.errorMessage">!</span> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
          }
        }
      </div>
    </app-admin-shell>
  `,
  styles: [`
    .mk { max-width: 760px; }
    .mk-head h2 { font-size: 1.5rem; font-weight: 700; letter-spacing: -.01em; margin: 0 0 .25rem; }
    .mk-sub { color: var(--color-text-2); margin: 0 0 1.25rem; line-height: 1.5; }

    .mk-tabs { display: flex; gap: .25rem; flex-wrap: wrap; margin-bottom: 1.5rem; border-bottom: 1px solid var(--color-border); }
    .mk-tab {
      background: none; border: none; padding: .5rem .875rem; font-size: .9375rem; font-weight: 600;
      color: var(--color-text-2); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
    }
    .mk-tab--active { color: var(--color-text); border-bottom-color: var(--color-accent); }

    .mk-card {
      background: var(--color-surface); border: 1px solid var(--color-border);
      border-radius: 14px; padding: 1.25rem 1.375rem; margin-bottom: 1rem;
    }
    .mk-card h3 { margin: 0; font-size: 1.0625rem; font-weight: 700; }

    .mk-acct-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: .5rem; }
    .mk-pill { font-size: .75rem; font-weight: 700; padding: .2rem .6rem; border-radius: 999px;
      background: var(--color-surface-2); color: var(--color-text-2); }
    .mk-pill--on { background: var(--color-accent-light); color: var(--color-accent-dark); }

    .mk-hint { color: var(--color-text-2); font-size: .875rem; line-height: 1.5; margin: 0 0 1rem; }
    .mk-field { margin-bottom: .875rem; }
    .mk-field label { display: block; font-size: .8125rem; font-weight: 700; margin-bottom: .25rem; }
    .mk-field input[type=text], .mk-field input[type=password], .mk-field input[type=datetime-local],
    .mk-field textarea, .mk-field input[type=number] {
      width: 100%; padding: .5rem .625rem; border: 1px solid var(--color-border);
      border-radius: 8px; font-size: 16px; font-family: var(--font-sans); background: var(--color-bg);
    }
    .mk-optional { font-weight: 400; color: var(--color-text-3); }
    .mk-row { display: flex; gap: 1rem; }
    .mk-field--sm { flex: 1; }
    .mk-time { display: flex; align-items: center; gap: .375rem; }
    .mk-time input { width: 4rem; }

    .mk-switch { display: flex; gap: .625rem; align-items: flex-start; margin: .75rem 0; font-size: .9375rem; line-height: 1.45; cursor: pointer; }
    .mk-switch input { margin-top: .15rem; }

    .mk-checks { display: flex; flex-wrap: wrap; gap: .75rem; }
    .mk-check { display: flex; align-items: center; gap: .375rem; font-size: .9375rem; }

    .mk-actions { display: flex; align-items: center; gap: .75rem; margin-top: 1rem; }
    .mk-meta { color: var(--color-text-3); font-size: .8125rem; margin: .75rem 0 0; }
    .mk-spark { font-size: 1rem; line-height: 1.5; color: var(--color-text); margin: .25rem 0 .5rem; }
    .mk-slot-tag { font-size: .6875rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
      padding: .12rem .45rem; border-radius: 6px; background: var(--color-accent-light); color: var(--color-accent-dark);
      vertical-align: middle; margin-left: .4rem; }
    .mk-slot-tag--evening { background: #0a1a2a; color: #12C4E3; }
    .mk-small { font-size: .8125rem; }
    .mk-muted { color: var(--color-text-2); }
    .mk-ok { color: #16a34a; font-size: .875rem; font-weight: 600; }
    .mk-warn { color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: .625rem .75rem; font-size: .875rem; line-height: 1.45; margin: .75rem 0 0; }
    .mk-danger { color: #e11d48; }
    .mk-link { color: var(--color-accent-dark); font-weight: 600; text-decoration: underline; }

    .mk-eligible { display: flex; flex-wrap: wrap; gap: .5rem; }
    .mk-chip { font-size: .8125rem; font-weight: 600; padding: .25rem .625rem; border-radius: 999px; background: var(--color-surface-2); color: var(--color-text-2); }
    .mk-chip--low { background: #fff1f3; color: #e11d48; }

    .mk-status-Posted { color: #16a34a; font-weight: 700; }
    .mk-status-Pending { color: var(--color-text-2); font-weight: 700; }
    .mk-status-Failed { color: #e11d48; font-weight: 700; }

    .mk-result { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-border); }
    .mk-post { padding: .75rem 0; border-bottom: 1px solid var(--color-border); }
    .mk-post:last-child { border-bottom: none; }

    .mk-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
    .mk-table th { text-align: left; font-weight: 700; padding: .375rem .5rem; border-bottom: 1px solid var(--color-border); color: var(--color-text-2); }
    .mk-table td { padding: .5rem; border-bottom: 1px solid var(--color-border); vertical-align: top; }
    .mk-td-spark { color: var(--color-text-2); max-width: 280px; }
  `]
})
export class AdminMarketingComponent implements OnInit {
  private api = inject(ApiService);

  tab = signal<'settings' | 'today' | 'compose' | 'history'>('settings');
  loading = signal(true);

  settings = signal<SocialSettings | null>(null);
  accountForms = signal<AccountForm[]>([]);
  today = signal<SocialPlan[]>([]);
  history = signal<SocialPlan[]>([]);
  eligible = signal<SocialEligibleCount[]>([]);
  posts = signal<AdHocPost[]>([]);

  // Global toggles (bound to ngModel; persisted via saveGlobal()).
  autoPostEnabled = false;
  autoHashtagsEnabled = true;
  dailyQuoteCardsEnabled = true;
  globalMsg = signal('');

  busyPlatform = signal<string | null>(null);

  // Compose state
  composeBody = '';
  composeIncludeHashtags = true;
  composeGenerateCard = false;
  composeSchedule = '';
  composePlatforms = signal<Record<string, boolean>>({});
  composeImage: File | null = null;
  composeBusy = signal(false);
  composeError = signal('');
  composeResult = signal<AdHocPost | null>(null);

  ngOnInit(): void { this.loadAll(); }

  private loadAll(): void {
    this.loading.set(true);
    this.api.adminGetMarketingSettings().subscribe({
      next: s => {
        this.applySettings(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.adminGetMarketingToday().subscribe(t => this.today.set(t));
    this.api.adminGetMarketingHistory().subscribe(h => this.history.set(h));
    this.api.adminGetMarketingEligible().subscribe(e => this.eligible.set(e));
    this.api.adminGetMarketingPosts().subscribe(p => this.posts.set(p));
  }

  private applySettings(s: SocialSettings): void {
    this.settings.set(s);
    this.autoPostEnabled = s.autoPostEnabled;
    this.autoHashtagsEnabled = s.autoHashtagsEnabled;
    this.dailyQuoteCardsEnabled = s.dailyQuoteCardsEnabled;
    this.accountForms.set(s.accounts.map(a => this.toForm(a)));

    // Default compose targets: every connected + enabled platform.
    const picks: Record<string, boolean> = {};
    for (const a of s.accounts) picks[a.platform] = a.enabled && a.hasCredentials;
    this.composePlatforms.set(picks);
  }

  private toForm(a: SocialAccount): AccountForm {
    return {
      platform: a.platform, enabled: a.enabled,
      handle: a.handle ?? '', endpoint: a.endpoint ?? '', credential: '',
      ytClientId: '', ytClientSecret: '', ytRefresh: '',
      eveningEnabled: a.eveningEnabled, eveningPostHourLocal: a.eveningPostHourLocal, eveningPostMinuteLocal: a.eveningPostMinuteLocal,
      postHourLocal: a.postHourLocal, postMinuteLocal: a.postMinuteLocal, jitterMinutes: a.jitterMinutes,
      hasCredentials: a.hasCredentials, characterLimit: a.characterLimit, supportsImages: a.supportsImages,
      lastSuccessAt: a.lastSuccessAt, lastFailureAt: a.lastFailureAt,
      lastFailureMessage: a.lastFailureMessage, consecutiveFailures: a.consecutiveFailures,
      saving: false, savedMsg: '',
    };
  }

  // ── Settings actions ──────────────────────────────────────────────
  saveGlobal(): void {
    this.api.adminUpdateMarketingSettings({
      autoPostEnabled: this.autoPostEnabled,
      autoHashtagsEnabled: this.autoHashtagsEnabled,
      dailyQuoteCardsEnabled: this.dailyQuoteCardsEnabled,
    }).subscribe(s => {
      this.settings.set(s);
      this.globalMsg.set('Saved.');
      setTimeout(() => this.globalMsg.set(''), 2000);
    });
  }

  saveAccount(a: AccountForm): void {
    a.saving = true; a.savedMsg = '';
    this.accountForms.set([...this.accountForms()]);
    const payload = {
      enabled: a.enabled,
      handle: a.handle.trim() || null,
      endpoint: a.endpoint.trim() || null,
      // Bluesky uses an app password; everything else (Mastodon + the Meta
      // platforms) authenticates with an access token.
      appPassword: a.platform === 'Bluesky' ? (a.credential.trim() || null) : null,
      // Mastodon + the Meta platforms use a single access token; YouTube uses
      // its own three OAuth fields below (so its access-token slot stays null).
      accessToken: (a.platform !== 'Bluesky' && a.platform !== 'YouTube') ? (a.credential.trim() || null) : null,
      clientId: a.platform === 'YouTube' ? (a.ytClientId.trim() || null) : null,
      clientSecret: a.platform === 'YouTube' ? (a.ytClientSecret.trim() || null) : null,
      refreshToken: a.platform === 'YouTube' ? (a.ytRefresh.trim() || null) : null,
      eveningEnabled: a.eveningEnabled,
      eveningPostHourLocal: a.eveningPostHourLocal,
      eveningPostMinuteLocal: a.eveningPostMinuteLocal,
      postHourLocal: a.postHourLocal, postMinuteLocal: a.postMinuteLocal, jitterMinutes: a.jitterMinutes,
    };
    this.api.adminUpdateMarketingAccount(a.platform, payload).subscribe({
      next: s => {
        this.applySettings(s);
        const fresh = this.accountForms().find(x => x.platform === a.platform);
        if (fresh) { fresh.savedMsg = 'Saved.'; this.accountForms.set([...this.accountForms()]); }
        setTimeout(() => {
          const f = this.accountForms().find(x => x.platform === a.platform);
          if (f) { f.savedMsg = ''; this.accountForms.set([...this.accountForms()]); }
        }, 2000);
      },
      error: () => {
        a.saving = false; a.savedMsg = 'Save failed.';
        this.accountForms.set([...this.accountForms()]);
      },
    });
  }

  // ── Today actions ─────────────────────────────────────────────────
  fireNow(platform: string, slot = 'Morning'): void {
    this.busyPlatform.set(platform + ':' + slot);
    this.api.adminMarketingFireNow(platform, slot).subscribe({
      next: () => { this.busyPlatform.set(null); this.refreshToday(); },
      error: () => { this.busyPlatform.set(null); this.refreshToday(); },
    });
  }

  reroll(platform: string, slot = 'Morning'): void {
    this.api.adminMarketingReroll(platform, slot).subscribe(() => this.refreshToday());
  }

  private refreshToday(): void {
    this.api.adminGetMarketingToday().subscribe(t => this.today.set(t));
    this.api.adminGetMarketingEligible().subscribe(e => this.eligible.set(e));
    this.api.adminGetMarketingHistory().subscribe(h => this.history.set(h));
  }

  // ── Compose actions ───────────────────────────────────────────────
  toggleComposePlatform(platform: string): void {
    const cur = { ...this.composePlatforms() };
    cur[platform] = !cur[platform];
    this.composePlatforms.set(cur);
  }

  onImagePicked(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.composeImage = input.files?.[0] ?? null;
  }

  connectedPlatforms(): SocialAccount[] {
    return (this.settings()?.accounts ?? []).filter(a => a.hasCredentials);
  }

  canCompose(): boolean {
    const hasTarget = Object.values(this.composePlatforms()).some(v => v);
    return hasTarget && (this.composeBody.trim().length > 0 || !!this.composeImage);
  }

  submitCompose(): void {
    this.composeError.set('');
    this.composeResult.set(null);
    const selected = Object.entries(this.composePlatforms()).filter(([, v]) => v).map(([k]) => k);
    if (!selected.length) { this.composeError.set('Pick at least one platform.'); return; }

    const fd = new FormData();
    fd.append('Body', this.composeBody.trim());
    fd.append('IncludeHashtags', this.composeIncludeHashtags ? 'true' : 'false');
    fd.append('GenerateQuoteCard', (this.composeGenerateCard && !this.composeImage) ? 'true' : 'false');
    selected.forEach(p => fd.append('Platforms', p));
    if (this.composeSchedule) fd.append('ScheduledFor', new Date(this.composeSchedule).toISOString());
    if (this.composeImage) fd.append('Image', this.composeImage, this.composeImage.name);

    this.composeBusy.set(true);
    this.api.adminCreateMarketingPost(fd).subscribe({
      next: post => {
        this.composeBusy.set(false);
        this.composeResult.set(post);
        this.composeBody = '';
        this.composeImage = null;
        this.composeSchedule = '';
        this.api.adminGetMarketingPosts().subscribe(p => this.posts.set(p));
      },
      error: err => {
        this.composeBusy.set(false);
        this.composeError.set(err?.error?.error ?? 'Post failed.');
      },
    });
  }

  // ── View helpers ──────────────────────────────────────────────────
  lowPool(): boolean { return this.eligible().some(e => e.count < 10); }
  statusClass(status: string): string { return `mk-status-${status}`; }

  connectHint(platform: string): string {
    if (platform === 'Bluesky')
      return 'Create an App Password at Settings → Privacy and Security → App Passwords on bsky.app — not your account password.';
    if (platform === 'Mastodon')
      return 'On your instance: Preferences → Development → New application with write:statuses + write:media, then copy the access token.';
    if (platform === 'Threads')
      return 'Paste your long-lived Threads access token (threads_basic + threads_content_publish). I’ll walk you through generating it in the Meta developer portal.';
    if (platform === 'Facebook')
      return 'Paste your Facebook Page access token (pages_manage_posts). Posts go to your Page, not your personal profile. I’ll walk you through getting it.';
    if (platform === 'Instagram')
      return 'Paste a Page/user access token (instagram_content_publish) for the IG Business account linked to your Page. Image-only. I’ll walk you through it.';
    if (platform === 'YouTube')
      return 'Posts a daily themed Short (video). Paste your OAuth Client ID + Secret and a refresh token with the youtube.upload scope — I’ll walk you through the Google Cloud setup.';
    return '';
  }
  handlePlaceholder(platform: string): string {
    if (platform === 'Bluesky') return 'alice.bsky.social';
    if (platform === 'Mastodon') return '@alice@mastodon.social';
    return '@creatorcompanion';   // Threads/Facebook/Instagram: display only
  }
  credentialLabel(platform: string): string {
    if (platform === 'Bluesky') return 'App password';
    return 'Access token';   // Mastodon + all Meta platforms
  }
  needsEndpoint(platform: string): boolean { return platform === 'Mastodon'; }
}
