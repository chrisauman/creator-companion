import { Component, DestroyRef, EventEmitter, Output, OnInit, input, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { StreakRefreshService } from '../../core/services/streak-refresh.service';
import { StreakStats } from '../../core/models/models';

/**
 * Daily Reminder card. A soft prompt at the top of the Today column on
 * any day the user hasn't yet logged an entry — a low-key "you're up,
 * take a step today" nudge that sits between the threatened banner
 * (urgent: 48h grace running) and a clean dashboard (already logged).
 *
 * Visual language matches threatened-banner / spark-hero exactly:
 * cream gradient surface, red pulsing-dot eyebrow, mid-size sans
 * quote, dark-ink pill CTA. Reads as a sibling of the spark, not as
 * an alert.
 *
 * Visibility rules — three states, never overlapping:
 *
 *  - Logged today (lastEntryDate === today)         → hide
 *  - Missed yesterday + still in grace (= 2 days)   → threatened banner shows; this hides
 *  - Otherwise (no entry today, no grace conflict)  → show
 *
 * The threatened-banner check ensures we never stack two red-eyebrow
 * cards on top of each other. If the streak has broken entirely,
 * the Welcome Back full-takeover replaces the dashboard so this
 * component being visible underneath doesn't matter.
 *
 * Triggers two ways:
 *
 *  1. Preview (admin only) — `?preview=daily-reminder`. Always renders.
 *
 *  2. Organic — fetches StreakStats on init and renders based on the
 *     rules above. Re-renders when the dashboard refreshes (after
 *     a save, the streak data updates and lastEntryDate becomes today
 *     so this component hides itself).
 *
 * One CTA: "Log today's progress." → emits writeToday. Dashboard
 * opens the composer with no date override (today's date by default).
 */
@Component({
  selector: 'app-daily-reminder-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="reminder-card" role="status">
        <span class="reminder-card__eyebrow">Your Daily Reminder</span>
        <p class="reminder-card__quote">
          Your goal is to do something with your creative practice every day. Keep the streak alive!
        </p>
        <div class="reminder-card__actions">
          <button class="reminder-card__cta"
                  type="button"
                  (click)="onWriteToday()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
            </svg>
            Log today's progress
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    /* Cream gradient surface — identical to spark-hero / threatened-card
       so the three column-3 cards feel like a single visual family.
       Kept the radial cyan glow ::before for brand cohesion. */
    .reminder-card {
      background: linear-gradient(180deg, #fdfaf2 0%, #f6f1e6 100%);
      color: var(--color-text);
      border: 1px solid rgba(190,170,130,.22);
      border-radius: 20px;
      padding: 1.5rem 1.5rem 1.25rem;
      position: relative;
      overflow: hidden;
      margin-bottom: 1rem;
    }
    .reminder-card::before {
      content: '';
      position: absolute;
      top: -30%; right: -20%;
      width: 320px; height: 320px;
      background: radial-gradient(circle, rgba(18,196,227,.55) 0%, transparent 65%);
      opacity: .35;
      pointer-events: none;
    }

    /* Red eyebrow with pulsing red dot — same urgency cue used by the
       threatened banner. The two cards never appear together (visibility
       rules ensure this), so re-using the urgency tone here doesn't
       compete; it tells the user "this is a today-thing, do it." Same
       danger token as .threatened-card__eyebrow / favorited heart. */
    .reminder-card__eyebrow {
      display: inline-flex; align-items: center; gap: .5rem;
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: #e11d48;
      margin-bottom: 1.25rem;
      position: relative;
    }
    .reminder-card__eyebrow::before {
      content: '';
      width: 7px; height: 7px;
      background: #e11d48;
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(225,29,72,.6);
      animation: dailyReminderPulse 2.5s ease-in-out infinite;
    }
    @keyframes dailyReminderPulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: .4; }
    }

    /* Mid-size display quote — same scale as spark-hero__quote so all
       three cards land at the same visual hierarchy. */
    .reminder-card__quote {
      font-family: var(--font-sans);
      font-size: 1.25rem;
      line-height: 1.4;
      font-weight: 600;
      color: var(--color-text);
      position: relative;
      margin: 0 0 1.25rem;
      letter-spacing: -.01em;
    }

    /* Action row — single CTA mirroring spark-action--primary
       (dark-ink default, brand cyan on hover). Shared affordance
       across all column-3 primary CTAs. */
    .reminder-card__actions {
      display: flex;
      gap: .5rem;
      position: relative;
      align-items: center;
      flex-wrap: wrap;
    }
    .reminder-card__cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .375rem;
      height: 36px;
      padding: 0 .875rem;
      border: 1px solid #0c0e13;
      background: #0c0e13;
      border-radius: 999px;
      color: #fff;
      font-family: inherit;
      font-size: .8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: all .15s;
    }
    .reminder-card__cta:hover {
      background: #0bd2f0;
      border-color: #12C4E3;
      color: #fff;
    }
  `]
})
export class DailyReminderCardComponent implements OnInit {
  private api = inject(ApiService);
  private streakRefresh = inject(StreakRefreshService);
  private destroyRef = inject(DestroyRef);

  /** True when running under `?preview=daily-reminder`. Forces visibility,
   *  ignoring real streak state. */
  preview = input(false);

  /** User clicked "Log today's progress." — dashboard opens the entry
   *  composer with no date override (today by default). */
  @Output() writeToday = new EventEmitter<void>();

  private stats = signal<StreakStats | null>(null);

  /** Whether to render the card. Three states:
   *   - Preview: always show
   *   - Logged today: hide (lastEntryDate === today)
   *   - In threatened grace (lastEntryDate is exactly 2 days back):
   *     hide so the threatened banner is the only urgency card visible
   *   - Otherwise: show (no entry today and not threatened)
   */
  visible = computed<boolean>(() => {
    if (this.preview()) return true;
    const s = this.stats();
    if (!s) return false;

    const today = this.todayIso();

    // Brand new user, no entries ever — show the nudge. "Your goal is
    // to do something with your creative practice every day" is a
    // perfect onboarding line.
    if (!s.lastEntryDate) return true;

    const lastIso = s.lastEntryDate.slice(0, 10);
    const lastDay  = this.toDayNumber(lastIso);
    const todayDay = this.toDayNumber(today);
    const daysBack = todayDay - lastDay;

    if (daysBack === 0) return false; // already logged today
    if (daysBack === 2) return false; // threatened banner owns this state

    // daysBack === 1 (yesterday was last entry) OR daysBack >= 3
    // (streak broken — Welcome Back covers it but we still show this
    // underneath; harmless since Welcome Back is full-takeover).
    return true;
  });

  ngOnInit(): void {
    if (!this.preview()) {
      this.loadStats();
      // Refetch on each entry mutation so logging today's entry hides
      // this card immediately, and so a backfill rolls the streak math
      // forward without a reload.
      this.streakRefresh.events$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.loadStats());
    }
  }

  private loadStats(): void {
    this.api.getStreak().subscribe({
      next: s => this.stats.set(s),
      error: () => {}
    });
  }

  onWriteToday(): void {
    this.writeToday.emit();
  }

  // ── helpers ────────────────────────────────────────────────────────

  private todayIso(): string {
    const d = new Date();
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  /** Days-since-epoch number for an ISO yyyy-MM-dd date. */
  private toDayNumber(iso: string): number {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  }
}
