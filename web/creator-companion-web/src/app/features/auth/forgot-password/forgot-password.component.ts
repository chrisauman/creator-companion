import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <div class="auth-card card fade-in">
        <div class="auth-logo">
          <span class="logo-mark">✦</span>
          <h1>Reset your password</h1>
          <p class="text-muted text-sm">Enter your email and we'll send a reset link.</p>
        </div>

        @if (success()) {
          <div class="alert alert--success">
            <strong>Check your email.</strong> If that address is registered, a reset link has been sent.
          </div>

          @if (devToken()) {
            <div class="dev-token">
              <p class="text-sm text-muted" style="margin-bottom:.4rem">
                <strong>Dev mode:</strong> no email server is configured. Copy your reset token below.
              </p>
              <code class="token-code">{{ devToken() }}</code>
              <button class="btn btn--ghost btn--sm" style="margin-top:.5rem;width:100%" (click)="copyToken()">
                {{ copied() ? 'Copied!' : 'Copy token' }}
              </button>
            </div>
          }

          <p class="text-center text-sm text-muted" style="margin-top:1.25rem">
            <a routerLink="/reset-password">Enter reset token →</a>
          </p>
        } @else {
          @if (error()) {
            <div class="alert alert--error">{{ error() }}</div>
          }

          <form class="stack stack--md" (ngSubmit)="submit()">
            <div class="form-group">
              <label for="email">Email address</label>
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

            <button class="btn btn--primary btn--full btn--lg" type="submit" [disabled]="loading()">
              {{ loading() ? 'Sending…' : 'Send reset link' }}
            </button>
          </form>
        }

        <p class="text-center text-sm text-muted" style="margin-top:1.25rem">
          <a routerLink="/login">← Back to sign in</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; background: var(--color-bg); }
    .auth-card { width: 100%; max-width: 420px; }
    .auth-logo { text-align: center; margin-bottom: 2rem; }
    .logo-mark { font-size: 2rem; color: var(--color-accent); display: block; margin-bottom: .5rem; }
    h1 { font-size: 1.375rem; margin-bottom: .25rem; }
    .alert--success { background: #d4f0e0; color: #166534; border: 1px solid #86efac; border-radius: 8px; padding: .75rem 1rem; }
    .dev-token { background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: 8px; padding: 1rem; margin-top: 1rem; }
    .token-code { display: block; font-family: monospace; font-size: .8rem; word-break: break-all; background: var(--color-bg); padding: .5rem; border-radius: 4px; border: 1px solid var(--color-border); }
  `]
})
export class ForgotPasswordComponent {
  private api = inject(ApiService);

  email    = '';
  loading  = signal(false);
  error    = signal('');
  success  = signal(false);
  devToken = signal('');
  copied   = signal(false);

  submit(): void {
    if (!this.email) return;
    this.loading.set(true);
    this.error.set('');

    this.api.forgotPassword(this.email).subscribe({
      next: res => {
        this.success.set(true);
        this.devToken.set(res.resetToken ?? '');
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Something went wrong. Please try again.');
        this.loading.set(false);
      }
    });
  }

  copyToken(): void {
    navigator.clipboard.writeText(this.devToken()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
