import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TokenService } from '../../core/services/token.service';

@Component({
  selector: 'app-mobile-nav',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="mobile-nav">

      <!-- Journal -->
      <a class="mobile-nav__item" routerLink="/dashboard"
         [class.mobile-nav__item--active]="active === 'dashboard'">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span>Journal</span>
      </a>

      <!-- Reminders -->
      <a class="mobile-nav__item" routerLink="/notifications"
         [class.mobile-nav__item--active]="active === 'notifications'">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span>Reminders</span>
      </a>

      <!-- To Do -->
      <a class="mobile-nav__item" routerLink="/todos"
         [class.mobile-nav__item--active]="active === 'todos'">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <span>To Do</span>
      </a>

      <!-- Favorite Sparks (paid users with at least one favorite) -->
      <a *ngIf="hasFavorites()" class="mobile-nav__item" routerLink="/favorites"
         [class.mobile-nav__item--active]="active === 'favorites'">
        <svg width="22" height="22" viewBox="0 0 24 24"
          [attr.fill]="active === 'favorites' ? 'currentColor' : 'none'"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span>Sparks</span>
      </a>

      <!-- Account -->
      <a class="mobile-nav__item" routerLink="/account"
         [class.mobile-nav__item--active]="active === 'account'">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
        <span>Account</span>
      </a>

    </nav>
  `,
  styles: [`
    .mobile-nav {
      display: flex;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 200;
      background: #111318;
      border-top: 1px solid rgba(255,255,255,.08);
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    @media (min-width: 768px) {
      .mobile-nav { display: none; }
    }

    .mobile-nav__item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: .625rem .25rem .5rem;
      color: rgba(255,255,255,.38);
      text-decoration: none;
      font-size: .625rem;
      font-weight: 600;
      letter-spacing: .03em;
      text-transform: uppercase;
      transition: color .15s;
      -webkit-tap-highlight-color: transparent;

      svg { flex-shrink: 0; transition: opacity .15s; opacity: .6; }

      &:hover { color: rgba(255,255,255,.7); text-decoration: none; }
    }

    .mobile-nav__item--active {
      color: #12C4E3;
      svg { opacity: 1; }
    }
  `]
})
export class MobileNavComponent implements OnInit {
  @Input() active: 'dashboard' | 'notifications' | 'todos' | 'favorites' | 'account' = 'dashboard';

  private api    = inject(ApiService);
  private tokens = inject(TokenService);

  private static readonly CACHE_KEY = 'cc_has_favorites';

  // Read from sessionStorage immediately so the icon never flickers on mount
  hasFavorites = signal(sessionStorage.getItem(MobileNavComponent.CACHE_KEY) === '1');

  ngOnInit(): void {
    const user = this.tokens.getCachedUser();
    if (user?.tier === 'Paid') {
      this.api.getFavoriteSparks().subscribe({
        next: sparks => {
          const has = sparks.length > 0;
          sessionStorage.setItem(MobileNavComponent.CACHE_KEY, has ? '1' : '0');
          this.hasFavorites.set(has);
        },
        error: () => {}
      });
    }
  }
}
