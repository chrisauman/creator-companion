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
          <span class="logo-mark">✦</span>
          <h1>Start your journey</h1>
          <p class="text-muted text-sm">Build a creative habit that lasts.</p>
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
              required
              minlength="3"
              maxlength="50"
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
              required
              minlength="8"
              #passwordField="ngModel"
            />
            <span class="error-msg" *ngIf="passwordField.touched && passwordField.errors?.['minlength']">
              Password must be at least 8 characters.
            </span>
          </div>

          <button class="btn btn--primary btn--full btn--lg" type="submit" [disabled]="loading()">
            {{ loading() ? 'Creating account…' : 'Create account' }}
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
    .auth-card { width: 100%; max-width: 420px; }
    .auth-logo { text-align: center; margin-bottom: 2rem; }
    .logo-mark { font-size: 2rem; color: var(--color-accent); display: block; margin-bottom: .5rem; }
    h1 { font-size: 1.375rem; margin-bottom: .25rem; }
  `]
})
export class RegisterComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  username = '';
  email    = '';
  password = '';
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
      next: () => this.router.navigate(['/onboarding']),
      error: err => {
        this.error.set(err?.error?.error ?? 'Registration failed. Please try again.');
        this.loading.set(false);
      }
    });
  }
}
