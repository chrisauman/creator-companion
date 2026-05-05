import { Component, EventEmitter, Input, Output, computed, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import { Entry } from '../../core/models/models';
import { ApiService } from '../../core/services/api.service';
import { MoodIconComponent } from '../../shared/mood-icon/mood-icon.component';

/**
 * Renders a full entry inline inside the dashboard's right column —
 * the user reads an entry without leaving the page. Includes the
 * date eyebrow with mood, serif title, body content (markdown
 * rendered), photo gallery, tags at the bottom, and a top bar with
 * "✨ Today" return pill plus an Edit button.
 *
 * Phase E will replace the Edit button's external navigation with an
 * inline compose-edit mode. For now Edit routes to /entry/:id/edit.
 */
@Component({
  selector: 'app-entry-reader',
  standalone: true,
  imports: [CommonModule, MoodIconComponent],
  template: `
    <div class="reader">

      <!-- Top bar -->
      <div class="reader-top">
        <button class="today-pill" type="button"
                (click)="returnToToday.emit()"
                title="Return to today's view">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/>
          </svg>
          Today
        </button>

        @if (entry) {
          <div class="reader-top__breadcrumb">
            {{ monthYear() }} · <strong>{{ weekdayDayLabel() }}</strong>
          </div>
        } @else {
          <div class="reader-top__breadcrumb"></div>
        }

        <div class="reader-top__actions">
          @if (entry && canFavorite) {
            <button class="icon-btn-round"
                    type="button"
                    [class.icon-btn-round--fav-active]="entry.isFavorited"
                    [title]="entry.isFavorited ? 'Remove from favorites' : 'Add to favorites'"
                    (click)="toggleFavorite.emit()">
              <svg width="14" height="14" viewBox="0 0 24 24"
                   [attr.fill]="entry.isFavorited ? 'currentColor' : 'none'"
                   stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
          }
          @if (entry) {
            <button class="edit-btn" type="button" (click)="edit.emit()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
              </svg>
              Edit
            </button>
          }
        </div>
      </div>

      <!-- Body -->
      @if (loading) {
        <div class="reading-scroll">
          <div class="state-msg">Loading…</div>
        </div>
      } @else if (loadError) {
        <div class="reading-scroll">
          <div class="state-msg state-msg--error">
            Could not load this entry. It may have been deleted.
          </div>
        </div>
      } @else if (entry) {
        <!-- Scrollable wrapper fills the column; inner article is
             always centred at max-width 760px so every entry renders
             at the same width regardless of content length. -->
        <div class="reading-scroll">
          <article class="reading">
            <div class="reading__date-row">
              <span class="reading__date">{{ dateLabel() }}</span>
              @if (entry.mood) {
                <span class="reading__mood">
                  <app-mood-icon [mood]="entry.mood" [size]="14"></app-mood-icon>
                  {{ entry.mood }}
                </span>
              }
            </div>

            @if (entry.title) {
              <h1 class="reading__title">{{ entry.title }}</h1>
            }

            @if (entry.entrySource === 1) {
              <p class="reading__backfill">Backfilled on {{ createdAtLabel() }}</p>
            }

            <div class="reading__body" [innerHTML]="renderedContent()"></div>

            @if (entry.media.length > 0) {
              <div class="reading__images" [class.reading__images--single]="entry.media.length === 1">
                @for (img of entry.media; track img.id) {
                  <img class="reading__image"
                       [src]="fullImageUrl(img.url)"
                       [alt]="img.fileName"
                       loading="lazy"
                       (error)="onImgError($event)" />
                }
              </div>
            }

            @if (entry.tags.length > 0) {
              <div class="reading__tags">
                @for (tag of entry.tags; track tag) {
                  <span class="reading__tag">#{{ tag }}</span>
                }
              </div>
            }
          </article>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .reader {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--color-surface);
    }

    /* ── Top bar ─────────────────────────────────────────────── */
    /* Fixed 64px so the right column's header aligns with the search
       bar at the top of the entry-list column. No rule line — the
       padding plus the column's surface bg do the job cleanly. */
    .reader-top {
      display: flex;
      align-items: center;
      gap: .5rem;
      height: 64px;
      padding: 0 1.5rem;
      position: sticky; top: 0;
      background: var(--color-surface);
      z-index: 5;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .today-pill {
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
    .today-pill:hover {
      background: var(--color-accent);
      color: #0c0e13;
      border-color: var(--color-accent);
    }
    .reader-top__breadcrumb {
      flex: 1;
      text-align: center;
      font-size: .8125rem;
      color: var(--color-text-3);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .reader-top__breadcrumb strong {
      color: var(--color-text);
      font-weight: 600;
    }

    .reader-top__actions {
      display: flex;
      gap: .5rem;
      flex-shrink: 0;
    }
    .icon-btn-round {
      width: 36px; height: 36px;
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      border-radius: 50%;
      display: grid; place-items: center;
      cursor: pointer;
      color: var(--color-text-2);
      transition: all .15s;
    }
    .icon-btn-round:hover {
      color: var(--color-text);
      border-color: var(--color-text-3);
    }
    .icon-btn-round--fav-active {
      color: #e11d48;
      border-color: rgba(225,29,72,.3);
      background: rgba(225,29,72,.06);
    }
    .icon-btn-round--fav-active:hover { color: #e11d48; }

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
      transition: all .15s;
    }
    .edit-btn:hover {
      background: var(--color-accent);
      color: #0c0e13;
    }

    /* ── Loading / error states ─────────────────────────────── */
    .state-msg {
      padding: 4rem 2rem;
      text-align: center;
      color: var(--color-text-3);
      font-size: .9375rem;
    }
    .state-msg--error { color: #e11d48; }

    /* ── Reading body ───────────────────────────────────────── */
    /* Scroll wrapper fills the right column; the article inside is
       always 760px max and centred. This way every entry renders at
       the exact same width regardless of how short or long it is. */
    .reading-scroll {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }
    .reading {
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      padding: 2rem 2.5rem 4rem;
      box-sizing: border-box;
    }
    .reading__date-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .reading__date {
      font-size: .6875rem;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-accent);
      font-weight: 700;
    }
    .reading__mood {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      font-size: .75rem;
      color: var(--color-text-2);
      font-weight: 500;
    }
    .reading__mood app-mood-icon { color: var(--color-text-3); }

    .reading__title {
      font-family: var(--font-sans);
      font-size: 2.125rem;
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -.015em;
      color: var(--color-text);
      margin: 0 0 1.5rem;
      word-break: break-word;
    }
    .reading__backfill {
      font-size: .75rem;
      color: var(--color-text-3);
      font-style: italic;
      margin: 0 0 1rem;
    }

    .reading__body {
      font-size: 1.0625rem;
      line-height: 1.75;
      color: var(--color-text);
      word-wrap: break-word;
    }
    .reading__body :first-child { margin-top: 0; }
    .reading__body :last-child { margin-bottom: 0; }
    .reading__body p { margin: 0 0 1.25rem; }
    .reading__body p:first-of-type::first-letter {
      font-family: var(--font-sans);
      font-size: 3rem;
      float: left;
      line-height: .9;
      margin: 6px 8px 0 0;
      font-weight: 700;
      color: var(--color-accent);
    }
    .reading__body h2, .reading__body h3 {
      font-family: var(--font-sans);
      letter-spacing: -.01em;
      margin: 1.5rem 0 .75rem;
    }
    .reading__body h2 { font-size: 1.5rem; }
    .reading__body h3 { font-size: 1.25rem; }
    .reading__body ul, .reading__body ol {
      margin: 0 0 1.25rem;
      padding-left: 1.5rem;
    }
    .reading__body li { margin-bottom: .375rem; }
    .reading__body a { color: var(--color-accent); }
    .reading__body strong { font-weight: 700; }
    .reading__body em { font-style: italic; }
    .reading__body blockquote {
      border-left: 3px solid var(--color-accent);
      padding-left: 1rem;
      margin: 0 0 1.25rem;
      color: var(--color-text-2);
      font-style: italic;
    }

    /* Photo gallery — 2 cols when there's room, single col on narrow widths. */
    .reading__images {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: .75rem;
      margin: 1.5rem 0 2rem;
    }
    .reading__images--single { grid-template-columns: 1fr; }
    .reading__image {
      width: 100%;
      height: auto;
      max-height: 480px;
      object-fit: cover;
      border-radius: 14px;
      border: 1px solid var(--color-border);
      display: block;
    }

    /* Tags at the bottom */
    .reading__tags {
      display: flex;
      flex-wrap: wrap;
      gap: .375rem;
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--color-border);
    }
    .reading__tag {
      font-size: .6875rem;
      padding: 4px 10px;
      border-radius: 999px;
      background: #f4ede0;
      color: #8a7a52;
      font-weight: 600;
    }
  `]
})
export class EntryReaderComponent implements OnChanges {
  private api = inject(ApiService);
  private sanitizer = inject(DomSanitizer);

