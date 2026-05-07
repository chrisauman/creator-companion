import { Component, EventEmitter, Input, Output, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MotivationEntry } from '../../core/models/models';
import { ApiService } from '../../core/services/api.service';
import { MoodIconComponent, SUPPORTED_MOOD_KEYS } from '../../shared/mood-icon/mood-icon.component';
import { DASHBOARD_PROMPTS, pickRandomPrompt } from './dashboard-prompts';
import { ThreatenedBannerComponent } from './threatened-banner.component';
import { DailyReminderCardComponent } from './daily-reminder-card.component';

/**
 * The Today view that lives in the dashboard's right column when no entry
 * is selected. Surfaces the Daily Spark plus four ways to start writing:
 *   1. "Start an entry from this" → Daily Spark CTA
 *   2. A small rotating prompt with a shuffle button
 *   3. A mood-first start row (12 line-icon moods)
 *   4. A "Just begin" blank-page card
 *
 * Continue-a-thread is intentionally deferred — it needs backend support
 * for tag-frequency analysis.
 */
@Component({
  selector: 'app-today-panel',
  standalone: true,
  imports: [CommonModule, MoodIconComponent, ThreatenedBannerComponent, DailyReminderCardComponent],
  template: `
    <div class="today">

      <!-- Streak threatened banner — always rendered first so it sits
           at the top of the Today column when active. The component
           decides whether to render itself (organic detection or
           preview prop). Inside this wrapper means it shares the same
           padding + margin-bottom rules as the spark/hero cards
           below, so spacing stays consistent. -->
      <app-threatened-banner
        [preview]="previewThreatened"
        (backlogYesterday)="backlogYesterday.emit($event)"
      ></app-threatened-banner>

      <!-- Daily reminder card — soft "did you log today's progress?"
           prompt. Self-deciding visibility: hides when an entry has
           been logged today, AND hides when the threatened banner
           is showing (those states should never overlap). -->
      <app-daily-reminder-card
        [preview]="previewDailyReminder"
        (writeToday)="composeBlank.emit()"
      ></app-daily-reminder-card>

      <!-- Spark hero — whole box is clickable to expand/collapse when there's more content. -->
      @if (motivation) {
        <div class="spark-hero"
             [class.spark-hero--expanded]="sparkExpanded()"
             [class.spark-hero--clickable]="hasMoreToShow()"
             (click)="onBoxClick($event)">

          <!-- Top-right corner controls. Heart sits to the left of the
               expand chevron so all card-level "tools" group together
               in one cluster, freeing the bottom of the card for the
               read-more text link only. Both buttons share the same
               circular pill treatment for visual unity. -->
          <div class="spark-hero__corner-actions"
               (click)="$event.stopPropagation()">
            @if (canFavorite) {
              <button class="spark-hero__corner-btn"
                      type="button"
                      [class.spark-hero__corner-btn--fav-active]="motivation.isFavorited"
                      [title]="motivation.isFavorited ? 'Remove from favorites' : 'Add to favorites'"
                      (click)="favoriteSpark.emit()">
                <svg width="14" height="14" viewBox="0 0 24 24"
                     [attr.fill]="motivation.isFavorited ? 'currentColor' : 'none'"
                     stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
            }
            @if (hasMoreToShow()) {
              <button class="spark-hero__corner-btn spark-hero__corner-btn--expand"
                      type="button"
                      [title]="sparkExpanded() ? 'Show less' : 'Read more'"
                      [attr.aria-expanded]="sparkExpanded()"
                      (click)="toggleSparkExpanded()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                     [style.transform]="sparkExpanded() ? 'rotate(180deg)' : 'rotate(0deg)'">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            }
          </div>

          <span class="spark-hero__eyebrow">Your Daily Spark</span>
          <p class="spark-hero__quote">{{ motivation.takeaway }}</p>

          <!-- Full content reveals when expanded. -->
          <div class="spark-hero__full" *ngIf="sparkExpanded() && hasMoreToShow()">
            <div class="spark-hero__divider"></div>
            <p class="spark-hero__body">{{ motivation.fullContent }}</p>
          </div>

          <!-- Bottom row holds only the inline "Read more / Show less"
               text link — heart + chevron moved up to the corner. -->
          @if (hasMoreToShow()) {
            <div class="spark-hero__actions"
                 (click)="$event.stopPropagation()">
              <button class="spark-hero__readmore" type="button"
                      (click)="toggleSparkExpanded()">
                {{ sparkExpanded() ? 'Show less' : 'Read more' }} →
              </button>
            </div>
          }
        </div>
      }

      <!-- Quick-start cards (prompt, mood, blank) -->
      <div class="start-section">

        <!-- Daily Prompt — same dark hero treatment as the Spark above -->
        <div class="hero-card">
          <button class="hero-card__shuffle" type="button"
                  (click)="shufflePrompt()"
                  title="Shuffle for a different prompt"
                  aria-label="Shuffle for a different prompt">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 3 21 3 21 8"/>
              <line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/>
              <line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
          </button>
          <span class="hero-card__eyebrow">Your Daily Prompt</span>
          <p class="hero-card__quote">{{ currentPrompt() }}</p>
          <div class="hero-card__actions">
            <button class="spark-action spark-action--primary" type="button"
                    (click)="composeFromPrompt.emit(currentPrompt())">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
              </svg>
              Journal about this
            </button>
          </div>
        </div>

        <!-- Mood-first start — same dark hero treatment, cyan icons -->
        <div class="hero-card hero-card--mood">
          <span class="hero-card__eyebrow">Begin with how you feel</span>
          <p class="hero-card__sub">Tap a mood to start journaling about how you're feeling today.</p>
          <div class="mood-row">
            @for (key of moodKeys; track key) {
              <button class="mood" type="button"
                      (click)="composeFromMood.emit(key)"
                      [title]="key">
                <app-mood-icon [mood]="key" [size]="22"></app-mood-icon>
                <span class="mood-label">{{ key }}</span>
              </button>
            }
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .today {
      padding: .75rem 1.5rem 3rem;
      max-width: 720px;
      margin: 0 auto;
    }
    /* When rendered inline on mobile (in dashboard.component), drop padding
       so the cards align to the page edges and use consistent gaps. */
    :host-context(.today-panel--mobile-wrap) .today {
      padding: 0;
      max-width: none;
    }

    /* ── Spark hero (Variant 3 — warm cream gradient) ─────────── */
    .spark-hero {
      background: linear-gradient(180deg, #fdfaf2 0%, #f6f1e6 100%);
      color: var(--color-text);
      border: 1px solid rgba(190,170,130,.22);
      border-radius: 20px;
      padding: 1.5rem 1.5rem 1.25rem;
      position: relative;
      overflow: hidden;
      margin-bottom: 1rem;
    }
    .spark-hero::before {
      content: '';
      position: absolute;
      top: -30%; right: -20%;
      width: 320px; height: 320px;
      background: radial-gradient(circle, rgba(18,196,227,.55) 0%, transparent 65%);
      opacity: .35;
      pointer-events: none;
    }
    .spark-hero__eyebrow {
      display: inline-flex; align-items: center; gap: .5rem;
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-accent-dark);
      margin-bottom: 1.25rem;
      position: relative;
    }
    .spark-hero__eyebrow::before {
      content: ''; width: 7px; height: 7px;
      background: #12C4E3; border-radius: 50%;
      box-shadow: 0 0 10px rgba(18,196,227,.6);
      animation: pulse 2.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .4; }
    }
    /* Mid-size display weight — sits between the column-2 list
       title (1.0625rem / 700) and the column-3 reading title
       (1.625rem / 700). Quoted content reads "feature" without
       competing with the actual entry title for visual primacy. */
    .spark-hero__quote {
      font-family: var(--font-sans);
      font-size: 1.25rem;
      line-height: 1.4;
      font-weight: 700;
      color: var(--color-text);
      position: relative;
      margin: 0 0 1.25rem;
      letter-spacing: -.01em;
    }
    .spark-hero__author {
      font-size: .8125rem;
      color: var(--color-text-2);
      margin: 0 0 1.25rem;
      position: relative;
    }
    .spark-hero__divider {
      height: 1px;
      background: rgba(190,170,130,.25);
      margin: 0 0 1rem;
      position: relative;
    }
    .spark-hero__body {
      font-size: .9375rem;
      line-height: 1.7;
      color: var(--color-text);
      position: relative;
      margin: 0 0 1.25rem;
      white-space: pre-wrap;
    }
    .spark-hero--expanded {
      background: linear-gradient(180deg, #fdfaf2 0%, #f6f1e6 60%, #f0e9d6 100%);
    }
    /* When the hero has more content to reveal, the whole box is clickable. */
    .spark-hero--clickable { cursor: pointer; }
    .spark-hero--clickable:hover {
      background: linear-gradient(180deg, #fefcf6 0%, #faf5ea 100%);
    }
    .spark-hero--clickable.spark-hero--expanded:hover {
      background: linear-gradient(180deg, #fefcf6 0%, #faf5ea 60%, #f4eedb 100%);
    }

    /* "Read more / Show less" link — sits inline at the right edge
       of the actions row so it's vertically centred with the Start
       writing button instead of stranded at the card's bottom edge. */
    .spark-hero__readmore {
      margin-left: auto;
      background: none;
      border: none;
      color: var(--color-accent);
      font-size: .75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .12em;
      padding: .375rem 0;
      cursor: pointer;
      font-family: inherit;
      transition: color .15s, transform .15s;
    }
    .spark-hero__readmore:hover {
      color: #0c0e13;
      transform: translateX(2px);
    }

    /* Top-right corner cluster — heart + expand chevron live here as
       a unified group. Absolutely positioned so it floats over the
       eyebrow/body without affecting their layout. */
    .spark-hero__corner-actions {
      position: absolute;
      top: .875rem;
      right: .875rem;
      display: flex;
      align-items: center;
      gap: .375rem;
      z-index: 1;
    }
    /* Shared circular pill button — same look for the heart and the
       expand chevron so the cluster reads as one tool group. */
    .spark-hero__corner-btn {
      width: 32px; height: 32px;
      display: grid; place-items: center;
      background: rgba(255,255,255,.7);
      border: 1px solid rgba(190,170,130,.3);
      border-radius: 50%;
      color: var(--color-text-2);
      cursor: pointer;
      font-family: inherit;
      transition: background .15s, border-color .15s, color .15s;
    }
    .spark-hero__corner-btn:hover {
      background: rgba(18,196,227,.12);
      border-color: rgba(18,196,227,.35);
      color: var(--color-accent-dark);
    }
    /* Active-favorite state — soft rose like the old spark-action
       --fav-active treatment, scoped to the corner button. */
    .spark-hero__corner-btn--fav-active {
      color: #e11d48;
      border-color: rgba(225,29,72,.3);
      background: rgba(225,29,72,.08);
    }
    .spark-hero__corner-btn--fav-active:hover {
      color: #be123c;
      border-color: rgba(225,29,72,.5);
      background: rgba(225,29,72,.14);
    }
    /* Smooth chevron rotation when expanding/collapsing. */
    .spark-hero__corner-btn--expand svg { transition: transform .25s ease; }

    .spark-hero__actions {
      display: flex;
      gap: .5rem;
      position: relative;
      align-items: center;
      flex-wrap: wrap;
    }
    /* Primary CTA — match the entry-reader Edit button (dark ink). */
    .spark-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .375rem;
      height: 36px;
      padding: 0 .875rem;
      border: 1px solid rgba(190,170,130,.3);
      background: rgba(255,255,255,.6);
      border-radius: 999px;
      color: var(--color-text);
      font-family: inherit;
      font-size: .8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: all .15s;
    }
    .spark-action:hover {
      background: rgba(255,255,255,.85);
      border-color: rgba(190,170,130,.5);
    }
    .spark-action--primary {
      background: #0c0e13;
      border-color: #0c0e13;
      color: #fff;
    }
    .spark-action--primary:hover {
      background: #12C4E3;
      border-color: #12C4E3;
      color: #fff;
    }

    /* ── Or, begin somewhere else ────────────────────────────── */
    .start-section { display: block; }
    .start-section__label {
      font-family: var(--font-sans);
      font-size: 1.0625rem;
      font-weight: 600;
      letter-spacing: -.005em;
      margin: 0 0 .375rem;
      color: var(--color-text);
    }
    .start-section__sub {
      font-size: .875rem;
      color: var(--color-text-2);
      margin: 0 0 1.25rem;
      line-height: 1.5;
    }

    /* ── Hero card (Variant 3 — shared cream gradient, used by
       Daily Prompt and Mood) ─────────────────────────────────── */
    .hero-card {
      background: linear-gradient(180deg, #fdfaf2 0%, #f6f1e6 100%);
      color: var(--color-text);
      border: 1px solid rgba(190,170,130,.22);
      border-radius: 20px;
      padding: 1.5rem 1.5rem 1.25rem;
      position: relative;
      overflow: hidden;
      margin-bottom: 1rem;
    }
    .hero-card::before {
      content: '';
      position: absolute;
      top: -30%; right: -20%;
      width: 320px; height: 320px;
      background: radial-gradient(circle, rgba(18,196,227,.45) 0%, transparent 65%);
      opacity: .35;
      pointer-events: none;
    }
    .hero-card__eyebrow {
      display: block;
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-accent-dark);
      margin-bottom: .875rem;
      position: relative;
    }
    /* Matches .spark-hero__quote — mid-size display sitting between
       the column-2 list title and the column-3 reading title. */
    .hero-card__quote {
      font-family: var(--font-sans);
      font-size: 1.25rem;
      line-height: 1.4;
      font-weight: 700;
      color: var(--color-text);
      position: relative;
      margin: 0 0 1.25rem;
      letter-spacing: -.01em;
    }
    .hero-card__sub {
      font-size: .8125rem;
      color: var(--color-text-2);
      position: relative;
      margin: 0 0 1.25rem;
      line-height: 1.5;
    }
    .hero-card__actions {
      display: flex;
      gap: .5rem;
      align-items: center;
      flex-wrap: wrap;
      position: relative;
    }
    .hero-card__shuffle {
      position: absolute;
      top: 1rem;
      right: 1rem;
      width: 32px; height: 32px;
      display: grid; place-items: center;
      background: rgba(255,255,255,.7);
      border: 1px solid rgba(190,170,130,.3);
      border-radius: 50%;
      color: var(--color-text-2);
      cursor: pointer;
      font-family: inherit;
      transition: background .15s, border-color .15s, transform .25s;
      z-index: 1;
    }
    .hero-card__shuffle:hover {
      background: rgba(18,196,227,.12);
      border-color: rgba(18,196,227,.35);
      color: var(--color-accent-dark);
      transform: rotate(180deg);
    }

    /* Mood grid inside the cream hero card — reflows from 6 → 4 → 3 cols */
    .mood-row {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
      gap: .5rem;
      position: relative;
    }
    .mood {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .5rem;
      padding: .75rem .25rem .625rem;
      border: 1px solid rgba(190,170,130,.25);
      border-radius: 12px;
      background: rgba(255,255,255,.55);
      color: var(--color-accent-dark);
      cursor: pointer;
      transition: all .15s;
      font-family: inherit;
    }
    .mood:hover {
      border-color: rgba(18,196,227,.45);
      background: rgba(255,255,255,.85);
      color: var(--color-accent-dark);
      transform: translateY(-2px);
    }
    .mood-label {
      font-size: .625rem;
      font-weight: 500;
      color: var(--color-text-2);
      text-align: center;
    }
    .mood:hover .mood-label { color: var(--color-text); }

    /* Just begin */
    .blank-card {
      width: 100%;
      background: var(--color-surface);
      border: 1px dashed var(--color-border);
      border-radius: 18px;
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      cursor: pointer;
      transition: all .15s;
      font-family: inherit;
      text-align: left;
    }
    .blank-card:hover {
      border-color: var(--color-text-3);
      border-style: solid;
      background: var(--color-surface);
    }
    .blank-card__text {
      font-size: .875rem;
      color: var(--color-text-2);
    }
    .blank-card__text strong {
      color: var(--color-text);
      font-weight: 700;
      margin-right: .375rem;
    }
    .blank-card__arrow {
      color: var(--color-text-3);
      flex-shrink: 0;
    }
  `]
})
export class TodayPanelComponent implements OnInit {
  private api = inject(ApiService);

