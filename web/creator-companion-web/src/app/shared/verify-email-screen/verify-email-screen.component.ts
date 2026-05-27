import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { FocusTrapDirective } from '../focus-trap.directive';

/**
 * Full-takeover screen shown when `capabilities.emailVerified === false`.
 * Renders as a sibling to <router-outlet> at the application root
 * (see app.ts). Takes precedence over the paywall — an unverified
 * user is pre-trial, so the "subscribe to continue" framing would
 * be wrong for them.
 *
 * The user lands here in two scenarios:
 * 1) Right after registering (auto-login still happens, but every
 *    gated endpoint returns 402 with code: "email_unverified" until
 *    they click the link in their inbox).
 * 2) On a later login if they never verified the first time.
 *
 * What they can do from here:
 * - Wait, click the email link → server flips EmailVerified=true,
 *   bumps SecurityStamp, frontend's next API call hits 401 → refresh →
 *   new JWT carries verified=true → this screen unmounts (capabilities
 *   refetch via the refresh path makes the signal go false).
 * - "Resend" the verification email if it never arrived.
 * - "Sign out" as the escape hatch (they can register a different
 *   email, or come back later from the same email).
 *
 * No dismiss button — verifying is genuinely required, "Just browse"
 * isn't an option here. The two-action set is intentionally narrow.
 */
@Component({
  selector: 'app-verify-email-screen',
  standalone: true,
  imports: [CommonModule, FocusTrapDirective],
  template: `
    <div class="verify-email" role="dialog" aria-modal="true"
         aria-labelledby="verify-email-title" appFocusTrap>
      <div class="verify-email__inner">
        <h1 id="verify-email-title" class="verify-email__title">
          Almost there — verify your email.
        </h1>
        <p class="verify-email__intro">
          We sent a link to
          <strong class="verify-email__address">{{ email() || 'your inbox' }}</strong>.
          Click it to activate your 10-day free trial.
        </p>

        <p class="verify-email__hint">
          Can't find it? Check your spam folder, or have us send a new one.
        </p>

        <div class="verify-email__actions">
          <button class="verify-email__resend"
                  type="button"
                  [disabled]="resending() || cooldownLeft() > 0"
                  (click)="resend()">
            @if (resending()) {
              Sending…
            } @else if (cooldownLeft() > 0) {
              Sent — try again in {{ cooldownLeft() }}s
            } @else {
              Resend verification email
            }
          </button>
        </div>

        @if (status() === 'sent') {
          <p class="verify-email__status verify-email__status--ok">
            Sent! Check your inbox.
          </p>
        }
        @if (status() === 'error') {
          <p class="verify-email__status verify-email__status--err">
            {{ errorMessage() }}
          </p>
        }

        <!-- Escape hatch: same two-link footer pattern as the paywall.
             "Different email?" is just a sign-out shortcut — once the
             user comes back logged-out, they can register again with
             a corrected address. -->
        <div class="verify-email__skip">
          <button type="button" (click)="signOut()">Used a different email? Sign out</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Mirrors the paywall full-takeover idiom — cream gradient surface,
       centered single-column inner, max 540px. Keeps the "moment of
       transition" feel consistent across the two takeover screens. */
    .verify-email {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: linear-gradient(180deg, #fdfaf2 0%, #f6f1e6 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow-y: auto;
      padding: 2rem 1.25rem;
    }
    .verify-email__inner {
      max-width: 540px;
      width: 100%;
      text-align: center;
      padding: 1.5rem 1rem;
    }

    .verify-email__title {
      font-family: var(--font-brand);
      font-size: 2.25rem;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -.025em;
      color: var(--color-text);
      margin: 0 0 1.25rem;
    }
    .verify-email__intro {
      font-size: 1rem;
      line-height: 1.55;
      color: var(--color-text);
      margin: 0 0 1rem;
    }
    .verify-email__address {
      /* Inline emphasis on the email so the user can spot a typo
         instantly — they cite it most when "I never got it" is
         actually "I typed the wrong address." */
      font-weight: 700;
      word-break: break-all;
    }
    .verify-email__hint {
      font-size: .875rem;
      color: var(--color-text-2);
      line-height: 1.55;
      margin: 0 0 1.5rem;
    }

    .verify-email__actions {
      display: flex;
      justify-content: center;
      margin: 0 0 .75rem;
    }
    .verify-email__resend {
      background: #0c0e13;
      color: #fff;
      border: none;
      border-radius: .75rem;
      padding: .85rem 1.25rem;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s ease;
      min-width: 220px;
    }
    @media (hover: hover) and (pointer: fine) {
      .verify-email__resend:hover:not(:disabled) {
        background: #12C4E3;
      }
    }
    .verify-email__resend:disabled {
      opacity: .6;
      cursor: not-allowed;
    }

    .verify-email__status {
      font-size: .875rem;
      margin: .5rem 0 1rem;
      min-height: 1rem;
    }
    .verify-email__status--ok  { color: #0a7a39; }
    .verify-email__status--err { color: #b91c1c; }

    .verify-email__skip {
      display: inline-flex;
      gap: .5rem;
      color: var(--color-text-3);
      font-size: .8125rem;
      margin-top: 1.5rem;
    }
    .verify-email__skip button {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      padding: .25rem;
    }
    .verify-email__skip button:hover {
      color: var(--color-text);
      text-decoration: underline;
    }

    @media (max-width: 480px) {
      .verify-email__title { font-size: 1.875rem; }
    }
  `]
})
export class VerifyEmailScreenComponent {
  private api  = inject(ApiService);
  private auth = inject(AuthService);

