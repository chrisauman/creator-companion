import { Component, EventEmitter, Output, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { StreakHistoryItem, StreakStats } from '../../core/models/models';

/**
 * Streak History view. Renders in column 3 of the dashboard when the user
 * clicks "History" next to "Best" in the sidebar's streak widget. Shows
 * lifetime totals at the top and every completed past streak (chapter)
 * below, most recent first.
 *
 * The currently-ongoing streak is intentionally omitted — it lives in the
 * sidebar widget, not in history. Each chapter card stays minimal: days,
 * date range, entry count. No word counts (skipped per design).
 *
 * Tone: this page is part of the "streak break is a chapter ending, not
 * a failure" reframe. Past streaks are *banked*, not lost. Treat the copy
 * accordingly — "Your chapters" not "broken streaks", "personal best"
 * not "longest", etc.
 */
@Component({
  selector: 'app-streak-history',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div class="embedded-section">
      <div class="reader-top">
        <div class="reader-top__inner">
          <button class="cancel-pill" type="button" (click)="returnToToday.emit()">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/>
            </svg>
            Today
          </button>
          <div class="reader-top__breadcrumb"><strong>Streak history</strong></div>
          <div class="reader-top__actions"></div>
        </div>
      </div>

      <div class="embedded-section__body">

        <!-- Lifetime stats — three numbers at a glance. The headline is
             "personal best" (longest streak) since that's the most
             emotionally resonant; total active days is the lifetime
             story; chapters completed reframes streak ends as
             accomplishments. -->
        @if (stats(); as s) {
          <section class="lifetime">
            <div class="lifetime__cell">
              <div class="lifetime__num">{{ s.longestStreak }}</div>
              <div class="lifetime__label">personal best</div>
            </div>
            <div class="lifetime__divider"></div>
            <div class="lifetime__cell">
              <div class="lifetime__num">{{ chapterCount() }}</div>
              <div class="lifetime__label">{{ chapterCount() === 1 ? 'chapter' : 'chapters' }}</div>
            </div>
            <div class="lifetime__divider"></div>
            <div class="lifetime__cell">
              <div class="lifetime__num">{{ s.totalActiveDays }}</div>
              <div class="lifetime__label">days journaled</div>
            </div>
          </section>
        }

        <!-- Loading + empty + content states -->
        @if (loading()) {
          <p class="hint">Loading…</p>
        } @else if (history().length === 0) {
          <div class="empty">
            <p class="empty__title">No completed chapters yet.</p>
            <p class="empty__body">
              Your first finished chapter will appear here whenever your
              current streak ends. Until then, keep going — every day is
              part of the story.
            </p>
          </div>
        } @else {
          <h2 class="chapters-title">Your chapters</h2>
          <p class="chapters-sub">
            Every streak is a chapter — they end, and another begins.
          </p>

          <ul class="chapters">
            @for (item of history(); track item.startDate + '-' + item.endDate) {
              <li class="chapter"
                  [class.chapter--best]="item.isPersonalBest">
                <div class="chapter__head">
                  <span class="chapter__days">
                    {{ item.days }} {{ item.days === 1 ? 'day' : 'days' }}
                  </span>
                  @if (item.isPersonalBest) {
                    <span class="chapter__badge">★ personal best</span>
                  }
                </div>
                <div class="chapter__meta">
                  {{ item.startDate | date:'MMM d, y' }}
                  &nbsp;→&nbsp;
                  {{ item.endDate   | date:'MMM d, y' }}
                </div>
                <div class="chapter__stats">
                  {{ item.entryCount }} {{ item.entryCount === 1 ? 'entry' : 'entries' }}
                </div>
              </li>
            }
          </ul>
        }
      </div>
    </div>
  `,
  styles: [`
    /* Layout chrome reused from other column-3 surfaces (entry-reader,
       favorites, todos) so this view sits flush with the rest of the
       dashboard's right column. */
    .embedded-section { display: flex; flex-direction: column; height: 100%; }
    .embedded-section__body {
      padding: 1.25rem 1.5rem 2rem;
      overflow-y: auto;
    }

    /* Lifetime totals — three big numbers separated by hairlines.
       Reads as a single emotional headline, not a stats dashboard. */
    .lifetime {
      display: grid;
      grid-template-columns: 1fr auto 1fr auto 1fr;
      align-items: center;
      gap: 0;
      padding: 1rem 0 1.5rem;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 1.5rem;
    }
    .lifetime__cell { text-align: center; }
    .lifetime__num {
      font-family: var(--font-brand);
      font-size: 2rem;
      font-weight: 800;
      line-height: 1;
      color: var(--color-text);
      margin-bottom: .25rem;
    }
    .lifetime__label {
      font-size: .75rem;
      color: var(--color-text-muted);
      text-transform: lowercase;
      letter-spacing: .02em;
    }
    .lifetime__divider {
      width: 1px;
      height: 32px;
      background: var(--color-border);
    }

    .chapters-title {
      font-family: var(--font-brand);
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -.01em;
      line-height: 1.3;
      margin: 0 0 .25rem;
    }
    .chapters-sub {
      font-size: .8125rem;
      color: var(--color-text-muted);
      margin: 0 0 1rem;
      font-style: italic;
    }

    /* Chapter cards. Soft surface, no harsh borders. Personal-best card
       gets a cyan left rule as a subtle highlight. */
    .chapters {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: .75rem;
    }
    .chapter {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: .5rem;
      padding: .875rem 1rem;
      transition: background .15s ease;
    }
    .chapter:hover { background: var(--color-surface-2); }
    .chapter--best {
      border-left: 3px solid var(--color-accent);
      padding-left: calc(1rem - 2px);
    }
    .chapter__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: .5rem;
      margin-bottom: .25rem;
    }
    .chapter__days {
      font-family: var(--font-brand);
      font-weight: 700;
      font-size: 1.0625rem;
      color: var(--color-text);
      letter-spacing: -.01em;
    }
    .chapter__badge {
      font-size: .6875rem;
      color: var(--color-accent);
      font-weight: 600;
      letter-spacing: .04em;
      text-transform: lowercase;
    }
    .chapter__meta {
      font-size: .8125rem;
      color: var(--color-text-muted);
      margin-bottom: .25rem;
    }
    .chapter__stats {
      font-size: .75rem;
      color: var(--color-text-muted);
    }

    .hint {
      color: var(--color-text-muted);
      font-size: .9375rem;
      padding: 1.5rem 0;
      text-align: center;
    }

    /* Empty state — first-streak users will see this. Warm copy that
       frames the absence positively, not as a "no data" message. */
    .empty {
      text-align: center;
      padding: 2rem 1rem;
      color: var(--color-text-muted);
    }
    .empty__title {
      font-family: var(--font-brand);
      font-size: 1.0625rem;
      font-weight: 700;
      color: var(--color-text);
      margin: 0 0 .5rem;
    }
    .empty__body {
      font-size: .875rem;
      line-height: 1.5;
      margin: 0;
      max-width: 36ch;
      margin-inline: auto;
    }
  `]
})
export class StreakHistoryComponent implements OnInit {
  private api = inject(ApiService);

  /** Closes column-3 history view and returns to the Today panel. */
  @Output() returnToToday = new EventEmitter<void>();

  history = signal<StreakHistoryItem[]>([]);
  stats   = signal<StreakStats | null>(null);
  loading = signal(true);

  /** Number of completed chapters — derived from history length, used in
   *  the lifetime stats row. The currently-ongoing streak is excluded
   *  from history, so this is genuinely "chapters completed." */
  chapterCount = computed(() => this.history().length);

  ngOnInit(): void {
    // Fire both fetches in parallel — they're independent and small.
    this.api.getStreakHistory().subscribe({
      next: list => { this.history.set(list); this.loading.set(false); },
      error: ()   => { this.loading.set(false); }
    });
    this.api.getStreak().subscribe({
      next: s => this.stats.set(s),
      error: () => {}
    });
  }
}
