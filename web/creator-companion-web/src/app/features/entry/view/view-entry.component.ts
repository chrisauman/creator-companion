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
import { MobileHeaderComponent } from '../../../shared/mobile-header/mobile-header.component';
import { MoodIconComponent } from '../../../shared/mood-icon/mood-icon.component';

@Component({
  selector: 'app-view-entry',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent, MobileHeaderComponent, MoodIconComponent],
  template: `
    <div class="page">

      <!-- Desktop sidebar -->
      <app-sidebar active="dashboard" />
      <app-mobile-header />
<!-- Main content -->
      <main id="main" class="main-content">

        <!-- Reader-style top bar — works on both mobile and desktop. -->
        <div class="reader-top">
          <a class="cancel-pill" routerLink="/dashboard">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </a>
          @if (entry()) {
            <div class="reader-top__breadcrumb">
              {{ monthYearLabel() }} · <strong>{{ weekdayDayLabel() }}</strong>
            </div>
            <div class="reader-top__actions">
              <!-- Top reader bar carries only the favorite toggle — Edit
                   lives at the bottom of the entry to match the embedded
                   reader's pattern on desktop. The two surfaces should
                   feel identical. -->
              <button class="reader-icon-btn"
                [class.reader-icon-btn--fav-active]="isFavorited()"
                [title]="isFavorited() ? 'Remove from favorites' : 'Add to favorites'"
                (click)="toggleFavorite()" [disabled]="favoriteLoading()">
                <svg width="14" height="14" viewBox="0 0 24 24"
                  [attr.fill]="isFavorited() ? 'currentColor' : 'none'"
                  stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
            </div>
          } @else {
            <div class="reader-top__breadcrumb"></div>
            <div class="reader-top__actions"></div>
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

            <!-- Meta row first: date eyebrow on the left, mood pushed
                 right. Title sits below. This ordering mirrors the
                 reader pattern requested in the May 2026 design pass —
                 the date acts as a label above the headline. -->
            <div class="entry-meta">
              <span class="entry-meta__date">{{ entryDateLabel() }}</span>
              @if (entry()!.mood) {
                <span class="entry-meta__mood">
                  <app-mood-icon [mood]="entry()!.mood!" [size]="14"></app-mood-icon>
                  {{ entry()!.mood }}
                </span>
              }
            </div>

            <!-- Title -->
            <h1 class="entry-title">{{ entry()!.title }}</h1>

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
                    [src]="fullImageUrl(img.url)"
                    [alt]="imageAlt(img, $index)"
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

            <!-- Footer — right-aligned primary Edit CTA. Black ink with
                 white text matches the canonical primary-button treatment
                 used everywhere else in the app (Save, Create Entry, etc.). -->
            <div class="entry-footer">
              <a class="btn btn--primary btn--sm entry-footer__edit"
                 [routerLink]="['/entry', entryId, 'edit']">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
                </svg>
                Edit entry
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

    /* ── Main content ────────────────────────────────────────────── */
    .main-content {
      flex: 1; min-width: 0;
      padding: 0 0 calc(80px + env(safe-area-inset-bottom, 0px));
      background: var(--color-surface);
      display: flex;
      flex-direction: column;
    }
    @media (min-width: 768px) {
      .main-content { padding: 0 0 4rem; background: var(--color-surface); }
    }

    /* ── Reader-style top bar (works on both mobile and desktop) ── */
    /* No safe-area-inset-top here: this page always renders
       <app-mobile-header> above the reader-top, and the mobile-header
       itself owns the safe-area inset. Adding env() to both stacked
       ~60px of empty space below the mobile-header on iOS — the bug
       surfaced in the May 2026 entry-view screenshot pass. */
    .reader-top {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: .875rem 1.5rem;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
      position: sticky; top: 0;
      z-index: 5;
    }
    @media (min-width: 768px) {
      .reader-top { padding: 1rem 1.75rem; }
    }
    .cancel-pill {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: rgba(18,196,227,.1);
      color: var(--color-accent-dark);
      border: 1px solid rgba(18,196,227,.25);
      padding: .375rem .75rem;
      border-radius: 999px;
      font-size: .75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      cursor: pointer;
      font-family: inherit;
      text-decoration: none;
      transition: all .15s;
      flex-shrink: 0;
    }
    .cancel-pill:hover {
      background: var(--color-accent);
      color: #fff;
      border-color: var(--color-accent);
      text-decoration: none;
    }
    .reader-top__breadcrumb {
      flex: 1;
      text-align: center;
      font-size: .75rem;
      color: var(--color-text-3);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @media (min-width: 768px) {
      .reader-top__breadcrumb { font-size: .8125rem; }
    }
    .reader-top__breadcrumb strong { color: var(--color-text); font-weight: 600; }
    .reader-top__actions {
      display: flex;
      gap: .375rem;
      flex-shrink: 0;
    }
    .reader-icon-btn {
      width: 34px; height: 34px;
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      border-radius: 50%;
      display: grid; place-items: center;
      cursor: pointer;
      color: var(--color-text-2);
      transition: all .15s;
    }
    .reader-icon-btn:hover {
      color: var(--color-text);
      border-color: var(--color-text-3);
    }
    .reader-icon-btn--fav-active {
      color: #e11d48;
      border-color: rgba(225,29,72,.3);
      background: rgba(225,29,72,.06);
    }
    .reader-icon-btn:disabled { opacity: .5; cursor: not-allowed; }
    .edit-btn {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: #0c0e13;
      color: #fff;
      border: none;
      padding: .5rem 1rem;
      border-radius: 999px;
      font-family: inherit;
      font-size: .8125rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all .15s;
    }
    .edit-btn:hover {
      background: var(--color-accent);
      color: #fff;
      text-decoration: none;
    }

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
      /* Mobile: full-bleed, no card chrome. Extra horizontal breathing
         room on phones — 1.5rem feels noticeably airier than 1.125rem
         and matches the 1.5rem gutter used inside hero cards in the
         today panel. */
      padding: 1.5rem 1.5rem 3rem;
    }
    @media (min-width: 768px) {
      .entry-card {
        max-width: 720px;
        margin: 0 auto;
        padding: 2rem 2rem 3rem;
      }
    }

    /* ── Entry typography ────────────────────────────────────────── */
    /* Meta row above the title acts as the date eyebrow for the
       headline. Sizing matches the dashboard's embedded entry-reader
       so the standalone /entry/:id page and the in-column view read
       the same on every breakpoint. Belt-and-suspenders right-align:
       justify-content space-between on the row + margin-left:auto on
       the mood. */
    .entry-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .875rem;
      margin: 0 0 .5rem;
      flex-wrap: wrap;
      width: 100%;
    }
    .entry-meta__date {
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-accent);
    }
    .entry-meta__mood {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      font-size: .75rem;
      font-weight: 500;
      color: var(--color-text-2);
    }
    .entry-meta__mood app-mood-icon { color: var(--color-text-3); }
    /* Title sits below the meta row. Margin-bottom drives the gap to
       the rest of the article body. */
    .entry-title {
      font-size: clamp(1.375rem, 5vw, 2rem);
      font-weight: 800; line-height: 1.2;
      color: var(--color-text); margin: 0 0 1.75rem;
    }
    .entry-backfill-notice {
      font-size: .8125rem; color: var(--color-text-3);
      margin-bottom: 1.25rem; font-style: italic;
    }

    /* ── Rendered content ────────────────────────────────────────── */
    .entry-content {
      /* Inter, matching the rest of the app. Was --font-serif (Georgia)
         which CLAUDE.md flags as "rarely used; reserved" — it stuck out
         on mobile where the user reads body text most often. */
      font-family: var(--font-sans);
      font-size: 1.0625rem;
      line-height: 1.75;
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
    .entry-footer {
      padding-top: 1rem;
      border-top: 1px solid var(--color-border-light);
      display: flex;
      justify-content: flex-end;
    }
    .entry-footer__edit {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
    }
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

  /** "May 2026" — for the reader-top breadcrumb. */
  monthYearLabel(): string {
    if (!this.entry()) return '';
    return new Date(this.entry()!.entryDate + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long', year: 'numeric'
    });
  }

  /** "Sunday, May 3" — for the reader-top breadcrumb. */
  weekdayDayLabel(): string {
    if (!this.entry()) return '';
    return new Date(this.entry()!.entryDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
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

  /** Alt text for an entry image. Filenames are often useless
   *  (IMG_4523.jpg); we fall back to the entry title (which provides
   *  useful context to screen-reader users) and finally to a generic
   *  "Photo X of N" label. Mirrors the helper in entry-reader. */
  imageAlt(img: { fileName?: string }, index: number): string {
    const e = this.entry();
    const fname = (img.fileName ?? '').trim();
    const isCameraDefault = /^(IMG_|DSC|PHOTO|image|photo)[\w\-.]*$/i.test(fname);
    if (fname && !isCameraDefault) return fname;
    const total = e?.media?.length ?? 1;
    const titleHint = e?.title?.trim();
    const position = total > 1 ? ` ${index + 1} of ${total}` : '';
    if (titleHint) return `Photo${position} from “${titleHint}”`;
    return `Photo${position} from this journal entry`;
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
