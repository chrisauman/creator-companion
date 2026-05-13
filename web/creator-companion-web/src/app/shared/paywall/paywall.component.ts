import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { FocusTrapDirective } from '../focus-trap.directive';

/**
 * Paywall takeover. Rendered as a sibling to <router-outlet> at the
 * application root and shown whenever the user's `capabilities.hasAccess`
 * is false — i.e. their 10-day trial expired AND they don't have an
 * active subscription.
 *
 * Fully covers the viewport so the user can only either subscribe or
 * sign out. Read endpoints stay open in the API so a quick scroll
 * around their existing entries (via the back button before this
 * mounts) still works, but every write is gated server-side anyway.
 *
 * The component fires a request to /v1/stripe/checkout on click,
 * gets back a Stripe Checkout URL, and redirects. After successful
 * payment Stripe sends the user to /billing/success which triggers a
 * capabilities re-fetch — at which point hasAccess flips true and
 * this overlay unmounts.
 */
@Component({
  selector: 'app-paywall',
  standalone: true,
  imports: [CommonModule, FocusTrapDirective],
  template: `
    <div class="paywall" role="dialog" aria-modal="true" aria-labelledby="paywall-title" appFocusTrap>
      <div class="paywall__inner">
        <h1 id="paywall-title" class="paywall__title">Your trial has ended.</h1>
        <p class="paywall__intro">
          Subscribe to keep your streak alive, your entries safe, and
          your daily creative practice on track.
        </p>

        <div class="paywall__plans">
          <button class="paywall__plan paywall__plan--month"
                  type="button"
                  [disabled]="loading()"
                  (click)="subscribe('monthly')">
            <span class="paywall__plan-price">$5</span>
            <span class="paywall__plan-period">per month</span>
          </button>

          <button class="paywall__plan paywall__plan--year"
                  type="button"
                  [disabled]="loading()"
                  (click)="subscribe('yearly')">
            <span class="paywall__plan-flag">Save $10</span>
            <span class="paywall__plan-price">$50</span>
            <span class="paywall__plan-period">per year</span>
          </button>
        </div>

        <p class="paywall__fineprint">
          Cancel anytime. Your existing entries stay yours either way.
        </p>

        @if (error()) {
          <p class="paywall__error">{{ error() }}</p>
        }

        <div class="paywall__skip">
          <button type="button" (click)="signOut()">Sign out</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Full-viewport takeover. Cream gradient surface to match the
       Welcome Back screen's emotional weight — this is also a moment
       of transition. */
    .paywall {
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
    .paywall__inner {
      max-width: 540px;
      width: 100%;
      text-align: center;
      padding: 1.5rem 1rem;
    }

    .paywall__title {
      font-family: var(--font-brand);
      font-size: 2.25rem;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -.025em;
      color: var(--color-text);
      margin: 0 0 1.25rem;
    }
    .paywall__intro {
      font-size: 1rem;
      line-height: 1.55;
      color: var(--color-text);
      margin: 0 0 2rem;
    }

    /* Two side-by-side plan tiles. Solid black ink with cyan flag on
       the yearly to draw the eye there (better LTV). */
    .paywall__plans {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: .75rem;
      margin: 0 0 1rem;
    }
    .paywall__plan {
      position: relative;
      background: #0c0e13;
      color: #fff;
      border: none;
      border-radius: .75rem;
      padding: 1.25rem 1rem;
      cursor: pointer;
      font-family: inherit;
      transition: background .15s ease, transform .1s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .25rem;
    }
    .paywall__plan:hover {
      background: #12C4E3;
      color: #fff;
    }
    .paywall__plan:disabled {
      opacity: .55;
      cursor: not-allowed;
    }
    .paywall__plan--year .paywall__plan-flag {
      position: absolute;
      top: -10px;
      right: 12px;
      background: #12C4E3;
      color: #fff;
      font-size: .6875rem;
      font-weight: 700;
      letter-spacing: .04em;
      padding: .25rem .5rem;
      border-radius: 999px;
    }
    .paywall__plan-price {
      font-family: var(--font-sans);
      font-size: 1.875rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -.02em;
    }
    .paywall__plan-period {
      font-size: .8125rem;
      opacity: .85;
    }

    .paywall__fineprint {
      font-size: .8125rem;
      color: var(--color-text-2);
      margin: .5rem 0 1.5rem;
    }
    .paywall__error {
      color: #b91c1c;
      font-size: .875rem;
      margin: .5rem 0 1rem;
    }
    .paywall__skip {
      display: inline-flex;
      gap: .5rem;
      color: var(--color-text-3);
      font-size: .8125rem;
    }
    .paywall__skip button {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      padding: .25rem;
    }
    .paywall__skip button:hover {
      color: var(--color-text);
      text-decoration: underline;
    }

    @media (max-width: 480px) {
      .paywall__title { font-size: 1.875rem; }
      .paywall__plans { grid-template-columns: 1fr; }
    }
  `]
})
export class PaywallComponent {
  private api  = inject(ApiService);
  private auth = inject(AuthService);

  loading = signal(false);
  error   = signal('');

  subscribe(plan: 'monthly' | 'yearly'): void {
    this.loading.set(true);
    this.error.set('');
    // The Stripe controller expects a price ID, but the publishable
    // config endpoint also returns the IDs. Fetching config + checkout
    // back-to-back is a small extra round-trip but keeps the price IDs
    // out of the frontend bundle (they're env-driven on the server).
    this.api.getStripeConfig().subscribe({
      next: cfg => {
        const priceId = plan === 'yearly' ? cfg.annualPriceId : cfg.monthlyPriceId;
        if (!priceId) {
          this.error.set('Pricing is not yet configured. Please try again later.');
          this.loading.set(false);
          return;
        }
        this.api.createCheckoutSession(priceId).subscribe({
          next: res => {
            // Redirect to Stripe-hosted checkout. Stripe sends the user
            // back to /billing/success on success or /billing/cancel
            // on abort — both routed in the frontend to invalidate
            // capabilities and re-render appropriately.
            window.location.href = res.url;
          },
          error: () => {
            this.error.set('Could not start checkout. Please try again.');
            this.loading.set(false);
          }
        });
      },
      error: () => {
        this.error.set('Could not load pricing. Please try again.');
        this.loading.set(false);
      }
    });
  }

  signOut(): void {
    this.auth.logout();
  }
}
