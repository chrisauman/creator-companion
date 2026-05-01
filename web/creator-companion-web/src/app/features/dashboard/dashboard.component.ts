import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { TokenService } from '../../core/services/token.service';
import { StreakStats, EntryListItem, MotivationEntry } from '../../core/models/models';
import { getMoodEmoji } from '../../core/constants/moods';
import { MILESTONES, getMilestoneForDays, getMilestoneIndex, Milestone } from '../../core/constants/milestones';
import { PushService } from '../../core/services/push.service';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SidebarComponent, MobileNavComponent],
  template: `
    <div class="dashboard">

      <!-- Achievement celebration overlay -->
      @if (showCelebration() && isPaid()) {
        <div class="celebration-overlay" (click)="dismissCelebration()">
          <div class="celebration-modal" (click)="$event.stopPropagation()">
            <div class="celebration-icon">{{ celebrationMilestone()!.icon }}</div>
            <p class="celebration-earned">You've earned a new title!</p>
            <h2 class="celebration-title">{{ celebrationMilestone()!.title }}</h2>
            <p class="celebration-days">{{ celebrationMilestone()!.days }} days of showing up. Keep going.</p>
            <button class="btn btn--primary btn--lg" (click)="dismissCelebration()">Let's go!</button>
          </div>
        </div>
      }

      <!-- ── Desktop sidebar ─────────────────────────────────── -->
      <app-sidebar active="dashboard" />

      <!-- ── Mobile top bar ──────────────────────────────────── -->
      <header class="topbar">
        <a class="topbar__brand" routerLink="/dashboard">
          <img src="logo-icon.png" alt="" class="topbar__brand-icon">
          <span class="topbar__brand-name">Creator Companion</span>
        </a>
        <a *ngIf="isAdmin()" class="topbar__admin" routerLink="/admin">Admin</a>
      </header>

      <!-- ── Mobile bottom nav ───────────────────────────────── -->
      <app-mobile-nav active="dashboard" />

      <!-- ── Main content ────────────────────────────────────── -->
      <main class="main-content">

        <!-- New entry CTA -->
        <button class="new-entry-bar btn btn--primary btn--full" routerLink="/entry/new">
          + Create New Entry
        </button>

        <!-- Mobile-only stat cards -->
        <div class="stats-grid stats-grid--mobile" *ngIf="streak()">
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
        <div class="stats-grid stats-grid--mobile" *ngIf="!streak() && !error()">
          <div class="stat-card skeleton" *ngFor="let i of [1,2,3,4]">
            <span class="stat-value">—</span>
            <span class="stat-label">Loading…</span>
          </div>
        </div>

        <!-- Daily Motivation card -->
        @if (motivation()) {
          <div class="motivation-card" [class.motivation-card--expanded]="motivationExpanded()">
            <div class="motivation-header" (click)="motivationExpanded.set(!motivationExpanded())">
              <div class="motivation-header__left">
                <span class="motivation-label">Daily Spark</span>
                <p class="motivation-takeaway">{{ motivation()!.takeaway }}</p>
              </div>
              <div class="motivation-actions" (click)="$event.stopPropagation()">
                @if (isPaid()) {
                  <button class="motivation-heart"
                    [class.motivation-heart--active]="motivation()!.isFavorited"
                    [attr.aria-label]="motivation()!.isFavorited ? 'Remove from favorites' : 'Add to favorites'"
                    (click)="toggleSparkFavorite()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                      [attr.fill]="motivation()!.isFavorited ? 'currentColor' : 'none'"
                      stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  </button>
                }
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
            </div>
            <div class="motivation-body">
              <p class="motivation-content">{{ motivation()!.fullContent }}</p>
            </div>
          </div>
        }

        <!-- Push notification nudge -->
        @if (showPushNudge()) {
          <div class="push-nudge">
            <div class="push-nudge__text">
              <span class="push-nudge__icon">🔔</span>
              <span>Enable notifications to receive daily reminders and keep your streak alive.</span>
            </div>
            <button class="btn btn--sm push-nudge__btn"
                    [disabled]="pushNudgeWorking()"
                    (click)="enablePushFromNudge()">
              {{ pushNudgeWorking() ? 'Enabling…' : 'Enable' }}
            </button>
          </div>
        }

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
            <ng-container *ngFor="let group of groupedEntries(); trackBy: trackByGroup; let first = first">
              <div class="date-divider" [class.date-divider--first]="first">{{ group.label }}</div>
              <div
                class="entry-row card"
                *ngFor="let entry of group.entries; trackBy: trackByEntry"
                [routerLink]="['/entry', entry.id]"
              >
                <div class="entry-cal">
                  <span class="entry-cal__dow">{{ getDayAbbr(entry.entryDate) }}</span>
                  <span class="entry-cal__num">{{ getDayNum(entry.entryDate) }}</span>
                </div>
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
                  <div class="entry-row__tags">
                    <ng-container *ngIf="entry.tags && entry.tags.length > 0">
                      <button class="entry-tag-chip" type="button"
                        *ngFor="let tag of entry.tags"
                        (click)="navigateToTag($event, tag)">#{{ tag }}</button>
                    </ng-container>
                    <button class="entry-tag-add" type="button"
                      (click)="navigateToEditTags($event, entry.id)"
                      [title]="entry.tags && entry.tags.length ? 'Edit tags' : 'Add tags'"
                    >{{ entry.tags && entry.tags.length ? '···' : '+ tag' }}</button>
                  </div>
                </div>
                <div class="entry-row__thumb" *ngIf="entry.firstImageUrl">
                  <img [src]="fullImageUrl(entry.firstImageUrl)" [alt]="entry.title"
                       (error)="onImgError($event)" />
                </div>
              </div>
            </ng-container>
          </ng-container>

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

    /* ── Page shell ─────────────────────────────────────────────── */
    .dashboard {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    @media (min-width: 768px) {
      .dashboard { flex-direction: row; }
    }

    /* ── Mobile top bar ──────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 100;
      background: #111318;
      border-bottom: 1px solid rgba(255,255,255,.07);
      height: 52px;
      display: flex; align-items: center;
      padding: 0 1.125rem;
      justify-content: space-between;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; }
    .topbar__brand-icon { height: 24px; width: auto; display: block; }
    .topbar__brand-name {
      font-family: 'Fraunces', Georgia, serif;
      font-size: .9375rem; font-weight: 700; color: #fff;
    }
    .topbar__admin {
      font-size: .8125rem; font-weight: 600;
      color: rgba(255,255,255,.5); text-decoration: none;
      padding: .25rem .625rem;
      border: 1px solid rgba(255,255,255,.15);
      border-radius: 6px;
      &:hover { color: #fff; border-color: rgba(255,255,255,.3); }
    }

    /* ── Main content ────────────────────────────────────────────── */
    .main-content {
      flex: 1;
      min-width: 0;
      /* extra bottom padding = nav bar height + safe-area + breathing room */
      padding: 1.25rem 1rem calc(80px + env(safe-area-inset-bottom, 0px));
      background: var(--color-bg);
    }
    @media (min-width: 768px) {
      .main-content {
        padding: 2.5rem 3rem 4rem;
        background: #f7f7f5;
      }
    }

    /* ── New entry button ────────────────────────────────────────── */
    .new-entry-bar {
      margin-bottom: 1.5rem;
      padding: 1rem;
      font-size: 1rem;
      border-radius: var(--radius-lg);
    }

    /* ── Mobile-only stat grid ───────────────────────────────────── */
    .stats-grid--mobile {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: .75rem;
      margin-bottom: 1.5rem;
    }
    @media (min-width: 480px) {
      .stats-grid--mobile { grid-template-columns: repeat(4, 1fr); }
    }
    @media (min-width: 768px) {
      .stats-grid--mobile { display: none; }
    }
    .stat-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 1rem;
      display: flex; flex-direction: column; align-items: center;
      gap: .25rem; text-align: center;
    }
    .stat-value { font-size: 1.75rem; font-weight: 900; line-height: 1; font-family: var(--font-display); }
    .streak-value { color: var(--color-accent); }
    .stat-label { font-size: .8125rem; color: var(--color-text-2); }
    .skeleton { opacity: .5; }

    /* ── Push nudge ──────────────────────────────────────────────── */
    .push-nudge {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      padding: .75rem 1rem;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      margin-bottom: 1.25rem;
    }
    .push-nudge__text {
      display: flex; align-items: center; gap: .5rem;
      font-size: .875rem; color: var(--color-text-2); line-height: 1.4;
    }
    .push-nudge__icon { font-size: 1rem; flex-shrink: 0; }
    .push-nudge__btn { flex-shrink: 0; }

    /* ── Daily Motivation ────────────────────────────────────────── */
    .motivation-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      margin-bottom: 1.25rem;
      overflow: hidden;
      transition: border-color .15s, box-shadow .15s;
      &:hover { border-color: var(--color-accent); box-shadow: var(--shadow-md); }
    }
    .motivation-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem; padding: 1rem 1.25rem; cursor: pointer; user-select: none;
    }
    .motivation-header__left { flex: 1; min-width: 0; }
    .motivation-label {
      font-size: .6875rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; color: var(--color-accent);
      display: block; margin-bottom: .3rem;
    }
    .motivation-takeaway { font-size: .9375rem; color: var(--color-text); margin: 0; line-height: 1.7; }
    .motivation-actions {
      display: flex; align-items: center; gap: .25rem; flex-shrink: 0; margin-top: .1rem;
    }
    .motivation-heart {
      background: none; border: none; cursor: pointer;
      color: var(--color-text-3); padding: .1rem;
      display: flex; align-items: center;
      transition: color .15s, transform .1s;
      &:hover { color: #e11d48; transform: scale(1.15); }
    }
    .motivation-heart--active { color: #e11d48; }
    .motivation-toggle {
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
    .motivation-card--expanded .motivation-body { max-height: 600px; padding: 0 1.25rem 1.25rem; }
    .motivation-content { font-size: .9375rem; line-height: 1.7; color: var(--color-text); margin: 0; white-space: pre-wrap; }

    /* ── Search bar ──────────────────────────────────────────────── */
    .search-bar {
      display: flex; align-items: center; gap: .625rem;
      margin-top: 1.25rem; margin-bottom: .125rem;
    }
    .search-input-wrap { flex: 1; position: relative; display: flex; align-items: center; }
    .search-icon {
      position: absolute; left: .625rem;
      width: 1rem; height: 1rem; color: var(--color-text-3); pointer-events: none;
    }
    .search-input {
      width: 100%; padding: .5rem .625rem .5rem 2rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface); color: var(--color-text);
      font-size: .875rem; font-family: var(--font-sans); box-sizing: border-box;
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
      padding: .5rem .625rem;
      border: 1px solid var(--color-border); border-radius: var(--radius-sm);
      background: var(--color-surface); color: var(--color-text);
      font-size: .8125rem; font-family: var(--font-sans); cursor: pointer; flex-shrink: 0;
      &:focus { outline: none; border-color: var(--color-accent); }
    }
    .search-results-count { font-size: .8125rem; color: var(--color-text-3); margin: 0 0 .75rem; }

    /* ── Entry list ──────────────────────────────────────────────── */
    .date-divider {
      font-size: 1.0625rem; font-weight: 900; font-family: var(--font-display);
      color: var(--color-text); padding: .25rem 0; margin: 2rem 0 .75rem;
      &.date-divider--first { margin-top: .375rem; }
    }
    .entry-row {
      cursor: pointer; margin-bottom: .625rem;
      transition: box-shadow .15s, border-color .15s;
      padding: 1rem 1.25rem;
      display: flex; align-items: center; gap: 1rem;
      &:hover { border-color: var(--color-accent); box-shadow: var(--shadow-md); }
    }
    .entry-cal {
      flex-shrink: 0; width: 52px; height: 58px;
      background: var(--color-surface-2); border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
    }
    .entry-cal__dow {
      font-size: .5625rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; color: var(--color-accent); line-height: 1;
    }
    .entry-cal__num { font-size: 1.5rem; font-weight: 900; line-height: 1; font-family: var(--font-display); color: var(--color-text); }
    .entry-row__body { flex: 1; min-width: 0; }
    .entry-row__title {
      font-size: .9375rem; font-weight: 600; line-height: 1.35;
      color: var(--color-text); margin: 0 0 .25rem;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .entry-row__sub {
      display: flex; align-items: center; gap: .3rem;
      font-size: .75rem; color: var(--color-text-2);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sep { color: var(--color-border); }
    .entry-row__tags { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; margin-top: .375rem; }
    .entry-tag-chip {
      display: inline-block; padding: .1rem .45rem;
      border-radius: 100px; font-size: .7rem; font-weight: 400;
      background: transparent; color: var(--color-text-3);
      border: 1px solid var(--color-border); cursor: pointer;
      font-family: var(--font-sans); line-height: 1.4;
      transition: color .12s, border-color .12s;
      &:hover { color: var(--color-accent); border-color: var(--color-accent); }
    }
    .entry-tag-add {
      display: inline-block; padding: .1rem .4rem;
      border-radius: 100px; font-size: .7rem; font-weight: 500;
      background: transparent; color: var(--color-text-3);
      border: 1px dashed var(--color-border); cursor: pointer;
      font-family: var(--font-sans); line-height: 1.4;
      transition: border-color .12s, color .12s;
      &:hover { border-color: var(--color-accent); color: var(--color-accent); }
    }
    .entry-row__thumb {
      flex-shrink: 0; width: 72px; height: 72px;
      border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--color-border);
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
    }
    .load-more-wrap { display: flex; justify-content: center; padding: 1.5rem 0 .5rem; }
    .empty-state { text-align: center; padding: 4rem 1rem; color: var(--color-text-2); }

    /* ── Celebration overlay ─────────────────────────────────────── */
    .celebration-overlay {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(0,0,0,.55);
      display: flex; align-items: center; justify-content: center;
      padding: 1.5rem; animation: fadeIn .2s ease forwards;
    }
    .celebration-modal {
      background: var(--color-surface); border-radius: var(--radius-lg);
      padding: 2.5rem 2rem; max-width: 360px; width: 100%;
      text-align: center; box-shadow: var(--shadow-lg);
      animation: celebrationIn .3s ease forwards;
    }
    .celebration-icon { font-size: 4rem; line-height: 1; margin-bottom: 1rem; }
    .celebration-earned {
      font-size: .75rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .08em; color: var(--color-accent); margin-bottom: .5rem;
    }
    .celebration-title { font-size: 2rem; font-weight: 800; color: var(--color-text); margin-bottom: .5rem; }
    .celebration-days { font-size: .9375rem; color: var(--color-text-2); line-height: 1.5; margin-bottom: 1.75rem; }
    @keyframes celebrationIn {
      from { opacity: 0; transform: scale(.92) translateY(10px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
  `]
})
export class DashboardComponent implements OnInit {
  private api    = inject(ApiService);
  private auth   = inject(AuthService);
  private tokens = inject(TokenService);
  private push   = inject(PushService);
  private router = inject(Router);

