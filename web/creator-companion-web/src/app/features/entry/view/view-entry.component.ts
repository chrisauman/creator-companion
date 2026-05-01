import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { Entry } from '../../../core/models/models';
import { getMoodEmoji } from '../../../core/constants/moods';
import { marked } from 'marked';
import { SidebarComponent } from '../../../shared/sidebar/sidebar.component';
import { MobileNavComponent } from '../../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-view-entry',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent, MobileNavComponent],
  template: `
    <div class="page">

      <!-- Desktop sidebar -->
      <app-sidebar active="dashboard" />

      <!-- Mobile top bar -->
      <header class="topbar">
        <a class="topbar__brand" routerLink="/dashboard">
          <img src="logo-icon.png" alt="" class="topbar__brand-icon">
          <span class="topbar__brand-name">Creator Companion</span>
        </a>
        <div class="topbar__actions">
          @if (entry()) {
            <button class="icon-btn" [class.icon-btn--active]="isFavorited()"
              [title]="isFavorited() ? 'Remove from favorites' : 'Add to favorites'"
              (click)="toggleFavorite()" [disabled]="favoriteLoading()">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                [attr.fill]="isFavorited() ? 'currentColor' : 'none'"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
            <a class="btn btn--ghost btn--sm" [routerLink]="['/entry', entryId, 'edit']">Edit</a>
          }
        </div>
      </header>

      <!-- Mobile bottom nav -->
      <app-mobile-nav active="dashboard" />

      <!-- Main content -->
      <main class="main-content">

        <!-- Desktop-only action bar above the entry -->
        <div class="desktop-bar">
          <button class="btn btn--ghost btn--sm" routerLink="/dashboard">← Back to Journal</button>
          @if (entry()) {
            <div class="desktop-bar__actions">
              <button class="icon-btn" [class.icon-btn--active]="isFavorited()"
                [title]="isFavorited() ? 'Remove from favorites' : 'Add to favorites'"
                (click)="toggleFavorite()" [disabled]="favoriteLoading()">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                  [attr.fill]="isFavorited() ? 'currentColor' : 'none'"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
              <a class="btn btn--ghost btn--sm" [routerLink]="['/entry', entryId, 'edit']">Edit</a>
            </div>
          }
        </div>

        @if (loading()) {
          <div class="loading-state">Loading…</div>
        }

        @if (loadError()) {
          <div class="error-state">
            <p>Could not load this entry. It may have been deleted or there was a connection problem.</p>
            <a routerLink="/dashboard" class="btn btn--secondary btn--sm">Back to dashboard</a>
          </div>
        }

        @if (!loading() && entry()) {
          <article class="entry-card">

            <!-- Title -->
            <h1 class="entry-title">{{ entry()!.title }}</h1>

            <!-- Meta row: date + mood -->
            <div class="entry-meta">
              <span class="entry-meta__date">{{ entryDateLabel() }}</span>
              @if (entry()!.mood) {
                <span class="entry-meta__mood">
                  {{ getMoodEmoji(entry()!.mood!) }} {{ entry()!.mood }}
                </span>
              }
            </div>

            <!-- Backfill notice -->
            @if (entry()!.entrySource === 1) {
              <p class="entry-backfill-notice">Backfilled on {{ createdAtLabel() }}</p>
            }

            <!-- Content -->
            <div class="entry-content" [innerHTML]="renderedContent()"></div>

            <!-- Images -->
            @if (entry()!.media.length > 0) {
              <div class="entry-images">
                @for (img of entry()!.media; track img.id) {
                  <img class="entry-image"
                    [src]="fullImageUrl(img.url)" [alt]="img.fileName"
                    loading="lazy" (error)="onImgError($event)" />
                }
              </div>
            }

            <!-- Tags -->
            @if (entry()!.tags.length > 0) {
              <div class="entry-tags">
                @for (tag of entry()!.tags; track tag) {
                  <a class="entry-tag" [routerLink]="['/entries/by-tag', tag]">#{{ tag }}</a>
                }
              </div>
            }

            <!-- Footer -->
            <div class="entry-footer">
              <a class="btn btn--secondary btn--sm" [routerLink]="['/entry', entryId, 'edit']">
                ✏️ Edit entry
              </a>
            </div>

          </article>
        }
      </main>
    </div>
  `,
  styles: [`
    /* ── Page shell ─────────────────────────────────────────────── */
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    @media (min-width: 768px) { .page { flex-direction: row; } }

    /* ── Mobile top bar ──────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 100;
      background: #111318;
      border-bottom: 1px solid rgba(255,255,255,.07);
      height: 52px;
      display: flex; align-items: center;
      padding: 0 .75rem;
      gap: .5rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; flex-shrink: 0; }
    .topbar__brand-icon { height: 22px; width: auto; display: block; }
    .topbar__brand-name { font-family: 'Fraunces', Georgia, serif; font-size: .875rem; font-weight: 700; color: #fff; }
    .topbar__actions { margin-left: auto; }
    .topbar__actions { display: flex; align-items: center; gap: .25rem; flex-shrink: 0; }

    /* ── Main content ────────────────────────────────────────────── */
    .main-content {
      flex: 1; min-width: 0;
      padding: 0 0 calc(72px + env(safe-area-inset-bottom, 0px));
      background: var(--color-surface);
    }
    @media (min-width: 768px) {
      .main-content { padding: 2rem 3rem 4rem; background: var(--color-surface); }
    }

    /* ── Desktop action bar ──────────────────────────────────────── */
    .desktop-bar {
      display: none;
    }
    @media (min-width: 768px) {
      .desktop-bar {
        display: flex; align-items: center; justify-content: space-between;
        max-width: 720px; margin: 0 auto 1.25rem;
      }
    }
    .desktop-bar__actions { display: flex; align-items: center; gap: .5rem; }

    /* ── States ──────────────────────────────────────────────────── */
    .loading-state {
      padding: 3rem 1.5rem; text-align: center;
      color: var(--color-text-3); font-size: .9375rem;
    }
    .error-state {
      padding: 3rem 1.5rem; text-align: center;
      p { color: var(--color-text-2); margin-bottom: 1rem; }
    }
    @media (min-width: 768px) {
      .error-state { max-width: 680px; margin: 0 auto; }
    }

    /* ── Entry card ──────────────────────────────────────────────── */
    .entry-card {
      /* Mobile: full-bleed, no card chrome */
      padding: 1.5rem 1.125rem 3rem;
    }
    @media (min-width: 768px) {
      .entry-card {
        max-width: 720px;
        margin: 0 auto;
        padding: 0 0 3rem;
      }
    }

    /* ── Icon button (star/favorite) ─────────────────────────────── */
    .icon-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 50%;
      border: none; background: transparent; cursor: pointer;
      color: var(--color-text-3); padding: 0;
      transition: color .15s, transform .1s;
      &:hover:not(:disabled) { color: var(--color-accent); transform: scale(1.1); }
      &--active { color: var(--color-accent); }
      &:disabled { opacity: .5; cursor: not-allowed; }
    }

    /* ── Entry typography ────────────────────────────────────────── */
    .entry-title {
      font-size: clamp(1.375rem, 5vw, 2rem);
      font-weight: 800; line-height: 1.2;
      color: var(--color-text); margin: 0 0 .875rem;
    }
    .entry-meta {
      display: flex; align-items: center; gap: .875rem;
      margin-bottom: 1.75rem; flex-wrap: wrap;
    }
    .entry-meta__date { font-size: .875rem; color: var(--color-text-3); font-weight: 500; }
    .entry-meta__mood {
      font-size: .875rem; font-weight: 500; color: var(--color-text-2);
      background: var(--color-surface-2); border: 1px solid var(--color-border);
      padding: .2rem .65rem; border-radius: 100px;
      display: flex; align-items: center; gap: .3rem;
    }
    .entry-backfill-notice {
      font-size: .8125rem; color: var(--color-text-3);
      margin-bottom: 1.25rem; font-style: italic;
    }

    /* ── Rendered content ────────────────────────────────────────── */
    .entry-content {
      font-family: var(--font-serif);
      font-size: 1.0625rem;
      line-height: 1.85;
      color: var(--color-text);
      margin-bottom: 2rem;
      ::ng-deep p { margin: 0 0 .75em; &:last-child { margin-bottom: 0; } }
      ::ng-deep h2 {
        font-family: var(--font-sans, system-ui); font-size: 1.2rem; font-weight: 700;
        margin: 1.5rem 0 .5rem; color: var(--color-text);
      }
      ::ng-deep ul, ::ng-deep ol { padding-left: 1.5rem; margin: .25rem 0 .75rem; }
      ::ng-deep li { line-height: 1.7; margin-bottom: .2rem; }
      ::ng-deep ul { list-style-type: disc; }
      ::ng-deep ol { list-style-type: decimal; }
      ::ng-deep strong { font-weight: 700; }
      ::ng-deep em { font-style: italic; }
    }

    /* ── Images ──────────────────────────────────────────────────── */
    .entry-images { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2rem; }
    .entry-image {
      width: 100%; height: auto; border-radius: var(--radius-lg); display: block;
      box-shadow: 0 2px 12px rgba(0,0,0,.08);
    }

    /* ── Tags ────────────────────────────────────────────────────── */
    .entry-tags {
      display: flex; flex-wrap: wrap; gap: .5rem;
      padding-top: 1.5rem; margin-bottom: 2rem;
      border-top: 1px solid var(--color-border-light);
    }
    .entry-tag {
      font-size: .875rem; font-weight: 500;
      color: var(--color-accent-dark); background: var(--color-accent-light);
      border: 1px solid var(--color-accent);
      padding: .25rem .75rem; border-radius: 100px;
      text-decoration: none; transition: background .15s, color .15s;
      &:hover { background: var(--color-accent); color: #fff; }
    }

    /* ── Footer ──────────────────────────────────────────────────── */
    .entry-footer { padding-top: 1rem; border-top: 1px solid var(--color-border-light); }
  `]
})
export class ViewEntryComponent implements OnInit {
  private api       = inject(ApiService);
  private auth      = inject(AuthService);
  private router    = inject(Router);
  private route     = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  readonly getMoodEmoji = getMoodEmoji;

