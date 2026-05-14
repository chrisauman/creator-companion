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
    <!-- Skip-to-main-content link for WCAG 2.4.1 ("Bypass Blocks",
         Level A). Hidden until keyboard-focused. The inline style
         attribute is intentional and load-bearing — it hides the
         link from the very first paint, before the external
         stylesheet finishes loading. The previous CSS-only approach
         (transform: translateY(-110%)) caused a visible flash on
         every page load because the link briefly rendered in normal
         document flow before the CSS suppressed it. CSS in
         styles.scss handles the :focus state and uses !important to
         override these inline values when the user tabs to the link. -->
    <a href="#main"
       class="skip-link"
       style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden">
      Skip to main content
    </a>
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
