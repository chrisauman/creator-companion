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
      <!-- The whole bar is the CTA: a single button-shaped row with
           one line of copy. Click anywhere on the bar to start the
           Stripe checkout flow. The dismiss × is a separate inner
           button that stops propagation so it doesn't also trigger
           subscribe(). Wrapped in <div role="button"> rather than
           <button> so the nested dismiss <button> is valid HTML
           (nested <button>s are forbidden by the spec). -->
      <div class="trial-banner"
           [class.trial-banner--urgent]="daysLeft() <= 2"
           [class.trial-banner--loading]="loading()"
           role="button"
           tabindex="0"
           [attr.aria-label]="ariaLabel()"
           (click)="subscribe()"
           (keydown.enter)="subscribe()"
           (keydown.space)="$event.preventDefault(); subscribe()">
        <span class="trial-banner__headline">
          @if (daysLeft() === 0) {
            <strong>Trial ends today.</strong> Click here to subscribe!
          } @else if (daysLeft() === 1) {
            <strong>1 day left.</strong> Click here to subscribe!
          } @else {
            <strong>{{ daysLeft() }} days left.</strong> Click here to subscribe!
          }
        </span>
        <button class="trial-banner__dismiss"
                type="button"
                title="Dismiss"
                aria-label="Dismiss"
                (click)="$event.stopPropagation(); dismiss()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    }
  `,
  styles: [`
    /* The whole bar is one big tap target. Cyan-tinted in the normal
       window, flips to red-tinted "urgent" in the final 2 days.
       Click anywhere → Stripe checkout. The dismiss × is the only
       opt-out and lives in the upper-right of the bar. */
    .trial-banner {
      background: linear-gradient(
        180deg,
        rgba(18, 196, 227, .06) 0%,
        rgba(18, 196, 227, .12) 100%
      );
      border: 1px solid rgba(18, 196, 227, .25);
      border-radius: .75rem;
      padding: .75rem 1rem;
      /* Equal space above and below — the parent's content padding
         provides the "above" gap; this margin provides the "below"
         gap; both should read as roughly the same vertical breathing
         room. On desktop the parent provides no top padding, so the
         dashboard's main-content rule adds an explicit top inset
         where this banner lives. */
      margin: 0 0 1rem;
      display: flex;
      align-items: center;
      gap: .625rem;
      cursor: pointer;
      transition: background .15s, border-color .15s, transform .1s;
      -webkit-tap-highlight-color: rgba(18, 196, 227, .15);
      /* role=button div: reset default link-like styles. */
      text-align: left;
      user-select: none;
    }
    .trial-banner:hover {
      background: linear-gradient(
        180deg,
        rgba(18, 196, 227, .10) 0%,
        rgba(18, 196, 227, .18) 100%
      );
      border-color: rgba(18, 196, 227, .42);
    }
    .trial-banner:active { transform: scale(.997); }
    .trial-banner:focus-visible {
      outline: 2px solid #0bd2f0;
      outline-offset: 2px;
    }
    .trial-banner--urgent {
      background: linear-gradient(
        180deg,
        rgba(225, 29, 72, .04) 0%,
        rgba(225, 29, 72, .10) 100%
      );
      border-color: rgba(225, 29, 72, .30);
    }
    .trial-banner--urgent:hover {
      background: linear-gradient(
        180deg,
        rgba(225, 29, 72, .08) 0%,
        rgba(225, 29, 72, .15) 100%
      );
      border-color: rgba(225, 29, 72, .48);
    }
    .trial-banner--loading { opacity: .65; cursor: progress; }

    .trial-banner__headline {
      flex: 1 1 auto;
      min-width: 0;
      font-size: .9375rem;
      line-height: 1.3;
      color: var(--color-text);
      /* Long headlines truncate before they wrap to a second line —
         keeps the single-row contract intact even when the days
         number is e.g. "10 days left." */
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .trial-banner__headline strong { font-weight: 700; }

    .trial-banner__dismiss {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      background: transparent;
      border: none;
      color: var(--color-text-3);
      cursor: pointer;
      padding: 0;
      border-radius: 50%;
      transition: color .15s, background .15s;
    }
    .trial-banner__dismiss:hover {
      color: var(--color-text);
      background: rgba(0, 0, 0, .05);
    }
  `]
})
export class TrialBannerComponent {
  // Static constants come first so the field initializers below can
  // reference them safely (TS2729 otherwise — "used before initialization").
  //
  // The `_v2` suffix invalidates dismiss state stored under the
  // earlier key names. Reason: dismissals are device-local (per
  // localStorage), so a user who dismissed on desktop could find
  // mobile still showing the banner while desktop stayed silent —
  // confusing inconsistency that surfaced in May 2026. Bumping the
  // key forces a clean re-show; subsequent dismissals work as before.
  // If you need to re-bump in future (e.g. layout change worth
  // re-engaging dismissed users about), incrementing the suffix
  // again is the standard pattern.
  private static readonly DISMISS_KEY        = 'cc_trial_banner_dismissed_v2';
  private static readonly DISMISS_KEY_URGENT = 'cc_trial_banner_dismissed_urgent_v2';

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

  /** Screen-reader label for the whole-bar click target. The visible
   *  copy reads "X days left. Click here to subscribe!" which assumes
   *  the user can see the bar; AT users get a plainer phrasing. */
  ariaLabel = computed<string>(() => {
    const d = this.daysLeft();
    if (d === 0) return 'Trial ends today. Subscribe to keep your access.';
    if (d === 1) return '1 day left in your trial. Subscribe to keep your access.';
    return `${d} days left in your trial. Subscribe to keep your access.`;
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

  private readKey(key: string): boolean {
    try { return localStorage.getItem(key) === '1'; }
    catch { return false; }
  }

  private writeKey(key: string): void {
    try { localStorage.setItem(key, '1'); }
    catch { /* private mode / quota — fall back to in-memory */ }
  }
}