  entryId  = '';
  entry    = signal<Entry | null>(null);
  loading   = signal(true);
  loadError = signal(false);
  isFavorited     = signal(false);
  favoriteLoading = signal(false);
  canFavorite     = signal(false);

  renderedContent = computed((): SafeHtml => {
    const raw = this.entry()?.contentText ?? '';
    if (!raw) return '';
    const html = raw.trimStart().startsWith('<')
      ? raw
      : marked.parse(raw) as string;
    const safe = this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
    return this.sanitizer.bypassSecurityTrustHtml(safe);
  });

  ngOnInit(): void {
    this.entryId = this.route.snapshot.paramMap.get('id') ?? '';

    this.auth.loadCapabilities().subscribe(caps => {
      this.canFavorite.set(caps.canFavorite);
    });

    this.api.getEntry(this.entryId).subscribe({
      next: e => {
        this.entry.set(e);
        this.isFavorited.set(e.isFavorited ?? false);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.loadError.set(true); }
    });
  }

  entryDateLabel(): string {
    if (!this.entry()) return '';
    return new Date(this.entry()!.entryDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  createdAtLabel(): string {
    if (!this.entry()) return '';
    return new Date(this.entry()!.createdAt).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  fullImageUrl(url: string): string {
    return this.api.getImageUrl(url);
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    console.error('[Image load failed]', img.src);
    img.style.display = 'none';
  }

  toggleFavorite(): void {
    if (!this.canFavorite()) return;
    this.favoriteLoading.set(true);
    this.api.toggleFavorite(this.entryId).subscribe({
      next: res => { this.isFavorited.set(res.isFavorited); this.favoriteLoading.set(false); },
      error: () => this.favoriteLoading.set(false)
    });
  }
}
