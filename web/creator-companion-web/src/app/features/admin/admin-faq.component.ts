import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ApiService } from '../../core/services/api.service';
import { Faq } from '../../core/models/models';

@Component({
  selector: 'app-admin-faq',
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
        <a routerLink="/admin/reminders" class="admin-nav__link">Reminders</a>
        <a routerLink="/admin/emails" class="admin-nav__link">Emails</a>
        <a routerLink="/admin/faq" class="admin-nav__link admin-nav__link--active">FAQ</a>
      </nav>

      <div class="section-head">
        <h2>FAQ Management</h2>
        <button class="btn btn--primary btn--sm" (click)="startAdd()">+ Add FAQ</button>
      </div>

      <p class="section-hint">Drag rows to reorder. Unpublished FAQs are hidden from users.</p>

      @if (error()) {
        <div class="alert alert--error" style="margin-bottom:1rem">{{ error() }}</div>
      }

      <!-- Add form -->
      @if (showAddForm()) {
        <div class="card faq-form">
          <h3 style="margin:0 0 1rem">New FAQ</h3>
          <div class="form-group">
            <label class="form-label">Question</label>
            <input class="form-input" [(ngModel)]="draftQuestion"
              placeholder="e.g. How do I cancel my subscription?"
              maxlength="500">
          </div>
          <div class="form-group">
            <label class="form-label">Answer</label>
            <textarea class="form-textarea" [(ngModel)]="draftAnswer"
              placeholder="Write a clear, helpful answer…"
              rows="4"></textarea>
          </div>
          <div class="form-check">
            <input type="checkbox" id="add-published" [(ngModel)]="draftPublished">
            <label for="add-published">Published (visible to users)</label>
          </div>
          <div class="form-actions">
            <button class="btn btn--primary btn--sm"
              [disabled]="saving() || !draftQuestion.trim() || !draftAnswer.trim()"
              (click)="submitAdd()">
              {{ saving() ? 'Saving…' : 'Add FAQ' }}
            </button>
            <button class="btn btn--ghost btn--sm" (click)="cancelAdd()">Cancel</button>
          </div>
        </div>
      }

      <!-- FAQ list -->
      @if (loading()) {
        <p class="text-muted">Loading…</p>
      } @else if (faqs().length === 0 && !showAddForm()) {
        <div class="card empty-state">
          <p>No FAQs yet. Add your first one above.</p>
        </div>
      } @else {
        <ul class="faq-list" cdkDropList (cdkDropListDropped)="onDrop($event)">
          @for (faq of faqs(); track faq.id) {
            <li class="faq-row card" cdkDrag>

              <!-- Drag handle -->
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

              @if (editingId() === faq.id) {
                <!-- Edit mode -->
                <div class="faq-edit-form">
                  <div class="form-group">
                    <label class="form-label">Question</label>
                    <input class="form-input" [(ngModel)]="draftQuestion" maxlength="500">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Answer</label>
                    <textarea class="form-textarea" [(ngModel)]="draftAnswer" rows="4"></textarea>
                  </div>
                  <div class="form-check">
                    <input type="checkbox" [id]="'pub-' + faq.id" [(ngModel)]="draftPublished">
                    <label [for]="'pub-' + faq.id">Published</label>
                  </div>
                  <div class="form-actions">
                    <button class="btn btn--primary btn--sm"
                      [disabled]="saving() || !draftQuestion.trim() || !draftAnswer.trim()"
                      (click)="submitEdit(faq)">
                      {{ saving() ? 'Saving…' : 'Save' }}
                    </button>
                    <button class="btn btn--ghost btn--sm" (click)="cancelEdit()">Cancel</button>
                  </div>
                </div>
              } @else {
                <!-- View mode -->
                <div class="faq-content">
                  <div class="faq-content__top">
                    <span class="faq-q">{{ faq.question }}</span>
                    <span class="status-badge" [class.status-badge--on]="faq.isPublished">
                      {{ faq.isPublished ? 'Published' : 'Draft' }}
                    </span>
                  </div>
                  <p class="faq-a">{{ faq.answer }}</p>
                </div>
                <div class="faq-actions">
                  <button class="btn btn--ghost btn--sm" (click)="startEdit(faq)">Edit</button>
                  <button class="btn btn--danger btn--sm" (click)="deleteFaq(faq)">Delete</button>
                </div>
              }

              <!-- CDK drag preview placeholder -->
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
      &:hover { background: var(--color-surface-2); color: var(--color-text); }
      &--active { background: var(--color-accent-light); color: var(--color-accent-dark); font-weight: 600; }
    }

    .section-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: .5rem;
      h2 { margin: 0; font-size: 1.125rem; }
    }
    .section-hint { font-size: .8125rem; color: var(--color-text-3); margin: 0 0 1.25rem; }

    /* ── Add / Edit form ─────────────────────────────────────────── */
    .faq-form { margin-bottom: 1.5rem; }
    .faq-edit-form { flex: 1; }
    .form-group { display: flex; flex-direction: column; gap: .3rem; margin-bottom: .875rem; }
    .form-label { font-size: .8125rem; font-weight: 600; color: var(--color-text-2); }
    .form-input, .form-textarea {
      border: 1px solid var(--color-border); border-radius: var(--radius-md);
      padding: .5rem .75rem; font-size: .9375rem; font-family: var(--font-sans);
      background: var(--color-surface); color: var(--color-text);
      outline: none; width: 100%; box-sizing: border-box;
      &:focus { border-color: var(--color-accent); }
    }
    .form-textarea { resize: vertical; min-height: 100px; }
    .form-check {
      display: flex; align-items: center; gap: .5rem;
      margin-bottom: .875rem; font-size: .9375rem;
      input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; }
      label { cursor: pointer; }
    }
    .form-actions { display: flex; gap: .625rem; }

    /* ── FAQ list ────────────────────────────────────────────────── */
    .faq-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .75rem; }
    .faq-row {
      display: flex; align-items: flex-start; gap: .875rem;
      padding: 1rem 1.25rem;
    }

    /* ── Drag ────────────────────────────────────────────────────── */
    .drag-handle {
      cursor: grab; color: var(--color-text-3); flex-shrink: 0;
      padding: .1rem; margin-top: .2rem;
      &:hover { color: var(--color-text-2); }
    }
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
    .cdk-drop-list-dragging .faq-row:not(.cdk-drag-placeholder) {
      transition: transform .25s cubic-bezier(.25,.8,.25,1);
    }

    /* ── FAQ content ─────────────────────────────────────────────── */
    .faq-content { flex: 1; min-width: 0; }
    .faq-content__top {
      display: flex; align-items: flex-start; gap: .75rem;
      margin-bottom: .375rem; flex-wrap: wrap;
    }
    .faq-q { font-size: .9375rem; font-weight: 600; color: var(--color-text); flex: 1; }
    .faq-a { font-size: .875rem; color: var(--color-text-2); margin: 0; line-height: 1.6; }

    /* ── Status badge ────────────────────────────────────────────── */
    .status-badge {
      font-size: .6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
      padding: .15rem .5rem; border-radius: 100px; flex-shrink: 0;
      background: var(--color-surface-2); color: var(--color-text-3);
      border: 1px solid var(--color-border);
      &--on { background: #dcfce7; color: #166534; border-color: #86efac; }
    }

    /* ── Row actions ─────────────────────────────────────────────── */
    .faq-actions { display: flex; gap: .5rem; flex-shrink: 0; align-items: flex-start; }

    /* ── Empty ───────────────────────────────────────────────────── */
    .empty-state { text-align: center; color: var(--color-text-3); padding: 2rem; }
  `]
})
export class AdminFaqComponent implements OnInit {
  private api = inject(ApiService);

  faqs        = signal<Faq[]>([]);
  loading     = signal(true);
  saving      = signal(false);
  error       = signal('');
  showAddForm = signal(false);
  editingId   = signal<string | null>(null);

  draftQuestion = '';
  draftAnswer   = '';
  draftPublished = true;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.adminGetFaqs().subscribe({
      next: faqs => { this.faqs.set(faqs); this.loading.set(false); },
      error: () => { this.error.set('Could not load FAQs.'); this.loading.set(false); }
    });
  }

  // ── Add ─────────────────────────────────────────────────────────
  startAdd(): void {
    this.cancelEdit();
    this.draftQuestion = '';
    this.draftAnswer   = '';
    this.draftPublished = true;
    this.showAddForm.set(true);
  }

  cancelAdd(): void {
    this.showAddForm.set(false);
    this.draftQuestion = '';
    this.draftAnswer   = '';
  }

  submitAdd(): void {
    if (!this.draftQuestion.trim() || !this.draftAnswer.trim() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.adminCreateFaq(this.draftQuestion.trim(), this.draftAnswer.trim(), this.draftPublished).subscribe({
      next: faq => {
        this.faqs.update(list => [...list, faq]);
        this.cancelAdd();
        this.saving.set(false);
      },
      error: () => { this.error.set('Could not create FAQ.'); this.saving.set(false); }
    });
  }

  // ── Edit ────────────────────────────────────────────────────────
  startEdit(faq: Faq): void {
    this.cancelAdd();
    this.editingId.set(faq.id);
    this.draftQuestion  = faq.question;
    this.draftAnswer    = faq.answer;
    this.draftPublished = faq.isPublished;
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.draftQuestion = '';
    this.draftAnswer   = '';
  }

  submitEdit(faq: Faq): void {
    if (!this.draftQuestion.trim() || !this.draftAnswer.trim() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.adminUpdateFaq(faq.id, this.draftQuestion.trim(), this.draftAnswer.trim(), this.draftPublished).subscribe({
      next: updated => {
        this.faqs.update(list => list.map(f => f.id === updated.id ? updated : f));
        this.cancelEdit();
        this.saving.set(false);
      },
      error: () => { this.error.set('Could not update FAQ.'); this.saving.set(false); }
    });
  }

  // ── Delete ──────────────────────────────────────────────────────
  deleteFaq(faq: Faq): void {
    if (!confirm(`Delete "${faq.question}"? This cannot be undone.`)) return;
    this.api.adminDeleteFaq(faq.id).subscribe({
      next: () => this.faqs.update(list => list.filter(f => f.id !== faq.id)),
      error: () => this.error.set('Could not delete FAQ.')
    });
  }

  // ── Drag-and-drop reorder ────────────────────────────────────────
  onDrop(event: CdkDragDrop<Faq[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const list = [...this.faqs()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.faqs.set(list);
    this.api.adminReorderFaqs(list.map(f => f.id)).subscribe({
      error: () => this.error.set('Could not save new order.')
    });
  }
}
