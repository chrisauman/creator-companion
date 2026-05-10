import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { SidebarStateService } from '../../shared/sidebar/sidebar-state.service';
import { MobileHeaderComponent } from '../../shared/mobile-header/mobile-header.component';
import { ActionItemsCardComponent } from '../dashboard/action-items-card.component';

@Component({
  selector: 'app-todos',
  standalone: true,
  imports: [CommonModule, SidebarComponent, MobileHeaderComponent, ActionItemsCardComponent],
  template: `
    <div class="page">
      <app-sidebar active="todos" />

      <app-mobile-header />
<main class="main-content">
        <!-- No page header here — the sidebar's active "To Do List" item
             already tells the user where they are. -->
        <app-action-items-card />
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
      padding: 0 1.5rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; }
    .topbar__brand-icon { height: 24px; width: auto; display: block; }
    .topbar__brand-name { font-family: var(--font-brand); font-size: 1rem; font-weight: 800; letter-spacing: -.01em; color: #fff; }
    /* Hamburger — light-on-dark mobile topbar variant. Same styling as
       the matching button in the other standalone pages. */
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
      /* 1.5rem horizontal gutter matches the rest of the app's
         standalone pages (today-panel, entry-card, support-wrap). */
      padding: 1.25rem 1.5rem calc(80px + env(safe-area-inset-bottom, 0px));
      /* White (not cream) on mobile — the to-do list reads cleaner on
         pure white; the cream paper feel is reserved for the journaling
         surfaces (entries, sparks, prompts). */
      background: #fff;
    }
    @media (min-width: 768px) {
      .main-content { padding: 2.5rem 3rem 4rem; background: #f7f7f5; }
    }
    /* Make sure the page wrapper itself stays white on mobile too,
       so any uncovered area (around the action items card) doesn't
       reveal a cream backdrop. */
    @media (max-width: 767px) {
      .page { background: #fff; }
    }

    .page-header { margin-bottom: 1.75rem; }
    .page-title { font-size: 1.5rem; font-weight: 900; letter-spacing: -.02em; margin-bottom: .25rem; }
    .page-sub { font-size: .9375rem; color: var(--color-text-2); }
  `]
})
export class TodosComponent {
  /** Mobile topbar hamburger → opens slide-in sidebar drawer. */
  protected sidebarState = inject(SidebarStateService);
}
