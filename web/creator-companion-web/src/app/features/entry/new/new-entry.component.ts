import {
  Component, inject, signal, computed, OnInit, OnDestroy,
  ViewChild, ElementRef, NgZone, AfterViewInit, Input, Output, EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, takeUntil, forkJoin, of, switchMap, catchError, tap, EMPTY } from 'rxjs';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { MOODS, getMoodEmoji } from '../../../core/constants/moods';
import { TagInputComponent } from '../../../shared/tag-input.component';
import { FormatToolbarComponent } from '../../../shared/format-toolbar.component';
import { MoodIconComponent, isSupportedMood } from '../../../shared/mood-icon/mood-icon.component';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface PendingImage {
  file: File;
  preview: string;
}

@Component({
  selector: 'app-new-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TagInputComponent, FormatToolbarComponent, MoodIconComponent],
  template: `
    <div class="editor-page" [class.editor-page--embedded]="embedded">

      <!-- Minimal header -->
      <header class="editor-nav">
        @if (embedded) {
          <button class="btn btn--ghost btn--sm" type="button" (click)="cancelCompose()">✕ Cancel</button>
        } @else {
          <button class="btn btn--ghost btn--sm" routerLink="/dashboard">← Back</button>
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

          <!-- Entry date — paid users get a 3-option backfill picker; free
               users see a static "today" label so they know what day this
               entry is being recorded for. -->
          <div class="date-row">
            <span class="date-row__label">Entry date</span>
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
          </div>

          <!-- Prompt context banner — shown when launched from a prompt, the
               Spark, or a mood from the dashboard's Today panel. -->
          @if (promptBanner()) {
            <div class="prompt-banner">
              <span class="prompt-banner__icon">
                @if (promptBanner()!.kind === 'mood') {
                  <app-mood-icon [mood]="promptBanner()!.text" [size]="16"></app-mood-icon>
                } @else {
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    @if (promptBanner()!.kind === 'spark') {
                      <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="currentColor"/>
                    } @else {
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
                    }
                  </svg>
                }
              </span>
              <div class="prompt-banner__text">
                <strong>{{ promptBanner()!.label }}</strong> {{ promptBanner()!.text }}
              </div>
              <button class="prompt-banner__dismiss" type="button"
                      (click)="dismissPromptBanner()"
                      title="Dismiss">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          }

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
                  @for (mood of MOODS; track mood.key) {
                    <div class="mood-chip mood-chip--preview">
                      <app-mood-icon [mood]="mood.key" [size]="22"></app-mood-icon>
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
                  <app-mood-icon [mood]="selectedMood()" [size]="16"></app-mood-icon>
                  <span>Feeling {{ selectedMood() }}</span>
                  <button type="button" class="mood-clear" title="Clear mood"
                          (click)="selectedMood.set('')" [disabled]="submitting()">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
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
                    <app-mood-icon [mood]="mood.key" [size]="22"></app-mood-icon>
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
    .editor-page { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); }
    /* Embedded mode: drop the full-viewport sizing so the component fits
       cleanly inside the dashboard's right column. */
    .editor-page--embedded {
      min-height: 0;
      background: transparent;
    }
    .editor-page--embedded .editor-nav {
      position: relative;
      top: auto;
      background: transparent;
      border-bottom: none;
      padding: .5rem 1.25rem .25rem;
    }
    .editor-page--embedded .editor-main {
      padding: .5rem 1rem 2rem;
    }
    .editor-page--embedded .editor-main .container {
      padding: 1.25rem 1.5rem;
      box-shadow: none;
      border: 1px solid var(--color-border);
    }

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

    .editor-main { flex: 1; padding: 1.25rem 0 3rem; }
    .editor-main .container {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      padding: 2rem 1.75rem;
    }

    /* ── Entry date row (above title) ─────────────────────────── */
    .date-row {
      display: flex;
      align-items: center;
      gap: .75rem;
      flex-wrap: wrap;
      padding-bottom: 1rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid var(--color-border);
    }
    .date-row__label {
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: var(--color-text-3);
    }

    .title-input {
      width: 100%; border: none; outline: none; background: transparent;
      font-family: 'Fraunces', Georgia, serif;
      font-size: 1.875rem; font-weight: 700; letter-spacing: -.015em;
      line-height: 1.2; color: var(--color-text); padding: 0; margin-bottom: 1rem;
      &::placeholder { color: var(--color-text-3); font-weight: 600; }
      &:disabled { opacity: .6; }
    }

    /* ── Editor primary actions — match new design language ─────── */
    .editor-actions .btn--primary {
      background: #0c0e13;
      color: #fff;
      border-radius: 999px;
      padding: .625rem 1.5rem;
      font-weight: 600;
      transition: background .15s, color .15s, transform .15s;
    }
    .editor-actions .btn--primary:hover:not(:disabled) {
      background: var(--color-accent);
      color: #0c0e13;
      transform: translateY(-1px);
    }
    .editor-actions .btn--secondary {
      background: transparent;
      color: var(--color-text-2);
      border: 1px solid var(--color-border);
      border-radius: 999px;
      font-weight: 600;
    }
    .editor-actions .btn--secondary:hover:not(:disabled) {
      background: var(--color-surface-2);
      color: var(--color-text);
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
    .mood-chip app-mood-icon { color: var(--color-text-2); }
    .mood-chip:hover:not(:disabled) app-mood-icon,
    .mood-chip--selected app-mood-icon { color: var(--color-accent); }
    .mood-chip__label { font-size: .6875rem; color: var(--color-text-2); text-align: center; line-height: 1.2; font-weight: 500; }
    .mood-locked-wrap { position: relative; }
    .mood-grid--preview { opacity: .25; pointer-events: none; user-select: none; }
    .mood-lock-overlay {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: .4rem; background: rgba(255,255,255,.5); border-radius: var(--radius-md);
    }
    .mood-lock-icon { font-size: 1.375rem; }
    .mood-lock-text { font-size: .8125rem; color: var(--color-text-2); font-weight: 500; text-align: center; }

    /* Mood-selected badge clear button */
    .mood-selected-badge { display: inline-flex; align-items: center; gap: .375rem; }
    .mood-selected-badge app-mood-icon { color: var(--color-accent); }
    .mood-clear {
      background: none; border: none; padding: .125rem;
      color: var(--color-text-3); cursor: pointer;
      display: flex; align-items: center; border-radius: 50%;
    }
    .mood-clear:hover { color: var(--color-text); background: rgba(0,0,0,.05); }

    /* ── Prompt context banner ─────────────────────────────────── */
    .prompt-banner {
      display: flex;
      align-items: center;
      gap: .75rem;
      padding: .75rem 1rem;
      margin: 0 0 1.25rem;
      background: rgba(18,196,227,.08);
      border: 1px solid rgba(18,196,227,.2);
      border-radius: var(--radius-md);
      font-size: .875rem;
      color: var(--color-accent-dark, #0d9bb5);
      line-height: 1.5;
    }
    .prompt-banner__icon {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      color: var(--color-accent-dark, #0d9bb5);
    }
    .prompt-banner__text { flex: 1; min-width: 0; }
    .prompt-banner__text strong {
      font-weight: 700;
      margin-right: .25rem;
    }
    .prompt-banner__dismiss {
      flex-shrink: 0;
      background: none;
      border: none;
      padding: .25rem;
      border-radius: 4px;
      color: var(--color-accent-dark, #0d9bb5);
      cursor: pointer;
      opacity: .65;
      display: flex;
      align-items: center;
    }
    .prompt-banner__dismiss:hover { opacity: 1; background: rgba(18,196,227,.12); }
  `]
})
export class NewEntryComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editorContainer') private editorContainerRef!: ElementRef<HTMLDivElement>;

  private api      = inject(ApiService);
  private auth     = inject(AuthService);
  private router   = inject(Router);
  private route    = inject(ActivatedRoute);
  private zone     = inject(NgZone);
  private destroy$ = new Subject<void>();
  private autosave$ = new Subject<string>();

  /** When true, the component is rendered inside the dashboard's right column
   *  rather than as a standalone /entry/new page. Hides the page-level back
   *  button, drops full-viewport styling, and emits events instead of routing. */
  @Input() embedded = false;

  /** Pre-fill mood (one of the 12 supported keys). Used when embedded — the
   *  dashboard passes mood from the Today panel's mood-first start row.
   *  Otherwise read from the ?mood= query param. */
  @Input() initialMood: string | null = null;

  /** Pre-fill the prompt-context banner with a brief prompt question (e.g. from
   *  the Today panel's small-prompt card). Otherwise read from ?prompt=. */
  @Input() initialPrompt: string | null = null;

  /** Pre-fill the prompt-context banner with the Daily Spark text (e.g. from
   *  the Today panel's Spark CTA). Otherwise read from ?spark=. */
  @Input() initialSpark: string | null = null;

  /** Emitted when the entry was saved successfully. The dashboard listens for
   *  this to switch the right column back to Today and refresh the list. */
  @Output() saved = new EventEmitter<void>();

  /** Emitted when the user cancels compose (✕ button when embedded). The
   *  dashboard returns to Today view. The autosaved draft is preserved. */
  @Output() canceled = new EventEmitter<void>();

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
  selectedMood   = signal('');

  /**
   * Prompt context banner displayed when this page was launched from
   * the dashboard's Today panel (Spark CTA, prompt card, or mood tile).
   * Cleared once the user dismisses it.
   */
  promptBanner = signal<{ kind: 'prompt' | 'spark' | 'mood'; label: string; text: string } | null>(null);
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
    // Read prompt-context query params handed off from the dashboard's
    // Today panel (Spark CTA, prompt card, mood tile). Used to pre-fill
    // mood and show a context banner.
    this.applyPromptContext();

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

  /**
   * Seeds compose state from prompt/spark/mood context. When embedded
   * inside the dashboard, the parent supplies context via @Input. When
   * rendered as a /entry/new page, falls back to URL query params.
   * Unsupported moods are ignored.
   */
  private applyPromptContext(): void {
    const params = this.route.snapshot.queryParamMap;

    const mood = this.initialMood ?? params.get('mood');
    if (mood && isSupportedMood(mood)) {
      this.selectedMood.set(mood);
      this.promptBanner.set({
        kind: 'mood',
        label: 'Feeling',
        text: mood
      });
      return;
    }

    const prompt = this.initialPrompt ?? params.get('prompt');
    if (prompt) {
      this.promptBanner.set({
        kind: 'prompt',
        label: 'From your prompt:',
        text: this.truncate(prompt, 120)
      });
      return;
    }

    const spark = this.initialSpark ?? params.get('spark');
    if (spark) {
      this.promptBanner.set({
        kind: 'spark',
        label: 'From today\'s Spark:',
        text: this.truncate(spark, 120)
      });
    }
  }

  dismissPromptBanner(): void {
    this.promptBanner.set(null);
  }

  /** ✕ button when embedded — let the parent dashboard switch back to Today. */
  cancelCompose(): void {
    this.canceled.emit();
  }

  /** After a successful save: emit when embedded, route otherwise. */
  private finishAfterSave(): void {
    if (this.embedded) {
      this.saved.emit();
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  private truncate(s: string, max: number): string {
    if (!s) return '';
    return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
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
            setTimeout(() => this.finishAfterSave(), 2000);
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
        this.finishAfterSave();
      },
      error: err => {
        this.submitError.set(err?.error?.error ?? 'Could not publish entry. Please try again.');
        this.submitting.set(false);
        this.editor?.setEditable(true);
      }
    });
  }
}
