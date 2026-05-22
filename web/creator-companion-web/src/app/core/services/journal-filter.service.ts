import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';

export type JournalSort = 'newest' | 'oldest' | 'favorites';

/**
 * Shared state for the journal entries filter panel + the dashboard's
 * entry list. Both the sidebar (where the panel lives) and the
 * dashboard component (which renders the filtered list) read from the
 * same signals here, so there's no input/output plumbing between them.
 *
 * Architecture:
 *  - Sidebar's "search" icon button toggles `panelOpen`. When the
 *    panel opens, it auto-navigates to /dashboard if the user isn't
 *    already there — the entries list lives in column 2 of the
 *    dashboard, so opening the filter from anywhere else needs to
 *    bring the user back to where the results will be visible.
 *  - Sidebar's expanded panel binds an <input> to `query` and a
 *    segmented control to `sort`. Both update the dashboard's
 *    `filteredAndSorted` computed via direct signal reads.
 *  - Dashboard reads query() and sort() in its filteredAndSorted
 *    computed. No subscriptions — signals propagate automatically.
 *  - Cmd+K in app.ts calls toggle().
 *
 * Was named SearchOverlayService when the design was a full-screen
 * overlay. Renamed when the design pivoted to an inline expand panel
 * inside the sidebar — same concept (toggle a search affordance) but
 * the affordance is no longer an overlay.
 */
@Injectable({ providedIn: 'root' })
export class JournalFilterService {
  private router = inject(Router);

  /**
   * The ACTIVE filter applied to the dashboard's entry list. Updated
   * live as the user types in the search input (via inputValue
   * mirroring), AND retained when the user "commits" the search by
   * pressing Enter. The dashboard's filteredAndSorted reads this.
   *
   * Separating this from inputValue lets us clear the input field
   * after Enter (so re-opening the panel feels like a fresh search)
   * WITHOUT un-filtering the visible entries. The active filter
   * persists until the panel is explicitly closed (via the search
   * icon toggle or Cmd+K) or until the user types a new query that
   * replaces it.
   */
  readonly query      = signal('');

  /**
   * What's currently in the search input field. Bound two-way to the
   * <input> in the sidebar's filter panel. Typing here updates both
   * inputValue (the visible field state) AND query (the active
   * filter) — that preserves the "live filter as you type" feel.
   * Pressing Enter clears ONLY inputValue, leaving query intact so
   * the visible entry list stays filtered.
   */
  readonly inputValue = signal('');

  /** Current sort order. Persists across panel open/close. */
  readonly sort      = signal<JournalSort>('newest');
  /** Whether the expanded panel is showing in the sidebar/drawer. */
  readonly panelOpen = signal(false);

  /**
   * Open the panel. If the user is on a non-dashboard route, navigate
   * to /dashboard first so the entries list (column 2) is visible to
   * receive the filtered output. The navigation strips any ?section=
   * query param so column 3 falls back to its default Today panel.
   *
   * Idempotent: opening when already open is a no-op (prevents
   * double-navigation when triggered from multiple sources during
   * the same user gesture).
   */
  open(): void {
    if (this.panelOpen()) return;

    const onDashboard = this.router.url.startsWith('/dashboard');
    if (!onDashboard) {
      // Use absolute navigation; clear queryParams so we land on a
      // clean Today view rather than carrying e.g. ?section=notifications
      // forward from wherever the user was.
      this.router.navigate(['/dashboard'], { queryParams: {} });
    }
    this.panelOpen.set(true);
  }

  /**
   * Close the panel. Clears both the input AND the active query so
   * re-opening starts fresh — half-typed text lingering for the next
   * session feels stale, and stale active filters on the entry list
   * are confusing if the user doesn't realise the filter is still
   * applied. Sort is preserved (it's a view preference, not
   * transient filter).
   */
  close(): void {
    if (!this.panelOpen()) return;
    this.panelOpen.set(false);
    this.query.set('');
    this.inputValue.set('');
  }

  /** Convenience for the keyboard shortcut + sidebar icon toggle. */
  toggle(): void {
    if (this.panelOpen()) this.close();
    else this.open();
  }
}
