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
        <!-- Dismiss sits absolute top-right so it never competes with
             the CTA for layout space. Same on desktop and mobile. -->
        <button class="trial-banner__dismiss"
                type="button"
                title="Dismiss"
                aria-label="Dismiss"
                (click)="dismiss()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="trial-banner__copy">
          <span class="trial-banner__headline">
            <span class="trial-banner__icon" aria-hidden="true">
              {{ daysLeft() <= 2 ? '⏰' : '✨' }}
            </span>
            @if (daysLeft() === 0) {
              <span><strong>Trial ends today.</strong></span>
            } @else if (daysLeft() === 1) {
              <span><strong>1 day</strong> left in your trial.</span>
            } @else {
              <span><strong>{{ daysLeft() }} days</strong> left in your trial.</span>
            }
          </span>
          <span class="trial-banner__sub">
            Subscribe to keep your streak alive!
          </span>
        </div>
        <button class="trial-banner__cta"
                type="button"
                [disabled]="loading()"
                (click)="subscribe()">
          Subscribe now
        </button>
      </div>
    }
  `,
  styles: [`
    /* Gentle cyan-tinted banner at the top of the dashboard. Becomes
       more attention-grabbing in the urgent final 2 days.
       Layout: mobile is a 2-row stack (copy on top, CTA below); on
       desktop it flexes to a single horizontal row. Dismiss "✕" is
       absolutely-positioned top-right on both. */
    .trial-banner {
      position: relative;
      background: linear-gradient(
        180deg,
        rgba(18, 196, 227, .06) 0%,
        rgba(18, 196, 227, .12) 100%
      );
      border: 1px solid rgba(18, 196, 227, .25);
      border-radius: .75rem;
      padding: 1rem 1rem 1rem 1.125rem;
      margin: 0 0 1rem;
      display: flex;
      flex-direction: column;
      gap: .75rem;
      align-items: stretch;
    }
    .trial-banner--urgent {
      background: linear-gradient(
        180deg,
        rgba(225, 29, 72, .04) 0%,
        rgba(225, 29, 72, .10) 100%
      );
      border-color: rgba(225, 29, 72, .30);
    }

    .trial-banner__copy {
      display: flex;
      flex-direction: column;
      gap: .25rem;
      /* leave room on the right edge for the absolute dismiss button */
      padding-right: 1.5rem;
      min-width: 0;
    }
    .trial-banner__headline {
      display: inline-flex;
      align-items: baseline;
      gap: .5rem;
      font-size: 1rem;
      line-height: 1.35;
      color: var(--color-text);
    }
    .trial-banner__icon {
      font-size: 1rem;
      line-height: 1;
      flex-shrink: 0;
    }
    .trial-banner__headline strong { font-weight: 700; }
    .trial-banner__sub {
      font-size: .9375rem;
      line-height: 1.4;
      color: var(--color-text);
    }

    /* CTA sits flush left on its own row on mobile (full width on the
       narrowest phones for an obvious target); inline-right on desktop. */
    .trial-banner__cta {
      align-self: flex-start;
      background: #0c0e13;
      color: #fff;
      border: none;
      padding: .625rem 1.25rem;
      border-radius: 999px;
      font-size: .9375rem;
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
      position: absolute;
      top: .5rem;
      right: .5rem;
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      background: transparent;
      border: none;
      color: var(--color-text-3, #9ca3af);
      cursor: pointer;
      padding: 0;
      border-radius: 50%;
      transition: color .15s, background .15s;
    }
    .trial-banner__dismiss:hover {
      color: var(--color-text);
      background: rgba(0, 0, 0, .05);
    }

    /* Desktop: collapse to a single row — copy on the left, CTA right. */
    @media (min-width: 768px) {
      .trial-banner {
        flex-direction: row;
        align-items: center;
        gap: 1rem;
        padding: .75rem 1rem .75rem 1.125rem;
      }
      .trial-banner__copy {
        flex: 1 1 auto;
        flex-direction: row;
        align-items: baseline;
        gap: .625rem;
        padding-right: 2.25rem;
      }
      .trial-banner__sub {
        color: var(--color-text-2, #6b7280);
      }
      .trial-banner__cta {
        align-self: center;
        flex-shrink: 0;
        font-size: .8125rem;
        padding: .5rem 1rem;
      }
    }
  `]
})
export class TrialBannerComponent {
  private auth   = inject(AuthService);
  private api    = inject(ApiService);
  private router = inject(Router);

  loading            = signal(false);
  dismissedQuiet     = signal<boolean>(this.readKey(TrialBannerComponent.DISMISS_KEY));
  dismissedUrgent    = signal<boolean>(this.readKey(TrialBannerComponent.DISMISS_KEY_URGENT));

  /** Whether the banner should currently render. Visible iff: user is
   *  in trial AND the current-mode dismissal hasn't been recorded.
   *
   *  Two dismissal slots: a "quiet" dismissal (days 3–10 left) and an
   *  "urgent" dismissal (≤2 days). A user who clicks X on day 8 is
   *  saying "I get it, leave me alone" — but the urgent variant on
   *  day 2 is a separate, intentional conversion moment per CLAUDE.md
   *  ("red+urgent in final 2 days"), so we re-show until they dismiss
   *  it again in its urgent form. */
  visible = computed<boolean>(() => {
    const caps = this.auth.capabilities();
    if (!caps?.isInTrial) return false;
    const urgent = this.daysLeft() <= 2;
    return urgent
      ? !this.dismissedUrgent()
      : !this.dismissedQuiet();
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
    const urgent = this.daysLeft() <= 2;
    if (urgent) {
      this.dismissedUrgent.set(true);
      this.writeKey(TrialBannerComponent.DISMISS_KEY_URGENT);
    } else {
      this.dismissedQuiet.set(true);
      this.writeKey(TrialBannerComponent.DISMISS_KEY);
    }
  }

  private static readonly DISMISS_KEY        = 'cc_trial_banner_dismissed';
  private static readonly DISMISS_KEY_URGENT = 'cc_trial_banner_dismissed_urgent';

  private readKey(key: string): boolean {
    try { return localStorage.getItem(key) === '1'; }
    catch { return false; }
  }

  private writeKey(key: string): void {
    try { localStorage.setItem(key, '1'); }
    catch { /* private mode / quota — fall back to in-memory */ }
  }
}
