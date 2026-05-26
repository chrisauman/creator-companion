import { Component, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { TurnstileComponent } from '../../../shared/turnstile/turnstile.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TurnstileComponent],
  template: `
    <main class="auth-page" id="main">
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
            <div class="password-wrap">
              <input
                id="password"
                class="form-control"
                [type]="showPassword() ? 'text' : 'password'"
                [(ngModel)]="password"
                name="password"
                placeholder="••••••••"
                autocomplete="current-password"
                required
              />
              <!-- Eye toggle — flips input type between password
                   and text. Same pattern as register + reset-password
                   + marketing signup; styles are local to each
                   component for now. -->
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
          </div>

          <!-- Cloudflare Turnstile widget. Usually invisible (auto-
               passes); shows an interactive challenge only if
               Cloudflare's risk signals suggest the session may be
               a bot. Token is single-use; ts.reset() runs on any
               submit failure so the next attempt gets a fresh token. -->
          <app-turnstile (verified)="turnstileToken.set($event)"
                         (expired)="turnstileToken.set(null)"
                         #ts></app-turnstile>

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
    </main>
  `,
  styles: [`
    .auth-page {
      /* 100vh on iOS Safari is taller than the visible area (counts the
         space behind the URL/tab bars), so flex-centered content gets
         pushed below the visible center. 100dvh tracks the actual
         visible viewport. iOS 15.4+ / Chrome 108+ use dvh; older
         browsers fall back to vh. */
      min-height: 100vh;
      min-height: 100dvh;
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

    /* Password field with eye-toggle. Same pattern on register,
       reset-password, and marketing signup. Local CSS per
       component for now; pull into a shared partial when this
       starts to drift. */
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
  `]
})
export class LoginComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  email = '';
  password   = '';
  loading    = signal(false);
  error      = signal('');
  /** Eye-toggle visibility on the password field. */
  showPassword = signal(false);
  /** Most recent Turnstile token (single-use, ~5min lifetime). Null
   *  before the widget verifies or after it expires/resets. */
  turnstileToken = signal<string | null>(null);

  @ViewChild('ts') ts?: TurnstileComponent;

  submit(): void {
    if (!this.email || !this.password) return;
    if (!this.turnstileToken()) {
      this.error.set('Please complete the human-verification check above before signing in.');
      return;
    }
    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.email, this.password, this.turnstileToken() ?? undefined).subscribe({
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
        // Turnstile tokens are single-use. After any failed submit,
        // reset the widget so the next attempt gets a fresh token
        // instead of replaying the stale one (which would 403 with
        // "timeout-or-duplicate" on the backend).
        this.turnstileToken.set(null);
        this.ts?.reset();
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
