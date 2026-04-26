import {
  Component, inject, signal, computed, OnInit, OnDestroy,
  ViewChild, ElementRef, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import { ApiService } from '../../../core/services/api.service';
import { Entry, MediaItem } from '../../../core/models/models';
import { environment } from '../../../../environments/environment';
import { MOODS, getMoodEmoji } from '../../../core/constants/moods';
import { TagInputComponent } from '../../../shared/tag-input.component';
import { FormatToolbarComponent } from '../../../shared/format-toolbar.component';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

@Component({
  selector: 'app-edit-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TagInputComponent, FormatToolbarComponent],
  template: `
    <div class="editor-page">
      <header class="editor-nav">
        <button class="btn btn--ghost btn--sm" [routerLink]="['/entry', entryId]">← Back</button>
        <div class="editor-nav__center">
          <span class="editor-date">{{ entryDateLabel() }}</span>
          @if (selectedMood()) {
            <span class="editor-mood-badge">
              {{ getMoodEmoji(selectedMood()) }} Feeling {{ selectedMood() }}
            </span>
          }
        </div>
        <div class="nav-right">
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
          <div class="save-indicator" [class]="'save-indicator--' + saveState()">
            <span *ngIf="saveState() === 'saving'">Saving…</span>
            <span *ngIf="saveState() === 'saved'">Saved</span>
            <span *ngIf="saveState() === 'error'">Save failed</span>
          </div>
        </div>
      </header>

      <!-- Favorite nudge for free users -->
      <div class="favorite-nudge" *ngIf="showFavoriteNudge()">
        <span>⭐ Favoriting entries is available on the paid plan</span>
        <button class="favorite-nudge__close" (click)="showFavoriteNudge.set(false)">✕</button>
      </div>

      <div *ngIf="loading()" class="editor-main">
        <div class="container" style="padding-top:2rem; color:var(--color-text-3)">Loading…</div>
      </div>

      <main *ngIf="!loading()" class="editor-main">
        <div class="container">

          <!-- Title -->
          <input
            class="title-input"
            type="text"
            [(ngModel)]="title"
            (ngModelChange)="onContentChange()"
            placeholder="Entry title…"
            maxlength="150"
            [disabled]="saving()"
          />

          <!-- Formatting toolbar (paid) or lock nudge (free) -->
          @if (canFormatText()) {
            <app-format-toolbar
              [editor]="editor"
              [version]="editorVersion()"
              [disabled]="saving()"
            />
          } @else {
            <div class="format-lock">
              🔒 Text formatting is available on the paid plan
            </div>
          }

          <!-- TipTap rich-text editor -->
          <div
            #editorContainer
            class="tiptap-wrapper"
            (click)="focusEditor()"
          ></div>

          <!-- Image section -->
          <div class="image-section">

            <!-- Existing images grid -->
            @if (mediaList().length > 0) {
              <div class="image-grid">
                @for (img of mediaList(); track img.id) {
                  <div class="image-thumb">
                    <img [src]="fullImageUrl(img.url)" [alt]="img.fileName" />
                    <button
                      class="image-thumb__remove"
                      (click)="removeMedia(img.id)"
                      title="Remove photo"
                      [disabled]="saving() || uploading()"
                    >✕</button>
                  </div>
                }
                @if (mediaList().length < maxImages()) {
                  <button
                    class="image-add-btn"
                    (click)="fileInput.click()"
                    [disabled]="saving() || uploading()"
                    title="Add photo"
                  >
                    @if (uploading()) { <span class="upload-spinner">…</span> }
                    @else { <span>+</span> }
                  </button>
                }
              </div>
            }

            <!-- Drop zone when no images yet -->
            @if (mediaList().length === 0) {
              <div
                class="drop-zone"
                [class.drop-zone--over]="dragOver()"
                (click)="fileInput.click()"
                (dragover)="onDragOver($event)"
                (dragleave)="dragOver.set(false)"
                (drop)="onDrop($event)"
              >
                @if (uploading()) {
                  <span class="drop-zone__icon">⏳</span>
                  <span class="drop-zone__text">Uploading…</span>
                } @else {
                  <span class="drop-zone__icon">🖼</span>
                  <span class="drop-zone__text">Add photos</span>
                  <span class="drop-zone__hint">Click or drag &amp; drop · JPEG, PNG, WEBP, HEIC · max 20 MB</span>
                }
              </div>
            }

            <input
              #fileInput
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              style="display:none"
              (change)="onFileSelected($event)"
            />

            @if (imageError()) {
              <p class="image-error">{{ imageError() }}</p>
            }

          </div>

          <!-- Tag section -->
          <div class="tag-section">
            <div class="tag-section__header">
              <span class="tag-section__label">Tags</span>
              <span class="tag-section__hint">Optional · {{ selectedTags().length }}/{{ maxTags() }}</span>
            </div>
            <app-tag-input
              [tags]="selectedTags()"
              [suggestions]="tagSuggestions()"
              [maxTags]="maxTags()"
              [disabled]="saving()"
              (tagsChange)="onTagsChange($event)"
            />
          </div>

          <!-- Mood picker -->
          <div class="mood-section">
            <div class="mood-header">
              <span class="mood-label">How are you feeling?</span>
              <span class="mood-optional">Optional</span>
            </div>

            @if (!canTrackMood()) {
              <div class="mood-locked-wrap">
                <div class="mood-grid mood-grid--preview" aria-hidden="true">
                  @for (mood of MOODS.slice(0, 8); track mood.key) {
                    <div class="mood-chip mood-chip--preview">
                      <span class="mood-chip__emoji">{{ mood.emoji }}</span>
                      <span class="mood-chip__label">{{ mood.key }}</span>
                    </div>
                  }
                </div>
                <div class="mood-lock-overlay">
                  <span class="mood-lock-icon">🔒</span>
                  <span class="mood-lock-text">Mood tracking is available on the paid plan</span>
                </div>
              </div>
            } @else {
              @if (selectedMood()) {
                <div class="mood-selected-badge">
                  <span>{{ getMoodEmoji(selectedMood()) }}</span>
                  <span>Feeling {{ selectedMood() }}</span>
                </div>
              }
              <div class="mood-grid">
                @for (mood of MOODS; track mood.key) {
                  <button
                    type="button"
                    class="mood-chip"
                    [class.mood-chip--selected]="selectedMood() === mood.key"
                    (click)="selectedMood.set(mood.key)"
                    [disabled]="saving()"
                  >
                    <span class="mood-chip__emoji">{{ mood.emoji }}</span>
                    <span class="mood-chip__label">{{ mood.key }}</span>
                  </button>
                }
              </div>
            }
          </div>

          <div class="editor-footer">
            <span class="word-count"
              [class.word-count--warn]="wordCount() > maxWords() * 0.9"
              [class.word-count--over]="wordCount() > maxWords()">
              {{ wordCount() }} / {{ maxWords() }} words
            </span>
            <div class="editor-actions">
              <button class="btn btn--danger btn--sm" (click)="confirmDelete = true" [disabled]="saving()">
                Move to trash
              </button>
              <button
                class="btn btn--primary"
                (click)="saveNow()"
                [disabled]="saving() || !title.trim() || wordCount() < 10 || wordCount() > maxWords()"
              >
                {{ saving() ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
          </div>

          <div *ngIf="error()" class="alert alert--error" style="margin-top:1rem">{{ error() }}</div>
        </div>
      </main>

      <!-- Delete confirmation overlay -->
      <div class="overlay" *ngIf="confirmDelete">
        <div class="confirm-dialog card">
          <h3>Move to trash?</h3>
          <p class="text-muted text-sm" style="margin-top:.5rem">
            This entry will be moved to trash. Paid users can recover it within 48 hours.
          </p>
          <div class="confirm-actions">
            <button class="btn btn--secondary" (click)="confirmDelete = false">Cancel</button>
            <button class="btn btn--danger" (click)="deleteEntry()">Move to trash</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .editor-page { min-height:100vh; display:flex; flex-direction:column; background:var(--color-bg); }
    .editor-nav {
      display:flex; align-items:center; justify-content:space-between;
      padding:.75rem 1rem; border-bottom:1px solid var(--color-border);
      background:var(--color-surface); position:sticky; top:0; z-index:10;
    }
    .editor-nav__center { display:flex; flex-direction:column; align-items:center; gap:.15rem; }
    .editor-date { font-size:.875rem; color:var(--color-text-2); font-weight:500; }
    .editor-mood-badge {
      font-size:.75rem; color:var(--color-text-3);
      display:flex; align-items:center; gap:.25rem;
    }

    .nav-right { display:flex; align-items:center; gap:.75rem; }
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
    .favorite-nudge {
      display:flex; align-items:center; justify-content:center; gap:.75rem;
      background:var(--color-accent-light); border-bottom:1px solid var(--color-accent);
      padding:.5rem 1rem; font-size:.8125rem; color:var(--color-text-2); font-weight:500;
    }
    .favorite-nudge__close {
      background:none; border:none; cursor:pointer; padding:0;
      font-size:.875rem; color:var(--color-text-3); line-height:1;
      &:hover { color:var(--color-text); }
    }
    .save-indicator {
      font-size:.8125rem; min-width:80px; text-align:right;
      &--idle  { color:transparent; }
      &--saving { color:var(--color-text-3); }
      &--saved  { color:var(--color-success); }
      &--error  { color:var(--color-danger); }
    }
    .editor-main { flex:1; padding:2rem 0; }

    .title-input {
      width:100%; border:none; outline:none; background:transparent;
      font-family:var(--font-sans, system-ui); font-size:1.5rem; font-weight:700;
      line-height:1.3; color:var(--color-text); padding:0; margin-bottom:.75rem;
      &::placeholder { color:var(--color-text-3); font-weight:400; }
      &:disabled { opacity:.6; }
    }

    .format-lock {
      font-size:.8125rem; color:var(--color-text-3);
      padding:.375rem .5rem; margin-bottom:.75rem;
      background:var(--color-surface-2); border-radius:var(--radius-md);
      border:1px solid var(--color-border);
    }

    /* TipTap editor container */
    .tiptap-wrapper {
      min-height: 120px;
      cursor: text;
      margin-bottom: 1rem;
    }

    ::ng-deep .tiptap-wrapper .tiptap {
      min-height: 120px;
      outline: none;
      font-family: var(--font-serif);
      font-size: 1.125rem;
      line-height: 1.8;
      color: var(--color-text);

      /* Placeholder */
      p.is-editor-empty:first-child::before {
        content: attr(data-placeholder);
        color: var(--color-text-3);
        float: left;
        pointer-events: none;
        height: 0;
      }

      /* Paragraphs */
      p { margin: 0 0 .5em; &:last-child { margin-bottom: 0; } }

      /* Headings */
      h2 {
        font-family: var(--font-sans, system-ui);
        font-size: 1.25rem;
        font-weight: 700;
        line-height: 1.3;
        color: var(--color-text);
        margin: 1.25rem 0 .4rem;
        &:first-child { margin-top: 0; }
      }

      /* Lists */
      ul, ol { padding-left: 1.5rem; margin: .25rem 0 .5rem; }
      li { line-height: 1.7; margin-bottom: .15rem; }
      ul { list-style-type: disc; }
      ol { list-style-type: decimal; }

      /* Inline */
      strong { font-weight: 700; }
      em { font-style: italic; }

      /* Disabled state */
      &[contenteditable="false"] { opacity: .6; cursor: not-allowed; }
    }

    /* Image management section */
    .image-section { margin-top:1.75rem; padding-top:1.25rem; border-top:1px solid var(--color-border); }

    .image-grid { display:flex; flex-wrap:wrap; gap:.625rem; }

    .image-thumb {
      position:relative; width:110px; height:110px; border-radius:8px;
      overflow:hidden; border:1px solid var(--color-border); flex-shrink:0;
      img { width:100%; height:100%; object-fit:cover; display:block; }
    }
    .image-thumb__remove {
      position:absolute; top:4px; right:4px; width:22px; height:22px;
      border-radius:50%; background:rgba(0,0,0,.6); color:#fff;
      border:none; cursor:pointer; font-size:.65rem;
      display:flex; align-items:center; justify-content:center; line-height:1;
      transition:background .12s;
      &:hover:not(:disabled) { background:rgba(0,0,0,.85); }
      &:disabled { opacity:.4; cursor:not-allowed; }
    }
    .image-add-btn {
      width:110px; height:110px; border-radius:8px;
      border:2px dashed var(--color-border); background:transparent;
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      color:var(--color-text-3); font-size:1.75rem; flex-shrink:0;
      transition:border-color .15s, color .15s;
      &:hover:not(:disabled) { border-color:var(--color-accent); color:var(--color-accent); }
      &:disabled { opacity:.4; cursor:not-allowed; }
    }
    .upload-spinner { font-size:1rem; animation:spin 1s linear infinite; display:inline-block; }
    @keyframes spin { to { transform:rotate(360deg); } }

    .drop-zone {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:.35rem; padding:1.5rem; border:2px dashed var(--color-border);
      border-radius:10px; cursor:pointer; transition:border-color .15s, background .15s;
      &:hover, &--over { border-color:var(--color-accent); background:color-mix(in srgb, var(--color-accent) 5%, transparent); }
    }
    .drop-zone__icon { font-size:1.5rem; }
    .drop-zone__text { font-size:.9375rem; font-weight:500; color:var(--color-text-2); }
    .drop-zone__hint { font-size:.75rem; color:var(--color-text-3); }
    .image-error { font-size:.8125rem; color:var(--color-danger); margin-top:.5rem; }

    .editor-footer {
      display:flex; align-items:center; justify-content:space-between;
      flex-wrap:wrap; gap:1rem; margin-top:1.5rem;
      padding-top:1rem; border-top:1px solid var(--color-border);
    }
    .word-count { font-size:.8125rem; color:var(--color-text-3);
      &--warn { color:var(--color-streak); }
      &--over { color:var(--color-danger); font-weight:600; }
    }
    .editor-actions { display:flex; gap:.75rem; }
    .overlay {
      position:fixed; inset:0; background:rgba(0,0,0,.4);
      display:flex; align-items:center; justify-content:center;
      padding:1.5rem; z-index:200;
    }
    .confirm-dialog { max-width:400px; width:100%; }
    .confirm-actions { display:flex; gap:.75rem; justify-content:flex-end; margin-top:1.25rem; }

    /* Tag section */
    .tag-section { margin-top:1.75rem; padding-top:1.25rem; border-top:1px solid var(--color-border); }
    .tag-section__header { display:flex; align-items:center; gap:.5rem; margin-bottom:.75rem; }
    .tag-section__label { font-size:.9375rem; font-weight:600; color:var(--color-text); }
    .tag-section__hint {
      font-size:.6875rem; font-weight:500; text-transform:uppercase; letter-spacing:.05em;
      color:var(--color-text-3); background:var(--color-surface-2);
      padding:.15rem .5rem; border-radius:100px;
    }

    /* Mood picker */
    .mood-section { margin-top:1.75rem; padding-top:1.25rem; border-top:1px solid var(--color-border); }
    .mood-header { display:flex; align-items:center; gap:.5rem; margin-bottom:.875rem; }
    .mood-label { font-size:.9375rem; font-weight:600; color:var(--color-text); }
    .mood-optional {
      font-size:.6875rem; font-weight:500; text-transform:uppercase; letter-spacing:.05em;
      color:var(--color-text-3); background:var(--color-surface-2);
      padding:.15rem .5rem; border-radius:100px;
    }
    .mood-selected-badge {
      display:inline-flex; align-items:center; gap:.375rem;
      font-size:.875rem; font-weight:500; color:var(--color-text-2);
      background:var(--color-accent-light); border:1px solid var(--color-accent);
      padding:.3rem .75rem; border-radius:100px; margin-bottom:.75rem;
    }
    .mood-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(82px, 1fr)); gap:.5rem; }
    .mood-chip {
      display:flex; flex-direction:column; align-items:center; gap:.25rem;
      padding:.625rem .25rem; border:1.5px solid var(--color-border);
      border-radius:var(--radius-md); background:var(--color-surface);
      cursor:pointer; font-family:var(--font-sans);
      transition:border-color .12s, background .12s;
      &:hover:not(:disabled) { border-color:var(--color-accent); background:var(--color-accent-light); }
      &--selected { border-color:var(--color-accent); background:var(--color-accent-light); }
      &:disabled { opacity:.5; cursor:not-allowed; }
      &--preview { cursor:default; }
    }
    .mood-chip__emoji { font-size:1.375rem; line-height:1; }
    .mood-chip__label { font-size:.6875rem; color:var(--color-text-2); text-align:center; line-height:1.2; }
    .mood-locked-wrap { position:relative; }
    .mood-grid--preview { opacity:.25; pointer-events:none; user-select:none; }
    .mood-lock-overlay {
      position:absolute; inset:0; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:.4rem;
      background:rgba(255,255,255,.5); border-radius:var(--radius-md);
    }
    .mood-lock-icon { font-size:1.375rem; }
    .mood-lock-text { font-size:.8125rem; color:var(--color-text-2); font-weight:500; text-align:center; }
  `]
})
export class EditEntryComponent implements OnInit, OnDestroy {
  @ViewChild('editorContainer') private editorContainerRef!: ElementRef<HTMLDivElement>;

