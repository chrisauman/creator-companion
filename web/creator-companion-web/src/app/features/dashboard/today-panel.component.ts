import { Component, EventEmitter, Input, Output, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MotivationEntry } from '../../core/models/models';
import { ApiService } from '../../core/services/api.service';
import { MoodIconComponent, SUPPORTED_MOOD_KEYS } from '../../shared/mood-icon/mood-icon.component';
import { DASHBOARD_PROMPTS, pickRandomPrompt } from './dashboard-prompts';

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
  imports: [CommonModule, MoodIconComponent],
  template: `
    <div class="today">

      <!-- Spark hero -->
      @if (motivation) {
        <div class="spark-hero">
          <span class="spark-hero__eyebrow">Your Daily Spark</span>
          <p class="spark-hero__quote">{{ motivation.takeaway }}</p>
          @if (motivation.title) {
            <p class="spark-hero__author">— {{ motivation.title }}</p>
          }
          <div class="spark-hero__actions">
            <button class="spark-action spark-action--primary" type="button"
                    (click)="composeFromSpark.emit()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
              </svg>
              Start an entry from this
            </button>

            @if (canFavorite) {
              <button class="spark-action spark-action--icon"
                      type="button"
                      [class.spark-action--fav-active]="motivation.isFavorited"
                      [title]="motivation.isFavorited ? 'Remove from favorites' : 'Add to favorites'"
                      (click)="favoriteSpark.emit()">
                <svg width="14" height="14" viewBox="0 0 24 24"
                     [attr.fill]="motivation.isFavorited ? 'currentColor' : 'none'"
                     stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
            }

            <button class="spark-action spark-action--icon"
                    type="button"
                    title="Read the full Spark"
                    (click)="expandSpark.emit()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
        </div>
      }

      <!-- Or, begin somewhere else -->
      <div class="start-section">
        <h3 class="start-section__label">Or, begin somewhere else</h3>
        <p class="start-section__sub">
          A few quick ways to start writing today. Each one opens a new entry.
        </p>

        <!-- Brief prompt card -->
        <div class="prompt-card">
          <div class="prompt-card__header">
            <span class="prompt-card__tag">A small prompt</span>
            <button class="prompt-card__shuffle" type="button"
                    (click)="shufflePrompt()"
                    title="Shuffle for a different prompt">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 3 21 3 21 8"/>
                <line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/>
                <line x1="15" y1="15" x2="21" y2="21"/>
                <line x1="4" y1="4" x2="9" y2="9"/>
              </svg>
            </button>
          </div>
          <p class="prompt-card__question">{{ currentPrompt() }}</p>
          <button class="prompt-card__cta" type="button"
                  (click)="composeFromPrompt.emit(currentPrompt())">
            Start writing →
          </button>
        </div>

        <!-- Mood-first start -->
        <div class="mood-card">
          <div class="mood-card__title">Begin with how you feel</div>
          <div class="mood-card__sub">Tap a mood — it'll start a new entry pre-tagged.</div>
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

        <!-- Just begin -->
        <button class="blank-card" type="button" (click)="composeBlank.emit()">
          <span class="blank-card__text">
            <strong>Or just begin where you are.</strong> Open a blank page.
          </span>
          <svg class="blank-card__arrow" width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .today {
      padding: 1.75rem 2rem 4rem;
      max-width: 720px;
      margin: 0 auto;
    }

    /* ── Spark hero ───────────────────────────────────────────── */
    .spark-hero {
      background: linear-gradient(180deg, #0c0e13 0%, #1a1d24 100%);
      color: #fff;
      border-radius: 24px;
      padding: 1.75rem 1.75rem 1.5rem;
      position: relative;
      overflow: hidden;
      margin-bottom: 2.25rem;
    }
    .spark-hero::before {
      content: '';
      position: absolute;
      top: -30%; right: -20%;
      width: 320px; height: 320px;
      background: radial-gradient(circle, #12C4E3 0%, transparent 65%);
      opacity: .25;
      pointer-events: none;
    }
    .spark-hero__eyebrow {
      display: inline-flex; align-items: center; gap: .5rem;
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: #12C4E3;
      margin-bottom: 1.25rem;
      position: relative;
    }
    .spark-hero__eyebrow::before {
      content: ''; width: 7px; height: 7px;
      background: #12C4E3; border-radius: 50%;
      box-shadow: 0 0 10px #12C4E3;
      animation: pulse 2.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .4; }
    }
    .spark-hero__quote {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 1.25rem;
      line-height: 1.45;
      font-weight: 500;
      color: rgba(255,255,255,.95);
      position: relative;
      margin: 0 0 .875rem;
      letter-spacing: -.005em;
    }
    .spark-hero__author {
      font-size: .8125rem;
      color: rgba(255,255,255,.55);
      margin: 0 0 1.25rem;
      position: relative;
    }
    .spark-hero__actions {
      display: flex;
      gap: .5rem;
      position: relative;
      align-items: center;
      flex-wrap: wrap;
    }
    .spark-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .375rem;
      height: 36px;
      padding: 0 .875rem;
      border: 1px solid rgba(255,255,255,.12);
      background: rgba(255,255,255,.05);
      border-radius: 999px;
      color: rgba(255,255,255,.85);
      font-family: inherit;
      font-size: .8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: all .15s;
    }
    .spark-action:hover { background: rgba(255,255,255,.1); }
    .spark-action--primary {
      background: #12C4E3;
      border-color: #12C4E3;
      color: #0c0e13;
    }
    .spark-action--primary:hover { background: #0bd2f0; }
    .spark-action--icon { width: 36px; padding: 0; }
    .spark-action--fav-active {
      color: #ff6b8a;
      border-color: rgba(255,107,138,.3);
      background: rgba(255,107,138,.08);
    }

    /* ── Or, begin somewhere else ────────────────────────────── */
    .start-section { display: block; }
    .start-section__label {
      font-family: 'Fraunces', Georgia, serif;
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

    /* Brief prompt card */
    .prompt-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 18px;
      padding: 1.375rem 1.5rem 1.25rem;
      margin-bottom: 1rem;
    }
    .prompt-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: .875rem;
    }
    .prompt-card__tag {
      font-size: .625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-text-3);
    }
    .prompt-card__shuffle {
      width: 28px; height: 28px;
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      border-radius: 50%;
      display: grid; place-items: center;
      cursor: pointer;
      color: var(--color-text-2);
      transition: all .25s;
    }
    .prompt-card__shuffle:hover {
      color: var(--color-accent);
      border-color: var(--color-accent);
      transform: rotate(180deg);
    }
    .prompt-card__question {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 1.1875rem;
      font-weight: 500;
      line-height: 1.4;
      color: var(--color-text);
      margin: 0 0 1rem;
      letter-spacing: -.005em;
    }
    .prompt-card__cta {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      font-size: .8125rem;
      font-weight: 600;
      color: var(--color-accent);
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      font-family: inherit;
    }
    .prompt-card__cta:hover { color: var(--color-text); }

    /* Mood-first card */
    .mood-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 18px;
      padding: 1.375rem 1.5rem 1.5rem;
      margin-bottom: 1rem;
    }
    .mood-card__title {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 1.0625rem;
      font-weight: 600;
      margin-bottom: 2px;
      color: var(--color-text);
    }
    .mood-card__sub {
      font-size: .75rem;
      color: var(--color-text-3);
      margin-bottom: 1rem;
    }
    /* Mood grid reflows from 6 → 4 → 3 cols as the right column narrows. */
    .mood-row {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
      gap: .375rem;
    }
    .mood {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .375rem;
      padding: .75rem .25rem .625rem;
      border: 1px solid var(--color-border);
      border-radius: 12px;
      background: var(--color-bg);
      color: var(--color-text-2);
      cursor: pointer;
      transition: all .15s;
      font-family: inherit;
    }
    .mood:hover {
      border-color: var(--color-accent);
      background: rgba(18,196,227,.06);
      color: var(--color-accent);
      transform: translateY(-2px);
    }
    .mood-label {
      font-size: .625rem;
      font-weight: 500;
      color: var(--color-text-3);
      text-align: center;
    }
    .mood:hover .mood-label { color: var(--color-accent); }

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

  @Output() composeFromSpark = new EventEmitter<void>();
  @Output() composeFromPrompt = new EventEmitter<string>();
  @Output() composeFromMood = new EventEmitter<string>();
  @Output() composeBlank = new EventEmitter<void>();
  @Output() favoriteSpark = new EventEmitter<void>();
  @Output() expandSpark = new EventEmitter<void>();

  readonly moodKeys = SUPPORTED_MOOD_KEYS;

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
