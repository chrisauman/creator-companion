import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-admin-user-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="admin-page">
      <header class="admin-header">
        <h1>Admin Dashboard</h1>
        <a routerLink="/dashboard" class="btn btn--ghost btn--sm">← Back to App</a>
      </header>

      <nav class="admin-nav">
        <a routerLink="/admin" class="admin-nav__link">Overview</a>
        <a routerLink="/admin/users" class="admin-nav__link">Users</a>
        <span class="admin-nav__link admin-nav__link--active">User Detail</span>
        <a routerLink="/admin/reminders" class="admin-nav__link">Notifications</a>
        <a routerLink="/admin/emails" class="admin-nav__link">Emails</a>
        <a routerLink="/admin/faq" class="admin-nav__link">FAQ</a>
        <a routerLink="/admin/prompts" class="admin-nav__link">Daily Prompts</a>
      </nav>

      @if (loading()) {
        <p class="text-muted">Loading…</p>
      } @else if (user()) {
        <div class="detail-layout">

          <!-- ── Edit card ─────────────────────────────────────── -->
          <div class="card user-card">
            <div class="card-header">
              <h2>{{ user().firstName }} {{ user().lastName }}</h2>
              <span class="badge" [class.badge--paid]="user().tier === 'Paid'">{{ user().tier }}</span>
            </div>
            <p class="text-muted text-sm" style="margin-bottom:1.25rem">{{ user().email }}</p>

            <form (ngSubmit)="saveUser()" #editForm="ngForm">
              <div class="form-section">
                <h3 class="section-title">Account</h3>

                <div class="field">
                  <label>First name</label>
                  <input type="text" [(ngModel)]="form.firstName" name="firstName"
                         required minlength="1" maxlength="60" />
                </div>

                <div class="field">
                  <label>Last name</label>
                  <input type="text" [(ngModel)]="form.lastName" name="lastName"
                         required minlength="1" maxlength="60" />
                </div>

                <div class="field">
                  <label>Email</label>
                  <input type="email" [(ngModel)]="form.email" name="email"
                         required maxlength="256" />
                </div>

                <div class="field">
                  <label>New Password <span class="field-hint">(leave blank to keep current)</span></label>
                  <input type="password" [(ngModel)]="form.newPassword" name="newPassword"
                         minlength="8" maxlength="100" autocomplete="new-password" />
                </div>

                <div class="field">
                  <label>Tier</label>
                  <select [(ngModel)]="form.tier" name="tier">
                    <option value="Free">Free</option>
                    <option value="Paid">Paid</option>
                  </select>
                </div>

                <div class="field">
                  <label>Timezone</label>
                  <input type="text" [(ngModel)]="form.timeZoneId" name="timeZoneId"
                         required maxlength="100" />
                </div>

                <div class="field">
                  <label>Trial Ends At <span class="field-hint">(optional)</span></label>
                  <input type="datetime-local" [(ngModel)]="form.trialEndsAt" name="trialEndsAt" />
                </div>
              </div>

              <div class="form-section">
                <h3 class="section-title">Flags</h3>
                <div class="toggle-row">
                  <label class="toggle">
                    <input type="checkbox" [(ngModel)]="form.isActive" name="isActive" />
                    <span>Active</span>
                  </label>
                  <label class="toggle">
                    <input type="checkbox" [(ngModel)]="form.isAdmin" name="isAdmin" />
                    <span>Admin</span>
                  </label>
                  <label class="toggle">
                    <input type="checkbox" [(ngModel)]="form.onboardingCompleted" name="onboardingCompleted" />
                    <span>Onboarding complete</span>
                  </label>
                </div>
              </div>

              <div class="action-row">
                <button type="submit" class="btn btn--primary btn--sm" [disabled]="saving()">
                  {{ saving() ? 'Saving…' : 'Save Changes' }}
                </button>
                <button type="button" class="btn btn--ghost btn--sm" (click)="resetForm()" [disabled]="saving()">
                  Reset
                </button>
              </div>

              @if (actionMsg()) {
                <p class="action-msg text-sm" [class.text-success]="!actionError()" [class.text-danger]="actionError()">
                  {{ actionMsg() }}
                </p>
              }
            </form>

            <!-- ── Pause controls ────────────────────────────────── -->
            <div class="form-section">
              <h3 class="section-title">Streak Pauses</h3>
              <p class="text-sm text-muted" style="margin-bottom:.75rem">
                {{ user().pauseDaysUsedThisMonth }} / 10 days used this month
              </p>

              @if (user().activePause) {
                <p class="text-sm" style="margin-bottom:.5rem">
                  Active pause: {{ user().activePause.startDate | date:'mediumDate' }}
                  – {{ user().activePause.endDate | date:'mediumDate' }}
                  @if (user().activePause.reason) { · <em>{{ user().activePause.reason }}</em> }
                </p>
                <button class="btn btn--ghost btn--sm" [disabled]="saving()" (click)="cancelPause()">
                  Cancel pause
                </button>
              } @else {
                <p class="text-sm text-muted">No active pause.</p>
              }

              <button class="btn btn--ghost btn--sm" style="margin-top:.5rem" [disabled]="saving()" (click)="clearAllPauses()">
                Clear pause history
              </button>
            </div>

            <!-- ── Stats ─────────────────────────────────────────── -->
            <div class="form-section">
              <h3 class="section-title">Stats</h3>
              <dl class="detail-list">
                <dt>Entries</dt><dd>{{ user().entryCount }}</dd>
                <dt>Journals</dt><dd>{{ user().journalCount }}</dd>
                <dt>Joined</dt><dd>{{ user().createdAt | date:'medium' }}</dd>
                <dt>Last updated</dt><dd>{{ user().updatedAt | date:'medium' }}</dd>
              </dl>
            </div>

            <!-- ── Push subscriptions ───────────────────────────── -->
            <div class="form-section">
              <h3 class="section-title">Push Devices</h3>
              @if (pushLoading()) {
                <p class="text-sm text-muted">Loading…</p>
              } @else if (pushSubs().length === 0) {
                <p class="text-sm text-muted">No push subscriptions registered.</p>
              } @else {
                <div class="push-list">
                  @for (s of pushSubs(); track s.id) {
                    <div class="push-row">
                      <div>
                        <span class="push-platform">{{ s.platform }}</span>
                        <span class="push-endpoint text-muted">{{ s.endpointPreview }}</span>
                      </div>
                      <div class="text-muted" style="font-size:.75rem">
                        Last seen {{ s.lastSeenAt | date:'mediumDate' }}
                      </div>
                    </div>
                  }
                </div>
              }
              <div class="action-row" style="margin-top:.875rem">
                <button class="btn btn--secondary btn--sm" [disabled]="testingPush()"
                        (click)="sendTestNotification()">
                  {{ testingPush() ? 'Sending…' : '🔔 Send test notification' }}
                </button>
              </div>
              @if (testResult()) {
                <p class="text-sm action-msg" [class.text-success]="!testFailed()" [class.text-danger]="testFailed()">
                  {{ testResult() }}
                </p>
              }
            </div>

            <!-- ── Danger zone ───────────────────────────────────── -->
            <div class="danger-zone">
              <h3 class="section-title section-title--danger">Danger Zone</h3>
              @if (!showDeleteConfirm()) {
                <button class="btn btn--danger btn--sm" (click)="showDeleteConfirm.set(true)">
                  Delete User Account
                </button>
              } @else {
                <p class="text-sm" style="margin-bottom:.5rem">
                  This permanently deletes <strong>{{ user().email }}</strong> and all their data.
                  Type their email to confirm:
                </p>
                <div class="delete-confirm-row">
                  <input type="text" [(ngModel)]="deleteConfirmText" name="deleteConfirmText"
                         placeholder="{{ user().email }}" class="input-sm" />
                  <button class="btn btn--danger btn--sm"
                          [disabled]="deleteConfirmText !== user().email || deleting()"
                          (click)="deleteUser()">
                    {{ deleting() ? 'Deleting…' : 'Permanently Delete' }}
                  </button>
                  <button class="btn btn--ghost btn--sm" (click)="showDeleteConfirm.set(false); deleteConfirmText = ''">
                    Cancel
                  </button>
                </div>
                @if (deleteError()) {
                  <p class="text-sm text-danger" style="margin-top:.5rem">{{ deleteError() }}</p>
                }
              }
            </div>
          </div>

          <!-- ── Entries panel ──────────────────────────────────── -->
          <div class="entries-panel">
            <div class="entries-header">
              <h3>Entries</h3>
              @if (entryTotal() > 0) {
                <span class="entries-count text-muted text-sm">
                  Showing {{ entries().length }} of {{ entryTotal() }}
                </span>
              }
            </div>
            @if (entriesLoading() && entries().length === 0) {
              <p class="text-muted text-sm">Loading entries…</p>
            } @else if (entries().length === 0) {
              <p class="text-muted text-sm">No entries yet.</p>
            } @else {
              <div class="entries-list">
                @for (e of entries(); track e.id) {
                  <div class="entry-row card">
                    <div class="entry-row__meta text-sm text-muted">
                      {{ e.entryDate | date:'mediumDate' }} · {{ e.wordCount }} words · {{ e.source }}
                    </div>
                    <p class="entry-row__preview text-sm">{{ e.preview }}</p>
                  </div>
                }
              </div>
              @if (entries().length < entryTotal()) {
                <div class="load-more-row">
                  <button class="btn btn--ghost btn--sm" [disabled]="entriesLoading()" (click)="loadMoreEntries()">
                    {{ entriesLoading() ? 'Loading…' : 'Show more' }}
                  </button>
                </div>
              }
            }
          </div>
        </div>
      }

      @if (error()) {
        <div class="alert alert--error">{{ error() }}</div>
      }
    </div>
  `,
  styles: [`
    .admin-page { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
    .admin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    .admin-header h1 { font-size: 1.5rem; margin: 0; }
    .admin-nav { display: flex; gap: .25rem; margin-bottom: 2rem; border-bottom: 1px solid var(--color-border); padding-bottom: .75rem; }
    .admin-nav__link { padding: .4rem .9rem; border-radius: 6px; text-decoration: none; color: var(--color-text-muted); font-size: .875rem; }
    .admin-nav__link:hover, .admin-nav__link--active { background: var(--color-surface); color: var(--color-text); }

    .detail-layout { display: grid; grid-template-columns: 360px 1fr; gap: 1.5rem; align-items: start; }
    @media (max-width: 720px) { .detail-layout { grid-template-columns: 1fr; } }

    .user-card { padding: 1.5rem; }
    .card-header { display: flex; align-items: center; gap: .75rem; margin-bottom: .25rem; }
    .card-header h2 { font-size: 1.25rem; margin: 0; }

    .form-section { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--color-border); }
    .section-title { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
                     color: var(--color-text-muted); margin: 0 0 .75rem; }
    .section-title--danger { color: #991b1b; }

    .field { margin-bottom: .85rem; }
    .field label { display: block; font-size: .8rem; font-weight: 600; margin-bottom: .3rem; color: var(--color-text); }
    .field-hint { font-weight: 400; color: var(--color-text-muted); }
    .field input, .field select {
      width: 100%; padding: .45rem .6rem; font-size: .875rem;
      border: 1px solid var(--color-border); border-radius: 6px;
      background: var(--color-background); color: var(--color-text);
      box-sizing: border-box;
    }
    .field input:focus, .field select:focus { outline: none; border-color: var(--color-accent); }

    .toggle-row { display: flex; flex-direction: column; gap: .5rem; }
    .toggle { display: flex; align-items: center; gap: .5rem; font-size: .875rem; cursor: pointer; }
    .toggle input[type=checkbox] { width: 1rem; height: 1rem; accent-color: var(--color-accent); cursor: pointer; }

    .action-row { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: 1rem; }
    .action-msg { margin-top: .75rem; }
    .text-success { color: #166534; }
    .text-danger { color: #991b1b; }

    .detail-list { display: grid; grid-template-columns: auto 1fr; gap: .35rem .75rem; font-size: .825rem; margin: 0; }
    .detail-list dt { color: var(--color-text-muted); font-weight: 500; }

    .danger-zone { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid #fca5a5; }
    .delete-confirm-row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin-top: .5rem; }
    .input-sm { padding: .4rem .6rem; font-size: .875rem; border: 1px solid var(--color-border);
                border-radius: 6px; background: var(--color-background); color: var(--color-text); }

    .badge { display: inline-block; padding: .15rem .5rem; border-radius: 999px; font-size: .7rem;
             font-weight: 600; background: var(--color-surface); color: var(--color-text-muted); }
    .badge--paid { background: #d4f0e0; color: #166534; }

    .entries-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 1rem; }
    .entries-header h3 { font-size: 1rem; margin: 0; }
    .entries-count { }
    .entries-list { display: flex; flex-direction: column; gap: .75rem; }
    .entry-row { padding: .75rem 1rem; }
    .entry-row__meta { margin-bottom: .25rem; }
    .entry-row__preview { margin: 0; color: var(--color-text-muted); }
    .load-more-row { text-align: center; margin-top: 1rem; }

    .btn--danger { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .btn--danger:hover:not(:disabled) { background: #fca5a5; }

    .push-list { display: flex; flex-direction: column; gap: .5rem; }
    .push-row { display: flex; flex-direction: column; gap: .15rem; padding: .5rem .625rem;
                background: var(--color-surface-2); border-radius: 6px;
                border: 1px solid var(--color-border); font-size: .8125rem; }
    .push-platform { font-weight: 600; text-transform: uppercase; font-size: .7rem;
                     letter-spacing: .05em; color: var(--color-accent-dark); margin-right: .4rem; }
    .push-endpoint { font-size: .75rem; word-break: break-all; }
  `]
})
export class AdminUserDetailComponent implements OnInit {
  private api    = inject(ApiService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  user           = signal<any>(null);
  entries        = signal<any[]>([]);
  entryTotal     = signal(0);
  loading        = signal(true);
  entriesLoading = signal(true);
  saving         = signal(false);
  deleting       = signal(false);
  error          = signal('');
  actionMsg      = signal('');
  actionError    = signal(false);
  showDeleteConfirm = signal(false);
  deleteConfirmText = '';
  deleteError    = signal('');

  pushSubs     = signal<any[]>([]);
  pushLoading  = signal(true);
  testingPush  = signal(false);
  testResult   = signal('');
  testFailed   = signal(false);

  private readonly pageSize = 10;
  private currentPage = 1;

  form: {
    firstName: string; lastName: string; email: string; newPassword: string; tier: string;
    timeZoneId: string; isAdmin: boolean; isActive: boolean;
    onboardingCompleted: boolean; trialEndsAt: string;
  } = { firstName: '', lastName: '', email: '', newPassword: '', tier: 'Free', timeZoneId: '', isAdmin: false, isActive: true, onboardingCompleted: false, trialEndsAt: '' };

  private userId = '';

  ngOnInit() {
    this.userId = this.route.snapshot.paramMap.get('id')!;
    this.api.adminGetUser(this.userId).subscribe({
      next: u => { this.user.set(u); this.populateForm(u); this.loading.set(false); },
      error: () => { this.error.set('Failed to load user.'); this.loading.set(false); }
    });
    this.api.adminGetUserEntries(this.userId, 1, this.pageSize).subscribe({
      next: res => { this.entries.set(res.entries); this.entryTotal.set(res.total); this.entriesLoading.set(false); },
      error: () => this.entriesLoading.set(false)
    });
    this.api.adminGetPushSubscriptions(this.userId).subscribe({
      next: subs => { this.pushSubs.set(subs); this.pushLoading.set(false); },
      error: () => this.pushLoading.set(false)
    });
  }

  loadMoreEntries() {
    this.entriesLoading.set(true);
    this.currentPage++;
    this.api.adminGetUserEntries(this.userId, this.currentPage, this.pageSize).subscribe({
      next: res => {
        this.entries.update(existing => [...existing, ...res.entries]);
        this.entryTotal.set(res.total);
        this.entriesLoading.set(false);
      },
      error: () => this.entriesLoading.set(false)
    });
  }

  private populateForm(u: any) {
    this.form = {
      firstName: u.firstName ?? '',
      lastName:  u.lastName ?? '',
      email: u.email,
      newPassword: '',
      tier: u.tier,
      timeZoneId: u.timeZoneId,
      isAdmin: u.isAdmin,
      isActive: u.isActive,
      onboardingCompleted: u.onboardingCompleted,
      trialEndsAt: u.trialEndsAt ? new Date(u.trialEndsAt).toISOString().slice(0, 16) : ''
    };
  }

  resetForm() {
    this.populateForm(this.user());
    this.actionMsg.set('');
  }

  saveUser() {
    this.saving.set(true);
    this.actionMsg.set('');

    const payload: any = {
      firstName: this.form.firstName,
      lastName:  this.form.lastName,
      email: this.form.email,
      tier: this.form.tier,
      timeZoneId: this.form.timeZoneId,
      isAdmin: this.form.isAdmin,
      isActive: this.form.isActive,
      onboardingCompleted: this.form.onboardingCompleted,
      trialEndsAt: this.form.trialEndsAt ? new Date(this.form.trialEndsAt).toISOString() : null
    };
    if (this.form.newPassword) payload['newPassword'] = this.form.newPassword;

    this.api.adminUpdateUser(this.userId, payload).subscribe({
      next: updated => {
        this.user.update(u => ({ ...u, ...updated }));
        this.form.newPassword = '';
        this.actionMsg.set('Changes saved.');
        this.actionError.set(false);
        this.saving.set(false);
      },
      error: err => {
        const msg = err?.error?.error ?? 'Failed to save changes.';
        this.actionMsg.set(msg);
        this.actionError.set(true);
        this.saving.set(false);
      }
    });
  }

  cancelPause() {
    this.saving.set(true);
    this.api.adminCancelUserPause(this.userId).subscribe({
      next: () => {
        this.user.update(u => ({ ...u, activePause: null }));
        this.actionMsg.set('Pause cancelled.'); this.actionError.set(false); this.saving.set(false);
      },
      error: () => { this.actionMsg.set('Failed to cancel pause.'); this.actionError.set(true); this.saving.set(false); }
    });
  }

  clearAllPauses() {
    if (!confirm('Delete all pause history for this user? This resets their monthly usage to 0.')) return;
    this.saving.set(true);
    this.api.adminClearAllPauses(this.userId).subscribe({
      next: () => {
        this.user.update(u => ({ ...u, activePause: null, pauseDaysUsedThisMonth: 0 }));
        this.actionMsg.set('Pause history cleared.'); this.actionError.set(false); this.saving.set(false);
      },
      error: () => { this.actionMsg.set('Failed to clear pause history.'); this.actionError.set(true); this.saving.set(false); }
    });
  }

  sendTestNotification(): void {
    this.testingPush.set(true);
    this.testResult.set('');
    this.api.adminSendTestNotification(this.userId).subscribe({
      next: res => {
        this.testResult.set(res.message);
        this.testFailed.set(res.sent === 0);
        this.testingPush.set(false);
        // Refresh subscription list in case any expired ones were removed
        this.api.adminGetPushSubscriptions(this.userId).subscribe({
          next: subs => this.pushSubs.set(subs)
        });
      },
      error: () => {
        this.testResult.set('Failed to send test notification.');
        this.testFailed.set(true);
        this.testingPush.set(false);
      }
    });
  }

  deleteUser() {
    if (this.deleteConfirmText !== this.user().email) return;
    this.deleting.set(true);
    this.deleteError.set('');
    this.api.adminDeleteUser(this.userId).subscribe({
      next: () => this.router.navigate(['/admin/users']),
      error: () => { this.deleteError.set('Failed to delete user. Please try again.'); this.deleting.set(false); }
    });
  }
}
