import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { Entry } from '../../../core/models/models';
import { environment } from '../../../../environments/environment';
import { getMoodEmoji } from '../../../core/constants/moods';
import { marked } from 'marked';

@Component({
  selector: 'app-view-entry',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="view-page">
      <header class="topnav">
        <div class="topnav__inner">
          <button class="btn btn--ghost btn--sm" routerLink="/dashboard">← Back</button>
          <span class="topnav__date">{{ entryDateLabel() }}</span>
          <div class="topnav__actions">
            @if (entry()) {
              <button
                class="favorite-btn"
                [class.favorite-btn--active]="isFavorited()"
                [title]="isFavorited() ? 'Remove from favorites' : 'Add to favorites'"
                (click)="toggleFavorite()"
                [disabled]="favoriteLoading()"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                  [attr.fill]="isFavorited() ? 'currentColor' : 'none'"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
              <a class="btn btn--ghost btn--sm" [routerLink]="['/entry', entryId, 'edit']">Edit</a>
            }
          </div>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-state">Loading…</div>
      }

      @if (!loading() && entry()) {
        <main class="container entry-body">

          <!-- Title -->
          <h1 class="entry-title">{{ entry()!.title }}</h1>

          <!-- Meta row: mood + date -->
          <div class="entry-meta">
            <span class="entry-meta__date">{{ entryDateLabel() }}</span>
            @if (entry()!.mood) {
              <span class="entry-meta__mood">
                {{ getMoodEmoji(entry()!.mood!) }} {{ entry()!.mood }}
              </span>
            }
          </div>

          <!-- Content -->
          <div class="entry-content" [innerHTML]="renderedContent()"></div>

          <!-- Images -->
          @if (entry()!.media.length > 0) {
            <div class="entry-images">
              @for (img of entry()!.media; track img.id) {
                <img
                  class="entry-image"
                  [src]="fullImageUrl(img.url)"
                  [alt]="img.fileName"
                  loading="lazy"
                />
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

          <!-- Footer actions -->
          <div class="entry-footer">
            <a class="btn btn--secondary btn--sm" [routerLink]="['/entry', entryId, 'edit']">
              ✏️ Edit entry
            </a>
          </div>

        </main>
      }
    </div>
  `,
  styles: [`
    .view-page { min-height:100vh; background:var(--color-bg); }

    /* Nav */
    .topnav {
      position:sticky; top:0; z-index:100;
      background:var(--color-surface); border-bottom:1px solid var(--color-border);
      height:var(--nav-h);
    }
    .topnav__inner {
      max-width:680px; margin:0 auto; padding:0 1.25rem;
      display:flex; align-items:center; justify-content:space-between; height:100%;
    }
    .topnav__date { font-size:.875rem; font-weight:500; color:var(--color-text-2); }
    .topnav__actions { display:flex; align-items:center; gap:.5rem; }

    /* Favorite button */
    .favorite-btn {
      display:flex; align-items:center; justify-content:center;
      width:32px; height:32px; border-radius:50%;
      border:none; background:transparent; cursor:pointer;
      color:var(--color-text-3); padding:0;
      transition:color .15s, transform .1s;
      &:hover:not(:disabled) { color:var(--color-accent); transform:scale(1.1); }
      &--active { color:var(--color-accent); }
      &:disabled { opacity:.5; cursor:not-allowed; }
    }

    .loading-state {
      padding:3rem 1.5rem; text-align:center;
      color:var(--color-text-3); font-size:.9375rem;
    }

    /* Entry body */
    .entry-body {
      max-width:680px; padding-top:2.5rem; padding-bottom:5rem;
    }

    .entry-title {
      font-size:clamp(1.5rem, 5vw, 2rem);
      font-weight:800; line-height:1.2;
      color:var(--color-text); margin:0 0 .875rem;
    }

    .entry-meta {
      display:flex; align-items:center; gap:.875rem;
      margin-bottom:1.75rem; flex-wrap:wrap;
    }
    .entry-meta__date {
      font-size:.875rem; color:var(--color-text-3); font-weight:500;
    }
    .entry-meta__mood {
      font-size:.875rem; font-weight:500;
      color:var(--color-text-2);
      background:var(--color-surface-2);
      border:1px solid var(--color-border);
      padding:.2rem .65rem; border-radius:100px;
      display:flex; align-items:center; gap:.3rem;
    }

    /* Rendered entry content */
    .entry-content {
      font-family:var(--font-serif);
      font-size:1.125rem;
      line-height:1.85;
      color:var(--color-text);
      margin-bottom:2rem;

      ::ng-deep p { margin:0 0 .75em; &:last-child { margin-bottom:0; } }
      ::ng-deep h2 {
        font-family:var(--font-sans, system-ui);
        font-size:1.2rem; font-weight:700;
        margin:1.5rem 0 .5rem; color:var(--color-text);
      }
      ::ng-deep ul, ::ng-deep ol { padding-left:1.5rem; margin:.25rem 0 .75rem; }
      ::ng-deep li { line-height:1.7; margin-bottom:.2rem; }
      ::ng-deep ul { list-style-type:disc; }
      ::ng-deep ol { list-style-type:decimal; }
      ::ng-deep strong { font-weight:700; }
      ::ng-deep em { font-style:italic; }
    }

    /* Images */
    .entry-images {
      display:flex; flex-direction:column; gap:1rem;
      margin-bottom:2rem;
    }
    .entry-image {
      width:100%; height:auto; border-radius:10px;
      display:block;
      box-shadow:0 2px 12px rgba(0,0,0,.08);
    }

    /* Tags */
    .entry-tags {
      display:flex; flex-wrap:wrap; gap:.5rem;
      padding-top:1.5rem; margin-bottom:2rem;
      border-top:1px solid var(--color-border-light);
    }
    .entry-tag {
      font-size:.875rem; font-weight:500;
      color:var(--color-accent-dark);
      background:var(--color-accent-light);
      border:1px solid var(--color-accent);
      padding:.25rem .75rem; border-radius:100px;
      text-decoration:none;
      transition:background .15s, color .15s;
      &:hover { background:var(--color-accent); color:#fff; }
    }

    /* Footer */
    .entry-footer {
      padding-top:1rem;
      border-top:1px solid var(--color-border-light);
    }
  `]
})
export class ViewEntryComponent implements OnInit {
  private api   = inject(ApiService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);

  readonly getMoodEmoji = getMoodEmoji;
  readonly apiBase = environment.apiBaseUrl;

  entryId  = '';
  entry    = signal<Entry | null>(null);
  loading  = signal(true);
  isFavorited     = signal(false);
  favoriteLoading = signal(false);
  canFavorite     = signal(false);

  renderedContent = computed(() => {
    const raw = this.entry()?.contentText ?? '';
    if (!raw) return '';
    if (raw.trimStart().startsWith('<')) return raw;
    return marked.parse(raw) as string;
  });

  ngOnInit(): void {
    this.entryId = this.route.snapshot.paramMap.get('id') ?? '';

    this.api.getCapabilities().subscribe(caps => {
      this.canFavorite.set(caps.canFavorite);
    });

    this.api.getEntry(this.entryId).subscribe({
      next: e => {
        this.entry.set(e);
        this.isFavorited.set(e.isFavorited ?? false);
        this.loading.set(false);
      },
      error: () => this.router.navigate(['/dashboard'])
    });
  }

  entryDateLabel(): string {
    if (!this.entry()) return '';
    return new Date(this.entry()!.entryDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  fullImageUrl(relativeUrl: string): string {
    return this.apiBase.replace(/\/v1$/, '') + relativeUrl;
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
