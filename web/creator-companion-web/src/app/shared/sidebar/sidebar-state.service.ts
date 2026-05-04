import { Injectable, signal } from '@angular/core';

/**
 * Coordinates the sidebar's mobile drawer state across components.
 * The dashboard's mobile-header hamburger calls openMobile() / closeMobile();
 * the SidebarComponent reads `mobileOpen` to slide itself in/out.
 *
 * Closing the drawer when navigating: the SidebarComponent listens to
 * router events internally (no need for callers to remember to close).
 */
@Injectable({ providedIn: 'root' })
export class SidebarStateService {
  /** True while the mobile drawer is visible (slid in over the content). */
  readonly mobileOpen = signal<boolean>(false);

  openMobile(): void { this.mobileOpen.set(true); }
  closeMobile(): void { this.mobileOpen.set(false); }
  toggleMobile(): void { this.mobileOpen.update(v => !v); }
}
