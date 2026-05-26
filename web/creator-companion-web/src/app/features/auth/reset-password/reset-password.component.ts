import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="auth-page" id="main">
      <div class="auth-card card fade-in">
        <div class="auth-logo">
          <div class="auth-brand">
            <img src="logo-icon.png" alt="" class="auth-brand__icon">
            <span class="auth-brand__name">Creator Companion</span>
          </div>
          <h2 style="margin-bottom:.25rem">Choose a new password</h2>
          <p class="text-muted text-sm">Paste your reset token and set a new password.</p>
        </div>

        @if (success()) {
          <div class="alert alert--success">
            Password updated! Redirecting you to sign in…
          </div>
        } @else {
          @if (error()) {
            <div class="alert alert--error">{{ error() }}</div>
          }

          <form class="stack stack--md" (ngSubmit)="submit()" #f="ngForm">
            <div class="form-group">
              <label for="token">Reset token</label>
              <input
                id="token"
                class="form-control"
                type="text"
                [(ngModel)]="token"
                name="token"
                placeholder="Paste token here"
                autocomplete="off"
                required
                #tokenField="ngModel"
              />
            </div>

            <div class="form-group">
              <label for="password">New password</label>
              <div class="password-wrap">
                <input
                  id="password"
                  class="form-control"
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="newPassword"
                  (ngModelChange)="onPasswordChange()"
                  name="password"
                  placeholder="Choose a strong password"
                  autocomplete="new-password"
                  required
                  minlength="8"
                  #passwordField="ngModel"
                />
                <button type="button" class="password-toggle"
                        (click)="showPassword.set(!showPassword())"
                        [attr.aria-pressed]="showPassword()"
                        [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'">
                  @if (showPassword()) {
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                      <line x1="2" y1="2" x2="22" y2="22"/>
                    </svg>
                  } @else {
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  }
                </button>
              </div>
              <!-- Live rules checklist — same pattern as register
                   and marketing signup. Reset is a password-creation
                   surface and HIBP + StrongPassword both fire on the
                   backend, so the same visual feedback prevents the
                   user from bouncing off server validation. -->
              <ul class="password-rules" aria-live="polite">
                <li [class.password-rules__item--met]="pwRules().length">
                  <span class="password-rules__bullet" aria-hidden="true">{{ pwRules().length ? '✓' : '•' }}</span>
                  At least 8 characters
                </li>
                <li [class.password-rules__item--met]="pwRules().upper">
                  <span class="password-rules__bullet" aria-hidden="true">{{ pwRules().upper ? '✓' : '•' }}</span>
                  One uppercase letter
                </li>
                <li [class.password-rules__item--met]="pwRules().lower">
                  <span class="password-rules__bullet" aria-hidden="true">{{ pwRules().lower ? '✓' : '•' }}</span>
                  One lowercase letter
                </li>
                <li [class.password-rules__item--met]="pwRules().digit">
                  <span class="password-rules__bullet" aria-hidden="true">{{ pwRules().digit ? '✓' : '•' }}</span>
                  One number
                </li>
                <li [class.password-rules__item--met]="pwRules().special">
                  <span class="password-rules__bullet" aria-hidden="true">{{ pwRules().special ? '✓' : '•' }}</span>
                  One special character (!&#64;#$%^&amp;* …)
                </li>
              </ul>
            </div>

            <button class="btn btn--primary btn--full btn--lg" type="submit" [disabled]="loading()">
              {{ loading() ? 'Updating…' : 'Set new password' }}
            </button>
          </form>
        }

        <p class="text-center text-sm text-muted" style="margin-top:1.25rem">
          <a routerLink="/login">← Back to sign in</a>
        </p>
      </div>
    </main>
  `,
  styles: [`
    /* See login.component.ts for the iOS Safari 100vh / 100dvh rationale. */
    .auth-page { min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; background: var(--color-bg); }
    .auth-card { width: 100%; max-width: 420px; }
    .auth-logo { text-align: center; margin-bottom: 2rem; }
    /* Live Fraunces wordmark — never the PNG, per CLAUDE.md. */
    .auth-brand {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      margin-bottom: .75rem;
    }
    .auth-brand__icon { width: 36px; height: 36px; display: block; }
    .auth-brand__name {
      font-family: var(--font-brand);
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -.01em;
      color: var(--color-text);
    }
    h1 { font-size: 1.375rem; margin-bottom: .25rem; }
    .alert--success { background: #d4f0e0; color: #166534; border: 1px solid #86efac; border-radius: 8px; padding: .75rem 1rem; }
    .error-msg { font-size: .8rem; color: var(--color-error, #dc2626); margin-top: .25rem; display: block; }

    /* Password field with eye-toggle — mirrors register + login +
       marketing signup. */
    .password-wrap { position: relative; }
    .password-wrap input { padding-right: 3rem; }
    .password-toggle {
      position: absolute;
      right: .5rem;
      top: 50%;
      transform: translateY(-50%);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--color-text-3);
      border-radius: 6px;
      transition: color .15s, background .15s;
    }
    .password-toggle:hover {
      color: var(--color-text);
      background: var(--color-surface-2);
    }
    .password-toggle:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }

    /* Live password-rules checklist — mirrors register. */
    .password-rules {
      list-style: none;
      padding: 0;
      margin: .5rem 0 0;
      font-size: .8125rem;
      line-height: 1.6;
      color: var(--color-text-3);
    }
    .password-rules li {
      display: flex;
      align-items: center;
      gap: .375rem;
      transition: color .15s;
    }
    .password-rules__bullet {
      display: inline-flex;
      width: 14px;
      justify-content: center;
      font-weight: 700;
    }
    .password-rules__item--met { color: #15803d; }
  `]
})
export class ResetPasswordComponent implements OnInit {
  private api    = inject(ApiService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);

  token       = '';
  newPassword = '';
  loading     = signal(false);
  error       = signal('');
  success     = signal(false);
  /** Eye-toggle visibility on the password field. */
  showPassword = signal(false);

  /** Live password-rules signal — drives the checklist. Mirrors
   *  the server's StrongPasswordAttribute exactly. */
  private passwordSignal = signal('');
  pwRules = computed(() => {
    const p = this.passwordSignal();
    return {
      length:  p.length >= 8,
      upper:   /[A-Z]/.test(p),
      lower:   /[a-z]/.test(p),
      digit:   /\d/.test(p),
      special: /[^a-zA-Z\d]/.test(p),
    };
  });
  onPasswordChange(): void { this.passwordSignal.set(this.newPassword); }

  ngOnInit(): void {
    // Support ?token=... in the URL for future email link flow
    const t = this.route.snapshot.queryParamMap.get('token');
    if (t) this.token = t;
  }

  submit(): void {
    this.error.set('');
    if (!this.token) { this.error.set('Please enter your reset token.'); return; }
    // Pre-validate the full server-side ruleset so we don't bounce
    // off the API when we can catch it locally. Server is still
    // authoritative; this just prevents the round-trip for the
    // obvious cases.
    const r = this.pwRules();
    if (!(r.length && r.upper && r.lower && r.digit && r.special)) {
      this.error.set('Your password needs to satisfy every rule below before you can continue.');
      return;
    }
    this.loading.set(true);

    this.api.resetPassword(this.token, this.newPassword).subscribe({
      next: () => {
        this.success.set(true);
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: err => {
        this.error.set(this.describeResetError(err));
        this.loading.set(false);
      }
    });
  }

  /** Mirrors the login + register error-mapping pattern so users
   *  get specific guidance (compromised password, expired token,
   *  rate limit, server hiccup) instead of a single generic
   *  "Reset failed" string. */
  private describeResetError(err: any): string {
    const body = err?.error;
    if (body?.errors && typeof body.errors === 'object') {
      const collected: string[] = [];
      for (const field of Object.keys(body.errors)) {
        const arr = body.errors[field];
        if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') {
          collected.push(arr[0]);
        }
      }
      if (collected.length > 0) return collected.join(' ');
    }
    if (typeof body?.error === 'string') return body.error;

    const status: number | undefined = err?.status;
    if (status === 0 || status === undefined)
      return "Couldn't reach the server. Check your connection and try again.";
    if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
    if (status !== undefined && status >= 500)
      return 'Our servers had a hiccup. We have been notified. Please try again in a moment.';
    return 'Reset failed. The token may have expired.';
  }
}
