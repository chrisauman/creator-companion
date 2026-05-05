import {
  Component, inject, signal, computed, OnInit, OnDestroy,
  ViewChild, ElementRef, NgZone, Input, Output, EventEmitter
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
import { AuthService } from '../../../core/services/auth.service';
import { Entry, MediaItem } from '../../../core/models/models';
import { MOODS, getMoodEmoji } from '../../../core/constants/moods';
import { MoodIconComponent } from '../../../shared/mood-icon/mood-icon.component';
import { TagInputComponent } from '../../../shared/tag-input.component';
import { FormatToolbarComponent } from '../../../shared/format-toolbar.component';
import { SidebarComponent } from '../../../shared/sidebar/sidebar.component';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

@Component({
  selector: 'app-edit-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TagInputComponent, FormatToolbarComponent, SidebarComponent, MoodIconComponent],
  template: `
    <div class="page" [class.page--embedded]="embedded">

      <!-- Desktop sidebar (hidden when embedded — dashboard provides it) -->
      @if (!embedded) {
        <app-sidebar active="dashboard" />
      }
@if (!embedded) {
      }

      <!-- Main content -->
      <main class="main-content">

        <!-- Reader-style top bar — wraps inner row in a 760px-max
             box centred to match the article body below. The Cancel
             pill / heart / Save button align horizontally with the
             title and content edges. -->
        <div class="reader-top">
          <div class="reader-top__inner">
            <button class="cancel-pill" type="button" (click)="cancelEdit()">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Cancel
            </button>
            <div class="reader-top__breadcrumb">
              {{ monthYearLabel() }} · <strong>{{ weekdayDayLabel() }}</strong>
            </div>
            <div class="reader-top__actions">
              <div class="save-indicator-mini" [class]="'save-indicator--' + saveState()">
                <span *ngIf="saveState() === 'saving'">Saving…</span>
                <span *ngIf="saveState() === 'saved'">Saved</span>
                <span *ngIf="saveState() === 'error'">Save failed</span>
              </div>
              <button
                class="reader-icon-btn"
                [class.reader-icon-btn--fav-active]="isFavorited()"
                [title]="isFavorited() ? 'Remove from favorites' : 'Add to favorites'"
                (click)="toggleFavorite()"
                [disabled]="favoriteLoading()"
              >
                <svg width="14" height="14" viewBox="0 0 24 24"
                  [attr.fill]="isFavorited() ? 'currentColor' : 'none'"
                  stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
              <button class="save-btn" type="button"
                      (click)="saveNow()"
                      [disabled]="saving() || !title.trim() || wordCount() < 10 || wordCount() > maxWords()">
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Favorite nudge for free users -->
        <div class="favorite-nudge" *ngIf="showFavoriteNudge()">
          <span>⭐ Favoriting entries is available on the paid plan</span>
          <button class="favorite-nudge__close" (click)="showFavoriteNudge.set(false)">✕</button>
        </div>

        @if (loading()) {
          <div class="loading-state">Loading…</div>
        }

        @if (!loading()) {
          <div class="editor-form reading-style">

            <!-- Date eyebrow + mood inline (matches reader's date row).
                 Tap "Change date" to backfill if paid. -->
            <div class="reading__date-row">
              <span class="reading__date">{{ readerDateLabel() }}</span>
              @if (selectedMood()) {
                <span class="reading__mood">
                  <app-mood-icon [mood]="selectedMood()" [size]="14"></app-mood-icon>
                  {{ selectedMood() }}
                </span>
              }
            </div>

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

              @if (mediaList().length > 0) {
                <div class="image-grid">
                  @for (img of mediaList(); track img.id) {
                    <div class="image-thumb">
                      <img [src]="fullImageUrl(img.url)" [alt]="img.fileName" (error)="onImgError($event)" />
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
                            (click)="selectedMood.set('')" [disabled]="saving()">
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
                      [disabled]="saving()"
                    >
                      <app-mood-icon [mood]="mood.key" [size]="22"></app-mood-icon>
                      <span class="mood-chip__label">{{ mood.key }}</span>
                    </button>
                  }
                </div>
              }
            </div>

            <!-- Footer: word count on the left, subtle trash link on the right.
                 Save moved up to the reader-style top bar. -->
            <div class="editor-footer">
              <span class="word-count"
                [class.word-count--warn]="wordCount() > maxWords() * 0.9"
                [class.word-count--over]="wordCount() > maxWords()">
                {{ wordCount() }} / {{ maxWords() }} words
              </span>
              <button class="trash-link" type="button" (click)="confirmDelete = true" [disabled]="saving()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                </svg>
                Move to trash
              </button>
            </div>

            <div *ngIf="error()" class="alert alert--error" style="margin-top:1rem">{{ error() }}</div>
          </div>
        }
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
    /* ── Page shell ─────────────────────────────────────────────── */
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    /* Embedded mode: drop the full-viewport sizing so the component fits
       cleanly inside the dashboard's right column, and let the dashboard
       provide the sidebar/topbar chrome. */
    .page--embedded {
      min-height: 0;
      flex-direction: column;
    }
    .page--embedded .main-content {
      /* No horizontal padding so the sticky reader-top can span the
         full column width and align with the entry-reader's layout
         when the user transitions reading → editing. */
      padding: 0 0 2.5rem !important;
      background: transparent !important;
    }
    .page--embedded .desktop-bar {
      padding: .25rem 0 .75rem;
    }
    .page--embedded .editor-form {
      /* Body shares the reader's 760px-max centred article so the
         title, toolbar, and body all line up to the same edges. */
      max-width: 760px;
      margin: 0 auto;
      padding: .75rem 2.5rem 2.5rem;
    }
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
    .topbar__brand-name { font-family: var(--font-sans); font-size: .875rem; font-weight: 700; color: #fff; }
    .topbar__actions { margin-left: auto; display: flex; align-items: center; gap: .5rem; flex-shrink: 0; }

    /* ── Main content ────────────────────────────────────────────── */
    .main-content {
      flex: 1; min-width: 0;
      padding: 0 0 calc(80px + env(safe-area-inset-bottom, 0px));
      background: var(--color-surface);
      display: flex; flex-direction: column;
    }
    @media (min-width: 768px) {
      .main-content { padding: 0 0 4rem; background: var(--color-surface); }
    }
    /* Editor body wrapper gets the actual content padding so the sticky
       reader-top can hug the viewport edges. */

    /* ── Desktop action bar ──────────────────────────────────────── */
    .desktop-bar {
      display: none;
    }
    @media (min-width: 768px) {
      .desktop-bar {
        display: flex; align-items: center; justify-content: space-between;
        max-width: 720px; margin: 0 auto 1.5rem;
      }
    }
    .desktop-bar__right { display: flex; align-items: center; gap: .75rem; }

    /* ── Loading ─────────────────────────────────────────────────── */
    .loading-state {
      padding: 3rem 1.5rem; text-align: center;
      color: var(--color-text-3); font-size: .9375rem;
    }

    /* ── Editor form ─────────────────────────────────────────────── */
    .editor-form {
      padding: 1.25rem 1.125rem 2rem;
    }
    @media (min-width: 768px) {
      .editor-form { max-width: 760px; margin: 0 auto; padding: 2rem 1.5rem; }
    }

    /* ── Mobile meta row (date + mood + favorite) ────────────────── */
    .mobile-meta {
      display: flex; align-items: center; gap: .625rem; flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    @media (min-width: 768px) { .mobile-meta { display: none; } }

    /* ── Shared: date + mood badge ───────────────────────────────── */
    .editor-date { font-size: .875rem; color: var(--color-text-2); font-weight: 500; }
    .editor-mood-badge {
      font-size: .8125rem; font-weight: 500; color: var(--color-text-2);
      background: var(--color-surface-2); border: 1px solid var(--color-border);
      padding: .2rem .6rem; border-radius: 100px;
      display: flex; align-items: center; gap: .3rem;
    }

    /* ── Favorite button ─────────────────────────────────────────── */
    .favorite-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 50%;
      border: none; background: transparent; cursor: pointer;
      color: var(--color-text-3); padding: 0;
      transition: color .15s, transform .1s;
      &:hover:not(:disabled) { color: var(--color-accent); transform: scale(1.1); }
      &--active { color: var(--color-accent); }
      &:disabled { opacity: .5; cursor: not-allowed; }
    }

    /* ── Favorite nudge ──────────────────────────────────────────── */
    .favorite-nudge {
      display: flex; align-items: center; justify-content: center; gap: .75rem;
      background: var(--color-accent-light); border-bottom: 1px solid var(--color-accent);
      padding: .5rem 1rem; font-size: .8125rem; color: var(--color-text-2); font-weight: 500;
    }
    .favorite-nudge__close {
      background: none; border: none; cursor: pointer; padding: 0;
      font-size: .875rem; color: var(--color-text-3); line-height: 1;
      &:hover { color: var(--color-text); }
    }

    /* ── Save indicator ──────────────────────────────────────────── */
    .save-indicator {
      font-size: .8125rem;
      &--idle   { color: transparent; }
      &--saving { color: var(--color-text-3); }
      &--saved  { color: var(--color-success, #16a34a); }
      &--error  { color: var(--color-danger); }
    }

    /* ── Title input — matches the entry-reader title size so
       reading → editing feels continuous and never overflows. ─── */
    .title-input {
      width: 100%; border: none; outline: none; background: transparent;
      font-family: var(--font-sans);
      font-size: 1.3125rem; font-weight: 700; letter-spacing: -.01em;
      line-height: 1.3; color: var(--color-text); padding: 0; margin-bottom: 1rem;
      &::placeholder { color: var(--color-text-3); font-weight: 600; }
      &:disabled { opacity: .6; }
    }

    /* ── Reader-style top bar — full-column-width sticky surface
       holds an inner row that's max-width 760px and centred so the
       Cancel pill and Save button align horizontally with the title
       and body content below. */
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
      align-items: center;
      flex-shrink: 0;
    }
    .save-indicator-mini {
      font-size: .75rem;
      font-weight: 500;
      color: var(--color-text-3);
      min-width: 0;
      &.save-indicator--saving { color: var(--color-text-3); }
      &.save-indicator--saved  { color: #16a34a; }
      &.save-indicator--error  { color: var(--color-danger); }
    }
    .reader-icon-btn {
      width: 36px; height: 36px;
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
    .save-btn {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: #0c0e13;
      color: #fff;
      border: none;
      padding: .5rem 1.125rem;
      border-radius: 999px;
      font-family: inherit;
      font-size: .8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: all .15s;
    }
    .save-btn:hover:not(:disabled) {
      background: var(--color-accent);
      color: #0c0e13;
    }
    .save-btn:disabled {
      opacity: .5;
      cursor: not-allowed;
    }

    /* ── Reader-style date row + mood (matches reader) ─────────── */
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
      color: var(--color-accent-dark);
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

    .reading-style {
      max-width: 760px;
      margin: 0 auto;
      padding: 2rem 2.5rem 4rem;
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
    .editor-actions .btn--danger {
      background: transparent;
      color: var(--color-danger);
      border: 1px solid var(--color-danger-light);
      border-radius: 999px;
    }
    .editor-actions .btn--danger:hover:not(:disabled) {
      background: var(--color-danger-light);
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

    /* Editor mood badge — soft warm beige to match the new tag style */
    .editor-mood-badge {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: #f4ede0;
      color: #8a7a52;
      border-radius: 999px;
      padding: .25rem .625rem;
      font-size: .75rem;
      font-weight: 600;
    }

    /* ── Format lock ─────────────────────────────────────────────── */
    .format-lock {
      font-size: .8125rem; color: var(--color-text-3);
      padding: .375rem .5rem; margin-bottom: .75rem;
      background: var(--color-surface-2); border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
    }

    /* ── TipTap ──────────────────────────────────────────────────── */
    .tiptap-wrapper { min-height: 80px; cursor: text; margin-bottom: .5rem; }
    ::ng-deep .tiptap-wrapper .tiptap {
      min-height: 80px; outline: none;
      font-family: var(--font-sans); font-size: 1rem;
      line-height: 1.5; color: var(--color-text);
      p.is-editor-empty:first-child::before {
        content: attr(data-placeholder); color: var(--color-text-3);
        float: left; pointer-events: none; height: 0;
      }
      p { margin: 0 0 .875em; &:last-child { margin-bottom: 0; } }
      h2 {
        font-family: var(--font-sans, system-ui); font-size: 1.25rem; font-weight: 700;
        line-height: 1.3; color: var(--color-text); margin: 1.25rem 0 .4rem;
        &:first-child { margin-top: 0; }
      }
      ul, ol { padding-left: 1.5rem; margin: .25rem 0 .5rem; }
      li { line-height: 1.7; margin-bottom: .15rem; }
      ul { list-style-type: disc; }
      ol { list-style-type: decimal; }
      strong { font-weight: 700; }
      em { font-style: italic; }
      &[contenteditable="false"] { opacity: .6; cursor: not-allowed; }
    }

    /* ── Images ──────────────────────────────────────────────────── */
    .image-section { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid var(--color-border); }
    .image-grid { display: flex; flex-wrap: wrap; gap: .625rem; }
    .image-thumb {
      position: relative; width: 110px; height: 110px;
      border-radius: var(--radius-md); overflow: hidden;
      border: 1px solid var(--color-border); flex-shrink: 0;
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
    }
    .image-thumb__remove {
      position: absolute; top: 4px; right: 4px; width: 22px; height: 22px;
      border-radius: 50%; background: rgba(0,0,0,.6); color: #fff;
      border: none; cursor: pointer; font-size: .65rem;
      display: flex; align-items: center; justify-content: center; line-height: 1;
      transition: background .12s;
      &:hover:not(:disabled) { background: rgba(0,0,0,.85); }
      &:disabled { opacity: .4; cursor: not-allowed; }
    }
    .image-add-btn {
      width: 110px; height: 110px; border-radius: var(--radius-md);
      border: 2px dashed var(--color-border); background: transparent;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: var(--color-text-3); font-size: 1.75rem; flex-shrink: 0;
      transition: border-color .15s, color .15s;
      &:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
      &:disabled { opacity: .4; cursor: not-allowed; }
    }
    .upload-spinner { font-size: 1rem; animation: spin 1s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .drop-zone {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: .35rem; padding: 1.5rem; border: 2px dashed var(--color-border);
      border-radius: var(--radius-lg); cursor: pointer; transition: border-color .15s, background .15s;
      &:hover, &--over { border-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 5%, transparent); }
    }
    .drop-zone__icon { font-size: 1.5rem; }
    .drop-zone__text { font-size: .9375rem; font-weight: 500; color: var(--color-text-2); }
    .drop-zone__hint { font-size: .75rem; color: var(--color-text-3); }
    .image-error { font-size: .8125rem; color: var(--color-danger); margin-top: .5rem; }

    /* ── Tags ────────────────────────────────────────────────────── */
    .tag-section { margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid var(--color-border); }
    .tag-section__header { display: flex; align-items: center; gap: .5rem; margin-bottom: .75rem; }
    .tag-section__label { font-size: .9375rem; font-weight: 600; color: var(--color-text); }
    .tag-section__hint {
      font-size: .6875rem; font-weight: 500; text-transform: uppercase; letter-spacing: .05em;
      color: var(--color-text-3); background: var(--color-surface-2);
      padding: .15rem .5rem; border-radius: 100px;
    }

    /* ── Mood picker ─────────────────────────────────────────────── */
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
    .mood-selected-badge app-mood-icon { color: var(--color-accent); }
    .mood-clear {
      background: none; border: none; padding: .125rem;
      color: var(--color-text-3); cursor: pointer;
      display: inline-flex; align-items: center; border-radius: 50%;
      margin-left: .125rem;
    }
    .mood-clear:hover { color: var(--color-text); background: rgba(0,0,0,.05); }
    .mood-locked-wrap { position: relative; }
    .mood-grid--preview { opacity: .25; pointer-events: none; user-select: none; }
    .mood-lock-overlay {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: .4rem;
      background: rgba(255,255,255,.5); border-radius: var(--radius-md);
    }
    .mood-lock-icon { font-size: 1.375rem; }
    .mood-lock-text { font-size: .8125rem; color: var(--color-text-2); font-weight: 500; text-align: center; }

    /* ── Footer / actions ────────────────────────────────────────── */
    .editor-footer {
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 1rem; margin-top: 1.5rem;
      padding-top: 1rem; border-top: 1px solid var(--color-border);
    }
    .word-count { font-size: .8125rem; color: var(--color-text-3);
      &--warn { color: var(--color-streak); }
      &--over { color: var(--color-danger); font-weight: 600; }
    }
    .editor-actions { display: flex; gap: .75rem; flex-wrap: wrap; }

    /* Subtle "move to trash" link in the footer (Save is now in the top bar) */
    .trash-link {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: none;
      border: none;
      padding: .25rem .5rem;
      font-family: inherit;
      font-size: .8125rem;
      font-weight: 500;
      color: var(--color-text-3);
      cursor: pointer;
      border-radius: 6px;
      transition: color .15s, background .15s;
    }
    .trash-link:hover:not(:disabled) {
      color: var(--color-danger);
      background: rgba(225,29,72,.06);
    }
    .trash-link:disabled { opacity: .4; cursor: not-allowed; }

    /* ── Delete overlay ──────────────────────────────────────────── */
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.4);
      display: flex; align-items: center; justify-content: center;
      padding: 1.5rem; z-index: 200;
    }
    .confirm-dialog { max-width: 400px; width: 100%; }
    .confirm-actions { display: flex; gap: .75rem; justify-content: flex-end; margin-top: 1.25rem; }
  `]
})
export class EditEntryComponent implements OnInit, OnDestroy {
  @ViewChild('editorContainer') private editorContainerRef!: ElementRef<HTMLDivElement>;

