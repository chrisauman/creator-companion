import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { MotivationEntry } from '../../core/models/models';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-favorite-sparks',
  standalone: true,
  imports: [CommonModule, SidebarComponent, MobileNavComponent],
  template: `
    <div class="page">

      <!-- Desktop sidebar -->
      <app-sidebar active="favorites" />

      <!-- Mobile top bar -->
      <header class="topbar">
        <img src="logo-full.png" alt="Creator Companion" class="topbar__logo">
      </header>

      <!-- Mobile bottom nav -->
      <app-mobile-nav active="favorites" />

      <!-- Main content -->
      <main class="main-content">
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
    .topbar__logo { height: 26px; width: auto; display: block; }

    /* ── Main content ────────────────────────────────────────────── */
    .main-content {
      flex: 1; min-width: 0;
      padding: 1.25rem 1rem calc(80px + env(safe-area-inset-bottom, 0px));
      background: var(--color-bg);
    }
    @media (min-width: 768px) {
      .main-content { padding: 2.5rem 3rem 4rem; background: #f7f7f5; }
    }

    /* ── Page header ─────────────────────────────────────────────── */
    .page-header { margin-bottom: 1.5rem; }
    .page-title {
      font-size: 1.5rem; font-weight: 800; color: var(--color-text);
      font-family: var(--font-display); margin: 0 0 .25rem;
    }
    .page-sub { font-size: .9375rem; color: var(--color-text-2); margin: 0; }

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
