import { Component, EventEmitter, Output, OnInit, OnDestroy, input, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { StreakStats } from '../../core/models/models';

/**
 * Streak-threatened banner. Shown at the top of the dashboard when the
 * user has missed yesterday but is still inside the 48-hour backlog
 * grace window. Today the app silently lets these moments slip — users
 * don't even know backlogging exists. This banner makes the save-the-
 * streak option loud, warm, and one-click.
 *
 * Triggers two ways:
 *
 *  1. Preview (admin only) — `?preview=threatened`. Renders unconditionally,
 *     ignores real streak state, fakes a "safe for ~18h" countdown.
 *
 *  2. Organic — currentStreak > 0 AND lastEntryDate is exactly two
 *     calendar days behind today (= yesterday is the missed day, today
 *     is fresh). The component fetches StreakStats and decides on its
 *     own; the dashboard just renders <app-threatened-banner /> and
 *     listens to its events.
 *
 * Two CTAs:
 *  - Write yesterday's entry → emits backlogYesterday with the ISO date.
 *    Dashboard pipes that into NewEntryComponent's [initialDate].
 *  - Write today instead → emits writeToday. Dashboard opens the
 *    composer with no special date.
 *
 * Tone: cheerful and calm. "You've got time." Never "act fast." Soft
 * cyan, not red. The countdown is informative, not panic-inducing.
 */
@Component({
  selector: 'app-threatened-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="threatened" role="status">
        <div class="threatened__inner">
          <div class="threatened__copy">
            <p class="threatened__title">
              Yesterday slipped by — but you've got time.
            </p>
            <p class="threatened__body">
              Your <strong>{{ streakDays() }}-day streak</strong> is safe if you
              write something for yesterday. Even one line counts.
            </p>
            @if (countdown(); as c) {
              <p class="threatened__countdown">Streak safe for {{ c }}</p>
            }
          </div>
          <div class="threatened__actions">
            <button class="threatened__cta-primary"
                    type="button"
                    (click)="onBacklog()">
              Write yesterday's entry
            </button>
            <button class="threatened__cta-secondary"
                    type="button"
                    (click)="onToday()">
              Write today instead
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* Banner sits at the top of the dashboard's main content. Soft
       cream surface with a brand-cyan left rule — warm + warm-toned,
       not a warning. Margin matches the dashboard's column padding so
       it aligns with the entry list below. */
    .threatened {
      background: linear-gradient(180deg, #fdfaf2 0%, #faf5e6 100%);
      border: 1px solid rgba(18,196,227,.25);
      border-left: 4px solid var(--color-accent);
      border-radius: .625rem;
      padding: 1rem 1.25rem;
      margin: 0 0 1rem;
    }
    .threatened__inner {
      display: flex;
      align-items: flex-start;
      gap: 1.25rem;
      flex-wrap: wrap;
    }
    .threatened__copy { flex: 1 1 320px; min-width: 0; }
    .threatened__title {
      font-family: var(--font-brand);
      font-size: 1.0625rem;
      font-weight: 700;
      letter-spacing: -.01em;
      color: #1a1d24;
      margin: 0 0 .375rem;
    }
    .threatened__body {
      color: #2a2f3a;
      font-size: .9375rem;
      line-height: 1.5;
      margin: 0 0 .5rem;
    }
    .threatened__body strong {
      font-weight: 700;
      color: var(--color-accent-dark, var(--color-accent));
    }
    .threatened__countdown {
      font-size: .8125rem;
      color: #6b7280;
      margin: 0;
      font-style: italic;
    }

    /* Actions stack on the right at desktop; wrap to full-width on
       narrow viewports. Primary is solid cyan, secondary is a quiet
       text link — keeps the hierarchy clear. */
    .threatened__actions {
      display: flex;
      align-items: center;
      gap: .75rem;
      flex-shrink: 0;
    }
    .threatened__cta-primary {
      background: var(--color-accent);
      color: #fff;
      border: none;
      padding: .625rem 1.125rem;
      border-radius: 999px;
      font-size: .875rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: background .15s, transform .1s;
    }
    .threatened__cta-primary:hover {
      background: #0bd2f0;
      transform: translateY(-1px);
    }
    .threatened__cta-secondary {
      background: transparent;
      color: #6b7280;
      border: none;
      padding: .625rem .25rem;
      font-size: .875rem;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: color .15s;
    }
    .threatened__cta-secondary:hover {
      color: #1a1d24;
      text-decoration: underline;
    }

    @media (max-width: 600px) {
      .threatened__actions { width: 100%; }
      .threatened__cta-primary,
      .threatened__cta-secondary { flex: 1; text-align: center; }
    }
  `]
})
export class ThreatenedBannerComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  /** True when running under `?preview=threatened`. Forces visibility
   *  with stub data and a fake countdown, ignoring real streak state. */
  preview = input(false);

  /** User clicked "Write yesterday's entry" — payload is the ISO date
   *  the parent should pass to NewEntryComponent's initialDate. */
  @Output() backlogYesterday = new EventEmitter<string>();

  /** User clicked "Write today instead" — open compose with no date
   *  override. */
  @Output() writeToday = new EventEmitter<void>();

  private stats = signal<StreakStats | null>(null);

  // Re-tick the countdown every minute so it doesn't go stale while
  // the user is sitting on the dashboard. Cleared on destroy.
  private nowMs    = signal(Date.now());
  private timerId: ReturnType<typeof setInterval> | null = null;

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
    // they're fine. If it's >= 2 days ago, they're past the grace
    // window and the streak has already broken (Welcome Back territory).
    const lastDay  = this.toDayNumber(lastIso);
    const todayDay = this.toDayNumber(today);
    return todayDay - lastDay === 2;
  });

  /** Streak days to show in the banner copy. Real value or stub for
   *  preview. */
  streakDays = computed<number>(() => {
    if (this.preview()) return 14;
    return this.stats()?.currentStreak ?? 0;
  });

  /** Human-readable "safe for Xh Ym" countdown. The grace ends at
   *  end-of-today (user's local time, but we approximate with browser
   *  midnight which is close enough for a friendly hint). */
  countdown = computed<string | null>(() => {
    const now = this.nowMs();
    const tonight = new Date();
    tonight.setHours(23, 59, 0, 0);
    const ms = tonight.getTime() - now;
    if (ms <= 0) return null;

    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0) return `${m}m`;
    return `${h}h ${m}m`;
  });

  ngOnInit(): void {
    if (!this.preview()) {
      this.api.getStreak().subscribe({
        next: s => this.stats.set(s),
        error: () => {}
      });
    }
    // Tick countdown every 60s while mounted.
    this.timerId = setInterval(() => this.nowMs.set(Date.now()), 60_000);
  }

  ngOnDestroy(): void {
    if (this.timerId) clearInterval(this.timerId);
  }

  onBacklog(): void {
    const yesterday = this.yesterdayIso();
    this.backlogYesterday.emit(yesterday);
  }

  onToday(): void {
    this.writeToday.emit();
  }

  // ── helpers ────────────────────────────────────────────────────────

  private todayIso(): string {
    const d = new Date();
    return this.formatIso(d);
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
  /** Days-since-epoch number for an ISO yyyy-MM-dd date. Used only for
   *  computing "exactly N days apart" — we don't care about timezones
   *  at the level of correctness this banner needs. */
  private toDayNumber(iso: string): number {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  }
}
