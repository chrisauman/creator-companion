import { Component, EventEmitter, Output, OnInit, input, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TokenService } from '../../core/services/token.service';
import { StreakHistoryItem, StreakStats } from '../../core/models/models';

/**
 * Welcome Back — full-takeover screen shown the first time a user opens
 * the app after a streak break. The single most important emotional
 * surface in the streak system: it reframes the broken streak as a
 * completed chapter ("banked," not "lost"), surfaces the previous run
 * as an accomplishment, and offers a low-friction restart cue.
 *
 * Triggered two ways:
 *
 *  1. Preview (admin only) — `?preview=welcome-back` on the dashboard
 *     URL. Renders with sample data, ignores dismissal state, never
 *     touches localStorage.
 *
 *  2. Organic — when the user's currentStreak is 0, they have at
 *     least one completed chapter, and they haven't already dismissed
 *     this specific break (keyed by the last entry's date in
 *     localStorage). Loaded from /v1/entries/streak/history.
 *
 * Three escape paths:
 *  - Log today's progress → opens compose. Dashboard handles the route.
 *  - Skip → dismisses the screen for this break (persisted) and shows
 *    the regular dashboard. Same effect as "view dashboard."
 *  - View dashboard → identical to Skip; included as a second affordance
 *    because users skim the corners differently than the center.
 *
 * Tone is "cheerful + patient cheerleader." Never names the loss. Frames
 * forward. The product framing is "log a step in your creative practice"
 * rather than "write" — copy here intentionally avoids "write/words/lines"
 * vocabulary so it works for any creative discipline (visual art, music,
 * film, etc), not just writing.
 */
