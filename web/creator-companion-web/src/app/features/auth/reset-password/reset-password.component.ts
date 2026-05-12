import { Component, inject, signal, OnInit } from '@angular/core';
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
              <input
                id="password"
                class="form-control"
                type="password"
                [(ngModel)]="newPassword"
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

  ngOnInit(): void {
    // Support ?token=... in the URL for future email link flow
    const t = this.route.snapshot.queryParamMap.get('token');
    if (t) this.token = t;
  }

  submit(): void {
    this.error.set('');
    if (!this.token) { this.error.set('Please enter your reset token.'); return; }
    if (!this.newPassword || this.newPassword.length < 8) {
      this.error.set('Password must be at least 8 characters.'); return;
    }
    this.loading.set(true);

    this.api.resetPassword(this.token, this.newPassword).subscribe({
      next: () => {
        this.success.set(true);
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: err => {
        this.error.set(err?.error?.error ?? 'Reset failed. The token may have expired.');
        this.loading.set(false);
      }
    });
  }
}
