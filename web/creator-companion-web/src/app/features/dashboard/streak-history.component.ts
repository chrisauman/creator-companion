import { Component, EventEmitter, Output, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { StreakHistoryItem, StreakStats } from '../../core/models/models';

/**
 * Streak History view. Renders in column 3 of the dashboard when the user
 * clicks "History" next to "Best" in the sidebar's streak widget. Shows
 * lifetime totals at the top and every completed past streak (chapter)
 * below, most recent first.
 *
 * Visual language matches the other column-3 surfaces (entry-reader,
 * favorite-sparks, embedded notifications): sticky 64px reader-top bar
 * with the Today pill on the left + breadcrumb in the middle, body
 * bounded to 760px so type and cards align with the reader's text column.
 *
 * Tone: this page is part of the "streak break is a chapter ending, not
 * a failure" reframe. Past streaks are *banked*, not lost. Treat the copy
 * accordingly — "Your chapters" not "broken streaks", "personal best"
 * not "longest", etc.
 *
 * Demo mode: navigate with `?demo=streaks` to populate the view with
 * five example chapters so the layout can be reviewed without breaking
 * an active streak. Read-only — never writes to the API.
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

      <div class="body">
        <div class="body-inner">

          @if (demoMode()) {
            <div class="demo-banner">
              Demo mode — sample data, nothing is saved.
            </div>
          }

          <!-- Lifetime stats card. Three numbers framed as one row so
               the totals read as a single emotional headline rather
               than three loose figures. -->
          @if (stats(); as s) {
            <section class="lifetime">
              <div class="lifetime__cell">
                <div class="lifetime__num">{{ displayBest() }}</div>
                <div class="lifetime__label">personal best</div>
              </div>
              <div class="lifetime__cell">
                <div class="lifetime__num">{{ chapterCount() }}</div>
                <div class="lifetime__label">{{ chapterCount() === 1 ? 'chapter' : 'chapters' }}</div>
              </div>
              <div class="lifetime__cell">
                <div class="lifetime__num">{{ displayActiveDays() }}</div>
                <div class="lifetime__label">days journaled</div>
              </div>
            </section>
          }

          <!-- Loading + empty + content states -->
          @if (loading()) {
            <p class="hint">Loading…</p>
          } @else if (history().length === 0) {
            <div class="empty">
              <div class="empty__icon" aria-hidden="true">📖</div>
              <p class="empty__title">No completed chapters yet.</p>
              <p class="empty__body">
                Your first finished chapter will appear here whenever
                your current streak ends. Until then, keep going —
                every day is part of the story.
              </p>
            </div>
          } @else {
            <div class="chapters-head">
              <h2 class="chapters-title">Your chapters</h2>
              <p class="chapters-sub">
                Every streak is a chapter. They may end, but another will begin.
              </p>
            </div>

            <ul class="chapters">
              @for (item of orderedHistory(); track item.startDate + '-' + item.endDate) {
                <li class="chapter"
                    [class.chapter--best]="item.isPersonalBest">
                  <div class="chapter__head">
                    <div class="chapter__days-wrap">
                      <span class="chapter__days">{{ item.days }}</span>
                      <span class="chapter__days-unit">{{ item.days === 1 ? 'day' : 'days' }}</span>
                    </div>
                    @if (item.isPersonalBest) {
                      <span class="chapter__badge" title="Personal best">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/>
                        </svg>
                        personal best
                      </span>
                    }
                  </div>
                  <div class="chapter__meta">
                    {{ item.startDate | date:'MMM d, y' }}
                    <span class="chapter__arrow">→</span>
                    {{ item.endDate | date:'MMM d, y' }}
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
    </div>
  `,
  styles: [`
    /* ── Layout chrome (matches favorite-sparks / entry-reader) ───── */
    .embedded-section {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--color-bg);
    }

    .reader-top {
      display: flex;
      align-items: stretch;
      height: 64px;
      background: var(--color-surface);
      position: sticky; top: 0;
      z-index: 5;
      box-sizing: border-box;
      flex-shrink: 0;
      border-bottom: 1px solid var(--color-border);
    }
    .reader-top__inner {
      display: flex;
      align-items: center;
      gap: .5rem;
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      padding: 0 2.5rem;
      box-sizing: border-box;
    }
    .cancel-pill {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: rgba(18,196,227,.1);
      color: var(--color-accent);
      border: 1px solid rgba(18,196,227,.25);
      padding: .375rem .75rem;
      border-radius: 999px;
      font-size: .75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      cursor: pointer;
      font-family: inherit;
      transition: all .15s;
    }
    .cancel-pill:hover {
      background: var(--color-accent);
      color: #0c0e13;
      border-color: var(--color-accent);
    }
    .reader-top__breadcrumb {
      flex: 1;
      text-align: center;
      font-size: .8125rem;
      color: var(--color-text);
    }
    .reader-top__breadcrumb strong { color: var(--color-text); font-weight: 600; }
    .reader-top__actions { display: flex; gap: .5rem; flex-shrink: 0; min-width: 36px; }

    /* ── Body container — bounded to 760px like the reader/edit views
       so type and cards line up with the rest of column 3. */
    .body { flex: 1; overflow-y: auto; }
    .body-inner {
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      padding: 1.5rem 2.5rem 3rem;
      box-sizing: border-box;
    }

    /* ── Demo-mode banner ──────────────────────────────────────────── */
    .demo-banner {
      background: rgba(18,196,227,.08);
      border: 1px solid rgba(18,196,227,.25);
      color: var(--color-accent-dark, var(--color-accent));
      font-size: .8125rem;
      padding: .5rem .875rem;
      border-radius: .375rem;
      margin-bottom: 1.25rem;
      text-align: center;
    }

    /* ── Lifetime stats card ───────────────────────────────────────── */
    /* Reads as one unified surface, not three loose numbers. Subtle
       internal dividers separate cells without making it look like a
       data table. */
    .lifetime {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: .625rem;
      padding: 1.25rem 1rem;
      margin-bottom: 1.75rem;
    }
    .lifetime__cell {
      text-align: center;
      padding: 0 .5rem;
      border-right: 1px solid var(--color-border);
    }
    .lifetime__cell:last-child { border-right: none; }
    .lifetime__num {
      /* Bold sans for stat numbers — keeps the brand serif reserved
         for true display moments (titles, hero quotes) and gives the
         digits a more grounded, easy-to-read presence at this size. */
      font-family: var(--font-sans);
      font-size: 2.25rem;
      font-weight: 800;
      line-height: 1;
      color: var(--color-text);
      letter-spacing: -.03em;
      margin-bottom: .375rem;
    }
    .lifetime__label {
      font-size: .75rem;
      color: var(--color-text-muted, var(--color-text-3));
      text-transform: lowercase;
      letter-spacing: .03em;
      font-weight: 500;
    }

    /* ── Chapters section header ───────────────────────────────────── */
    .chapters-head { margin-bottom: 1rem; }
    .chapters-title {
      font-family: var(--font-brand);
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -.01em;
      line-height: 1.3;
      margin: 0 0 .25rem;
      color: var(--color-text);
    }
    .chapters-sub {
      font-size: .8125rem;
      color: var(--color-text-muted, var(--color-text-3));
      margin: 0;
      font-style: italic;
    }

    /* ── Chapter cards ─────────────────────────────────────────────── */
    /* Soft surface, generous padding, subtle hover lift. Personal-best
       gets a brand-cyan left rule + matching badge to highlight without
       feeling like a trophy. */
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
      border-radius: .625rem;
      padding: 1rem 1.125rem;
      transition: background .15s ease, border-color .15s ease, transform .15s ease;
    }
    .chapter:hover {
      border-color: var(--color-text-3);
      transform: translateY(-1px);
    }
    .chapter--best {
      border-left: 3px solid var(--color-accent);
      padding-left: calc(1.125rem - 2px);
      background: linear-gradient(
        to right,
        rgba(18,196,227,.04) 0%,
        var(--color-surface) 40%
      );
    }
    .chapter__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .5rem;
      margin-bottom: .375rem;
    }
    .chapter__days-wrap {
      display: inline-flex;
      align-items: baseline;
      gap: .375rem;
    }
    .chapter__days {
      font-family: var(--font-sans);
      font-weight: 800;
      font-size: 1.5rem;
      letter-spacing: -.03em;
      color: var(--color-text);
      line-height: 1;
    }
    .chapter__days-unit {
      font-size: .75rem;
      color: var(--color-text-muted, var(--color-text-3));
      text-transform: lowercase;
      letter-spacing: .03em;
    }
    .chapter__badge {
      display: inline-flex;
      align-items: center;
      gap: .25rem;
      font-size: .6875rem;
      color: var(--color-accent);
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: lowercase;
      background: rgba(18,196,227,.08);
      border: 1px solid rgba(18,196,227,.2);
      padding: .25rem .5rem;
      border-radius: 999px;
    }
    .chapter__meta {
      font-size: .8125rem;
      color: var(--color-text);
      margin-bottom: .25rem;
      display: inline-flex;
      align-items: center;
      gap: .375rem;
    }
    .chapter__arrow {
      color: var(--color-text-muted, var(--color-text-3));
      font-weight: 600;
    }
    .chapter__stats {
      font-size: .75rem;
      color: var(--color-text-muted, var(--color-text-3));
    }

    .hint {
      color: var(--color-text-muted, var(--color-text-3));
      font-size: .9375rem;
      padding: 1.5rem 0;
      text-align: center;
    }

    /* ── Empty state ──────────────────────────────────────────────── */
    /* First-streak users will see this. Warm + framed as a placeholder
       for the future, not as a "no data" message. */
    .empty {
      text-align: center;
      padding: 1.5rem 1rem 0;
    }
    .empty__icon {
      font-size: 2rem;
      margin-bottom: .75rem;
      opacity: .65;
    }
    .empty__title {
      font-family: var(--font-brand);
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--color-text);
      margin: 0 0 .5rem;
      letter-spacing: -.01em;
    }
    .empty__body {
      font-size: .875rem;
      line-height: 1.55;
      color: var(--color-text-muted, var(--color-text-3));
      margin: 0 auto;
      max-width: 38ch;
    }

    /* Narrow viewport polish */
    @media (max-width: 600px) {
      .reader-top__inner { padding: 0 1.25rem; }
      .body-inner       { padding: 1.25rem 1.25rem 2rem; }
      .lifetime__num    { font-size: 1.75rem; }
      .chapter__days    { font-size: 1.25rem; }
    }
  `]
})
export class StreakHistoryComponent implements OnInit {
  private api   = inject(ApiService);
  private route = inject(ActivatedRoute);

  /** Closes column-3 history view and returns to the Today panel. */
  @Output() returnToToday = new EventEmitter<void>();

  history  = signal<StreakHistoryItem[]>([]);
  stats    = signal<StreakStats | null>(null);
  loading  = signal(true);
  demoMode = signal(false);

  /** Number of completed chapters — derived from history length, used in
   *  the lifetime stats row. */
  chapterCount = computed(() => this.history().length);

  /**
   * History reordered for display: personal best is pinned to the top,
   * the rest stay in their existing most-recent-first order. The "best"
   * card is the emotional anchor of the page — putting it on top makes
   * the user's high-water mark the first thing they read. The remaining
   * chapters then read like a timeline from now backwards.
   *
   * If the personal best is already first (e.g. the most recent chapter
   * happens to be the longest), no reordering needed.
   */
  orderedHistory = computed(() => {
    const list = this.history();
    const bestIdx = list.findIndex(c => c.isPersonalBest);
    if (bestIdx <= 0) return list;
    const best = list[bestIdx];
    const rest = list.filter((_, i) => i !== bestIdx);
    return [best, ...rest];
  });

  /** "Best" pulled from the demo data when in demo mode (so the lifetime
   *  numbers tell a coherent story alongside the chapter cards), or
   *  from the real StreakStats otherwise. */
  displayBest = computed(() => {
    if (this.demoMode()) {
      const max = this.history().reduce((m, c) => Math.max(m, c.days), 0);
      return max;
    }
    return this.stats()?.longestStreak ?? 0;
  });

  displayActiveDays = computed(() => {
    if (this.demoMode()) {
      // Total days journaled = sum of days across all chapters in demo.
      return this.history().reduce((sum, c) => sum + c.days, 0);
    }
    return this.stats()?.totalActiveDays ?? 0;
  });

  ngOnInit(): void {
    // Demo mode: ?demo=streaks injects fixed sample data so the layout
    // can be reviewed without affecting a real account. No API calls
    // in this mode — purely a presentation aid.
    const demo = this.route.snapshot.queryParamMap.get('demo');
    if (demo === 'streaks') {
      this.demoMode.set(true);
      this.history.set(this.buildDemoChapters());
      this.loading.set(false);
      // Stub stats so the lifetime row has something coherent to show.
      // We override longestStreak/totalActiveDays via demo-aware computeds
      // above; the rest are unused by this view.
      this.stats.set({
        currentStreak: 0,
        longestStreak: 0,
        totalEntries:  0,
        totalMediaCount: 0,
        totalActiveDays: 0,
        isPaused: false,
        pauseDaysUsedThisMonth: 0,
      });
      return;
    }

    // Real mode: parallel fetches.
    this.api.getStreakHistory().subscribe({
      next: list => { this.history.set(list); this.loading.set(false); },
      error: ()   => { this.loading.set(false); }
    });
    this.api.getStreak().subscribe({
      next: s => this.stats.set(s),
      error: () => {}
    });
  }

  /**
   * Five hand-crafted sample chapters spanning the past year. Includes
   * a personal-best, a couple of short-but-honest runs, and a tiny
   * single-day chapter so the empty-but-mostly-filled visual states
   * are all represented.
   */
  private buildDemoChapters(): StreakHistoryItem[] {
    const items: StreakHistoryItem[] = [
      // Most recent first — matches API ordering.
      { startDate: '2026-04-22', endDate: '2026-05-05', days: 14, entryCount: 14, isPersonalBest: false },
      { startDate: '2026-03-01', endDate: '2026-03-23', days: 23, entryCount: 27, isPersonalBest: true  },
      { startDate: '2026-02-08', endDate: '2026-02-15', days: 8,  entryCount: 8,  isPersonalBest: false },
      { startDate: '2026-01-12', endDate: '2026-01-14', days: 3,  entryCount: 4,  isPersonalBest: false },
      { startDate: '2025-12-31', endDate: '2025-12-31', days: 1,  entryCount: 1,  isPersonalBest: false },
    ];
    return items;
  }
}
