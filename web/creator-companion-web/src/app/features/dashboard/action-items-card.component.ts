import {
  Component, inject, signal, computed, OnInit, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ActionItem } from '../../core/models/models';

/**
 * To-Do List — clean, minimal, modern. Lives in column 3 of the dashboard
 * (when the user clicks the sidebar's "To Do List" link) and on the
 * standalone /todos page on mobile.
 *
 * Design contracts:
 *
 *  - Persistent "+ Add an item" input at the top (no reveal-form click).
 *  - New items appear at the TOP of the list (server enforces this in
 *    POST /v1/action-items by setting SortOrder=0 + shifting +1).
 *  - Always-visible muted drag handle on the LEFT for reorder. Brightens
 *    on hover. Drag-and-drop via Angular CDK; works on mouse + touch.
 *  - Round checkbox to mark complete; cyan-filled with checkmark when
 *    done.
 *  - Click anywhere on the text → enter inline edit (single click, no
 *    pencil icon). cursor: text on hover signals interactivity.
 *  - Edit mechanic: Enter saves, Esc cancels (restores original), blur
 *    saves. Empty text on blur cancels rather than deleting. No Save /
 *    Cancel buttons.
 *  - Delete affordance:
 *      Desktop: hover-X on the right edge of the row (faint at rest,
 *      full opacity on hover).
 *      Mobile:  swipe-left to reveal a red Delete tile, tap to confirm
 *      (Apple Mail pattern).
 *  - Done section collapsed by default at the bottom; same row template
 *    minus the drag handle + with strikethrough.
 *
 * Cap: 100 active items (server-enforced). When at cap, the add input
 * is disabled with a quiet helper line; existing items can still be
 * completed/edited/deleted normally.
 *
 * Always renders fully expanded — the previous "collapsible widget"
 * mode (showing a one-line summary) is gone; this list is now only
 * accessible by clicking the sidebar nav item, never inline on the
 * main dashboard.
 */
