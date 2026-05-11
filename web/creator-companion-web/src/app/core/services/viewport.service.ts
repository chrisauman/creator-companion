import { Injectable, signal, computed } from '@angular/core';

/**
 * Single source of truth for the desktop-vs-mobile viewport split.
 *
 * Replaces ~8 places that previously read `window.innerWidth >= 768`
 * directly. The raw read is non-reactive (no re-render on resize) and
 * doesn't account for tablet portrait↔landscape rotation. This service
 * exposes a reactive `isDesktop` signal updated on resize/orientation
 * change, plus a static helper for ngOnInit branching where reactivity
 * isn't needed.
 *
 * Matches the existing `@media (min-width: 768px)` SCSS breakpoint so
 * JS-driven layout decisions stay in sync with CSS.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private static readonly DESKTOP_MIN_PX = 768;

  /** Reactive — re-renders consumers on resize / orientationchange. */
  private _width = signal<number>(this.readWidth());

  readonly width = this._width.asReadonly();
  readonly isDesktop = computed(() => this._width() >= ViewportService.DESKTOP_MIN_PX);
  readonly isMobile  = computed(() => this._width() <  ViewportService.DESKTOP_MIN_PX);

  constructor() {
    if (typeof window === 'undefined') return;

    // Debounced update — resize fires many times per drag. requestAnimationFrame
    // collapses bursts to one update per frame.
    let pending = false;
    const onResize = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        this._width.set(this.readWidth());
        pending = false;
      });
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
  }

  private readWidth(): number {
    return typeof window !== 'undefined' ? window.innerWidth : 0;
  }

  /** Non-reactive snapshot. Use only in event handlers where the
   *  decision is bound to "what's the viewport NOW" (e.g. click
   *  routing). Components that need reactive layout should use the
   *  `isDesktop` signal. */
  static isDesktopNow(): boolean {
    return typeof window !== 'undefined' && window.innerWidth >= ViewportService.DESKTOP_MIN_PX;
  }
}
