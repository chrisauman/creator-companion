import { Injectable, signal } from '@angular/core';

/**
 * Tiny coordination service for the global search overlay. The overlay
 * itself lives in the sidebar component (rendered once per page that
 * shows the sidebar — i.e., everywhere a logged-in user goes), but any
 * component anywhere in the app needs to be able to OPEN it:
 *  - The sidebar's "search" icon button (next to compose) calls open()
 *  - The global Cmd+K / Ctrl+K keyboard listener calls open()
 *  - The overlay itself calls close() on result-click, Esc, or close-tap
 *
 * Decoupling open/close state behind a service means none of these
 * trigger sites need a reference to the overlay component — they just
 * inject the service and toggle the signal. The overlay subscribes to
 * isOpen() to render itself in/out.
 */
@Injectable({ providedIn: 'root' })
export class SearchOverlayService {
  /** Public read-only state — the overlay component renders based on this. */
  readonly isOpen = signal(false);

  open(): void {
    // Idempotent: opening when already open is a no-op (avoids re-firing
    // any auto-focus side effects the overlay might run on first open).
    if (!this.isOpen()) this.isOpen.set(true);
  }

  close(): void {
    if (this.isOpen()) this.isOpen.set(false);
  }

  /** Convenience for the keyboard shortcut — flips the state. */
  toggle(): void {
    this.isOpen.update(open => !open);
  }
}
