import { Component, EventEmitter, Input, Output, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { PushService } from '../../core/services/push.service';
import { Reminder } from '../../core/models/models';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

const DEFAULT_REMINDER_MESSAGE = 'Remember to log an entry to keep your streak alive.';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SidebarComponent, MobileNavComponent],
  template: `
    <div class="page" [class.page--embedded]="embedded">

      <!-- Page chrome — hidden when embedded inside the dashboard right column -->
      @if (!embedded) {
        <app-sidebar active="notifications" />
        <header class="topbar">
          <a class="topbar__brand" routerLink="/dashboard">
            <img src="logo-icon.png" alt="" class="topbar__brand-icon">
            <span class="topbar__brand-name">Creator Companion</span>
          </a>
        </header>
        <app-mobile-nav active="notifications" />
      }

      <main class="main-content">

        <!-- Reader-style top bar when embedded -->
        @if (embedded) {
          <div class="reader-top">
            <button class="cancel-pill" type="button" (click)="returnToToday.emit()">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/>
              </svg>
              Today
            </button>
            <div class="reader-top__breadcrumb"><strong>Notifications</strong></div>
            <div class="reader-top__actions"></div>
          </div>
        }

        <div class="page-header" [class.page-header--embedded]="embedded">
          <h1 class="page-title">Notifications</h1>
          <p class="page-sub">Manage how and when you receive reminders.</p>
        </div>

        <!-- Push permissions card -->
        <section class="card">
          <div class="section-head">
            <h2>This device</h2>
          </div>

          @if (!pushSupported()) {
            <p class="text-muted text-sm">Push notifications are not supported in this browser.</p>
          } @else if (!pushEnabled()) {
            <div class="push-prompt">
              <p class="text-sm">Enable notifications on this device to receive daily reminders.</p>
              <button class="btn btn--secondary btn--sm" (click)="enablePush()" [disabled]="pushWorking()">
                {{ pushWorking() ? 'Enabling…' : '🔔 Enable notifications' }}
              </button>
              <p class="text-sm text-muted" *ngIf="pushDenied()">
                Notifications are blocked. Please allow them in your browser/device settings and try again.
              </p>
            </div>
          } @else {
            <div class="push-active">
              <span class="push-dot"></span>
              <span class="text-sm">Notifications enabled on this device</span>
              <button class="btn btn--ghost btn--sm" (click)="disablePush()" [disabled]="pushWorking()">
                Disable
              </button>
            </div>
          }
        </section>

        <!-- Reminders card -->
        <section class="card">
          <div class="section-head">
            <h2>Reminder times</h2>
          </div>

          @if (remindersLoading()) {
            <p class="text-muted text-sm">Loading…</p>
          }

          <!-- FREE TIER -->
          @if (!remindersLoading() && user()?.tier === 'Free') {
            <div class="reminder-free-row">
              <div class="reminder-free-info">
                <p class="reminder-time-label">Daily at 12:00 PM</p>
                <p class="text-sm text-muted">"{{ defaultReminderMessage }}"</p>
              </div>
              @if (defaultReminder()) {
                <label class="toggle-switch">
                  <input type="checkbox" [checked]="defaultReminder()!.isEnabled"
                         [disabled]="reminderWorking()" (change)="toggleReminder(defaultReminder()!)" />
                  <span class="toggle-track"><span class="toggle-thumb"></span></span>
                </label>
              }
            </div>
            <p class="upgrade-note text-sm text-muted">
              Upgrade to Paid to set custom reminder times and add up to 5 additional reminders.
            </p>
          }

          <!-- PAID TIER -->
          @if (!remindersLoading() && user()?.tier === 'Paid') {

            <!-- Default reminder card -->
            @if (defaultReminder(); as dr) {
              <div class="reminder-card reminder-card--default">
                <div class="reminder-card__header">
                  <span class="default-badge">Default reminder</span>
                  @if (customReminders().length > 0 && !dr.isEnabled) {
                    <span class="text-sm text-muted">Off — your custom reminders are active</span>
                  }
                </div>
                <div class="reminder-card__fields">
                  <div class="field-group">
                    <label class="field-label">Time</label>
                    <input type="time" class="time-input"
                           [ngModel]="drafts[dr.id]?.time ?? dr.time"
                           (ngModelChange)="draftChange(dr.id, 'time', $event)" />
                  </div>
                  <div class="field-group reminder-msg-group">
                    <label class="field-label">Message <span class="optional">(optional)</span></label>
                    <input type="text" class="text-input"
                           [placeholder]="defaultReminderMessage"
                           maxlength="200"
                           [ngModel]="drafts[dr.id]?.message ?? (dr.message ?? '')"
                           (ngModelChange)="draftChange(dr.id, 'message', $event)" />
                  </div>
                </div>
                <div class="reminder-card__actions">
                  <label class="toggle-switch">
                    <input type="checkbox" [checked]="dr.isEnabled"
                           [disabled]="reminderWorking()" (change)="toggleReminder(dr)" />
                    <span class="toggle-track"><span class="toggle-thumb"></span></span>
                  </label>
                  <button class="btn btn--primary btn--sm"
                          [disabled]="reminderWorking() || !hasDraftChanges(dr)"
                          (click)="saveReminder(dr)">Save</button>
                </div>
              </div>
            }

            <!-- Custom reminders -->
            @if (customReminders().length > 0) {
              <div class="reminders-section-label">Custom reminders</div>
              <div class="reminders-list">
                @for (r of customReminders(); track r.id) {
                  <div class="reminder-card">
                    <div class="reminder-card__fields">
                      <div class="field-group">
                        <label class="field-label">Time</label>
                        <input type="time" class="time-input"
                               [ngModel]="drafts[r.id]?.time ?? r.time"
                               (ngModelChange)="draftChange(r.id, 'time', $event)" />
                      </div>
                      <div class="field-group reminder-msg-group">
                        <label class="field-label">Message <span class="optional">(optional)</span></label>
                        <input type="text" class="text-input"
                               [placeholder]="defaultReminderMessage"
                               maxlength="200"
                               [ngModel]="drafts[r.id]?.message ?? (r.message ?? '')"
                               (ngModelChange)="draftChange(r.id, 'message', $event)" />
                      </div>
                    </div>
                    <div class="reminder-card__actions">
                      <label class="toggle-switch">
                        <input type="checkbox" [checked]="r.isEnabled"
                               [disabled]="reminderWorking()" (change)="toggleReminder(r)" />
                        <span class="toggle-track"><span class="toggle-thumb"></span></span>
                      </label>
                      <button class="btn btn--primary btn--sm"
                              [disabled]="reminderWorking() || !hasDraftChanges(r)"
                              (click)="saveReminder(r)">Save</button>
                      <button class="btn btn--ghost btn--sm"
                              [disabled]="reminderWorking()" (click)="deleteReminder(r)">Delete</button>
                    </div>
                  </div>
                }
              </div>
            }

            @if (customReminders().length < 5) {
              <button class="btn btn--secondary btn--sm" style="margin-top:.875rem"
                      [disabled]="reminderWorking()" (click)="addReminder()">
                + Add custom reminder
              </button>
              @if (customReminders().length === 0) {
                <p class="text-sm text-muted" style="margin-top:.375rem">
                  Adding a custom reminder will turn off the default noon reminder.
                </p>
              }
            }
          }

          @if (reminderError()) {
            <p class="alert alert--error" style="margin-top:.75rem">{{ reminderError() }}</p>
          }
        </section>

      </main>
    </div>
  `,
  styles: [`
    /* ── Page shell ─────────────────────────────────────────────── */
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    @media (min-width: 768px) { .page { flex-direction: row; } }
    /* Embedded mode — the dashboard's right column hosts this component. */
    .page--embedded { min-height: 0; flex-direction: column; }
    .page--embedded .main-content {
      padding: 0 !important;
      background: transparent !important;
    }
    .page--embedded .page-header { padding: 1.5rem 2rem 0; margin-bottom: 1rem; }

    /* ── Reader-style top bar (embedded only) ───────────────────── */
    .reader-top {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: 1rem 1.75rem;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
      position: sticky; top: 0;
      z-index: 5;
    }
    .cancel-pill {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: rgba(18,196,227,.1);
      color: var(--color-accent-dark);
      border: 1px solid rgba(18,196,227,.25);
      padding: .375rem .75rem;
      border-radius: 999px;
      font-size: .75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      cursor: pointer;
      font-family: inherit;
      transition: all .15s;
    }
    .cancel-pill:hover { background: var(--color-accent); color: #0c0e13; border-color: var(--color-accent); }
    .reader-top__breadcrumb { flex: 1; text-align: center; font-size: .8125rem; color: var(--color-text-3); }
    .reader-top__breadcrumb strong { color: var(--color-text); font-weight: 600; }
    .reader-top__actions { display: flex; gap: .5rem; flex-shrink: 0; min-width: 36px; }

    /* ── Mobile top bar ──────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 100;
      background: #111318;
      border-bottom: 1px solid rgba(255,255,255,.07);
      height: 52px;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 1.125rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; }
    .topbar__brand-icon { height: 24px; width: auto; display: block; }
    .topbar__brand-name { font-family: var(--font-sans); font-size: .9375rem; font-weight: 700; color: #fff; }

    /* ── Main content ────────────────────────────────────────────── */
    .main-content {
      flex: 1; min-width: 0;
      padding: 1.25rem 1rem calc(80px + env(safe-area-inset-bottom, 0px));
      background: var(--color-bg);
    }
    @media (min-width: 768px) {
      .main-content { padding: 2.5rem 3rem 4rem; background: #f7f7f5; }
    }

    /* ── Page header ─────────────────────────────────────────────── */
    .page-header { margin-bottom: 1.75rem; }
    .page-header--embedded { margin-bottom: 1.25rem; }
    .page-title {
      font-family: var(--font-sans);
      font-size: 1.625rem; font-weight: 800;
      letter-spacing: -.02em;
      color: var(--color-text);
      margin: 0 0 .25rem;
    }
    .page-sub { font-size: .9375rem; color: var(--color-text-2); margin: 0; line-height: 1.5; }

    /* ── Cards (modernized) ──────────────────────────────────────── */
    .card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 16px;
      padding: 1.5rem 1.625rem;
      margin-bottom: 1rem;
      transition: border-color .15s, box-shadow .15s;
    }
    .card:hover { border-color: var(--color-text-3); }

    .section-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 1.25rem;
      gap: 1rem;
    }
    .section-head h2 {
      font-family: var(--font-sans);
      font-size: 1.0625rem;
      font-weight: 700;
      letter-spacing: -.005em;
      margin: 0;
      color: var(--color-text);
    }

    /* ── Push section ────────────────────────────────────────────── */
    .push-prompt { display: flex; flex-direction: column; gap: .75rem; align-items: flex-start; }
    .push-prompt p { color: var(--color-text-2); line-height: 1.5; margin: 0; }
    .push-active {
      display: inline-flex;
      align-items: center;
      gap: .625rem;
      background: rgba(34,197,94,.08);
      border: 1px solid rgba(34,197,94,.25);
      color: #166534;
      border-radius: 999px;
      padding: .5rem .875rem;
      font-size: .8125rem;
      font-weight: 600;
    }
    .push-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #22c55e; flex-shrink: 0;
      box-shadow: 0 0 8px #22c55e;
    }
    .push-active .btn { margin-left: auto; }

    /* ── Reminder cards ──────────────────────────────────────────── */
    .reminder-free-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; padding: 1rem 1.125rem;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      margin-bottom: .75rem;
    }
    .reminder-free-info { flex: 1; }
    .reminder-time-label {
      font-size: 1rem; font-weight: 700; margin: 0 0 .2rem;
      color: var(--color-text);
    }
    .reminder-free-info .text-sm { color: var(--color-text-2); }
    .upgrade-note {
      display: block;
      padding: .75rem 1rem;
      background: rgba(18,196,227,.06);
      border: 1px solid rgba(18,196,227,.2);
      border-radius: 12px;
      color: var(--color-accent-dark);
      font-size: .8125rem;
      line-height: 1.5;
      margin-top: .25rem;
    }

    .reminders-section-label {
      font-size: .6875rem; font-weight: 700; color: var(--color-text-3);
      text-transform: uppercase; letter-spacing: .14em;
      margin-top: 1rem; margin-bottom: .625rem;
    }
    .reminders-list { display: flex; flex-direction: column; gap: .75rem; }
    .reminder-card {
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      padding: 1.125rem 1.25rem;
      display: flex; flex-direction: column; gap: 1rem;
      transition: border-color .15s;
    }
    .reminder-card:hover { border-color: var(--color-text-3); }
    .reminder-card--default {
      background: linear-gradient(135deg, rgba(18,196,227,.04), rgba(18,196,227,.08));
      border-color: rgba(18,196,227,.3);
    }
    .reminder-card--default:hover { border-color: rgba(18,196,227,.5); }
    .reminder-card__header { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
    .default-badge {
      display: inline-flex;
      align-items: center;
      gap: .25rem;
      font-size: .625rem; font-weight: 700;
      padding: .25rem .625rem;
      border-radius: 999px;
      background: var(--color-accent);
      color: #0c0e13;
      letter-spacing: .08em;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .reminder-card__fields {
      display: grid; grid-template-columns: 120px 1fr; gap: .875rem; align-items: end;
    }
    @media (max-width: 500px) { .reminder-card__fields { grid-template-columns: 1fr; } }
    .reminder-card__actions {
      display: flex; align-items: center; gap: .75rem;
      padding-top: .75rem;
      border-top: 1px solid var(--color-border);
    }
    .reminder-card--default .reminder-card__actions {
      border-top-color: rgba(18,196,227,.2);
    }
    .reminder-card__actions .btn { margin-left: auto; }

    .field-group { display: flex; flex-direction: column; gap: .375rem; }
    .reminder-msg-group { min-width: 0; }
    .field-label {
      font-size: .6875rem; font-weight: 700;
      color: var(--color-text-3);
      text-transform: uppercase;
      letter-spacing: .1em;
    }
    .optional { font-weight: 500; color: var(--color-text-3); text-transform: none; letter-spacing: 0; }
    .time-input,
    .text-input {
      width: 100%; padding: .5rem .875rem; font-size: .875rem;
      border: 1px solid var(--color-border); border-radius: 999px;
      background: var(--color-surface); color: var(--color-text);
      font-family: var(--font-sans); box-sizing: border-box;
      transition: border-color .15s, background .15s;
    }
    .time-input:focus,
    .text-input:focus {
      outline: none;
      border-color: var(--color-accent);
      background: var(--color-surface);
    }
    .text-input::placeholder { color: var(--color-text-3); }

    /* ── Toggle switch (refined) ─────────────────────────────────── */
    .toggle-switch {
      position: relative;
      display: inline-flex;
      align-items: center;
      cursor: pointer;
      flex-shrink: 0;
    }
    .toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
    .toggle-track {
      width: 42px; height: 24px;
      background: var(--color-border);
      border-radius: 999px;
      position: relative;
      transition: background .2s;
      flex-shrink: 0;
    }
    .toggle-switch input:checked + .toggle-track { background: var(--color-accent); }
    .toggle-thumb {
      position: absolute; top: 3px; left: 3px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #fff;
      transition: transform .2s;
      box-shadow: 0 1px 4px rgba(0,0,0,.2);
    }
    .toggle-switch input:checked + .toggle-track .toggle-thumb { transform: translateX(18px); }
    .toggle-switch input:disabled + .toggle-track { opacity: .5; cursor: not-allowed; }

    /* ── Add reminder button ─────────────────────────────────────── */
    .add-reminder-btn {
      width: 100%;
      margin-top: .75rem;
      padding: .75rem;
      background: transparent;
      border: 1px dashed var(--color-border);
      border-radius: 14px;
      color: var(--color-text-2);
      font-family: var(--font-sans);
      font-size: .875rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color .15s, color .15s, background .15s;
    }
    .add-reminder-btn:hover:not(:disabled) {
      border-color: var(--color-accent);
      border-style: solid;
      color: var(--color-accent-dark);
      background: rgba(18,196,227,.04);
    }
    .add-reminder-btn:disabled { opacity: .5; cursor: not-allowed; }
  `]
})
export class NotificationsComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);
  private push = inject(PushService);

  /** When true, the component is rendered inside the dashboard's right
   *  column rather than as the /notifications page. */
  @Input() embedded = false;

  /** Emitted when the user clicks the Today pill in the embedded top bar. */
  @Output() returnToToday = new EventEmitter<void>();

  readonly defaultReminderMessage = DEFAULT_REMINDER_MESSAGE;

  user = this.auth.user;

  // Push state
  pushSupported = signal(false);
  pushEnabled   = signal(false);
  pushWorking   = signal(false);
  pushDenied    = signal(false);

  // Reminders
  reminders        = signal<Reminder[]>([]);
  remindersLoading = signal(true);
  reminderWorking  = signal(false);
  reminderError    = signal('');
  drafts: Record<string, { time: string; message: string }> = {};

  defaultReminder = computed(() => this.reminders().find(r => r.isDefault) ?? null);
  customReminders = computed(() => this.reminders().filter(r => !r.isDefault));

  ngOnInit(): void {
    this.loadReminders();
    this.initPushState();
  }

  private async initPushState(): Promise<void> {
    this.pushSupported.set(this.push.isSupported);
    if (this.push.isSupported) {
      const subscribed = await this.push.isSubscribed();
      this.pushEnabled.set(subscribed);
      if (subscribed) this.push.syncToServer();
    }
  }

  async enablePush(): Promise<void> {
    this.pushWorking.set(true);
    this.pushDenied.set(false);
    const granted = await this.push.subscribe();
    if (!granted && Notification.permission === 'denied') this.pushDenied.set(true);
    this.pushEnabled.set(await this.push.isSubscribed());
    this.pushWorking.set(false);
  }

  async disablePush(): Promise<void> {
    this.pushWorking.set(true);
    await this.push.unsubscribe();
    this.pushEnabled.set(false);
    this.pushWorking.set(false);
  }

  private loadReminders(): void {
    this.remindersLoading.set(true);
    this.api.getReminders().subscribe({
      next: list => { this.reminders.set(list); this.drafts = {}; this.remindersLoading.set(false); },
      error: () => this.remindersLoading.set(false)
    });
  }

  draftChange(id: string, field: 'time' | 'message', value: string): void {
    const r = this.reminders().find(x => x.id === id)!;
    if (!this.drafts[id]) this.drafts[id] = { time: r.time, message: r.message ?? '' };
    this.drafts[id][field] = value;
  }

  hasDraftChanges(r: Reminder): boolean {
    const d = this.drafts[r.id];
    if (!d) return false;
    return d.time !== r.time || d.message !== (r.message ?? '');
  }

  saveReminder(r: Reminder): void {
    const d = this.drafts[r.id];
    if (!d) return;
    this.reminderError.set('');
    this.reminderWorking.set(true);
    const msg = (d.message && d.message.trim() !== DEFAULT_REMINDER_MESSAGE) ? d.message.trim() : undefined;
    this.api.updateReminder(r.id, d.time, msg, r.isEnabled).subscribe({
      next: updated => {
        this.reminders.update(list => list.map(x => x.id === r.id ? updated : x));
        delete this.drafts[r.id];
        this.reminderWorking.set(false);
      },
      error: err => {
        this.reminderError.set(err?.error?.error ?? 'Could not save reminder.');
        this.reminderWorking.set(false);
      }
    });
  }

  toggleReminder(r: Reminder): void {
    this.reminderWorking.set(true);
    this.api.updateReminder(r.id, r.time, r.message ?? undefined, !r.isEnabled).subscribe({
      next: () => { this.loadReminders(); this.reminderWorking.set(false); },
      error: () => this.reminderWorking.set(false)
    });
  }

  addReminder(): void {
    this.reminderWorking.set(true);
    this.reminderError.set('');
    this.api.createReminder('12:00').subscribe({
      next: () => { this.loadReminders(); this.reminderWorking.set(false); },
      error: err => {
        this.reminderError.set(err?.error?.error ?? 'Could not add reminder.');
        this.reminderWorking.set(false);
      }
    });
  }

  deleteReminder(r: Reminder): void {
    if (!confirm('Delete this reminder?')) return;
    this.reminderWorking.set(true);
    this.api.deleteReminder(r.id).subscribe({
      next: () => { delete this.drafts[r.id]; this.loadReminders(); this.reminderWorking.set(false); },
      error: err => {
        this.reminderError.set(err?.error?.error ?? 'Could not delete reminder.');
        this.reminderWorking.set(false);
      }
    });
  }
}
