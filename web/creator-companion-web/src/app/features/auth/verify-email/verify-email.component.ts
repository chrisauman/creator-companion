import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Landing page for the verification link sent by email — route is
 * `/verify-email?token=...`. Reads the token from the query string,
 * calls GET /v1/auth/verify-email, then either:
 *
 * - Success: shows a confirmation card and refreshes capabilities so
 *   the verify-email takeover screen unmounts on next navigation.
 *   Auto-redirects to the dashboard after 3 seconds. (If the user is
 *   not logged in — e.g. opened the link in a different browser
 *   profile — the redirect goes to /login instead.)
 *
 * - Failure: shows a friendly "link is invalid or expired" with a
 *   path back to the verify-email takeover screen (where they can
 *   request a fresh link from the Resend button) or to /login if
 *   they're not signed in.
 *
 * No auth guard on the route — anonymous callers must reach the
 * endpoint (the link arrives in an email; the recipient may not
 * have an active app session at all). Backend's verify-email
 * endpoint is itself AllowAnonymous.
 */
@Component({
  selector: 'app-verify-email-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="auth-page" id="main">
      <div class="auth-card card fade-in" style="text-align:center;">
        <div class="auth-logo">
          <div class="auth-brand">
            <img src="logo-icon.png" alt="" class="auth-brand__icon">
            <span class="auth-brand__name">Creator Companion</span>
          </div>
        </div>

        @if (state() === 'verifying') {
          <h1 class="auth-title">Verifying your email…</h1>
          <p class="text-muted">One moment.</p>
        }

        @if (state() === 'success') {
          <h1 class="auth-title">Email verified!</h1>
          <p>Your 10-day free trial has started. Redirecting you in just a moment…</p>
          <p class="text-muted text-sm" style="margin-top:1.5rem;">
            @if (isLoggedIn()) {
              Not redirecting?
              <a routerLink="/dashboard">Open the app →</a>
            } @else {
              <a routerLink="/login">Sign in to continue →</a>
            }
          </p>
        }

        @if (state() === 'failure') {
          <h1 class="auth-title">This link is no longer valid.</h1>
          <p>
            Verification links expire after 24 hours, and each one can
            only be used once. Request a new link below.
          </p>
          <p class="text-muted text-sm" style="margin-top:1.5rem;">
            @if (isLoggedIn()) {
              <a routerLink="/dashboard">Back to the app →</a>
            } @else {
              <a routerLink="/login">Sign in to request a new link →</a>
            }
          </p>
        }
      </div>
    </main>
  `,
  styles: [`
    /* Matches the rest of the /auth pages so the link click lands in
       the familiar centered-card layout, not a bare error message. */
    .auth-title {
      font-family: var(--font-brand);
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -.02em;
      margin: 1rem 0 .75rem;
    }
  `]
})
export class VerifyEmailComponent implements OnInit {
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private api    = inject(ApiService);
  private auth   = inject(AuthService);

  readonly state: ReturnType<typeof signal<'verifying' | 'success' | 'failure'>> = signal('verifying');
  readonly isLoggedIn = this.auth.isLoggedIn;

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set('failure');
      return;
    }

    this.api.verifyEmail(token).subscribe({
      next: () => {
        this.state.set('success');
        // Refresh capabilities so any open tab's verify-email
        // takeover unmounts. The user's open session (if any) will
        // also detect the stamp bump on its next call and refresh
        // its JWT to carry verified=true.
        this.auth.invalidateCapabilities();
        if (this.auth.isLoggedIn()) {
          this.auth.loadCapabilities().subscribe({ error: () => {} });
        }
        // Soft auto-redirect after a beat so the user actually
        // reads the confirmation.
        setTimeout(() => {
          if (this.auth.isLoggedIn()) {
            this.router.navigateByUrl('/dashboard');
          } else {
            this.router.navigateByUrl('/login');
          }
        }, 3000);
      },
      error: () => {
        // 400 (invalid/expired token) or any other failure lands here.
        // Don't try to distinguish — both produce the same "request a
        // new link" UX, and we don't want to leak whether the token
        // was syntactically valid vs. expired.
        this.state.set('failure');
      }
    });
  }
}
