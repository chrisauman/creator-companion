import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { EntryListItem } from '../../core/models/models';
import { getMoodEmoji } from '../../core/constants/moods';

@Component({
  selector: 'app-tagged-entries',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <header class="topnav">
        <div class="container topnav__inner">
          <button class="btn btn--ghost btn--sm" routerLink="/dashboard">← Dashboard</button>
          <span class="topnav__title">#{{ tagName() }}</span>
          <span></span>
        </div>
      </header>

      <main class="container main-content">
        <div class="page-header">
          <h1 class="page-title">
            <span class="tag-badge">#{{ tagName() }}</span>
          </h1>
          <p class="text-muted text-sm" *ngIf="entries().length > 0">
            {{ entries().length }} {{ entries().length === 1 ? 'entry' : 'entries' }}
          </p>
        </div>

        <div *ngIf="loading()" class="loading-state">Loading…</div>

        <div *ngIf="!loading() && entries().length === 0" class="empty-state">
          <p>No entries found with tag <strong>#{{ tagName() }}</strong>.</p>
          <a routerLink="/dashboard" class="btn btn--secondary btn--sm" style="margin-top:1rem">
            Back to dashboard
          </a>
        </div>

        <ng-container *ngIf="entries().length > 0">
          <div
            class="entry-row card"
            *ngFor="let entry of entries()"
            [routerLink]="['/entry', entry.id]"
          >
            <!-- Calendar date block -->
            <div class="entry-cal">
              <span class="entry-cal__dow">{{ getDayAbbr(entry.entryDate) }}</span>
              <span class="entry-cal__num">{{ getDayNum(entry.entryDate) }}</span>
            </div>

            <!-- Body -->
            <div class="entry-row__body">
              <p class="entry-row__title">{{ entry.title || '(Untitled)' }}</p>
              <div class="entry-row__sub">
                <span>{{ formatDate(entry.entryDate) }}</span>
                <ng-container *ngIf="entry.mediaCount > 0">
                  <span class="sep">·</span>
                  <span>📷 {{ entry.mediaCount }}</span>
                </ng-container>
                <ng-container *ngIf="entry.mood">
                  <span class="sep">·</span>
                  <span>{{ getMoodEmoji(entry.mood) }}</span>
                </ng-container>
              </div>
              <!-- Other tags on this entry -->
              <div class="entry-row__tags" *ngIf="entry.tags && entry.tags.length > 1">
                <span
                  class="entry-tag-chip"
                  *ngFor="let tag of entry.tags"
                  [class.entry-tag-chip--current]="tag === tagName()"
                >#{{ tag }}</span>
              </div>
            </div>

            <!-- Thumbnail -->
            <div class="entry-row__thumb" *ngIf="entry.firstImageUrl">
              <img [src]="fullImageUrl(entry.firstImageUrl)" [alt]="entry.title" />
            </div>
          </div>
        </ng-container>
      </main>
    </div>
  `,
  styles: [`
    .topnav {
      position: sticky; top: 0; z-index: 100;
      background: var(--color-surface); border-bottom: 1px solid var(--color-border);
      height: var(--nav-h);
    }
    .topnav__inner { display: flex; align-items: center; justify-content: space-between; height: 100%; }
    .topnav__title { font-weight: 600; font-size: 1rem; color: var(--color-accent-dark); }
    .main-content { padding-top: 1.5rem; padding-bottom: 4rem; }

    .page-header { margin-bottom: 1.5rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; margin-bottom: .25rem; }
    .tag-badge {
      color: var(--color-accent-dark); background: var(--color-accent-light);
      border: 1.5px solid var(--color-accent); border-radius: 100px;
      padding: .2rem .75rem; font-size: 1.1rem;
    }

    .loading-state { color: var(--color-text-3); padding: 2rem 0; }
    .empty-state { text-align: center; padding: 3rem 1rem; color: var(--color-text-2); }

    .entry-row {
      cursor: pointer; margin-bottom: .625rem;
      transition: box-shadow .15s, border-color .15s;
      padding: .875rem 1rem; display: flex; align-items: center; gap: .875rem;
      &:hover { border-color: var(--color-accent); box-shadow: var(--shadow-md); }
    }

    .entry-cal {
      flex-shrink: 0; width: 52px; height: 58px;
      background: var(--color-surface-2); border: 1px solid var(--color-border);
      border-radius: var(--radius-md); display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 1px;
    }
    .entry-cal__dow {
      font-size: .5625rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; color: var(--color-accent-dark); line-height: 1;
    }
    .entry-cal__num { font-size: 1.5rem; font-weight: 700; line-height: 1; color: var(--color-text); }

    .entry-row__body { flex: 1; min-width: 0; }
    .entry-row__title {
      font-size: .9375rem; font-weight: 600; line-height: 1.35;
      color: var(--color-text); margin: 0 0 .25rem;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .entry-row__sub {
      display: flex; align-items: center; gap: .3rem;
      font-size: .75rem; color: var(--color-text-3);
    }
    .sep { color: var(--color-border); }

    .entry-row__tags {
      display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .375rem;
    }
    .entry-tag-chip {
      display: inline-block; padding: .1rem .45rem; border-radius: 100px;
      font-size: .7rem; font-weight: 500;
      background: var(--color-surface-2); color: var(--color-text-3);
      border: 1px solid var(--color-border); font-family: var(--font-sans); line-height: 1.4;
      &--current {
        background: var(--color-accent-light); color: var(--color-accent-dark);
        border-color: var(--color-accent);
      }
    }

    .entry-row__thumb {
      flex-shrink: 0; width: 64px; height: 64px;
      border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--color-border);
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
    }
  `]
})
export class TaggedEntriesComponent implements OnInit {
  private api    = inject(ApiService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  readonly getMoodEmoji = getMoodEmoji;

  tagName = signal('');
  entries = signal<EntryListItem[]>([]);
  loading = signal(true);

  ngOnInit(): void {
    const name = this.route.snapshot.paramMap.get('name') ?? '';
    this.tagName.set(name);

    this.api.getEntries(undefined, false, name).subscribe({
      next: e => { this.entries.set(e); this.loading.set(false); },
      error: () => { this.loading.set(false); }
    });
  }

  fullImageUrl(relativeUrl: string): string {
    return this.api.getImageUrl(relativeUrl);
  }

  getDayAbbr(d: string): string {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  }

  getDayNum(d: string): string {
    return new Date(d + 'T00:00:00').getDate().toString();
  }

  formatDate(d: string): string {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }
}
