import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ReminderConfigResponse, UpdateReminderConfigRequest } from '../../core/models/models';

@Component({
  selector: 'app-admin-reminders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="admin-page">
      <header class="admin-header">
        <h1>Reminder Settings</h1>
        <a routerLink="/dashboard" class="btn btn--ghost btn--sm">← Back to App</a>
      </header>

      <nav class="admin-nav">
        <a routerLink="/admin" class="admin-nav__link">Overview</a>
        <a routerLink="/admin/users" class="admin-nav__link">Users</a>
        <a routerLink="/admin/motivation" class="admin-nav__link">Content Library</a>
        <a routerLink="/admin/reminders" class="admin-nav__link admin-nav__link--active">Notifications</a>
      </nav>

      @if (loading()) {
        <p class="text-muted">Loading…</p>
      }

      @if (!loading()) {
        <div class="section-card card">
          <h2 class="section-title">Frequency Throttling</h2>
          <p class="section-desc">
            Controls how often default reminders fire based on how recently a user last logged an entry.
            Custom (user-set) reminders always fire on their configured schedule.
          </p>

          <div class="field-row">
            <div class="field-group">
              <label class="field-label">Send daily up to <span class="unit">days since last entry</span></label>
              <input class="input" type="number" min="1" max="30" [(ngModel)]="form.dailyUpToDays" />
              <span class="field-hint">Once a user goes beyond this, reminders drop to every 2 days.</span>
            </div>
            <div class="field-group">
              <label class="field-label">Send every 2 days up to <span class="unit">days since last entry</span></label>
              <input class="input" type="number" min="2" max="60" [(ngModel)]="form.every2DaysUpToDays" />
              <span class="field-hint">Beyond this, reminders drop to every 3 days.</span>
            </div>
            <div class="field-group">
              <label class="field-label">Send every 3 days up to <span class="unit">days since last entry</span></label>
              <input class="input" type="number" min="3" max="180" [(ngModel)]="form.every3DaysUpToDays" />
              <span class="field-hint">Beyond this, reminders send once a week.</span>
            </div>
          </div>
        </div>

        <div class="section-card card">
          <h2 class="section-title">Notification Messages</h2>
          <p class="section-desc">
            These messages are used for default reminders. Users who set a custom reminder message will see their own message instead.
          </p>

          <div class="messages-grid">
            <div class="field-group">
              <label class="field-label">Active streak <span class="field-tag">≤ {{ form.dailyUpToDays }} day(s) since last entry</span></label>
              <textarea class="input input--textarea" rows="2" maxlength="300" [(ngModel)]="form.messageActiveStreak"></textarea>
            </div>
            <div class="field-group">
              <label class="field-label">Streak just broke <span class="field-tag">2 days since last entry</span></label>
              <textarea class="input input--textarea" rows="2" maxlength="300" [(ngModel)]="form.messageJustBroke"></textarea>
            </div>
            <div class="field-group">
              <label class="field-label">Short lapse <span class="field-tag">up to {{ form.every2DaysUpToDays }} day(s) since last entry</span></label>
              <textarea class="input input--textarea" rows="2" maxlength="300" [(ngModel)]="form.messageShortLapse"></textarea>
            </div>
            <div class="field-group">
              <label class="field-label">Medium lapse <span class="field-tag">up to {{ form.every3DaysUpToDays }} day(s) since last entry</span></label>
              <textarea class="input input--textarea" rows="2" maxlength="300" [(ngModel)]="form.messageMediumLapse"></textarea>
            </div>
            <div class="field-group field-group--full">
              <label class="field-label">Long absence <span class="field-tag">beyond {{ form.every3DaysUpToDays }} day(s) since last entry</span></label>
              <textarea class="input input--textarea" rows="2" maxlength="300" [(ngModel)]="form.messageLongAbsence"></textarea>
            </div>
          </div>
        </div>

        @if (error()) {
          <p class="alert alert--error">{{ error() }}</p>
        }
        @if (saved()) {
          <p class="alert alert--success">Settings saved.</p>
        }

        <div class="form-actions">
          @if (lastUpdated()) {
            <span class="last-updated">Last updated {{ lastUpdated() }}</span>
          }
          <button class="btn btn--primary" [disabled]="saving()" (click)="save()">
            {{ saving() ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .admin-page { max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem; }
    .admin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    .admin-header h1 { font-size: 1.5rem; margin: 0; }
    .admin-nav { display: flex; gap: .25rem; margin-bottom: 2rem; border-bottom: 1px solid var(--color-border); padding-bottom: .75rem; }
    .admin-nav__link { padding: .4rem .9rem; border-radius: 6px; text-decoration: none; color: var(--color-text-muted); font-size: .875rem; }
    .admin-nav__link:hover, .admin-nav__link--active { background: var(--color-surface); color: var(--color-text); }

    .section-card { padding: 1.5rem; margin-bottom: 1.5rem; }
    .section-title { font-size: 1rem; font-weight: 700; margin: 0 0 .375rem; }
    .section-desc { font-size: .875rem; color: var(--color-text-2); margin: 0 0 1.25rem; line-height: 1.55; }

    .field-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
    .messages-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .field-group { display: flex; flex-direction: column; gap: .3rem; }
    .field-group--full { grid-column: 1 / -1; }
    .field-label { font-size: .8125rem; font-weight: 600; color: var(--color-text-2); display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
    .unit { font-weight: 400; color: var(--color-text-3); }
    .field-tag {
      font-size: .7rem; font-weight: 500; padding: .1rem .45rem;
      border-radius: 100px; background: var(--color-surface-2);
      color: var(--color-text-3); border: 1px solid var(--color-border);
    }
    .field-hint { font-size: .75rem; color: var(--color-text-3); margin-top: .1rem; }

    .input {
      padding: .4375rem .75rem; border: 1.5px solid var(--color-border);
      border-radius: var(--radius-md); background: var(--color-surface);
      color: var(--color-text); font-size: .9375rem; font-family: var(--font-sans);
      width: 100%; box-sizing: border-box;
      &:focus { outline: none; border-color: var(--color-accent); }
    }
    .input--textarea { resize: vertical; min-height: 70px; line-height: 1.6; }

    .form-actions {
      display: flex; align-items: center; justify-content: flex-end; gap: 1rem;
      margin-top: .5rem;
    }
    .last-updated { font-size: .8125rem; color: var(--color-text-3); }

    .alert { padding: .75rem 1rem; border-radius: var(--radius-md); font-size: .875rem; margin-bottom: 1rem; }
    .alert--error { background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; }
    .alert--success { background: #f0fdf4; color: #166534; border: 1px solid #86efac; }

    @media (max-width: 640px) {
      .field-row { grid-template-columns: 1fr; }
      .messages-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class AdminRemindersComponent implements OnInit {
  private api = inject(ApiService);

  loading   = signal(true);
  saving    = signal(false);
  saved     = signal(false);
  error     = signal('');
  lastUpdated = signal('');

  form: UpdateReminderConfigRequest = {
    dailyUpToDays: 2,
    every2DaysUpToDays: 14,
    every3DaysUpToDays: 30,
    messageActiveStreak: '',
    messageJustBroke: '',
    messageShortLapse: '',
    messageMediumLapse: '',
    messageLongAbsence: ''
  };

  ngOnInit(): void {
    this.api.adminGetReminderConfig().subscribe({
      next: cfg => {
        this.applyConfig(cfg);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  save(): void {
    this.error.set('');
    this.saved.set(false);

    if (this.form.every2DaysUpToDays <= this.form.dailyUpToDays) {
      this.error.set('Every-2-days threshold must be greater than the daily threshold.');
      return;
    }
    if (this.form.every3DaysUpToDays <= this.form.every2DaysUpToDays) {
      this.error.set('Every-3-days threshold must be greater than the every-2-days threshold.');
      return;
    }

    this.saving.set(true);
    this.api.adminUpdateReminderConfig(this.form).subscribe({
      next: cfg => {
        this.applyConfig(cfg);
        this.saved.set(true);
        this.saving.set(false);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: err => {
        this.error.set(err?.error?.error ?? 'Could not save settings.');
        this.saving.set(false);
      }
    });
  }

  private applyConfig(cfg: ReminderConfigResponse): void {
    this.form = {
      dailyUpToDays: cfg.dailyUpToDays,
      every2DaysUpToDays: cfg.every2DaysUpToDays,
      every3DaysUpToDays: cfg.every3DaysUpToDays,
      messageActiveStreak: cfg.messageActiveStreak,
      messageJustBroke: cfg.messageJustBroke,
      messageShortLapse: cfg.messageShortLapse,
      messageMediumLapse: cfg.messageMediumLapse,
      messageLongAbsence: cfg.messageLongAbsence
    };
    this.lastUpdated.set(new Date(cfg.updatedAt).toLocaleString());
  }
}
