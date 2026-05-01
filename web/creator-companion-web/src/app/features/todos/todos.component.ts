import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';
import { ActionItemsCardComponent } from '../dashboard/action-items-card.component';

@Component({
  selector: 'app-todos',
  standalone: true,
  imports: [CommonModule, SidebarComponent, MobileNavComponent, ActionItemsCardComponent],
  template: `
    <div class="page">
      <app-sidebar active="todos" />

      <!-- Mobile top bar -->
      <header class="topbar">
        <img src="logo-full.png" alt="Creator Companion" class="topbar__logo">
      </header>

      <!-- Mobile bottom nav -->
      <app-mobile-nav active="todos" />

      <main class="main-content">
        <div class="page-header">
          <h1 class="page-title">To Do List</h1>
          <p class="page-sub">Your daily reminders and next actions.</p>
        </div>
        <app-action-items-card [startExpanded]="true" />
      </main>
    </div>
  `,
  styles: [`
    .page {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    @media (min-width: 768px) {
      .page { flex-direction: row; }
    }

    .topbar {
      position: sticky; top: 0; z-index: 100;
      background: #111318;
      border-bottom: 1px solid rgba(255,255,255,.07);
      height: 52px;
      display: flex; align-items: center;
      padding: 0 1.125rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__logo { height: 26px; width: auto; display: block; }

    .main-content {
      flex: 1; min-width: 0;
      padding: 1.25rem 1rem calc(80px + env(safe-area-inset-bottom, 0px));
      background: var(--color-bg);
    }
    @media (min-width: 768px) {
      .main-content { padding: 2.5rem 3rem 4rem; background: #f7f7f5; }
    }

    .page-header { margin-bottom: 1.75rem; }
    .page-title { font-size: 1.5rem; font-weight: 900; letter-spacing: -.02em; margin-bottom: .25rem; }
    .page-sub { font-size: .9375rem; color: var(--color-text-2); }
  `]
})
export class TodosComponent {}
