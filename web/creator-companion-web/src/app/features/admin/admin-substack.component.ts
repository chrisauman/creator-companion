import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, SubstackSettings, SubstackTestPostResult } from '../../core/services/api.service';
import { AdminShellComponent } from './admin-shell.component';

/**
 * Admin-only Substack auto-poster control surface.
 *
 * Phase 1 surface: just the Settings tab.
 *   - Paste the substack.sid cookie (copied from DevTools).
 *   - Set timezone + active toggle.
 *   - "Send a test post now" — verifies the cookie round-trip against
 *     Substack before flipping Active on.
 *
 * The Today and History tabs are stubbed below — phase 3 wires them
 * up. Tab markup stays in place so the IA doesn't shift between phases.
 *
 * Why a single component for three tabs (vs. three routes): they share
 * one data source (settings + plan rows), the user mental model is one
 * page, and tab-switching is purely visual. A routed split would
 * trigger fresh API calls per click for no UX gain.
 */
@Component({
  selector: 'app-admin-substack',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminShellComponent],
  template: `
    <app-admin-shell active="substack">
      <div class="substack-page">

        <header class="substack-page__header">
          <h2 class="substack-page__title">Substack Auto-Poster</h2>
          <p class="substack-page__sub">
            Posts one spark per day to your Substack Notes feed at a
            random time between 6 AM and 10 PM in your timezone. A spark
            is never reposted — the picker excludes anything already
            published. Phase 1: paste your cookie and verify auth.
          </p>
        </header>

        <nav class="substack-tabs" role="tablist">
          <button class="substack-tabs__btn"
                  [class.substack-tabs__btn--active]="tab() === 'settings'"
                  (click)="tab.set('settings')"
                  role="tab"
                  [attr.aria-selected]="tab() === 'settings'">
            Settings
          </button>
          <button class="substack-tabs__btn"
                  [class.substack-tabs__btn--active]="tab() === 'today'"
                  (click)="tab.set('today')"
                  role="tab"
                  [attr.aria-selected]="tab() === 'today'">
            Today
          </button>
          <button class="substack-tabs__btn"
                  [class.substack-tabs__btn--active]="tab() === 'history'"
                  (click)="tab.set('history')"
                  role="tab"
                  [attr.aria-selected]="tab() === 'history'">
            History
          </button>
        </nav>

        @if (loading()) {
          <p class="substack-page__loading">Loading…</p>
        }

        @if (error()) {
          <div class="substack-alert substack-alert--error">{{ error() }}</div>
        }

        @if (!loading() && settings(); as s) {

          <!-- ── SETTINGS TAB ──────────────────────────────────────── -->
          @if (tab() === 'settings') {
            <section class="substack-card">

              <!-- Health row — surface the worker's last outcome up-top
                   so the admin reads it before scrolling. Mutes when
                   there's no history yet (fresh install). -->
              <div class="substack-health">
                <div class="substack-health__row">
                  <span class="substack-health__label">Status</span>
                  <span class="substack-health__value">
                    @if (s.active) {
                      <span class="substack-pill substack-pill--on">Active</span>
                    } @else {
                      <span class="substack-pill substack-pill--off">Paused</span>
                    }
                  </span>
                </div>
                <div class="substack-health__row">
                  <span class="substack-health__label">Cookie</span>
                  <span class="substack-health__value">
                    @if (s.cookieIsSet) {
                      <span class="substack-pill substack-pill--on">Saved</span>
                    } @else {
                      <span class="substack-pill substack-pill--off">Not set</span>
                    }
                  </span>
                </div>
                <div class="substack-health__row">
                  <span class="substack-health__label">Last success</span>
                  <span class="substack-health__value">{{ s.lastSuccessAt ? formatStamp(s.lastSuccessAt) : '—' }}</span>
                </div>
                <div class="substack-health__row">
                  <span class="substack-health__label">Last failure</span>
                  <span class="substack-health__value">
                    {{ s.lastFailureAt ? formatStamp(s.lastFailureAt) : '—' }}
                    @if (s.consecutiveFailures > 0) {
                      <span class="substack-health__streak">({{ s.consecutiveFailures }} in a row)</span>
                    }
                  </span>
                </div>
                @if (s.lastFailureMessage) {
                  <div class="substack-health__detail">{{ s.lastFailureMessage }}</div>
                }
              </div>

              <!-- Cookie paste field. We never echo the stored value
                   back — the field is always empty on load, and only
                   gets written if the admin types something new. This
                   prevents a half-typed paste from clobbering a known-
                   good saved cookie on accidental save. -->
              <label class="substack-field">
                <span class="substack-field__label">Substack cookie header (full)</span>
                <textarea class="substack-field__input substack-field__input--mono"
                          rows="6"
                          placeholder="Paste the full Cookie header value here (leave blank to keep current)"
                          [(ngModel)]="cookieInput"
                          autocomplete="off"
                          spellcheck="false"></textarea>
                <span class="substack-field__hint">
                  Substack sits behind Cloudflare, so just <code>substack.sid</code>
                  isn't enough — we need every cookie the browser sends.
                  How to grab them: log into <strong>substack.com</strong>
                  → F12 → Network tab → click any request to
                  substack.com → Headers → Request Headers → copy the
                  value after <code>Cookie:</code>. Saved encrypted at rest.
                </span>
              </label>

              <!-- Cloudflare cf_clearance cookies are IP- and UA-bound
                   in stricter modes. Surface this risk up-front so the
                   admin understands why posts may stop working until
                   they re-paste. -->
              <div class="substack-callout">
                <strong>Heads up:</strong> Some of the cookies (notably
                <code>cf_clearance</code>) are tied to your browser's IP
                and User-Agent. They may expire or stop working when
                replayed from Railway's server IP. If posts start
                failing, re-paste a fresh cookie header.
              </div>

              <label class="substack-field">
                <span class="substack-field__label">Timezone (IANA id)</span>
                <input class="substack-field__input"
                       type="text"
                       placeholder="America/Los_Angeles"
                       [(ngModel)]="tzInput" />
                <span class="substack-field__hint">
                  Used to compute the 6 AM – 10 PM local posting window.
                </span>
              </label>

              <label class="substack-toggle">
                <input type="checkbox" [(ngModel)]="activeInput" />
                <span>Active — let the worker post once per day</span>
              </label>

              <div class="substack-actions">
                <button class="btn btn--primary"
                        type="button"
                        [disabled]="saving()"
                        (click)="save()">
                  {{ saving() ? 'Saving…' : 'Save settings' }}
                </button>
                <button class="btn btn--ghost"
                        type="button"
                        [disabled]="testing() || !s.cookieIsSet"
                        (click)="testPost()"
                        [title]="s.cookieIsSet ? '' : 'Save a cookie first.'">
                  {{ testing() ? 'Posting…' : 'Send a test post now' }}
                </button>
              </div>

              @if (testResult(); as r) {
                <div class="substack-test"
                     [class.substack-test--ok]="r.success"
                     [class.substack-test--fail]="!r.success">
                  <div class="substack-test__head">
                    <strong>{{ r.success ? 'Test post succeeded' : 'Test post failed' }}</strong>
                    @if (r.statusCode != null) {
                      <span class="substack-test__status">HTTP {{ r.statusCode }}</span>
                    }
                  </div>
                  @if (r.noteId) {
                    <p class="substack-test__line">Note id: <code>{{ r.noteId }}</code></p>
                  }
                  @if (r.errorMessage) {
                    <p class="substack-test__line">{{ r.errorMessage }}</p>
                  }
                  @if (r.rawResponse) {
                    <details class="substack-test__raw">
                      <summary>Raw response</summary>
                      <pre>{{ r.rawResponse }}</pre>
                    </details>
                  }
                </div>
              }
            </section>
          }

          <!-- ── TODAY TAB (stub for phase 3) ──────────────────────── -->
          @if (tab() === 'today') {
            <section class="substack-card substack-card--empty">
              <p class="substack-empty">
                Today's planned post will appear here once the background
                worker is wired up (phase 3). For now, you can verify
                auth via the test post on the Settings tab.
              </p>
            </section>
          }

          <!-- ── HISTORY TAB (stub for phase 3) ────────────────────── -->
          @if (tab() === 'history') {
            <section class="substack-card substack-card--empty">
              <p class="substack-empty">
                Posted note history will appear here once the worker has
                actually posted something.
              </p>
            </section>
          }
        }
      </div>
    </app-admin-shell>
  `,
  styles: [`
    .substack-page { max-width: 720px; }

    .substack-page__header { margin-bottom: 1.5rem; }
    .substack-page__title {
      font-family: var(--font-sans);
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -.01em;
      margin: 0 0 .375rem;
    }
    .substack-page__sub {
      font-size: .9375rem;
      line-height: 1.55;
      color: var(--color-text-2);
      margin: 0;
      max-width: 60ch;
    }
    .substack-page__loading {
      color: var(--color-text-3);
      font-size: .9375rem;
    }

    /* ── Tabs ──────────────────────────────────────────────────────── */
    .substack-tabs {
      display: flex;
      gap: .25rem;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--color-border);
    }
    .substack-tabs__btn {
      background: transparent;
      border: none;
      padding: .5rem 1rem;
      font-size: .875rem;
      font-weight: 600;
      color: var(--color-text-2);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      transition: color .15s, border-color .15s;
    }
    .substack-tabs__btn:hover { color: var(--color-text); }
    .substack-tabs__btn--active {
      color: var(--color-text);
      border-bottom-color: var(--color-accent);
    }

    /* ── Card ──────────────────────────────────────────────────────── */
    .substack-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 12px);
      padding: 1.5rem;
    }
    .substack-card--empty { color: var(--color-text-3); }
    .substack-empty {
      margin: 0;
      font-size: .9375rem;
      line-height: 1.55;
    }

    /* ── Health summary ────────────────────────────────────────────── */
    .substack-health {
      display: grid;
      grid-template-columns: 1fr;
      gap: .5rem;
      padding: 1rem 1.125rem;
      margin-bottom: 1.5rem;
      background: var(--color-surface-2);
      border-radius: var(--radius-sm, 8px);
    }
    .substack-health__row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      font-size: .875rem;
    }
    .substack-health__label {
      color: var(--color-text-3);
      font-weight: 500;
    }
    .substack-health__value { color: var(--color-text); }
    .substack-health__streak {
      color: var(--color-danger, #e11d48);
      font-weight: 600;
      margin-left: .375rem;
    }
    .substack-health__detail {
      font-size: .8125rem;
      color: var(--color-danger, #e11d48);
      padding-top: .25rem;
      border-top: 1px solid var(--color-border);
      margin-top: .25rem;
      word-break: break-word;
    }
    .substack-pill {
      display: inline-block;
      padding: .125rem .5rem;
      border-radius: 999px;
      font-size: .6875rem;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .substack-pill--on  { background: rgba(18,196,227,.15); color: var(--color-accent-dark); }
    .substack-pill--off { background: var(--color-surface);  color: var(--color-text-3); border: 1px solid var(--color-border); }

    /* ── Form fields ───────────────────────────────────────────────── */
    .substack-field {
      display: block;
      margin-bottom: 1.125rem;
    }
    .substack-field__label {
      display: block;
      font-size: .8125rem;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: var(--color-text-2);
      margin-bottom: .375rem;
    }
    .substack-field__input {
      width: 100%;
      padding: .625rem .75rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm, 8px);
      background: var(--color-surface);
      font-family: var(--font-sans);
      font-size: .9375rem;
      color: var(--color-text);
      box-sizing: border-box;
      transition: border-color .15s, box-shadow .15s;
    }
    .substack-field__input:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(18,196,227,.18);
    }
    .substack-field__input--mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: .8125rem;
      resize: vertical;
      min-height: 3.5rem;
      word-break: break-all;
    }
    .substack-field__hint {
      display: block;
      margin-top: .375rem;
      font-size: .8125rem;
      line-height: 1.45;
      color: var(--color-text-3);
    }
    .substack-field__hint code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: .8125rem;
      background: var(--color-surface-2);
      padding: 0 .25rem;
      border-radius: 3px;
    }
    .substack-toggle {
      display: flex;
      align-items: center;
      gap: .625rem;
      margin: 0 0 1.5rem;
      font-size: .9375rem;
      cursor: pointer;
    }

    /* Inline warning callout used to flag the cf_clearance IP-binding
       risk so the admin understands why posts may need re-pasting. */
    .substack-callout {
      background: rgba(245,158,11,.08);
      border: 1px solid rgba(245,158,11,.3);
      color: var(--color-text);
      padding: .75rem 1rem;
      border-radius: var(--radius-sm, 8px);
      font-size: .8125rem;
      line-height: 1.5;
      margin: 0 0 1.5rem;
    }
    .substack-callout code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: .75rem;
      background: rgba(0,0,0,.05);
      padding: 0 .25rem;
      border-radius: 3px;
    }

    /* ── Actions row ───────────────────────────────────────────────── */
    .substack-actions {
      display: flex;
      gap: .75rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .substack-actions .btn {
      padding: .625rem 1.125rem;
      border-radius: var(--radius-sm, 8px);
      font-size: .875rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background .15s, color .15s, border-color .15s, opacity .15s;
    }
    .substack-actions .btn:disabled {
      opacity: .55;
      cursor: not-allowed;
    }
    .substack-actions .btn--primary {
      background: var(--color-text);
      color: #fff;
    }
    .substack-actions .btn--primary:hover:not(:disabled) {
      background: var(--color-accent-hover, #0bd2f0);
      color: #fff;
    }
    .substack-actions .btn--ghost {
      background: transparent;
      color: var(--color-text);
      border-color: var(--color-border);
    }
    .substack-actions .btn--ghost:hover:not(:disabled) {
      background: var(--color-surface-2);
    }

    /* ── Alerts + test-result panel ────────────────────────────────── */
    .substack-alert {
      padding: .75rem 1rem;
      border-radius: var(--radius-sm, 8px);
      margin-bottom: 1rem;
      font-size: .875rem;
    }
    .substack-alert--error {
      background: rgba(225,29,72,.08);
      color: var(--color-danger, #e11d48);
      border: 1px solid rgba(225,29,72,.25);
    }

    .substack-test {
      margin-top: 1.25rem;
      padding: 1rem 1.125rem;
      border-radius: var(--radius-sm, 8px);
      font-size: .875rem;
      line-height: 1.55;
    }
    .substack-test--ok {
      background: rgba(18,196,227,.08);
      border: 1px solid rgba(18,196,227,.25);
      color: var(--color-text);
    }
    .substack-test--fail {
      background: rgba(225,29,72,.06);
      border: 1px solid rgba(225,29,72,.2);
      color: var(--color-text);
    }
    .substack-test__head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: .375rem;
    }
    .substack-test__status {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: .75rem;
      color: var(--color-text-3);
    }
    .substack-test__line {
      margin: .25rem 0;
      word-break: break-word;
    }
    .substack-test__raw {
      margin-top: .5rem;
    }
    .substack-test__raw summary {
      cursor: pointer;
      font-size: .8125rem;
      color: var(--color-text-2);
    }
    .substack-test__raw pre {
      margin: .5rem 0 0;
      padding: .625rem .75rem;
      background: var(--color-surface-2);
      border-radius: 4px;
      font-size: .75rem;
      max-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
  `]
})
export class AdminSubstackComponent implements OnInit {
  private api = inject(ApiService);

