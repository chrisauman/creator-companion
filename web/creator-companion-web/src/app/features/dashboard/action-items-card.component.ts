import {
  Component, inject, signal, computed, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ApiService } from '../../core/services/api.service';
import { ActionItem } from '../../core/models/models';

@Component({
  selector: 'app-action-items-card',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  template: `
    <div class="ai-card" [class.ai-card--expanded]="expanded()">

      <!-- ── Header ─────────────────────────────────────────────── -->
      <div class="ai-header" (click)="toggleExpanded()">
        <div class="ai-header__left">
          <span class="ai-label">Daily Reminders / Next Actions</span>
          @if (!expanded()) {
            <p class="ai-summary">
              @if (allCaughtUp()) {
                All caught up!
              } @else if (activeItems().length === 0) {
                Add your first reminder
              } @else {
                {{ activeItems()[0].text }}
              }
            </p>
          }
        </div>
        <button class="ai-toggle" [attr.aria-expanded]="expanded()">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round"
            [style.transform]="expanded() ? 'rotate(180deg)' : 'rotate(0deg)'"
            style="transition:transform .25s ease">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>

      <!-- ── Expanded Body ───────────────────────────────────────── -->
      <div class="ai-body">

        <!-- Empty state -->
        @if (activeItems().length === 0 && completedItems().length === 0 && !showAddForm()) {
          <div class="ai-empty">
            <p class="ai-empty__text">
              Use Daily Reminders to track your to-dos, next actions, or anything you want to get done. Add up to 20 active items.
            </p>
            <button class="ai-add-link" (click)="startAdd()">+ Add item</button>
          </div>
        }

        <!-- All caught up (active=0 but have completed items) -->
        @if (allCaughtUp() && !showAddForm()) {
          <div class="ai-caught-up">
            <p>🎉 All caught up!</p>
            <button class="ai-add-link" (click)="startAdd()">+ Add item</button>
          </div>
        }

        <!-- Add link (top, when list exists and form not open) -->
        @if (!showAddForm() && (activeItems().length > 0 || completedItems().length > 0)) {
          <div class="ai-add-bar">
            @if (activeItems().length < 20) {
              <button class="ai-add-link" (click)="startAdd()">+ Add item</button>
            } @else {
              <span class="ai-limit-note">20 active item limit reached</span>
            }
          </div>
        }

        <!-- Active list -->
        @if (activeItems().length > 0) {
          <ul class="ai-list"
              cdkDropList
              (cdkDropListDropped)="onDrop($event)">
            @for (item of activeItems(); track item.id) {
              <li class="ai-item" cdkDrag>

                <!-- Drag handle (desktop) -->
                <span class="ai-drag-handle" cdkDragHandle title="Drag to reorder">
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="none"
                    xmlns="http://www.w3.org/2000/svg">
                    <circle cx="4" cy="2" r="1.5" fill="currentColor"/>
                    <circle cx="8" cy="2" r="1.5" fill="currentColor"/>
                    <circle cx="4" cy="7" r="1.5" fill="currentColor"/>
                    <circle cx="8" cy="7" r="1.5" fill="currentColor"/>
                    <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
                    <circle cx="8" cy="12" r="1.5" fill="currentColor"/>
                  </svg>
                </span>

                <!-- Checkbox -->
                <button class="ai-check" (click)="toggle(item)" title="Mark complete">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                    xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
                  </svg>
                </button>

                <!-- Text / Edit -->
                @if (editingId() === item.id) {
                  <div class="ai-edit-row">
                    <input class="ai-input"
                      [(ngModel)]="editText"
                      (keydown.enter)="saveEdit(item)"
                      (keydown.escape)="cancelEdit()"
                      maxlength="150"
                      autofocus>
                    <span class="ai-char-count">{{ 150 - editText.length }}</span>
                    <button class="ai-action-btn ai-action-btn--save"
                      (click)="saveEdit(item)">Save</button>
                    <button class="ai-action-btn ai-action-btn--cancel"
                      (click)="cancelEdit()">Cancel</button>
                  </div>
                } @else {
                  <span class="ai-text" (dblclick)="startEdit(item)">{{ item.text }}</span>
                  <div class="ai-item-actions">
                    <!-- Up/Down arrows (mobile reorder) -->
                    <button class="ai-arrow" title="Move up"
                      [disabled]="$index === 0"
                      (click)="moveUp($index)">▲</button>
                    <button class="ai-arrow" title="Move down"
                      [disabled]="$index === activeItems().length - 1"
                      (click)="moveDown($index)">▼</button>
                    <button class="ai-action-btn ai-action-btn--edit"
                      (click)="startEdit(item)" title="Edit">✎</button>
                    <button class="ai-action-btn ai-action-btn--delete"
                      (click)="deleteItem(item)" title="Delete">✕</button>
                  </div>
                }

              </li>
            }
          </ul>
        }

        <!-- Add form -->
        @if (showAddForm()) {
          <div class="ai-add-row">
            <input class="ai-input"
              [(ngModel)]="newText"
              (keydown.enter)="submitAdd()"
              (keydown.escape)="cancelAdd()"
              placeholder="What do you need to do?"
              maxlength="150"
              autofocus>
            <span class="ai-char-count">{{ 150 - newText.length }}</span>
            <button class="ai-action-btn ai-action-btn--save"
              [disabled]="!newText.trim() || saving()"
              (click)="submitAdd()">
              {{ saving() ? '…' : 'Add' }}
            </button>
            <button class="ai-action-btn ai-action-btn--cancel"
              (click)="cancelAdd()">Cancel</button>
          </div>
        }


        <!-- Error -->
        @if (error()) {
          <p class="ai-error">{{ error() }}</p>
        }

        <!-- Completed section -->
        @if (completedItems().length > 0) {
          <div class="ai-completed-section">
            <button class="ai-completed-toggle"
              (click)="completedExpanded.set(!completedExpanded())">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round"
                [style.transform]="completedExpanded() ? 'rotate(90deg)' : 'rotate(0deg)'"
                style="transition:transform .2s ease">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              Completed ({{ completedItems().length }})
            </button>

            @if (completedExpanded()) {
              <ul class="ai-list ai-list--completed">
                @for (item of completedItems(); track item.id) {
                  <li class="ai-item ai-item--done">
                    <button class="ai-check ai-check--done" (click)="toggle(item)" title="Uncheck">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="7" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="1.5"/>
                        <polyline points="5,8 7,10.5 11,6" stroke="white" stroke-width="1.75"
                          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                      </svg>
                    </button>
                    <span class="ai-text ai-text--done">{{ item.text }}</span>
                    <button class="ai-action-btn ai-action-btn--delete"
                      (click)="deleteItem(item)" title="Delete">✕</button>
                  </li>
                }
              </ul>

              <button class="ai-clear-link" (click)="clearCompleted()">
                Clear completed
              </button>
            }
          </div>
        }

      </div>
    </div>
  `,
  styles: [`
    /* ── Card shell ─────────────────────────────────────────────── */
    .ai-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      margin-bottom: 1rem;
      transition: border-color .15s, box-shadow .15s;
      &:hover { border-color: var(--color-accent); box-shadow: var(--shadow-md); }
    }

    /* ── Header ─────────────────────────────────────────────────── */
    .ai-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: .875rem 1rem;
      cursor: pointer;
      user-select: none;
      gap: .75rem;
    }
    .ai-header__left { flex: 1; min-width: 0; }
    .ai-label {
      display: block;
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .07em;
      color: var(--color-accent-dark);
      margin-bottom: .3rem;
    }
    .ai-summary {
      margin: 0;
      font-size: .9375rem;
      font-weight: 400;
      color: var(--color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ai-toggle {
      flex-shrink: 0;
      background: none; border: none;
      color: var(--color-text-3);
      cursor: pointer; padding: .25rem;
      display: flex; align-items: center;
      &:hover { color: var(--color-text); }
    }

    /* ── Body (hidden unless expanded) ──────────────────────────── */
    .ai-body {
      display: none;
      padding: 0 .75rem .875rem;
    }
    .ai-card--expanded .ai-body { display: block; }
    .ai-card--expanded .ai-header { padding-bottom: .25rem; }

    /* ── Empty / caught-up states ────────────────────────────────── */
    .ai-empty {
      padding: .5rem .25rem 0;
      display: flex;
      flex-direction: column;
      gap: .75rem;
      align-items: flex-start;
    }
    .ai-empty__text {
      margin: 0;
      font-size: .8125rem;
      color: var(--color-text-2);
      line-height: 1.55;
    }
    .ai-caught-up {
      padding: .5rem .25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      p { margin: 0; font-size: .9375rem; font-weight: 500; color: var(--color-text-2); }
    }

    /* ── List ────────────────────────────────────────────────────── */
    .ai-list {
      list-style: none;
      margin: .125rem 0 0;
      padding: 0;
    }
    .ai-item {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: .45rem .25rem;
      border-radius: var(--radius-sm);
      position: relative;
      &:hover { background: var(--color-surface-2); }
      &:hover .ai-item-actions { opacity: 1; }
      &:hover .ai-drag-handle { opacity: 1; }
    }

    /* ── Drag handle ─────────────────────────────────────────────── */
    .ai-drag-handle {
      cursor: grab;
      color: var(--color-text-3);
      opacity: 0;
      flex-shrink: 0;
      padding: .1rem;
      display: flex; align-items: center;
      transition: opacity .15s;
      &:hover { color: var(--color-text-2); }
    }

    /* CDK drag preview */
    .cdk-drag-preview {
      background: var(--color-surface);
      border: 1px solid var(--color-accent);
      border-radius: var(--radius-sm);
      padding: .45rem .25rem;
      box-shadow: 0 4px 16px rgba(0,0,0,.15);
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    .cdk-drag-placeholder { opacity: 0; }
    .cdk-drag-animating { transition: transform .25s cubic-bezier(.25,.8,.25,1); }
    .cdk-drop-list-dragging .ai-item:not(.cdk-drag-placeholder) {
      transition: transform .25s cubic-bezier(.25,.8,.25,1);
    }

    /* ── Checkbox button ─────────────────────────────────────────── */
    .ai-check {
      flex-shrink: 0;
      background: none; border: none;
      padding: 0; cursor: pointer;
      color: var(--color-text-3);
      display: flex; align-items: center;
      transition: color .15s;
      &:hover { color: var(--color-accent); }
    }
    .ai-check--done { color: var(--color-accent); }

    /* ── Item text ───────────────────────────────────────────────── */
    .ai-text {
      flex: 1;
      font-size: .875rem;
      color: var(--color-text);
      cursor: default;
      word-break: break-word;
      line-height: 1.45;
    }
    .ai-text--done {
      text-decoration: line-through;
      color: var(--color-text-3);
    }

    /* ── Item action buttons ─────────────────────────────────────── */
    .ai-item-actions {
      display: flex; align-items: center; gap: .1rem;
      opacity: 0;
      transition: opacity .15s;
      flex-shrink: 0;
    }
    .ai-action-btn {
      background: none; border: none;
      font-size: .75rem; cursor: pointer;
      padding: .2rem .35rem; border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      transition: background .12s, color .12s;
    }
    .ai-action-btn--edit {
      color: var(--color-text-3);
      &:hover { background: var(--color-surface-2); color: var(--color-text); }
    }
    .ai-action-btn--delete {
      color: var(--color-text-3);
      &:hover { background: #fee2e2; color: #dc2626; }
    }
    .ai-action-btn--save {
      color: white; background: var(--color-accent);
      border-radius: var(--radius-sm);
      font-weight: 600;
      &:hover { background: var(--color-accent-dark); }
      &:disabled { opacity: .5; cursor: default; }
    }
    .ai-action-btn--cancel {
      color: var(--color-text-2);
      &:hover { background: var(--color-surface-2); }
    }

    /* ── Up/Down arrows (mobile reorder) ─────────────────────────── */
    .ai-arrow {
      background: none; border: none;
      font-size: .6rem; cursor: pointer;
      padding: .15rem .25rem; line-height: 1;
      color: var(--color-text-3);
      border-radius: var(--radius-sm);
      &:hover:not([disabled]) { background: var(--color-surface-2); color: var(--color-text); }
      &[disabled] { opacity: .25; cursor: default; }
    }

    /* ── Add/Edit input row ──────────────────────────────────────── */
    .ai-add-row, .ai-edit-row {
      display: flex;
      align-items: center;
      gap: .4rem;
      margin-top: .625rem;
      flex-wrap: wrap;
    }
    .ai-input {
      flex: 1;
      min-width: 0;
      font-size: .875rem;
      padding: .4rem .6rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text);
      font-family: var(--font-sans);
      outline: none;
      &:focus { border-color: var(--color-accent); box-shadow: 0 0 0 2px rgba(108,99,255,.15); }
    }
    .ai-char-count {
      font-size: .7rem;
      color: var(--color-text-3);
      flex-shrink: 0;
    }

    /* ── Add bar (top of list) ───────────────────────────────────── */
    .ai-add-bar {
      margin-bottom: .25rem;
      display: flex; align-items: center;
    }
    .ai-add-link {
      background: none; border: none;
      font-family: var(--font-sans);
      font-size: .9rem;
      color: var(--color-text-3);
      cursor: pointer;
      padding: .25rem 0;
      display: flex; align-items: center; gap: .4rem;
      transition: color .12s;
      &:hover { color: var(--color-accent-dark); }
    }
    .ai-limit-note {
      font-size: .75rem;
      color: var(--color-text-3);
      padding: .25rem 0;
    }

    /* ── Error ───────────────────────────────────────────────────── */
    .ai-error {
      font-size: .8125rem;
      color: #dc2626;
      margin: .5rem 0 0;
    }

    /* ── Completed section ───────────────────────────────────────── */
    .ai-completed-section {
      margin-top: .75rem;
      border-top: 1px solid var(--color-border);
      padding-top: .5rem;
    }
    .ai-completed-toggle {
      background: none; border: none;
      font-size: .8rem; cursor: pointer;
      color: var(--color-text-2);
      font-family: var(--font-sans);
      display: flex; align-items: center; gap: .35rem;
      padding: .2rem 0;
      &:hover { color: var(--color-text); }
    }
    .ai-list--completed {
      margin-top: .25rem;
    }
    .ai-item--done {
      &:hover .ai-action-btn--delete { opacity: 1; }
      .ai-action-btn--delete { opacity: 0; transition: opacity .15s; }
      &:hover { background: var(--color-surface-2); }
    }
    .ai-clear-link {
      background: none; border: none;
      margin-top: .5rem;
      font-size: .75rem;
      font-family: var(--font-sans);
      color: var(--color-text-3);
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
      text-underline-offset: 2px;
      &:hover { color: #dc2626; }
    }
  `]
})
export class ActionItemsCardComponent implements OnInit {
  private api = inject(ApiService);

