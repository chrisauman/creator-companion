import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { FavoriteItem, EntryListItem, MotivationEntry } from '../../core/models/models';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { SidebarStateService } from '../../shared/sidebar/sidebar-state.service';
import { MobileHeaderComponent } from '../../shared/mobile-header/mobile-header.component';
@Component({
  selector: 'app-favorite-sparks',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, SidebarComponent, MobileHeaderComponent],
  template: `
    <div class="page" [class.page--embedded]="embedded">

      <!-- Page chrome — hidden when embedded inside the dashboard right column -->
      @if (!embedded) {
        <app-sidebar active="favorites" />
        <app-mobile-header />
      }

      <!-- Main content -->
      <main class="main-content">

        <!-- Reader-style top bar (embedded only). Same pattern as
             the entry reader: 64px sticky surface with an inner row
             capped at max-width 760px so toolbar and body share
             horizontal edges. -->
        @if (embedded) {
          <div class="reader-top">
            <div class="reader-top__inner">
              <button class="cancel-pill" type="button" (click)="returnToToday.emit()">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/>
                </svg>
                Today
              </button>
              <div class="reader-top__breadcrumb"></div>
              <div class="reader-top__actions"></div>
            </div>
          </div>
        }

        <div class="body-inner">
          <!-- Page-level header removed: the sidebar's active nav item
               (and the standalone topbar's brand) already tell the user
               where they are. -->

        <!-- Loading -->
        @if (loading()) {
          <div class="sparks-list">
            @for (i of [1,2,3]; track i) {
              <div class="spark-card spark-card--skeleton">
                <div class="skeleton-line skeleton-line--short"></div>
                <div class="skeleton-line"></div>
              </div>
            }
          </div>
        }

        <!-- Empty -->
        @if (!loading() && items().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">⭐</div>
            <p class="empty-text">No favorites yet.</p>
            <p class="empty-sub">
              Tap the heart on a Spark or any entry to save it here.
            </p>
          </div>
        }

        <!-- Unified list — sparks + journal entries, sorted by when
             they were favorited. Eyebrow text differentiates the two:
             "DAILY SPARK" vs "JOURNAL ENTRY". -->
        @if (!loading() && items().length > 0) {
          <div class="favorites-list">
            @for (item of items(); track itemKey(item)) {

              @if (item.type === 'spark' && item.spark; as spark) {
                <!-- Spark card — same expandable design as before. -->
                <div class="spark-card" [class.spark-card--expanded]="expandedId() === spark.id">
                  <div class="spark-header" (click)="toggleExpand(spark.id)">
                    <div class="spark-header__left">
                      <span class="spark-label">Daily Spark</span>
                      <p class="spark-takeaway">{{ spark.takeaway }}</p>
                    </div>
                    <div class="spark-actions" (click)="$event.stopPropagation()">
                      <button class="spark-unfavorite"
                        title="Remove from favorites"
                        (click)="unfavoriteSpark(spark.id)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                          fill="currentColor" stroke="currentColor" stroke-width="2"
                          stroke-linecap="round" stroke-linejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                      </button>
                      <button class="spark-toggle" [attr.aria-expanded]="expandedId() === spark.id">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" stroke-width="2.5"
                          stroke-linecap="round" stroke-linejoin="round"
                          [style.transform]="expandedId() === spark.id ? 'rotate(180deg)' : 'rotate(0deg)'"
                          style="transition:transform .25s ease">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div class="spark-body">
                    <p class="spark-content">{{ spark.fullContent }}</p>
                  </div>
                </div>
              }

              @if (item.type === 'entry' && item.entry; as entry) {
                <!-- Entry card — mirrors the column-2 journal entry-row
                     visually (cyan eyebrow + bold title + first photo)
                     so the user feels like they're seeing the same kind
                     of card they recognise from the journal list. Click
                     opens the entry in the reader (embedded) or the
                     standalone /entry/:id route (mobile). -->
                <div class="entry-card" (click)="openEntry(entry)">
                  <div class="entry-card__body">
                    <div class="entry-card__meta">
                      <span class="entry-card__label">Journal Entry</span>
                      <span class="entry-card__date">{{ entry.entryDate | date:'MMM d, y' }}</span>
                      <button class="entry-card__heart"
                              type="button"
                              title="Remove from favorites"
                              (click)="$event.stopPropagation(); unfavoriteEntry(entry.id)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                          fill="currentColor" stroke="currentColor" stroke-width="2"
                          stroke-linecap="round" stroke-linejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                      </button>
                    </div>
                    <p class="entry-card__title">{{ entryHeadline(entry) }}</p>
                  </div>
                  @if (entry.firstImageUrl) {
                    <div class="entry-card__photo">
                      <img [src]="entry.firstImageUrl" alt="" loading="lazy">
                    </div>
                  }
                </div>
              }

            }
          </div>

          <!-- Load more -->
          @if (hasMore()) {
            <div class="load-more-wrap">
              <button class="load-more-btn"
                      type="button"
                      [disabled]="loadingMore()"
                      (click)="loadMore()">
                {{ loadingMore() ? 'Loading…' : 'Load more' }}
              </button>
            </div>
          }
        }
        </div><!-- /.body-inner -->
      </main>
    </div>
  `,
  styles: [`
    /* ── Page shell ─────────────────────────────────────────────── */
    .page {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    @media (min-width: 768px) {
      .page { flex-direction: row; }
    }
    /* Embedded mode — the dashboard's right column hosts this component. */
    .page--embedded { min-height: 0; flex-direction: column; }
    .page--embedded .main-content {
      padding: 0 !important;
      background: transparent !important;
    }

    /* ── Reader-style top bar — full-column-width sticky surface
       holds an inner row capped at 760px so toolbar elements align
       with the body content beneath. */
    .reader-top {
      display: flex;
      align-items: stretch;
      height: 64px;
      background: var(--color-surface);
      position: sticky; top: 0;
      z-index: 5;
      box-sizing: border-box;
      flex-shrink: 0;
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

    /* Body bounded to 760px to match the reader/edit views. 1.5rem
       horizontal on mobile (app-wide gutter); 2.5rem on desktop. */
    .body-inner {
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      padding: .75rem 1.5rem 3rem;
      box-sizing: border-box;
      color: var(--color-text);
    }
    @media (min-width: 768px) {
      .body-inner { padding: .75rem 2.5rem 3rem; }
    }

    /* ── Mobile top bar ──────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 100;
      background: #111318;
      border-bottom: 1px solid rgba(255,255,255,.07);
      height: 52px;
      display: flex; align-items: center;
      padding: 0 1.125rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; }
    .topbar__brand-icon { height: 24px; width: auto; display: block; }
    .topbar__brand-name { font-family: var(--font-sans); font-size: .9375rem; font-weight: 700; color: #fff; }
    /* Hamburger — light-on-dark mobile topbar variant. Same styling as
       the matching button in the other standalone pages. */
    .topbar__menu {
      width: 36px; height: 36px;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 10px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 3px;
      padding: 0;
      cursor: pointer;
      margin-right: .5rem;
      transition: background .15s, border-color .15s;
    }
    .topbar__menu:hover {
      background: rgba(255,255,255,.06);
      border-color: rgba(255,255,255,.2);
    }
    .topbar__menu span {
      display: block;
      width: 16px; height: 1.75px;
      background: #fff;
      border-radius: 2px;
    }

    /* ── Main content ────────────────────────────────────────────── */
    .main-content {
      flex: 1; min-width: 0;
      padding: 0 0 calc(80px + env(safe-area-inset-bottom, 0px));
      background: var(--color-surface);
    }
    @media (min-width: 768px) {
      .main-content { padding: 0 0 4rem; background: var(--color-surface); }
    }

    /* ── Page header ─────────────────────────────────────────────── */
    /* Matches the Daily Spark hero quote / Notifications page-title
       so all column-3 surfaces share the same display ramp. */
    .page-header { margin-bottom: 1.5rem; }
    .page-title {
      font-family: var(--font-sans);
      font-size: 1.25rem; font-weight: 700;
      letter-spacing: -.01em;
      line-height: 1.3;
      color: var(--color-text);
      margin: 0 0 .25rem;
    }
    /* Body copy standard. */
    .page-sub { font-size: 1rem; color: var(--color-text); margin: 0; line-height: 1.6; }

    /* ── Unified favorites list ──────────────────────────────────── */
    /* Same wrapper used for both spark and entry cards so they share
       gap rhythm. Order is FavoritedAt DESC — most recent first. */
    .favorites-list { display: flex; flex-direction: column; gap: .75rem; }

    /* Legacy alias kept so the loading skeleton (which still uses
       .sparks-list) keeps working without a separate refactor. */
    .sparks-list { display: flex; flex-direction: column; gap: .75rem; }

    /* ── Entry card ───────────────────────────────────────────────── */
    /* Mirrors .entry-row on the journal column-2 list: rounded
       container, cyan eyebrow + date, bold title, optional photo
       below. Tweaks for this surface: explicit "Journal Entry"
       eyebrow (the column-2 version uses just the date), heart
       button on the right edge of the meta row to unfavorite, and
       the whole card is clickable to open the entry. */
    .entry-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      cursor: pointer;
      transition: border-color .15s, box-shadow .15s, transform .15s;
    }
    .entry-card:hover {
      border-color: rgba(18,196,227,.45);
      box-shadow: 0 6px 20px -10px rgba(18,196,227,.25);
    }
    .entry-card__body {
      padding: 1rem 1.25rem .875rem;
    }
    .entry-card__meta {
      display: flex;
      align-items: center;
      gap: .75rem;
      margin-bottom: .5rem;
    }
    /* "JOURNAL ENTRY" eyebrow — same caps + tracking treatment as
       the column-2 entry-row date eyebrow, in brand cyan. */
    .entry-card__label {
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-accent);
      white-space: nowrap;
    }
    .entry-card__date {
      font-size: .75rem;
      color: var(--color-text-2);
      flex: 1;
    }
    /* Heart on the right — brand cyan (same convention used elsewhere
       for "this is yours" affordances). Click stops event propagation
       so it doesn't also trigger the card's openEntry handler. */
    .entry-card__heart {
      background: none; border: none; cursor: pointer; padding: .1rem;
      color: var(--color-accent);
      display: flex; align-items: center;
      transition: transform .1s, opacity .15s;
    }
    .entry-card__heart:hover { opacity: .7; transform: scale(1.15); }
    /* Title: same scale + weight as journal entry-row title so the
       two surfaces share typographic identity. Clamps to 2 lines on
       very long titles. */
    .entry-card__title {
      font-family: var(--font-sans);
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.35;
      letter-spacing: -.01em;
      color: var(--color-text);
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    /* Photo: full-width, capped height. Bottom is clipped only for
       very tall photos so cards stay reasonable in size. */
    .entry-card__photo {
      width: 100%;
      max-height: 320px;
      overflow: hidden;
      display: flex;
      justify-content: center;
      background: var(--color-bg);
    }
    .entry-card__photo img {
      width: 100%;
      max-height: 320px;
      object-fit: cover;
      display: block;
    }

    /* ── Load-more ────────────────────────────────────────────────── */
    .load-more-wrap {
      display: flex; justify-content: center;
      padding: 1.25rem 0 0;
    }
    .load-more-btn {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-2);
      font-family: inherit;
      font-size: .8125rem;
      font-weight: 600;
      padding: .5rem 1rem;
      border-radius: 999px;
      cursor: pointer;
      transition: background .15s, color .15s, border-color .15s;
    }
    .load-more-btn:hover:not(:disabled) {
      background: var(--color-surface-2);
      color: var(--color-text);
      border-color: var(--color-text-3);
    }
    .load-more-btn:disabled { opacity: .6; cursor: not-allowed; }

    /* ── Spark card ──────────────────────────────────────────────── */

    .spark-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      transition: border-color .15s, box-shadow .15s;
      &:hover { border-color: var(--color-accent); box-shadow: var(--shadow-md); }
    }
    .spark-card--skeleton {
      padding: 1rem 1.25rem;
      pointer-events: none;
    }
    .spark-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem; padding: 1rem 1.25rem; cursor: pointer; user-select: none;
    }
    .spark-header__left { flex: 1; min-width: 0; }
    .spark-label {
      font-size: .6875rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; color: var(--color-accent);
      display: block; margin-bottom: .3rem;
    }
    /* Body copy standard. */
    .spark-takeaway {
      font-size: 1rem; color: var(--color-text); margin: 0; line-height: 1.6;
    }
    .spark-actions {
      display: flex; align-items: center; gap: .25rem; flex-shrink: 0; margin-top: .1rem;
    }
    /* Heart on a saved-spark row uses brand cyan rather than red.
       Red is reserved for danger/urgency states (delete, threatened
       streak); a saved item is a positive status, not a warning. */
    .spark-unfavorite {
      background: none; border: none; cursor: pointer;
      color: var(--color-accent); padding: .1rem;
      display: flex; align-items: center;
      transition: transform .1s, opacity .15s;
      &:hover { opacity: .7; transform: scale(1.15); }
    }
    .spark-toggle {
      background: none; border: none; cursor: pointer;
      color: var(--color-text-3); padding: .1rem;
      display: flex; align-items: center;
      &:hover { color: var(--color-accent); }
    }
    .spark-body {
      max-height: 0; overflow: hidden;
      transition: max-height .35s ease, padding .35s ease;
      padding: 0 1.25rem;
    }
    .spark-card--expanded .spark-body { max-height: 600px; padding: 0 1.25rem 1.25rem; }
    /* Body copy standard. */
    .spark-content {
      font-size: 1rem; line-height: 1.6; color: var(--color-text);
      margin: 0; white-space: pre-wrap;
    }

    /* ── Skeleton ────────────────────────────────────────────────── */
    .skeleton-line {
      height: .875rem; border-radius: 4px;
      background: var(--color-border);
      animation: pulse 1.4s ease-in-out infinite;
      margin-bottom: .625rem;
    }
    .skeleton-line--short { width: 40%; height: .625rem; margin-bottom: .5rem; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .4; }
    }

    /* ── Empty state ─────────────────────────────────────────────── */
    .empty-state {
      text-align: center; padding: 4rem 1rem;
    }
    .empty-icon { font-size: 2.5rem; margin-bottom: 1rem; }
    .empty-text {
      font-size: 1rem; font-weight: 600; color: var(--color-text); margin: 0 0 .375rem;
    }
    .empty-sub { font-size: 1rem; color: var(--color-text); margin: 0; line-height: 1.6; }
  `]
})
export class FavoriteSparksComponent implements OnInit {
  private api    = inject(ApiService);
  private router = inject(Router);
  /** Mobile topbar hamburger → opens slide-in sidebar drawer. */
  protected sidebarState = inject(SidebarStateService);

