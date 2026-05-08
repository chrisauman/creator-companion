import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { SidebarStateService } from '../sidebar/sidebar-state.service';

/**
 * Shared mobile-only header. Sticky bar with three slots:
 *   [hamburger] [logo + brand name (clickable, → /dashboard)] [Create Entry pill]
 *
 * Hidden on viewports >= 768px (the desktop sidebar replaces it).
 *
 * Used on every authed page so the chrome stays consistent. Previously
 * each standalone page either rolled its own slim dark variant
 * (.topbar) or had nothing at all (entry view), which made navigation
 * feel discontinuous as the user moved between sections.
 *
 * Compose click navigates to /entry/new — same destination the
 * dashboard's mobile compose already routes to.
 */
@Component({
  selector: 'app-mobile-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="mobile-header">
      <button class="mobile-header__hamburger" type="button"
              (click)="sidebarState.openMobile()"
              title="Open menu" aria-label="Open menu">
        <span></span><span></span><span></span>
      </button>
      <a class="mobile-header__logo" routerLink="/dashboard">
        <img src="logo-icon.png" alt="" class="mobile-header__logo-icon">
        <span class="mobile-header__logo-name">Creator Companion</span>
      </a>
      <button class="mobile-header__compose" type="button" (click)="compose()"
              title="Create entry" aria-label="Create entry">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
  `,
  styles: [`
    .mobile-header {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: 1rem 1.125rem;
      background: var(--color-bg);
      border-bottom: 1px solid var(--color-border);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    @media (min-width: 768px) {
      .mobile-header { display: none; }
    }
    /* Hamburger — bumped from 40px to 46px (matches Apple HIG min
       touch-target of 44pt with a small visual cushion) and the bars
       widened/thickened proportionally so the icon feels balanced
       against the new hit area. */
    .mobile-header__hamburger {
      width: 46px; height: 46px;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid var(--color-border);
      border-radius: 12px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 5px;
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
      width: 22px; height: 2px;
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
      /* Brand wordmark — must be live Fraunces text to match the
         desktop sidebar's wordmark (per CLAUDE.md brand rules). The
         previous --font-sans value rendered as Inter on mobile,
         which broke brand consistency. */
      font-family: var(--font-brand);
      font-size: 1rem;
      font-weight: 800;
      letter-spacing: -.01em;
      color: var(--color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Hide the brand text on very narrow phones to make room. */
    @media (max-width: 360px) {
      .mobile-header__logo-name { display: none; }
    }
    /* Compose CTA — black-circle "+" on mobile. The earlier "Create
       Entry" pill ate too much horizontal space and pushed the
       wordmark behind it on narrow viewports. The icon-only circle
       gives the wordmark room to breathe and matches the
       hamburger's hit area on the opposite side, balancing the bar. */
    .mobile-header__compose {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      /* 46px matches the new hamburger size — the bar reads as
         visually balanced when the two end caps are the same. */
      width: 46px;
      height: 46px;
      background: #0c0e13;
      color: #fff;
      border: none;
      border-radius: 50%;
      padding: 0;
      cursor: pointer;
      transition: background .15s, transform .15s;
    }
    .mobile-header__compose:hover {
      background: var(--color-accent);
      color: #fff;
      transform: translateY(-1px);
    }
  `]
})
export class MobileHeaderComponent {
  protected sidebarState = inject(SidebarStateService);
  private router = inject(Router);

  /** Default behavior — navigate to the new-entry page. The dashboard
   *  has its own inline compose flow on desktop, but on mobile every
   *  page (including dashboard) routes to /entry/new for a fresh entry. */
  compose(): void {
    this.router.navigateByUrl('/entry/new');
  }
}
