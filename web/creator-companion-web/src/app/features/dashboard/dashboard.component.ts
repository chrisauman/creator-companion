import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { TokenService } from '../../core/services/token.service';
import { StreakStats, EntryListItem, MotivationEntry } from '../../core/models/models';
import { environment } from '../../../environments/environment';
import { getMoodEmoji } from '../../core/constants/moods';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="dashboard">

      <!-- Top nav -->
      <header class="topnav">
        <div class="container topnav__inner">
          <span class="topnav__logo">✦ Creator Companion</span>
          <div style="display:flex;gap:.5rem">
            <a class="nav-link" routerLink="/account">Account</a>
            <a *ngIf="isAdmin()" class="nav-link" routerLink="/admin">Admin</a>
          </div>
        </div>
      </header>

      <main class="container main-content">

        <!-- Daily Motivation card -->
        @if (motivation()) {
          <div class="motivation-card" [class.motivation-card--expanded]="motivationExpanded()">
            <div class="motivation-header" (click)="motivationExpanded.set(!motivationExpanded())">
              <div class="motivation-header__left">
                <span class="motivation-label">Daily Motivation</span>
                <p class="motivation-takeaway">{{ motivation()!.takeaway }}</p>
              </div>
              <button class="motivation-toggle" [attr.aria-expanded]="motivationExpanded()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round"
                  [style.transform]="motivationExpanded() ? 'rotate(180deg)' : 'rotate(0deg)'"
                  style="transition:transform .25s ease">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>
            <div class="motivation-body">
              <p class="motivation-content">{{ motivation()!.fullContent }}</p>
            </div>
          </div>
        }

        <!-- New entry CTA -->
        <div class="new-entry-bar" routerLink="/entry/new">
          <span class="new-entry-bar__text">What are you working on today?</span>
          <span class="btn btn--primary btn--sm">+ New entry</span>
        </div>

        <!-- Streak stats -->
        <div class="stats-grid" *ngIf="streak()">
          <div class="stat-card">
            <span class="stat-value streak-value">{{ streak()!.currentStreak }}</span>
            <span class="stat-label">Day streak</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ streak()!.longestStreak }}</span>
            <span class="stat-label">Longest streak</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ streak()!.totalEntries }}</span>
            <span class="stat-label">Total entries</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ streak()!.totalActiveDays }}</span>
            <span class="stat-label">Days active</span>
          </div>
        </div>

        <!-- Streak loading skeleton -->
        <div class="stats-grid" *ngIf="!streak() && !error()">
          <div class="stat-card skeleton" *ngFor="let i of [1,2,3,4]">
            <span class="stat-value">—</span>
            <span class="stat-label">Loading…</span>
          </div>
        </div>


        <!-- Entry list -->
        <section class="entries-section">
          <!-- Search + sort bar -->
          <div class="search-bar">
            <div class="search-input-wrap">
              <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd"/>
              </svg>
              <input
                type="text"
                class="search-input"
                placeholder="Search by title, tag, or date…"
                [ngModel]="searchQuery()"
                (ngModelChange)="searchQuery.set($event)"
              />
              <button *ngIf="searchQuery()" class="search-clear" (click)="searchQuery.set('')" title="Clear search">×</button>
            </div>
            <select class="sort-select" [ngModel]="sortOrder()" (ngModelChange)="sortOrder.set($event)">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="favorites">★ Favorites</option>
            </select>
          </div>

          <div *ngIf="error()" class="alert alert--error">{{ error() }}</div>

          <!-- Empty states -->
          <div *ngIf="entries().length === 0 && !loading()" class="empty-state">
            <p>No entries yet. Write your first one above.</p>
          </div>
          <div *ngIf="entries().length > 0 && filteredAndSorted().length === 0" class="empty-state">
            <p *ngIf="sortOrder() === 'favorites' && !searchQuery()">No favorites yet. Open an entry and tap the star to save it.</p>
            <p *ngIf="sortOrder() !== 'favorites' || searchQuery()">No entries match <strong>{{ searchQuery() }}</strong>.</p>
            <button class="btn btn--ghost btn--sm" style="margin-top:.75rem"
              (click)="searchQuery.set(''); sortOrder.set('newest')">Clear filters</button>
          </div>

          <!-- Result count when searching -->
          <p class="search-results-count" *ngIf="searchQuery() && filteredAndSorted().length > 0">
            {{ filteredAndSorted().length }} {{ filteredAndSorted().length === 1 ? 'entry' : 'entries' }} found
          </p>

          <ng-container *ngIf="filteredAndSorted().length > 0">
            <ng-container *ngFor="let group of groupedEntries()">
              <div class="date-divider">{{ group.label }}</div>
              <div
                class="entry-row card"
                *ngFor="let entry of group.entries"
                [routerLink]="['/entry', entry.id]"
              >
                <!-- Calendar date block -->
                <div class="entry-cal">
                  <span class="entry-cal__dow">{{ getDayAbbr(entry.entryDate) }}</span>
                  <span class="entry-cal__num">{{ getDayNum(entry.entryDate) }}</span>
                </div>

                <!-- Body -->
                <div class="entry-row__body">
                  <p class="entry-row__title">{{ entry.title || '(Untitled)' }}</p>
                  <div class="entry-row__sub">
                    <span>{{ formatTime(entry.createdAt) }}</span>
                    <ng-container *ngIf="entry.mediaCount > 0">
                      <span class="sep">·</span>
                      <span>📷 {{ entry.mediaCount }}</span>
                    </ng-container>
                    <ng-container *ngIf="entry.mood">
                      <span class="sep">·</span>
                      <span>{{ getMoodEmoji(entry.mood) }} Feeling {{ entry.mood }}</span>
                    </ng-container>
                  </div>
                  <!-- Tags row -->
                  <div class="entry-row__tags">
                    <ng-container *ngIf="entry.tags && entry.tags.length > 0">
                      <button
                        class="entry-tag-chip"
                        type="button"
                        *ngFor="let tag of entry.tags"
                        (click)="navigateToTag($event, tag)"
                      >#{{ tag }}</button>
                    </ng-container>
                    <button
                      class="entry-tag-add"
                      type="button"
                      (click)="navigateToEditTags($event, entry.id)"
                      [title]="entry.tags && entry.tags.length ? 'Edit tags' : 'Add tags'"
                    >{{ entry.tags && entry.tags.length ? '···' : '+ tag' }}</button>
                  </div>
                </div>

                <!-- Thumbnail -->
                <div class="entry-row__thumb" *ngIf="entry.firstImageUrl">
                  <img [src]="fullImageUrl(entry.firstImageUrl)" [alt]="entry.title" />
                </div>
              </div>
            </ng-container>
          </ng-container>

          <!-- Load more -->
          <div class="load-more-wrap" *ngIf="hasMore()">
            <button class="btn btn--ghost" (click)="loadMore()" [disabled]="loadingMore()">
              {{ loadingMore() ? 'Loading…' : 'Load more entries' }}
            </button>
          </div>
        </section>

      </main>
    </div>
  `,
  styles: [`
    .topnav {
      position: sticky; top: 0; z-index: 100;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      height: var(--nav-h);
    }
    .topnav__inner {
      display: flex; align-items: center;
      justify-content: space-between;
      height: 100%;
    }
    .topnav__logo { font-weight: 600; color: var(--color-accent); font-size: 1rem; }
    .nav-link { color: var(--color-accent-dark); font-size: .9375rem; font-weight: 500; text-decoration: none; &:hover { text-decoration: underline; } }

    .main-content { padding-top: 1.5rem; padding-bottom: 4rem; }

    .new-entry-bar {
      display: flex; align-items: center;
      justify-content: space-between;
      gap: 1rem;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 1rem 1.25rem;
      cursor: pointer;
      margin-bottom: 1.25rem;
      transition: background .15s;
      &:hover { background: var(--color-accent-light); }
    }
    .new-entry-bar__text { color: var(--color-text); font-size: .9375rem; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: .75rem;
      margin-bottom: 1.25rem;
    }
    @media (min-width: 480px) {
      .stats-grid { grid-template-columns: repeat(4, 1fr); }
    }
    .stat-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 1rem;
      display: flex; flex-direction: column; align-items: center;
      gap: .25rem;
      text-align: center;
    }
    .stat-value { font-size: 1.75rem; font-weight: 700; line-height: 1; }
    .streak-value { color: var(--color-accent-dark); }
    .stat-label { font-size: .8125rem; color: var(--color-text); }


    /* ── Daily Motivation ───────────────────────────────────────── */
    .motivation-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      margin-bottom: 1.25rem;
      overflow: hidden;
    }
    .motivation-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem; padding: 1rem 1.25rem; cursor: pointer;
      user-select: none;
      &:hover { background: var(--color-accent-light); }
      transition: background .15s;
    }
    .motivation-header__left { flex: 1; min-width: 0; }
    .motivation-label {
      font-size: .6875rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; color: var(--color-accent-dark);
      display: block; margin-bottom: .3rem;
    }
    .motivation-takeaway {
      font-size: .9375rem; color: var(--color-text);
      margin: 0; line-height: 1.7;
    }
    .motivation-toggle {
      flex-shrink: 0; margin-top: .1rem;
      background: none; border: none; cursor: pointer;
      color: var(--color-text-3); padding: .1rem;
      display: flex; align-items: center;
      &:hover { color: var(--color-accent); }
    }
    .motivation-body {
      max-height: 0; overflow: hidden;
      transition: max-height .35s ease, padding .35s ease;
      padding: 0 1.25rem;
    }
    .motivation-card--expanded .motivation-body {
      max-height: 600px;
      padding: 0 1.25rem 1.25rem;
    }
    .motivation-title {
      font-size: 1rem; font-weight: 700;
      color: var(--color-text); margin: 0 0 .375rem;
    }
    .motivation-category {
      display: inline-block;
      font-size: .6875rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: .06em; padding: .15rem .6rem;
      border-radius: 100px;
      background: var(--color-accent-light); color: var(--color-accent-dark);
      border: 1px solid var(--color-accent);
      margin-bottom: .875rem;
    }
    .motivation-content {
      font-size: .9375rem; line-height: 1.7;
      color: var(--color-text); margin: 0;
      white-space: pre-wrap;
    }
    /* ── /Daily Motivation ──────────────────────────────────────── */

    /* ── Search bar ─────────────────────────────────────────────── */
    .search-bar {
      display: flex; align-items: center; gap: .625rem;
      margin-bottom: 1.25rem;
    }
    .search-input-wrap {
      flex: 1; position: relative;
      display: flex; align-items: center;
    }
    .search-icon {
      position: absolute; left: .625rem;
      width: 1rem; height: 1rem;
      color: var(--color-text-3);
      pointer-events: none; flex-shrink: 0;
    }
    .search-input {
      width: 100%; padding: .4375rem .625rem .4375rem 2rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm, 6px);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: .875rem;
      font-family: var(--font-sans);
      box-sizing: border-box;
      &:focus { outline: none; border-color: var(--color-accent); }
    }
    .search-clear {
      position: absolute; right: .5rem;
      background: none; border: none; cursor: pointer;
      color: var(--color-text-3); font-size: 1.1rem; line-height: 1;
      padding: .1rem .25rem; border-radius: 4px;
      &:hover { color: var(--color-text); background: var(--color-surface-2); }
    }
    .sort-select {
      padding: .4375rem .625rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm, 6px);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: .8125rem;
      font-family: var(--font-sans);
      cursor: pointer; flex-shrink: 0;
      &:focus { outline: none; border-color: var(--color-accent); }
    }
    .search-results-count {
      font-size: .8125rem; color: var(--color-text-3);
      margin: 0 0 .75rem;
    }
    /* ── /Search bar ─────────────────────────────────────────────── */

    .section-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; }

    .date-divider {
      font-size: 1.0625rem; font-weight: 700;
      color: var(--color-text);
      padding: .25rem 0;
      margin: 2rem 0 .75rem;
      &:first-child { margin-top: .25rem; }
    }

    .entry-row {
      cursor: pointer;
      margin-bottom: .625rem;
      transition: box-shadow .15s, border-color .15s;
      padding: .875rem 1rem;
      display: flex; align-items: center; gap: .875rem;
      &:hover { border-color: var(--color-accent); box-shadow: var(--shadow-md); }
    }

    /* Calendar date block */
    .entry-cal {
      flex-shrink: 0;
      width: 52px; height: 58px;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 1px;
    }
    .entry-cal__dow {
      font-size: .5625rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: .07em;
      color: var(--color-accent-dark);
      line-height: 1;
    }
    .entry-cal__num {
      font-size: 1.5rem; font-weight: 700; line-height: 1;
      color: var(--color-text);
    }

    /* Body */
    .entry-row__body { flex: 1; min-width: 0; }
    .entry-row__title {
      font-size: .9375rem; font-weight: 600; line-height: 1.35;
      color: var(--color-text); margin: 0 0 .25rem;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .entry-row__sub {
      display: flex; align-items: center; gap: .3rem;
      font-size: .75rem; color: var(--color-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sep { color: var(--color-border); }
    .sub-backfill { color: var(--color-accent-dark); }

    /* Tags */
    .entry-row__tags {
      display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; margin-top: .375rem;
    }
    .entry-tag-chip {
      display: inline-block; padding: .1rem .45rem;
      border-radius: 100px; font-size: .7rem; font-weight: 400;
      background: transparent; color: var(--color-text-3);
      border: 1px solid var(--color-border); cursor: pointer;
      font-family: var(--font-sans); line-height: 1.4;
      transition: color .12s, border-color .12s;
      &:hover { color: var(--color-accent-dark); border-color: var(--color-accent); }
    }
    .entry-tag-add {
      display: inline-block; padding: .1rem .4rem;
      border-radius: 100px; font-size: .7rem; font-weight: 500;
      background: transparent; color: var(--color-text-3);
      border: 1px dashed var(--color-border); cursor: pointer;
      font-family: var(--font-sans); line-height: 1.4;
      transition: border-color .12s, color .12s;
      &:hover { border-color: var(--color-accent); color: var(--color-accent-dark); }
    }

    /* Thumbnail */
    .entry-row__thumb {
      flex-shrink: 0; width: 64px; height: 64px;
      border-radius: var(--radius-md); overflow: hidden;
      border: 1px solid var(--color-border);
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
    }

    .load-more-wrap {
      display: flex; justify-content: center;
      padding: 1.5rem 0 .5rem;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: var(--color-text-2);
    }
    .skeleton { opacity: .5; }
  `]
})
export class DashboardComponent implements OnInit {
  private api    = inject(ApiService);
  private auth   = inject(AuthService);
  private tokens = inject(TokenService);
  private router = inject(Router);

  isAdmin = this.tokens.isAdmin.bind(this.tokens);
  private apiHost = environment.apiBaseUrl.replace(/\/v1$/, '');

  readonly PAGE_SIZE = 60;

  streak     = signal<StreakStats | null>(null);
  entries    = signal<EntryListItem[]>([]);
  hasMore    = signal(false);
  loadingMore = signal(false);
  motivation = signal<MotivationEntry | null>(null);
  motivationExpanded = signal(false);
  loading = signal(true);
  error   = signal('');

  // Search & sort
  searchQuery = signal('');
  sortOrder   = signal<'newest' | 'oldest' | 'favorites'>('newest');

  filteredAndSorted = computed(() => {
    const q     = this.searchQuery().trim().toLowerCase();
    const sort  = this.sortOrder();
    let result  = this.entries();

    if (sort === 'favorites') {
      result = result.filter(e => e.isFavorited);
    }

    if (q) {
      const terms = q.split(/\s+/).filter(t => t.length > 0);
      result = result.filter(e => {
        // Include ISO date ("2026-04-18") AND human-readable ("april 18, 2026")
        const dateReadable = new Date(e.entryDate + 'T00:00:00')
          .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          .toLowerCase(); // → "april 18, 2026"
        const haystack = [e.title, ...e.tags, e.entryDate, dateReadable].join(' ').toLowerCase();
        return terms.every(term => haystack.includes(term));
      });
    }

    if (sort === 'oldest') {
      result = [...result].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
    }

    return result;
  });

  ngOnInit(): void {
    this.api.getStreak().subscribe({
      next: s => this.streak.set(s),
      error: () => {}
    });

    this.api.getTodayMotivation().subscribe({
      next: m => this.motivation.set(m),
      error: () => {}
    });

    this.api.getEntries(undefined, false, undefined, 0, this.PAGE_SIZE).subscribe({
      next: batch => {
        const hasMore = batch.length > this.PAGE_SIZE;
        this.entries.set(hasMore ? batch.slice(0, this.PAGE_SIZE) : batch);
        this.hasMore.set(hasMore);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load entries.');
        this.loading.set(false);
      }
    });
  }

  loadMore(): void {
    if (this.loadingMore()) return;
    this.loadingMore.set(true);
    const skip = this.entries().length;
    this.api.getEntries(undefined, false, undefined, skip, this.PAGE_SIZE).subscribe({
      next: batch => {
        const hasMore = batch.length > this.PAGE_SIZE;
        const newItems = hasMore ? batch.slice(0, this.PAGE_SIZE) : batch;
        this.entries.update(existing => [...existing, ...newItems]);
        this.hasMore.set(hasMore);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false)
    });
  }

  groupedEntries(): { label: string; key: string; entries: EntryListItem[] }[] {
    const map = new Map<string, EntryListItem[]>();
    for (const e of this.filteredAndSorted()) {
      // key = "YYYY-MM" for sorting; label = "Month YYYY" for display
      const key = e.entryDate.substring(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    const pairs = Array.from(map.entries()).map(([key, entries]) => {
      const [year, month] = key.split('-').map(Number);
      const label = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
        month: 'long', year: 'numeric'
      });
      return { key, label, entries };
    });
    return this.sortOrder() === 'oldest'
      ? pairs.sort((a, b) => a.key.localeCompare(b.key))
      : pairs.sort((a, b) => b.key.localeCompare(a.key));
  }

  fullImageUrl(relativeUrl: string): string {
    return this.api.getImageUrl(relativeUrl);
  }

  readonly getMoodEmoji = getMoodEmoji;

  categoryLabel(cat: string): string {
    if (cat === 'BestPractice') return 'Best Practice';
    return cat;
  }

  getDayAbbr(d: string): string {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  }

  getDayNum(d: string): string {
    return new Date(d + 'T00:00:00').getDate().toString();
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  navigateToTag(event: Event, tag: string): void {
    event.stopPropagation();
    this.router.navigate(['/entries/by-tag', tag]);
  }

  navigateToEditTags(event: Event, entryId: string): void {
    event.stopPropagation();
    this.router.navigate(['/entry', entryId, 'edit']);
  }

  logout(): void {
    this.auth.logout();
  }
}
