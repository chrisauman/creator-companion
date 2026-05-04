import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { TokenService } from '../../core/services/token.service';
import { StreakStats, EntryListItem, MotivationEntry, Entry } from '../../core/models/models';
import { getMoodEmoji } from '../../core/constants/moods';
import { MILESTONES, getMilestoneForDays, getMilestoneIndex, getMilestoneProgress, Milestone, MilestoneProgress } from '../../core/constants/milestones';
import { PushService } from '../../core/services/push.service';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';
import { MoodIconComponent } from '../../shared/mood-icon/mood-icon.component';
import { TierIconComponent } from '../../shared/tier-icon/tier-icon.component';
import { TodayPanelComponent } from './today-panel.component';
import { EntryReaderComponent } from './entry-reader.component';
import { NewEntryComponent } from '../entry/new/new-entry.component';
import { EditEntryComponent } from '../entry/edit/edit-entry.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SidebarComponent, MobileNavComponent, MoodIconComponent, TierIconComponent, TodayPanelComponent, EntryReaderComponent, NewEntryComponent, EditEntryComponent],
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

        <!-- ── Desktop greeting + compose pill ──────────────── -->
        <div class="greeting-row">
          <div class="greeting">
            <h1 class="greeting__hello">{{ greetingMessage() }}</h1>
            <div class="greeting__date">{{ todayLabel() }}</div>
          </div>
          <button class="compose-pill" type="button" (click)="composeBlank()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.4" stroke-linecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Entry
          </button>
        </div>

        <!-- ── Desktop stats strip ──────────────────────────── -->
        <div class="stats-strip" *ngIf="streak()">
          <div class="stat">
            <div class="stat__num">
              {{ streak()!.currentStreak }}<span class="stat__unit">{{ streak()!.currentStreak === 1 ? 'day' : 'days' }}</span>
            </div>
            <div class="stat__label">Current streak</div>

            <ng-container *ngIf="progressToNext() as p">
              <div class="reward" *ngIf="p.current">
                <span class="reward__badge"
                      [class.reward__badge--top]="p.isAtTopTier">
                  <app-tier-icon [tier]="p.current.title" [size]="12"></app-tier-icon>
                  {{ p.current.title }}
                </span>

                <ng-container *ngIf="!p.isAtTopTier && p.next">
                  <div class="reward__track">
                    <div class="reward__fill" [style.width.%]="p.percentToNext"></div>
                  </div>
                  <div class="reward__label">
                    <span><strong>{{ p.daysToNext }}</strong> to {{ p.next.title }}</span>
                  </div>
                </ng-container>
                <div class="reward__label reward__label--top" *ngIf="p.isAtTopTier">
                  The highest tier — keep going.
                </div>
              </div>

              <div class="reward reward--pre" *ngIf="!p.current && p.next">
                <div class="reward__track">
                  <div class="reward__fill" [style.width.%]="p.percentToNext"></div>
                </div>
                <div class="reward__label">
                  <span><strong>{{ p.daysToNext }}</strong> to {{ p.next.title }}</span>
                </div>
              </div>
            </ng-container>
          </div>

          <div class="stat">
            <div class="stat__num">
              {{ streak()!.longestStreak }}<span class="stat__unit">{{ streak()!.longestStreak === 1 ? 'day' : 'days' }}</span>
            </div>
            <div class="stat__label">Longest streak</div>
          </div>
          <div class="stat">
            <div class="stat__num">{{ streak()!.totalEntries }}</div>
            <div class="stat__label">Total entries</div>
          </div>
          <div class="stat">
            <div class="stat__num">
              {{ streak()!.totalActiveDays }}<span class="stat__unit">{{ streak()!.totalActiveDays === 1 ? 'day' : 'days' }}</span>
            </div>
            <div class="stat__label">Days active</div>
          </div>
        </div>
        <div class="stats-strip stats-strip--skeleton" *ngIf="!streak() && !error()">
          <div class="stat" *ngFor="let i of [1,2,3,4]">
            <div class="stat__num">—</div>
            <div class="stat__label">Loading…</div>
          </div>
        </div>

        <!-- ── Mobile new entry CTA (kept until mobile redesign) ── -->
        <button class="new-entry-bar new-entry-bar--mobile btn btn--primary btn--full" type="button"
                (click)="composeBlank()">
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

        <!-- Daily Motivation card (mobile only — desktop shows it inside the Today panel as the Spark hero) -->
        @if (motivation()) {
          <div class="motivation-card motivation-card--mobile" [class.motivation-card--expanded]="motivationExpanded()">
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

        <!-- Two-column work area (single column on mobile — right column hides) -->
        <div class="work">

        <!-- Entry list -->
        <section class="entries-section work__list-col">
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
                class="entry-row"
                *ngFor="let entry of group.entries; trackBy: trackByEntry"
                [class.entry-row--active]="selectedEntryId() === entry.id"
                (click)="handleEntryClick(entry)"
              >
                <div class="entry-cal">
                  <span class="entry-cal__dow">{{ getDayAbbr(entry.entryDate) }}</span>
                  <span class="entry-cal__num">{{ getDayNum(entry.entryDate) }}</span>
                  <span class="entry-cal__time">{{ formatTime(entry.createdAt) }}</span>
                </div>
                <div class="entry-row__body">
                  <p class="entry-row__title">{{ entryHeadline(entry) }}</p>
                  <div class="entry-row__mood" *ngIf="entry.mood">
                    <app-mood-icon [mood]="entry.mood" [size]="14"></app-mood-icon>
                    <span>{{ entry.mood }}</span>
                  </div>
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

        <!-- Right column: Today / Reading / Composing / Editing (desktop only) -->
        <aside class="work__right-col">
          @switch (rightColumnMode()) {
            @case ('today') {
              <app-today-panel
                [motivation]="motivation()"
                [canFavorite]="isPaid()"
                (composeFromSpark)="composeFromSpark()"
                (composeFromPrompt)="composeFromPrompt($event)"
                (composeFromMood)="composeFromMood($event)"
                (composeBlank)="composeBlank()"
                (favoriteSpark)="toggleSparkFavorite()"
                (expandSpark)="expandSpark()"
              ></app-today-panel>
            }
            @case ('reading') {
              <app-entry-reader
                [entry]="selectedEntry()"
                [loading]="selectedEntryLoading()"
                [loadError]="selectedEntryError()"
                [canFavorite]="isPaid()"
                (returnToToday)="returnToToday()"
                (edit)="editSelectedEntry()"
                (toggleFavorite)="toggleSelectedFavorite()"
              ></app-entry-reader>
            }
            @case ('composing') {
              <app-new-entry
                [embedded]="true"
                [initialMood]="composeMood()"
                [initialPrompt]="composePrompt()"
                [initialSpark]="composeSpark()"
                (saved)="onComposeSaved()"
                (canceled)="returnToToday()"
              ></app-new-entry>
            }
            @case ('editing') {
              <app-edit-entry
                [embedded]="true"
                [entryIdInput]="selectedEntryId()"
                (saved)="onEditSaved()"
                (canceled)="returnToReading()"
                (deleted)="onEditDeleted()"
              ></app-edit-entry>
            }
          }
        </aside>

        </div><!-- /.work -->

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

    /* ── Desktop greeting + compose pill ─────────────────────────── */
    .greeting-row {
      display: none;
    }
    @media (min-width: 768px) {
      .greeting-row {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1.5rem;
        margin-bottom: 1.25rem;
      }
    }
    .greeting__hello {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -.01em;
      color: var(--color-text);
      margin: 0 0 2px;
    }
    .greeting__date {
      font-size: .8125rem;
      color: var(--color-text-2);
    }
    .compose-pill {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      padding: .625rem 1.125rem .625rem 1rem;
      background: #0c0e13;
      color: #fff;
      border: none;
      border-radius: 999px;
      font-family: inherit;
      font-size: .875rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background .15s, color .15s, transform .15s;
      flex-shrink: 0;
    }
    .compose-pill:hover {
      background: var(--color-accent);
      color: #0c0e13;
      transform: translateY(-1px);
    }

    /* ── Desktop stats strip ─────────────────────────────────────── */
    .stats-strip { display: none; }
    @media (min-width: 768px) {
      .stats-strip {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0;
        padding: 1.25rem 0 1.5rem;
        margin-bottom: .25rem;
        border-top: 1px solid var(--color-border);
        border-bottom: 1px solid var(--color-border);
        row-gap: 1.25rem;
      }
    }
    /* Wider screens get the original 4-across single-row strip. */
    @media (min-width: 1100px) {
      .stats-strip {
        grid-template-columns: repeat(4, 1fr);
        row-gap: 0;
      }
    }
    .stats-strip .stat {
      padding: 0 1.5rem;
      border-right: 1px solid var(--color-border);
      min-width: 0;
    }
    .stats-strip .stat:nth-child(2n) { border-right: none; }
    @media (min-width: 1100px) {
      .stats-strip .stat:nth-child(2n) { border-right: 1px solid var(--color-border); }
      .stats-strip .stat:last-child { border-right: none; }
    }
    .stats-strip .stat:first-child { padding-left: 0; }
    @media (min-width: 1100px) {
      .stats-strip .stat:nth-child(3) { padding-left: 1.5rem; }
    }
    @media (max-width: 1099px) and (min-width: 768px) {
      .stats-strip .stat:nth-child(3) { padding-left: 0; }
    }

    .stats-strip .stat__num {
      font-family: var(--font-display);
      font-size: 2rem;
      font-weight: 700;
      line-height: 1;
      letter-spacing: -.02em;
      color: var(--color-text);
    }
    .stats-strip .stat__unit {
      font-size: .8125rem;
      color: var(--color-text-3);
      font-family: var(--font-sans);
      font-weight: 500;
      margin-left: 4px;
    }
    .stats-strip .stat__label {
      margin-top: .375rem;
      font-size: .6875rem;
      color: var(--color-text-2);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .1em;
    }
    .stats-strip--skeleton .stat__num { opacity: .4; }
    .stats-strip--skeleton .stat__label { opacity: .6; }

    /* ── Hybrid progress reward ──────────────────────────────────── */
    .reward { margin-top: .625rem; }
    .reward__badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .375rem;
      width: 100%;
      padding: 4px 10px;
      background: #faf2dc;
      border: 1px solid rgba(224,168,58,.3);
      color: #8b6912;
      border-radius: 8px;
      font-size: .6875rem;
      font-weight: 700;
      letter-spacing: .03em;
      box-sizing: border-box;
    }
    .reward__badge--top {
      background: linear-gradient(135deg, #faf2dc 0%, #f0d77a 100%);
      border-color: rgba(224,168,58,.55);
      color: #6e5610;
    }
    .reward__track {
      margin-top: .5rem;
      height: 4px;
      background: var(--color-border);
      border-radius: 2px;
      overflow: hidden;
    }
    .reward__fill {
      height: 100%;
      background: linear-gradient(90deg, #0d9bb5, var(--color-accent));
      border-radius: 2px;
      transition: width .35s ease;
    }
    .reward__label {
      font-size: .6875rem;
      color: var(--color-text-3);
      font-weight: 500;
      margin-top: 6px;
      text-align: left;
    }
    .reward__label strong {
      color: #0d9bb5;
      font-weight: 700;
    }
    .reward__label--top {
      text-align: center;
      color: #8b6912;
      font-weight: 600;
    }
    .reward--pre .reward__label { margin-top: 6px; }

    /* ── New entry button ────────────────────────────────────────── */
    .new-entry-bar {
      margin-bottom: 1.5rem;
      padding: 1rem;
      font-size: 1rem;
      border-radius: var(--radius-lg);
    }
    /* Mobile-only fallback CTA — hidden on desktop where the pill takes over. */
    @media (min-width: 768px) {
      .new-entry-bar--mobile { display: none; }
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

    /* ── Two-column work area ────────────────────────────────────── */
    .work {
      display: block;
    }
    .work__right-col { display: none; }

    @media (min-width: 768px) {
      .work {
        display: grid;
        grid-template-columns: minmax(360px, 420px) 1fr;
        gap: 0;
        align-items: start;
        margin-top: 1rem;
      }
      .work__list-col {
        padding-right: 1.75rem;
        border-right: 1px solid var(--color-border);
        min-width: 0;
      }
      .work__right-col {
        display: block;
        position: sticky;
        top: 1rem;
        max-height: calc(100vh - 2rem);
        overflow-y: auto;
        padding-left: 0;
        margin: -2.5rem -3rem -4rem 0;
        background: var(--color-surface);
        border-left: 1px solid var(--color-border);
      }
    }

    /* On desktop, hide the standalone mobile motivation card — its content
       lives inside the Today panel as the Spark hero. */
    @media (min-width: 768px) {
      .motivation-card--mobile { display: none; }
    }

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
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-text-3);
      padding: 0 0 .5rem;
      margin: 1.75rem 0 .875rem;
      border-bottom: 1px solid var(--color-border);
    }
    .date-divider--first { margin-top: 1rem; }

    .entry-row {
      display: grid;
      grid-template-columns: 56px 1fr;
      gap: 1.125rem;
      padding: 1.125rem 1.25rem;
      margin-bottom: .5rem;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: border-color .15s, box-shadow .15s, transform .15s;
    }
    .entry-row:hover {
      border-color: var(--color-text-3);
      box-shadow: 0 6px 20px -10px rgba(0,0,0,.08);
    }
    .entry-row--active {
      border-color: var(--color-accent);
      background: rgba(18,196,227,.05);
      box-shadow: -3px 0 0 0 var(--color-accent), 0 6px 20px -10px rgba(18,196,227,.2);
    }
    .entry-row--active:hover {
      border-color: var(--color-accent);
    }

    .entry-cal {
      display: flex; flex-direction: column; align-items: center;
      text-align: center;
      padding-top: 2px;
    }
    .entry-cal__dow {
      font-size: .5625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-accent);
      line-height: 1;
    }
    .entry-cal__num {
      font-family: var(--font-display);
      font-size: 1.625rem;
      font-weight: 700;
      line-height: 1;
      letter-spacing: -.02em;
      color: var(--color-text);
      margin-top: 4px;
    }
    .entry-cal__time {
      font-size: .625rem;
      color: var(--color-text-3);
      margin-top: 5px;
      letter-spacing: .02em;
    }

    .entry-row__body { min-width: 0; padding-top: 2px; }
    .entry-row__title {
      font-family: var(--font-display);
      font-size: 1.125rem;
      font-weight: 600;
      line-height: 1.35;
      color: var(--color-text);
      margin: 0 0 .5rem;
      letter-spacing: -.005em;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    .entry-row__mood {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      font-size: .75rem;
      color: var(--color-text-2);
    }
    .entry-row__mood app-mood-icon { color: var(--color-text-3); }

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

  /**
   * Hybrid progress reward data: current tier, next tier, days into current
   * tier, days remaining, percent progress. Drives the badge + progress bar
   * shown under the streak number on desktop.
   */
  progressToNext = computed<MilestoneProgress>(() =>
    getMilestoneProgress(this.streak()?.currentStreak ?? 0)
  );

  /**
   * Time-of-day greeting using the user's first-name-or-username, e.g.
   * "Good morning, Chris". Refreshed implicitly on every change-detection
   * pass — close enough for a header greeting.
   */
  greetingMessage = computed(() => {
    const name = this.displayName();
    const hour = new Date().getHours();
    const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    return name ? `Good ${period}, ${name}` : `Good ${period}`;
  });

  /** Display name for the greeting — first name if it looks like one, else username. */
  private displayName(): string {
    const u = this.tokens.getCachedUser();
    if (!u?.username) return '';
    // If the username looks like an email, strip the domain.
    const base = u.username.includes('@') ? u.username.split('@')[0] : u.username;
    // Capitalize first letter; leave the rest as-is.
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  /** Date subtitle under the greeting, e.g. "Sunday · May 4, 2026". */
  todayLabel = computed(() => {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return `${weekday} · ${monthDay}`;
  });
  entries    = signal<EntryListItem[]>([]);
  hasMore    = signal(false);
  loadingMore = signal(false);
  motivation = signal<MotivationEntry | null>(null);
  motivationExpanded = signal(false);
  loading        = signal(true);
  error          = signal('');
  sessionExpired = signal(false);

  // ── Right column state (desktop): Today / Reading / Composing / Editing
  rightColumnMode      = signal<'today' | 'reading' | 'composing' | 'editing'>('today');
  selectedEntryId      = signal<string | null>(null);
  selectedEntry        = signal<Entry | null>(null);
  selectedEntryLoading = signal<boolean>(false);
  selectedEntryError   = signal<boolean>(false);

  // ── Compose context — passed to the embedded NewEntryComponent
  composeMood   = signal<string | null>(null);
  composePrompt = signal<string | null>(null);
  composeSpark  = signal<string | null>(null);

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

  // ── Right column / inline reader handlers ──────────────────────

  /**
   * Click on an entry row. On desktop (>= 768px) we keep the user on
   * the dashboard and show the entry inline in the right column. On
   * mobile we navigate to the dedicated /entry/:id page (the inline
   * reading-pane experience is built for mobile in Phase H).
   */
  handleEntryClick(entry: EntryListItem): void {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    if (isDesktop) {
      this.selectEntry(entry.id);
    } else {
      this.router.navigate(['/entry', entry.id]);
    }
  }

  private selectEntry(id: string): void {
    if (this.selectedEntryId() === id && this.selectedEntry()) {
      // Already viewing this entry; just ensure the reader is showing.
      this.rightColumnMode.set('reading');
      return;
    }
    this.selectedEntryId.set(id);
    this.selectedEntryLoading.set(true);
    this.selectedEntryError.set(false);
    this.rightColumnMode.set('reading');

    this.api.getEntry(id).subscribe({
      next: e => {
        this.selectedEntry.set(e);
        this.selectedEntryLoading.set(false);
      },
      error: () => {
        this.selectedEntryError.set(true);
        this.selectedEntryLoading.set(false);
      }
    });
  }

  returnToToday(): void {
    this.rightColumnMode.set('today');
    this.selectedEntryId.set(null);
    this.composeMood.set(null);
    this.composePrompt.set(null);
    this.composeSpark.set(null);
  }

  editSelectedEntry(): void {
    const id = this.selectedEntryId();
    if (!id) return;
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    if (isDesktop) {
      this.rightColumnMode.set('editing');
    } else {
      // Mobile: inline edit lands in Phase H. For now fall back to the page.
      this.router.navigate(['/entry', id, 'edit']);
    }
  }

  toggleSelectedFavorite(): void {
    const e = this.selectedEntry();
    if (!e) return;
    const optimistic = !e.isFavorited;
    this.selectedEntry.set({ ...e, isFavorited: optimistic });
    this.api.toggleFavorite(e.id).subscribe({
      next: res => this.selectedEntry.update(cur => cur ? { ...cur, isFavorited: res.isFavorited } : cur),
      error: () => this.selectedEntry.set(e) // revert
    });
  }

  expandSpark(): void {
    this.motivationExpanded.set(!this.motivationExpanded());
  }

  // ── Today panel compose handlers ───────────────────────────────
  // On desktop, switch the right column into composing mode and pass
  // the prompt/spark/mood context as inputs. On mobile, fall back to
  // the dedicated /entry/new page (mobile inline compose lands later).
  composeFromSpark(): void {
    const m = this.motivation();
    this.openCompose({ spark: m?.takeaway ?? null });
  }
  composeFromPrompt(prompt: string): void {
    this.openCompose({ prompt });
  }
  composeFromMood(mood: string): void {
    this.openCompose({ mood });
  }
  composeBlank(): void {
    this.openCompose({});
  }

  /**
   * Opens compose mode. On desktop the right column transforms into the
   * inline new-entry editor with the given context. On mobile we still
   * navigate to /entry/new with query params until Phase H wires inline
   * compose into the mobile layout.
   */
  private openCompose(ctx: { mood?: string; prompt?: string; spark?: string | null }): void {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    if (isDesktop) {
      this.composeMood.set(ctx.mood ?? null);
      this.composePrompt.set(ctx.prompt ?? null);
      this.composeSpark.set(ctx.spark ?? null);
      this.rightColumnMode.set('composing');
    } else {
      const queryParams: Record<string, string> = {};
      if (ctx.mood)   queryParams['mood']   = ctx.mood;
      if (ctx.prompt) queryParams['prompt'] = ctx.prompt;
      if (ctx.spark)  queryParams['spark']  = ctx.spark;
      this.router.navigate(['/entry/new'], { queryParams });
    }
  }

  /**
   * Called when the embedded NewEntryComponent emits `saved`. Returns to
   * the Today view and refreshes the entry list so the new entry shows up.
   */
  onComposeSaved(): void {
    this.composeMood.set(null);
    this.composePrompt.set(null);
    this.composeSpark.set(null);
    this.rightColumnMode.set('today');
    this.refreshEntries();
  }

  /** Called when the embedded EditEntryComponent emits `saved`. Reload the
   *  selected entry to reflect the saved changes, then go back to reading. */
  onEditSaved(): void {
    const id = this.selectedEntryId();
    if (id) {
      this.api.getEntry(id).subscribe({
        next: e => this.selectedEntry.set(e),
        error: () => {}
      });
    }
    this.rightColumnMode.set('reading');
    this.refreshEntries();
  }

  /** Called when the embedded EditEntryComponent emits `deleted`. Drop back
   *  to Today and refresh the entry list. */
  onEditDeleted(): void {
    this.selectedEntryId.set(null);
    this.selectedEntry.set(null);
    this.rightColumnMode.set('today');
    this.refreshEntries();
  }

  /** Cancel from edit goes back to reading the same entry. */
  returnToReading(): void {
    this.rightColumnMode.set('reading');
  }

  /** Reload the visible entry list so newly saved entries appear immediately. */
  private refreshEntries(): void {
    this.entries.set([]);
    this.loading.set(true);
    this.api.getEntries(undefined, false, undefined, 0, this.PAGE_SIZE).subscribe({
      next: list => {
        this.entries.set(list);
        this.hasMore.set(list.length === this.PAGE_SIZE);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  /**
   * Returns the entry's display headline for the dashboard list.
   * Prefers the title; falls back to the first ~80 characters of the
   * content preview (HTML stripped) so untitled entries still read
   * naturally. Returns "(Untitled)" only when there's truly nothing.
   */
  entryHeadline(entry: EntryListItem): string {
    const title = entry.title?.trim();
    if (title) return title;

    const raw = entry.contentPreview ?? '';
    if (raw) {
      const tmp = document.createElement('div');
      tmp.innerHTML = raw;
      const text = (tmp.textContent ?? tmp.innerText ?? '').trim();
      if (text) return text.length > 80 ? text.slice(0, 80).trimEnd() + '…' : text;
    }
    return '(Untitled)';
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
