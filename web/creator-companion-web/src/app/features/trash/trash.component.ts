import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { EntryListItem, Capabilities } from '../../core/models/models';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { MobileHeaderComponent } from '../../shared/mobile-header/mobile-header.component';

@Component({
  selector: 'app-trash',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent, MobileHeaderComponent],
  template: `
    <div class="page">
      <app-sidebar />
      <app-mobile-header />
      <header class="topnav">
        <div class="container topnav__inner">
          <button class="btn btn--ghost btn--sm" routerLink="/dashboard">← Dashboard</button>
          <span class="topnav__title">Trash</span>
          <span></span>
        </div>
      </header>

      <main id="main" class="container main-content">
        <h1 class="sr-only">Trash</h1>

        <div *ngIf="!caps()?.canRecoverDeleted" class="alert alert--error" style="margin-bottom:1.5rem">
          Recovery requires a paid plan. Entries will be permanently deleted after 48 hours.
        </div>

        <div *ngIf="loadError()" class="empty-state">
          <p class="text-muted">Could not load trash. Please check your connection and try again.</p>
          <a routerLink="/dashboard" class="btn btn--secondary" style="margin-top:1rem">Back to journal</a>
        </div>

        <!-- Empty-state card. The bare "Trash is empty." line + grey
             background felt unfinished; this gives the empty path the
             same warm card treatment the rest of the app uses, with a
             muted icon, a friendly title, and a short note about how
             trash works (48-hour retention). The CTA is the only way
             out of the page, so we make it the primary button rather
             than a ghost secondary. -->
        <div *ngIf="activeEntries().length === 0 && !loading() && !loadError()" class="empty-card">
          <div class="empty-card__icon" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
            </svg>
          </div>
          <h2 class="empty-card__title">Trash is empty</h2>
          <p class="empty-card__sub">
            Deleted entries appear here for 48 hours before being
            permanently removed. Nothing to recover right now.
          </p>
          <a routerLink="/dashboard" class="btn btn--primary empty-card__cta">
            Back to journal
          </a>
        </div>

        <div *ngIf="loading()" class="empty-state">
          <p class="text-muted">Loading…</p>
        </div>

        <div class="entry-list" *ngIf="activeEntries().length > 0">
          <div class="trash-entry card" *ngFor="let entry of activeEntries()">
            <div class="trash-entry__meta">
              <span class="trash-entry__date">{{ formatDate(entry.entryDate) }}</span>
              <span class="trash-entry__deleted">Expires in {{ hoursLeft(entry) }}</span>
            </div>
            <p class="trash-entry__preview">{{ stripHtml(entry.contentPreview) }}</p>
            <div class="trash-entry__actions">
              <button
                *ngIf="caps()?.canRecoverDeleted"
                class="btn btn--primary btn--sm"
                (click)="recover(entry)"
                [disabled]="recovering() === entry.id"
              >
                {{ recovering() === entry.id ? 'Recovering…' : 'Recover' }}
              </button>
              <button
                class="btn btn--danger btn--sm"
                (click)="confirmPermanentDelete(entry)"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>

      </main>

      <!-- Confirm permanent delete overlay -->
      <div class="overlay" *ngIf="deleteTarget()">
        <div class="confirm-dialog card">
          <h3>Delete permanently?</h3>
          <p class="text-muted text-sm" style="margin-top:.5rem">
            This entry will be gone forever. This cannot be undone.
          </p>
          <div class="confirm-actions">
            <button class="btn btn--secondary" (click)="deleteTarget.set(null)">Cancel</button>
            <button class="btn btn--danger" (click)="permanentDelete()">Delete forever</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    @media (min-width: 768px) { .page { flex-direction: row; } }
    .content-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    /* Hide the legacy in-page topnav on mobile — the shared mobile-header
       already provides the chrome. Keep it visible on desktop where the
       mobile header is hidden, so the user still has the page title. */
    @media (max-width: 767px) {
      .topnav { display: none; }
    }
    .topnav {
      position:sticky; top:0; z-index:100;
      background:var(--color-surface);
      border-bottom:1px solid var(--color-border);
      height:var(--nav-h);
    }
    .topnav__inner {
      display:flex; align-items:center; justify-content:space-between; height:100%;
    }
    .topnav__title { font-weight:600; font-size:1rem; }
    .main-content { padding-top:1.5rem; padding-bottom:4rem; }
    .empty-state { text-align:center; padding:3rem 1rem; color:var(--color-text-2); }

    /* Polished empty-state card. Centred on the page, capped to a
       readable column width, soft surface + border so it reads as
       its own thing inside the grey/cream main-content background. */
    .empty-card {
      max-width: 460px;
      margin: 3rem auto;
      padding: 2.5rem 2rem;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 16px);
      text-align: center;
    }
    .empty-card__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px; height: 64px;
      margin-bottom: 1rem;
      color: var(--color-text-3);
      background: var(--color-surface-2);
      border-radius: 50%;
    }
    .empty-card__title {
      font-family: var(--font-sans);
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -.01em;
      color: var(--color-text);
      margin: 0 0 .5rem;
    }
    .empty-card__sub {
      font-size: .9375rem;
      line-height: 1.55;
      color: var(--color-text-2);
      margin: 0 auto 1.5rem;
      max-width: 36ch;
    }
    .empty-card__cta {
      display: inline-block;
      padding: .625rem 1.5rem;
    }
    .entry-list { display:flex; flex-direction:column; gap:.75rem; }
    .trash-entry { opacity:.85; }
    .trash-entry__meta {
      display:flex; align-items:center; justify-content:space-between;
      flex-wrap:wrap; gap:.5rem; margin-bottom:.5rem;
    }
    .trash-entry__date { font-size:.875rem; font-weight:500; }
    .trash-entry__deleted { font-size:.8125rem; color:var(--color-danger); }
    .trash-entry__preview {
      font-size:.9375rem; color:var(--color-text-2); line-height:1.6;
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
      margin-bottom:.875rem;
    }
    .trash-entry__actions { display:flex; gap:.625rem; }
    .overlay {
      position:fixed; inset:0; background:rgba(0,0,0,.4);
      display:flex; align-items:center; justify-content:center;
      padding:1.5rem; z-index:200;
    }
    .confirm-dialog { max-width:400px; width:100%; }
    .confirm-actions { display:flex; gap:.75rem; justify-content:flex-end; margin-top:1.25rem; }
  `]
})
export class TrashComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);

  entries   = signal<EntryListItem[]>([]);
  caps      = signal<Capabilities | null>(null);
  loadError = signal(false);
  loading   = signal(true);
  recovering = signal('');
  deleteTarget = signal<EntryListItem | null>(null);

  /** Only show entries that haven't yet passed the 48-hour expiry window. */
  activeEntries = computed(() =>
    this.entries().filter(e => {
      if (!e.deletedAt) return true;
      const expiresAt = new Date(e.deletedAt);
      expiresAt.setHours(expiresAt.getHours() + 48);
      return expiresAt.getTime() > Date.now();
    })
  );

  ngOnInit(): void {
    this.auth.loadCapabilities().subscribe(c => this.caps.set(c));
    this.loadDeleted();
  }

  private loadDeleted(): void {
    this.loading.set(true);
    this.api.getEntries(undefined, true).subscribe({
      next: all => {
        // The API returns deleted entries when includeDeleted=true
        // We filter here to only show deleted ones (backend returns all including live)
        // Actually backend already filters; let's show all returned
        this.entries.set(all);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.loadError.set(true); }
    });
  }

  recover(entry: EntryListItem): void {
    this.recovering.set(entry.id);
    this.api.recoverEntry(entry.id).subscribe({
      next: () => {
        this.entries.update(list => list.filter(e => e.id !== entry.id));
        this.recovering.set('');
      },
      error: () => this.recovering.set('')
    });
  }

  confirmPermanentDelete(entry: EntryListItem): void {
    this.deleteTarget.set(entry);
  }

  permanentDelete(): void {
    const target = this.deleteTarget();
    if (!target) return;
    // We use a direct API call — handled below via the hard-delete endpoint
    this.api.hardDeleteEntry(target.id).subscribe({
      next: () => {
        this.entries.update(list => list.filter(e => e.id !== target.id));
        this.deleteTarget.set(null);
      },
      error: () => this.deleteTarget.set(null)
    });
  }

  formatDate(d: string): string {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  stripHtml(html: string): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent ?? tmp.innerText ?? '';
  }

  hoursLeft(entry: EntryListItem): string {
    if (!entry.deletedAt) return '< 48 hrs';
    const expiresAt = new Date(entry.deletedAt);
    expiresAt.setHours(expiresAt.getHours() + 48);
    const diff = expiresAt.getTime() - Date.now();
    if (diff <= 0) return 'expired';
    const hours = Math.floor(diff / 3600000);
    return hours > 0 ? `${hours}h` : '< 1h';
  }
}