  /** When true, the component is rendered inside the dashboard's right
   *  column rather than as a /favorites page. Hides the page-level
   *  sidebar/topbar/mobile-nav chrome and shows a reader-style top bar
   *  with a Today return pill instead. */
  @Input() embedded = false;

  /** Emitted when the user clicks the Today pill in the embedded top bar. */
  @Output() returnToToday = new EventEmitter<void>();

  /** Emitted when the user clicks a Journal Entry favorite. The dashboard
   *  parent listens to this and swaps column 3 to the entry reader.
   *  Standalone /favorites bypasses this and navigates to /entry/:id. */
  @Output() openEntryRequest = new EventEmitter<string>();

  // ── Page size (matches server default; server clamps to 1..100). ──
  private readonly PAGE_SIZE = 25;

  // ── State ─────────────────────────────────────────────────────────
  /** Combined list of sparks + entries, sorted by favoritedAt DESC. */
  items       = signal<FavoriteItem[]>([]);
  loading     = signal(true);
  loadingMore = signal(false);
  hasMore     = signal(false);
  /** ID of the currently-expanded spark card (only one open at a time). */
  expandedId  = signal<string | null>(null);

  ngOnInit(): void {
    this.api.getFavorites(0, this.PAGE_SIZE).subscribe({
      next: page => {
        this.items.set(page.items);
        this.hasMore.set(page.hasMore);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.hasMore.set(false);
        this.loading.set(false);
      }
    });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    const skip = this.items().length;
    this.api.getFavorites(skip, this.PAGE_SIZE).subscribe({
      next: page => {
        // Append; server returns the next chunk in correct order.
        this.items.update(existing => [...existing, ...page.items]);
        this.hasMore.set(page.hasMore);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loadingMore.set(false);
      }
    });
  }