  items         = signal<ActionItem[]>([]);
  expanded      = signal(false);
  completedExpanded = signal(false);
  showAddForm   = signal(false);
  editingId     = signal<number | null>(null);
  saving        = signal(false);
  error         = signal('');

  newText  = '';
  editText = '';

  activeItems    = computed(() => this.items().filter(i => !i.isCompleted));
  completedItems = computed(() => this.items().filter(i => i.isCompleted));
  allCaughtUp    = computed(() =>
    this.activeItems().length === 0 && this.completedItems().length > 0
  );

  ngOnInit(): void {
    this.api.getActionItems().subscribe({
      next: items => this.items.set(items),
      error: () => {}
    });
  }

  toggleExpanded(): void {
    this.expanded.update(v => !v);
  }

  // ── Add ────────────────────────────────────────────────────────
  startAdd(): void {
    this.newText = '';
    this.editingId.set(null);
    this.showAddForm.set(true);
    this.expanded.set(true);
  }

  cancelAdd(): void {
    this.showAddForm.set(false);
    this.newText = '';
  }

  submitAdd(): void {
    const text = this.newText.trim();
    if (!text || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.createActionItem(text).subscribe({
      next: item => {
        this.items.update(list => [...list, item]);
        this.newText = '';
        this.showAddForm.set(false);
        this.saving.set(false);
      },
      error: err => {
        this.error.set(err?.error?.error ?? 'Could not add item.');
        this.saving.set(false);
      }
    });
  }

  // ── Edit ───────────────────────────────────────────────────────
  startEdit(item: ActionItem): void {
    this.editingId.set(item.id);
    this.editText = item.text;
    this.showAddForm.set(false);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editText = '';
  }

  saveEdit(item: ActionItem): void {
    const text = this.editText.trim();
    if (!text) return;
    this.error.set('');
    this.api.updateActionItem(item.id, text).subscribe({
      next: updated => {
        this.items.update(list =>
          list.map(i => i.id === updated.id ? updated : i)
        );
        this.editingId.set(null);
      },
      error: err => this.error.set(err?.error?.error ?? 'Could not update item.')
    });
  }

  // ── Toggle complete ────────────────────────────────────────────
  toggle(item: ActionItem): void {
    this.api.toggleActionItem(item.id).subscribe({
      next: updated => {
        this.items.update(list =>
          list.map(i => i.id === updated.id ? updated : i)
        );
      },
      error: err => this.error.set(err?.error?.error ?? 'Could not update item.')
    });
  }

  // ── Delete ─────────────────────────────────────────────────────
  deleteItem(item: ActionItem): void {
    this.api.deleteActionItem(item.id).subscribe({
      next: () => this.items.update(list => list.filter(i => i.id !== item.id)),
      error: err => this.error.set(err?.error?.error ?? 'Could not delete item.')
    });
  }

  // ── Clear completed ────────────────────────────────────────────
  clearCompleted(): void {
    this.api.clearCompletedActionItems().subscribe({
      next: () => {
        this.items.update(list => list.filter(i => !i.isCompleted));
        this.completedExpanded.set(false);
      },
      error: err => this.error.set(err?.error?.error ?? 'Could not clear completed items.')
    });
  }

  // ── Drag-and-drop reorder ──────────────────────────────────────
  onDrop(event: CdkDragDrop<ActionItem[]>): void {
    if (event.previousIndex === event.currentIndex) return;

    const active = [...this.activeItems()];
    moveItemInArray(active, event.previousIndex, event.currentIndex);

    // Merge back: updated active items + completed items
    this.items.set([...active, ...this.completedItems()]);

    const ids = active.map(i => i.id);
    this.api.reorderActionItems(ids).subscribe({
      error: () => this.error.set('Could not save new order.')
    });
  }

  // ── Arrow-key reorder (mobile) ─────────────────────────────────
  moveUp(index: number): void {
    if (index === 0) return;
    this.reorderAt(index, index - 1);
  }

  moveDown(index: number): void {
    const active = this.activeItems();
    if (index === active.length - 1) return;
    this.reorderAt(index, index + 1);
  }

  private reorderAt(from: number, to: number): void {
    const active = [...this.activeItems()];
    moveItemInArray(active, from, to);
    this.items.set([...active, ...this.completedItems()]);
    const ids = active.map(i => i.id);
    this.api.reorderActionItems(ids).subscribe({
      error: () => this.error.set('Could not save new order.')
    });
  }
}
