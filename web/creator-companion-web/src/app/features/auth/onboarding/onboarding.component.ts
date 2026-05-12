import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';

/**
 * Onboarding card flow shown immediately after registration AND
 * reachable on demand by admin / support FAQ (via /onboarding?replay=1).
 *
 * Six narrative slides introduce the product, then the user clicks
 * "Continue" on slide 6 to chain into the dashboard tour (which adds
 * tooltip pointers on the major features). The tour is started via a
 * `?tour=1` query param on /dashboard — same mechanism the account
 * page's "Show tour again" link uses, so the two replay paths share
 * the same code path.
 *
 * Icons are 32×32 outlined SVGs in brand cyan (#12C4E3) — same single-
 * stroke language used elsewhere in the app. The icon for each slide
 * anchors the visual identity of the slide without competing with the
 * body copy.
 */
interface Slide {
  title: string;
  body: string;
  iconKey: 'partner' | 'journal' | 'tools' | 'celebrate' | 'pause' | 'compass';
}

const SLIDES: Slide[] = [
  {
    iconKey: 'partner',
    title: 'Your daily accountability partner',
    body: 'Many creative people struggle with maintaining a daily practice. Creator Companion is your daily accountability partner — here to support you, encourage you, and keep you on track.'
  },
  {
    iconKey: 'journal',
    title: 'One step a day',
    body: 'Creator Companion encourages you to log a daily journal entry that represents a step forward in your creative practice. It doesn\'t matter if the step is big or small. Only 10 words required. Small steps add up to big accomplishments over time. This is the goal.'
  },
  {
    iconKey: 'tools',
    title: 'Tools to support you',
    body: 'To support you in this goal, your companion provides a daily spark of advice, daily writing prompts, custom push reminders, and a to-do list. Use your to-do list for things you want to do every day or one-time tasks.'
  },
  {
    iconKey: 'celebrate',
    title: 'Look back and celebrate',
    body: 'Feeling accomplished is critical. You can look back on your journal any time, save favorite entries and advice, check things off your to-do list and admire your history, search for past entries, and easily keep track of your creative "Streaks."'
  },
  {
    iconKey: 'pause',
    title: 'Life happens — and that\'s okay',
    body: 'Miss a day? You have 48 hours to log an entry and keep the streak alive. Need to take a longer break for a vacation or life change? Pause your streak for up to 10 days!'
  },
  {
    iconKey: 'compass',
    title: 'Ready to begin?',
    body: 'Ready to get started and log your first entry? Here\'s a quick tour.'
  }
];

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="onboarding-page" id="main">
      <h1 class="sr-only">Welcome to Creator Companion</h1>
      <div class="onboarding-card card fade-in">

        <div class="step-content">
          <div class="step-icon" aria-hidden="true">
            @switch (currentSlide().iconKey) {
              @case ('partner') {
                <!-- Heart with a small "spark" — accountability + warmth -->
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 27s-9-5.5-9-13a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7.5-9 13-9 13z"/>
                  <path d="M22 7l1 -2 1 2 2 1 -2 1 -1 2 -1 -2 -2 -1z" fill="currentColor" stroke="none"/>
                </svg>
              }
              @case ('journal') {
                <!-- Open journal / notebook -->
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 8a2 2 0 0 1 2-2h6v20H8a2 2 0 0 1-2-2V8z"/>
                  <path d="M26 8a2 2 0 0 0-2-2h-6v20h6a2 2 0 0 0 2-2V8z"/>
                  <line x1="9" y1="11" x2="11" y2="11"/>
                  <line x1="9" y1="14" x2="11" y2="14"/>
                  <line x1="21" y1="11" x2="23" y2="11"/>
                  <line x1="21" y1="14" x2="23" y2="14"/>
                </svg>
              }
              @case ('tools') {
                <!-- Lightbulb — ideas + tools -->
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 21h10"/>
                  <path d="M12 25h8"/>
                  <path d="M16 5a7 7 0 0 0-5 11.9c1.1 1.1 1.7 2 1.9 3.1h6.2c.2-1.1.8-2 1.9-3.1A7 7 0 0 0 16 5z"/>
                </svg>
              }
              @case ('celebrate') {
                <!-- Star bookmark — accomplishment + history -->
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 4l3.5 7.1 7.8 1.1-5.6 5.5 1.3 7.8L16 21.8l-7 3.7 1.3-7.8L4.7 12.2l7.8-1.1L16 4z"/>
                </svg>
              }
              @case ('pause') {
                <!-- Clock with curved arrow — grace, time, second chances -->
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="16" cy="16" r="10"/>
                  <polyline points="16 11 16 16 19 18"/>
                  <path d="M26 8l1 4-4 1" stroke-dasharray="0"/>
                </svg>
              }
              @case ('compass') {
                <!-- Compass — heading forward, beginning a journey -->
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="16" cy="16" r="11"/>
                  <polygon points="20 12 14 14 12 20 18 18 20 12" fill="currentColor" stroke="none"/>
                </svg>
              }
            }
          </div>
          <h2>{{ currentSlide().title }}</h2>
          <p class="step-body">{{ currentSlide().body }}</p>
        </div>

        <div class="step-dots" aria-hidden="true">
          @for (s of slides; let i = $index; track i) {
            <span class="dot" [class.dot--active]="i === slideIndex()"></span>
          }
        </div>

        <div class="step-actions">
          <button class="btn btn--primary btn--full btn--lg"
                  [disabled]="loading()"
                  (click)="next()">
            {{ ctaLabel() }}
          </button>
          @if (slideIndex() < slides.length - 1) {
            <button class="btn btn--ghost btn--full btn--sm" (click)="finish()">
              Skip
            </button>
          }
        </div>
      </div>
    </main>
  `,
  styles: [`
    .onboarding-page {
      /* See login.component.ts for the iOS Safari 100vh rationale. */
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: var(--color-bg);
    }
    .onboarding-card {
      width: 100%;
      max-width: 480px;
    }

    .step-content { text-align: center; padding: 1.5rem 0 2rem; }

    /* 64×64 icon container, brand-cyan SVG with no fill — sits on a
       faint accent halo so it reads as the slide's anchor without
       competing with the headline below. */
    .step-icon {
      width: 64px;
      height: 64px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.5rem;
      border-radius: 50%;
      background: var(--color-accent-light);
      color: var(--color-accent);
    }
    .step-icon svg { width: 32px; height: 32px; display: block; }

    .step-content h2 {
      font-size: 1.375rem;
      font-weight: 800;
      letter-spacing: -.01em;
      line-height: 1.25;
      color: var(--color-text);
      margin: 0;
    }
    .step-body {
      font-size: 1rem;
      line-height: 1.6;
      color: var(--color-text);
      margin: .9375rem 0 0;
    }

    .step-dots {
      display: flex;
      justify-content: center;
      gap: .5rem;
      margin-bottom: 1.75rem;
    }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--color-border);
      transition: background .2s, transform .2s;
    }
    .dot--active {
      background: var(--color-accent);
      transform: scale(1.25);
    }

    .step-actions { display: flex; flex-direction: column; gap: .625rem; }
  `]
})
export class OnboardingComponent {
  private auth   = inject(AuthService);
  private api    = inject(ApiService);
  private router = inject(Router);

  slides     = SLIDES;
  slideIndex = signal(0);
  loading    = signal(false);

  currentSlide() { return SLIDES[this.slideIndex()]; }

  ctaLabel(): string {
    if (this.loading()) return 'Starting tour…';
    return this.slideIndex() < SLIDES.length - 1 ? 'Continue' : 'Start tour';
  }

  next(): void {
    if (this.slideIndex() < SLIDES.length - 1) {
      this.slideIndex.update(i => i + 1);
    } else {
      // Final slide → mark onboarding complete and chain into the tour
      // on /dashboard via the ?tour=1 query param. Same trigger the
      // FAQ replay link and admin preview link use.
      this.finish(true);
    }
  }

  /**
   * Mark onboarding complete server-side, then route to the dashboard.
   * If chainTour=true, append ?tour=1 so the tour component auto-fires
   * on first paint. Skip path passes chainTour=false → no tour, just
   * dashboard.
   */
  finish(chainTour: boolean = false): void {
    this.loading.set(true);
    const dest = chainTour ? ['/dashboard'] : ['/dashboard'];
    const queryParams = chainTour ? { tour: 1 } : undefined;
    this.api.completeOnboarding().subscribe({
      next:  () => this.router.navigate(dest, queryParams ? { queryParams } : undefined),
      error: () => this.router.navigate(dest, queryParams ? { queryParams } : undefined)
    });
  }
}