  @Input() entry: Entry | null = null;
  @Input() loading: boolean = false;
  @Input() loadError: boolean = false;
  @Input() canFavorite: boolean = false;

  @Output() returnToToday = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() toggleFavorite = new EventEmitter<void>();

  /** Pre-rendered HTML for the entry body. Re-computed on entry change. */
  renderedContent = signal<SafeHtml>('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entry']) {
      this.renderContent();
    }
  }

  private renderContent(): void {
    if (!this.entry?.contentText) {
      this.renderedContent.set('');
      return;
    }
    const raw = marked.parse(this.entry.contentText, { async: false }) as string;
    this.renderedContent.set(this.sanitizer.bypassSecurityTrustHtml(raw));
  }

  dateLabel = computed(() => {
    if (!this.entry) return '';
    const d = new Date(this.entry.entryDate + 'T00:00:00');
    const created = new Date(this.entry.createdAt);
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const time = created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${weekday} · ${time}`;
  });

  monthYear = computed(() => {
    if (!this.entry) return '';
    const d = new Date(this.entry.entryDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  weekdayDayLabel = computed(() => {
    if (!this.entry) return '';
    const d = new Date(this.entry.entryDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  });

  createdAtLabel = computed(() => {
    if (!this.entry) return '';
    return new Date(this.entry.createdAt).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  });

  fullImageUrl(url: string): string {
    return this.api.getImageUrl(url);
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
