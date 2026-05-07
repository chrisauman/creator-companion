import { Component, EventEmitter, Output, OnInit, input, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { StreakStats } from '../../core/models/models';

/**
 * Streak-threatened banner. Shown at the top of column 3 (the right-hand
 * Today panel column) when the user has missed yesterday but is still
 * inside the 48-hour backlog grace window. The app silently lets these
 * moments slip otherwise — users don't even know backlogging exists.
 *
 * Intentionally minimal: a single warm headline + a single CTA. Earlier
 * iterations had a body paragraph, a countdown, and a secondary "Write
 * today instead" link; user feedback was that the volume was too loud
 * and the column-2 placement was wrong. Now it's a soft prompt at the
 * top of the user's daily-engagement column with one obvious next step.
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
      <div class="threatened" role="status">
        <p class="threatened__title">
          Yesterday slipped by — but you've got this.
        </p>
        <button class="threatened__cta"
                type="button"
                (click)="onBacklog()">
          Log your progress
        </button>
      </div>
    }
  `,
  styles: [`
    /* Compact card — fits the narrow column-3 context. Cream surface
       with a brand-cyan left rule keeps the brand consistent without
       feeling alarmist. Vertical stack: headline on top, CTA below. */
    .threatened {
      background: linear-gradient(180deg, #fdfaf2 0%, #faf5e6 100%);
      border: 1px solid rgba(18,196,227,.25);
      border-left: 4px solid var(--color-accent);
      border-radius: .625rem;
      padding: 1rem 1.125rem;
      margin: 0 0 1rem;
    }
    .threatened__title {
      font-family: var(--font-brand);
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: -.01em;
      line-height: 1.35;
      color: #1a1d24;
      margin: 0 0 .75rem;
    }
    .threatened__cta {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: var(--color-accent);
      color: #fff;
      border: none;
      padding: .5rem 1rem;
      border-radius: 999px;
      font-size: .8125rem;
      font-weight: 700;
      letter-spacing: .01em;
      cursor: pointer;
      font-family: inherit;
      transition: background .15s, transform .1s;
    }
    .threatened__cta:hover {
      background: #0bd2f0;
      transform: translateY(-1px);
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