  @Input() motivation: MotivationEntry | null = null;
  @Input() canFavorite: boolean = false;

  /** Forces the threatened banner to render with stub data — admin-only
   *  preview mode (?preview=threatened on the dashboard URL). The banner
   *  otherwise auto-detects state from the API and shows itself when the
   *  user is mid-grace. */
  @Input() previewThreatened: boolean = false;

  /** Forces the daily-reminder card to render — admin-only preview
   *  mode (?preview=daily-reminder). The card otherwise auto-detects
   *  visibility from the API (shows when no entry today, hides when
   *  the threatened banner is also showing). */
  @Input() previewDailyReminder: boolean = false;

  @Output() composeFromPrompt = new EventEmitter<string>();
  @Output() composeFromMood = new EventEmitter<string>();
  @Output() composeBlank = new EventEmitter<void>();
  @Output() favoriteSpark = new EventEmitter<void>();
  @Output() expandSpark = new EventEmitter<void>();
  /** Forwarded from the embedded threatened-banner — payload is
   *  yesterday's ISO date so the dashboard can pre-fill the composer. */
  @Output() backlogYesterday = new EventEmitter<string>();

  readonly moodKeys = SUPPORTED_MOOD_KEYS;

  /** True when the user has clicked the spark hero to reveal motivation.fullContent. */
  sparkExpanded = signal<boolean>(false);

