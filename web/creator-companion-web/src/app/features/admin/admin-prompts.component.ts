import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ApiService } from '../../core/services/api.service';
import { DailyPrompt } from '../../core/models/models';

/**
 * Admin: Daily Prompts management.
 * Powers the "small prompt" card on the dashboard's Today panel —
 * unpublished prompts are hidden from users; drag to reorder.
 */
@Component({
  selector: 'app-admin-prompts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DragDropModule],
  template: `
    <div class="admin-page">
      <header class="admin-header">
        <h1>Admin Dashboard</h1>
        <a routerLink="/dashboard" class="btn btn--ghost btn--sm">← Back to App</a>
      </header>

      <nav class="admin-nav">
        <a routerLink="/admin" class="admin-nav__link">Overview</a>
        <a routerLink="/admin/users" class="admin-nav__link">Users</a>
        <a routerLink="/admin/motivation" class="admin-nav__link">Content Library</a>
        <a routerLink="/admin/reminders" class="admin-nav__link">Notifications</a>
        <a routerLink="/admin/emails" class="admin-nav__link">Emails</a>
        <a routerLink="/admin/faq" class="admin-nav__link">FAQ</a>
        <a routerLink="/admin/prompts" class="admin-nav__link admin-nav__link--active">Daily Prompts</a>
      </nav>

      <div class="section-head">
        <h2>Daily Prompts</h2>
        <button class="btn btn--primary btn--sm" (click)="startAdd()">+ Add Prompt</button>
      </div>

      <p class="section-hint">
        Brief prompts shown on the dashboard's Today panel. The shuffle button
        cycles through the published list. Drag rows to reorder. Unpublished
        prompts are hidden from users.
      </p>

      @if (error()) {
        <div class="alert alert--error" style="margin-bottom:1rem">{{ error() }}</div>
      }

      <!-- Add form -->
      @if (showAddForm()) {
        <div class="card prompt-form">
          <h3 style="margin:0 0 1rem">New prompt</h3>
          <div class="form-group">
            <label class="form-label">Prompt text</label>
            <textarea class="form-textarea" [(ngModel)]="draftText"
              placeholder="e.g. What excited you when you were creating today?"
              rows="3" maxlength="500"></textarea>
            <span class="form-hint">{{ draftText.length }} / 500 characters</span>
          </div>
          <div class="form-check">
            <input type="checkbox" id="add-published" [(ngModel)]="draftPublished">
            <label for="add-published">Published (visible to users)</label>
          </div>
          <div class="form-actions">
            <button class="btn btn--primary btn--sm"
              [disabled]="saving() || !draftText.trim()"
              (click)="submitAdd()">
              {{ saving() ? 'Saving…' : 'Add prompt' }}
            </button>
            <button class="btn btn--ghost btn--sm" (click)="cancelAdd()">Cancel</button>
          </div>
        </div>
      }

      <!-- Prompt list -->
      @if (loading()) {
        <p class="text-muted">Loading…</p>
      } @else if (prompts().length === 0 && !showAddForm()) {
        <div class="card empty-state">
          <p>No prompts yet. Add your first one above.</p>
        </div>
      } @else {
        <ul class="prompt-list" cdkDropList (cdkDropListDropped)="onDrop($event)">
          @for (prompt of prompts(); track prompt.id) {
            <li class="prompt-row card" cdkDrag>

              <span class="drag-handle" cdkDragHandle title="Drag to reorder">
                <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
                  <circle cx="4" cy="2.5" r="1.5" fill="currentColor"/>
                  <circle cx="8" cy="2.5" r="1.5" fill="currentColor"/>
                  <circle cx="4" cy="8" r="1.5" fill="currentColor"/>
                  <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                  <circle cx="4" cy="13.5" r="1.5" fill="currentColor"/>
                  <circle cx="8" cy="13.5" r="1.5" fill="currentColor"/>
                </svg>
              </span>

              @if (editingId() === prompt.id) {
                <div class="prompt-edit-form">
                  <div class="form-group">
                    <label class="form-label">Prompt text</label>
                    <textarea class="form-textarea" [(ngModel)]="draftText"
                      rows="3" maxlength="500"></textarea>
                    <span class="form-hint">{{ draftText.length }} / 500 characters</span>
                  </div>
                  <div class="form-check">
                    <input type="checkbox" [id]="'pub-' + prompt.id" [(ngModel)]="draftPublished">
                    <label [for]="'pub-' + prompt.id">Published</label>
                  </div>
                  <div class="form-actions">
                    <button class="btn btn--primary btn--sm"
                      [disabled]="saving() || !draftText.trim()"
                      (click)="submitEdit(prompt)">
                      {{ saving() ? 'Saving…' : 'Save' }}
                    </button>
                    <button class="btn btn--ghost btn--sm" (click)="cancelEdit()">Cancel</button>
                  </div>
                </div>
              } @else {
                <div class="prompt-content">
                  <div class="prompt-content__top">
                    <span class="prompt-text">{{ prompt.text }}</span>
                    <span class="status-badge" [class.status-badge--on]="prompt.isPublished">
                      {{ prompt.isPublished ? 'Published' : 'Draft' }}
                    </span>
                  </div>
                </div>
                <div class="prompt-actions">
                  <button class="btn btn--ghost btn--sm" (click)="startEdit(prompt)">Edit</button>
                  <button class="btn btn--danger btn--sm" (click)="deletePrompt(prompt)">Delete</button>
                </div>
              }

              <div *cdkDragPlaceholder class="drag-placeholder"></div>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .admin-page { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
    .admin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    .admin-header h1 { font-size: 1.5rem; margin: 0; }
    .admin-nav {
      display: flex; gap: .25rem; flex-wrap: wrap;
      margin-bottom: 2rem; border-bottom: 1px solid var(--color-border); padding-bottom: 1rem;
    }
    .admin-nav__link {
      padding: .375rem .875rem; border-radius: var(--radius-sm);
      font-size: .875rem; font-weight: 500; color: var(--color-text-2);
      text-decoration: none; transition: background .15s, color .15s;
    }
    .admin-nav__link:hover { background: var(--color-surface-2); color: var(--color-text); }
    .admin-nav__link--active { background: var(--color-accent-light); color: var(--color-accent-dark); font-weight: 600; }

    .section-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: .5rem;
    }
    .section-head h2 { margin: 0; font-size: 1.125rem; }
    .section-hint { font-size: .8125rem; color: var(--color-text-3); margin: 0 0 1.25rem; line-height: 1.5; }

    .prompt-form { margin-bottom: 1.5rem; }
    .prompt-edit-form { flex: 1; }
    .form-group { display: flex; flex-direction: column; gap: .3rem; margin-bottom: .875rem; }
    .form-label { font-size: .8125rem; font-weight: 600; color: var(--color-text-2); }
    .form-textarea {
      border: 1px solid var(--color-border); border-radius: var(--radius-md);
      padding: .5rem .75rem; font-size: .9375rem; font-family: var(--font-sans);
      background: var(--color-surface); color: var(--color-text);
      outline: none; width: 100%; box-sizing: border-box;
      resize: vertical; min-height: 70px;
    }
    .form-textarea:focus { border-color: var(--color-accent); }
    .form-hint { font-size: .6875rem; color: var(--color-text-3); margin-top: 2px; }
    .form-check {
      display: flex; align-items: center; gap: .5rem;
      margin-bottom: .875rem; font-size: .9375rem;
    }
    .form-check input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; }
    .form-check label { cursor: pointer; }
    .form-actions { display: flex; gap: .625rem; }

    .prompt-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .75rem; }
    .prompt-row {
      display: flex; align-items: flex-start; gap: .875rem;
      padding: 1rem 1.25rem;
    }

    .drag-handle {
      cursor: grab; color: var(--color-text-3); flex-shrink: 0;
      padding: .1rem; margin-top: .2rem;
    }
    .drag-handle:hover { color: var(--color-text-2); }
    .drag-placeholder {
      background: var(--color-surface-2);
      border: 2px dashed var(--color-border);
      border-radius: var(--radius-lg); min-height: 60px;
    }
    .cdk-drag-preview {
      background: var(--color-surface); border: 1px solid var(--color-accent);
      border-radius: var(--radius-lg); padding: 1rem 1.25rem;
      box-shadow: 0 8px 24px rgba(0,0,0,.15);
    }
    .cdk-drag-animating { transition: transform .25s cubic-bezier(.25,.8,.25,1); }
    .cdk-drop-list-dragging .prompt-row:not(.cdk-drag-placeholder) {
      transition: transform .25s cubic-bezier(.25,.8,.25,1);
    }

    .prompt-content { flex: 1; min-width: 0; }
    .prompt-content__top {
      display: flex; align-items: flex-start; gap: .75rem; flex-wrap: wrap;
    }
    .prompt-text {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 1rem; line-height: 1.5;
      color: var(--color-text); flex: 1; font-weight: 500;
    }

    .status-badge {
      font-size: .6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
      padding: .15rem .5rem; border-radius: 100px; flex-shrink: 0;
      background: var(--color-surface-2); color: var(--color-text-3);
      border: 1px solid var(--color-border);
    }
    .status-badge--on { background: #dcfce7; color: #166534; border-color: #86efac; }

    .prompt-actions { display: flex; gap: .5rem; flex-shrink: 0; align-items: flex-start; }

    .empty-state { text-align: center; color: var(--color-text-3); padding: 2rem; }
  `]
})
export class AdminPromptsComponent implements OnInit {
  private api = inject(ApiService);

