import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-page">
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
          After your trial, keep going for $5/month or $50/year.
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
              name="password"
              placeholder="Min. 8 characters"
              autocomplete="new-password"
              required minlength="8"
              #passwordField="ngModel"
            />
            <span class="error-msg" *ngIf="passwordField.touched && passwordField.errors?.['minlength']">
              Password must be at least 8 characters.
            </span>
          </div>

          <button class="btn btn--primary btn--full btn--lg" type="submit" [disabled]="loading()">
            {{ loading() ? 'Creating account…' : 'Start free trial' }}
          </button>
        </form>

        <p class="text-center text-sm text-muted" style="margin-top:1.25rem">
          Already have an account? <a routerLink="/login">Sign in</a>
        </p>
      </div>
    </div>
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
    if (!this.password || this.password.length < 8) {
      this.error.set('Password must be at least 8 characters.'); return;
    }
    this.loading.set(true);

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // Trial-only signup: never bounces through Stripe Checkout. The 10-day
    // trial is created server-side in AuthService.RegisterAsync; conversion
    // to a paid subscription happens later from the in-app paywall.
    this.auth.register(this.firstName.trim(), this.lastName.trim(), this.email, this.password, tz).subscribe({
      next: () => this.router.navigate(['/onboarding']),
      error: err => {
        this.error.set(err?.error?.error ?? 'Registration failed. Please try again.');
        this.loading.set(false);
      }
    });
  }
}