  /** Stable @for track key — sparks share an id space with entries
   *  in the API but here we prefix to avoid any collision. */
  itemKey(item: FavoriteItem): string {
    return item.type + ':' + (item.spark?.id ?? item.entry?.id ?? '');
  }

  toggleExpand(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  /** Click handler for an entry card. Embedded mode emits an event so
   *  the parent dashboard can swap column 3 to the reader; standalone
   *  mode navigates to the dedicated /entry/:id route. */
  openEntry(entry: EntryListItem): void {
    if (this.embedded) {
      this.openEntryRequest.emit(entry.id);
    } else {
      this.router.navigate(['/entry', entry.id]);
    }
  }

  /** Title shown on the entry card. Falls back to the content preview
   *  when an entry has no explicit title (some entries are saved with
   *  empty title and rely on the auto-generated preview). */
  entryHeadline(entry: EntryListItem): string {
    return entry.title?.trim() || entry.contentPreview || 'Untitled entry';
  }

  // ── Unfavorite handlers (one per type) ────────────────────────────

  unfavoriteSpark(id: string): void {
    // Optimistic remove
    const previous = this.items();
    this.items.update(list => list.filter(i => !(i.type === 'spark' && i.spark?.id === id)));
    this.api.toggleSparkFavorite(id).subscribe({
      error: () => this.items.set(previous)  // restore on failure
    });
  }

  unfavoriteEntry(id: string): void {
    const previous = this.items();
    this.items.update(list => list.filter(i => !(i.type === 'entry' && i.entry?.id === id)));
    this.api.toggleFavorite(id).subscribe({
      error: () => this.items.set(previous)
    });
  }
}
