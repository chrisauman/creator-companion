import {
  Component, OnInit, OnDestroy, inject, signal, computed, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * One step in a tour. `target` is a CSS selector for the element to
 * highlight — the spotlight cutout traces the element's bounding box.
 * `placement` controls where the tooltip card sits relative to the
 * highlighted element.
 *
 * If `target` is null, no spotlight cutout is drawn — the step shows
 * a centered tooltip on a fully-dimmed backdrop. Used for the
 * intro and outro slides that don't point at anything specific.
 */
export interface TourStep {
  target: string | null;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

/**
 * Custom tour overlay component. Hand-rolled (no driver.js / shepherd
 * dependency) so it inherits the app's existing CSS variables and
 * stays bundle-light.
 *
 * Mounts at the app root via the dashboard. Fires the first time a
 * user lands on /dashboard after completing onboarding. Subsequent
 * visits skip — the `cc_tour_seen` localStorage flag gates it.
 *
 * The "Show tour again" link in the account page wipes the flag and
 * navigates to /dashboard, which re-triggers the tour.
 *
 * Visibility math:
 *   - visible() — tour is currently showing
 *   - currentStep() — which step is active
 *   - spotlightRect() — bounding box of the target element (or null
 *     for centered slides)
 *   - tooltipPosition() — where to place the tooltip card based on
 *     spotlight + placement preference
 *
 * The component watches window resize/scroll to keep the spotlight
 * locked to its target.
 */
@Component({
  selector: 'app-tour',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="tour" role="dialog" aria-labelledby="tour-title">

        <!-- Spotlight overlay: full-screen dim with a transparent
             cutout around the target element. Drawn via four absolutely
             positioned divs so we don't depend on SVG masks (which
             have flaky behavior across browsers). -->
        @if (spotlightRect(); as r) {
          <div class="tour__overlay tour__overlay--top"
               [style.height.px]="r.top - SPOTLIGHT_PAD"></div>
          <div class="tour__overlay tour__overlay--bottom"
               [style.top.px]="r.bottom + SPOTLIGHT_PAD"></div>
          <div class="tour__overlay tour__overlay--left"
               [style.top.px]="r.top - SPOTLIGHT_PAD"
               [style.height.px]="r.height + SPOTLIGHT_PAD * 2"
               [style.width.px]="r.left - SPOTLIGHT_PAD"></div>
          <div class="tour__overlay tour__overlay--right"
               [style.top.px]="r.top - SPOTLIGHT_PAD"
               [style.height.px]="r.height + SPOTLIGHT_PAD * 2"
               [style.left.px]="r.right + SPOTLIGHT_PAD"></div>

          <!-- Bright halo ring around the spotlit element so it pops
               against the surrounding dim. -->
          <div class="tour__halo"
               [style.top.px]="r.top - SPOTLIGHT_PAD"
               [style.left.px]="r.left - SPOTLIGHT_PAD"
               [style.width.px]="r.width + SPOTLIGHT_PAD * 2"
               [style.height.px]="r.height + SPOTLIGHT_PAD * 2"></div>
        } @else {
          <!-- Centered slides: full dim, no cutout. -->
          <div class="tour__overlay tour__overlay--full"></div>
        }

        <!-- Tooltip card -->
        <div class="tour__tip"
             [style.top.px]="tooltipPosition().top"
             [style.left.px]="tooltipPosition().left"
             [class.tour__tip--center]="!spotlightRect()">
          <div class="tour__tip-step">
            Step {{ stepIndex() + 1 }} of {{ steps.length }}
          </div>
          <h2 id="tour-title" class="tour__tip-title">
            {{ currentStep().title }}
          </h2>
          <p class="tour__tip-body">{{ currentStep().body }}</p>
          <div class="tour__tip-actions">
            <button class="tour__skip"
                    type="button"
                    (click)="skip()">Skip</button>
            <button class="tour__next"
                    type="button"
                    (click)="next()">
              {{ stepIndex() === steps.length - 1 ? 'Done' : 'Next' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .tour {
      position: fixed;
      inset: 0;
      z-index: 200;
      pointer-events: none; /* let highlighted element show through */
    }

    /* Each overlay quadrant is a dim panel; combined they leave the
       target rectangle untouched. Pointer events: auto on these so
       a stray click outside the spotlight is absorbed (doesn't
       accidentally trigger something behind). */
    .tour__overlay {
      position: absolute;
      background: rgba(0, 0, 0, .55);
      pointer-events: auto;
      transition: all .25s ease;
    }
    .tour__overlay--top    { top: 0; left: 0; right: 0; }
    .tour__overlay--bottom { left: 0; right: 0; bottom: 0; }
    .tour__overlay--left   { left: 0; }
    .tour__overlay--right  { right: 0; }
    .tour__overlay--full {
      top: 0; left: 0; right: 0; bottom: 0;
    }

    /* Halo ring around the highlighted element — soft cyan glow for
       brand consistency. */
    .tour__halo {
      position: absolute;
      border: 2px solid var(--color-accent);
      border-radius: 12px;
      box-shadow: 0 0 0 4px rgba(18, 196, 227, .25),
                  0 0 24px rgba(18, 196, 227, .35);
      pointer-events: none;
      transition: all .25s ease;
    }

    /* Tooltip card. Pointer-events: auto so its buttons work despite
       the parent's pointer-events: none. */
    .tour__tip {
      position: absolute;
      pointer-events: auto;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, .25);
      padding: 1.25rem 1.5rem;
      max-width: 320px;
      transition: top .25s ease, left .25s ease;
    }
    .tour__tip--center {
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%);
      max-width: 380px;
    }

    .tour__tip-step {
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-accent);
      margin-bottom: .5rem;
    }
    .tour__tip-title {
      font-family: var(--font-sans);
      font-size: 1.0625rem;
      font-weight: 700;
      letter-spacing: -.01em;
      line-height: 1.3;
      color: var(--color-text);
      margin: 0 0 .5rem;
    }
    .tour__tip-body {
      font-size: .9375rem;
      line-height: 1.5;
      color: var(--color-text-2, #6b7280);
      margin: 0 0 1rem;
    }
    .tour__tip-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
    }
    .tour__skip {
      background: transparent;
      border: none;
      color: var(--color-text-3, #9ca3af);
      font-size: .8125rem;
      font-weight: 500;
      cursor: pointer;
      padding: .375rem .25rem;
      font-family: inherit;
    }
    .tour__skip:hover { color: var(--color-text); }

    .tour__next {
      background: #0c0e13;
      color: #fff;
      border: none;
      padding: .5rem 1.25rem;
      border-radius: 999px;
      font-size: .8125rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: background .15s, transform .1s;
    }
    .tour__next:hover {
      background: #12C4E3;
      color: #0c0e13;
      transform: translateY(-1px);
    }

    /* Narrow viewport — drop tooltip max-width and bottom-anchor it
       so it doesn't fight a small spotlight area. */
    @media (max-width: 600px) {
      .tour__tip {
        max-width: calc(100vw - 2rem);
        left: 1rem !important;
      }
      .tour__tip--center {
        left: 50% !important;
      }
    }
  `]
})
export class TourComponent implements OnInit, OnDestroy {
  /** Spotlight padding around the target element (px). Larger →
   *  more breathing room around the halo; smaller → tighter. */
  readonly SPOTLIGHT_PAD = 6;

  /** localStorage key gating the tour. Cleared by the "Show tour
   *  again" link in account settings. */
  static readonly SEEN_KEY = 'cc_tour_seen';

  /** True when the runtime viewport is mobile-width. Steps swap their
   *  target selector accordingly so the spotlight always lands on a
   *  visible element (the desktop sidebar is hidden offscreen on
   *  mobile, which made the previous tour effectively invisible past
   *  the centered intro). */
  private isMobile(): boolean {
    return typeof window !== 'undefined' && window.innerWidth < 768;
  }

  /**
   * Tour steps. Targets are CSS selectors. Each step picks a desktop
   * vs. mobile selector at runtime so the spotlight lands on something
   * the user can actually see at their breakpoint. Centered slides
   * (target: null) are used for intro / outro and as a graceful
   * fallback when a target isn't in the DOM.
   */
  get steps(): TourStep[] {
    const m = this.isMobile();
    return [
      {
        target: null,
        title: "Welcome to Creator Companion",
        body: "A quick 5-step tour of the things that matter most. You can skip anytime.",
        placement: 'center'
      },
      {
        // Mobile uses the always-visible compose circle in the top
        // bar; desktop uses the sidebar's "Log Today's Progress" pill.
        target: m ? '.mobile-header__compose' : '.sidebar__compose',
        title: "Log today's progress",
        body: "Tap here every day to log a step in your creative practice. Even one sentence counts.",
        placement: m ? 'bottom' : 'right'
      },
      {
        // Streak module — mobile gets a centered slide (the streak
        // lives in the closed drawer on mobile, can't spotlight it
        // without auto-opening which gets messy).
        target: m ? null : '.sidebar__streak',
        title: "Your streak",
        body: "Grows each day you log. Miss a day? You have 48 hours to backlog before it resets. Open the menu (☰) anytime to see your current streak.",
        placement: m ? 'center' : 'right'
      },
      {
        // Reminders nav — same story; centered on mobile.
        target: m ? null : '.sidebar__nav-item--reminders',
        title: "Daily reminders",
        body: "Set up to 5 push notifications a day for whatever helps your practice. Find them under Reminders in the menu.",
        placement: m ? 'center' : 'right'
      },
      {
        target: null,
        title: "You're all set.",
        body: "You're on a 10-day free trial — full access to everything. Show this tour again anytime from your account settings.",
        placement: 'center'
      }
    ];
  }

  visible    = signal(false);
  stepIndex  = signal(0);
  currentStep = computed(() => this.steps[this.stepIndex()]);

  /** Bounding rect of the current step's target element, or null
   *  for centered slides / when the target can't be found. Updated
   *  on step change + window resize. */
  spotlightRect = signal<DOMRect | null>(null);

  /** Computed tooltip position, snapped to the spotlight's
   *  preferred placement and clamped to viewport. */
  tooltipPosition = computed<{ top: number; left: number }>(() => {
    const r = this.spotlightRect();
    if (!r) return { top: 0, left: 0 };

    const step = this.currentStep();
    const margin = 16;
    const tipWidth = 320;
    const tipHeight = 200; // approximate; doesn't need to be exact

    let top: number;
    let left: number;

    switch (step.placement) {
      case 'top':
        top  = r.top - tipHeight - margin;
        left = Math.max(margin, r.left + r.width / 2 - tipWidth / 2);
        break;
      case 'bottom':
        top  = r.bottom + margin;
        left = Math.max(margin, r.left + r.width / 2 - tipWidth / 2);
        break;
      case 'left':
        top  = Math.max(margin, r.top + r.height / 2 - tipHeight / 2);
        left = r.left - tipWidth - margin;
        break;
      case 'right':
      default:
        top  = Math.max(margin, r.top + r.height / 2 - tipHeight / 2);
        left = r.right + margin;
        break;
    }

    // Clamp to viewport bounds.
    const maxLeft = window.innerWidth - tipWidth - margin;
    const maxTop  = window.innerHeight - tipHeight - margin;
    left = Math.max(margin, Math.min(left, maxLeft));
    top  = Math.max(margin, Math.min(top, maxTop));

    return { top, left };
  });

  ngOnInit(): void {
    // Two trigger paths:
    //  1. ?tour=1 in the URL — explicit replay request from the
    //     account page. Always fires the tour regardless of the seen
    //     flag, then strips the param so a refresh doesn't loop.
    //     This is more robust than relying on localStorage.removeItem
    //     surviving a PWA reload (which has flaky behavior on iOS
    //     when the page is served from the service worker cache).
    //  2. cc_tour_seen flag absent — first-time auto-start.
    // Delay by a frame so the dashboard's child components (sidebar,
    // mobile-header) have rendered before we measure target rects.
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('tour') === '1';
    if (forced) {
      // Clear the seen flag and strip the URL param so the next
      // refresh doesn't get into a loop.
      try { localStorage.removeItem(TourComponent.SEEN_KEY); } catch {}
      params.delete('tour');
      const cleanUrl = window.location.pathname +
        (params.toString() ? '?' + params.toString() : '') +
        window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
      requestAnimationFrame(() => this.start());
      return;
    }
    if (!this.hasBeenSeen()) {
      requestAnimationFrame(() => this.start());
    }
  }

  ngOnDestroy(): void {
    // Nothing dynamic to tear down — host listeners are cleaned by
    // Angular automatically.
  }

  start(): void {
    this.stepIndex.set(0);
    this.visible.set(true);
    this.updateSpotlight();
  }

  next(): void {
    if (this.stepIndex() === this.steps.length - 1) {
      this.finish();
      return;
    }
    this.stepIndex.update(i => i + 1);
    this.updateSpotlight();
  }

  skip(): void {
    this.finish();
  }

  /** Closes the tour + persists the "seen" flag so it doesn't
   *  re-fire on every dashboard load. */
  private finish(): void {
    this.visible.set(false);
    try { localStorage.setItem(TourComponent.SEEN_KEY, '1'); }
    catch { /* private mode / quota — fall through, tour just shows again next session */ }
  }

  /** Re-measure the target element and update spotlight. Called on
   *  step change, window resize, and scroll. */
  private updateSpotlight(): void {
    const step = this.currentStep();
    if (!step.target) {
      this.spotlightRect.set(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (!el) {
      // Target not in DOM (e.g. responsive variant). Fall back to a
      // centered slide instead of a broken pointer.
      this.spotlightRect.set(null);
      return;
    }
    this.spotlightRect.set(el.getBoundingClientRect());
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    if (this.visible()) this.updateSpotlight();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible()) this.skip();
  }

  // ── Static helpers (used by account page to re-trigger) ──────────

  /** True if the user has already dismissed the tour. */
  private hasBeenSeen(): boolean {
    try { return localStorage.getItem(TourComponent.SEEN_KEY) === '1'; }
    catch { return false; }
  }

  /** Wipes the seen flag so the next dashboard load re-fires the
   *  tour. Called from the account page's "Show tour again" link. */
  static reset(): void {
    try { localStorage.removeItem(TourComponent.SEEN_KEY); }
    catch { /* ignore */ }
  }
}