@Component({
  selector: 'app-action-items-card',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  template: `
    <div class="todo-list">

      <!-- Persistent add input. Always visible at the top so users can
           jot something without ceremony. Disabled at the cap. Hidden
           entirely in read-only mode (trial expired w/o sub) — the
           list below still renders so the user can see their items,
           they just can't add until they subscribe. -->
      @if (!readOnly()) {
        <div class="todo-list__add" [class.todo-list__add--disabled]="atCap()">
          <span class="todo-list__add-plus" aria-hidden="true">+</span>
          <input class="todo-list__add-input"
                 type="text"
                 [(ngModel)]="newText"
                 (keydown.enter)="submitAdd()"
                 (keydown.escape)="cancelAdd()"
                 [placeholder]="atCap() ? 'List is full' : 'Add an item'"
                 [disabled]="atCap() || saving()"
                 maxlength="150">
          @if (newText.length > 0 && newText.length >= 120) {
            <span class="todo-list__char-count">{{ 150 - newText.length }}</span>
          }
        </div>
      }
      @if (atCap()) {
        <p class="todo-list__cap-note">
          Complete or delete some items to add more.
        </p>
      }

      <!-- Active list -->
      @if (activeItems().length > 0) {
        <ul class="todo-list__items"
            cdkDropList
            (cdkDropListDropped)="onDrop($event)">
          @for (item of activeItems(); track item.id) {
            <!-- The entire row is the tap target for entering edit mode
                 (rather than the smaller .text span underneath). This
                 was the single biggest mobile usability fix: tapping
                 anywhere on the row enters edit immediately, instead
                 of requiring a precise hit on the text glyphs. onRowClick
                 filters out clicks that landed on the checkbox / drag
                 handle / delete button so those keep their normal
                 behaviour. Previously the row had touchstart/touchmove/
                 touchend handlers for a swipe-to-delete gesture, but
                 iOS Safari was waiting to disambiguate gesture-vs-tap
                 before firing click — that's what manifested as "first
                 tap only highlights, second tap edits AND zooms." The
                 swipe is gone (replaced by an always-visible X on
                 mobile) so tap fires immediately. -->
            <li class="todo-list__item"
                [class.todo-list__item--editing]="editingId() === item.id"
                cdkDrag
                cdkDragLockAxis="y"
                (click)="onRowClick($event, item)">

              <!-- Drag handle — bigger glyph + brighter at rest so it's
                   obviously interactive. The dots are 1.6r (was 1.2r)
                   and the SVG is 14×18 (was 10×14). -->
              <span class="todo-list__handle" cdkDragHandle title="Drag to reorder">
                <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor"
                     aria-hidden="true">
                  <circle cx="4"  cy="3"  r="1.6"/><circle cx="10" cy="3"  r="1.6"/>
                  <circle cx="4"  cy="9"  r="1.6"/><circle cx="10" cy="9"  r="1.6"/>
                  <circle cx="4"  cy="15" r="1.6"/><circle cx="10" cy="15" r="1.6"/>
                </svg>
              </span>

              <!-- Round checkbox. Disabled (not hidden) in read-only
                   mode so the row layout doesn't shift; the user can
                   still see what's on their list. -->
              <button class="todo-list__check"
                      type="button"
                      (click)="toggle(item)"
                      [disabled]="readOnly()"
                      title="Mark complete"
                      aria-label="Mark complete">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>

              <!-- Text or inline-edit textarea. Textarea instead of
                   input so long entries wrap naturally on multiple
                   lines (matching how the .text span renders at rest)
                   instead of horizontally scrolling on a single line.
                   Auto-resizes via autoSize() on each input event. -->
              <!-- Text or inline edit. In read-only mode click-to-edit
                   is suppressed; the text just renders as plain. -->
              @if (editingId() === item.id) {
                <textarea class="todo-list__edit-input"
                          [(ngModel)]="editText"
                          (keydown.enter)="$event.preventDefault(); commitEdit(item)"
                          (keydown.escape)="cancelEdit()"
                          (blur)="commitEdit(item)"
                          (input)="autoSize($event)"
                          rows="1"
                          maxlength="150"></textarea>
              } @else {
                <!-- Plain text — no click handler here; the parent <li>
                     handles tap-to-edit. Click on text would double-
                     fire and also be a smaller target. -->
                <span class="todo-list__text">{{ item.text }}</span>
              }

              <!-- Delete affordance — single X button. On desktop it's
                   invisible until row-hover (the muted hover-X), on
                   mobile it's always visible (since hover doesn't
                   exist). Earlier there was a separate swipe-revealed
                   tile for mobile; that's gone because the gesture was
                   blocking single-tap-to-edit. -->
              @if (!readOnly()) {
                <button class="todo-list__delete"
                        type="button"
                        (click)="deleteItem(item); $event.stopPropagation()"
                        title="Delete"
                        aria-label="Delete item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6"  y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              }
            </li>
          }
        </ul>
      }

      <!-- Loading state. Without this, the body between the add input
           and the (post-load) items rendered as a blank gap, and users
           perceived a click-then-nothing pause. Shows only on the very
           first load when we have nothing yet to display. -->
      @if (loading() && activeItems().length === 0 && completedItems().length === 0) {
        <p class="todo-list__loading" aria-live="polite">Loading…</p>
      }

      <!-- Empty state -->
      @if (activeItems().length === 0 && completedItems().length === 0 && !loading()) {
        <div class="todo-list__empty">
          <p class="todo-list__empty-title">Nothing on your list yet.</p>
          <p class="todo-list__empty-body">
            Daily reminders, next actions, anything you want off your mind.
          </p>
        </div>
      }

      <!-- All caught up (completed but no active) -->
      @if (activeItems().length === 0 && completedItems().length > 0) {
        <p class="todo-list__caught-up">All clear.</p>
      }

      @if (error()) {
        <p class="todo-list__error">{{ error() }}</p>
      }

      <!-- Done section -->
      @if (completedItems().length > 0) {
        <div class="todo-list__done">
          <button class="todo-list__done-toggle"
                  type="button"
                  (click)="doneExpanded.set(!doneExpanded())"
                  [attr.aria-expanded]="doneExpanded()"
                  [attr.aria-label]="doneExpanded() ? 'Hide completed to-dos' : 'Show completed to-dos'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round"
                 [style.transform]="doneExpanded() ? 'rotate(90deg)' : 'rotate(0deg)'"
                 style="transition: transform .2s ease" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            Done ({{ completedItems().length }})
          </button>

          @if (doneExpanded()) {
            <ul class="todo-list__items todo-list__items--done">
              @for (item of completedItems(); track item.id) {
                <li class="todo-list__item todo-list__item--completed">

                  <!-- Completed rows skip the drag handle entirely so the
                       checkbox + text start flush against the row's left
                       edge — perfect alignment with active rows isn't
                       worth the empty gutter on the completed side. -->

                  <button class="todo-list__check todo-list__check--done"
                          type="button"
                          (click)="toggle(item)"
                          [disabled]="readOnly()"
                          title="Restore"
                          aria-label="Restore item">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <circle cx="9" cy="9" r="8" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="1.5"/>
                      <polyline points="5.5,9 8,11.5 12.5,7" stroke="white" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    </svg>
                  </button>

                  <span class="todo-list__text todo-list__text--done">{{ item.text }}</span>

                  <!-- Delete affordances on completed items also hidden
                       in read-only mode. -->
                  @if (!readOnly()) {
                    <button class="todo-list__delete"
                            type="button"
                            (click)="deleteItem(item)"
                            title="Delete"
                            aria-label="Delete item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6"  y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  }
                </li>
              }
            </ul>

            <button class="todo-list__clear-done"
                    type="button"
                    (click)="clearCompleted()">
              Clear all done
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    /* ── Host element ──────────────────────────────────────────── */
    /* Bound to 720px and centred regardless of context (embedded in
       column 3, or full-page on /todos). The wrapping page provides
       outer breathing room; the list itself sits flush inside that. */
    :host {
      display: block;
      max-width: 720px;
      margin: 0 auto;
      padding: 0 .25rem;
    }
    .todo-list {
      width: 100%;
    }

    /* ── Add input ──────────────────────────────────────────────── */
    /* Inline + sign + text input, sitting in a soft underlined row.
       Always-visible to remove the "click to reveal a form" friction.
       Padding matches the rows below so columns stay visually
       aligned and the rhythm reads as one continuous list. */
    .todo-list__add {
      display: flex;
      align-items: center;
      gap: .625rem;
      padding: .875rem .875rem;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: .25rem;
      transition: border-color .15s;
    }
    .todo-list__add:focus-within {
      border-color: var(--color-accent);
    }
    .todo-list__add--disabled { opacity: .55; }
    .todo-list__add-plus {
      flex-shrink: 0;
      font-size: 1.25rem;
      font-weight: 300;
      color: var(--color-text-3);
      width: 18px;
      text-align: center;
      line-height: 1;
    }
    .todo-list__add:focus-within .todo-list__add-plus { color: var(--color-accent); }
    .todo-list__add-input {
      flex: 1; min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      font-family: var(--font-sans);
      /* See the iOS-zoom comment on .todo-list__edit-input — same
         defense-in-depth, same surface (this list is where users
         actually saw the zoom). */
      font-size: 16px;
      line-height: 1.35;
      font-weight: 500;
      letter-spacing: -.01em;
      color: var(--color-text);
      padding: .375rem 0;
    }
    .todo-list__add-input::placeholder {
      color: var(--color-text-3);
      font-weight: 400;
    }
    .todo-list__char-count {
      flex-shrink: 0;
      font-size: .6875rem;
      color: var(--color-text-3);
      font-variant-numeric: tabular-nums;
    }
    .todo-list__cap-note {
      font-size: .75rem;
      color: var(--color-text-3);
      margin: .375rem .875rem 1rem;
    }

    /* ── Item list ──────────────────────────────────────────────── */
    .todo-list__items {
      list-style: none;
      padding: 0;
      margin: .25rem 0 0;
    }

    /* Row vertical padding scaled up to match the journal entry-row
       breathing room (~1rem range) so to-do items and entries feel
       like they live in the same typographic system. Horizontal
       padding gives content room from the container edges. */
    .todo-list__item {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: .625rem;
      padding: .875rem .875rem;
      border-bottom: 1px solid var(--color-border);
      background: transparent;
      transition: background .15s;
      cursor: pointer;
      /* touch-action: manipulation on the ROW (not just the inner
         text span) is the load-bearing fix. It tells iOS Safari "this
         is a single-tap surface — don't wait 300ms to disambiguate
         tap-vs-double-tap-to-zoom, don't interpret a quick second
         tap as smart-zoom, just fire click immediately." Putting it
         on the small .text span (the first fix attempt) didn't
         cover the full tap area, so iOS still ran its gesture
         disambiguation on taps that landed on the row padding. */
      touch-action: manipulation;
      /* Suppress the iOS Safari translucent-gray tap flash. The user
         was reading this flash as "the row highlighted but nothing
         happened" — which is technically what happens before click
         fires. Transparent here makes the click feel instant; if a
         hover/active state is wanted for desktop it's added via the
         pointer-fine gated rule below. */
      -webkit-tap-highlight-color: transparent;
      /* Removed will-change: transform — it created a compositor
         layer that iOS Safari's focus / viewport-zoom heuristics
         misbehaved inside (textarea focus would auto-zoom even with
         font-size: 16px, because iOS reads the layer's transformed
         coordinate space and decides the input is "too small").
         Without will-change, focus works correctly and no zoom
         triggers. The CDK drag-drop animations don't need it. */
    }
    .todo-list__item:last-child { border-bottom: none; }
    /* Subtle hover — soft brand-cyan tint instead of a neutral gray
       so the highlight matches the rest of the app's hover language
       (cyan corner buttons, cyan-tinted preview banners, etc).
       Low-alpha so it reads as a tint, not a solid block.

       Gated to pointer-fine devices because on iOS Safari, any
       element with a :hover rule AND a click handler triggers the
       "first tap shows hover, second tap fires click" two-step —
       which on this list manifested as the row highlighting on the
       first tap and only entering edit mode on the second. Gating
       hover off for touch lets the first tap fire click immediately. */
    @media (hover: hover) and (pointer: fine) {
      .todo-list__item:hover {
        background: rgba(18, 196, 227, .07);
      }
    }
    .todo-list__item--editing {
      background: rgba(18, 196, 227, .07);
    }

    /* CDK drag-preview / drop-placeholder treatment so reorder feels solid. */
    .cdk-drag-preview {
      box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,.08));
      border-radius: 8px;
      background: #fff;
    }
    .cdk-drag-placeholder { opacity: 0; }
    .cdk-drag-animating { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
    .todo-list__items.cdk-drop-list-dragging .todo-list__item:not(.cdk-drag-placeholder) {
      transition: transform 250ms cubic-bezier(0,0,0.2,1);
    }

    /* ── Drag handle ────────────────────────────────────────────── */
    /* Always visible but very muted at rest; brightens on row hover.
       Cursor: grab so the affordance reads as draggable. Vertically
       padded to match the first line of text (rows can span multiple
       lines for long content + edit textareas). */
    /* Drag handle. Default state is now visibly interactive — the
       previous .35 opacity made it feel decorative rather than
       grabbable. Hover gets a soft pill background so it reads as
       a button surface. */
    .todo-list__handle {
      flex-shrink: 0;
      width: 22px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-3);
      opacity: .65;
      cursor: grab;
      border-radius: 6px;
      transition: opacity .15s, color .15s, background .15s;
      /* CDK drag-drop on iOS Chrome: without touch-action: none the
         browser claims the touch as a scroll gesture before CDK can
         start tracking it, so drag never engages. This is required
         on the actual drag-grip element (not just the cdkDrag root). */
      touch-action: none;
      -webkit-touch-callout: none;
      user-select: none;
    }
    .todo-list__handle:hover {
      opacity: 1;
      color: var(--color-text);
      background: rgba(18,196,227,.1);
    }
    .todo-list__handle:active { cursor: grabbing; }
    .todo-list__item:hover .todo-list__handle { opacity: .9; }
    .todo-list__handle--placeholder {
      cursor: default;
      opacity: 0;
      touch-action: auto;
    }
    /* On touch devices the dot grip alone is too small to hit reliably
       (Apple HIG calls for ~44px). Widen the hit area and keep the
       glyph fully visible since "hover to discover" doesn't apply. */
    @media (hover: none) and (pointer: coarse) {
      .todo-list__handle {
        width: 40px;
        height: 36px;
        opacity: .8;
        margin-left: -8px; /* recoup the extra width so layout doesn't shift */
      }
    }

    /* ── Checkbox ───────────────────────────────────────────────── */
    /* Fixed 22x22 box pinned to the top-of-content (via parent
       align-items: flex-start). On multi-line text the box stays
       aligned with the first line rather than centring vertically
       across the whole row. */
    .todo-list__check {
      flex-shrink: 0;
      width: 22px; height: 22px;
      display: grid; place-items: center;
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--color-text-3);
      transition: color .15s, transform .1s;
    }
    .todo-list__check:hover { color: var(--color-accent); }
    .todo-list__check:active { transform: scale(.92); }
    .todo-list__check--done { color: var(--color-accent); }

    /* ── Text ───────────────────────────────────────────────────── */
    /* Sized to match the journal entry-row title (1.0625rem) so the
       to-do list and entry list feel like they live in the same
       typographic system. Weight is 500 (medium) rather than 700 so
       a vertical stack of items doesn't read shouty — entries are
       discrete cards with one bold title each, to-do items are a
       sequence the user scans. Click anywhere on the text to enter
       edit mode (cursor: text hints at it without a pencil icon). */
    .todo-list__text {
      flex: 1;
      min-width: 0;
      font-family: var(--font-sans);
      font-size: 1rem;
      line-height: 1.35;
      font-weight: 500;
      letter-spacing: -.01em;
      color: var(--color-text);
      /* cursor inherits from .todo-list__item (which is cursor:pointer)
         so the whole row reads as clickable. Previously this was
         cursor:text, which on iOS made the span behave like text
         content (showing a text cursor on tap) rather than a tap
         target — that's why first tap "only highlighted" before. */
      cursor: inherit;
      padding: .125rem 0;
      word-break: break-word;
      user-select: none;
      /* Disable the long-press magnifier/callout iOS shows on text
         spans — without this, a slightly-held tap would surface the
         macro magnifier and interrupt the click. */
      -webkit-touch-callout: none;
    }
    .todo-list__text--done {
      color: var(--color-text-3);
      text-decoration: line-through;
      text-decoration-thickness: 1px;
      text-decoration-color: var(--color-text-3);
    }

    /* ── Inline edit textarea ───────────────────────────────────── */
    /* Mirrors .todo-list__text exactly so the row's visual layout
       doesn't shift on edit-mode toggle. resize: none + overflow:
       hidden because we drive the height imperatively via
       resizeTextarea() on the (input) event. */
    .todo-list__edit-input {
      flex: 1; min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      font-family: var(--font-sans);
      /* Explicit 16px (not 1rem) on the textarea is iOS-zoom
         defense-in-depth. The global mobile rule in styles.scss
         already enforces 16px on every input/textarea below 768px,
         but stating it locally too means a future refactor that
         scopes the global rule differently won't silently
         reintroduce auto-zoom on this textarea. iOS Safari zooms
         the viewport whenever a focused field's computed font-size
         falls below 16px — and the to-do edit textarea was the
         specific surface where users reported the zoom-then-stuck
         viewport issue. */
      font-size: 16px;
      line-height: 1.35;
      font-weight: 500;
      letter-spacing: -.01em;
      color: var(--color-text);
      padding: .125rem 0;
      margin: 0;
      resize: none;
      overflow: hidden;
      word-break: break-word;
      display: block;
    }

    /* ── Desktop hover delete X ─────────────────────────────────── */
    /* Pinned to the row's top-of-content (parent align-items:
       flex-start) so on multi-line rows it stays next to the first
       line, not floating mid-row. */
    .todo-list__delete {
      flex-shrink: 0;
      width: 28px; height: 28px;
      display: grid; place-items: center;
      background: transparent;
      border: none;
      padding: 0;
      margin-top: -3px;
      cursor: pointer;
      color: var(--color-text-3);
      opacity: 0;
      transition: opacity .15s, color .15s, background .15s;
      border-radius: 50%;
    }
    .todo-list__item:hover .todo-list__delete { opacity: .55; }
    .todo-list__delete:hover {
      opacity: 1 !important;
      color: var(--color-danger, #e11d48);
      background: rgba(225,29,72,.08);
    }
    /* While editing, suppress the delete to avoid accidental clicks. */
    .todo-list__item--editing .todo-list__delete {
      visibility: hidden;
    }

    /* On touch devices, the swipe-to-delete gesture has been removed
       (it was blocking single-tap-to-edit on iOS) — so the X needs
       to be always visible. Same .55 opacity desktop uses on hover,
       just applied at rest. The X is its own button with its own
       click handler that stopPropagation's, so tapping it deletes
       the row without also triggering the row-level edit click. */
    @media (hover: none) and (pointer: coarse) {
      .todo-list__delete { opacity: .55; }
    }

    /* ── Empty / caught-up ──────────────────────────────────────── */
    .todo-list__empty {
      padding: 2rem 1rem 1rem;
      text-align: center;
    }
    .todo-list__empty-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text);
      margin: 0 0 .375rem;
    }
    .todo-list__empty-body {
      font-size: .875rem;
      color: var(--color-text-3);
      margin: 0;
      line-height: 1.5;
      max-width: 36ch;
      margin-inline: auto;
    }
    .todo-list__caught-up {
      padding: 1.5rem 1rem .5rem;
      text-align: center;
      font-size: .9375rem;
      color: var(--color-text-3);
      margin: 0;
    }
    .todo-list__loading {
      padding: 1.5rem 1rem;
      text-align: center;
      font-size: .9375rem;
      color: var(--color-text-3);
      margin: 0;
    }
    .todo-list__error {
      font-size: .8125rem;
      color: var(--color-danger, #e11d48);
      margin: .5rem 0;
    }

    /* ── Done section ────────────────────────────────────────────── */
    .todo-list__done {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--color-border);
    }
    .todo-list__done-toggle {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      background: transparent;
      border: none;
      padding: .25rem 0;
      font-family: inherit;
      font-size: .8125rem;
      font-weight: 600;
      color: var(--color-text-2);
      cursor: pointer;
    }
    .todo-list__done-toggle:hover { color: var(--color-text); }

    .todo-list__items--done .todo-list__item {
      background: transparent;
      /* Completed rows aren't click-to-edit (already done), so revert
         the row-level pointer cursor back to default. */
      cursor: default;
    }
    @media (hover: hover) and (pointer: fine) {
      .todo-list__items--done .todo-list__item:hover {
        background: var(--color-surface, #fff);
      }
    }

    .todo-list__clear-done {
      background: transparent;
      border: none;
      color: var(--color-text-3);
      font-family: inherit;
      font-size: .75rem;
      cursor: pointer;
      padding: .5rem 0;
      margin-top: .5rem;
    }
    .todo-list__clear-done:hover {
      color: var(--color-danger, #e11d48);
    }
  `]
})
export class ActionItemsCardComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);

  /** Drives the in-row write locks (add input hidden, checkboxes
   *  disabled, delete/edit hidden). The list itself still renders so
   *  the user keeps visibility into what they've got. */
  readOnly = this.auth.isReadOnly;
  private host: ElementRef<HTMLElement> = inject(ElementRef);

  // ── Data ─────────────────────────────────────────────────────────
  private items = signal<ActionItem[]>([]);
  loading = signal(true);
  saving  = signal(false);
  error   = signal('');

  activeItems    = computed(() => this.items().filter(i => !i.isCompleted));
  completedItems = computed(() => this.items().filter(i => i.isCompleted));
  atCap          = computed(() => this.activeItems().length >= 100);

  // ── UI state ─────────────────────────────────────────────────────
  doneExpanded   = signal(false);
  editingId      = signal<number | null>(null);

  /** Two-way bound to the add input. */
  newText  = '';
  /** Two-way bound to the inline edit input. */
  editText = '';
  /** Original text snapshot for restoring on Esc / empty-blur. */
  private editOriginal = '';

  ngOnInit(): void {
    this.load();
  }

  // ── Loading ──────────────────────────────────────────────────────
  private load(): void {
    this.api.getActionItems().subscribe({
      next: items => { this.items.set(items); this.loading.set(false); },
      error: err => {
        this.error.set(this.errMsg(err) || 'Could not load to-do list.');
        this.loading.set(false);
      }
    });
  }

  // ── Add ───────────────────────────────────────────────────────────
  submitAdd(): void {
    const text = this.newText.trim();
    if (!text || this.atCap()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.createActionItem(text).subscribe({
      next: item => {
        // New items always go to the top of the active list (server
        // enforces SortOrder=0 and shifts existing +1). We mirror
        // that locally by prepending to the active section so the UI
        // updates instantly without waiting for a refetch.
        this.items.update(list => [item, ...list.map(i =>
          !i.isCompleted ? { ...i, sortOrder: i.sortOrder + 1 } : i
        )]);
        this.newText = '';
        this.saving.set(false);
      },
      error: err => {
        this.error.set(this.errMsg(err) || 'Could not add item.');
        this.saving.set(false);
      }
    });
  }

  cancelAdd(): void { this.newText = ''; }

  // ── Toggle complete ──────────────────────────────────────────────
  toggle(item: ActionItem): void {
    this.error.set('');
    this.api.toggleActionItem(item.id).subscribe({
      next: updated => {
        this.items.update(list => list.map(i => i.id === updated.id ? updated : i));
      },
      error: err => this.error.set(this.errMsg(err) || 'Could not update item.')
    });
  }

  // ── Edit (click-to-edit) ─────────────────────────────────────────

  /**
   * Row click → enter edit mode, but only when the tap actually
   * landed on row content (text or padding), not on one of the
   * interactive sub-elements (drag handle, checkbox, delete X) which
   * have their own handlers. event.target.closest() walks up the DOM
   * from the actual touch target to check for those sub-elements;
   * if any match, this is a no-op and the sub-element's handler
   * runs instead.
   *
   * This replaced the previous "click on the .text span" approach —
   * the span was a small target relative to the row, and iOS Safari
   * was misinterpreting taps near the edges as gesture-starts (in
   * conjunction with the now-removed swipe-to-delete). Routing the
   * click through the row itself + filtering by target is both a
   * bigger tap target AND skips the gesture-disambiguation delay
   * that was costing the first tap.
   */
  onRowClick(ev: MouseEvent, item: ActionItem): void {
    if (this.readOnly()) return;
    if (this.editingId() === item.id) return;
    const target = ev.target as HTMLElement;
    // Skip when the tap landed on the drag handle, checkbox, delete
    // X, or the textarea itself (which only exists when already
    // editing — but defensive).
    if (target.closest(
      '.todo-list__handle, .todo-list__check, .todo-list__delete, ' +
      '.todo-list__edit-input'
    )) return;
    this.startEdit(item);
  }

  startEdit(item: ActionItem): void {
    this.editText = item.text;
    this.editOriginal = item.text;
    this.editingId.set(item.id);
    // Wait for Angular to render the @if branch (replacing the .text
    // span with the textarea), then focus, place caret at end, and
    // size to fit content. setTimeout(0) is more reliable than
    // queueMicrotask here because it waits past Angular's change-
    // detection cycle, by which point the new textarea is in the
    // DOM with its ngModel value bound. Without this, long entries
    // were getting stuck at the textarea's intrinsic 1-row height.
    setTimeout(() => this.focusEditTextarea(), 0);
  }

  /** Focuses the currently-active edit textarea, places the caret at
   *  the end, and sizes the textarea to fit its content. Called once
   *  on entering edit mode. Subsequent typing triggers autoSize() on
   *  every input event. */
  private focusEditTextarea(): void {
    const ta = this.host.nativeElement.querySelector<HTMLTextAreaElement>(
      '.todo-list__item--editing .todo-list__edit-input'
    );
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    this.resizeTextarea(ta);
  }

  /** Save on Enter or blur. Empty text = cancel (restore). */
  commitEdit(item: ActionItem): void {
    if (this.editingId() !== item.id) return;
    const trimmed = this.editText.trim();
    if (!trimmed) {
      this.cancelEdit();
      return;
    }
    if (trimmed === item.text) {
      this.cancelEdit();
      return;
    }
    const optimisticUpdated = { ...item, text: trimmed };
    this.items.update(list => list.map(i => i.id === item.id ? optimisticUpdated : i));
    this.editingId.set(null);
    this.api.updateActionItem(item.id, trimmed).subscribe({
      next: updated => {
        this.items.update(list => list.map(i => i.id === updated.id ? updated : i));
      },
      error: err => {
        // Revert on failure
        this.items.update(list => list.map(i => i.id === item.id ? item : i));
        this.error.set(this.errMsg(err) || 'Could not save edit.');
      }
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editText = '';
    this.editOriginal = '';
  }

  // ── Delete ───────────────────────────────────────────────────────
  deleteItem(item: ActionItem): void {
    this.error.set('');
    // Optimistic remove
    const previous = this.items();
    this.items.set(previous.filter(i => i.id !== item.id));
    this.api.deleteActionItem(item.id).subscribe({
      error: err => {
        // Restore on failure
        this.items.set(previous);
        this.error.set(this.errMsg(err) || 'Could not delete item.');
      }
    });
  }

  clearCompleted(): void {
    if (!confirm('Clear all completed items? This cannot be undone.')) return;
    this.error.set('');
    const previous = this.items();
    this.items.update(list => list.filter(i => !i.isCompleted));
    this.api.clearCompletedActionItems().subscribe({
      error: err => {
        this.items.set(previous);
        this.error.set(this.errMsg(err) || 'Could not clear completed.');
      }
    });
  }

  // ── Drag & drop reorder ──────────────────────────────────────────
  onDrop(ev: CdkDragDrop<ActionItem[]>): void {
    if (ev.previousIndex === ev.currentIndex) return;
    // Reorder locally first for responsiveness
    const active = [...this.activeItems()];
    moveItemInArray(active, ev.previousIndex, ev.currentIndex);
    // Apply new sortOrder values
    active.forEach((item, idx) => { item.sortOrder = idx; });
    // Merge back with completed
    this.items.update(list => [...active, ...list.filter(i => i.isCompleted)]);

    this.api.reorderActionItems(active.map(a => a.id)).subscribe({
      error: err => {
        this.error.set(this.errMsg(err) || 'Could not save new order.');
        this.load(); // hard-refetch on failure
      }
    });
  }

  /**
   * Auto-resizes the edit textarea to fit its content as the user
   * types. Bound to (input) on the textarea. Single-line entries
   * stay one line; longer text grows the textarea instead of
   * horizontally scrolling.
   */
  autoSize(ev: Event): void {
    this.resizeTextarea(ev.target as HTMLTextAreaElement);
  }
  private resizeTextarea(ta: HTMLTextAreaElement): void {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  // ── helpers ──────────────────────────────────────────────────────
  private errMsg(err: any): string | null {
    return err?.error?.error ?? null;
  }
}
