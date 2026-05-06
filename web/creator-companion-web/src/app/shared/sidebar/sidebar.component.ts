import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { TokenService } from '../../core/services/token.service';
import { AuthService } from '../../core/services/auth.service';
import { StreakStats } from '../../core/models/models';
import { SidebarStateService } from './sidebar-state.service';
import { TierIconComponent } from '../tier-icon/tier-icon.component';
import { getMilestoneProgress, MilestoneProgress } from '../../core/constants/milestones';

const COLLAPSE_KEY = 'cc_sidebar_collapsed';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, TierIconComponent],
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
          <button class="sidebar__logo-btn"
                  type="button"
                  (click)="toggleCollapsed()"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar">
            <img src="logo-icon.png" alt="" class="sidebar__logo-icon">
          </button>
          <span class="sidebar__logo-text">Creator Companion</span>
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

      <!-- New Entry button (cyan; full pill expanded, just + icon collapsed) -->
      <a class="sidebar__compose"
         [class.sidebar__compose--collapsed]="collapsed()"
         [routerLink]="['/dashboard']"
         [queryParams]="{compose: 1}"
         [title]="collapsed() ? 'New Entry' : null">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.4" stroke-linecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        <span class="sidebar__compose-label" *ngIf="!collapsed()">New Entry</span>
      </a>

      <!-- Nav -->
      <nav class="sidebar__nav">
        <a class="sidebar__nav-item"
           [class.sidebar__nav-item--active]="active === 'dashboard'"
           routerLink="/dashboard"
           (click)="goHome()"
           [title]="collapsed() ? 'Journal' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <span class="sidebar__nav-label">Journal</span>
        </a>
        <a class="sidebar__nav-item"
           [class.sidebar__nav-item--active]="active === 'notifications'"
           [routerLink]="sectionLink('notifications')"
           [queryParams]="sectionQueryParams('notifications')"
           [title]="collapsed() ? 'Notifications' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="sidebar__nav-label">Notifications</span>
        </a>
        <a class="sidebar__nav-item"
           [class.sidebar__nav-item--active]="active === 'todos'"
           [routerLink]="sectionLink('todos')"
           [queryParams]="sectionQueryParams('todos')"
           [title]="collapsed() ? 'To Do List' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <span class="sidebar__nav-label">To Do List</span>
        </a>
        <a *ngIf="hasFavoriteSparks()"
           class="sidebar__nav-item"
           [class.sidebar__nav-item--active]="active === 'favorites'"
           [routerLink]="sectionLink('favorites')"
           [queryParams]="sectionQueryParams('favorites')"
           [title]="collapsed() ? 'Favorite Sparks' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span class="sidebar__nav-label">Favorite Sparks</span>
        </a>
        <a *ngIf="isAdmin()"
           class="sidebar__nav-item"
           [class.sidebar__nav-item--active]="active === 'admin'"
           routerLink="/admin"
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
            <span *ngIf="streak()!.longestStreak > 0">
              Best <strong>{{ streak()!.longestStreak }}</strong>
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
      height: 100vh;
      background: #111318;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 1.25rem 0 1rem;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 200;
      transform: translateX(-100%);
      transition: transform .25s ease, width .25s ease, min-width .25s ease;
      box-shadow: 0 0 30px rgba(0,0,0,.4);
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
    /* Don't show desktop panel-toggle on mobile — irrelevant. */
    @media (max-width: 767px) {
      .sidebar__panel-toggle { display: none; }
      .sidebar__expand-toggle { display: none; }
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
    /* Logo-icon button: clickable wrapper around the brand mark that
       collapses the sidebar. Transparent by default so the icon's
       own black background reads as the brand mark, not as button
       chrome. Visible hover halo + scale-down on click so the
       affordance is obvious. */
    .sidebar__logo-btn {
      background: transparent;
      border: none;
      padding: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      flex-shrink: 0;
      transition: background .15s ease, transform .1s ease;
      position: relative;
      z-index: 1;
    }
    .sidebar__logo-btn:hover { background: rgba(255,255,255,.14); }
    .sidebar__logo-btn:active { transform: scale(.92); background: rgba(255,255,255,.20); }
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
      flex: 1;
      margin-left: .5rem;
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
      margin: 0 .875rem 1rem;
      padding: .5rem 1rem;
      background: var(--color-accent);
      color: #fff;
      border: none;
      border-radius: 999px;
      font-family: inherit;
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
      margin: 0 auto 1rem;
      border-radius: 50%;
    }
    .sidebar__compose-label { white-space: nowrap; }

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
    /* Bigger labels and tap targets on mobile drawer for readability. */
    @media (max-width: 767px) {
      .sidebar__nav-item {
        font-size: 1rem;
        font-weight: 600;
        gap: .875rem;
        padding: .75rem 1rem;
        color: rgba(255,255,255,.85);
      }
      .sidebar__nav-item svg { width: 20px !important; height: 20px !important; opacity: .85 !important; }
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
  sectionLink(section: 'notifications' | 'todos' | 'favorites'): string[] {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    if (isDesktop) return ['/dashboard'];
    return ['/' + section];
  }

  sectionQueryParams(section: 'notifications' | 'todos' | 'favorites'): Record<string, string> | null {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
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
  goHome(): void {
    this.drawer.requestReturnToToday();
  }

  ngOnInit(): void {
    this.api.getStreak().subscribe({
      next: s => this.streak.set(s),
      error: () => this.streak.set({ currentStreak: 0, longestStreak: 0, totalEntries: 0,
        totalMediaCount: 0, totalActiveDays: 0, isPaused: false, pauseDaysUsedThisMonth: 0 })
    });

    // Show the Favorite Sparks link only if the user has saved at least one
    this.api.getFavoriteSparks().subscribe({
      next: sparks => this.hasFavoriteSparks.set(sparks.length > 0),
      error: () => {}  // silently hide the link on error (e.g. free-tier 403)
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
}