  private api      = inject(ApiService);
  private router   = inject(Router);
  private route    = inject(ActivatedRoute);
  private zone     = inject(NgZone);
  private destroy$ = new Subject<void>();
  private autosave$ = new Subject<void>();

  readonly apiBase = environment.apiBaseUrl;
  readonly MOODS   = MOODS;
  readonly getMoodEmoji = getMoodEmoji;

  editor: Editor | null = null;

  title        = '';
  content      = '';          // always stores the current HTML
  entryId      = '';
  entry        = signal<Entry | null>(null);
  loading      = signal(true);
  saving       = signal(false);
  saveState    = signal<SaveState>('idle');
  error        = signal('');
  maxWords     = signal(100);
  maxImages    = signal(1);
  wordCountValue = signal(0);
  editorVersion  = signal(0);
  canTrackMood = signal(false);
  canFormatText  = signal(false);
  canFavorite  = signal(false);
  isFavorited  = signal(false);
  favoriteLoading   = signal(false);
  showFavoriteNudge = signal(false);
  uploading    = signal(false);
  imageError   = signal('');
  dragOver     = signal(false);
  selectedMood = signal('');
  selectedTags = signal<string[]>([]);
  tagSuggestions = signal<string[]>([]);
  maxTags      = signal(3);
  confirmDelete = false;