  private api      = inject(ApiService);
  private auth     = inject(AuthService);
  private router   = inject(Router);
  private route    = inject(ActivatedRoute);
  private zone     = inject(NgZone);
  private destroy$ = new Subject<void>();
  private autosave$ = new Subject<void>();

  /** When true, the component is rendered inside the dashboard's right column
   *  rather than as a standalone /entry/:id/edit page. Hides the page-level
   *  back/topbar/sidebar chrome and emits events instead of routing. */
  @Input() embedded = false;

  /** Pre-set the entry id to edit (instead of reading from the route). The
   *  dashboard provides this when the user clicks Edit on an inline reading
   *  entry. */
  @Input() entryIdInput: string | null = null;

  /** Emitted on successful save. Dashboard switches back to reading view. */
  @Output() saved = new EventEmitter<void>();

  /** Emitted when the user cancels the edit (✕ button when embedded). */
  @Output() canceled = new EventEmitter<void>();

  /** Emitted when the entry is moved to trash. Dashboard returns to Today. */
  @Output() deleted = new EventEmitter<void>();

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
    // When embedded, the dashboard provides the entry id directly.
    this.entryId = this.embedded
      ? (this.entryIdInput ?? '')
      : (this.route.snapshot.paramMap.get('id') ?? '');

    this.auth.loadCapabilities().subscribe(caps => {
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

  /** "May 2026" — for the top breadcrumb (matches reader). */
  monthYearLabel(): string {
    if (!this.entry()) return '';
    return new Date(this.entry()!.entryDate + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long', year: 'numeric'
    });
  }

  /** "Sunday, May 3" — for the top breadcrumb (matches reader). */
  weekdayDayLabel(): string {
    if (!this.entry()) return '';
    return new Date(this.entry()!.entryDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
  }

  /** "SUNDAY · 8:54 PM" — date eyebrow above the title (matches reader). */
  readerDateLabel(): string {
    if (!this.entry()) return '';
    const d = new Date(this.entry()!.entryDate + 'T00:00:00');
    const created = new Date(this.entry()!.createdAt);
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const time = created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${weekday} · ${time}`;
  }

  fullImageUrl(relativeUrl: string): string {
    return this.api.getImageUrl(relativeUrl);
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    console.error('[Image load failed]', img.src);
    img.style.display = 'none';
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
        if (this.embedded) {
          this.saved.emit();
        } else {
          this.router.navigate(['/entry', this.entryId]);
        }
      },
      error: err => {
        this.error.set(err?.error?.error ?? 'Could not save. Please try again.');
        this.saving.set(false);
        this.editor?.setEditable(true);
      }
    });
  }

  /** ✕ button when embedded — discard local edits and return to read view. */
  cancelEdit(): void {
    this.canceled.emit();
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
      next: () => this.afterDelete(),
      error: () => this.afterDelete()
    });
  }

  private afterDelete(): void {
    if (this.embedded) {
      this.deleted.emit();
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
