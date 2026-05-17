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

        <div *ngIf="error()" class="alert alert--error">{{ error() }}</div>

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
            <input
              id="password"
              class="form-control"
              type="password"
              [(ngModel)]="password"
              (ngModelChange)="onPasswordChange()"
              name="password"
              placeholder="Pick something strong"
              autocomplete="new-password"
              required
              #passwordField="ngModel"
            />
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