  isAdmin = this.tokens.isAdmin.bind(this.tokens);


  readonly PAGE_SIZE = 60;

  showPushNudge   = signal(false);
  pushNudgeWorking = signal(false);

  streak     = signal<StreakStats | null>(null);
  isPaid     = signal(false);
  showCelebration    = signal(false);
  celebrationMilestone = signal<Milestone | null>(null);

  currentStreakMilestone = computed(() => getMilestoneForDays(this.streak()?.currentStreak ?? 0));
  longestStreakMilestone = computed(() => getMilestoneForDays(this.streak()?.longestStreak ?? 0));
  entries    = signal<EntryListItem[]>([]);
  hasMore    = signal(false);
  loadingMore = signal(false);
  motivation = signal<MotivationEntry | null>(null);
  motivationExpanded = signal(false);
  loading        = signal(true);
  error          = signal('');
  sessionExpired = signal(false);

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
    this.auth.loadCapabilities().subscribe(caps => this.isPaid.set(caps.canFavorite));
    this.initPushNudge();

    // Safety net: if any API call hangs past 20 s, exit the loading state
    // gracefully rather than spinning forever. This covers Railway cold starts
    // and iOS PWA scenarios where network requests can be delayed.
    const safetyTimer = setTimeout(() => {
      if (!this.streak()) {
        this.streak.set({ currentStreak: 0, longestStreak: 0, totalEntries: 0,
          totalMediaCount: 0, totalActiveDays: 0, isPaused: false, pauseDaysUsedThisMonth: 0 });
      }
      if (this.loading()) {
        this.loading.set(false);
      }
      // If we still have no valid access token after 20 s, the session
      // restoration definitively failed — send the user to login.
      if (!this.tokens.getAccessToken()) {
        window.location.replace('/login');
      }
    }, 20000);