  /** Reactive view of attached media — updates instantly on add/remove. */
  mediaList = computed<MediaItem[]>(() => this.entry()?.media ?? []);

  private readonly ALLOWED_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ]);
  private readonly MAX_BYTES = 20 * 1024 * 1024;

  ngOnInit(): void {
    this.entryId = this.route.snapshot.paramMap.get('id') ?? '';

    this.api.getCapabilities().subscribe(caps => {
      this.maxWords.set(caps.maxWordsPerEntry);
      this.maxImages.set(caps.maxImagesPerEntry);
      this.canTrackMood.set(caps.canTrackMood);
      this.canFavorite.set(caps.canFavorite);
      this.canFormatText.set(caps.canFormatText);
      this.maxTags.set(caps.maxTagsPerEntry);
    });

    this.api.getTags().subscribe({
      next: tags => this.tagSuggestions.set(tags.map(t => t.name)),
      error: () => {}
    });

    this.api.getEntry(this.entryId).subscribe({
      next: e => {
        this.entry.set(e);
        this.title = e.title ?? '';
        this.selectedMood.set(e.mood ?? '');
        this.selectedTags.set(e.tags ?? []);
        this.isFavorited.set(e.isFavorited ?? false);
        const html = this.toHtml(e.contentText);
        this.content = html;
        this.loading.set(false);
        // *ngIf renders on next tick — init editor after
        setTimeout(() => this.initEditor(html), 0);
      },
      error: () => this.router.navigate(['/dashboard'])
    });

    this.autosave$
      .pipe(debounceTime(1500), takeUntil(this.destroy$))
      .subscribe(() => this.autoSave());
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initEditor(content: string): void {
    const el = this.editorContainerRef?.nativeElement;
    if (!el) return;

    this.editor = new Editor({
      element: el,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: 'Continue writing…' })
      ],
      content,
      editorProps: {
        attributes: { class: 'tiptap' }
      },
      onUpdate: ({ editor }) => {
        this.zone.run(() => {
          this.content = editor.getHTML();
          this.updateWordCount(editor.getText());
          this.saveState.set('idle');
          this.autosave$.next();
          this.editorVersion.update(v => v + 1);
        });
      },
      onSelectionUpdate: () => {
        this.zone.run(() => this.editorVersion.update(v => v + 1));
      }
    });

    // Seed word count from loaded content
    this.updateWordCount(this.editor.getText());
  }

  /** Convert stored content to HTML for TipTap.
   *  Existing plain-text / markdown entries are rendered via marked;
   *  new HTML entries (starting with a tag) are loaded directly. */
  private toHtml(raw: string): string {
    if (!raw) return '';
    if (raw.trimStart().startsWith('<')) return raw;
    return marked.parse(raw) as string;
  }

  private updateWordCount(plainText: string): void {
    const t = plainText.trim();
    this.wordCountValue.set(t ? t.split(/\s+/).length : 0);
  }

  focusEditor(): void { if (this.editor) this.editor.commands.focus(); }

  wordCount(): number { return this.wordCountValue(); }

  onContentChange(): void {
    this.saveState.set('idle');
    this.autosave$.next();
  }

  onTagsChange(tags: string[]): void {
    this.selectedTags.set(tags);
    this.saveState.set('idle');
    this.autosave$.next();
  }

  entryDateLabel(): string {
    if (!this.entry()) return '';
    return new Date(this.entry()!.entryDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  fullImageUrl(relativeUrl: string): string {
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) return relativeUrl;
    return this.apiBase.replace(/\/v1$/, '') + relativeUrl;
  }

  toggleFavorite(): void {
    if (!this.canFavorite()) { this.showFavoriteNudge.set(true); return; }
    this.favoriteLoading.set(true);
    this.api.toggleFavorite(this.entryId).subscribe({
      next: res => { this.isFavorited.set(res.isFavorited); this.favoriteLoading.set(false); },
      error: () => this.favoriteLoading.set(false)
    });
  }

  private autoSave(): void {
    if (this.wordCount() < 1 || !this.title.trim()) return;
    this.saveState.set('saving');
    const mood = this.canTrackMood() ? this.selectedMood() || undefined : undefined;
    this.api.updateEntry(this.entryId, this.title, this.content, undefined, mood, this.selectedTags()).subscribe({
      next: () => this.saveState.set('saved'),
      error: () => this.saveState.set('error')
    });
  }

  saveNow(): void {
    if (!this.title.trim() || this.wordCount() < 10 || this.wordCount() > this.maxWords()) return;
    this.saving.set(true);
    this.editor?.setEditable(false);
    this.error.set('');
    const mood = this.canTrackMood() ? this.selectedMood() || undefined : undefined;
    this.api.updateEntry(this.entryId, this.title, this.content, undefined, mood, this.selectedTags()).subscribe({
      next: () => {
        this.saving.set(false);
        this.editor?.setEditable(true);
        this.saveState.set('saved');
        this.router.navigate(['/entry', this.entryId]);
      },
      error: err => {
        this.error.set(err?.error?.error ?? 'Could not save. Please try again.');
        this.saving.set(false);
        this.editor?.setEditable(true);
      }
    });
  }

  // ── Image management ─────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) this.uploadFiles(Array.from(input.files));
    input.value = '';
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); this.dragOver.set(true); }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.uploadFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private uploadFiles(files: File[]): void {
    this.imageError.set('');
    const slots = this.maxImages() - this.mediaList().length;

    if (slots <= 0) {
      this.imageError.set(`This entry has reached the limit of ${this.maxImages()} image${this.maxImages() !== 1 ? 's' : ''}.`);
      return;
    }

    const toUpload: File[] = [];
    for (const file of files.slice(0, slots)) {
      if (!this.ALLOWED_TYPES.has(file.type)) {
        this.imageError.set(`${file.name}: unsupported type. Use JPEG, PNG, WEBP, or HEIC.`);
        continue;
      }
      if (file.size > this.MAX_BYTES) {
        this.imageError.set(`${file.name}: exceeds the 20 MB limit.`);
        continue;
      }
      toUpload.push(file);
    }

    if (files.length > slots)
      this.imageError.set(`Only ${slots} more image${slots !== 1 ? 's' : ''} can be added (limit ${this.maxImages()}).`);

    if (toUpload.length === 0) return;

    this.uploading.set(true);
    let completed = 0;

    for (const file of toUpload) {
      this.api.uploadMedia(this.entryId, file).subscribe({
        next: media => {
          this.entry.update(e => e ? { ...e, media: [...e.media, media] } : e);
          completed++;
          if (completed === toUpload.length) this.uploading.set(false);
        },
        error: () => {
          this.imageError.set('One or more images could not be uploaded. Please try again.');
          completed++;
          if (completed === toUpload.length) this.uploading.set(false);
        }
      });
    }
  }

  removeMedia(mediaId: string): void {
    this.api.deleteMedia(mediaId).subscribe({
      next: () => this.entry.update(e => e ? { ...e, media: e.media.filter(m => m.id !== mediaId) } : e),
      error: () => this.imageError.set('Could not remove the image. Please try again.')
    });
  }

  // ── Entry deletion ────────────────────────────────────────────────────────

  deleteEntry(): void {
    this.api.deleteEntry(this.entryId).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => this.router.navigate(['/dashboard'])
    });
  }
}
