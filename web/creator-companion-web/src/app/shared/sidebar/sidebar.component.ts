import { Component, DestroyRef, ElementRef, Input, OnInit, ViewChild, effect, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { TokenService } from '../../core/services/token.service';
import { AuthService } from '../../core/services/auth.service';
import { ViewportService } from '../../core/services/viewport.service';
import { StreakStats } from '../../core/models/models';
import { SidebarStateService } from './sidebar-state.service';
import { JournalFilterService } from '../../core/services/journal-filter.service';
import { StreakRefreshService } from '../../core/services/streak-refresh.service';
import { FormsModule } from '@angular/forms';
import { TierIconComponent } from '../tier-icon/tier-icon.component';
import { getMilestoneProgress, MilestoneProgress } from '../../core/constants/milestones';

const COLLAPSE_KEY = 'cc_sidebar_collapsed';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TierIconComponent],
  template: `
    <!-- Backdrop: visible only when the mobile drawer is open. Click to close. -->
    @if (mobileOpen()) {
      <div class="sidebar-backdrop" (click)="closeMobile()"></div>
    }
    <aside class="sidebar"
           [class.sidebar--collapsed]="collapsed()"
           [class.sidebar--mobile-open]="mobileOpen()">

      <!-- Top of sidebar.
           Expanded: logo + wordmark on the left (clicking still goes
           home), with a panel-toggle button on the right that's
           hidden until the user hovers anywhere on the top row.
           Collapsed: a single button shows the logo icon by default
           and swaps to the panel-toggle icon on hover, signaling
           that clicking will expand the sidebar back. -->
      <div class="sidebar__top" [class.sidebar__top--collapsed]="collapsed()">
        @if (!collapsed()) {
          <!-- Logo icon doubles as the collapse trigger — clicking it
               folds the sidebar. The wordmark next to it stays as the
               brand label (not a link); "go home" duty belongs to the
               Journal nav item below. The earlier hover-revealed
               panel-toggle button was too hidden to be discoverable
               so it's gone — the icon itself is now the affordance. -->
          <!-- Whole logo (icon + wordmark) is one button — clicking
               anywhere on it collapses the sidebar. Hover reveals a
               small panel-toggle SVG on the right edge as the visual
               affordance; no background fill / pill hover. -->
          <button class="sidebar__logo-btn"
                  type="button"
                  (click)="onLogoClick()"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar">
            <img src="logo-icon.png" alt="" class="sidebar__logo-icon">
            <span class="sidebar__logo-text">Creator Companion</span>
            <svg class="sidebar__logo-toggle"
                 width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                 aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2"/>
              <line x1="9" y1="4" x2="9" y2="20"/>
            </svg>
          </button>
          <!-- Mobile: explicit close (X) button. Hidden on desktop. -->
          <button class="sidebar__close-mobile"
                  type="button"
                  (click)="closeMobile()"
                  title="Close menu"
                  aria-label="Close menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        } @else {
          <!-- Collapsed: single button with hover-swap. Logo icon by
               default; panel-toggle SVG on hover to signal expand. -->
          <button class="sidebar__expand-toggle"
                  type="button"
                  (click)="toggleCollapsed()"
                  title="Open sidebar"
                  aria-label="Open sidebar">
            <img src="logo-icon.png" alt="Creator Companion"
                 class="sidebar__expand-toggle-default">
            <svg class="sidebar__expand-toggle-hover"
                 width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2"/>
              <line x1="9" y1="4" x2="9" y2="20"/>
            </svg>
          </button>
        }
      </div>

      <!-- New Entry button (cyan; full pill expanded, just + icon
           collapsed). When the user is in read-only mode (trial
           expired + no subscription, OR admin paywall preview) we
           swap the routerLink for a plain button that shows a small
           Subscribe-to-unlock tooltip. We don't outright remove the
           CTA — leaving the visual anchor in place reminds the user
           where their primary action used to live and what they get
           back by subscribing. -->
      <!-- Compose + Search row. The two share one flex container so
           the search icon button sits flush to the right of the
           compose pill instead of dropping to the next row. The
           compose pill stretches (flex:1) and the search button is
           a fixed 40×40 square. On collapsed desktop sidebar, only
           the compose icon shows (no search button) to keep that
           mode minimal. -->
      <div class="sidebar__compose-row" [class.sidebar__compose-row--collapsed]="collapsed()">
        @if (readOnly()) {
          <button class="sidebar__compose sidebar__compose--locked"
                  [class.sidebar__compose--collapsed]="collapsed()"
                  type="button"
                  disabled
                  title="Subscribe to unlock writing">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2"/>
              <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            </svg>
            <span class="sidebar__compose-label" *ngIf="!collapsed()">Subscribe to unlock</span>
          </button>
        } @else {
          <a class="sidebar__compose"
             [class.sidebar__compose--collapsed]="collapsed()"
             [routerLink]="['/dashboard']"
             [queryParams]="{compose: 1}"
             [title]="collapsed() ? 'Create entry' : null">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.4" stroke-linecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <span class="sidebar__compose-label" *ngIf="!collapsed()">Create Entry</span>
          </a>
        }

        <!-- Search icon button — toggles the inline filter panel.
             Hidden in the collapsed desktop sidebar to keep that
             mode minimal (Cmd+K still works there). Active state
             when the panel is open so the affordance feels like a
             tab the user can collapse back. -->
        @if (!collapsed()) {
          <button class="sidebar__search"
                  type="button"
                  [class.sidebar__search--active]="filter.panelOpen()"
                  (click)="filter.toggle()"
                  [title]="filter.panelOpen() ? 'Close search (⌘K)' : 'Search entries (⌘K)'"
                  [attr.aria-label]="filter.panelOpen() ? 'Close search' : 'Search entries'"
                  [attr.aria-expanded]="filter.panelOpen()">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd"/>
            </svg>
          </button>
        }
      </div>

      <!-- Inline filter panel. Expands directly below the compose row,
           pushing the nav items down. Contains the search input + a
           sort segmented control. On mobile (drawer open), pressing
           Enter in the search input OR tapping a sort button closes
           the drawer so the user sees the filtered entries behind. -->
      @if (filter.panelOpen() && !collapsed()) {
        <div class="sidebar__filter-panel">
          <div class="sidebar__filter-input-wrap">
            <input class="sidebar__filter-input"
                   type="text"
                   placeholder="Search"
                   autocomplete="off"
                   autocorrect="off"
                   autocapitalize="off"
                   spellcheck="false"
                   [ngModel]="filter.query()"
                   (ngModelChange)="filter.query.set($event)"
                   (keydown.enter)="commitFilterAction()"
                   #filterInput />
            <!-- One-click clear. Shown only when the query is non-empty
                 so the field reads as plain when there's nothing to
                 clear. Resets the active filter immediately (entries
                 list reverts to all). Refocuses the input so the user
                 can keep typing a new query without an extra tap. -->
            @if (filter.query()) {
              <button type="button"
                      class="sidebar__filter-clear"
                      (click)="clearFilterQuery()"
                      title="Clear search"
                      aria-label="Clear search">
                ×
              </button>
            }
          </div>

          <div class="sidebar__filter-sort" role="group" aria-label="Sort entries">
            <button type="button"
                    class="sidebar__filter-sort-btn"
                    [class.sidebar__filter-sort-btn--active]="filter.sort() === 'newest'"
                    (click)="filter.sort.set('newest'); commitFilterAction()">
              Newest
            </button>
            <button type="button"
                    class="sidebar__filter-sort-btn"
                    [class.sidebar__filter-sort-btn--active]="filter.sort() === 'oldest'"
                    (click)="filter.sort.set('oldest'); commitFilterAction()">
              Oldest
            </button>
            <button type="button"
                    class="sidebar__filter-sort-btn"
                    [class.sidebar__filter-sort-btn--active]="filter.sort() === 'favorites'"
                    (click)="filter.sort.set('favorites'); commitFilterAction()">
              Favorites
            </button>
          </div>
        </div>
      }

      <!-- Nav -->
      <nav class="sidebar__nav">
        <!-- Each nav link uses an explicit (click) handler that closes
             the drawer AND programmatically navigates. The earlier
             [routerLink] + (click)="closeMobile()" combo had a race
             on iOS where the click sometimes fired but the navigation
             didn't, leaving the user stuck on the same page with the
             drawer half-closed. The explicit handler is the source of
             truth — routerLink stays for the right-click "open in new
             tab" affordance on desktop and active-state styling. -->
        <a class="sidebar__nav-item sidebar__nav-item--journal"
           [class.sidebar__nav-item--active]="active === 'dashboard'"
           routerLink="/dashboard"
           (click)="goJournal($event)"
           [title]="collapsed() ? 'Journal' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <span class="sidebar__nav-label">Journal</span>
        </a>
        <a class="sidebar__nav-item sidebar__nav-item--reminders"
           [class.sidebar__nav-item--active]="active === 'notifications'"
           [routerLink]="sectionLink('notifications')"
           [queryParams]="sectionQueryParams('notifications')"
           (click)="goSection('notifications', $event)"
           [title]="collapsed() ? 'Reminders' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="sidebar__nav-label">Reminders</span>
        </a>
        <a class="sidebar__nav-item sidebar__nav-item--todos"
           [class.sidebar__nav-item--active]="active === 'todos'"
           [routerLink]="sectionLink('todos')"
           [queryParams]="sectionQueryParams('todos')"
           (click)="goSection('todos', $event)"
           [title]="collapsed() ? 'To Do List' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <span class="sidebar__nav-label">To Do List</span>
        </a>
        <a *ngIf="hasFavoriteSparks()"
           class="sidebar__nav-item"
           [class.sidebar__nav-item--active]="active === 'favorites'"
           [routerLink]="sectionLink('favorites')"
           [queryParams]="sectionQueryParams('favorites')"
           (click)="goSection('favorites', $event)"
           [title]="collapsed() ? 'Favorites' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span class="sidebar__nav-label">Favorites</span>
        </a>
        <!-- Support (Help and FAQ) — placed after Favorites per the
             May 2026 IA pass. Always visible (no *ngIf guard) since
             every user benefits from quick access to the FAQ. The
             SupportComponent currently passes active=dashboard to its
             own sidebar instance, so no active-state binding here
             until a dedicated active=support value is added in a
             future cleanup. -->
        <a class="sidebar__nav-item sidebar__nav-item--support"
           routerLink="/support"
           (click)="goSupport($event)"
           [title]="collapsed() ? 'Support' : null">
          <!-- Help/circle-question icon, single-stroke to match the
               other sidebar items. -->
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span class="sidebar__nav-label">Support</span>
        </a>
        <a *ngIf="isAdmin()"
           class="sidebar__nav-item"
           [class.sidebar__nav-item--active]="active === 'admin'"
           routerLink="/admin"
           (click)="goAdmin($event)"
           [title]="collapsed() ? 'Admin' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
          <span class="sidebar__nav-label">Admin</span>
        </a>
      </nav>

      <div class="sidebar__spacer"></div>

      <!-- Streak module (Layout 1 — sits just above the user-card
           footer, no rule lines around it, pushed to the bottom by
           the spacer above). Hidden when the sidebar is collapsed
           since there's no room for the progress bar or footnote at
           64px wide. -->
      <div class="sidebar__streak" *ngIf="!collapsed() && streak()">
        <ng-container *ngIf="progressToNext() as p">
          <div class="sidebar__streak-row">
            <div class="sidebar__streak-num-wrap">
              <span class="sidebar__streak-num">{{ streak()!.currentStreak }}</span>
              <span class="sidebar__streak-unit">day streak</span>
            </div>
            <span *ngIf="p.current"
                  class="sidebar__streak-tier"
                  [class.sidebar__streak-tier--top]="p.isAtTopTier">
              <app-tier-icon [tier]="p.current.title" [size]="11"></app-tier-icon>
              {{ p.current.title }}
            </span>
          </div>

          <div class="sidebar__streak-bar"
               *ngIf="!p.isAtTopTier && p.next">
            <div class="sidebar__streak-bar-fill" [style.width.%]="p.percentToNext"></div>
          </div>

          <div class="sidebar__streak-foot">
            <span *ngIf="p.next && !p.isAtTopTier">
              <strong>{{ p.daysToNext }}</strong> to {{ p.next.title }}
            </span>
            <span *ngIf="p.isAtTopTier" class="sidebar__streak-foot--top">
              Top tier — keep going
            </span>
            <span *ngIf="streak()!.longestStreak > 0" class="sidebar__streak-best">
              Best <strong>{{ streak()!.longestStreak }}</strong>
              <!-- Quiet text link to the Streak History view in column 3.
                   Pinned next to the personal-best number because that's
                   the natural "I want to see more about my streaks"
                   moment. Works on desktop (swaps column 3) and mobile
                   (routes to the standalone notifications-style page —
                   for now this falls back to the dashboard with the
                   query param; future: dedicated /streaks route). -->
              ·
              <a [routerLink]="sectionLink('streak-history')"
                 [queryParams]="sectionQueryParams('streak-history')"
                 class="sidebar__streak-history-link"
                 (click)="goSection('streak-history', $event)">
                History →
              </a>
            </span>
          </div>
        </ng-container>
      </div>

      <!-- Footer: avatar + name + (account / logout) icons all in one
           inline row. Click on the avatar/name routes to /account; the
           gear and door are explicit shortcuts. -->
      <div class="sidebar__footer-wrap">
        <a class="sidebar__usercard"
           routerLink="/account"
           [class.sidebar__usercard--active]="active === 'account'"
           [title]="collapsed() ? displayName() : null">
          <div class="sidebar__avatar"
               [style.background-image]="profileImageUrl() ? 'url(' + profileImageUrl() + ')' : null"
               [class.sidebar__avatar--photo]="!!profileImageUrl()">
            <span *ngIf="!profileImageUrl()">{{ userInitial() }}</span>
          </div>
          <div class="sidebar__user-name">{{ displayName() }}</div>
        </a>

        <div class="sidebar__footer-actions">
          <a class="sidebar__icon-btn"
             routerLink="/account"
             title="Account &amp; settings"
             aria-label="Account and settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </a>
          <button class="sidebar__icon-btn"
                  type="button"
                  (click)="logout($event)"
                  title="Sign out"
                  aria-label="Sign out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

    </aside>
  `,
  styles: [`
    /* ── Mobile drawer (< 768px) ─────────────────────────────────── */
    .sidebar {
      display: flex;
      flex-direction: column;
      width: 280px;
      max-width: 85vw;
      /* iOS Safari/Chrome's URL bar eats into 100vh, clipping the
         bottom of the drawer (Sign Out, History link, etc.). dvh
         tracks the *visible* viewport so the drawer ends where the
         URL bar starts. Fallback to vh for older browsers. */
      height: 100vh;
      height: 100dvh;
      background: #111318;
      overflow-y: auto;
      overflow-x: hidden;
      /* Both top + bottom pads account for iOS safe-areas:
          - top inset clears the Dynamic Island / notch / status bar,
            so the logo + X close button are fully visible and tappable
            when the drawer slides in. Without it, the X sat behind
            the system controls and couldn't be tapped reliably.
          - bottom inset clears the home indicator so the last nav
            item (or scroll target) isn't hidden behind it.
         The 0px fallback is for non-iOS browsers where env() returns
         empty — the base 1.25rem / 1rem still applies. */
      padding: calc(env(safe-area-inset-top, 0px) + 1.25rem) 0 calc(1rem + env(safe-area-inset-bottom, 0px));
      position: fixed;
      top: 0;
      left: 0;
      z-index: 200;
      transform: translateX(-100%);
      transition: transform .25s ease, width .25s ease, min-width .25s ease;
      box-shadow: 0 0 30px rgba(0,0,0,.4);
      -webkit-overflow-scrolling: touch;
    }
    .sidebar--mobile-open { transform: translateX(0); }

    .sidebar-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.4);
      z-index: 199;
      animation: fadeIn .15s ease forwards;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    /* Don't show desktop panel-toggle on mobile — irrelevant. The
       drawer has an explicit X close button; there's no collapsed
       state on mobile, so the hover-revealed collapse glyph next to
       the logo is just visual noise. */
    @media (max-width: 767px) {
      .sidebar__panel-toggle { display: none; }
      .sidebar__expand-toggle { display: none; }
      .sidebar__logo-toggle { display: none; }
      .sidebar--collapsed {
        /* ignore desktop collapsed state on mobile */
        width: 280px;
        min-width: 280px;
      }
    }

    /* ── Desktop layout (>= 768px) ───────────────────────────────── */
    @media (min-width: 768px) {
      .sidebar {
        display: flex;
        flex-direction: column;
        width: 220px;
        min-width: 220px;
        height: 100vh;
        position: sticky;
        top: 0;
        background: #111318;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 1.25rem 0 1rem;
        flex-shrink: 0;
        transition: width .25s ease, min-width .25s ease;
        transform: none;
        box-shadow: none;
        z-index: auto;
      }
      .sidebar--collapsed {
        width: 64px;
        min-width: 64px;
      }
      .sidebar-backdrop { display: none; }
    }
    /* Wider desktops get a roomier sidebar. The collapsed-state
       override has to be re-stated here so it wins over the wider
       default in the cascade. */
    @media (min-width: 1200px) {
      .sidebar {
        width: 260px;
        min-width: 260px;
      }
      .sidebar--collapsed {
        width: 64px;
        min-width: 64px;
      }
    }

    /* ── Top: logo + collapse toggle ─────────────────────────────── */
    /* No rule below the logo — vertical rhythm comes from equal
       1rem gaps between logo / button / nav. */
    .sidebar__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .25rem;
      padding: 0 .875rem;
      margin-bottom: 1rem;
    }
    /* Collapsed state: the top row holds just the single
       expand-toggle button, centred. */
    .sidebar__top--collapsed {
      padding: 0 .5rem;
      justify-content: center;
    }
    /* Logo button: wraps the brand mark + wordmark + (hidden by
       default) panel-toggle SVG. Clicking anywhere collapses the
       sidebar. Hover does NOT add a background fill — the visual
       affordance is the toggle SVG fading in on the right edge,
       matching the ChatGPT pattern but anchored to the logo unit. */
    .sidebar__logo-btn {
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      flex: 1;
      min-width: 0;
      position: relative;
    }
    .sidebar__logo-btn:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
      border-radius: 4px;
    }
    /* Panel-toggle SVG: invisible until the user hovers the logo
       row (or focuses the button via keyboard). Sits flush with
       the right edge so the wordmark still gets the full width
       it needs to fit the column. */
    .sidebar__logo-toggle {
      flex-shrink: 0;
      /* Push to the far right of the row regardless of how much
         room the wordmark consumes. The text only takes its
         intrinsic width, so without margin-left:auto the toggle
         would sit right next to it instead of at the column edge. */
      margin-left: auto;
      color: rgba(255,255,255,.55);
      opacity: 0;
      transition: opacity .15s ease, color .15s ease;
      pointer-events: none;
    }
    .sidebar__logo-btn:hover .sidebar__logo-toggle,
    .sidebar__logo-btn:focus-visible .sidebar__logo-toggle {
      opacity: 1;
      color: #fff;
    }
    .sidebar__logo-btn:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    /* Brand mark — left untouched (no filter). Reads correctly as
       cyan-on-black against the dark sidebar. */
    .sidebar__logo-icon { height: 28px; width: auto; display: block; }
    /* Brand wordmark rendered as live text in Fraunces (the same
       display face used on the marketing site). Live text scales
       crisply at every DPI, recolors with CSS, and is accessible to
       screen readers — no PNG raster, no invert() filter. */
    .sidebar__logo-text {
      font-family: var(--font-brand);
      /* Fraunces 800 runs wide — at 1.0625rem the wordmark was
         clipping with an ellipsis ("Creator Compani…") inside the
         sidebar's ~240px column. Drop to .9375rem and tighten the
         tracking so "Creator Companion" sits comfortably alongside
         the 28px icon plus its margin and the row's outer padding. */
      font-size: .9375rem;
      font-weight: 800;
      color: #fff;
      letter-spacing: -.03em;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      /* Inside the logo button — gap on the parent handles spacing,
         so no margin needed here. min-width: 0 lets the ellipsis
         clamp engage when the column is too narrow. */
      min-width: 0;
    }

    /* Collapsed-state expand button. Logo icon visible by default;
       on hover the logo fades out and the panel-toggle SVG fades in,
       hinting that clicking will reopen the sidebar. */
    .sidebar__expand-toggle {
      position: relative;
      width: 40px; height: 40px;
      background: transparent;
      border: none;
      border-radius: 8px;
      color: rgba(255,255,255,.85);
      cursor: pointer;
      display: grid; place-items: center;
      transition: background .15s;
    }
    .sidebar__expand-toggle:hover { background: rgba(255,255,255,.06); }
    .sidebar__expand-toggle:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    .sidebar__expand-toggle-default {
      width: 28px; height: 28px;
      transition: opacity .15s;
    }
    .sidebar__expand-toggle-hover {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      opacity: 0;
      transition: opacity .15s;
      pointer-events: none;
    }
    .sidebar__expand-toggle:hover .sidebar__expand-toggle-default { opacity: 0; }
    .sidebar__expand-toggle:hover .sidebar__expand-toggle-hover { opacity: 1; }

    /* Mobile-only X close button — shown in the drawer top-right.
       Hidden on desktop where the panel-toggle handles toggling. */
    .sidebar__close-mobile { display: none; }
    @media (max-width: 767px) {
      .sidebar__close-mobile {
        display: grid;
        place-items: center;
        width: 36px; height: 36px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 50%;
        color: rgba(255,255,255,.85);
        cursor: pointer;
        flex-shrink: 0;
        transition: background .15s, border-color .15s;
      }
      .sidebar__close-mobile:hover {
        background: rgba(255,255,255,.12);
        border-color: rgba(255,255,255,.25);
      }
      .sidebar__panel-toggle,
      .sidebar__expand-toggle { display: none !important; }
    }

    /* ── Streak module (Variant A — compact inline header) ────────
       One row with the streak number + tier pill, a 3px progress
       bar, and a footnote split between "N to NextTier" and "Best N".
       Sits just above the user-card footer (Layout 1) with no rule
       lines — the spacer above pushes it to the bottom. */
    .sidebar__streak {
      padding: 0 1rem 1rem;
    }
    .sidebar__streak-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .5rem;
      margin-bottom: .625rem;
    }
    .sidebar__streak-num-wrap {
      display: flex;
      align-items: baseline;
      gap: .25rem;
      min-width: 0;
    }
    .sidebar__streak-num {
      font-family: var(--font-sans);
      font-size: 1.875rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -.03em;
      color: var(--color-accent);
    }
    .sidebar__streak-unit {
      font-size: .75rem;
      font-weight: 500;
      color: rgba(255,255,255,.5);
      margin-left: .125rem;
    }

    /* Tier pill — keeps original warm gold/cream colours; reads
       cleanly on the dark sidebar background. */
    .sidebar__streak-tier {
      display: inline-flex;
      align-items: center;
      gap: .25rem;
      flex-shrink: 0;
      background: #faf2dc;
      border: 1px solid rgba(224,168,58,.3);
      color: #8b6912;
      border-radius: 4px;
      padding: 2px 7px;
      font-size: .625rem;
      font-weight: 700;
      letter-spacing: .04em;
      box-sizing: border-box;
    }
    .sidebar__streak-tier--top {
      background: linear-gradient(135deg, #faf2dc 0%, #f0d77a 100%);
      border-color: rgba(224,168,58,.55);
      color: #6e5610;
    }

    /* Slim 3px progress bar. */
    .sidebar__streak-bar {
      height: 3px;
      background: rgba(255,255,255,.08);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: .5rem;
    }
    .sidebar__streak-bar-fill {
      height: 100%;
      background: var(--color-accent);
      border-radius: 3px;
      transition: width .35s ease;
    }

    /* Footnote split-row: "N to Tier" left, "Best N" right. */
    .sidebar__streak-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: .5rem;
      font-size: .6875rem;
      color: rgba(255,255,255,.5);
      font-weight: 500;
    }
    .sidebar__streak-foot strong {
      color: rgba(255,255,255,.9);
      font-weight: 700;
    }
    .sidebar__streak-foot--top {
      color: #d8b85f;
      font-weight: 600;
    }
    /* "Best N · History →" cluster on the right of the streak footer.
       The link is muted by default (matches surrounding muted text) and
       brightens to brand cyan on hover so the affordance is clear
       without being loud. */
    .sidebar__streak-best {
      display: inline-flex;
      align-items: baseline;
      gap: .375rem;
      white-space: nowrap;
    }
    .sidebar__streak-history-link {
      color: rgba(255,255,255,.5);
      text-decoration: none;
      font-weight: 500;
      /* Generous tap surface — the link is inline text in a footer
         line, easy to miss on mobile without padding. The negative
         margin keeps the visible-text baseline aligned where it was. */
      display: inline-block;
      padding: .375rem .5rem;
      margin: -.375rem -.5rem;
      border-radius: 6px;
      transition: color .15s ease, background .15s ease;
      -webkit-tap-highlight-color: rgba(18,196,227,.2);
    }
    .sidebar__streak-history-link:hover,
    .sidebar__streak-history-link:active {
      color: var(--color-accent);
      background: rgba(255,255,255,.06);
    }

    /* On the mobile drawer the streak gets a small bump in scale to
       match the larger nav items, but the layout stays identical. */
    @media (max-width: 767px) {
      .sidebar__streak {
        padding: 0 1rem 1.25rem;
      }
      .sidebar__streak-num { font-size: 2.125rem; }
      .sidebar__streak-unit { font-size: .8125rem; }
      .sidebar__streak-tier { font-size: .6875rem; padding: 3px 8px; }
      .sidebar__streak-bar { height: 4px; }
      .sidebar__streak-foot { font-size: .75rem; }
    }

    /* ── Compose + Search row. The two share a flex row so the
       search icon button sits flush to the right of the compose
       pill. The pill stretches (flex:1) and the search button is
       a fixed square endcap. Horizontal margin lives on the row
       container; the compose pill itself has no horizontal margin
       so flex can lay them out without surprises. */
    .sidebar__compose-row {
      display: flex;
      align-items: center;
      gap: .5rem;
      margin: 0 .875rem 1rem;
    }
    .sidebar__compose-row--collapsed {
      /* Collapsed desktop sidebar — only the compose icon shows
         (the search button is hidden via @if in the template);
         re-center the lone child. */
      justify-content: center;
      margin: 0 auto 1rem;
    }

    /* ── New Entry button — exception to the global primary-CTA
       pattern. Black-on-black would disappear on the dark sidebar,
       so this one stays brand cyan with white text. Hover shifts
       to a slightly brighter cyan (#0bd2f0) to give a subtle lift
       without changing the colour identity. ── */
    .sidebar__compose {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .5rem;
      /* Margin removed — the parent .sidebar__compose-row owns
         positioning now. Compose stretches to fill remaining
         horizontal space in the row. */
      margin: 0;
      flex: 1;
      min-width: 0; /* allow flex to shrink below content width */
      padding: .5rem 1rem;
      background: var(--color-accent);
      color: #fff;
      border: none;
      border-radius: 999px;
      font-family: inherit;
      /* .8125rem (13px). "Create Entry" is the same character count
         as the prior "Log Progress" label, so it fits comfortably
         next to the 36px search button without any font-shrink. */
      font-size: .8125rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background .15s, transform .15s;
    }
    .sidebar__compose:hover {
      background: #0bd2f0;
      color: #fff;
      text-decoration: none;
      transform: translateY(-1px);
    }
    .sidebar__compose--collapsed {
      width: 32px; height: 32px;
      padding: 0;
      /* Collapsed: revert flex stretch so the icon sits as a tight
         32px circle rather than being widened by flex:1. The
         compose-row--collapsed wrapper handles centering. */
      flex: 0 0 32px;
      margin: 0;
      border-radius: 50%;
    }
    /* Locked variant — same footprint as the cyan compose CTA so the
       sidebar doesn't reflow, but greyed and clearly non-interactive.
       Lock icon replaces the plus. Cursor + opacity tell the user it
       isn't clickable; the title attribute carries the "Subscribe to
       unlock" explanation. */
    .sidebar__compose--locked {
      background: rgba(255,255,255,.08);
      color: rgba(255,255,255,.55);
      border: 1px dashed rgba(255,255,255,.2);
      cursor: not-allowed;
    }
    .sidebar__compose--locked:hover {
      background: rgba(255,255,255,.08);
      color: rgba(255,255,255,.55);
      transform: none;
    }
    .sidebar__compose-label {
      white-space: nowrap;
      /* Ellipsis if the label can't fit beside the search button —
         degrades gracefully on edge-case viewports rather than
         wrapping or pushing the search icon offscreen. */
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Search icon button — sibling of the compose pill inside the
       row. Quiet styling (transparent bg, faint border) so the
       compose pill remains the visual primary action; the search
       button is an always-available secondary. Sized 36×36 in the
       desktop sidebar so the row stays compact (slightly smaller
       than compose's ~38px tall pill); 44×44 in the mobile drawer
       for proper touch-target sizing. */
    .sidebar__search {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      background: transparent;
      color: rgba(255, 255, 255, .7);
      border: 1px solid rgba(255, 255, 255, .15);
      border-radius: 10px;
      padding: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background .15s, color .15s, border-color .15s;
    }
    /* Hover gated to mouse-pointer devices so mobile taps don't
       latch the lighter background — same pattern as the global
       .btn--primary fix. */
    @media (hover: hover) and (pointer: fine) {
      .sidebar__search:hover {
        background: rgba(255, 255, 255, .08);
        color: #fff;
        border-color: rgba(255, 255, 255, .3);
      }
    }

    /* Mobile drawer has plenty of horizontal room — bump the compose
       button up to a more inviting size. Larger text, fatter padding,
       bigger plus glyph. Search button also gets touch-friendly. */
    @media (max-width: 767px) {
      .sidebar__compose-row { margin: 0 1rem 1rem; }
      .sidebar__compose {
        font-size: 1.0625rem;
        padding: .875rem 1rem;
      }
      .sidebar__compose svg { width: 18px !important; height: 18px !important; }
      .sidebar__search { width: 44px; height: 44px; }
    }

    /* ── Filter panel — expanded state when filter.panelOpen() is true.
       Sits directly under the compose row, pushes the nav items down.
       Compact: ~98px total (input + small gap + 3-button sort segment
       + padding). Same width as compose-row for visual continuity. */
    .sidebar__filter-panel {
      margin: -.25rem .875rem 1rem;
      padding: .625rem;
      background: rgba(255, 255, 255, .04);
      border: 1px solid rgba(255, 255, 255, .08);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      gap: .375rem;
    }
    /* Wrapper hosts the input + the absolute-positioned × clear
       button. Position relative so the button anchors inside it. */
    .sidebar__filter-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .sidebar__filter-input {
      width: 100%;
      /* Right padding leaves room for the absolute × button when
         visible. The button is 26px wide + the input's intrinsic
         padding — 2rem covers it without overlapping the caret. */
      padding: .5rem 2rem .5rem .75rem;
      background: rgba(0, 0, 0, .25);
      border: 1px solid rgba(255, 255, 255, .12);
      border-radius: 8px;
      color: #fff;
      font-family: var(--font-sans);
      font-size: .875rem;
      outline: none;
      transition: border-color .15s, background .15s;
    }
    .sidebar__filter-input::placeholder { color: rgba(255, 255, 255, .4); }
    .sidebar__filter-input:focus {
      border-color: var(--color-accent);
      background: rgba(0, 0, 0, .35);
    }

    /* × clear button — only renders when there's a query to clear.
       Subtle by default; brightens on hover/active so it reads as
       interactive. Sized 22px to comfortably tap on mobile (the
       tap target extends a few px beyond the visible glyph via
       padding). */
    .sidebar__filter-clear {
      position: absolute;
      right: .25rem;
      width: 26px;
      height: 26px;
      background: transparent;
      border: none;
      padding: 0;
      color: rgba(255, 255, 255, .5);
      font-size: 1.125rem;
      line-height: 1;
      cursor: pointer;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background .12s, color .12s;
    }
    @media (hover: hover) and (pointer: fine) {
      .sidebar__filter-clear:hover {
        background: rgba(255, 255, 255, .12);
        color: #fff;
      }
    }

    /* Segmented sort control — three buttons share a row. Active state
       fills with cyan tint; inactive stays subtle. Looks more native
       inside an inline panel than a dropdown would. */
    .sidebar__filter-sort {
      display: flex;
      gap: 2px;
      background: rgba(0, 0, 0, .25);
      border: 1px solid rgba(255, 255, 255, .12);
      border-radius: 8px;
      padding: 2px;
    }
    .sidebar__filter-sort-btn {
      flex: 1;
      padding: .375rem .25rem;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: rgba(255, 255, 255, .6);
      font-family: var(--font-sans);
      font-size: .6875rem;
      font-weight: 600;
      letter-spacing: .02em;
      cursor: pointer;
      transition: background .12s, color .12s;
    }
    .sidebar__filter-sort-btn--active {
      background: var(--color-accent);
      color: #fff;
    }
    @media (hover: hover) and (pointer: fine) {
      .sidebar__filter-sort-btn:hover:not(.sidebar__filter-sort-btn--active) {
        background: rgba(255, 255, 255, .06);
        color: #fff;
      }
    }

    /* Mobile filter panel — bump input + button heights for touch. */
    @media (max-width: 767px) {
      .sidebar__filter-panel { margin: -.25rem 1rem 1rem; padding: .75rem; gap: .5rem; }
      .sidebar__filter-input { padding: .75rem 1rem; font-size: 1rem; }
      .sidebar__filter-sort-btn { padding: .625rem .25rem; font-size: .75rem; }
    }

    /* Search button active state — when the filter panel is open,
       the search icon flips to filled-cyan so it reads like a tab
       the user can collapse back. */
    .sidebar__search--active {
      background: var(--color-accent);
      color: #fff;
      border-color: var(--color-accent);
    }
    @media (hover: hover) and (pointer: fine) {
      .sidebar__search--active:hover {
        background: #0bd2f0;
        color: #fff;
        border-color: #0bd2f0;
      }
    }

    /* ── Nav ────────────────────────────────────────────────────── */
    .sidebar__nav {
      display: flex; flex-direction: column;
      padding: 0 .625rem; gap: .125rem;
    }
    .sidebar--collapsed .sidebar__nav { padding: 0 .375rem; }

    .sidebar__nav-item {
      display: flex; align-items: center; gap: .75rem;
      padding: .5625rem .875rem;
      font-size: .875rem; font-weight: 500;
      color: rgba(255,255,255,.55);
      border-radius: 7px;
      text-decoration: none;
      transition: background .15s, color .15s;
    }
    /* Bigger labels and tap targets on mobile drawer for readability.
       The drawer has plenty of room and the previous 1rem felt small
       relative to the size of the touch target around it. */
    @media (max-width: 767px) {
      .sidebar__nav-item {
        font-size: 1.0625rem;
        font-weight: 600;
        gap: .875rem;
        padding: .875rem 1rem;
        color: rgba(255,255,255,.85);
      }
      .sidebar__nav-item svg { width: 22px !important; height: 22px !important; opacity: .85 !important; }
    }
    .sidebar__nav-item svg { flex-shrink: 0; opacity: .7; }
    .sidebar__nav-item:hover {
      background: rgba(255,255,255,.06);
      color: rgba(255,255,255,.8);
      text-decoration: none;
    }
    .sidebar__nav-item--active {
      background: rgba(18,196,227,.12);
      color: #12C4E3; font-weight: 600;
    }
    .sidebar__nav-item--active svg { opacity: 1; }
    .sidebar__nav-item--active:hover { background: rgba(18,196,227,.18); color: #12C4E3; }

    .sidebar--collapsed .sidebar__nav-item {
      justify-content: center;
      padding: .625rem 0;
    }
    .sidebar--collapsed .sidebar__nav-label { display: none; }

    .sidebar__spacer { flex: 1; }

    /* ── Footer: avatar + name + icons in one inline row ─────── */
    /* Single row: usercard (avatar + name) takes flex:1, icons sit
       at the right. Name is vertically centred since the plan label
       is gone. */
    .sidebar__footer-wrap {
      padding: .25rem .5rem .25rem;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: .25rem;
      min-width: 0;
    }
    .sidebar--collapsed .sidebar__footer-wrap {
      flex-direction: column;
      padding: .75rem .375rem .25rem;
      gap: .5rem;
    }

    .sidebar__usercard {
      flex: 1;
      min-width: 0;
      display: flex; align-items: center; gap: .625rem;
      padding: .5rem .625rem;
      background: rgba(255,255,255,.04);
      border-radius: 10px;
      text-decoration: none;
      transition: background .15s;
    }
    .sidebar__usercard:hover { background: rgba(255,255,255,.08); text-decoration: none; }
    .sidebar__usercard--active { background: rgba(18,196,227,.12); }
    .sidebar__usercard--active .sidebar__user-name { color: #12C4E3; }

    .sidebar--collapsed .sidebar__usercard {
      flex: none;
      justify-content: center;
      padding: .375rem;
    }
    .sidebar--collapsed .sidebar__user-name { display: none; }

    .sidebar__avatar {
      width: 30px; height: 30px; border-radius: 50%;
      background: linear-gradient(135deg, #ff9a76, #c25fb5);
      background-size: cover;
      background-position: center;
      color: #fff;
      font-size: .75rem; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    /* When a profile image is set, the gradient placeholder is masked
       by the photo. Initial-letter span is hidden via *ngIf. */
    .sidebar__avatar--photo {
      background-color: #1a1d24;
    }
    .sidebar__user-name {
      flex: 1;
      min-width: 0;
      font-size: .8125rem; font-weight: 600;
      color: #fff;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      transition: color .15s;
      line-height: 1;
    }

    .sidebar__footer-actions {
      display: flex;
      align-items: center;
      gap: .125rem;
      flex-shrink: 0;
    }
    .sidebar--collapsed .sidebar__footer-actions {
      flex-direction: column;
      gap: .375rem;
    }

    .sidebar__icon-btn {
      width: 32px; height: 32px;
      background: transparent;
      border: none;
      border-radius: 8px;
      color: rgba(255,255,255,.4);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      text-decoration: none;
      transition: color .15s, background .15s;
      font-family: inherit;
    }
    .sidebar__icon-btn:hover {
      color: rgba(255,255,255,.85);
      background: rgba(255,255,255,.06);
      text-decoration: none;
    }

    /* Mobile: place gear + sign-out inline with the user card row so
       the icons are immediately visible (not buried at the bottom of
       the drawer). Slightly larger icons for tappability. */
    @media (max-width: 767px) {
      .sidebar__footer-wrap {
        flex-direction: row;
        align-items: center;
        gap: .375rem;
      }
      .sidebar__usercard { flex: 1; min-width: 0; }
      .sidebar__footer-actions {
        flex-direction: row;
        gap: .25rem;
        padding: 0;
        flex-shrink: 0;
      }
      .sidebar__icon-btn {
        width: 38px; height: 38px;
        color: rgba(255,255,255,.7);
      }
      .sidebar__icon-btn svg { width: 18px !important; height: 18px !important; }
    }
  `]
})
export class SidebarComponent implements OnInit {
  @Input() active: 'dashboard' | 'notifications' | 'todos' | 'favorites' | 'account' | 'admin' = 'dashboard';