    this.api.getStreak().subscribe({
      next: s => { this.streak.set(s); this.checkMilestoneCelebration(s.currentStreak); },
      error: () => this.streak.set({ currentStreak: 0, longestStreak: 0, totalEntries: 0, totalMediaCount: 0, totalActiveDays: 0, isPaused: false, pauseDaysUsedThisMonth: 0 })
    });

    this.api.getTodayMotivation().subscribe({
      next: m => this.motivation.set(m),
      error: () => {}
    });

    this.api.getEntries(undefined, false, undefined, 0, this.PAGE_SIZE).subscribe({
      next: batch => {
        clearTimeout(safetyTimer);
        const hasMore = batch.length > this.PAGE_SIZE;
        this.entries.set(hasMore ? batch.slice(0, this.PAGE_SIZE) : batch);
        this.hasMore.set(hasMore);
        this.loading.set(false);
      },
      error: () => {
        clearTimeout(safetyTimer);
        if (!this.tokens.getAccessToken()) {
          // No valid token after all retries — session has expired
          window.location.replace('/login');
        } else {
          this.error.set('Could not load entries. Pull down to refresh.');
          this.loading.set(false);
        }
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

  groupedEntries = computed(() => {
    const map = new Map<string, EntryListItem[]>();
    for (const e of this.filteredAndSorted()) {
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
  });

  fullImageUrl(relativeUrl: string): string {
    return this.api.getImageUrl(relativeUrl);
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    console.error('[Image load failed]', img.src);
    img.style.display = 'none';
  }

  trackByGroup(_: number, group: { key: string }): string { return group.key; }
  trackByEntry(_: number, entry: EntryListItem): string { return entry.id; }

  readonly getMoodEmoji = getMoodEmoji;

  private checkMilestoneCelebration(currentStreak: number): void {
    const userId = this.tokens.getUserId();
    const key = `cc_milestone_${userId}`;
    const currentIndex = getMilestoneIndex(currentStreak);
    const storedIndex = parseInt(localStorage.getItem(key) ?? '-1', 10);

    if (currentIndex > storedIndex) {
      this.celebrationMilestone.set(MILESTONES[currentIndex]);
      this.showCelebration.set(true);
      localStorage.setItem(key, currentIndex.toString());
    } else if (currentIndex < storedIndex) {
      // Streak broke below a threshold — reset so re-achieving fires again
      localStorage.setItem(key, currentIndex.toString());
    }
  }

  dismissCelebration(): void {
    this.showCelebration.set(false);
  }

  private async initPushNudge(): Promise<void> {
    if (!this.push.isSupported) return;
    const subscribed = await this.push.isSubscribed();
    if (subscribed) {
      this.push.syncToServer();
    } else {
      this.showPushNudge.set(true);
    }
  }

  async enablePushFromNudge(): Promise<void> {
    this.pushNudgeWorking.set(true);
    const ok = await this.push.subscribe();
    this.pushNudgeWorking.set(false);
    if (ok) this.showPushNudge.set(false);
  }

  toggleSparkFavorite(): void {
    const m = this.motivation();
    if (!m) return;
    // Optimistic update
    this.motivation.set({ ...m, isFavorited: !m.isFavorited });
    this.api.toggleSparkFavorite(m.id).subscribe({
      next: res => this.motivation.update(cur => cur ? { ...cur, isFavorited: res.isFavorited } : cur),
      error: () => this.motivation.set(m) // revert on error
    });
  }

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