  prompts     = signal<DailyPrompt[]>([]);
  loading     = signal(true);
  saving      = signal(false);
  error       = signal('');
  showAddForm = signal(false);
  editingId   = signal<string | null>(null);

  draftText = '';
  draftPublished = true;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.adminGetDailyPrompts().subscribe({
      next: prompts => { this.prompts.set(prompts); this.loading.set(false); },
      error: () => { this.error.set('Could not load prompts.'); this.loading.set(false); }
    });
  }

  // ── Add ─────────────────────────────────────────────────────────
  startAdd(): void {
    this.cancelEdit();
    this.draftText = '';
    this.draftPublished = true;
    this.showAddForm.set(true);
  }

  cancelAdd(): void {
    this.showAddForm.set(false);
    this.draftText = '';
  }

  submitAdd(): void {
    if (!this.draftText.trim() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.adminCreateDailyPrompt(this.draftText.trim(), this.draftPublished).subscribe({
      next: prompt => {
        this.prompts.update(list => [...list, prompt]);
        this.cancelAdd();
        this.saving.set(false);
      },
      error: () => { this.error.set('Could not create prompt.'); this.saving.set(false); }
    });
  }

  // ── Edit ────────────────────────────────────────────────────────
  startEdit(prompt: DailyPrompt): void {
    this.cancelAdd();
    this.editingId.set(prompt.id);
    this.draftText = prompt.text;
    this.draftPublished = prompt.isPublished;
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.draftText = '';
  }

  submitEdit(prompt: DailyPrompt): void {
    if (!this.draftText.trim() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.adminUpdateDailyPrompt(prompt.id, this.draftText.trim(), this.draftPublished).subscribe({
      next: updated => {
        this.prompts.update(list => list.map(p => p.id === updated.id ? updated : p));
        this.cancelEdit();
        this.saving.set(false);
      },
      error: () => { this.error.set('Could not update prompt.'); this.saving.set(false); }
    });
  }

  // ── Delete ──────────────────────────────────────────────────────
  deletePrompt(prompt: DailyPrompt): void {
    if (!confirm(`Delete this prompt? This cannot be undone.\n\n"${prompt.text}"`)) return;
    this.api.adminDeleteDailyPrompt(prompt.id).subscribe({
      next: () => this.prompts.update(list => list.filter(p => p.id !== prompt.id)),
      error: () => this.error.set('Could not delete prompt.')
    });
  }

  // ── Drag-and-drop reorder ────────────────────────────────────────
  onDrop(event: CdkDragDrop<DailyPrompt[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const list = [...this.prompts()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.prompts.set(list);
    this.api.adminReorderDailyPrompts(list.map(p => p.id)).subscribe({
      error: () => this.error.set('Could not save new order.')
    });
  }
}