  tab = signal<'settings' | 'today' | 'history'>('settings');

  loading = signal(true);
  saving  = signal(false);
  testing = signal(false);
  error   = signal<string | null>(null);

  settings = signal<SubstackSettings | null>(null);
  testResult = signal<SubstackTestPostResult | null>(null);

  // Form inputs. We deliberately don't bind cookie to settings.cookieIsSet
  // — the cookie value never leaves the server, so this field always
  // starts blank and the admin types a fresh paste when they want to
  // rotate it.
  cookieInput = '';
  tzInput = 'UTC';
  activeInput = false;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.adminGetSubstackSettings().subscribe({
      next: s => {
        this.settings.set(s);
        this.tzInput = s.timeZoneId;
        this.activeInput = s.active;
        this.loading.set(false);
      },
      error: err => {
        this.error.set(this.errMsg(err) || 'Could not load Substack settings.');
        this.loading.set(false);
      }
    });
  }

  save(): void {
    this.saving.set(true);
    this.error.set(null);
    this.testResult.set(null);
    this.api.adminUpdateSubstackSettings({
      active:     this.activeInput,
      timeZoneId: this.tzInput.trim() || 'UTC',
      cookie:     this.cookieInput.trim() || null,
    }).subscribe({
      next: s => {
        this.settings.set(s);
        // Clear the textarea on success so a refresh doesn't accidentally
        // resubmit the stale paste.
        this.cookieInput = '';
        this.saving.set(false);
      },
      error: err => {
        this.error.set(this.errMsg(err) || 'Could not save settings.');
        this.saving.set(false);
      }
    });
  }

  testPost(): void {
    this.testing.set(true);
    this.testResult.set(null);
    this.error.set(null);
    this.api.adminSubstackTestPost().subscribe({
      next: r => {
        this.testResult.set(r);
        this.testing.set(false);
      },
      error: err => {
        // Non-2xx from our own API (e.g. 400 "no cookie set") — surface
        // it as the test result rather than the top-level error banner
        // since it's about the test itself.
        this.testResult.set({
          success: false,
          statusCode: err?.status ?? null,
          noteId: null,
          errorMessage: this.errMsg(err) || 'Could not run test post.',
          rawResponse: null
        });
        this.testing.set(false);
      }
    });
  }

  formatStamp(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  private errMsg(err: any): string | null {
    return err?.error?.error ?? err?.message ?? null;
  }
}
