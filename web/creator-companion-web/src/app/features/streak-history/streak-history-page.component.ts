import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { SidebarStateService } from '../../shared/sidebar/sidebar-state.service';
import { MobileHeaderComponent } from '../../shared/mobile-header/mobile-header.component';
import { StreakHistoryComponent } from '../dashboard/streak-history.component';

/**
 * Standalone /streak-history page. Mirrors the chrome of /todos, /favorites
 * and /notifications: sidebar + mobile topbar wrapping a single embedded
 * panel. Exists so the sidebar's "History →" link has somewhere meaningful
 * to land on mobile (the dashboard's right column, where streak-history
 * normally lives, is hidden on phones).
 */
@Component({
  selector: 'app-streak-history-page',
  standalone: true,
  imports: [CommonModule, SidebarComponent, MobileHeaderComponent, StreakHistoryComponent],
  template: `
    <div class="page">
      <app-sidebar />

      <app-mobile-header />

      <main id="main" class="main-content">
        <h1 class="sr-only">Streak history</h1>
        <app-streak-history (returnToToday)="goHome()"></app-streak-history>
      </main>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    @media (min-width: 768px) { .page { flex-direction: row; } }

    .topbar {
      position: sticky; top: 0; z-index: 100;
      background: #111318;
      border-bottom: 1px solid rgba(255,255,255,.07);
      height: 52px;
      display: flex; align-items: center;
      padding: 0 1.5rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; }
    .topbar__brand-icon { height: 24px; width: auto; display: block; }
    .topbar__brand-name { font-family: var(--font-brand); font-size: 1rem; font-weight: 800; letter-spacing: -.01em; color: #fff; }
    .topbar__menu {
      width: 36px; height: 36px;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 10px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 3px;
      padding: 0;
      cursor: pointer;
      margin-right: .5rem;
      transition: background .15s, border-color .15s;
    }
    .topbar__menu:hover {
      background: rgba(255,255,255,.06);
      border-color: rgba(255,255,255,.2);
    }
    .topbar__menu span {
      display: block;
      width: 16px; height: 1.75px;
      background: #fff;
      border-radius: 2px;
    }

    .main-content {
      flex: 1; min-width: 0;
      padding: 0 0 calc(88px + env(safe-area-inset-bottom, 0px));
    }
    @media (min-width: 768px) {
      .main-content { padding-bottom: 2rem; }
    }
  `]
})
export class StreakHistoryPageComponent {
  protected sidebarState = inject(SidebarStateService);
  private router = inject(Router);

  goHome(): void { this.router.navigateByUrl('/dashboard'); }
}
