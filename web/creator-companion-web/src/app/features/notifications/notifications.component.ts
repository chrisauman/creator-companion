import { Component, EventEmitter, Input, Output, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { PushService } from '../../core/services/push.service';
import { Reminder } from '../../core/models/models';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { SidebarStateService } from '../../shared/sidebar/sidebar-state.service';
import { MobileHeaderComponent } from '../../shared/mobile-header/mobile-header.component';
const DEFAULT_REMINDER_MESSAGE = "Remember to log today's progress to keep your streak alive!";

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, MobileHeaderComponent],
  template: `
    <div class="page" [class.page--embedded]="embedded">

      <!-- Page chrome — hidden when embedded inside the dashboard right column -->
      @if (!embedded) {
        <app-sidebar active="notifications" />
        <app-mobile-header />
      }

      <main id="main" class="main-content">
        <h1 class="sr-only">Reminders</h1>

        <!-- Reader-style top bar (embedded only). 64px tall full-
             column-width sticky surface with an inner row capped at
             max-width 760px so the Today pill aligns with the body
             edges below — same pattern as the entry reader. -->
        @if (embedded) {
          <div class="reader-top">
            <div class="reader-top__inner">
              <button class="cancel-pill" type="button" (click)="returnToToday.emit()">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/>
                </svg>
                Today
              </button>
              <div class="reader-top__breadcrumb"></div>
              <div class="reader-top__actions"></div>
            </div>
          </div>
        }

        <!-- Body — bounded to 760px to match the reader/edit views
             so toolbars and content share the same horizontal edges. -->
        <div class="body-inner">

          <!-- Page-level header removed: the sidebar's active nav item +
               the column-3 reader-top breadcrumb (or the standalone
               topbar) already tell the user which page they're on, so
               an h1 here was redundant chrome. -->

          <!-- This device — flat section, no card chrome -->
          <section class="block">
            <h2 class="block__title">This device</h2>

            @if (!pushSupported()) {
              <p class="block__body">Push notifications are not supported in this browser.</p>
            } @else if (!pushEnabled()) {
              <div class="push-prompt">
                <p class="block__body">Enable notifications on this device to receive daily reminders.</p>
                <button class="action-btn" (click)="enablePush()" [disabled]="pushWorking()">
                  {{ pushWorking() ? 'Enabling…' : '🔔 Enable notifications' }}
                </button>
                <p class="block__body" *ngIf="pushDenied()">
                  Notifications are blocked. Please allow them in your browser/device settings and try again.
                </p>
              </div>
            } @else {
              <div class="push-active">
                <span class="push-dot"></span>
                <span>Reminders enabled on this device</span>
                <button class="link-btn" (click)="disablePush()" [disabled]="pushWorking()">Disable</button>
              </div>
            }
          </section>

          <!-- Reminders — five fixed slots, all rendered identically.
               Users edit time / message / on-off on each. Slots are
               server-side lazy-created and never deleted — the UI
               doesn't expose add or delete. -->
          <section class="block">
            <div class="block__head">
              <h2 class="block__title">Reminder times</h2>
              <div class="block__head-actions">
                <button class="link-btn"
                        type="button"
                        [disabled]="testWorking()"
                        (click)="sendTestPush()">
                  {{ testWorking() ? 'Sending…' : 'Send test' }}
                </button>
                <button class="link-btn"
                        type="button"
                        [disabled]="reminderWorking()"
                        (click)="resetReminders()">
                  Reset all
                </button>
              </div>
            </div>
            @if (testResult(); as r) {
              <p class="test-result"
                 [class.test-result--ok]="r.sent > 0"
                 [class.test-result--err]="r.sent === 0">
                {{ r.message }}
              </p>
            }

            <!-- Reminders fire unconditionally on schedule — no
                 entry-based gating, no streak-pause skip. Set them for
                 anything: a journal nudge, hydration, a walk break.
                 The only built-in guard is "at most once per day per
                 slot" so a 9am reminder doesn't double-fire. -->
            <p class="reminder-hint">
              Each slot fires once per day at the time you set,
              regardless of whether you've journaled. Set them for
              anything you want a daily nudge on. Use
              <strong>Send test</strong> above to verify delivery.
            </p>

            @if (remindersLoading()) {
              <p class="block__body">Loading…</p>
            } @else {
              <div class="reminders-list">
                @for (r of reminders(); track r.id) {
                  <div class="reminder-tile">
                    <div class="reminder-tile__fields">
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
                    <div class="reminder-tile__actions">
                      <label class="toggle-switch">
                        <input type="checkbox" [checked]="r.isEnabled"
                               [disabled]="reminderWorking()" (change)="toggleReminder(r)" />
                        <span class="toggle-track"><span class="toggle-thumb"></span></span>
                      </label>
                      <button class="save-btn"
                              [disabled]="reminderWorking() || !hasDraftChanges(r)"
                              (click)="saveReminder(r)">Save</button>
                    </div>
                  </div>
                }
              </div>
            }

            @if (reminderError()) {
              <p class="alert alert--error" style="margin-top:.75rem">{{ reminderError() }}</p>
            }
          </section>
        </div>

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

    /* ── Reader-style top bar (embedded only). Same pattern as the
       entry reader / editor: full-column-width sticky surface, 64px
       tall, with an inner row capped at max-width 760px so the Today
       pill aligns with the body content edges below. */
    .reader-top {
      display: flex;
      align-items: stretch;
      height: 64px;
      background: var(--color-surface);
      position: sticky; top: 0;
      z-index: 5;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .reader-top__inner {
      display: flex;
      align-items: center;
      gap: .5rem;
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      padding: 0 2.5rem;
      box-sizing: border-box;
    }
    .cancel-pill {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: rgba(18,196,227,.1);
      color: var(--color-accent);
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
    .reader-top__breadcrumb { flex: 1; text-align: center; font-size: .8125rem; color: var(--color-text); }
    .reader-top__breadcrumb strong { color: var(--color-text); font-weight: 600; }
    .reader-top__actions { display: flex; gap: .5rem; flex-shrink: 0; min-width: 36px; }

    /* ── Mobile top bar ──────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 100;
      background: #111318;
      border-bottom: 1px solid rgba(255,255,255,.07);
      height: 52px;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 1.5rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; }
    .topbar__brand-icon { height: 24px; width: auto; display: block; }
    .topbar__brand-name { font-family: var(--font-brand); font-size: 1rem; font-weight: 800; letter-spacing: -.01em; color: #fff; }
    /* Hamburger button for the dark mobile topbar — opens the
       slide-in sidebar drawer. Light-on-dark variant of the
       dashboard's mobile-header__hamburger so it reads on the
       dark surface. */
    .topbar__menu {
      width: 36px; height: 36px;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 10px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 3px;
      padding: 0;
      cursor: pointer;
      margin-right: .5rem;
      transition: background .15s, border-color .15s;
    }
    .topbar__menu:hover {
      background: rgba(255,255,255,.06);
      border-color: rgba(255,255,255,.2);
    }
    .topbar__menu span {
      display: block;
      width: 16px; height: 1.75px;
      background: #fff;
      border-radius: 2px;
    }

    /* ── Main content ────────────────────────────────────────────── */
    /* When standalone, fills the viewport like the entry-list column.
       When embedded, the dashboard right column already gives us the
       surface — body-inner caps everything to 760px to match the
       reader/edit views. All text is brand-black; no greyed-out copy. */
    .main-content {
      flex: 1; min-width: 0;
      padding: 0 0 calc(80px + env(safe-area-inset-bottom, 0px));
      background: var(--color-surface);
    }
    @media (min-width: 768px) {
      .main-content { padding: 0 0 4rem; background: var(--color-surface); }
    }
    /* Inner wrapper inside the standalone notifications page. 1.5rem
       horizontal on mobile to match the app-wide gutter; 2.5rem on
       desktop where the embedded view (in the dashboard right column)
       has more horizontal room and benefits from extra breathing
       space around the reminder tiles. */
    .body-inner {
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      padding: .75rem 1.5rem 3rem;
      box-sizing: border-box;
      color: var(--color-text);
    }
    @media (min-width: 768px) {
      .body-inner { padding: .75rem 2.5rem 3rem; }
    }
    .page--embedded .body-inner { padding-top: 1rem; }

    /* ── Page header ─────────────────────────────────────────────── */
    /* Page titles in the right column (Notifications, Todos,
       Favorites) match the Daily Spark hero quote style — same
       size, weight, and tracking — so all column-3 surfaces share
       one consistent display ramp. */
    .page-header { margin-bottom: 1.5rem; }
    .page-title {
      font-family: var(--font-sans);
      font-size: 1.25rem; font-weight: 700;
      letter-spacing: -.01em;
      line-height: 1.3;
      color: var(--color-text);
      margin: 0 0 .25rem;
    }
    /* Body copy standard. */
    .page-sub {
      font-size: 1rem;
      color: var(--color-text);
      margin: 0;
      line-height: 1.6;
    }

    /* ── Flat blocks — no card chrome, just typography + spacing ── */
    .block {
      margin-bottom: 2rem;
    }
    .block:last-child { margin-bottom: 0; }
    .block__title {
      font-family: var(--font-sans);
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-text);
      margin: 0 0 .875rem;
    }
    /* Title row that holds the eyebrow + a trailing action (Reset). */
    .block__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: .875rem;
    }
    .block__head .block__title { margin: 0; }
    .block__head-actions { display: flex; gap: .25rem; }
    /* "Send test" status line — appears under the section header for a
       few seconds after the user clicks Send test, so they get clear
       feedback on whether push delivery actually works. Green for sent,
       red when zero subscriptions or all failed. */
    .test-result {
      font-size: .8125rem;
      line-height: 1.4;
      padding: .5rem .75rem;
      border-radius: .375rem;
      margin: 0 0 .875rem;
    }
    .test-result--ok  { background: rgba(34,197,94,.12); color: #166534; }
    .test-result--err { background: rgba(225,29,72,.10); color: #b91c1c; }
    /* Schedule-rule hint that explains the two silent-skip paths
       (already journaled today + once per day per slot). Same look as
       .block__body but with a slight indent and muted tone. */
    .reminder-hint {
      font-size: .8125rem;
      line-height: 1.5;
      color: var(--color-text-muted);
      margin: 0 0 1rem;
      padding: .5rem .75rem;
      background: var(--color-surface-2);
      border-radius: .375rem;
    }
    .reminder-hint strong { color: var(--color-text); font-weight: 600; }
    /* Body copy standard. */
    .block__body {
      font-size: 1rem;
      line-height: 1.6;
      color: var(--color-text);
      margin: 0;
    }
    .block__body--note {
      margin-top: .75rem;
      font-size: .8125rem;
    }

    /* ── Push section ────────────────────────────────────────────── */
    .push-prompt { display: flex; flex-direction: column; gap: .75rem; align-items: flex-start; }
    .push-active {
      display: inline-flex;
      align-items: center;
      gap: .625rem;
      background: rgba(34,197,94,.08);
      border: 1px solid rgba(34,197,94,.25);
      color: #166534;
      border-radius: 999px;
      padding: .5rem .875rem 0.5rem 0.875rem;
      font-size: .8125rem;
      font-weight: 600;
    }
    .push-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #22c55e; flex-shrink: 0;
      box-shadow: 0 0 8px #22c55e;
    }
    .push-active .link-btn { margin-left: .375rem; }

    /* ── Reminder tiles ─────────────────────────────────────────── */
    /* Plain tiles are flat (no surface) with a thin divider between
       them. The "accent" variant gets the warm cream gradient that
       matches the Daily Spark hero card. */
    .reminder-tile {
      display: flex; flex-direction: column; gap: 1rem;
      padding: 1rem 0;
      border-bottom: 1px solid var(--color-border);
    }
    .reminders-list .reminder-tile:first-child { padding-top: 0; }
    .reminders-list .reminder-tile:last-child {
      padding-bottom: 0;
      border-bottom: none;
    }

    .reminder-tile--accent {
      padding: 1.25rem 1.25rem 1rem;
      background: linear-gradient(180deg, #fdfaf2 0%, #f6f1e6 100%);
      border: 1px solid rgba(190,170,130,.22);
      border-radius: 16px;
      margin-bottom: 1rem;
      position: relative;
      overflow: hidden;
    }
    .reminder-tile--accent::before {
      content: '';
      position: absolute;
      top: -30%; right: -20%;
      width: 220px; height: 220px;
      background: radial-gradient(circle, rgba(18,196,227,.4) 0%, transparent 65%);
      opacity: .35;
      pointer-events: none;
    }
    .reminder-tile__main { position: relative; }
    .reminder-tile__head {
      display: flex; align-items: center; gap: .75rem;
      flex-wrap: wrap; position: relative;
    }
    .reminder-tile__time {
      font-size: 1rem; font-weight: 600; margin: 0 0 .25rem;
      color: var(--color-text);
    }
    .reminder-tile__sub {
      font-size: .8125rem; line-height: 1.45; margin: 0;
      color: var(--color-text);
    }
    /* Free-tier accent tile uses a row layout for the toggle. */
    .reminder-tile--accent:has(.reminder-tile__main) {
      flex-direction: row; align-items: center; gap: 1rem;
    }

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
    .reminder-tile__fields {
      position: relative;
      display: grid; grid-template-columns: 160px 1fr;
      gap: .875rem; align-items: end;
    }
    @media (max-width: 500px) { .reminder-tile__fields { grid-template-columns: 1fr; } }
    .reminder-tile__actions {
      display: flex; align-items: center; gap: .5rem;
      position: relative;
    }

    .field-group { display: flex; flex-direction: column; gap: .375rem; }
    .reminder-msg-group { min-width: 0; }
    .field-label {
      font-size: .6875rem; font-weight: 700;
      color: var(--color-text);
      text-transform: uppercase;
      letter-spacing: .1em;
    }
    .optional { font-weight: 500; color: var(--color-text); text-transform: none; letter-spacing: 0; }

    /* Time + text inputs share the rounded-pill look; time gets a
       roomier min-width so "12:00 PM" never gets clipped on the
       narrow embedded column. accent-color overrides the OS / browser
       blue highlight in Chrome's native time-picker dropdown so the
       selected hour / minute / AM-PM cell renders in brand-ink instead
       of the macOS system blue. Supported in Chrome 93+, Edge 93+,
       Safari 15.4+, Firefox 92+. */
    .time-input,
    .text-input {
      width: 100%; padding: .5rem 1rem; font-size: .875rem;
      border: 1px solid var(--color-border); border-radius: 999px;
      background: #fff; color: var(--color-text);
      font-family: var(--font-sans); box-sizing: border-box;
      transition: border-color .15s, background .15s;
      accent-color: #0c0e13;
    }
    .time-input { min-width: 140px; }
    .time-input:focus,
    .text-input:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(18,196,227,.12);
    }
    .text-input::placeholder { color: var(--color-text); opacity: .55; }

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

    /* ── Buttons ─────────────────────────────────────────────────
       save-btn   : black-ink Save (matches the Edit button on the
                    reader). Pushes itself to the right edge of the
                    tile actions row via margin-left: auto.
       link-btn   : ghost-text button for "Disable" / "Delete".
       action-btn : neutral pill for "Enable notifications" /
                    "+ Add custom reminder". */
    /* Stays solid black even when disabled — matches the entry-reader
       Edit button. Uses cursor + a subtle hover-suppression to signal
       non-interactive state instead of fading the colour. */
    .save-btn {
      margin-left: auto;
      display: inline-flex; align-items: center; gap: .375rem;
      background: #0c0e13; color: #fff;
      border: none; padding: .5rem 1rem;
      border-radius: 999px;
      font-family: inherit; font-size: .8125rem; font-weight: 600;
      cursor: pointer;
      transition: background .15s, color .15s;
    }
    .save-btn:hover:not(:disabled) {
      background: var(--color-accent); color: #fff;
    }
    .save-btn:disabled { cursor: not-allowed; }

    .link-btn {
      background: transparent; border: none;
      color: var(--color-text);
      font-family: inherit; font-size: .8125rem; font-weight: 600;
      padding: .25rem .5rem;
      border-radius: 6px;
      cursor: pointer;
      transition: background .15s;
    }
    .link-btn:hover:not(:disabled) { background: var(--color-surface-2); }
    .link-btn:disabled { opacity: .5; cursor: not-allowed; }
    .link-btn--danger { color: var(--color-danger); }
    .link-btn--danger:hover:not(:disabled) { background: rgba(225,29,72,.08); }

    .action-btn {
      display: inline-flex; align-items: center; gap: .375rem;
      background: rgba(255,255,255,.6);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      padding: .5rem 1rem;
      border-radius: 999px;
      font-family: inherit; font-size: .8125rem; font-weight: 600;
      cursor: pointer;
      transition: all .15s;
    }
    .action-btn:hover:not(:disabled) {
      border-color: var(--color-text-3);
      background: var(--color-surface-2);
    }
    .action-btn:disabled { opacity: .5; cursor: not-allowed; }
    .action-btn--add { margin-top: 1rem; }

    .reminders-section-label {
      font-size: .6875rem; font-weight: 700; color: var(--color-text);
      text-transform: uppercase; letter-spacing: .14em;
      margin-top: 1.25rem; margin-bottom: .25rem;
    }
    .reminders-list { display: flex; flex-direction: column; gap: 0; }
  `]
})
export class NotificationsComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);
  private push = inject(PushService);
  /** Used by the standalone-mode mobile topbar's hamburger button to
   *  open the slide-in sidebar drawer. Public so the template can
   *  call `sidebarState.openMobile()`. */
  protected sidebarState = inject(SidebarStateService);

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

  // "Send test" — fires a notification immediately to all current device
  // subscriptions. The result message stays on screen until the user clicks
  // again or reloads, so they can read the per-device status.
  testWorking = signal(false);
  testResult  = signal<{ sent: number; total: number; expired: number; errors: string[] | null; message: string } | null>(null);

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
    // Guarded read — see PushService.getPermissionState() comment.
    if (!granted && (await this.push.getPermissionState()) === 'denied') this.pushDenied.set(true);
    const subscribed = await this.push.isSubscribed();
    this.pushEnabled.set(subscribed);

    // First-time enable: if every slot is currently off, ask the
    // server to flip slot #1 on so the user gets at least one
    // active reminder out of the box. Server enforces "no-op when
    // any are already enabled" so this is safe to call repeatedly.
    if (subscribed) {
      const anyEnabled = this.reminders().some(r => r.isEnabled);
      if (!anyEnabled) {
        this.api.autoEnableFirstReminder().subscribe({
          next: () => this.loadReminders(),
          error: () => { /* silent — push is on regardless */ }
        });
      }
    }
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

  /** Wipe all reminders and recreate five disabled noon slots. Confirms
   *  first because it's destructive (any custom times / messages the
   *  user had set on existing slots are gone). */
  resetReminders(): void {
    if (!confirm('Reset all reminders? This wipes any custom times or messages you have set and gives you five fresh disabled slots.')) return;
    this.reminderWorking.set(true);
    this.reminderError.set('');
    this.drafts = {};
    this.api.resetReminders().subscribe({
      next: list => {
        this.reminders.set(list as Reminder[]);
        this.reminderWorking.set(false);
      },
      error: err => {
        this.reminderError.set(err?.error?.error ?? 'Could not reset reminders.');
        this.reminderWorking.set(false);
      }
    });
  }

  /**
   * Sends a test notification to every push subscription registered for
   * this account, immediately. Lets users (and us) verify push delivery
   * end-to-end without waiting for a scheduled reminder. The server
   * returns a structured result so we can surface specific failures
   * (no subscription, expired subscription, VAPID misconfigured, etc).
   */
  sendTestPush(): void {
    this.testWorking.set(true);
    this.api.sendTestPush().subscribe({
      next: result => { this.testResult.set(result); this.testWorking.set(false); },
      error: err => {
        this.testResult.set({
          sent: 0, total: 0, expired: 0, errors: null,
          message: err?.error?.error ?? 'Test failed. Check your connection and try again.'
        });
        this.testWorking.set(false);
      }
    });
  }

  // addReminder + deleteReminder removed. The UI is a five-fixed-slot
  // model per CLAUDE.md ("5 fixed slots per user. Lazy-created on first
  // GET. UI never exposes add/delete; users edit time/message/on-off
  // per slot."). The dead methods + matching api.createReminder /
  // api.deleteReminder call sites are a re-wiring hazard, so they're
  // gone. If a future re-design exposes user-managed slots, restore via
  // a deliberate PR — don't reintroduce silently.
}
