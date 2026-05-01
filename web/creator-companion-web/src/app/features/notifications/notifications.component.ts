import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule, SidebarComponent, MobileNavComponent],
  template: `
    <div class="page">

      <app-sidebar active="notifications" />

      <!-- Mobile top bar -->
      <header class="topbar">
        <a class="topbar__brand" routerLink="/dashboard">
          <img src="logo-icon.png" alt="" class="topbar__brand-icon">
          <span class="topbar__brand-name">Creator Companion</span>
        </a>
      </header>

      <!-- Mobile bottom nav -->
      <app-mobile-nav active="notifications" />

      <main class="main-content">
        <div class="page-header">
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
    .topbar__brand-name { font-family: 'Fraunces', Georgia, serif; font-size: .9375rem; font-weight: 700; color: #fff; }

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
    .page-header { margin-bottom: 1.5rem; }
    .page-title {
      font-size: 1.5rem; font-weight: 800; color: var(--color-text);
      font-family: var(--font-display); margin: 0 0 .25rem;
    }
    .page-sub { font-size: .9375rem; color: var(--color-text-2); margin: 0; }

    /* ── Cards ───────────────────────────────────────────────────── */
    .card { margin-bottom: 1rem; }
    .section-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 1rem;
      h2 { font-size: 1rem; font-weight: 700; margin: 0; }
    }

    /* ── Push section ────────────────────────────────────────────── */
    .push-prompt { display: flex; flex-direction: column; gap: .5rem; }
    .push-active { display: flex; align-items: center; gap: .625rem; }
    .push-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #22c55e; flex-shrink: 0;
    }

    /* ── Reminder cards ──────────────────────────────────────────── */
    .reminder-free-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; margin-bottom: .625rem;
    }
    .reminder-free-info { flex: 1; }
    .reminder-time-label { font-size: .9375rem; font-weight: 600; margin: 0 0 .2rem; }
    .upgrade-note { margin-top: .5rem; }

    .reminders-section-label {
      font-size: .8125rem; font-weight: 600; color: var(--color-text-2);
      text-transform: uppercase; letter-spacing: .04em;
      margin-top: .875rem; margin-bottom: .375rem;
    }
    .reminders-list { display: flex; flex-direction: column; gap: .75rem; }
    .reminder-card {
      border: 1px solid var(--color-border); border-radius: var(--radius-md);
      padding: .875rem 1rem; display: flex; flex-direction: column; gap: .75rem;
    }
    .reminder-card--default {
      border-color: var(--color-accent); background: var(--color-accent-light);
    }
    .reminder-card__header { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
    .default-badge {
      font-size: .75rem; font-weight: 600; padding: .2rem .6rem;
      border-radius: 100px; background: var(--color-accent); color: #fff; flex-shrink: 0;
    }
    .reminder-card__fields {
      display: grid; grid-template-columns: 120px 1fr; gap: .625rem; align-items: end;
    }
    @media (max-width: 500px) { .reminder-card__fields { grid-template-columns: 1fr; } }
    .reminder-card__actions { display: flex; align-items: center; gap: .625rem; }
    .field-group { display: flex; flex-direction: column; gap: .3rem; }
    .field-label { font-size: .8125rem; font-weight: 500; color: var(--color-text-2); }
    .optional { font-weight: 400; color: var(--color-text-3); }
    .time-input {
      width: 100%; padding: .4rem .6rem; font-size: .875rem;
      border: 1.5px solid var(--color-border); border-radius: var(--radius-md);
      background: var(--color-surface); color: var(--color-text);
      font-family: var(--font-sans); box-sizing: border-box;
      &:focus { outline: none; border-color: var(--color-accent); }
    }
    .text-input {
      width: 100%; padding: .4rem .75rem; font-size: .875rem;
      border: 1.5px solid var(--color-border); border-radius: var(--radius-md);
      background: var(--color-surface); color: var(--color-text);
      font-family: var(--font-sans); box-sizing: border-box;
      &:focus { outline: none; border-color: var(--color-accent); }
      &::placeholder { color: var(--color-text-3); }
    }

    /* ── Toggle switch ───────────────────────────────────────────── */
    .toggle-switch { position: relative; display: inline-flex; align-items: center; cursor: pointer; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
    .toggle-track {
      width: 40px; height: 22px; background: var(--color-border);
      border-radius: 100px; position: relative; transition: background .2s; flex-shrink: 0;
    }
    .toggle-switch input:checked + .toggle-track { background: var(--color-accent); }
    .toggle-thumb {
      position: absolute; top: 3px; left: 3px;
      width: 16px; height: 16px; border-radius: 50%;
      background: #fff; transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,.2);
    }
    .toggle-switch input:checked + .toggle-track .toggle-thumb { transform: translateX(18px); }
    .toggle-switch input:disabled + .toggle-track { opacity: .5; cursor: not-allowed; }
  `]
})
export class NotificationsComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);
  private push = inject(PushService);

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
