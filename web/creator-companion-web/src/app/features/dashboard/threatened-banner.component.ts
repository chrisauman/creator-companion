import { Component, EventEmitter, Output, OnInit, input, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { StreakStats } from '../../core/models/models';

/**
 * Streak-threatened banner. Shown at the top of column 3 (the right-hand
 * Today panel column) when the user has missed yesterday but is still
 * inside the 48-hour backlog grace window. Otherwise users would
 * silently let the grace expire — they don't even know backlogging
 * exists.
 *
 * Visual language matches the Daily Spark / Daily Prompt hero cards in
 * the same column: cream gradient surface, soft warm border, 20px
 * radius, eyebrow label + pulsing cyan dot, mid-size display quote,
 * dark-pill CTA that flips to cyan on hover. Reads as a sibling card
 * to the Spark, not a warning banner.
 *
 * Triggers two ways:
 *
 *  1. Preview (admin only) — `?preview=threatened`. Always renders,
 *     ignores real streak state.
 *
 *  2. Organic — currentStreak > 0 AND lastEntryDate is exactly two
 *     calendar days behind today (= yesterday is the missed day,
 *     today is fresh). The component fetches StreakStats and decides
 *     on its own; the dashboard just renders <app-threatened-banner />
 *     and listens for the backlog event.
 *
 * One CTA: "Log your progress" → emits backlogYesterday with the ISO
 * date for yesterday. Dashboard pipes that into NewEntryComponent's
 * [initialDate] so the composer opens on the missed day.
 *
 * Tone: cheerful, brief, encouraging. "But you've got this." Vocabulary
 * follows the global rule — "log progress," not "write."
 */
@Component({
  selector: 'app-threatened-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="threatened-card" role="status">
        <span class="threatened-card__eyebrow">Streak safe</span>
        <p class="threatened-card__quote">
          Yesterday slipped by — but you've got this.
        </p>
        <div class="threatened-card__actions">
          <button class="threatened-card__cta"
                  type="button"
                  (click)="onBacklog()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
            </svg>
            Log your progress
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    /* Cream gradient surface — matches spark-hero / hero-card so this
       reads as a sibling card in column 3, not an alarm. Soft warm
       border, generous radius, subtle radial cyan glow in the top
       right (via ::before, same as spark-hero) keeps the brand cyan
       present without being loud. */
    .threatened-card {
      background: linear-gradient(180deg, #fdfaf2 0%, #f6f1e6 100%);
      color: var(--color-text);
      border: 1px solid rgba(190,170,130,.22);
      border-radius: 20px;
      padding: 1.5rem 1.5rem 1.25rem;
      position: relative;
      overflow: hidden;
      margin-bottom: 1rem;
    }
    .threatened-card::before {
      content: '';
      position: absolute;
      top: -30%; right: -20%;
      width: 320px; height: 320px;
      background: radial-gradient(circle, rgba(18,196,227,.55) 0%, transparent 65%);
      opacity: .35;
      pointer-events: none;
    }

    /* Eyebrow row — small caps with a pulsing cyan dot. Same animation
       and treatment as spark-hero__eyebrow so the two cards feel
       siblings. "Streak safe" is the calm framing — it's true (the
       streak IS still safe), not "warning." */
    .threatened-card__eyebrow {
      display: inline-flex; align-items: center; gap: .5rem;
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-accent-dark, var(--color-accent));
      margin-bottom: 1.25rem;
      position: relative;
    }
    .threatened-card__eyebrow::before {
      content: '';
      width: 7px; height: 7px;
      background: #12C4E3;
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(18,196,227,.6);
      animation: threatenedPulse 2.5s ease-in-out infinite;
    }
    @keyframes threatenedPulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: .4; }
    }

    /* Mid-size display quote — same scale as spark-hero__quote so the
       two cards land at the same visual hierarchy. */
    .threatened-card__quote {
      font-family: var(--font-sans);
      font-size: 1.25rem;
      line-height: 1.4;
      font-weight: 700;
      color: var(--color-text);
      position: relative;
      margin: 0 0 1.25rem;
      letter-spacing: -.01em;
    }

    /* Actions row — single CTA that mirrors spark-action--primary
       (dark ink default, brand cyan on hover) so all CTAs across
       column 3 share the same affordance. */
    .threatened-card__actions {
      display: flex;
      gap: .5rem;
      position: relative;
      align-items: center;
      flex-wrap: wrap;
    }
    .threatened-card__cta {
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
    .threatened-card__cta:hover {
      background: #12C4E3;
      border-color: #12C4E3;
      color: #fff;
    }
  `]
})
export class ThreatenedBannerComponent implements OnInit {
  private api = inject(ApiService);

  /** True when running under `?preview=threatened`. Forces visibility,
   *  ignoring real streak state. */
  preview = input(false);

  /** User clicked "Log your progress" — payload is the ISO date
   *  (yesterday) the parent should pass to NewEntryComponent's
   *  [initialDate] so the composer opens on the missed day. */
  @Output() backlogYesterday = new EventEmitter<string>();

  private stats = signal<StreakStats | null>(null);

  /** Whether to render the banner. Preview always shows; organic shows
   *  when the user is mid-grace (missed yesterday, streak still alive). */
  visible = computed<boolean>(() => {
    if (this.preview()) return true;
    const s = this.stats();
    if (!s) return false;
    if (s.currentStreak <= 0) return false;
    if (!s.lastEntryDate) return false;

    const today    = this.todayIso();
    const lastIso  = s.lastEntryDate.slice(0, 10);
    // Threatened iff last entry was strictly before yesterday (= the
    // user missed yesterday). If lastEntryDate is yesterday or today,
    // they're fine. If it's >= 3 days ago, they're past the grace
    // window and the streak has already broken (Welcome Back territory).
    const lastDay  = this.toDayNumber(lastIso);
    const todayDay = this.toDayNumber(today);
    return todayDay - lastDay === 2;
  });

  ngOnInit(): void {
    if (!this.preview()) {
      this.api.getStreak().subscribe({
        next: s => this.stats.set(s),
        error: () => {}
      });
    }
  }

  onBacklog(): void {
    this.backlogYesterday.emit(this.yesterdayIso());
  }

  // ── helpers ────────────────────────────────────────────────────────

  private todayIso(): string {
    return this.formatIso(new Date());
  }
  private yesterdayIso(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return this.formatIso(d);
  }
  private formatIso(d: Date): string {
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
