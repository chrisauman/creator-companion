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
          <img src="logo-full.png" alt="Creator Companion" class="logo-img">
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
    .logo-img {
      display: block;
      width: 260px;
      margin: 0 auto .75rem;
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
        this.error.set(err?.error?.error ?? 'Sign in failed. Please try again.');
        this.loading.set(false);
      }
    });
  }
}
