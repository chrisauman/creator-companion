import { Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { PaywallComponent } from './shared/paywall/paywall.component';

/**
 * App root. Renders the router outlet for normal navigation and an
 * always-on-top <app-paywall> overlay whenever the user is logged in
 * but has lost access (trial expired AND no active subscription).
 *
 * Capabilities are loaded eagerly on user change (login + page refresh)
 * so the paywall reflects access state immediately rather than waiting
 * for the user to navigate into a feature that happens to fetch
 * capabilities. The paywall component itself takes over the viewport
 * via fixed positioning + z-index.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, PaywallComponent],
  template: `
    <!-- Skip-to-main-content link: invisible until focused via Tab,
         lets keyboard and screen-reader users jump past the sidebar
         / mobile header / trial banner on every page. WCAG 2.4.1
         "Bypass Blocks" (Level A). The target #main is on the
         <main> element of each routed component. -->
    <a href="#main" class="skip-link">Skip to main content</a>
    <router-outlet />
    @if (showPaywall()) {
      <app-paywall></app-paywall>
    }
  `
})
export class App {
  private auth = inject(AuthService);

  constructor() {
    // Load capabilities whenever the user signal changes. Fires once
    // on mount (if a session is restored from cookies/localStorage)
    // and once on every subsequent login. handleAuth already clears
    // the cache during logout via invalidateCapabilities().
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.auth.loadCapabilities().subscribe({ error: () => {} });
      }
    });
  }

  /** Paywall overlay is visible when capabilities have loaded and
   *  hasAccess is false. While capabilities are still loading we
   *  suppress the paywall to avoid a flash on every page load. */
  showPaywall = computed(() => {
    const caps = this.auth.capabilities();
    if (!caps) return false;
    return !caps.hasAccess;
  });
}
