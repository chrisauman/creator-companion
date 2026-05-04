import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { TokenService } from '../../core/services/token.service';
import { AuthService } from '../../core/services/auth.service';
import { StreakStats } from '../../core/models/models';
import { SidebarStateService } from './sidebar-state.service';

const COLLAPSE_KEY = 'cc_sidebar_collapsed';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <!-- Backdrop: visible only when the mobile drawer is open. Click to close. -->
    @if (mobileOpen()) {
      <div class="sidebar-backdrop" (click)="closeMobile()"></div>
    }
    <aside class="sidebar"
           [class.sidebar--collapsed]="collapsed()"
           [class.sidebar--mobile-open]="mobileOpen()">

      <!-- Logo + collapse toggle -->
      <div class="sidebar__top">
        <a class="sidebar__logo-wrap" routerLink="/dashboard">
          <img src="logo-icon.png" alt="" class="sidebar__logo-icon">
          <span class="sidebar__logo-text">Creator Companion</span>
        </a>
        <button class="sidebar__collapse"
                (click)="toggleCollapsed()"
                [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
                [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               [style.transform]="collapsed() ? 'rotate(180deg)' : 'rotate(0deg)'">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </div>

      <!-- Greeting + date (hidden when collapsed) -->
      <div class="sidebar__greeting" *ngIf="!collapsed()">
        <div class="sidebar__greeting-hello">{{ greetingMessage() }}</div>
        <div class="sidebar__greeting-date">{{ todayLabel() }}</div>
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
           [title]="collapsed() ? 'Journal' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <span class="sidebar__nav-label">Journal</span>
        </a>
        <a class="sidebar__nav-item"
           [class.sidebar__nav-item--active]="active === 'notifications'"
           [routerLink]="['/dashboard']"
           [queryParams]="{section: 'notifications'}"
           [title]="collapsed() ? 'Notifications' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="sidebar__nav-label">Notifications</span>
        </a>
        <a class="sidebar__nav-item"
           [class.sidebar__nav-item--active]="active === 'todos'"
           [routerLink]="['/dashboard']"
           [queryParams]="{section: 'todos'}"
           [title]="collapsed() ? 'To Do List' : null">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <span class="sidebar__nav-label">To Do List</span>
        </a>
        <a *ngIf="hasFavoriteSparks()"
           class="sidebar__nav-item"
           [class.sidebar__nav-item--active]="active === 'favorites'"
           [routerLink]="['/dashboard']"
           [queryParams]="{section: 'favorites'}"
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

      <!-- Footer: user card + settings + logout -->
      <div class="sidebar__footer-wrap">
        <a class="sidebar__usercard"
           routerLink="/account"
           [class.sidebar__usercard--active]="active === 'account'"
           [title]="collapsed() ? (displayName() + ' · ' + tierLabel()) : null">
          <div class="sidebar__avatar">{{ userInitial() }}</div>
          <div class="sidebar__user-info">
            <div class="sidebar__user-name">{{ displayName() }}</div>
            <div class="sidebar__user-tier">{{ tierLabel() }}</div>
          </div>
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
    /* Don't show drawer-mode collapse chevron on mobile — irrelevant. */
    @media (max-width: 767px) {
      .sidebar__collapse { display: none; }
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
    /* Wider desktops get a roomier sidebar. */
    @media (min-width: 1200px) {
      .sidebar {
        width: 260px;
        min-width: 260px;
      }
    }

    /* ── Top: logo + collapse toggle ─────────────────────────────── */
    .sidebar__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .25rem;
      padding: 0 .875rem 1.125rem;
      border-bottom: 1px solid rgba(255,255,255,.07);
      margin-bottom: 1.125rem;
    }
    .sidebar--collapsed .sidebar__top {
      padding: 0 .5rem 1.125rem;
      flex-direction: column;
      gap: .75rem;
    }
    .sidebar__logo-wrap {
      display: flex; align-items: center; gap: .5rem;
      text-decoration: none;
      min-width: 0;
      flex: 1;
    }
    .sidebar__logo-icon { height: 28px; width: auto; flex-shrink: 0; }
    .sidebar__logo-text {
      font-family: var(--font-sans);
      font-size: 1rem; font-weight: 700; color: #fff;
      letter-spacing: 0; line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sidebar--collapsed .sidebar__logo-text { display: none; }

    .sidebar__collapse {
      width: 26px; height: 26px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: rgba(255,255,255,.4);
      cursor: pointer;
      display: grid; place-items: center;
      flex-shrink: 0;
      transition: color .15s, background .15s;
    }
    .sidebar__collapse:hover {
      color: rgba(255,255,255,.85);
      background: rgba(255,255,255,.05);
    }
    .sidebar__collapse svg { transition: transform .25s ease; }

    /* ── Greeting + date (just below logo, hidden when collapsed) ── */
    .sidebar__greeting {
      padding: 0 1.25rem .875rem;
      border-bottom: 1px solid rgba(255,255,255,.07);
      margin-bottom: 1rem;
      margin-top: -.5rem;
    }
    .sidebar__greeting-hello {
      font-family: var(--font-sans);
      font-size: .9375rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: -.005em;
      line-height: 1.2;
    }
    .sidebar__greeting-date {
      font-size: .6875rem;
      color: rgba(255,255,255,.45);
      margin-top: 2px;
    }

    /* ── New Entry button (cyan pill expanded; circular + icon collapsed) ── */
    .sidebar__compose {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .5rem;
      margin: 0 .875rem 1rem;
      padding: .625rem 1rem;
      background: var(--color-accent);
      color: #0c0e13;
      border: none;
      border-radius: 999px;
      font-family: inherit;
      font-size: .875rem;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: background .15s, transform .15s;
    }
    .sidebar__compose:hover {
      background: #0bd2f0;
      text-decoration: none;
      transform: translateY(-1px);
    }
    .sidebar__compose--collapsed {
      width: 36px; height: 36px;
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
      display: flex; align-items: center; gap: .625rem;
      padding: .5625rem .875rem;
      font-size: .875rem; font-weight: 500;
      color: rgba(255,255,255,.4);
      border-radius: 7px;
      text-decoration: none;
      transition: background .15s, color .15s;
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

    /* ── Footer: user card + actions ─────────────────────────────── */
    .sidebar__footer-wrap {
      border-top: 1px solid rgba(255,255,255,.07);
      margin-top: .5rem;
      padding: .875rem .75rem .25rem;
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    .sidebar--collapsed .sidebar__footer-wrap {
      padding: .75rem .375rem .25rem;
    }

    .sidebar__usercard {
      display: flex; align-items: center; gap: .625rem;
      padding: .5rem .625rem;
      background: rgba(255,255,255,.04);
      border-radius: 10px;
      text-decoration: none;
      transition: background .15s;
      min-width: 0;
    }
    .sidebar__usercard:hover { background: rgba(255,255,255,.08); text-decoration: none; }
    .sidebar__usercard--active {
      background: rgba(18,196,227,.12);
    }
    .sidebar__usercard--active .sidebar__user-name { color: #12C4E3; }

    .sidebar--collapsed .sidebar__usercard {
      justify-content: center;
      padding: .375rem;
    }
    .sidebar--collapsed .sidebar__user-info { display: none; }

    .sidebar__avatar {
      width: 30px; height: 30px; border-radius: 50%;
      background: linear-gradient(135deg, #ff9a76, #c25fb5);
      color: #fff;
      font-size: .75rem; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .sidebar__user-info {
      min-width: 0;
      flex: 1;
      line-height: 1.2;
    }
    .sidebar__user-name {
      font-size: .8125rem; font-weight: 600;
      color: #fff;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      transition: color .15s;
    }
    .sidebar__user-tier {
      font-size: .625rem;
      font-weight: 700;
      color: #12C4E3;
      text-transform: uppercase;
      letter-spacing: .1em;
      margin-top: 1px;
    }

    .sidebar__footer-actions {
      display: flex;
      gap: .25rem;
      justify-content: flex-end;
      padding: 0 .25rem;
    }
    .sidebar--collapsed .sidebar__footer-actions {
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: .375rem;
      padding: 0;
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
    }
    .sidebar__icon-btn:hover {
      color: rgba(255,255,255,.85);
      background: rgba(255,255,255,.06);
      text-decoration: none;
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

  isAdmin           = this.tokens.isAdmin.bind(this.tokens);
  streak            = signal<StreakStats | null>(null);
  hasFavoriteSparks = signal(false);

  /** Persisted collapse state. Reads from localStorage on construction so the
   *  sidebar never flickers from expanded → collapsed on mount. */
  collapsed = signal<boolean>(this.readCollapsedFromStorage());

  username      = computed(() => this.tokens.getCachedUser()?.username ?? '');
  userInitial   = computed(() => (this.tokens.getCachedUser()?.username?.[0] ?? '?').toUpperCase());

  /** Display name for the user card — capitalize the first letter of the
   *  username. Future: when we have first/last names on the User model,
   *  prefer those. */
  displayName = computed(() => {
    const u = this.tokens.getCachedUser();
    if (!u?.username) return '';
    const base = u.username.includes('@') ? u.username.split('@')[0] : u.username;
    return base.charAt(0).toUpperCase() + base.slice(1);
  });

  /** Tier label shown beneath the user's name. */
  tierLabel = computed(() => {
    const tier = this.tokens.getCachedUser()?.tier;
    return tier === 'Paid' ? 'Paid plan' : 'Free plan';
  });

  /** Time-of-day greeting shown just below the logo (sidebar). */
  greetingMessage = computed(() => {
    const name = this.firstName();
    const hour = new Date().getHours();
    const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    return name ? `Good ${period}, ${name}` : `Good ${period}`;
  });

  /** Date subtitle below the greeting, e.g. "Sun · May 4". */
  todayLabel = computed(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });
  });

  private firstName(): string {
    const u = this.tokens.getCachedUser();
    if (!u?.username) return '';
    const base = u.username.includes('@') ? u.username.split('@')[0] : u.username;
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
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
  }
}
