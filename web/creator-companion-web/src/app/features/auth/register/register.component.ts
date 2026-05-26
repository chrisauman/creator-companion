import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
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
          <p class="text-muted text-sm">Build a creative habit that lasts.</p>
        </div>

        <!-- 10-day free trial summary — single plan, trial-only model.
             The old free/monthly/annual selector advertised $3/$30 prices
             that don't match Stripe and a free tier that the backend no
             longer supports (EntitlementService.HasAccess = trial || paid).
             Stripe Checkout happens after the trial ends, not at signup. -->
        <div class="plan-summary">
          <strong>10-day free trial</strong> — every feature, no credit card.
          After your trial, keep going for $5.99/month or $49.99/year.
        </div>

        <!-- When the error matches "already exists" we append recovery
             links (Sign in / Reset password) so a user who forgot they
             have an account isn't dead-ended in the form. Backend's
             exact text is "An account with that email already exists." -->
        <div *ngIf="error()" class="alert alert--error">
          {{ error() }}
          <span *ngIf="errorOffersRecovery()" class="alert__recovery">
            <a routerLink="/login">Sign in →</a>
            <a routerLink="/forgot-password">Reset password →</a>
          </span>
        </div>

        <form class="stack stack--md" (ngSubmit)="submit()" #f="ngForm">
          <div class="name-row">
            <div class="form-group">
              <label for="firstName">First name</label>
              <input
                id="firstName"
                class="form-control"
                type="text"
                [(ngModel)]="firstName"
                name="firstName"
                placeholder="Jane"
                autocomplete="given-name"
                required minlength="1" maxlength="60"
              />
            </div>
            <div class="form-group">
              <label for="lastName">Last name</label>
              <input
                id="lastName"
                class="form-control"
                type="text"
                [(ngModel)]="lastName"
                name="lastName"
                placeholder="Doe"
                autocomplete="family-name"
                required minlength="1" maxlength="60"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              class="form-control"
              type="email"
              [(ngModel)]="email"
              name="email"
              placeholder="you@example.com"
              autocomplete="email"
              required
              #emailField="ngModel"
            />
            <span class="error-msg" *ngIf="emailField.touched && emailField.errors?.['email']">
              Please enter a valid email address.
            </span>
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <div class="password-wrap">
              <input
                id="password"
                class="form-control"
                [type]="showPassword() ? 'text' : 'password'"
                [(ngModel)]="password"
                (ngModelChange)="onPasswordChange()"
                name="password"
                placeholder="Pick something strong"
                autocomplete="new-password"
                required
                #passwordField="ngModel"
              />
              <!-- Eye toggle — flips the input's type between password
                   and text. aria-pressed + aria-label update so screen
                   readers announce the state. Pattern is duplicated on
                   the login + reset-password + marketing signup
                   surfaces for visual consistency. -->
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
            <!-- Live requirements checklist. Mirrors StrongPasswordAttribute
                 on the server so the user sees exactly what's needed before
                 submitting. Each rule starts grey and flips to green as the
                 password satisfies it. Empty state shows all rules grey so
                 the user reads them before typing. -->
            <ul class="password-rules" aria-live="polite">
              <li [class.password-rules__item--met]="pwRules().length">
                <span class="password-rules__bullet" aria-hidden="true">{{ pwRules().length ? '✓' : '•' }}</span>
                At least 8 characters
              </li>
              <li [class.password-rules__item--met]="pwRules().upper">
                <span class="password-rules__bullet" aria-hidden="true">{{ pwRules().upper ? '✓' : '•' }}</span>
                One uppercase letter (A–Z)
              </li>
              <li [class.password-rules__item--met]="pwRules().lower">
                <span class="password-rules__bullet" aria-hidden="true">{{ pwRules().lower ? '✓' : '•' }}</span>
                One lowercase letter (a–z)
              </li>
              <li [class.password-rules__item--met]="pwRules().digit">
                <span class="password-rules__bullet" aria-hidden="true">{{ pwRules().digit ? '✓' : '•' }}</span>
                One number (0–9)
              </li>
              <li [class.password-rules__item--met]="pwRules().special">
                <span class="password-rules__bullet" aria-hidden="true">{{ pwRules().special ? '✓' : '•' }}</span>
                One special character (!&#64;#$%^&amp;* …)
              </li>
            </ul>
          </div>

          <button class="btn btn--primary btn--full btn--lg" type="submit" [disabled]="loading()">
            {{ loading() ? 'Creating account…' : 'Start free trial' }}
          </button>
        </form>

        <p class="text-center text-sm text-muted" style="margin-top:1.25rem">
          Already have an account? <a routerLink="/login">Sign in</a>
        </p>
      </div>
    </main>
  `,
  styles: [`
    .auth-page {
      /* See login.component.ts for the iOS Safari 100vh rationale. */
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: var(--color-bg);
    }
    .auth-card { width: 100%; max-width: 440px; }
    .auth-logo { text-align: center; margin-bottom: 1.5rem; }
    /* Live Fraunces wordmark — never use the rasterized logo-full.png
       per CLAUDE.md brand rule. */
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

    /* Single trial-summary panel (no toggle — single plan, trial-only). */
    .plan-summary {
      background: var(--color-accent-light);
      border: 1px solid var(--color-accent);
      border-radius: var(--radius-md);
      padding: .75rem .875rem;
      font-size: .9375rem;
      line-height: 1.5;
      color: var(--color-text);
      margin-bottom: 1.25rem;
    }
    .plan-summary strong { color: var(--color-accent-dark); font-weight: 700; }
    /* First/last name share a row on wide enough screens; stack on phones. */
    .name-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: .75rem;
    }
    @media (max-width: 420px) {
      .name-row { grid-template-columns: 1fr; }
    }

    /* Live password-rules checklist. Grey until met, brand-cyan-green once
       satisfied — exactly mirrors the server's StrongPasswordAttribute so
       the user can't fail validation when every bullet is green. Compact
       so it doesn't visually dominate the form. */
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
    .password-rules__item--met {
      color: #15803d;
    }

    /* Password field with eye-toggle. Same pattern on login,
       reset-password, and marketing signup. */
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

    /* Email-exists recovery row appended inside the .alert--error
       when the backend message indicates the email is already
       registered. Turns the dead-end error into a recovery path. */
    .alert__recovery {
      display: block;
      margin-top: .5rem;
      font-size: .875rem;
      font-weight: 600;
    }
    .alert__recovery a {
      color: inherit;
      text-decoration: underline;
      margin-right: 1rem;
    }
    .alert__recovery a:last-child { margin-right: 0; }
  `]
})
export class RegisterComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  firstName = '';
  lastName  = '';
  email     = '';
  password  = '';
  loading   = signal(false);
  error     = signal('');
  /** Eye-toggle visibility on the password field. */
  showPassword = signal(false);
  /** True when the current error text suggests the email is already
   *  registered — drives the inline Sign-in / Reset-password
   *  recovery links so the user isn't dead-ended. Matches both the
   *  backend's exact phrasing ("An account with that email already
   *  exists.") and looser variants. */
  errorOffersRecovery = computed(() => /already exists/i.test(this.error()));
  /** Drives the live password-rules checklist. Updated via onPasswordChange()
   *  so we don't have to track ngModel reactively. Mirrors the rules enforced
   *  by StrongPasswordAttribute on the server. */
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

  onPasswordChange(): void { this.passwordSignal.set(this.password); }

  submit(): void {
    this.error.set('');
    if (!this.firstName.trim()) {
      this.error.set('Please enter your first name.'); return;
    }
    if (!this.lastName.trim()) {
      this.error.set('Please enter your last name.'); return;
    }
    if (!this.email || !this.email.includes('@')) {
      this.error.set('Please enter a valid email address.'); return;
    }
    // Pre-validate the full server-side password ruleset so we don't bounce
    // off the API when we can catch it locally. Server is still authoritative.
    const r = this.pwRules();
    if (!(r.length && r.upper && r.lower && r.digit && r.special)) {
      this.error.set('Your password needs to satisfy every rule below before you can continue.');
      return;
    }
    this.loading.set(true);

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // Trial-only signup: never bounces through Stripe Checkout. The 10-day
    // trial is created server-side in AuthService.RegisterAsync; conversion
    // to a paid subscription happens later from the in-app paywall.
    this.auth.register(this.firstName.trim(), this.lastName.trim(), this.email, this.password, tz).subscribe({
      next: () => this.router.navigate(['/onboarding']),
      error: err => {
        this.error.set(this.extractErrorMessage(err));
        this.loading.set(false);
      }
    });
  }

  /**
   * Surfaces the most useful error message for the user across the
   * three shapes the backend returns:
   *
   *   1. ASP.NET model-validation 400 →
   *        { errors: { Password: ["..."], Email: ["..."] } }
   *   2. AuthController business error (409 conflict or 400) →
   *        { error: "An account with that email already exists." }
   *   3. Anything else (network failure, 500) → generic fallback.
   *
   * Without this, every server-side validation failure displayed the same
   * generic "Registration failed" line — which is why the missing-lowercase
   * password incident looked like a deeper bug. Showing the actual message
   * means the user can self-correct without help.
   */
  private extractErrorMessage(err: any): string {
    const body = err?.error;

    if (body?.errors && typeof body.errors === 'object') {
      const messages: string[] = [];
      for (const field of Object.keys(body.errors)) {
        const arr = body.errors[field];
        if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') {
          messages.push(arr[0]);
        }
      }
      if (messages.length > 0) return messages.join(' ');
    }

    if (typeof body?.error === 'string') return body.error;

    if (err?.status === 0) {
      return "Couldn't reach the server. Check your connection and try again.";
    }
    if (err?.status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }

    return 'Registration failed. Please try again.';
  }
}
