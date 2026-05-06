import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { MotivationEntry } from '../../core/models/models';

type Category = string;
const CATEGORIES: Category[] = [
  'Encouragement',
  'BestPractice',
  'Quote',
  'ResistanceAndProcrastination',
  'DisciplineAndRoutine',
  'IdentityAndConfidence',
  'FearAndSelfDoubt',
  'OriginalityAndInfluence',
  'SharingAndVisibility',
  'FocusAndDeepWork',
  'CreativeRecoveryAndBurnout',
  'MeaningAndPurpose',
  'LongTermMastery',
  'ArtisticCourage',
  'CreativeRelationships',
  'EnvironmentAndRitual',
  'PerfectionismAndFinishing',
  'RecommendedBooks',
];

const CATEGORY_LABELS: Record<string, string> = {
  Encouragement:                  'Encouragement',
  BestPractice:                   'Best Practice',
  Quote:                          'Quote',
  ResistanceAndProcrastination:   'Resistance & Procrastination',
  DisciplineAndRoutine:           'Discipline & Routine',
  IdentityAndConfidence:          'Identity & Confidence',
  FearAndSelfDoubt:               'Fear & Self-Doubt',
  OriginalityAndInfluence:        'Originality & Influence',
  SharingAndVisibility:           'Sharing & Visibility',
  FocusAndDeepWork:               'Focus & Deep Work',
  CreativeRecoveryAndBurnout:     'Creative Recovery & Burnout',
  MeaningAndPurpose:              'Meaning & Purpose',
  LongTermMastery:                'Long-Term Mastery',
  ArtisticCourage:                'Artistic Courage',
  CreativeRelationships:          'Creative Relationships',
  EnvironmentAndRitual:           'Environment & Ritual',
  PerfectionismAndFinishing:      'Perfectionism & Finishing',
  RecommendedBooks:               'Recommended Books',
};