  private api      = inject(ApiService);
  private tokens   = inject(TokenService);
  private auth     = inject(AuthService);
  private router   = inject(Router);
  private drawer   = inject(SidebarStateService);
  private streakRefresh = inject(StreakRefreshService);
  private destroyRef    = inject(DestroyRef);
  /** Public so the template can read/write the filter signals directly.
   *  The search icon button calls toggle(); the input is two-way bound
   *  to query(); the sort segmented control updates sort(). On Enter
   *  or sort-tap the template ALSO calls closeMobile() so mobile users
   *  see the filtered results behind the drawer they just closed. */
  protected filter = inject(JournalFilterService);

  /** Reference to the search input inside the filter panel. Used to
   *  auto-focus when the panel opens (so the user can start typing
   *  immediately without a second tap). The @if in the template means
   *  this is undefined when the panel is closed. */
  @ViewChild('filterInput') filterInput?: ElementRef<HTMLInputElement>;

  constructor() {
    // Auto-focus the search input each time the panel opens. The
    // requestAnimationFrame wait ensures the @if block has rendered
    // the input element before we try to focus it. Effects auto-
    // dispose with the component, no cleanup needed.
    effect(() => {
      if (this.filter.panelOpen()) {
        requestAnimationFrame(() => this.filterInput?.nativeElement.focus());
      }
    });
  }

