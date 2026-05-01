import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TokenService } from '../../core/services/token.service';
import { AuthService } from '../../core/services/auth.service';
import { StreakStats } from '../../core/models/models';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <aside class="sidebar">

      <!-- Logo -->
      <a class="sidebar__logo-wrap" routerLink="/dashboard">
        <img src="logo-icon.png" alt="" class="sidebar__logo-icon">
        <span class="sidebar__logo-text">Creator Companion</span>
      </a>

      <!-- Streak block -->
      <div class="sidebar__streak-block" *ngIf="streak()">
        <div class="sidebar__streak-num">{{ streak()!.currentStreak }}</div>
        <div class="sidebar__streak-label">Day streak 🔥</div>
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
        <a class="sidebar__nav-item" [class.sidebar__nav-item--active]="active === 'dashboard'" routerLink="/dashboard">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Journal
        </a>
        <a class="sidebar__nav-item" [class.sidebar__nav-item--active]="active === 'notifications'" routerLink="/notifications">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Notifications
        </a>
        <a class="sidebar__nav-item" [class.sidebar__nav-item--active]="active === 'todos'" routerLink="/todos">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          To Do List
        </a>
        <a *ngIf="hasFavoriteSparks()" class="sidebar__nav-item" [class.sidebar__nav-item--active]="active === 'favorites'" routerLink="/favorites">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          Favorite Sparks
        </a>
        <a class="sidebar__nav-item" [class.sidebar__nav-item--active]="active === 'account'" routerLink="/account">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          Account
        </a>
        <a *ngIf="isAdmin()" class="sidebar__nav-item" [class.sidebar__nav-item--active]="active === 'admin'" routerLink="/admin">
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
  `,
  styles: [`
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
    .sidebar__logo-wrap {
      display: flex; align-items: center; gap: .625rem;
      padding: 0 1.25rem 1.25rem;
      border-bottom: 1px solid rgba(255,255,255,.07);
      margin-bottom: 1.25rem;
      text-decoration: none;
    }
    .sidebar__logo-icon { height: 28px; width: auto; }
    .sidebar__logo-text {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 1rem; font-weight: 700; color: #fff;
      letter-spacing: 0; line-height: 1;
    }
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
      color: #12C4E3; letter-spacing: -.03em;
    }
    .sidebar__streak-label {
      font-size: .8125rem; font-weight: 600;
      color: rgba(255,255,255,.7); margin-top: .25rem;
    }
    .sidebar__streak-sub {
      font-size: .75rem; color: rgba(255,255,255,.35);
      margin-top: .625rem; line-height: 1.5;
    }
    .sidebar__nav {
      display: flex; flex-direction: column;
      padding: 0 .625rem; gap: .125rem;
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
  `]
})
export class SidebarComponent implements OnInit {
  @Input() active: 'dashboard' | 'notifications' | 'todos' | 'favorites' | 'account' | 'admin' = 'dashboard';

  private api    = inject(ApiService);
  private tokens = inject(TokenService);

  isAdmin          = this.tokens.isAdmin.bind(this.tokens);
  streak           = signal<StreakStats | null>(null);
  hasFavoriteSparks = signal(false);
  username         = computed(() => this.tokens.getCachedUser()?.username ?? '');
  userInitial      = computed(() => (this.tokens.getCachedUser()?.username?.[0] ?? '?').toUpperCase());

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
  }
}
