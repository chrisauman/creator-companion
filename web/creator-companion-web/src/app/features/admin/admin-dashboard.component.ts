import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AdminShellComponent } from './admin-shell.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink, AdminShellComponent],
  template: `
    <app-admin-shell active="overview">
      @if (loading()) {
        <p class="text-muted">Loading stats…</p>
      } @else if (stats()) {
        <div class="stats-grid">
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().totalUsers }}</span>
            <span class="stat-card__label">Total Users</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().paidUsers }}</span>
            <span class="stat-card__label">Paid Users</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().freeUsers }}</span>
            <span class="stat-card__label">Free Users</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().activeUsers }}</span>
            <span class="stat-card__label">Active Accounts</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().totalEntries }}</span>
            <span class="stat-card__label">Total Entries</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().totalJournals }}</span>
            <span class="stat-card__label">Total Journals</span>
          </div>
          <div class="stat-card card stat-card--accent">
            <span class="stat-card__value">{{ stats().newUsersLast30Days }}</span>
            <span class="stat-card__label">New Users (30d)</span>
          </div>
          <div class="stat-card card stat-card--accent">
            <span class="stat-card__value">{{ stats().entriesLast30Days }}</span>
            <span class="stat-card__label">Entries (30d)</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().totalMediaCount | number }}</span>
            <span class="stat-card__label">Media Files</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ formatBytes(stats().totalMediaBytes) }}</span>
            <span class="stat-card__label">Total Storage Used</span>
          </div>
        </div>
      }

      @if (error()) {
        <div class="alert alert--error">{{ error() }}</div>
      }

      <!-- Preview surfaces — admin-only links into the dashboard with
           preview/demo query params set. Lets us QA emotional UI
           moments (Welcome Back, threatened banner, history demo)
           without affecting any real data. All previews are READ-ONLY:
           no API writes, no streak changes, no cross-user impact. -->
      <section class="preview-section">
        <h2 class="preview-section__title">Preview surfaces</h2>
        <p class="preview-section__sub">
          Visit any of these to see emotional UI states without affecting your real data.
          Read-only — nothing is saved.
        </p>
        <ul class="preview-list">
          <li>
            <a routerLink="/dashboard"
               [queryParams]="{ section: 'streak-history', demo: 'streaks' }">
              <strong>Streak history (with demo chapters)</strong>
              <span>Five sample chapters injected into the history view.</span>
            </a>
          </li>
          <li>
            <a routerLink="/dashboard" [queryParams]="{ preview: 'welcome-back' }">
              <strong>Welcome Back screen</strong>
              <span>Full-takeover restart experience after a streak break.</span>
            </a>
          </li>
          <li>
            <a routerLink="/dashboard" [queryParams]="{ preview: 'threatened' }">
              <strong>Streak threatened banner</strong>
              <span>"Yesterday slipped by" prompt during the 48h backlog window.</span>
            </a>
          </li>
          <li>
            <a routerLink="/dashboard" [queryParams]="{ preview: 'daily-reminder' }">
              <strong>Daily reminder card</strong>
              <span>Soft "log today's progress" prompt shown when no entry today.</span>
            </a>
          </li>
          <li>
            <!-- Simulates a trial-expired user logging in. Paywall
                 appears as a takeover; click "Just browse my entries"
                 to flip into read-only mode (write buttons locked,
                 Daily Spark + Daily Prompt hidden, urgency cards
                 hidden). Navigate away from /dashboard to exit
                 preview. Honors only admin sessions — non-admins
                 with the URL ignored. -->
            <a routerLink="/dashboard" [queryParams]="{ preview: 'paywall' }">
              <strong>Paywall + read-only mode</strong>
              <span>What a trial-expired user sees: full paywall, then read-only browse.</span>
            </a>
          </li>
          <li>
            <!-- Replay the full new-user onboarding flow: cards →
                 dashboard tour → /entry/new. Routing to /onboarding
                 fires the cards; clicking through to slide 6 chains
                 into /dashboard?tour=1 which fires the tour. Safe to
                 click as an existing user (completeOnboarding is
                 idempotent server-side). -->
            <a routerLink="/onboarding" [queryParams]="{ replay: 1 }">
              <strong>Onboarding flow (cards + tour)</strong>
              <span>Walks through the six intro cards and the six dashboard tooltips end-to-end.</span>
            </a>
          </li>
        </ul>
      </section>

      <!-- Diagnostics — verification + smoke-test actions for the
           operational integrations (Sentry, etc.). Each button is a
           single-shot call that produces a deterministic side effect
           you can verify on the integration's own dashboard. -->
      <section class="preview-section">
        <h2 class="preview-section__title">Diagnostics</h2>
        <p class="preview-section__sub">
          Smoke tests for backend integrations. Click and verify the result on the
          provider dashboard.
        </p>

        <div class="diag-row">
          <button class="btn btn--secondary"
                  [disabled]="sentryTesting()"
                  (click)="testBackendSentry()">
            {{ sentryTesting() ? 'Sending…' : 'Send test event to Sentry (backend)' }}
          </button>

          @if (sentryTestResult(); as r) {
            <span class="diag-msg" [class.diag-msg--ok]="r.ok" [class.diag-msg--err]="!r.ok">
              {{ r.message }}
            </span>
          }
        </div>
      </section>
    </app-admin-shell>
  `,
  styles: [`
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 1rem;
    }
    .stat-card {
      padding: 1.25rem;
      text-align: center;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      transition: border-color .15s, transform .15s;
    }
    .stat-card:hover {
      border-color: var(--color-text-3);
      transform: translateY(-1px);
    }
    .stat-card--accent {
      background: linear-gradient(135deg, rgba(18,196,227,.04), rgba(18,196,227,.08));
      border-color: rgba(18,196,227,.25);
    }
    .stat-card__value {
      display: block;
      font-family: var(--font-sans);
      font-size: 2rem; font-weight: 700;
      letter-spacing: -.02em;
      color: var(--color-text);
    }
    .stat-card__label {
      display: block; font-size: .6875rem;
      color: var(--color-text-3);
      margin-top: .375rem;
      text-transform: uppercase;
      letter-spacing: .1em;
      font-weight: 600;
    }

    /* Preview surfaces — quiet card list at the bottom of the admin
       overview. Distinct from the stats grid above so it reads as a
       separate "tools" section, not data. */
    .preview-section {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--color-border);
    }
    .preview-section__title {
      font-family: var(--font-sans);
      font-size: 1.125rem;
      font-weight: 700;
      margin: 0 0 .375rem;
      letter-spacing: -.01em;
    }
    .preview-section__sub {
      color: var(--color-text-3);
      font-size: .875rem;
      margin: 0 0 1rem;
    }

    /* Diagnostics row — single inline button + adjacent status message.
       Wraps on small screens so the status sits below the button. */
    .diag-row {
      display: flex;
      align-items: center;
      gap: .75rem;
      flex-wrap: wrap;
    }
    .diag-msg {
      font-size: .875rem;
    }
    .diag-msg--ok  { color: var(--color-text-2); }
    .diag-msg--err { color: #e11d48; }

    .preview-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: .75rem;
    }
    .preview-list li {}
    .preview-list a {
      display: block;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 1rem 1.125rem;
      text-decoration: none;
      transition: border-color .15s, transform .15s;
    }
    .preview-list a:hover {
      border-color: var(--color-accent);
      transform: translateY(-1px);
    }
    .preview-list a strong {
      display: block;
      color: var(--color-text);
      font-size: .9375rem;
      font-weight: 600;
      margin-bottom: .25rem;
    }
    .preview-list a span {
      display: block;
      color: var(--color-text-3);
      font-size: .8125rem;
      line-height: 1.4;
    }
  `]
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);

  stats   = signal<any>(null);
  loading = signal(true);
  error   = signal('');

  // Sentry backend test state. testResult is null until the user
  // clicks the diagnostic button; afterwards it holds a one-shot
  // status message that the template renders inline.
  sentryTesting    = signal(false);
  sentryTestResult = signal<{ ok: boolean; message: string } | null>(null);

  ngOnInit() {
    this.api.adminGetStats().subscribe({
      next: s => { this.stats.set(s); this.loading.set(false); },
      error: () => { this.error.set('Failed to load stats.'); this.loading.set(false); }
    });
  }

  /**
   * Fires the backend's /v1/admin/sentry-test endpoint which captures
   * both a message and an exception via SentrySdk. The endpoint flushes
   * synchronously before responding so events arrive in Sentry within
   * a few seconds — by the time the success banner shows here, the
   * events should already be visible at chris-auman.sentry.io.
   */
  testBackendSentry() {
    this.sentryTestResult.set(null);
    this.sentryTesting.set(true);
    this.api.adminSentryTest().subscribe({
      next: (r) => {
        this.sentryTesting.set(false);
        this.sentryTestResult.set({
          ok: true,
          message: `Sent at ${r.when}. Check the creator-companion-api project in Sentry within ~10s.`
        });
      },
      error: (err) => {
        this.sentryTesting.set(false);
        this.sentryTestResult.set({
          ok: false,
          message: `Failed: ${err?.error?.error ?? err?.message ?? 'unknown error'}`
        });
      }
    });
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${i === 0 ? val : val.toFixed(1)} ${units[i]}`;
  }
}
