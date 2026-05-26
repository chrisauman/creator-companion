import {
  AfterViewInit, Component, ElementRef, EventEmitter,
  OnDestroy, Output, ViewChild
} from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Cloudflare Turnstile widget wrapper.
 *
 * Used on every public auth form (login, register, forgot-password)
 * to provide bot-protection token to the backend. The widget script
 * is loaded once globally in index.html with render=explicit; this
 * component handles the per-instance mount/unmount + token plumbing
 * so individual auth components don't repeat the boilerplate.
 *
 * Usage:
 *   <app-turnstile (verified)="onVerified($event)" #ts></app-turnstile>
 *
 * After a failed submit, call ts.reset() to clear the consumed token
 * — Turnstile tokens are single-use, so any re-submission needs a
 * fresh one. Otherwise the second submit reuses a stale token and
 * the backend rejects it with "timeout-or-duplicate".
 *
 * Failure modes covered:
 *  · Script not loaded yet on mount: polls every 100ms up to 5s
 *    then gives up silently (emits no token; submit will hit the
 *    backend's missing-token rejection which surfaces a clean UX
 *    error rather than a half-broken widget).
 *  · Widget render error: silently noop; same UX path as above.
 *  · Component destroyed mid-widget-lifecycle: removes the widget
 *    so the global script doesn't leak DOM references.
 */
@Component({
  selector: 'app-turnstile',
  standalone: true,
  template: `<div #widget class="turnstile-widget"></div>`,
  styles: [`
    .turnstile-widget {
      /* Reserve vertical space so the form doesn't shift when the
         widget mounts after a beat. Turnstile widgets are ~65px tall
         in their compact form. */
      min-height: 65px;
      display: flex;
      justify-content: center;
      margin: .5rem 0;
    }
  `]
})
export class TurnstileComponent implements AfterViewInit, OnDestroy {
  @ViewChild('widget') widget!: ElementRef<HTMLDivElement>;

  /** Emits the token when Cloudflare confirms the user is human.
   *  This token must be included in the next auth POST and is
   *  single-use; reset() before re-submitting. */
  @Output() verified = new EventEmitter<string>();

  /** Emits when the token expires (5 minutes after issuance) so the
   *  form can either auto-reset or surface a "please verify again"
   *  prompt. */
  @Output() expired = new EventEmitter<void>();

  /** Emits if Turnstile itself reports an internal error (rare —
   *  documented codes at developers.cloudflare.com). */
  @Output() errored = new EventEmitter<void>();

  private widgetId: string | null = null;

  ngAfterViewInit(): void {
    this.tryRender();
  }

  /**
   * Resets the widget to a fresh state. Cloudflare reissues a new
   * token via the (verified) emitter once the user re-passes the
   * (usually invisible) challenge.
   */
  reset(): void {
    const ts = getTurnstileApi();
    if (ts && this.widgetId) {
      ts.reset(this.widgetId);
    }
  }

  ngOnDestroy(): void {
    const ts = getTurnstileApi();
    if (ts && this.widgetId) {
      try { ts.remove(this.widgetId); } catch { /* widget may already be gone */ }
    }
  }

  private tryRender(attempts = 0): void {
    const ts = getTurnstileApi();
    if (!ts) {
      // Script tag in index.html has async + defer. On a cold load
      // it may not be ready by the time this component mounts.
      // Poll up to 50 times at 100ms = 5s. After that the widget
      // simply won't appear; the user can't submit because the
      // form requires a token. Surface gets a clean "please refresh"
      // message via the backend's missing-token rejection.
      if (attempts < 50) {
        setTimeout(() => this.tryRender(attempts + 1), 100);
      }
      return;
    }

    try {
      this.widgetId = ts.render(this.widget.nativeElement, {
        sitekey: environment.turnstileSiteKey,
        callback: (token: string) => this.verified.emit(token),
        'expired-callback': () => this.expired.emit(),
        'error-callback':   () => this.errored.emit(),
        theme: 'light',
      });
    } catch {
      // Render failed — most commonly because the hostname doesn't
      // match the Turnstile widget's configured allowlist. Component
      // simply doesn't emit (verified); submit fails with the same
      // clean error path as the script-never-loaded case.
    }
  }
}

/**
 * Loose-typed accessor for window.turnstile so we don't pull a typings
 * package just for the Cloudflare API surface. Returns null when the
 * script hasn't loaded yet.
 */
function getTurnstileApi(): TurnstileApi | null {
  const w = window as unknown as { turnstile?: TurnstileApi };
  return w.turnstile ?? null;
}

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?:   () => void;
      theme?: 'light' | 'dark' | 'auto';
      size?: 'normal' | 'compact';
    }
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
  getResponse(widgetId?: string): string | undefined;
}
