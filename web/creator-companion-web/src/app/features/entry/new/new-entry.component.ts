import {
  Component, inject, signal, computed, OnInit, OnDestroy,
  ViewChild, ElementRef, NgZone, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, takeUntil, forkJoin, of, switchMap, catchError, tap, EMPTY } from 'rxjs';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { MOODS, getMoodEmoji } from '../../../core/constants/moods';
import { TagInputComponent } from '../../../shared/tag-input.component';
import { FormatToolbarComponent } from '../../../shared/format-toolbar.component';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface PendingImage {
  file: File;
  preview: string;
}

@Component({
  selector: 'app-new-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TagInputComponent, FormatToolbarComponent],
  template: `
    <div class="editor-page">

      <!-- Minimal header -->
      <header class="editor-nav">
        <button class="btn btn--ghost btn--sm" routerLink="/dashboard">← Back</button>

        <!-- Paid: segmented date picker -->
        @if (canBackfill()) {
          <div class="date-picker" role="group" aria-label="Entry date">
            @for (opt of dateOptions(); track opt.iso) {
              <button
                type="button"
                class="date-picker__btn"
                [class.date-picker__btn--active]="selectedDate() === opt.iso"
                (click)="changeDate(opt.iso)"
                [disabled]="submitting()">
                {{ opt.label }}
              </button>
            }
          </div>
        } @else {
          <span class="editor-date">{{ todayLabel() }}</span>
        }

        <div class="save-indicator" [class]="'save-indicator--' + saveState()">
          <span *ngIf="saveState() === 'saving'">Saving…</span>
          <span *ngIf="saveState() === 'saved'">Draft saved</span>
          <span *ngIf="saveState() === 'error'">Save failed</span>
        </div>
      </header>

      <!-- Editor -->
      <main class="editor-main">
        <div class="container">

          <input
            class="title-input"
            type="text"
            [(ngModel)]="title"
            name="title"
            placeholder="Title (optional)"
            maxlength="150"
            [disabled]="submitting()"
            autofocus
          />

          <!-- Formatting toolbar (paid) or lock nudge (free) -->
          @if (canFormatText()) {
            <app-format-toolbar
              [editor]="editor"
              [version]="editorVersion()"
              [disabled]="submitting()"
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

            @if (pendingImages().length > 0) {
              <div class="image-grid">
                @for (img of pendingImages(); track img.preview; let i = $index) {
                  <div class="image-thumb">
                    <img [src]="img.preview" [alt]="img.file.name" />
                    <button class="image-thumb__remove" (click)="removeImage(i)" title="Remove" [disabled]="submitting()">✕</button>
                  </div>
                }
                @if (pendingImages().length < maxImages()) {
                  <button class="image-add-btn" (click)="fileInput.click()" [disabled]="submitting()" title="Add more photos">
                    <span class="image-add-icon">+</span>
                  </button>
                }
              </div>
            }

            @if (pendingImages().length === 0) {
              <div
                class="drop-zone"
                [class.drop-zone--over]="dragOver()"
                (click)="fileInput.click()"
                (dragover)="onDragOver($event)"
                (dragleave)="dragOver.set(false)"
                (drop)="onDrop($event)"
              >
                <span class="drop-zone__icon">🖼</span>
                <span class="drop-zone__text">Add photos</span>
                <span class="drop-zone__hint">Click or drag &amp; drop · JPEG, PNG, WEBP, HEIC · max 20 MB each</span>
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
              [disabled]="submitting()"
              (tagsChange)="selectedTags.set($event)"
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
                    [disabled]="submitting()"
                  >
                    <span class="mood-chip__emoji">{{ mood.emoji }}</span>
                    <span class="mood-chip__label">{{ mood.key }}</span>
                  </button>
                }
              </div>
            }
          </div>

          <!-- Word count + actions -->
          <div class="editor-footer">
            <div class="footer-meta">
              <span class="word-count"
                [class.word-count--warn]="wordCount() > maxWords() * 0.9"
                [class.word-count--over]="wordCount() > maxWords()">
                {{ wordCount() }} / {{ maxWords() }} words
              </span>
              @if (pendingImages().length > 0) {
                <span class="image-count">· {{ pendingImages().length }} photo{{ pendingImages().length !== 1 ? 's' : '' }}</span>
              }
            </div>

            <div class="editor-actions">
              <button class="btn btn--secondary btn--sm" routerLink="/dashboard" [disabled]="submitting()">
                Save draft
              </button>
              <button
                class="btn btn--primary"
                (click)="submit()"
                [disabled]="submitting() || wordCount() < 10 || wordCount() > maxWords()"
              >
                @if (submitting()) {
                  @if (uploadProgress()) { {{ uploadProgress() }} }
                  @else { Publishing… }
                } @else {
                  Publish entry
                }
              </button>
            </div>
          </div>

          @if (submitError()) {
            <div class="alert alert--error" style="margin-top:1rem">{{ submitError() }}</div>
          }

          @if (wordCount() < 10 && wordCount() > 0) {
            <div class="hint">Write at least 10 words to publish your entry.</div>
          }

        </div>
      </main>
    </div>
  `,
  styles: [`
    .editor-page { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-surface); }

    .editor-nav {
      display: flex; align-items: center; justify-content: space-between;
      padding: .75rem 1rem; border-bottom: 1px solid var(--color-border);
      background: var(--color-surface); position: sticky; top: 0; z-index: 10;
    }
    .editor-date { font-size: .875rem; color: var(--color-text-2); font-weight: 500; }

    .date-picker {
      display: flex; align-items: center; gap: 2px;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 2px;
    }
    .date-picker__btn {
      padding: .25rem .625rem;
      border: none; border-radius: calc(var(--radius-md) - 2px);
      background: transparent; color: var(--color-text-2);
      font-size: .8125rem; font-family: var(--font-sans);
      cursor: pointer; white-space: nowrap;
      transition: background .1s, color .1s;
      &:hover:not(:disabled) { background: var(--color-surface); color: var(--color-text); }
      &--active {
        background: var(--color-surface);
        color: var(--color-text);
        font-weight: 600;
        box-shadow: 0 1px 3px rgba(0,0,0,.08);
      }
      &:disabled { opacity: .5; cursor: not-allowed; }
    }
    .save-indicator {
      font-size: .8125rem; min-width: 80px; text-align: right;
      &--idle   { color: transparent; }
      &--saving { color: var(--color-text-3); }
      &--saved  { color: var(--color-success); }
      &--error  { color: var(--color-danger); }
    }

    .editor-main { flex: 1; padding: 2rem 0; }

    .title-input {
      width: 100%; border: none; outline: none; background: transparent;
      font-family: var(--font-sans, system-ui); font-size: 1.5rem; font-weight: 700;
      line-height: 1.3; color: var(--color-text); padding: 0; margin-bottom: .75rem;
      &::placeholder { color: var(--color-text-3); font-weight: 400; }
      &:disabled { opacity: .6; }
    }

    .format-lock {
      font-size: .8125rem; color: var(--color-text-3);
      padding: .375rem .5rem; margin-bottom: .75rem;
      background: var(--color-surface-2); border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
    }

    /* TipTap editor container */
    .tiptap-wrapper {
      min-height: 300px;
      cursor: text;
      margin-bottom: 1rem;
    }

    ::ng-deep .tiptap-wrapper .tiptap {
      min-height: 300px;
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

      &[contenteditable="false"] { opacity: .6; cursor: not-allowed; }
    }

    /* Image section */
    .image-section { margin-top: 1.5rem; }

    .drop-zone {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: .35rem; padding: 1.5rem; border: 2px dashed var(--color-border);
      border-radius: var(--radius-lg); cursor: pointer; transition: border-color .15s, background .15s;
      &:hover, &--over { border-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 5%, transparent); }
    }
    .drop-zone__icon { font-size: 1.5rem; }
    .drop-zone__text { font-size: .9375rem; font-weight: 500; color: var(--color-text-2); }
    .drop-zone__hint { font-size: .75rem; color: var(--color-text-3); }

    .image-grid { display: flex; flex-wrap: wrap; gap: .625rem; margin-bottom: .5rem; }
    .image-thumb {
      position: relative; width: 90px; height: 90px; border-radius: var(--radius-md);
      overflow: hidden; border: 1px solid var(--color-border);
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
    }
    .image-thumb__remove {
      position: absolute; top: 3px; right: 3px; width: 20px; height: 20px;
      border-radius: 50%; background: rgba(0,0,0,.55); color: #fff;
      border: none; cursor: pointer; font-size: .65rem; display: flex;
      align-items: center; justify-content: center; line-height: 1;
      &:hover { background: rgba(0,0,0,.8); }
      &:disabled { opacity: .4; cursor: not-allowed; }
    }
    .image-add-btn {
      width: 90px; height: 90px; border-radius: var(--radius-md); border: 2px dashed var(--color-border);
      background: transparent; cursor: pointer; display: flex; align-items: center;
      justify-content: center; color: var(--color-text-3); font-size: 1.5rem;
      &:hover { border-color: var(--color-accent); color: var(--color-accent); }
      &:disabled { opacity: .4; cursor: not-allowed; }
    }
    .image-add-icon { line-height: 1; }
    .image-error { font-size: .8125rem; color: var(--color-danger, #dc2626); margin-top: .4rem; }

    .editor-footer {
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 1rem; margin-top: 1.5rem; padding-top: 1rem;
      border-top: 1px solid var(--color-border);
    }
    .footer-meta { display: flex; align-items: center; gap: .4rem; }
    .word-count {
      font-size: .8125rem; color: var(--color-text-3);
      &--warn { color: var(--color-streak); }
      &--over { color: var(--color-danger); font-weight: 600; }
    }
    .image-count { font-size: .8125rem; color: var(--color-text-3); }
    .editor-actions { display: flex; gap: .75rem; }
    .hint { font-size: .875rem; color: var(--color-text-3); margin-top: .75rem; text-align: center; }

    /* Tag section */
    .tag-section { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid var(--color-border); }
    .tag-section__header { display: flex; align-items: center; gap: .5rem; margin-bottom: .75rem; }
    .tag-section__label { font-size: .9375rem; font-weight: 600; color: var(--color-text); }
    .tag-section__hint {
      font-size: .6875rem; font-weight: 500; text-transform: uppercase; letter-spacing: .05em;
      color: var(--color-text-3); background: var(--color-surface-2);
      padding: .15rem .5rem; border-radius: 100px;
    }

    /* Mood picker */
    .mood-section { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid var(--color-border); }
    .mood-header { display: flex; align-items: center; gap: .5rem; margin-bottom: .875rem; }
    .mood-label { font-size: .9375rem; font-weight: 600; color: var(--color-text); }
    .mood-optional {
      font-size: .6875rem; font-weight: 500; text-transform: uppercase; letter-spacing: .05em;
      color: var(--color-text-3); background: var(--color-surface-2);
      padding: .15rem .5rem; border-radius: 100px;
    }
    .mood-selected-badge {
      display: inline-flex; align-items: center; gap: .375rem;
      font-size: .875rem; font-weight: 500; color: var(--color-text-2);
      background: var(--color-accent-light); border: 1px solid var(--color-accent);
      padding: .3rem .75rem; border-radius: 100px; margin-bottom: .75rem;
    }
    .mood-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(82px, 1fr)); gap: .5rem; }
    .mood-chip {
      display: flex; flex-direction: column; align-items: center; gap: .25rem;
      padding: .625rem .25rem; border: 1.5px solid var(--color-border);
      border-radius: var(--radius-md); background: var(--color-surface);
      cursor: pointer; font-family: var(--font-sans);
      transition: border-color .12s, background .12s;
      &:hover:not(:disabled) { border-color: var(--color-accent); background: var(--color-accent-light); }
      &--selected { border-color: var(--color-accent); background: var(--color-accent-light); }
      &:disabled { opacity: .5; cursor: not-allowed; }
      &--preview { cursor: default; }
    }
    .mood-chip__emoji { font-size: 1.375rem; line-height: 1; }
    .mood-chip__label { font-size: .6875rem; color: var(--color-text-2); text-align: center; line-height: 1.2; }
    .mood-locked-wrap { position: relative; }
    .mood-grid--preview { opacity: .25; pointer-events: none; user-select: none; }
    .mood-lock-overlay {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: .4rem; background: rgba(255,255,255,.5); border-radius: var(--radius-md);
    }
    .mood-lock-icon { font-size: 1.375rem; }
    .mood-lock-text { font-size: .8125rem; color: var(--color-text-2); font-weight: 500; text-align: center; }
  `]
})
export class NewEntryComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editorContainer') private editorContainerRef!: ElementRef<HTMLDivElement>;

  private api      = inject(ApiService);
  private auth     = inject(AuthService);
  private router   = inject(Router);
  private zone     = inject(NgZone);
  private destroy$ = new Subject<void>();
  private autosave$ = new Subject<string>();

  readonly MOODS = MOODS;
  readonly getMoodEmoji = getMoodEmoji;

  editor: Editor | null = null;

  title          = '';
  content        = '';         // stores current HTML
  journalId      = signal('');
  saveState      = signal<SaveState>('idle');
  submitting     = signal(false);
  submitError    = signal('');
  uploadProgress = signal('');
  maxWords       = signal(100);
  maxImages      = signal(4);
  wordCountValue = signal(0);
  editorVersion  = signal(0);
  canTrackMood   = signal(false);
  canFormatText  = signal(false);
  canBackfill    = signal(false);
  selectedDate   = signal(this.dateIso(0));
  selectedMood   = signal('Accomplished');
  dragOver       = signal(false);
  pendingImages  = signal<PendingImage[]>([]);
  imageError     = signal('');
  selectedTags   = signal<string[]>([]);
  tagSuggestions = signal<string[]>([]);
  maxTags        = signal(3);

  private draftLoaded = false;

  dateOptions = computed(() => {
    return [0, 1, 2].map(daysAgo => ({
      iso: this.dateIso(daysAgo),
      label: daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : this.dateLabel(2)
    }));
  });

  private readonly ALLOWED_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ]);
  private readonly MAX_BYTES = 20 * 1024 * 1024;

  ngOnInit(): void {
    this.auth.loadCapabilities().subscribe(caps => {
      this.maxWords.set(caps.maxWordsPerEntry);
      this.maxImages.set(caps.maxImagesPerEntry);
      this.canTrackMood.set(caps.canTrackMood);
      this.canFormatText.set(caps.canFormatText);
      this.canBackfill.set(caps.canBackfill);
      this.maxTags.set(caps.maxTagsPerEntry);
    });

    this.api.getTags().subscribe({
      next: tags => this.tagSuggestions.set(tags.map(t => t.name)),
      error: () => {}
    });

    this.api.getJournals().subscribe(journals => {
      const def = journals.find(j => j.isDefault) ?? journals[0];
      if (!def) return;
      this.journalId.set(def.id);

      this.api.getDraft(def.id, this.selectedDate()).subscribe({
        next: draft => {
          if (draft && draft.contentText && this.editor) {
            this.editor.commands.setContent(draft.contentText);
          } else if (draft && draft.contentText) {
            // Editor not ready yet — store for ngAfterViewInit
            this.content = draft.contentText;
            this.draftLoaded = true;
          }
        },
        error: () => {}
      });
    });

    this.autosave$
      .pipe(debounceTime(1500), takeUntil(this.destroy$))
      .subscribe(text => this.saveDraft(text));
  }

  ngAfterViewInit(): void {
    this.initEditor(this.content);
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
    this.pendingImages().forEach(img => URL.revokeObjectURL(img.preview));
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initEditor(initialContent = ''): void {
    const el = this.editorContainerRef?.nativeElement;
    if (!el) return;

    this.editor = new Editor({
      element: el,
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: "What are you working on today? Start writing — it doesn't have to be perfect."
        })
      ],
      content: initialContent,
      editorProps: {
        attributes: { class: 'tiptap' }
      },
      onUpdate: ({ editor }) => {
        this.zone.run(() => {
          this.content = editor.getHTML();
          const t = editor.getText().trim();
          this.wordCountValue.set(t ? t.split(/\s+/).length : 0);
          this.autosave$.next(this.content);
          this.editorVersion.update(v => v + 1);
        });
      },
      onSelectionUpdate: () => {
        this.zone.run(() => this.editorVersion.update(v => v + 1));
      }
    });

    // If a draft was loaded before the editor was ready, set it now
    if (this.draftLoaded && this.content) {
      this.editor.commands.setContent(this.content);
      this.draftLoaded = false;
    }
  }

  focusEditor(): void { if (this.editor) this.editor.commands.focus(); }

  wordCount(): number { return this.wordCountValue(); }

  // ── Image handling ────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) this.queueFiles(Array.from(input.files));
    input.value = '';
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); this.dragOver.set(true); }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.queueFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  removeImage(index: number): void {
    const imgs = [...this.pendingImages()];
    URL.revokeObjectURL(imgs[index].preview);
    imgs.splice(index, 1);
    this.pendingImages.set(imgs);
  }

  private async queueFiles(files: File[]): Promise<void> {
    this.imageError.set('');
    const current = this.pendingImages();
    const slots = this.maxImages() - current.length;
    if (slots <= 0) { this.imageError.set(`Maximum ${this.maxImages()} images per entry.`); return; }

    const toAdd: PendingImage[] = [];
    for (const file of files.slice(0, slots)) {
      if (!this.ALLOWED_TYPES.has(file.type)) {
        this.imageError.set(`${file.name}: unsupported type. Use JPEG, PNG, WEBP, or HEIC.`);
        continue;
      }
      if (file.size > this.MAX_BYTES) {
        this.imageError.set(`${file.name}: exceeds the 20 MB limit.`);
        continue;
      }

      toAdd.push({ file, preview: URL.createObjectURL(file) });
    }

    if (files.length > slots)
      this.imageError.set(`Only ${slots} more image${slots !== 1 ? 's' : ''} can be added (limit ${this.maxImages()}).`);

    this.pendingImages.set([...current, ...toAdd]);
  }

  // ── Submission ────────────────────────────────────────────────────────────

  /** Returns an ISO date string (YYYY-MM-DD) for N days ago. */
  dateIso(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toLocaleDateString('en-CA');
  }

  /** Short label for a date N days ago, e.g. "Apr 15". */
  dateLabel(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  todayLabel(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  changeDate(iso: string): void {
    if (iso === this.selectedDate()) return;
    this.selectedDate.set(iso);
    if (!this.journalId()) return;
    // Load draft for the newly selected date
    this.api.getDraft(this.journalId(), iso).subscribe({
      next: draft => {
        const content = draft?.contentText ?? '';
        this.editor?.commands.setContent(content);
        this.content = content;
      },
      error: () => {
        this.editor?.commands.setContent('');
        this.content = '';
      }
    });
  }

  private saveDraft(text: string): void {
    if (!this.journalId() || !text || text === '<p></p>') return;
    this.saveState.set('saving');
    this.api.upsertDraft(this.journalId(), this.selectedDate(), text).subscribe({
      next: () => this.saveState.set('saved'),
      error: () => this.saveState.set('error')
    });
  }

  submit(): void {
    if (this.wordCount() < 10 || this.wordCount() > this.maxWords()) return;
    this.submitting.set(true);
    this.submitError.set('');
    this.uploadProgress.set('');
    this.editor?.setEditable(false);

    const files = this.pendingImages().map(p => p.file);

    const mood = this.canTrackMood() ? this.selectedMood() : undefined;
    const tags = this.selectedTags().length > 0 ? this.selectedTags() : undefined;

    this.api.createEntry(this.journalId(), this.selectedDate(), this.title, this.content, '{}', mood, tags).pipe(
      switchMap(entry => {
        if (files.length === 0) return of(null);
        let done = 0;
        this.uploadProgress.set(`Uploading 1 of ${files.length}…`);
        return forkJoin(
          files.map(file => this.api.uploadMedia(entry.id, file).pipe(
            tap(() => { done++; this.uploadProgress.set(`Uploading ${done} of ${files.length}…`); })
          ))
        ).pipe(
          catchError(() => {
            this.submitError.set('Entry saved, but some images could not be uploaded.');
            setTimeout(() => this.router.navigate(['/dashboard']), 2000);
            return EMPTY;
          })
        );
      })
    ).subscribe({
      next: () => {
        // Clear the draft so it doesn't reappear on the next new entry
        this.api.discardDraft(this.journalId(), this.selectedDate()).subscribe({
          error: () => {} // best-effort, don't block navigation
        });
        this.router.navigate(['/dashboard']);
      },
      error: err => {
        this.submitError.set(err?.error?.error ?? 'Could not publish entry. Please try again.');
        this.submitting.set(false);
        this.editor?.setEditable(true);
      }
    });
  }
}
