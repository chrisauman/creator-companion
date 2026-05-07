import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

/**
 * Trial countdown banner. Shown at the top of the dashboard while the
 * user is inside their 10-day trial window. Goes from quiet (cyan-tint)
 * during early days to more prominent in the final 2-3 days.
 *
 * After trial expires, the paywall takeover replaces the dashboard
 * entirely — this banner doesn't render then.
 *
 * Click "Subscribe now" → Stripe Checkout flow (same path as paywall).
 * Dismiss → hidden for the session via in-memory signal; persists
 * dismissal across reloads via localStorage so the user isn't nagged
 * if they've decided to wait it out.
 */
@Component({
  selector: 'app-trial-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="trial-banner"
           [class.trial-banner--urgent]="daysLeft() <= 2"
           role="status">
        <div class="trial-banner__inner">
          <div class="trial-banner__copy">
            <span class="trial-banner__icon" aria-hidden="true">
              {{ daysLeft() <= 2 ? '⏰' : '✨' }}
            </span>
            <span class="trial-banner__text">
              @if (daysLeft() === 0) {
                Trial ends today.
              } @else if (daysLeft() === 1) {
                <strong>1 day</strong> left in your trial.
              } @else {
                <strong>{{ daysLeft() }} days</strong> left in your trial.
              }
              <span class="trial-banner__cta-prefix">
                Subscribe to keep going.
              </span>
            </span>
          </div>
          <div class="trial-banner__actions">
            <button class="trial-banner__cta"
                    type="button"
                    [disabled]="loading()"
                    (click)="subscribe()">
              Subscribe now
            </button>
            <button class="trial-banner__dismiss"
                    type="button"
                    title="Dismiss"
                    aria-label="Dismiss"
                    (click)="dismiss()">
              ✕
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* Gentle cyan-tinted banner at the top of the dashboard. Becomes
       more attention-grabbing in the urgent final 2 days. */
    .trial-banner {
      background: linear-gradient(
        180deg,
        rgba(18, 196, 227, .06) 0%,
        rgba(18, 196, 227, .12) 100%
      );
      border: 1px solid rgba(18, 196, 227, .25);
      border-radius: .625rem;
      padding: .75rem 1rem;
      margin: 0 0 1rem;
    }
    .trial-banner--urgent {
      background: linear-gradient(
        180deg,
        rgba(225, 29, 72, .04) 0%,
        rgba(225, 29, 72, .10) 100%
      );
      border-color: rgba(225, 29, 72, .30);
    }
    .trial-banner__inner {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .trial-banner__copy {
      display: flex;
      align-items: center;
      gap: .625rem;
      flex: 1 1 280px;
      min-width: 0;
    }
    .trial-banner__icon { font-size: 1rem; line-height: 1; }
    .trial-banner__text {
      font-size: .875rem;
      line-height: 1.4;
      color: var(--color-text);
    }
    .trial-banner__text strong { font-weight: 700; }
    .trial-banner__cta-prefix {
      color: var(--color-text-2, #6b7280);
      margin-left: .25rem;
    }
    .trial-banner__actions {
      display: flex;
      align-items: center;
      gap: .5rem;
      flex-shrink: 0;
    }
    .trial-banner__cta {
      background: #0c0e13;
      color: #fff;
      border: none;
      padding: .5rem 1rem;
      border-radius: 999px;
      font-size: .8125rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: background .15s, transform .1s;
    }
    .trial-banner__cta:hover:not(:disabled) {
      background: #12C4E3;
      color: #0c0e13;
      transform: translateY(-1px);
    }
    .trial-banner__cta:disabled { opacity: .55; cursor: not-allowed; }
    .trial-banner__dismiss {
      background: transparent;
      border: none;
      color: var(--color-text-3, #9ca3af);
      font-size: 1rem;
      cursor: pointer;
      padding: .25rem .5rem;
      line-height: 1;
      transition: color .15s;
    }
    .trial-banner__dismiss:hover {
      color: var(--color-text);
    }
  `]
})
export class TrialBannerComponent {
  private auth   = inject(AuthService);
  private api    = inject(ApiService);
  private router = inject(Router);

  loading   = signal(false);
  dismissed = signal<boolean>(this.readDismissedFromStorage());

  /** Whether the banner should currently render. Visible iff: user's
   *  capabilities flag IsInTrial = true AND user hasn't dismissed. */
  visible = computed<boolean>(() => {
    if (this.dismissed()) return false;
    const caps = this.auth.capabilities();
    return !!(caps && caps.isInTrial);
  });

  /** Days remaining (rounded up) until TrialEndsAt. Drives the
   *  copy + the urgent-state styling. */
  daysLeft = computed<number>(() => {
    const caps = this.auth.capabilities();
    if (!caps?.trialEndsAt) return 0;
    const ms = new Date(caps.trialEndsAt).getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
  });

  subscribe(): void {
    this.loading.set(true);
    this.api.getStripeConfig().subscribe({
      next: cfg => {
        // Default the banner CTA to monthly. The full pricing surface
        // (paywall takeover when locked, /billing once we build it)
        // shows both options; this is just a quick path during trial.
        const priceId = cfg.monthlyPriceId;
        if (!priceId) {
          this.loading.set(false);
          this.router.navigate(['/billing']);
          return;
        }
        this.api.createCheckoutSession(priceId).subscribe({
          next: res => { window.location.href = res.url; },
          error: () => { this.loading.set(false); }
        });
      },
      error: () => { this.loading.set(false); }
    });
  }

  dismiss(): void {
    this.dismissed.set(true);
    try {
      localStorage.setItem(TrialBannerComponent.DISMISS_KEY, '1');
    } catch { /* private mode / quota — fall back to in-memory */ }
  }

  private static readonly DISMISS_KEY = 'cc_trial_banner_dismissed';

  private readDismissedFromStorage(): boolean {
    try { return localStorage.getItem(TrialBannerComponent.DISMISS_KEY) === '1'; }
    catch { return false; }
  }
}
