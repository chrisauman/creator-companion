import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { ActionItemsCardComponent } from '../dashboard/action-items-card.component';

@Component({
  selector: 'app-todos',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent, ActionItemsCardComponent],
  template: `
    <div class="page">
      <app-sidebar active="todos" />

      <!-- Mobile top nav -->
      <header class="topnav">
        <div class="topnav__inner container">
          <img src="logo-full.png" alt="Creator Companion" class="topnav__logo-img">
          <a class="nav-link" routerLink="/account">Account</a>
        </div>
      </header>

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

    .topnav {
      position: sticky; top: 0; z-index: 100;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      height: var(--nav-h);
    }
    @media (min-width: 768px) { .topnav { display: none; } }
    .topnav__inner { display: flex; align-items: center; justify-content: space-between; height: 100%; }
    .topnav__logo-img { height: 28px; width: auto; display: block; }
    .nav-link { color: var(--color-accent); font-size: .9375rem; font-weight: 500; text-decoration: none; }

    .main-content {
      flex: 1; min-width: 0;
      padding: 1.5rem 1rem 4rem;
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
