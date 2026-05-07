import { Component, inject, signal, computed, effect, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { TokenService } from '../../core/services/token.service';
import { StreakStats, EntryListItem, MotivationEntry, Entry } from '../../core/models/models';
import { getMoodEmoji } from '../../core/constants/moods';
import { MILESTONES, getMilestoneIndex, Milestone } from '../../core/constants/milestones';
import { PushService } from '../../core/services/push.service';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { SidebarStateService } from '../../shared/sidebar/sidebar-state.service';
import { MoodIconComponent } from '../../shared/mood-icon/mood-icon.component';
import { TodayPanelComponent } from './today-panel.component';
import { EntryReaderComponent } from './entry-reader.component';
import { NewEntryComponent } from '../entry/new/new-entry.component';
import { EditEntryComponent } from '../entry/edit/edit-entry.component';
import { NotificationsComponent } from '../notifications/notifications.component';
import { FavoriteSparksComponent } from '../favorite-sparks/favorite-sparks.component';
import { ActionItemsCardComponent } from './action-items-card.component';
import { StreakHistoryComponent } from './streak-history.component';
import { WelcomeBackComponent } from './welcome-back.component';
import { TrialBannerComponent } from '../../shared/trial-banner/trial-banner.component';
import { TourComponent } from '../../shared/tour/tour.component';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SidebarComponent, MoodIconComponent, TodayPanelComponent, EntryReaderComponent, NewEntryComponent, EditEntryComponent, NotificationsComponent, FavoriteSparksComponent, ActionItemsCardComponent, StreakHistoryComponent, WelcomeBackComponent, TrialBannerComponent, TourComponent],
  template: `
    <!-- First-run feature tour. Self-decides whether to render based
         on the cc_tour_seen localStorage flag. Can be re-triggered
         from the account page via TourComponent.reset() + reload. -->
    <app-tour></app-tour>

    <div class="dashboard">

      <!-- Welcome Back full-takeover overlay. Renders ABOVE everything
           else (z-index in component) so it functions as a moment, not
           a panel. Two trigger paths:
             - Admin preview (?preview=welcome-back)
             - Organic: streak just broke and user hasn't dismissed yet.
           Hides when the user picks any of the three escape paths
           (write, skip, view dashboard). -->
      @if (welcomeBackVisible()) {
        <app-welcome-back
          [preview]="previewMode() === 'welcome-back'"
          (writeOneSentence)="onWelcomeBackWrite()"
          (dismissed)="onWelcomeBackDismiss()"
        ></app-welcome-back>
      }

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
      <app-sidebar [active]="sidebarActive()" />

      <!-- ── Mobile bottom nav ───────────────────────────────── -->
      <!-- ── Main content ────────────────────────────────────── -->
      <main class="main-content">

        <!-- Trial countdown banner — visible only while the user is
             inside their 10-day trial. Self-renders or hides based on
             capabilities; safe to leave in template at all times. -->
        <app-trial-banner></app-trial-banner>

        <!-- Mobile header — hamburger | logo | "Create Entry" pill.
             Greeting + date moved into the drawer to make room. -->
        <div class="mobile-header">
          <button class="mobile-header__hamburger" type="button"
                  (click)="sidebarState.openMobile()"
                  title="Open menu" aria-label="Open menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <a class="mobile-header__logo" routerLink="/dashboard">
            <img src="logo-icon.png" alt="" class="mobile-header__logo-icon">
            <span class="mobile-header__logo-name">Creator Companion</span>
          </a>
          <button class="mobile-header__compose" type="button" (click)="composeBlank()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            <span>Create Entry</span>
          </button>
        </div>

        <!-- Streak module lives in the sidebar on every breakpoint —
             desktop has it pinned just below the logo; mobile shows it
             at the top of the slide-out drawer when the user opens it. -->


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

        <!-- Mobile-only Today panel — stacked above the entry list since
             the right column is hidden on phones. Shown only when in 'today'
             mode; reading/editing/composing on mobile still navigate. -->
        @if (rightColumnMode() === 'today') {
          <div class="today-panel--mobile-wrap">
            <app-today-panel
              [motivation]="motivation()"
              [canFavorite]="isPaid()"
              [previewThreatened]="previewMode() === 'threatened'"
              [previewDailyReminder]="previewMode() === 'daily-reminder'"
              (backlogYesterday)="onBacklogYesterday($event)"
              (composeFromPrompt)="composeFromPrompt($event)"
              (composeFromMood)="composeFromMood($event)"
              (composeBlank)="composeBlank()"
              (favoriteSpark)="toggleSparkFavorite()"
              (expandSpark)="expandSpark()"
            ></app-today-panel>
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
                <div class="entry-row__body">
                  <div class="entry-row__meta">
                    <span class="entry-row__date">{{ entryShortDate(entry) }}</span>
                    <span class="entry-row__mood" *ngIf="entry.mood">
                      <app-mood-icon [mood]="entry.mood" [size]="13"></app-mood-icon>
                      {{ entry.mood }}
                    </span>
                  </div>
                  <p class="entry-row__title">{{ entryHeadline(entry) }}</p>
                </div>
                @if (entry.firstImageUrl) {
                  <div class="entry-row__photo">
                    <img [src]="fullImageUrl(entry.firstImageUrl)"
                         [alt]="entry.title || ''"
                         loading="lazy"
                         (error)="onImgError($event)" />
                  </div>
                }
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
        <aside class="work__right-col" #rightCol>

          @switch (rightColumnMode()) {
            @case ('today') {
              <app-today-panel
                [motivation]="motivation()"
                [canFavorite]="isPaid()"
                [previewThreatened]="previewMode() === 'threatened'"
                [previewDailyReminder]="previewMode() === 'daily-reminder'"
                (backlogYesterday)="onBacklogYesterday($event)"
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
                [initialDate]="composeDate()"
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
            @case ('notifications') {
              <app-notifications
                [embedded]="true"
                (returnToToday)="returnToToday()"
              ></app-notifications>
            }
            @case ('favorites') {
              <app-favorite-sparks
                [embedded]="true"
                (returnToToday)="returnToToday()"
                (openEntryRequest)="openEntryFromFavorites($event)"
              ></app-favorite-sparks>
            }
            @case ('streak-history') {
              <app-streak-history
                (returnToToday)="returnToToday()"
              ></app-streak-history>
            }
            @case ('todos') {
              <div class="embedded-section">
                <div class="reader-top">
                  <div class="reader-top__inner">
                    <button class="cancel-pill" type="button" (click)="returnToToday()">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/>
                      </svg>
                      Today
                    </button>
                    <div class="reader-top__breadcrumb"></div>
                    <div class="reader-top__actions"></div>
                  </div>
                </div>
                <div class="embedded-section__body">
                  <app-action-items-card></app-action-items-card>
                </div>
              </div>
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

    /* ── Main content ────────────────────────────────────────────── */
    .main-content {
      flex: 1;
      min-width: 0;
      /* extra bottom padding = nav bar height + safe-area + breathing room */
      padding: 1rem 1.125rem calc(88px + env(safe-area-inset-bottom, 0px));
      background: var(--color-bg);
    }
    @media (min-width: 768px) {
      .main-content {
        /* No top padding — the search bar (left) and today-panel/
           reader-top (right) push themselves to the top of the
           viewport. Side padding is just enough breathing room from
           the sidebar's dark edge before the entry list starts. */
        padding: 0 1.25rem 4rem;
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

    /* The desktop stats strip and mobile streak card are gone — the
       streak module now lives in the sidebar at every breakpoint
       (see sidebar.component.ts). */

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
      /* Two equal-height columns, no rule line between them — the
         change in background color (paper → surface) on the right
         column already provides separation. The shared top bars
         (search-bar on the left, reader-top on the right) are sized
         to match (64px) and align horizontally. Each column scrolls
         independently. */
      .work {
        display: grid;
        grid-template-columns: minmax(340px, 400px) 1fr;
        gap: 0;
        align-items: stretch;
        /* Pull the right column flush with the page edge; the left
           column sits flush against the sidebar's content padding. */
        margin: 0 -1.25rem -4rem 0;
        height: 100vh;
        min-height: 600px;
      }
      .work__list-col {
        padding: 0 1.25rem 1rem 0;
        min-width: 0;
        overflow-y: auto;
      }
      .work__right-col {
        display: block;
        overflow-y: auto;
        background: var(--color-surface);
      }
    }

    /* The old motivation card is fully replaced by the Today panel's
       Spark hero — hide it everywhere now. */
    .motivation-card--mobile { display: none !important; }

    /* ── Mobile header (sticky on mobile) ─────────────────────────── */
    .mobile-header {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: 1rem 1.125rem;
      margin: -1rem -1.125rem 1rem;  /* counteract main-content padding so we span edge-to-edge */
      background: var(--color-bg);
      border-bottom: 1px solid var(--color-border);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    @media (min-width: 768px) {
      .mobile-header { display: none; }
    }
    .mobile-header__hamburger {
      width: 40px; height: 40px;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid var(--color-border);
      border-radius: 12px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 4px;
      padding: 0;
      cursor: pointer;
      transition: background .15s, border-color .15s;
    }
    .mobile-header__hamburger:hover {
      background: var(--color-surface-2);
      border-color: var(--color-text-3);
    }
    .mobile-header__hamburger span {
      display: block;
      width: 18px; height: 1.75px;
      background: var(--color-text);
      border-radius: 2px;
    }
    .mobile-header__logo {
      flex: 1;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      text-decoration: none;
      color: var(--color-text);
      padding: 0 .25rem;
      overflow: hidden;
    }
    .mobile-header__logo:hover { text-decoration: none; }
    .mobile-header__logo-icon {
      width: 26px; height: 26px;
      flex-shrink: 0;
      display: block;
    }
    .mobile-header__logo-name {
      font-family: var(--font-sans);
      font-size: .8125rem;
      font-weight: 700;
      letter-spacing: -.005em;
      color: var(--color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Hide the brand text on very narrow phones to make room. */
    @media (max-width: 360px) {
      .mobile-header__logo-name { display: none; }
    }
    /* Matches the canonical primary CTA across the app — black ink
       with white text; brand cyan + white text on hover. */
    .mobile-header__compose {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: #0c0e13;
      color: #fff;
      border: none;
      border-radius: 999px;
      padding: .5rem .875rem;
      font-family: var(--font-sans);
      font-size: .8125rem;
      font-weight: 700;
      cursor: pointer;
      transition: background .15s, transform .15s;
    }
    .mobile-header__compose:hover {
      background: var(--color-accent);
      color: #fff;
      transform: translateY(-1px);
    }

    /* ── Mobile-only Today panel wrapper (above entry list on phones) ── */
    .today-panel--mobile-wrap {
      margin-bottom: 1.5rem;
    }
    @media (min-width: 768px) {
      .today-panel--mobile-wrap { display: none; }
    }
    .today-panel--mobile-wrap app-today-panel {
      display: block;
    }
    /* Tighter padding for the Today panel when shown inline on mobile. */
    .today-panel--mobile-wrap ::ng-deep .today {
      padding: 0 !important;
      max-width: none !important;
      margin: 0 !important;
    }

    /* ── Embedded sections (Notifications / Todos / Favorites) ── */
    .embedded-section {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .embedded-section .reader-top {
      display: flex;
      align-items: stretch;
      height: 64px;
      background: var(--color-surface);
      position: sticky; top: 0;
      z-index: 5;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .embedded-section .reader-top__inner {
      display: flex;
      align-items: center;
      gap: .5rem;
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      padding: 0 2.5rem;
      box-sizing: border-box;
    }
    .embedded-section .cancel-pill {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: rgba(18,196,227,.1);
      color: var(--color-accent-dark);
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
    .embedded-section .cancel-pill:hover {
      background: var(--color-accent);
      color: #0c0e13;
      border-color: var(--color-accent);
    }
    .embedded-section .reader-top__breadcrumb {
      flex: 1;
      text-align: center;
      font-size: .8125rem;
      color: var(--color-text);
    }
    .embedded-section .reader-top__breadcrumb strong { color: var(--color-text); font-weight: 600; }
    .embedded-section .reader-top__actions {
      display: flex; gap: .5rem; flex-shrink: 0; min-width: 36px;
    }
    /* Body bounded to the same 760px max-width as the reader so the
       toolbar and content share horizontal edges. The wrapper itself
       is the centred article; children render inside it without any
       extra max-width / margin handling. */
    .embedded-section__body {
      flex: 1;
      overflow-y: auto;
    }
    .embedded-section__body::before {
      /* placeholder to keep the comment block grouped */
      content: none;
    }
    .embedded-section__body > * {
      width: 100%;
      max-width: 760px;
      margin-left: auto;
      margin-right: auto;
      padding-left: 2.5rem;
      padding-right: 2.5rem;
      box-sizing: border-box;
    }
    .embedded-section__body > *:first-child { margin-top: .75rem; }
    .embedded-section__body > *:last-child { margin-bottom: 2rem; }
    .embedded-section__body .page-header { margin-bottom: 1rem; }
    /* Match the right-column display ramp — same as the Daily Spark
       hero quote and the Notifications page-title. */
    .embedded-section__body .page-title {
      font-family: var(--font-sans);
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -.01em;
      line-height: 1.3;
      color: var(--color-text);
      margin: 0 0 .25rem;
    }
    .embedded-section__body .page-sub {
      font-size: .8125rem;
      color: var(--color-text-2);
      margin: 0;
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

    /* ── Search bar (modern pill style) ─────────────────────────── */
    .search-bar {
      display: flex; align-items: center; gap: .5rem;
      margin-top: 1rem; margin-bottom: .5rem;
    }
    /* On desktop, the search bar sits at the top of the entry-list
       column and aligns with the reader-top (64px) on the right column.
       Both panes share a bottom hairline for a continuous header rule. */
    @media (min-width: 768px) {
      .search-bar {
        margin: 0;
        height: 64px;
        padding: 0;
        box-sizing: border-box;
        flex-shrink: 0;
        position: sticky;
        top: 0;
        background: #f7f7f5;
        z-index: 4;
      }
    }
    .search-input-wrap { flex: 1; position: relative; display: flex; align-items: center; }
    .search-icon {
      position: absolute; left: 1rem;
      width: 1rem; height: 1rem; color: var(--color-text-3); pointer-events: none;
    }
    .search-input {
      width: 100%;
      padding: .625rem 1rem .625rem 2.5rem;
      border: 1px solid var(--color-border);
      border-radius: 999px;
      background: var(--color-surface);
      color: var(--color-text);
      font-size: .875rem;
      font-family: var(--font-sans);
      box-sizing: border-box;
      transition: border-color .15s, background .15s, box-shadow .15s;
    }
    .search-input::placeholder { color: var(--color-text-3); }
    .search-input:hover { border-color: var(--color-text-3); }
    .search-input:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(18,196,227,.12);
    }
    .search-clear {
      position: absolute; right: .75rem;
      background: var(--color-surface-2);
      border: none;
      cursor: pointer;
      color: var(--color-text-2);
      width: 22px; height: 22px;
      border-radius: 50%;
      display: grid; place-items: center;
      font-size: .875rem; line-height: 1;
      padding: 0;
      transition: background .15s, color .15s;
    }
    .search-clear:hover { color: var(--color-text); background: var(--color-border); }
    .sort-select {
      padding: .625rem 2.25rem .625rem 1rem;
      border: 1px solid var(--color-border);
      border-radius: 999px;
      background: var(--color-surface);
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239099a5' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 1rem center;
      color: var(--color-text);
      font-size: .8125rem;
      font-weight: 500;
      font-family: var(--font-sans);
      cursor: pointer;
      flex-shrink: 0;
      appearance: none;
      transition: border-color .15s;
    }
    .sort-select:hover { border-color: var(--color-text-3); }
    .sort-select:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(18,196,227,.12);
    }
    .search-results-count { font-size: .75rem; color: var(--color-text-3); margin: 0 0 .75rem; }

    /* ── Entry list ──────────────────────────────────────────────── */
    .date-divider {
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-text-3);
      padding: 0 0 .5rem;
      /* Breathing room above; a full rem of space below the rule
         before the first entry starts. */
      margin: 1.75rem 0 1rem;
      border-bottom: 1px solid var(--color-border);
    }
    .date-divider--first { margin-top: .5rem; }

    /* ── Entry row (Variant B — meta · title · photo) ──────────── */
    .entry-row {
      display: block;
      margin-bottom: .75rem;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 16px;
      overflow: hidden;
      cursor: pointer;
      transition: border-color .15s, box-shadow .15s, transform .15s;
    }
    /* Hover highlight tinted brand cyan instead of grey — keeps
       hover and active states feeling like the same family. */
    .entry-row:hover {
      border-color: rgba(18,196,227,.45);
      box-shadow: 0 6px 20px -10px rgba(18,196,227,.25);
    }
    .entry-row--active {
      border-color: var(--color-accent);
      background: rgba(18,196,227,.04);
      box-shadow: -3px 0 0 0 var(--color-accent), 0 6px 20px -10px rgba(18,196,227,.2);
    }
    .entry-row--active:hover {
      border-color: var(--color-accent);
    }

    .entry-row__body {
      padding: 1rem 1.25rem .875rem;
    }
    .entry-row__meta {
      display: flex;
      align-items: center;
      gap: .75rem;
      flex-wrap: wrap;
      margin-bottom: .5rem;
    }
    /* Matches the right-column eyebrow treatment (e.g. "YOUR DAILY
       SPARK"): small, all-caps, tracked, brand cyan. */
    .entry-row__date {
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-accent);
    }
    /* Mood pushed to the right edge of the meta row so the entry
       reads as: date · ─ · mood. */
    .entry-row__mood {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      font-size: .75rem;
      color: var(--color-text-2);
    }
    .entry-row__mood app-mood-icon { color: var(--color-text-3); }
    /* Compact bold list title — small enough to scan a vertical
       stack of entries quickly, weighty enough to anchor the eye
       below the cyan date eyebrow. Pairs with the larger 1.625rem
       reading title in column 3 (same weight, bigger size). */
    .entry-row__title {
      font-family: var(--font-sans);
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.35;
      color: var(--color-text);
      margin: 0;
      letter-spacing: -.01em;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }

    /* Photo: full-width, capped max-height. Vertical photos show their
       full natural orientation up to the cap; bottom is clipped only
       for very tall photos so the entry row stays a reasonable size. */
    .entry-row__photo {
      width: 100%;
      max-height: 480px;
      overflow: hidden;
      background: var(--color-bg);
      display: block;
    }
    .entry-row__photo img {
      width: 100%;
      height: auto;
      display: block;
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
  private route  = inject(ActivatedRoute);
  sidebarState   = inject(SidebarStateService);

  isAdmin = this.tokens.isAdmin.bind(this.tokens);


  readonly PAGE_SIZE = 60;

  showPushNudge   = signal(false);
  pushNudgeWorking = signal(false);

  streak     = signal<StreakStats | null>(null);
  isPaid     = signal(false);
  showCelebration    = signal(false);
  celebrationMilestone = signal<Milestone | null>(null);

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

  /** First name used in the greeting ("Good morning, Chris"). */
  private displayName(): string {
    return this.tokens.getCachedUser()?.firstName ?? '';
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

  // ── Right column state (desktop): Today / Reading / Composing / Editing /
  //                                   Notifications / Todos / Favorites
  rightColumnMode      = signal<'today' | 'reading' | 'composing' | 'editing' | 'notifications' | 'todos' | 'favorites' | 'streak-history'>('today');

  /**
   * Which sidebar nav item should show the active state. Derived from
   * `rightColumnMode()` so when the user clicks "To Do List" / "Reminders"
   * / "Favorites" in the sidebar (which swaps column 3 without
   * changing the route), the active highlight follows the visible
   * surface — not stuck on "Journal" forever. Streak-history isn't a
   * sidebar nav item itself, so it falls through to "dashboard" (the
   * Journal item, which is the closest parent context).
   */
  sidebarActive = computed<'dashboard' | 'notifications' | 'todos' | 'favorites' | 'account' | 'admin'>(() => {
    const mode = this.rightColumnMode();
    if (mode === 'notifications') return 'notifications';
    if (mode === 'todos')         return 'todos';
    if (mode === 'favorites')     return 'favorites';
    return 'dashboard';
  });

  /**
   * Admin-only preview state. Set via `?preview=welcome-back` or
   * `?preview=threatened` query params on /dashboard. Drives temporary
   * UI overlays for QA — Welcome Back full-takeover and the streak-
   * threatened banner — so we can review those surfaces without
   * actually breaking a real streak. NEVER fires for non-admin users
   * (the admin gate is checked in applyPreviewQueryParam below). Always
   * read-only: no API writes, no streak/data changes.
   */
  previewMode = signal<'none' | 'welcome-back' | 'threatened' | 'daily-reminder'>('none');

  /**
   * Per-session dismissal flag for the Welcome Back overlay. Once the
   * user picks any escape path (write / skip / view dashboard) we set
   * this to true so the overlay doesn't pop back when streak data
   * refreshes. Persistent dismissal across sessions is keyed in
   * localStorage by the last entry date (see welcomeBackVisible).
   */
  private welcomeBackDismissed = signal(false);

  /**
   * Whether the Welcome Back overlay should currently render. Two paths
   * lead here:
   *   1. Preview — admin loaded `?preview=welcome-back` and hasn't
   *      dismissed in-session.
   *   2. Organic — currentStreak is 0, the user has at least one
   *      previous streak (longestStreak > 0), and they haven't
   *      already dismissed this specific break (key = lastEntryDate).
   */
  welcomeBackVisible = computed<boolean>(() => {
    if (this.welcomeBackDismissed()) return false;
    if (this.previewMode() === 'welcome-back') return true;

    const s = this.streak();
    if (!s) return false;
    if (s.currentStreak !== 0) return false;       // streak alive — nothing to welcome back from
    if ((s.longestStreak ?? 0) <= 0) return false; // no past chapter to celebrate

    // Persistent dismissal key — user shouldn't see Welcome Back twice
    // for the same break. lastEntryDate is the end-day of the chapter
    // that just ended; it changes when a new break occurs.
    const userId = this.tokens.getUserId() ?? 'anon';
    const stamp  = s.lastEntryDate ?? 'none';
    try {
      const key = `cc_welcome_back_seen_${userId}_${stamp}`;
      if (localStorage.getItem(key) === '1') return false;
    } catch { /* private mode / quota — fall through, just show it again */ }

    return true;
  });
  selectedEntryId      = signal<string | null>(null);
  selectedEntry        = signal<Entry | null>(null);
  selectedEntryLoading = signal<boolean>(false);
  selectedEntryError   = signal<boolean>(false);

  // ── Compose context — passed to the embedded NewEntryComponent
  composeMood   = signal<string | null>(null);
  composePrompt = signal<string | null>(null);
  composeSpark  = signal<string | null>(null);
  /** ISO date (yyyy-MM-dd) the composer should pre-select. Set to
   *  yesterday by the threatened banner's "Write yesterday's entry"
   *  CTA so the user can backlog the missed day. Cleared on compose
   *  return / save like the other compose-context signals. */
  composeDate   = signal<string | null>(null);

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
    this.applySectionQueryParam();

    // Re-apply section param on subsequent navigations (e.g. user clicks
    // a sidebar nav item while already on /dashboard).
    this.route.queryParamMap.subscribe(() => this.applySectionQueryParam());

    // Sidebar logo click → reset to today view (mirrors the Today pill
    // in the right column). The router won't re-fire a navigation when
    // we're already on /dashboard, so we listen explicitly here.
    this.sidebarState.returnToTodayRequest$.subscribe(() => this.returnToToday());

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

  /** Public bridge for the embedded Favorites view: when the user
   *  clicks an entry card in column 3's Favorites list, swap the
   *  column to the entry reader for that ID. Wraps the private
   *  selectEntry so external callers don't need to reach in. */
  openEntryFromFavorites(id: string): void {
    this.selectEntry(id);
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

  /** Right-column scroll container ref. Used to reset scroll-to-top
   *  when the column's mode changes (e.g. after saving an entry, the
   *  Today panel re-renders and could otherwise inherit the prior
   *  scroll position from the composer/reader, leaving the user
   *  mid-column instead of at the eyebrow). */
  @ViewChild('rightCol') rightColRef?: ElementRef<HTMLElement>;

  /** Reset right-column scroll. Defer one frame so the new mode's
   *  template has rendered before we measure/set scrollTop. */
  private scrollRightColumnToTop(): void {
    queueMicrotask(() => {
      const el = this.rightColRef?.nativeElement;
      if (el) el.scrollTop = 0;
    });
  }

  returnToToday(): void {
    this.rightColumnMode.set('today');
    this.selectedEntryId.set(null);
    this.composeMood.set(null);
    this.composePrompt.set(null);
    this.composeSpark.set(null);
    this.composeDate.set(null);
    this.scrollRightColumnToTop();
    // Strip the ?section= query param if present so the URL reflects state.
    if (this.route.snapshot.queryParamMap.has('section')) {
      this.router.navigate(['/dashboard'], { queryParams: { section: null }, queryParamsHandling: 'merge' });
    }
  }

  /**
   * Reads ?section= from the URL and switches the right column to the
   * matching embedded view. Sidebar nav items navigate to /dashboard
   * with this param so users never leave the dashboard on desktop.
   */
  private applySectionQueryParam(): void {
    const params = this.route.snapshot.queryParamMap;
    const section = params.get('section');
    const compose = params.get('compose');
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    if (!isDesktop) return;

    // ?compose=1 → open inline compose with no prompt context, then strip
    // the param so the URL doesn't re-trigger compose on back/forward.
    if (compose === '1') {
      this.openCompose({});
      this.router.navigate(['/dashboard'], { replaceUrl: true });
      return;
    }

    if (section === 'notifications')       this.rightColumnMode.set('notifications');
    else if (section === 'todos')          this.rightColumnMode.set('todos');
    else if (section === 'favorites')      this.rightColumnMode.set('favorites');
    else if (section === 'streak-history') this.rightColumnMode.set('streak-history');
    else if (!section)                     { /* no-op; keep current mode */ }

    // Preview mode: admin-only escape hatch for previewing emotional
    // UI overlays without breaking a real streak. Silently ignored for
    // non-admin users so it never leaks to regular accounts.
    const preview = params.get('preview');
    if (preview && this.tokens.isAdmin()) {
      if (preview === 'welcome-back')        this.previewMode.set('welcome-back');
      else if (preview === 'threatened')     this.previewMode.set('threatened');
      else if (preview === 'daily-reminder') this.previewMode.set('daily-reminder');
    }
  }

  /** Dismiss the active preview overlay and clear the URL param so a
   *  refresh / share / back-button doesn't re-trigger it. */
  dismissPreview(): void {
    this.previewMode.set('none');
    this.router.navigate(['/dashboard'], { queryParams: { preview: null }, queryParamsHandling: 'merge' });
  }

  /** Welcome Back primary CTA — open the entry composer in the right
   *  column. We don't enforce "one sentence" — that's framing copy.
   *  Same composer as everywhere else, no special mode. */
  onWelcomeBackWrite(): void {
    this.markWelcomeBackSeen();
    this.welcomeBackDismissed.set(true);
    if (this.previewMode() === 'welcome-back') this.dismissPreview();
    this.openCompose({});
  }

  /** Welcome Back skip / view dashboard — hide the overlay, persist
   *  the dismissal so it doesn't return for this break. Both copy
   *  links route here for parity. */
  onWelcomeBackDismiss(): void {
    this.markWelcomeBackSeen();
    this.welcomeBackDismissed.set(true);
    if (this.previewMode() === 'welcome-back') this.dismissPreview();
  }

  /** Persists "user has seen Welcome Back for this break" in localStorage
   *  keyed by lastEntryDate, so future loads of the same break don't
   *  re-trigger it. Skipped in preview mode (we want preview to be
   *  re-runnable). */
  private markWelcomeBackSeen(): void {
    if (this.previewMode() === 'welcome-back') return;
    const s = this.streak();
    if (!s?.lastEntryDate) return;
    const userId = this.tokens.getUserId() ?? 'anon';
    try {
      localStorage.setItem(`cc_welcome_back_seen_${userId}_${s.lastEntryDate}`, '1');
    } catch { /* private mode / quota — silently skip */ }
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
  // the prompt/mood context as inputs. On mobile, fall back to the
  // dedicated /entry/new page (mobile inline compose lands later).
  // The spark CTA was removed from the spark hero — users start
  // entries from the sidebar's New Entry button or the prompt/mood
  // rows below the spark.
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
  private openCompose(ctx: { mood?: string; prompt?: string; spark?: string | null; date?: string | null }): void {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    if (isDesktop) {
      this.composeMood.set(ctx.mood ?? null);
      this.composePrompt.set(ctx.prompt ?? null);
      this.composeSpark.set(ctx.spark ?? null);
      this.composeDate.set(ctx.date ?? null);
      this.rightColumnMode.set('composing');
    } else {
      const queryParams: Record<string, string> = {};
      if (ctx.mood)   queryParams['mood']   = ctx.mood;
      if (ctx.prompt) queryParams['prompt'] = ctx.prompt;
      if (ctx.spark)  queryParams['spark']  = ctx.spark;
      if (ctx.date)   queryParams['date']   = ctx.date;
      this.router.navigate(['/entry/new'], { queryParams });
    }
  }

  /**
   * Threatened-banner CTA: "Log your progress." Opens the inline
   * composer with yesterday's date pre-set so the user can backlog
   * the missed day in one step. Banner emits the ISO date; we forward
   * it. In preview mode, also clears the preview overlay + URL param.
   */
  onBacklogYesterday(yesterdayIso: string): void {
    if (this.previewMode() === 'threatened') this.dismissPreview();
    this.openCompose({ date: yesterdayIso });
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
    this.scrollRightColumnToTop();
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
    this.scrollRightColumnToTop();
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
   * "Sun · 9:14 AM" — short date eyebrow shown above the title on each
   * entry row. Day-of-week comes from entryDate (the day the entry is
   * for); time comes from createdAt (when it was actually written).
   */
  entryShortDate(entry: EntryListItem): string {
    return new Date(entry.entryDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
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
