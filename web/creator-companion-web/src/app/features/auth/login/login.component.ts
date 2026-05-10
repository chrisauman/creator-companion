import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
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
          <p class="text-muted text-sm">Welcome back. Keep the streak alive.</p>
        </div>

        <div *ngIf="error()" class="alert alert--error">{{ error() }}</div>

        <form class="stack stack--md" (ngSubmit)="submit()" #f="ngForm">
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
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              class="form-control"
              type="password"
              [(ngModel)]="password"
              name="password"
              placeholder="••••••••"
              autocomplete="current-password"
              required
            />
          </div>

          <button class="btn btn--primary btn--full btn--lg" type="submit" [disabled]="loading()">
            {{ loading() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <p class="text-center text-sm text-muted" style="margin-top:.75rem">
          <a routerLink="/forgot-password">Forgot your password?</a>
        </p>

        <p class="text-center text-sm text-muted" style="margin-top:.5rem">
          New here? <a routerLink="/register">Create an account</a>
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
    .auth-card {
      width: 100%;
      max-width: 420px;
    }
    .auth-logo {
      text-align: center;
      margin-bottom: 2rem;
    }
    /* Live Fraunces wordmark — never use the rasterized logo-full.png
       per CLAUDE.md brand rule. Icon + text, centered. */
    .auth-brand {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      margin-bottom: .75rem;
    }
    .auth-brand__icon {
      width: 36px; height: 36px;
      display: block;
    }
    .auth-brand__name {
      font-family: var(--font-brand);
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -.01em;
      color: var(--color-text);
    }
  `]
})
export class LoginComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  email = '';
  password   = '';
  loading    = signal(false);
  error      = signal('');

  submit(): void {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.email, this.password).subscribe({
      next: res => {
        if (!res.user.onboardingCompleted) {
          this.router.navigate(['/onboarding']);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: err => {
        // Differentiate so users don't reset their password thinking
        // they have a wrong-credentials problem when the real cause
        // is a cold-start 5xx or a rate-limit window.
        this.error.set(this.describeLoginError(err));
        this.loading.set(false);
      }
    });
  }

  private describeLoginError(err: any): string {
    const status: number | undefined = err?.status;
    // 0 covers fetch network errors (offline, DNS, CORS)
    if (status === 0 || status === undefined)
      return "Couldn't reach the server. Check your connection and try again.";
    if (status === 401) return 'Email or password is incorrect.';
    if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
    if (status >= 500)  return 'The server is waking up. Try again in a moment.';
    // Fall back to the server-provided message when available.
    return err?.error?.error ?? 'Sign in failed. Please try again.';
  }
}
