import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { MotivationEntry } from '../../core/models/models';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
@Component({
  selector: 'app-favorite-sparks',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent],
  template: `
    <div class="page" [class.page--embedded]="embedded">

      <!-- Page chrome — hidden when embedded inside the dashboard right column -->
      @if (!embedded) {
        <app-sidebar active="favorites" />
        <header class="topbar">
          <a class="topbar__brand" routerLink="/dashboard">
            <img src="logo-icon.png" alt="" class="topbar__brand-icon">
            <span class="topbar__brand-name">Creator Companion</span>
          </a>
        </header>
      }

      <!-- Main content -->
      <main class="main-content">

        <!-- Reader-style top bar (embedded only). Same pattern as
             the entry reader: 64px sticky surface with an inner row
             capped at max-width 760px so toolbar and body share
             horizontal edges. -->
        @if (embedded) {
          <div class="reader-top">
            <div class="reader-top__inner">
              <button class="cancel-pill" type="button" (click)="returnToToday.emit()">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/>
                </svg>
                Today
              </button>
              <div class="reader-top__breadcrumb"><strong>Favorite Sparks</strong></div>
              <div class="reader-top__actions"></div>
            </div>
          </div>
        }

        <div class="body-inner">
          <div class="page-header">
            <h1 class="page-title">Favorite Sparks</h1>
            <p class="page-sub">Daily sparks you've saved.</p>
          </div>

        <!-- Loading -->
        @if (loading()) {
          <div class="sparks-list">
            @for (i of [1,2,3]; track i) {
              <div class="spark-card spark-card--skeleton">
                <div class="skeleton-line skeleton-line--short"></div>
                <div class="skeleton-line"></div>
              </div>
            }
          </div>
        }

        <!-- Empty -->
        @if (!loading() && sparks().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">🔥</div>
            <p class="empty-text">No favorite sparks yet.</p>
            <p class="empty-sub">Tap the heart on your Daily Spark to save it here.</p>
          </div>
        }

        <!-- Spark list -->
        @if (!loading() && sparks().length > 0) {
          <div class="sparks-list">
            @for (spark of sparks(); track spark.id) {
              <div class="spark-card" [class.spark-card--expanded]="expandedId() === spark.id">
                <div class="spark-header" (click)="toggleExpand(spark.id)">
                  <div class="spark-header__left">
                    <span class="spark-label">Daily Spark</span>
                    <p class="spark-takeaway">{{ spark.takeaway }}</p>
                  </div>
                  <div class="spark-actions" (click)="$event.stopPropagation()">
                    <button class="spark-unfavorite"
                      title="Remove from favorites"
                      (click)="unfavorite(spark.id)">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                        fill="currentColor" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                    </button>
                    <button class="spark-toggle" [attr.aria-expanded]="expandedId() === spark.id">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" stroke-width="2.5"
                        stroke-linecap="round" stroke-linejoin="round"
                        [style.transform]="expandedId() === spark.id ? 'rotate(180deg)' : 'rotate(0deg)'"
                        style="transition:transform .25s ease">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="spark-body">
                  <p class="spark-content">{{ spark.fullContent }}</p>
                </div>
              </div>
            }
          </div>
        }
        </div><!-- /.body-inner -->
      </main>
    </div>
  `,
  styles: [`
    /* ── Page shell ─────────────────────────────────────────────── */
    .page {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    @media (min-width: 768px) {
      .page { flex-direction: row; }
    }
    /* Embedded mode — the dashboard's right column hosts this component. */
    .page--embedded { min-height: 0; flex-direction: column; }
    .page--embedded .main-content {
      padding: 0 !important;
      background: transparent !important;
    }

    /* ── Reader-style top bar — full-column-width sticky surface
       holds an inner row capped at 760px so toolbar elements align
       with the body content beneath. */
    .reader-top {
      display: flex;
      align-items: stretch;
      height: 64px;
      background: var(--color-surface);
      position: sticky; top: 0;
      z-index: 5;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .reader-top__inner {
      display: flex;
      align-items: center;
      gap: .5rem;
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      padding: 0 2.5rem;
      box-sizing: border-box;
    }
    .cancel-pill {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: rgba(18,196,227,.1);
      color: var(--color-accent);
      border: 1px solid rgba(18,196,227,.25);
      padding: .375rem .75rem;
      border-radius: 999px;
      font-size: .75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      cursor: pointer;
      font-family: inherit;
      transition: all .15s;
    }
    .cancel-pill:hover {
      background: var(--color-accent);
      color: #0c0e13;
      border-color: var(--color-accent);
    }
    .reader-top__breadcrumb {
      flex: 1;
      text-align: center;
      font-size: .8125rem;
      color: var(--color-text);
    }
    .reader-top__breadcrumb strong { color: var(--color-text); font-weight: 600; }
    .reader-top__actions { display: flex; gap: .5rem; flex-shrink: 0; min-width: 36px; }

    /* Body bounded to 760px to match the reader/edit views. */
    .body-inner {
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      padding: .75rem 2.5rem 3rem;
      box-sizing: border-box;
      color: var(--color-text);
    }

    /* ── Mobile top bar ──────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 100;
      background: #111318;
      border-bottom: 1px solid rgba(255,255,255,.07);
      height: 52px;
      display: flex; align-items: center;
      padding: 0 1.125rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; }
    .topbar__brand-icon { height: 24px; width: auto; display: block; }
    .topbar__brand-name { font-family: var(--font-sans); font-size: .9375rem; font-weight: 700; color: #fff; }

    /* ── Main content ────────────────────────────────────────────── */
    .main-content {
      flex: 1; min-width: 0;
      padding: 0 0 calc(80px + env(safe-area-inset-bottom, 0px));
      background: var(--color-surface);
    }
    @media (min-width: 768px) {
      .main-content { padding: 0 0 4rem; background: var(--color-surface); }
    }

    /* ── Page header ─────────────────────────────────────────────── */
    /* Matches the Daily Spark hero quote / Notifications page-title
       so all column-3 surfaces share the same display ramp. */
    .page-header { margin-bottom: 1.5rem; }
    .page-title {
      font-family: var(--font-sans);
      font-size: 1.25rem; font-weight: 700;
      letter-spacing: -.01em;
      line-height: 1.3;
      color: var(--color-text);
      margin: 0 0 .25rem;
    }
    .page-sub { font-size: .9375rem; color: var(--color-text); margin: 0; line-height: 1.5; }

    /* ── Spark card ──────────────────────────────────────────────── */
    .sparks-list { display: flex; flex-direction: column; gap: .75rem; }

    .spark-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      transition: border-color .15s, box-shadow .15s;
      &:hover { border-color: var(--color-accent); box-shadow: var(--shadow-md); }
    }
    .spark-card--skeleton {
      padding: 1rem 1.25rem;
      pointer-events: none;
    }
    .spark-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem; padding: 1rem 1.25rem; cursor: pointer; user-select: none;
    }
    .spark-header__left { flex: 1; min-width: 0; }
    .spark-label {
      font-size: .6875rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; color: var(--color-accent);
      display: block; margin-bottom: .3rem;
    }
    .spark-takeaway {
      font-size: .9375rem; color: var(--color-text); margin: 0; line-height: 1.7;
    }
    .spark-actions {
      display: flex; align-items: center; gap: .25rem; flex-shrink: 0; margin-top: .1rem;
    }
    .spark-unfavorite {
      background: none; border: none; cursor: pointer;
      color: #e11d48; padding: .1rem;
      display: flex; align-items: center;
      transition: transform .1s, opacity .15s;
      &:hover { opacity: .7; transform: scale(1.15); }
    }
    .spark-toggle {
      background: none; border: none; cursor: pointer;
      color: var(--color-text-3); padding: .1rem;
      display: flex; align-items: center;
      &:hover { color: var(--color-accent); }
    }
    .spark-body {
      max-height: 0; overflow: hidden;
      transition: max-height .35s ease, padding .35s ease;
      padding: 0 1.25rem;
    }
    .spark-card--expanded .spark-body { max-height: 600px; padding: 0 1.25rem 1.25rem; }
    .spark-content {
      font-size: .9375rem; line-height: 1.7; color: var(--color-text);
      margin: 0; white-space: pre-wrap;
    }

    /* ── Skeleton ────────────────────────────────────────────────── */
    .skeleton-line {
      height: .875rem; border-radius: 4px;
      background: var(--color-border);
      animation: pulse 1.4s ease-in-out infinite;
      margin-bottom: .625rem;
    }
    .skeleton-line--short { width: 40%; height: .625rem; margin-bottom: .5rem; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .4; }
    }

    /* ── Empty state ─────────────────────────────────────────────── */
    .empty-state {
      text-align: center; padding: 4rem 1rem;
    }
    .empty-icon { font-size: 2.5rem; margin-bottom: 1rem; }
    .empty-text {
      font-size: 1rem; font-weight: 600; color: var(--color-text); margin: 0 0 .375rem;
    }
    .empty-sub { font-size: .875rem; color: var(--color-text-2); margin: 0; }
  `]
})
export class FavoriteSparksComponent implements OnInit {
  private api = inject(ApiService);

  /** When true, the component is rendered inside the dashboard's right
   *  column rather than as a /favorites page. Hides the page-level
   *  sidebar/topbar/mobile-nav chrome and shows a reader-style top bar
   *  with a Today return pill instead. */
  @Input() embedded = false;

  /** Emitted when the user clicks the Today pill in the embedded top bar. */
  @Output() returnToToday = new EventEmitter<void>();

  sparks   = signal<MotivationEntry[]>([]);
  loading  = signal(true);
  expandedId = signal<string | null>(null);

  ngOnInit(): void {
    this.api.getFavoriteSparks().subscribe({
      next: sparks => { this.sparks.set(sparks); this.loading.set(false); },
      error: ()    => { this.sparks.set([]);     this.loading.set(false); }
    });
  }

  toggleExpand(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  unfavorite(id: string): void {
    // Optimistic remove from list
    this.sparks.update(list => list.filter(s => s.id !== id));
    this.api.toggleSparkFavorite(id).subscribe({
      error: () => {
        // On error, reload the list to restore correct state
        this.api.getFavoriteSparks().subscribe({ next: s => this.sparks.set(s) });
      }
    });
  }
}