  /** Mirror of AuthService.isReadOnly. Drives the locked variant of
   *  the New Entry compose button so the cyan CTA isn't presented to
   *  a user who can't actually act on it. */
  readOnly = this.auth.isReadOnly;

  /** Mobile-drawer state — read from the shared service. */
  mobileOpen = this.drawer.mobileOpen;
  closeMobile(): void { this.drawer.closeMobile(); }

  /**
   * Where to route for a "section" nav item (Notifications / Todos /
   * Favorites). On desktop we navigate to /dashboard with a section
   * queryParam — the dashboard's right column embeds the section
   * inline. On mobile the right column is hidden, so we navigate to
   * the standalone /notifications, /todos, /favorites page instead.
   */
  sectionLink(section: 'notifications' | 'todos' | 'favorites' | 'streak-history'): string[] {
    const isDesktop = ViewportService.isDesktopNow();
    // Desktop renders all of these inline in the dashboard's right column
    // via the ?section= query param. Mobile has no right column, so each
    // gets a dedicated standalone route instead.
    if (isDesktop) return ['/dashboard'];
    return ['/' + section];
  }

  sectionQueryParams(section: 'notifications' | 'todos' | 'favorites' | 'streak-history'): Record<string, string> | null {
    const isDesktop = ViewportService.isDesktopNow();
    return isDesktop ? { section } : null;
  }