@Component({
  selector: 'app-welcome-back',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div class="welcome-back" role="dialog" aria-labelledby="welcome-back-title">
      <div class="welcome-back__inner">

        @if (preview()) {
          <div class="welcome-back__demo-banner">
            Preview mode — sample data, nothing is saved.
          </div>
        }

        <h1 id="welcome-back-title" class="welcome-back__hello">
          Welcome back<ng-container *ngIf="firstName()">, {{ firstName() }}</ng-container>.
        </h1>

        @if (lastChapter(); as c) {
          <p class="welcome-back__intro">
            Your last chapter was <strong>{{ c.days }}</strong> {{ c.days === 1 ? 'day' : 'days' }}.<br>
            Every step you took is still here to reflect on.
          </p>

          <div class="welcome-back__divider">
            <span>Your progress</span>
          </div>

          <div class="welcome-back__stats">
            <div class="welcome-back__stat">
              <strong>{{ c.entryCount }}</strong>
              {{ c.entryCount === 1 ? 'entry' : 'entries' }}
            </div>
            <div class="welcome-back__stat-divider"></div>
            <div class="welcome-back__stat">
              {{ c.startDate | date:'MMM d' }}
              <span class="welcome-back__arrow">→</span>
              {{ c.endDate | date:'MMM d, y' }}
            </div>
          </div>
        } @else if (loading()) {
          <p class="welcome-back__intro welcome-back__intro--loading">Loading…</p>
        }

        <button class="welcome-back__cta"
                type="button"
                (click)="onWriteOneSentence()">
          Log today's progress
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>

        <p class="welcome-back__hint">
          Every step forward builds momentum!
        </p>

        <div class="welcome-back__skip">
          <button type="button" (click)="onSkip()">skip</button>
          <span aria-hidden="true">·</span>
          <button type="button" (click)="onSkip()">view dashboard</button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    /* Full-viewport takeover. Sits over the dashboard with a soft
       cream background that matches the rest of the app's light
       surfaces. Generous vertical centering — gives the moment
       breathing room. */
    .welcome-back {
      position: fixed;
      inset: 0;
      z-index: 50;
      background: linear-gradient(180deg, #fdfaf2 0%, #f6f1e6 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow-y: auto;
      padding: 2rem 1.25rem;
    }

    /* Centered column — narrow on purpose so copy lands like a poem,
       not a paragraph. */
    .welcome-back__inner {
      max-width: 540px;
      width: 100%;
      text-align: center;
      padding: 1.5rem 1rem;
      position: relative;
    }

    .welcome-back__demo-banner {
      background: rgba(18,196,227,.1);
      border: 1px solid rgba(18,196,227,.25);
      color: var(--color-accent-dark, var(--color-accent));
      font-size: .8125rem;
      padding: .5rem .875rem;
      border-radius: .375rem;
      margin-bottom: 1.5rem;
    }

    /* The hello — Fraunces 800, big and warm. Reserve display serif for
       this single line; everything below it is body text. */
    .welcome-back__hello {
      font-family: var(--font-brand);
      font-size: 2.5rem;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -.025em;
      color: #1a1d24;
      margin: 0 0 1.75rem;
    }

    .welcome-back__intro {
      font-size: 1.0625rem;
      line-height: 1.6;
      color: #2a2f3a;
      margin: 0 0 2rem;
    }
    .welcome-back__intro strong {
      color: var(--color-accent-dark, var(--color-accent));
      font-weight: 700;
    }
    .welcome-back__intro--loading {
      color: #6b7280;
      font-style: italic;
    }

    /* "what you wrote" eyebrow with hairline rules on either side. Quiet
       caps with extra letter spacing — reads as a section divider, not
       a header. */
    .welcome-back__divider {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.25rem;
      color: #6b7280;
    }
    .welcome-back__divider::before,
    .welcome-back__divider::after {
      content: '';
      height: 1px;
      background: rgba(0,0,0,.1);
    }
    .welcome-back__divider span {
      font-size: .6875rem;
      letter-spacing: .15em;
      text-transform: uppercase;
      font-weight: 600;
    }

    /* Two-line stats block. Soft, low-contrast — a memory, not a
       scoreboard. */
    .welcome-back__stats {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      flex-wrap: wrap;
      margin: 0 0 2.5rem;
      color: #2a2f3a;
      font-size: .9375rem;
    }
    .welcome-back__stat strong {
      font-weight: 700;
      color: #1a1d24;
    }
    .welcome-back__stat-divider {
      width: 4px;
      height: 4px;
      background: #c7c2b6;
      border-radius: 50%;
    }
    .welcome-back__arrow {
      color: #9ca3af;
      margin: 0 .25rem;
    }

    /* Single primary CTA — brand cyan, pill, generously sized. The only
       thing on screen the user must look at if they skim. */
    .welcome-back__cta {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      background: var(--color-accent);
      color: #fff;
      border: none;
      padding: .875rem 1.75rem;
      border-radius: 999px;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: -.005em;
      cursor: pointer;
      font-family: inherit;
      box-shadow: 0 2px 12px rgba(18,196,227,.2);
      transition: background .15s ease, transform .1s ease, box-shadow .15s ease;
    }
    .welcome-back__cta:hover {
      background: #0bd2f0;
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(18,196,227,.3);
    }
    .welcome-back__cta:active {
      transform: translateY(0);
    }

    .welcome-back__hint {
      margin: .875rem 0 2.25rem;
      color: #6b7280;
      font-size: .875rem;
      font-style: italic;
    }

    /* Quiet escape line — easy to find, easy to ignore. Two text
       buttons with a middle-dot separator, both routing to the same
       dismiss action. */
    .welcome-back__skip {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      color: #9ca3af;
      font-size: .8125rem;
    }
    .welcome-back__skip button {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      padding: .25rem .25rem;
      transition: color .15s ease;
    }
    .welcome-back__skip button:hover {
      color: var(--color-text);
      text-decoration: underline;
    }

    /* Narrow viewport */
    @media (max-width: 600px) {
      .welcome-back__hello { font-size: 2rem; }
      .welcome-back__intro { font-size: 1rem; }
      .welcome-back__cta   { padding: .75rem 1.5rem; font-size: .9375rem; }
    }
  `]
})
export class WelcomeBackComponent implements OnInit {
  private api    = inject(ApiService);
  private tokens = inject(TokenService);
  private route  = inject(ActivatedRoute);

  /** True when running under `?preview=welcome-back`. Drives the demo
   *  banner + bypasses dismissal persistence. Signal input — parent
   *  binds via [preview]="..." and the value is read with preview()
   *  inside the template + ngOnInit. */
  preview = input(false);

  /** User clicked the primary CTA — dashboard should hide this and
   *  open the entry composer. */
  @Output() writeOneSentence = new EventEmitter<void>();

  /** User chose skip / view dashboard — dashboard hides this and
   *  records dismissal so it doesn't show again for this break. */
  @Output() dismissed = new EventEmitter<void>();

  loading     = signal(true);
  lastChapter = signal<StreakHistoryItem | null>(null);

  /** Pulled from cached user info. Falsy → render "Welcome back."
   *  without the name, which still reads naturally. */
  firstName = computed<string>(() => this.tokens.getCachedUser()?.firstName ?? '');

  ngOnInit(): void {
    if (this.preview()) {
      // Sample chapter — the same shape returned by /entries/streak/history.
      // Numbers chosen to feel "completed and meaningful" without being
      // suspiciously round.
      this.lastChapter.set({
        startDate: '2026-04-22',
        endDate:   '2026-05-05',
        days: 14,
        entryCount: 14,
        isPersonalBest: false,
      });
      this.loading.set(false);
      return;
    }

    // Organic mode — fetch the most recent completed chapter.
    this.api.getStreakHistory().subscribe({
      next: list => {
        if (list.length > 0) this.lastChapter.set(list[0]);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  onWriteOneSentence(): void {
    this.writeOneSentence.emit();
  }

  onSkip(): void {
    this.dismissed.emit();
  }
}