  /** Returns true when fullContent exists and differs from the takeaway —
   *  i.e. there's actually more to reveal. The chevron and click-to-expand
   *  behavior only activates when this is true. */
  hasMoreToShow(): boolean {
    const m = this.motivation;
    return !!(m && m.fullContent && m.fullContent.trim() !== m.takeaway.trim());
  }

  toggleSparkExpanded(): void {
    if (!this.hasMoreToShow()) return;
    this.sparkExpanded.set(!this.sparkExpanded());
    this.expandSpark.emit();
  }

  /** Click anywhere on the box (except action buttons / corner chevron)
   *  toggles expansion. Action buttons and the corner chevron stop
   *  propagation so they don't double-fire. */
  onBoxClick(_event: MouseEvent): void {
    this.toggleSparkExpanded();
  }

  /**
   * Library of brief prompts. Fetched from the backend on mount; falls
   * back to the hardcoded DASHBOARD_PROMPTS list if the API call fails
   * or returns an empty result so the card is never empty.
   */
  private prompts = signal<string[]>(DASHBOARD_PROMPTS.slice());

  /** Currently displayed prompt — initialized to a random one from the list. */
  currentPrompt = signal<string>(this.prompts()[Math.floor(Math.random() * this.prompts().length)]);

  ngOnInit(): void {
    this.api.getDailyPrompts().subscribe({
      next: prompts => {
        if (prompts.length === 0) return; // keep hardcoded fallback
        const texts = prompts.map(p => p.text).filter(t => !!t);
        if (texts.length === 0) return;
        this.prompts.set(texts);
        // Re-pick a random initial prompt from the new list.
        this.currentPrompt.set(texts[Math.floor(Math.random() * texts.length)]);
      },
      error: () => {} // silently keep hardcoded fallback
    });
  }

  shufflePrompt(): void {
    this.currentPrompt.set(pickRandomPrompt(this.currentPrompt(), this.prompts()));
  }
}