  isAdmin           = this.tokens.isAdmin.bind(this.tokens);
  streak            = signal<StreakStats | null>(null);
  hasFavoriteSparks = signal(false);

  /** Raw user preference from localStorage (only meaningful on desktop). */
  private collapsedPref = signal<boolean>(this.readCollapsedFromStorage());

  /** Tracks the viewport width so the effective collapsed state is reactive
   *  to crossing the mobile/desktop breakpoint at runtime. */
  private viewportWidth = signal<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);

  /** Effective collapsed state. On mobile (< 768px) we always render the
   *  drawer full-width, so the desktop "collapsed" preference is ignored. */
  collapsed = computed<boolean>(() => {
    if (this.viewportWidth() < 768) return false;
    return this.collapsedPref();
  });

  /** "First Last" — falls back to first name only if last is missing
   *  (grandfathered users whose username didn't have a clean split). */
  displayName = computed(() => {
    const u = this.tokens.getCachedUser();
    if (!u) return '';
    return [u.firstName, u.lastName].filter(s => s && s.trim()).join(' ');
  });

  /** Capital first letter of the user's first name for the avatar
   *  fallback when no profile picture is set. */
  userInitial = computed(() => {
    const first = this.tokens.getCachedUser()?.firstName ?? '';
    return (first[0] ?? '?').toUpperCase();
  });

  /** Profile picture URL — null until the user has uploaded one.
   *  When set, the avatar circle renders the image instead of the
   *  initial-letter fallback. */
  profileImageUrl = computed<string | null>(() => {
    const u = this.tokens.getCachedUser() as ({ profileImageUrl?: string | null } | null);
    return u?.profileImageUrl?.trim() || null;
  });

  /** Tier-progress data for the streak module's badge + progress bar. */
  progressToNext = computed<MilestoneProgress>(() =>
    getMilestoneProgress(this.streak()?.currentStreak ?? 0)
  );

  toggleCollapsed(): void {
    const next = !this.collapsedPref();
    this.collapsedPref.set(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      // Ignore quota / privacy-mode errors — state stays in memory for the session.
    }
  }

  /**
   * Logo-icon click handler. The icon is the unified collapse affordance,
   * but "collapse" means different things across viewports:
   *
   *  - Desktop (>= 768px): toggle the sidebar between full and rail width.
   *  - Mobile (< 768px): close the slide-in drawer (the rail-width
   *    collapsed state doesn't exist on mobile, where the desktop
   *    `collapsed` computed is force-overridden to false).
   *
   * Without this branch, mobile taps would call toggleCollapsed and flip
   * a localStorage flag that has no visual effect — the icon looks dead.
   */
  onLogoClick(): void {
    if (!ViewportService.isDesktopNow()) {
      this.closeMobile();
    } else {
      this.toggleCollapsed();
    }
  }

  private readCollapsedFromStorage(): boolean {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  }

  logout(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.auth.logout();
  }

  /**
   * Logo click — also asks the dashboard to reset to "today" view
   * (same as clicking the Today pill in the right column). The
   * routerLink already navigates to /dashboard; this signal lets the
   * dashboard react even when we're already on /dashboard (in which
   * case the router doesn't fire a navigation).
   */
  /**
   * Single explicit nav handler used by the sidebar nav items.
   * Closes the drawer and programmatically navigates — this is the
   * source of truth for nav. The companion routerLink on the anchor
   * is kept only so right-click "open in new tab" works on desktop
   * and Angular's active-route styling lights up correctly.
   *
   * Why: on iOS Safari/Chrome the routerLink + (click) combo
   * occasionally fires the click but skips the navigation, leaving
   * the user stuck. preventDefault on the original anchor click +
   * an explicit router.navigateByUrl below makes navigation reliable.
   */
  private navTo(commands: any[], queryParams: Record<string, string> | null, ev: Event): void {
    ev.preventDefault();
    this.drawer.closeMobile();
    this.router.navigate(commands, queryParams ? { queryParams } : {});
  }

  goJournal(ev: Event): void {
    // Tap on Journal — explicit nav back to /dashboard. Also asks
    // the dashboard to reset its right column to "today" mode and
    // scrolls the page to the top so the user gets a clear visual
    // confirmation of the tap (relevant when already on /dashboard).
    this.navTo(['/dashboard'], null, ev);
    this.drawer.requestReturnToToday();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  goSection(section: 'notifications' | 'todos' | 'favorites' | 'streak-history', ev: Event): void {
    this.navTo(this.sectionLink(section), this.sectionQueryParams(section), ev);
  }

  goAdmin(ev: Event): void {
    this.navTo(['/admin'], null, ev);
  }

  /** Help & FAQ — same nav pattern as the section links, but routes to
   *  the standalone /support page rather than embedding in the
   *  dashboard's right column. The page is identical on every viewport. */
  goSupport(ev: Event): void {
    this.navTo(['/support'], null, ev);
  }

  /**
   * Called when the user "commits" a filter action — either pressing
   * Enter in the search input or tapping a sort button. Two effects:
   *
   * 1. Blurs the search input. On iOS, pressing Return inside an
   *    <input> doesn't dismiss the soft keyboard automatically —
   *    the input keeps focus until something explicitly removes it.
   *    Without blur, the keyboard would sit there with its floating
   *    accessory bar after the drawer slides away.
   *
   * 2. Closes the mobile drawer so the filtered entries (column 2)
   *    become visible. No-op on desktop where the sidebar is always
   *    open.
   *
   * Order matters: blur THEN closeMobile. If the drawer animates
   * away with the input still focused, iOS sometimes keeps the
   * keyboard "in transit" and it briefly reappears.
   *
   * Note: this does NOT clear the query. The user sees their search
   * term in the input field and can tap the inline × clear button
   * (or close the panel) when they want to revert to the full list.
   * Leaving the query visible mitigates the "invisible filter" trap
   * an earlier iteration had (input cleared on Enter, but entries
   * were still filtered — users couldn't tell why).
   */
  commitFilterAction(): void {
    this.filterInput?.nativeElement.blur();
    this.closeMobile();
  }

  /**
   * One-click filter clear, wired to the × button inside the search
   * input. Resets the active query so the entries list reverts to
   * all entries, then refocuses the input so the user can start
   * typing a new query without an extra tap. Sort is preserved
   * (it's a view preference, not part of the search action).
   */
  clearFilterQuery(): void {
    this.filter.query.set('');
    // Defer focus to next tick so the @if removes the × button first
    // (otherwise focus + the click-target removal in the same tick
    // can race on some browsers).
    requestAnimationFrame(() => this.filterInput?.nativeElement.focus());
  }

  /** Legacy entry point — kept in case anything else still calls it. */
  goHome(): void {
    this.drawer.closeMobile();
    this.drawer.requestReturnToToday();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  ngOnInit(): void {
    this.loadStreak();

    // Refetch the sidebar streak number whenever any entry mutation
    // anywhere in the app fires the streak-refresh pulse (compose save,
    // edit save, edit delete). Keeps the "Best N" / current streak
    // numbers honest without a page reload after a backfill.
    this.streakRefresh.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadStreak());

    // Show the Favorites link only if the user has saved at least one
    // item — sparks OR entries. Uses the unified endpoint with take=1
    // for a cheap visibility probe (we just need to know "any"). The
    // signal name is preserved for backwards compat with consumers.
    this.api.getFavorites(0, 1).subscribe({
      next: page => this.hasFavoriteSparks.set(page.items.length > 0),
      error: () => {}  // silently hide on error (e.g. free-tier 403)
    });

    // Close the mobile drawer whenever the user navigates somewhere — they
    // tapped a nav item, so the drawer's job is done.
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.drawer.closeMobile());

    // Track viewport width so collapsed() recomputes when crossing the
    // mobile/desktop breakpoint.
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.viewportWidth.set(window.innerWidth));
    }
  }

  private loadStreak(): void {
    this.api.getStreak().subscribe({
      next: s => this.streak.set(s),
      error: () => this.streak.set({ currentStreak: 0, longestStreak: 0, totalEntries: 0,
        totalMediaCount: 0, totalActiveDays: 0, isPaused: false, pauseDaysUsedThisMonth: 0 })
    });
  }
}
