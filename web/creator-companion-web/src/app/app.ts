import { Component, effect, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/services/auth.service';
import { TokenService } from './core/services/token.service';
import { SearchOverlayService } from './core/services/search-overlay.service';
import { PaywallComponent } from './shared/paywall/paywall.component';
import { SearchOverlayComponent } from './shared/search-overlay/search-overlay.component';

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
  imports: [CommonModule, RouterOutlet, PaywallComponent, SearchOverlayComponent],
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
    <!-- Global search overlay. Mounted here (not inside the sidebar)
         because the mobile sidebar uses CSS transforms, which create
         a new containing block for position:fixed descendants — the
         overlay would no longer cover the viewport. App root has no
         transforms; overlay's inset:0 + position:fixed lands on the
         viewport edges as intended. Rendering is gated internally
         by SearchOverlayService.isOpen(). -->
    <app-search-overlay />
  `
})
export class App {
  private auth          = inject(AuthService);
  private tokens        = inject(TokenService);
  private router        = inject(Router);
  private searchOverlay = inject(SearchOverlayService);

  /** Mirror of AuthService.showPaywall — kept here as a thin reference
   *  rather than recomputed locally so the dismissal + preview logic
   *  lives in one place (the service). */
  showPaywall = this.auth.showPaywall;

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

    // Admin-only paywall preview toggle. When ?preview=paywall is in
    // the URL AND the current user is an admin, flip the paywall into
    // preview mode so the admin can walk through what a trial-expired
    // user sees without changing their own subscription/trial state.
    // Removing the param (or navigating somewhere without it) clears
    // preview. Non-admin users with the param in the URL are ignored —
    // it's never honored for them.
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        const params = new URL(window.location.href).searchParams;
        const wantsPreview = params.get('preview') === 'paywall' && this.tokens.isAdmin();
        this.auth.setPaywallPreview(wantsPreview);
      });
  }

  /**
   * Global keyboard shortcut: Cmd+K (Mac) / Ctrl+K (everywhere else)
   * opens the search overlay. preventDefault is critical — Chrome's
   * default Cmd+K opens the address bar in some configurations, and
   * Safari's Cmd+K opens its own toolbar search. We're claiming the
   * shortcut for in-app search instead.
   *
   * Skip when an editable field has focus so users can type Cmd+K
   * inside an entry body or a search input without surprise. Note:
   * we DO let it fire from inside the overlay's own input — that
   * way the user can toggle the overlay closed with the same key
   * they opened it with. The overlay's own service.toggle() handles
   * the close case.
   */
  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(e: KeyboardEvent): void {
    const isCmdOrCtrlK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
    if (!isCmdOrCtrlK) return;

    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const isEditableField =
      tag === 'input' || tag === 'textarea' || target?.isContentEditable === true;

    // Allow Cmd+K to ALSO close the overlay when typing in its input
    // (same key in/out feels right). Otherwise skip on editables.
    if (isEditableField && !target?.closest('.search-overlay')) return;

    e.preventDefault();
    this.searchOverlay.toggle();
  }
}
