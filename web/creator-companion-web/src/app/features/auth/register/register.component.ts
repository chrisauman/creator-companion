import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <div class="auth-card card fade-in">
        <div class="auth-logo">
          <img src="logo-full.png" alt="Creator Companion" class="logo-img">
          <p class="text-muted text-sm">Build a creative habit that lasts.</p>
        </div>

        <!-- Plan selector -->
        <div class="plan-toggle">
          <button class="plan-btn" [class.active]="plan() === 'free'" (click)="plan.set('free')">Free</button>
          <button class="plan-btn" [class.active]="plan() === 'monthly'" (click)="plan.set('monthly')">$3 / month</button>
          <button class="plan-btn" [class.active]="plan() === 'annual'" (click)="plan.set('annual')">$30 / year</button>
        </div>
        <div class="plan-summary">
          @if (plan() === 'free') {
            <strong>Free:</strong> 1 entry/day · 100 words · always free
          } @else if (plan() === 'monthly') {
            <strong>Paid — $3/mo:</strong> 5 entries/day · 2,500 words · all features
          } @else {
            <strong>Annual — $30/yr:</strong> Everything in Paid · save 2 months
          }
        </div>

        <div *ngIf="error()" class="alert alert--error">{{ error() }}</div>

        <form class="stack stack--md" (ngSubmit)="submit()" #f="ngForm">
          <div class="form-group">
            <label for="username">Username</label>
            <input
              id="username"
              class="form-control"
              type="text"
              [(ngModel)]="username"
              name="username"
              placeholder="yourname"
              autocomplete="username"
              required minlength="3" maxlength="50"
              #usernameField="ngModel"
            />
            <span class="error-msg" *ngIf="usernameField.touched && usernameField.errors?.['minlength']">
              Username must be at least 3 characters.
            </span>
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
            {{ loading() ? (plan() === 'free' ? 'Creating account…' : 'Creating account…') : (plan() === 'free' ? 'Create free account' : 'Continue to payment') }}
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
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: var(--color-bg);
    }
    .auth-card { width: 100%; max-width: 440px; }
    .auth-logo { text-align: center; margin-bottom: 1.5rem; }
    .logo-img { display: block; width: 260px; margin: 0 auto .75rem; }
    h1 { font-size: 1.375rem; margin-bottom: .25rem; }

    .plan-toggle {
      display: flex; gap: .25rem;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: .25rem;
      margin-bottom: .875rem;
    }
    .plan-btn {
      flex: 1; padding: .5rem .25rem;
      border: none; background: transparent;
      border-radius: var(--radius-sm);
      font-family: var(--font-sans); font-size: .8125rem; font-weight: 600;
      cursor: pointer; color: var(--color-text-2);
      transition: background .15s, color .15s;
    }
    .plan-btn.active {
      background: var(--color-accent-dark); color: #fff;
      box-shadow: var(--shadow-sm);
    }
    .plan-summary {
      background: var(--color-accent-light);
      border: 1px solid var(--color-accent);
      border-radius: var(--radius-md);
      padding: .625rem .875rem;
      font-size: .8125rem;
      color: var(--color-accent-dark);
      margin-bottom: 1.25rem;
    }
  `]
})
export class RegisterComponent {
  private auth   = inject(AuthService);
  private api    = inject(ApiService);
  private router = inject(Router);

  username = '';
  email    = '';
  password = '';
  plan     = signal<'free' | 'monthly' | 'annual'>('free');
  loading  = signal(false);
  error    = signal('');

  submit(): void {
    this.error.set('');
    if (!this.username || this.username.length < 3) {
      this.error.set('Username must be at least 3 characters.'); return;
    }
    if (!this.email || !this.email.includes('@')) {
      this.error.set('Please enter a valid email address.'); return;
    }
    if (!this.password || this.password.length < 8) {
      this.error.set('Password must be at least 8 characters.'); return;
    }
    this.loading.set(true);

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    this.auth.register(this.username, this.email, this.password, tz).subscribe({
      next: () => {
        if (this.plan() === 'free') {
          this.router.navigate(['/onboarding']);
          return;
        }
        // Paid plan: get config then redirect to Stripe Checkout
        this.api.getStripeConfig().subscribe({
          next: cfg => {
            const priceId = this.plan() === 'monthly' ? cfg.monthlyPriceId : cfg.annualPriceId;
            this.api.createCheckoutSession(priceId).subscribe({
              next: res => { window.location.href = res.url; },
              error: () => {
                // Fall back to onboarding on Stripe error
                this.router.navigate(['/onboarding']);
              }
            });
          },
          error: () => this.router.navigate(['/onboarding'])
        });
      },
      error: err => {
        this.error.set(err?.error?.error ?? 'Registration failed. Please try again.');
        this.loading.set(false);
      }
    });
  }
}