@Component({
  selector: 'app-admin-motivation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="admin-page">
      <header class="admin-header">
        <h1>Daily Spark Library</h1>
        <a routerLink="/dashboard" class="btn btn--ghost btn--sm">← Back to App</a>
      </header>

      <nav class="admin-nav">
        <a routerLink="/admin" class="admin-nav__link">Overview</a>
        <a routerLink="/admin/users" class="admin-nav__link">Users</a>
        <a routerLink="/admin/motivation" class="admin-nav__link admin-nav__link--active">Content Library</a>
        <a routerLink="/admin/reminders" class="admin-nav__link">Reminders</a>
        <a routerLink="/admin/emails" class="admin-nav__link">Emails</a>
        <a routerLink="/admin/faq" class="admin-nav__link">FAQ</a>
        <a routerLink="/admin/prompts" class="admin-nav__link">Daily Prompts</a>
      </nav>

      <!-- Add / Edit form -->
      <div class="card form-card">
        <h2 class="form-title">{{ editingId() ? 'Edit Entry' : 'Add New Entry' }}</h2>

        <div class="form-grid">
          <div class="field-group field-group--full">
            <label class="field-label">Takeaway <span class="hint">(shown collapsed on dashboard)</span></label>
            <input class="input" type="text" maxlength="500" [(ngModel)]="form.takeaway"
                   placeholder="One compelling sentence the user sees immediately…" />
          </div>
          <div class="field-group field-group--full">
            <label class="field-label">Full Content <span class="hint">(shown when expanded)</span></label>
            <textarea class="input input--textarea" rows="6" [(ngModel)]="form.fullContent"
                      placeholder="The full advice, quote, or insight…"></textarea>
          </div>
          <div class="field-group">
            <label class="field-label">Category</label>
            <select class="input" [(ngModel)]="form.category">
              @for (cat of CATEGORIES; track cat) {
                <option [value]="cat">{{ catLabel(cat) }}</option>
              }
            </select>
          </div>
        </div>

        @if (formError()) {
          <p class="alert alert--error" style="margin-top:.75rem">{{ formError() }}</p>
        }

        <div class="form-actions">
          @if (editingId()) {
            <button class="btn btn--ghost btn--sm" (click)="cancelEdit()">Cancel</button>
          }
          <button class="btn btn--primary btn--sm"
                  [disabled]="saving() || !form.takeaway.trim() || !form.fullContent.trim()"
                  (click)="save()">
            {{ saving() ? 'Saving…' : editingId() ? 'Update entry' : 'Add entry' }}
          </button>
        </div>
      </div>

      <!-- Library list -->
      <div class="library-header">
        <h2>Library <span class="count-badge">{{ entries().length }}</span></h2>
        <div class="filter-tabs">
          <button class="filter-tab" [class.filter-tab--active]="filterCat() === ''"
                  (click)="filterCat.set('')">All</button>
          @for (cat of CATEGORIES; track cat) {
            <button class="filter-tab" [class.filter-tab--active]="filterCat() === cat"
                    (click)="filterCat.set(cat)">{{ catLabel(cat) }}</button>
          }
        </div>
      </div>

      @if (loading()) {
        <p class="text-muted">Loading…</p>
      }

      @if (!loading() && filteredEntries().length === 0) {
        <p class="text-muted empty-note">
          {{ filterCat() ? 'No entries in this category yet.' : 'No entries yet. Add one above.' }}
        </p>
      }

      <div class="entries-list">
        @for (entry of filteredEntries(); track entry.id) {
          <div class="entry-card card" [class.entry-card--editing]="editingId() === entry.id">
            <div class="entry-card__cat-badge">{{ catLabel(entry.category) }}</div>
            <h3 class="entry-card__title">{{ entry.takeaway }}</h3>
            <p class="entry-card__takeaway">{{ entry.takeaway }}</p>
            <p class="entry-card__content">{{ entry.fullContent }}</p>
            <div class="entry-card__actions">
              <button class="btn btn--ghost btn--sm" (click)="startEdit(entry)">Edit</button>
              <button class="btn btn--danger btn--sm" (click)="deleteEntry(entry)"
                      [disabled]="deleting() === entry.id">
                {{ deleting() === entry.id ? 'Deleting…' : 'Delete' }}
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .admin-page { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
    .admin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    .admin-header h1 { font-size: 1.5rem; margin: 0; }
    .admin-nav { display: flex; gap: .25rem; margin-bottom: 2rem; border-bottom: 1px solid var(--color-border); padding-bottom: .75rem; }
    .admin-nav__link { padding: .4rem .9rem; border-radius: 6px; text-decoration: none; color: var(--color-text-muted); font-size: .875rem; }
    .admin-nav__link:hover, .admin-nav__link--active { background: var(--color-surface); color: var(--color-text); }

    .form-card { padding: 1.5rem; margin-bottom: 2rem; }
    .form-title { font-size: 1rem; font-weight: 700; margin: 0 0 1.25rem; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .875rem; }
    .field-group { display: flex; flex-direction: column; gap: .3rem; }
    .field-group--full { grid-column: 1 / -1; }
    .field-label { font-size: .8125rem; font-weight: 500; color: var(--color-text-2); }
    .hint { font-weight: 400; color: var(--color-text-3); }
    .input {
      padding: .4375rem .75rem; border: 1.5px solid var(--color-border);
      border-radius: var(--radius-md); background: var(--color-surface);
      color: var(--color-text); font-size: .9375rem; font-family: var(--font-sans);
      width: 100%; box-sizing: border-box;
      &:focus { outline: none; border-color: var(--color-accent); }
    }
    .input--textarea { resize: vertical; min-height: 110px; line-height: 1.6; }
    .form-actions { display: flex; justify-content: flex-end; gap: .625rem; margin-top: 1rem; }
    @media (max-width: 540px) { .form-grid { grid-template-columns: 1fr; } }

    .library-header {
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: .75rem; margin-bottom: 1rem;
    }
    .library-header h2 { font-size: 1.1rem; margin: 0; display: flex; align-items: center; gap: .5rem; }
    .count-badge {
      font-size: .75rem; font-weight: 600; padding: .2rem .55rem;
      border-radius: 100px; background: var(--color-accent-light);
      color: var(--color-accent-dark); border: 1px solid var(--color-accent);
    }
    .filter-tabs { display: flex; gap: .375rem; flex-wrap: wrap; }
    .filter-tab {
      padding: .3rem .75rem; border-radius: 100px; font-size: .8125rem; font-weight: 500;
      border: 1px solid var(--color-border); background: transparent; cursor: pointer;
      color: var(--color-text-2); font-family: var(--font-sans);
      transition: background .12s, border-color .12s, color .12s;
      &:hover { border-color: var(--color-accent); color: var(--color-accent-dark); }
      &--active { background: var(--color-accent); border-color: var(--color-accent); color: #fff; }
    }

    .entries-list { display: flex; flex-direction: column; gap: .875rem; }
    .entry-card { padding: 1.25rem; }
    .entry-card--editing { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-light); }
    .entry-card__cat-badge {
      display: inline-block; font-size: .6875rem; font-weight: 600;
      text-transform: uppercase; letter-spacing: .06em;
      padding: .15rem .55rem; border-radius: 100px; margin-bottom: .625rem;
      background: var(--color-surface-2); color: var(--color-text-3);
      border: 1px solid var(--color-border);
    }
    .entry-card__title { font-size: .9375rem; font-weight: 700; margin: 0 0 .375rem; }
    .entry-card__takeaway {
      font-size: .875rem; font-style: italic; color: var(--color-text-2);
      margin: 0 0 .625rem; padding-bottom: .625rem;
      border-bottom: 1px solid var(--color-border-light);
    }
    .entry-card__content {
      font-size: .875rem; color: var(--color-text-3); line-height: 1.65;
      margin: 0 0 1rem; white-space: pre-wrap;
    }
    .entry-card__actions { display: flex; gap: .5rem; }
    .empty-note { color: var(--color-text-3); padding: 1rem 0; }
  `]
})
export class AdminMotivationComponent implements OnInit {
  private api = inject(ApiService);

  readonly CATEGORIES = CATEGORIES;

  entries  = signal<MotivationEntry[]>([]);
  loading  = signal(true);
  saving   = signal(false);
  deleting = signal<string | null>(null);
  editingId = signal<string | null>(null);
  filterCat = signal<string>('');
  formError = signal('');

  form = { takeaway: '', fullContent: '', category: 'Encouragement' as Category };

  filteredEntries = () => {
    const cat = this.filterCat();
    return cat ? this.entries().filter(e => e.category === cat) : this.entries();
  };

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.adminGetMotivation().subscribe({
      next: list => { this.entries.set(list); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  save(): void {
    this.formError.set('');
    if (!this.form.takeaway.trim() || !this.form.fullContent.trim()) return;
    this.saving.set(true);

    const payload = {
      takeaway: this.form.takeaway.trim(),
      fullContent: this.form.fullContent.trim(),
      category: this.form.category
    };

    const id = this.editingId();
    const req = id
      ? this.api.adminUpdateMotivation(id, payload)
      : this.api.adminCreateMotivation(payload);

    req.subscribe({
      next: saved => {
        if (id) {
          this.entries.update(list => list.map(e => e.id === id ? saved : e));
        } else {
          this.entries.update(list => [...list, saved]);
        }
        this.resetForm();
        this.saving.set(false);
      },
      error: err => {
        this.formError.set(err?.error?.error ?? 'Could not save entry.');
        this.saving.set(false);
      }
    });
  }

  startEdit(entry: MotivationEntry): void {
    this.editingId.set(entry.id);
    this.form = {
      takeaway: entry.takeaway,
      fullContent: entry.fullContent,
      category: entry.category as Category
    };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void { this.resetForm(); }

  deleteEntry(entry: MotivationEntry): void {
    if (!confirm(`Delete "${entry.title}"? This cannot be undone.`)) return;
    this.deleting.set(entry.id);
    this.api.adminDeleteMotivation(entry.id).subscribe({
      next: () => {
        this.entries.update(list => list.filter(e => e.id !== entry.id));
        if (this.editingId() === entry.id) this.resetForm();
        this.deleting.set(null);
      },
      error: () => this.deleting.set(null)
    });
  }

  catLabel(cat: string): string {
    return CATEGORY_LABELS[cat] ?? cat;
  }

  private resetForm(): void {
    this.editingId.set(null);
    this.form = { takeaway: '', fullContent: '', category: 'Encouragement' };
    this.formError.set('');
  }
}
