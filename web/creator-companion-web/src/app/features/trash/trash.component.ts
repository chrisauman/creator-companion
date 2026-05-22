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
    <!-- Layout mirrors the other standalone pages (favorites,
         account, notifications): .page is a flex container that
         holds sidebar, mobile header, and main content. The body
         content lives inside .body-inner so horizontal gutters match
         the app-wide spacing standard (1.5rem mobile, 2.5rem desktop). -->
    <div class="page">
      <app-sidebar />
      <app-mobile-header />

      <main id="main" class="main-content">
        <div class="body-inner">

          <!-- Page-level header. Eyebrow + dark title pattern matches
               the rest of the app's reading surfaces. Subtitle explains
               the 48-hour retention so users know what's happening. -->
          <header class="page-head">
            <span class="page-head__eyebrow">Account</span>
            <h1 class="page-head__title">Trash</h1>
            <p class="page-head__sub">
              Deleted entries live here for 48 hours before being
              permanently removed. You can recover or delete them now.
            </p>
          </header>

          <div *ngIf="!caps()?.canRecoverDeleted" class="alert alert--error" style="margin-bottom:1.5rem">
            Recovery requires a paid plan. Entries will be permanently deleted after 48 hours.
          </div>

          <div *ngIf="loadError()" class="empty-state">
            <p class="text-muted">Could not load trash. Please check your connection and try again.</p>
            <a routerLink="/dashboard" class="btn btn--secondary" style="margin-top:1rem">Back to journal</a>
          </div>

          <!-- Empty-state card (cream-tone surface matching the column-3
               hero cards on the dashboard). The CTA is the only way
               out of the page, so primary button rather than ghost. -->
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

          <!-- Entry list. Each card mirrors the journal entry-row visual
               language: cyan-eyebrow date + dark title + body preview,
               with the "expires in N" timer as a small danger-toned
               chip on the right of the eyebrow row. Actions footer
               is right-aligned so the row reads top-down naturally. -->
          <div class="entry-list" *ngIf="activeEntries().length > 0">
            <div class="trash-entry" *ngFor="let entry of activeEntries()">
              <div class="trash-entry__meta">
                <span class="trash-entry__eyebrow">{{ formatDate(entry.entryDate) }}</span>
                <span class="trash-entry__chip" aria-label="Time remaining before permanent deletion">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  Expires in {{ hoursLeft(entry) }}
                </span>
              </div>
              <p class="trash-entry__title" *ngIf="entry.title">{{ entry.title }}</p>
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
                  class="btn btn--ghost btn--sm trash-entry__delete"
                  (click)="confirmPermanentDelete(entry)"
                >
                  Delete permanently
                </button>
              </div>
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
    /* Page shell — same flex layout as favorites/account/notifications
       so trash slots into the app shell consistently. */
    .page {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    @media (min-width: 768px) { .page { flex-direction: row; } }

    /* Main content column. flex:1 so it claims everything not used by
       the sidebar. min-width:0 prevents grid blowout from long content. */
    .main-content {
      flex: 1;
      min-width: 0;
      padding: 0;
    }

    /* Standard horizontal gutters per the app-wide spacing standard:
       1.5rem mobile, 2.5rem desktop. Vertical padding leaves the first
       child to own breathing room from the sticky mobile-header. */
    .body-inner {
      padding: 1.5rem 1.5rem 4rem;
      max-width: 760px;
      margin: 0 auto;
    }
    @media (min-width: 768px) {
      .body-inner { padding: 2.5rem 2.5rem 4rem; }
    }

    /* ── Page header ─────────────────────────────────────────────
       Eyebrow / dark title / muted subtitle. Same hierarchy as other
       account-area surfaces (Account, Reminders, Favorites). */
    .page-head { margin-bottom: 2rem; }
    .page-head__eyebrow {
      display: inline-block;
      font-size: .8125rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: var(--color-accent);
      margin-bottom: .5rem;
    }
    .page-head__title {
      font-family: var(--font-sans);
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -.02em;
      color: var(--color-text);
      margin: 0 0 .5rem;
    }
    .page-head__sub {
      font-size: 1rem;
      line-height: 1.6;
      color: var(--color-text-2);
      margin: 0;
      max-width: 56ch;
    }

    .empty-state { text-align:center; padding:3rem 1rem; color:var(--color-text-2); }

    /* Polished empty-state card. Cream gradient to match the column-3
       hero card family on the dashboard — gives the empty path the
       same warm treatment, so reaching it feels intentional rather
       than like an error page. */
    .empty-card {
      max-width: 460px;
      margin: 1rem auto 3rem;
      padding: 2.5rem 2rem;
      background: linear-gradient(180deg, #fdfaf2 0%, #f6f1e6 100%);
      border: 1px solid rgba(190,170,130,.22);
      border-radius: 20px;
      text-align: center;
    }
    .empty-card__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px; height: 64px;
      margin-bottom: 1rem;
      color: var(--color-text-3);
      background: rgba(255,255,255,.6);
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

    /* ── Entry list ──────────────────────────────────────────────
       Same card surface as journal entries (white-on-grey, soft
       border, generous interior padding). Cyan-eyebrow + dark title
       echoes the column-2 entry-row visual language so a deleted
       entry still feels like an entry, just on its way out. */
    .entry-list {
      display: flex;
      flex-direction: column;
      gap: .875rem;
    }
    .trash-entry {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      padding: 1.25rem 1.25rem 1rem;
      transition: border-color .15s, transform .1s;
    }
    .trash-entry:hover {
      border-color: var(--color-border-strong, #d4d4d8);
    }

    /* Eyebrow row: cyan date label + danger-toned expiry chip. */
    .trash-entry__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: .5rem;
      margin-bottom: .375rem;
    }
    .trash-entry__eyebrow {
      font-size: .75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: var(--color-accent);
    }
    .trash-entry__chip {
      display: inline-flex;
      align-items: center;
      gap: .3rem;
      font-size: .75rem;
      font-weight: 600;
      color: #9f1239;
      background: #fff1f2;
      border: 1px solid #fda4af;
      padding: .2rem .55rem;
      border-radius: 999px;
    }

    .trash-entry__title {
      font-family: var(--font-sans);
      font-size: 1.0625rem;
      font-weight: 700;
      letter-spacing: -.01em;
      color: var(--color-text);
      margin: 0 0 .25rem;
      line-height: 1.35;
    }
    .trash-entry__preview {
      font-size: .9375rem;
      line-height: 1.55;
      color: var(--color-text-2);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin: 0 0 1rem;
    }
    .trash-entry__actions {
      display: flex;
      gap: .5rem;
      /* Recover sits at the row's left edge; Delete permanently pins
         to the right (see .trash-entry__delete margin-left:auto).
         Earlier this was justify-content:flex-end on all breakpoints,
         which clustered both buttons at the right and made Delete
         feel like the primary action — bad framing for a destructive
         second-position button. Left-Recover/right-Delete is the
         standard "primary on left, destructive on right" pattern
         every desktop OS dialog uses; we now do it on mobile too. */
      flex-wrap: wrap;
    }
    /* Destructive secondary — text + hover lift to rose-600 (the
       app-wide danger token). Quieter than a fully red pill, which
       would compete with Recover for attention. margin-left:auto
       is the alignment trick that keeps this pinned right while
       Recover stays left, even when the row wraps to two lines on
       narrow viewports (each wrapped line auto-margins to its own
       right edge — the visual contract holds). */
    .trash-entry__delete { color: #9f1239; margin-left: auto; }
    .trash-entry__delete:hover {
      color: #fff;
      background: #9f1239;
      border-color: #9f1239;
    }

    /* Confirm-permanent-delete modal. Standard takeover styling. */
    .overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.4);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      z-index: 200;
    }
    .confirm-dialog { max-width: 400px; width: 100%; }
    .confirm-actions {
      display: flex;
      gap: .75rem;
      justify-content: flex-end;
      margin-top: 1.25rem;
    }
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
