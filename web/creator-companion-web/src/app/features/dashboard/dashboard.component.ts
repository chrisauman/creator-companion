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
import { ActionItemsCardComponent } from './action-items-card.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ActionItemsCardComponent],
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
      <aside class="sidebar">
        <!-- Logo -->
        <div class="sidebar__logo-wrap">
          <img src="logo-icon.png" alt="" class="sidebar__logo-icon">
          <span class="sidebar__logo-text">Creator Companion</span>
        </div>

        <!-- Streak block -->
        <div class="sidebar__streak-block" *ngIf="streak()">
          <div class="sidebar__streak-num">{{ streak()!.currentStreak }}</div>
          <div class="sidebar__streak-label">Day streak 🔥</div>
          @if (isPaid() && currentStreakMilestone()) {
            <div class="sidebar__milestone">
              {{ currentStreakMilestone()!.icon }} {{ currentStreakMilestone()!.title }}
            </div>
          }
          <div class="sidebar__streak-sub">
            Longest: {{ streak()!.longestStreak }} &nbsp;·&nbsp; {{ streak()!.totalEntries }} entries
          </div>
        </div>
        <div class="sidebar__streak-block sidebar__streak-block--loading" *ngIf="!streak()">
          <div class="sidebar__streak-num">—</div>
          <div class="sidebar__streak-label">Day streak</div>
        </div>

        <!-- Nav -->
        <nav class="sidebar__nav">
          <a class="sidebar__nav-item sidebar__nav-item--active" routerLink="/dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Journal
          </a>
          <a class="sidebar__nav-item" routerLink="/account">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            Account
          </a>
          <a *ngIf="isAdmin()" class="sidebar__nav-item" routerLink="/admin">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            Admin
          </a>
        </nav>

        <div class="sidebar__spacer"></div>

        <!-- Footer -->
        <div class="sidebar__footer">
          <div class="sidebar__avatar">{{ userInitial() }}</div>
          <span class="sidebar__username">{{ username() }}</span>
        </div>
      </aside>

      <!-- ── Mobile top nav ──────────────────────────────────── -->
      <header class="topnav">
        <div class="container topnav__inner">
          <img src="logo-full.png" alt="Creator Companion" class="topnav__logo-img">
          <div style="display:flex;gap:.5rem">
            <a class="nav-link" routerLink="/account">Account</a>
            <a *ngIf="isAdmin()" class="nav-link" routerLink="/admin">Admin</a>
          </div>
        </div>
      </header>

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

        <!-- Daily Reminders / Action Items card (paid users only) -->
        @if (isPaid() && showActionItems()) {
          <app-action-items-card />
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

    /* ── Desktop sidebar ─────────────────────────────────────────── */
    .sidebar {
      display: none;
    }
    @media (min-width: 768px) {
      .sidebar {
        display: flex;
        flex-direction: column;
        width: 260px;
        min-width: 260px;
        height: 100vh;
        position: sticky;
        top: 0;
        background: #111318;
        overflow-y: auto;
        padding: 1.5rem 0 1rem;
        flex-shrink: 0;
      }
    }

    /* Logo */
    .sidebar__logo-wrap {
      display: flex; align-items: center; gap: .625rem;
      padding: 0 1.25rem 1.25rem;
      border-bottom: 1px solid rgba(255,255,255,.07);
      margin-bottom: 1.25rem;
    }
    .sidebar__logo-icon { height: 28px; width: auto; }
    .sidebar__logo-text {
      font-size: .9375rem; font-weight: 800; color: #fff;
      letter-spacing: -.01em; line-height: 1;
    }

    /* Streak block */
    .sidebar__streak-block {
      margin: 0 .875rem 1.25rem;
      background: rgba(18,196,227,.1);
      border: 1px solid rgba(18,196,227,.2);
      border-radius: 10px;
      padding: 1.125rem 1.25rem;
    }
    .sidebar__streak-block--loading { opacity: .4; }
    .sidebar__streak-num {
      font-size: 3rem; font-weight: 900; line-height: 1;
      color: #12C4E3; font-family: var(--font-display);
      letter-spacing: -.03em;
    }
    .sidebar__streak-label {
      font-size: .8125rem; font-weight: 600;
      color: rgba(255,255,255,.7); margin-top: .25rem;
    }
    .sidebar__milestone {
      display: inline-flex; align-items: center; gap: .25rem;
      margin-top: .5rem;
      font-size: .6875rem; font-weight: 600;
      background: rgba(18,196,227,.15); color: #12C4E3;
      border: 1px solid rgba(18,196,227,.25);
      border-radius: 100px; padding: .2rem .6rem;
    }
    .sidebar__streak-sub {
      font-size: .75rem; color: rgba(255,255,255,.35);
      margin-top: .625rem; line-height: 1.5;
    }

    /* Nav */
    .sidebar__nav {
      display: flex; flex-direction: column;
      padding: 0 .625rem;
      gap: .125rem;
    }
    .sidebar__nav-item {
      display: flex; align-items: center; gap: .625rem;
      padding: .5625rem .875rem;
      font-size: .875rem; font-weight: 500;
      color: rgba(255,255,255,.4);
      border-radius: 7px;
      text-decoration: none;
      transition: background .15s, color .15s;
      svg { flex-shrink: 0; opacity: .7; }
      &:hover {
        background: rgba(255,255,255,.06);
        color: rgba(255,255,255,.8);
        text-decoration: none;
      }
    }
    .sidebar__nav-item--active {
      background: rgba(18,196,227,.12);
      color: #12C4E3; font-weight: 600;
      svg { opacity: 1; }
      &:hover { background: rgba(18,196,227,.18); color: #12C4E3; }
    }

    .sidebar__spacer { flex: 1; }

    /* Footer */
    .sidebar__footer {
      display: flex; align-items: center; gap: .625rem;
      padding: .875rem 1.25rem;
      border-top: 1px solid rgba(255,255,255,.07);
      margin-top: .5rem;
    }
    .sidebar__avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: #12C4E3; color: #fff;
      font-size: .75rem; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .sidebar__username {
      font-size: .8125rem; color: rgba(255,255,255,.4);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* ── Mobile top nav ──────────────────────────────────────────── */
    .topnav {
      position: sticky; top: 0; z-index: 100;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      height: var(--nav-h);
    }
    @media (min-width: 768px) {
      .topnav { display: none; }
    }
    .topnav__inner {
      display: flex; align-items: center;
      justify-content: space-between; height: 100%;
    }
    .topnav__logo-img { height: 28px; width: auto; display: block; }
    .nav-link {
      color: var(--color-accent); font-size: .9375rem;
      font-weight: 500; text-decoration: none;
      &:hover { text-decoration: underline; }
    }

    /* ── Main content ────────────────────────────────────────────── */
    .main-content {
      flex: 1;
      min-width: 0;
      padding: 1.5rem 1rem 4rem;
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

  username     = computed(() => this.tokens.getCachedUser()?.username ?? '');
  userInitial  = computed(() => (this.tokens.getCachedUser()?.username?.[0] ?? '?').toUpperCase());

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
  showActionItems = signal(true);
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

    this.api.getMe().subscribe({
      next: u => this.showActionItems.set(u.showActionItems),
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
