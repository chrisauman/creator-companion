import {
  Directive, ElementRef, HostListener, OnDestroy, OnInit, inject
} from '@angular/core';

/**
 * Lightweight focus-trap for modal dialogs (Welcome Back overlay,
 * Tour, Paywall, etc.). Apply with the `appFocusTrap` attribute on
 * a host element that already has `role="dialog"` and
 * `aria-modal="true"` set.
 *
 * Behavior:
 *   - On init: focuses the FIRST focusable descendant. If no
 *     focusable descendant is found, falls back to focusing the
 *     host element itself (so screen readers announce the dialog).
 *   - Tab from the LAST focusable wraps to the FIRST.
 *   - Shift+Tab from the FIRST wraps to the LAST.
 *   - On destroy: returns focus to whatever element had focus
 *     before the trap was installed (the "previously focused
 *     element" pattern WCAG / WAI-ARIA recommend for modal close).
 *
 * No CDK dependency — Angular CDK isn't installed in this project,
 * and the modal surface here is small enough that a 50-line
 * standalone directive does the job without the overhead.
 */
@Directive({
  selector: '[appFocusTrap]',
  standalone: true,
})
export class FocusTrapDirective implements OnInit, OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private previouslyFocused: HTMLElement | null = null;

  ngOnInit(): void {
    // Remember whatever was focused so we can restore on close.
    this.previouslyFocused = (document.activeElement as HTMLElement) ?? null;

    // Defer one frame so the dialog's content has rendered before
    // we search for focusable descendants — useful when the host
    // template uses *ngIf around the body content.
    queueMicrotask(() => this.focusFirst());
  }

  ngOnDestroy(): void {
    // Return focus to where the user came from. Wrap in try/catch
    // because the previously-focused element may have been removed
    // from the DOM while the dialog was open (e.g. a parent route
    // unmounted underneath).
    try {
      this.previouslyFocused?.focus?.();
    } catch { /* element no longer focusable — nothing to do */ }
  }

  @HostListener('keydown.tab', ['$event'])
  onTab(ev: Event): void { this.handleTab(ev as KeyboardEvent, false); }

  @HostListener('keydown.shift.tab', ['$event'])
  onShiftTab(ev: Event): void { this.handleTab(ev as KeyboardEvent, true); }

  private handleTab(ev: KeyboardEvent, reverse: boolean): void {
    const items = this.focusables();
    if (items.length === 0) {
      ev.preventDefault();
      this.host.nativeElement.focus();
      return;
    }
    const first = items[0];
    const last  = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (reverse && active === first) {
      ev.preventDefault();
      last.focus();
    } else if (!reverse && active === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  private focusFirst(): void {
    const items = this.focusables();
    if (items.length > 0) {
      items[0].focus();
    } else {
      // No focusable descendants → make the host itself focusable
      // and give it focus so screen readers announce the dialog.
      const host = this.host.nativeElement;
      if (!host.hasAttribute('tabindex')) host.setAttribute('tabindex', '-1');
      host.focus();
    }
  }

  /** All keyboard-focusable elements inside the dialog, in DOM order.
   *  Filters out invisible / disabled / aria-hidden elements. */
  private focusables(): HTMLElement[] {
    const sel = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const nodes = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(sel)
    );
    return nodes.filter(el =>
      !el.hasAttribute('aria-hidden') &&
      el.offsetParent !== null   // simple visibility check
    );
  }
}