  // Reactive readouts of session state used by the template. The
  // user object is loaded by the auth-bootstrapping flow before
  // capabilities flip — we read .email from there.
  readonly email = computed(() => this.auth.user()?.email ?? '');

  // Resend UX state. cooldownLeft is a simple ticking signal so the
  // button label updates each second; resending blocks double-clicks
  // while the HTTP call is in flight.
  readonly resending = signal(false);
  readonly status: ReturnType<typeof signal<'idle' | 'sent' | 'error'>> = signal('idle');
  readonly errorMessage = signal('');
  readonly cooldownLeft = signal(0);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  // 30-second cooldown after a successful resend. Prevents users
  // from drumming on the button while waiting for delivery — and
  // mirrors the backend's auth-tier IP rate limit (10/60s), so a
  // mash-and-retry user won't hit 429 by accident.
  private static readonly COOLDOWN_SECONDS = 30;

  resend(): void {
    const addr = this.email();
    if (!addr || this.resending() || this.cooldownLeft() > 0) return;

    this.resending.set(true);
    this.status.set('idle');
    this.errorMessage.set('');

    this.api.resendVerification(addr).subscribe({
      next: () => {
        this.resending.set(false);
        this.status.set('sent');
        this.startCooldown();
      },
      error: (err: { status?: number }) => {
        this.resending.set(false);
        // Rate-limit and server errors get human language; 4xx
        // validation errors are unlikely (the body is just an email
        // we already have) but fall through to the generic copy too.
        if (err?.status === 429) {
          this.errorMessage.set('Slow down — try again in a minute.');
        } else {
          this.errorMessage.set('Something went wrong. Please try again.');
        }
        this.status.set('error');
      }
    });
  }

  signOut(): void {
    this.auth.logout();
  }

  private startCooldown(): void {
    this.cooldownLeft.set(VerifyEmailScreenComponent.COOLDOWN_SECONDS);
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      const left = this.cooldownLeft();
      if (left <= 1) {
        this.cooldownLeft.set(0);
        if (this.cooldownTimer) {
          clearInterval(this.cooldownTimer);
          this.cooldownTimer = null;
        }
      } else {
        this.cooldownLeft.set(left - 1);
      }
    }, 1000);
  }
}
