import {
  Component, ElementRef, ViewChild, ViewChildren, QueryList,
  inject, signal, computed, effect, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { SearchOverlayService } from '../../core/services/search-overlay.service';
import { EntryListItem } from '../../core/models/models';

/**
 * Global full-screen search overlay. Reachable from anywhere via the
 * sidebar's "search" icon (next to the compose button) and via the
 * Cmd/Ctrl+K shortcut wired in app.ts.
 *
 * Scope (v1): journal entries only. Filters by title, tag, ISO date
 * (e.g. "2026-05-18"), and human-readable date (e.g. "may 18, 2026").
 * Mirrors the filter logic that previously lived inline on the
 * dashboard — same match rules so users get consistent results.
 *
 * Renders nothing when SearchOverlayService.isOpen() is false. When
 * open, takes the full viewport at z-index 1000 (above mobile drawer
 * at 200, above tour at 500, EQUAL to the dashboard takeover layer —
 * we don't expect both to ever be visible simultaneously, but if they
 * are, paywall/welcome-back should win because the user can't act on
 * search results if their account is locked).
 *
 * Keyboard:
 *  - typing: filters in real time (debounced 150ms)
 *  - ↓ / ↑ : navigate result rows
 *  - Enter  : open the highlighted result
 *  - Esc    : close the overlay
 *
 * Mobile: full viewport (100dvh) so the soft keyboard pushes the
 * input but the results list scrolls independently. Back-arrow in
 * the top bar doubles as the close button.
 */
@Component({
  selector: 'app-search-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (overlay.isOpen()) {
      <div class="search-overlay" role="dialog" aria-modal="true" aria-label="Search entries">

        <!-- Top bar: close button + input + keyboard hint -->
        <div class="search-overlay__topbar">
          <button class="search-overlay__close"
                  type="button"
                  (click)="overlay.close()"
                  title="Close search"
                  aria-label="Close search">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>

          <div class="search-overlay__input-wrap">
            <svg class="search-overlay__icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd"/>
            </svg>
            <input #queryInput
                   class="search-overlay__input"
                   type="text"
                   placeholder="Search entries by title, tag, or date…"
                   [ngModel]="query()"
                   (ngModelChange)="onQueryChange($event)"
                   autocomplete="off"
                   autocorrect="off"
                   autocapitalize="off"
                   spellcheck="false" />
            @if (query()) {
              <button class="search-overlay__clear"
                      type="button"
                      (click)="clearQuery()"
                      title="Clear">×</button>
            }
          </div>

          <!-- Desktop keyboard hint. Hidden on mobile where the
               keyboard is the touch keyboard, not a physical one. -->
          <span class="search-overlay__kbd-hint" aria-hidden="true">
            <kbd>esc</kbd> close
          </span>
        </div>

        <!-- Results area -->
        <div class="search-overlay__results" #resultsScroll>
          @if (loading()) {
            <p class="search-overlay__empty">Loading entries…</p>
          } @else if (!query()) {
            <p class="search-overlay__empty">Start typing to search your entries.</p>
          } @else if (results().length === 0) {
            <p class="search-overlay__empty">
              No entries match <strong>{{ query() }}</strong>.<br>
              <span class="search-overlay__hint">
                Try a different word, or search by date (e.g. <code>May 2026</code>).
              </span>
            </p>
          } @else {
            <ul class="search-overlay__list" role="listbox">
              @for (entry of results(); track entry.id; let i = $index) {
                <li #resultRow
                    class="search-overlay__row"
                    [class.search-overlay__row--active]="i === activeIndex()"
                    role="option"
                    [attr.aria-selected]="i === activeIndex()"
                    (click)="open(entry)"
                    (mouseenter)="activeIndex.set(i)">
                  <span class="search-overlay__row-eyebrow">{{ formatDate(entry.entryDate) }}</span>
                  <h3 class="search-overlay__row-title">{{ entry.title || '(untitled)' }}</h3>
                  @if (entry.contentPreview) {
                    <p class="search-overlay__row-preview">{{ entry.contentPreview }}</p>
                  }
                  @if (entry.tags.length) {
                    <p class="search-overlay__row-tags">
                      @for (t of entry.tags; track t) {
                        <span class="search-overlay__tag">{{ t }}</span>
                      }
                    </p>
                  }
                </li>
              }
            </ul>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    /* Full-viewport overlay. z-index 1000 matches the dashboard's
       paywall takeover layer — these two are mutually exclusive in
       practice (locked-out users can still search their existing
       entries, so the paywall doesn't gate the overlay; if both ever
       try to render, DOM order decides — and the search overlay sits
       in the sidebar template which renders BEFORE the route outlet,
       so the paywall wins, which is the right priority). */
    .search-overlay {
      position: fixed;
      inset: 0;
      background: var(--color-bg);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      /* 100dvh respects the visible viewport on iOS Safari (URL bar
         eats into 100vh). When the mobile soft keyboard opens, the
         visible viewport shrinks; this overlay shrinks with it so the
         results list doesn't get hidden behind the keyboard. */
      height: 100vh;
      height: 100dvh;
    }

    /* Top bar — close + input + keyboard hint */
    .search-overlay__topbar {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: calc(env(safe-area-inset-top, 0px) + .75rem) 1rem .75rem;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg);
      flex-shrink: 0;
    }

    .search-overlay__close {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 10px;
      color: var(--color-text);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background .15s, border-color .15s;
    }
    @media (hover: hover) and (pointer: fine) {
      .search-overlay__close:hover {
        background: var(--color-surface-2);
        border-color: var(--color-border);
      }
    }

    .search-overlay__input-wrap {
      flex: 1;
      min-width: 0;
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-overlay__icon {
      position: absolute;
      left: .875rem;
      color: var(--color-text-3);
      pointer-events: none;
    }
    .search-overlay__input {
      width: 100%;
      padding: .75rem 2.5rem .75rem 2.625rem;
      font-family: var(--font-sans);
      font-size: 1.0625rem;
      color: var(--color-text);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      outline: none;
      transition: border-color .15s, box-shadow .15s;
    }
    .search-overlay__input:focus {
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px var(--color-accent-light);
    }
    .search-overlay__input::placeholder { color: var(--color-text-3); }

    .search-overlay__clear {
      position: absolute;
      right: .375rem;
      width: 28px;
      height: 28px;
      background: transparent;
      border: none;
      border-radius: 50%;
      color: var(--color-text-3);
      font-size: 1.125rem;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .search-overlay__clear:hover { color: var(--color-text); background: var(--color-surface-2); }

    /* Keyboard hint — desktop only. Mobile users use the touch
       keyboard / close button, not Esc. */
    .search-overlay__kbd-hint {
      flex-shrink: 0;
      font-size: .8125rem;
      color: var(--color-text-3);
    }
    .search-overlay__kbd-hint kbd {
      font-family: var(--font-sans);
      font-size: .75rem;
      padding: .125rem .375rem;
      margin-right: .25rem;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-bottom-width: 2px;
      border-radius: 4px;
      color: var(--color-text-2);
    }
    @media (max-width: 600px) {
      .search-overlay__kbd-hint { display: none; }
    }

    /* Results scroll area */
    .search-overlay__results {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 0 1rem 2rem;
    }

    .search-overlay__empty {
      padding: 3rem 1rem;
      text-align: center;
      color: var(--color-text-2);
      font-size: 1rem;
      line-height: 1.6;
    }
    .search-overlay__empty code {
      background: var(--color-surface-2);
      padding: .125rem .375rem;
      border-radius: 4px;
      font-size: .9375rem;
    }
    .search-overlay__hint {
      display: inline-block;
      margin-top: .375rem;
      font-size: .875rem;
      color: var(--color-text-3);
    }

    .search-overlay__list {
      list-style: none;
      padding: .5rem 0 0;
      margin: 0;
      max-width: 720px;
      margin: 0 auto;
    }
    .search-overlay__row {
      padding: .875rem 1rem;
      border-radius: 12px;
      cursor: pointer;
      transition: background .12s;
    }
    .search-overlay__row + .search-overlay__row {
      margin-top: .125rem;
    }
    .search-overlay__row--active,
    .search-overlay__row:hover {
      background: var(--color-surface-2);
    }
    .search-overlay__row-eyebrow {
      display: block;
      font-size: .6875rem;
      font-weight: 700;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--color-accent);
      margin-bottom: .25rem;
    }
    .search-overlay__row-title {
      margin: 0 0 .25rem;
      font-family: var(--font-sans);
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: -.01em;
      color: var(--color-text);
    }
    .search-overlay__row-preview {
      margin: 0 0 .375rem;
      color: var(--color-text-2);
      font-size: .9375rem;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .search-overlay__row-tags {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: .25rem;
    }
    .search-overlay__tag {
      font-size: .75rem;
      padding: .125rem .5rem;
      background: var(--color-surface-2);
      color: var(--color-text-2);
      border-radius: 999px;
    }
  `]
})
export class SearchOverlayComponent {
  protected overlay = inject(SearchOverlayService);
  private  api      = inject(ApiService);
  private  router   = inject(Router);

  /** Current query string the user is typing. Source of truth for the
   *  filtered `results()` computed below. */
  query        = signal('');

  /** Cached list of every entry, fetched lazily on first open and
   *  re-fetched if the overlay opens more than 60s after a previous
   *  open. Keeps the overlay snappy when re-opened in quick succession
   *  without going stale across long sessions. */
  allEntries   = signal<EntryListItem[]>([]);
  loading      = signal(false);
  private lastFetchedAt = 0;

  /** Highlighted row index for keyboard navigation. Reset to 0 on
   *  every results change (so ↓ from the top always feels natural). */
  activeIndex  = signal(0);

  @ViewChild('queryInput') queryInput?: ElementRef<HTMLInputElement>;
  @ViewChildren('resultRow') resultRows?: QueryList<ElementRef<HTMLLIElement>>;

  /** Debounce timer for filter recomputation. We don't actually need
   *  to debounce the FILTER (it's pure JS over an in-memory array),
   *  but we DO want to debounce-clamp activeIndex resets so rapid
   *  typing doesn't jitter the scroll position. */
  private filterTimer: ReturnType<typeof setTimeout> | null = null;

  /** Filtered + sorted results. Filter logic mirrors what the
   *  dashboard's filteredAndSorted previously did: title, tags,
   *  ISO date, human-readable date all searched as one flat haystack.
   *  Results sorted newest-first regardless of any dashboard sort
   *  setting — the overlay is a "find this thing" tool, not a list
   *  view, so sorting by relevance proxy (recency) is the right
   *  default. */
  results = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return [];

    const terms = q.split(/\s+/).filter(t => t.length > 0);
    const matches = this.allEntries().filter(e => {
      const dateReadable = new Date(e.entryDate + 'T00:00:00')
        .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        .toLowerCase();
      const haystack = [
        e.title,
        ...(e.tags || []),
        e.entryDate,
        dateReadable,
        e.contentPreview || ''
      ].join(' ').toLowerCase();
      return terms.every(term => haystack.includes(term));
    });

    // Newest first.
    return [...matches].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  });

  constructor() {
    // React to open/close: fetch entries lazily on first open, focus
    // the input, lock body scroll while open. Effects auto-dispose
    // on component destroy.
    effect(() => {
      if (this.overlay.isOpen()) {
        this.fetchIfStale();
        // Focus after the dialog has rendered. requestAnimationFrame
        // ensures the @if block has materialised the input element.
        requestAnimationFrame(() => this.queryInput?.nativeElement.focus());
        document.body.style.overflow = 'hidden';
      } else {
        // Reset transient state on close so re-opening feels fresh.
        this.query.set('');
        this.activeIndex.set(0);
        document.body.style.overflow = '';
      }
    });

    // Whenever results change, reset highlight to the top row.
    effect(() => {
      // Touching results() makes this effect react to changes.
      this.results();
      this.activeIndex.set(0);
    });
  }

  private fetchIfStale(): void {
    const STALE_MS = 60_000;
    if (this.loading()) return;
    if (Date.now() - this.lastFetchedAt < STALE_MS && this.allEntries().length > 0) return;

    this.loading.set(true);
    // No pagination args → server returns the recent slice the
    // dashboard already uses. Same endpoint, same response shape.
    this.api.getEntries().subscribe({
      next: (entries) => {
        this.allEntries.set(entries);
        this.lastFetchedAt = Date.now();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  onQueryChange(value: string): void {
    this.query.set(value);
  }

  clearQuery(): void {
    this.query.set('');
    this.queryInput?.nativeElement.focus();
  }

  open(entry: EntryListItem): void {
    this.overlay.close();
    this.router.navigate(['/entry', entry.id]);
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
    } catch { return iso; }
  }

  /** Keyboard navigation while the overlay is open. Host-level listener
   *  rather than per-input so arrows work even if focus has moved
   *  (e.g. user clicked the close button then wants to re-navigate). */
  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (!this.overlay.isOpen()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.overlay.close();
      return;
    }

    const list = this.results();
    if (list.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIndex.update(i => (i + 1) % list.length);
      this.scrollActiveIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIndex.update(i => (i - 1 + list.length) % list.length);
      this.scrollActiveIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = list[this.activeIndex()];
      if (sel) this.open(sel);
    }
  }

  /** Defer to next tick so QueryList has updated after activeIndex
   *  change. scrollIntoView with `block: nearest` avoids jumpy jumps
   *  when the highlighted row is already visible. */
  private scrollActiveIntoView(): void {
    queueMicrotask(() => {
      const row = this.resultRows?.toArray()[this.activeIndex()];
      row?.nativeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
}
