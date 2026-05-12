import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Faq } from '../../core/models/models';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { MobileHeaderComponent } from '../../shared/mobile-header/mobile-header.component';
@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SidebarComponent, MobileHeaderComponent],
  template: `
    <div class="page">

      <!-- Desktop sidebar -->
      <app-sidebar active="dashboard" />

      <app-mobile-header />
<main id="main" class="main-content">
        <div class="support-wrap">

          <div class="support-header">
            <h1 class="support-title">Help & Support</h1>
            <p class="support-sub">Find answers to common questions below.</p>
          </div>

          <!-- Search + category filter. Both are client-side filters
               over the full FAQ list (the dataset is small — under 100
               rows — and refetching on every keystroke would be wasteful).
               Filters compose: typing a query AND picking a category
               narrows the results to rows matching both. Clear button
               on the search resets the query. -->
          <div class="faq-controls" *ngIf="!loading() && faqs().length > 0">
            <div class="faq-search">
              <svg class="faq-search__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd"/>
              </svg>
              <label for="faq-search-input" class="sr-only">Search frequently asked questions</label>
              <input
                id="faq-search-input"
                class="faq-search__input"
                type="search"
                placeholder="Search questions and answers…"
                [ngModel]="query()"
                (ngModelChange)="query.set($event)"
                autocomplete="off"
              />
              @if (query()) {
                <button class="faq-search__clear" type="button"
                        (click)="query.set('')"
                        aria-label="Clear search">×</button>
              }
            </div>

            <div class="faq-cats" role="tablist" aria-label="Filter by category">
              <button
                class="faq-cat"
                [class.faq-cat--active]="activeCategory() === null"
                type="button"
                role="tab"
                [attr.aria-selected]="activeCategory() === null"
                (click)="activeCategory.set(null)">
                All
              </button>
              @for (cat of categories(); track cat) {
                <button
                  class="faq-cat"
                  [class.faq-cat--active]="activeCategory() === cat"
                  type="button"
                  role="tab"
                  [attr.aria-selected]="activeCategory() === cat"
                  (click)="activeCategory.set(cat)">
                  {{ cat }}
                </button>
              }
            </div>
          </div>

          <!-- Pinned helper card sits above the regular list. Always
               visible regardless of search/category filter — the tour
               replay is a universal need. -->
          @if (!query() && activeCategory() === null) {
            <section class="faq-list faq-list--pinned">
              <div class="faq-item" [class.faq-item--open]="openId() === 'tour-replay'">
                <button class="faq-question" (click)="toggle('tour-replay')"
                        [attr.aria-expanded]="openId() === 'tour-replay'">
                  <span>Can I watch the onboarding tour again?</span>
                  <svg class="faq-chevron" xmlns="http://www.w3.org/2000/svg"
                    width="16" height="16" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" stroke-width="2.5"
                    stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                @if (openId() === 'tour-replay') {
                  <div class="faq-answer">
                    <p>
                      Yes —
                      <a class="faq-replay-link" routerLink="/onboarding" [queryParams]="{ replay: 1 }">
                        click this link to begin
                      </a>.
                      You'll see the welcome cards, followed by tooltips that
                      point out each major feature on your dashboard.
                    </p>
                  </div>
                }
              </div>
            </section>
          }

          <!-- FAQ list -->
          @if (loading()) {
            <div class="loading-state">Loading…</div>
          }

          @if (!loading() && faqs().length > 0 && filteredFaqs().length === 0) {
            <div class="empty-state">
              No questions match your search.
              <button class="faq-reset-link" type="button" (click)="resetFilters()">Clear filters</button>
            </div>
          }
          <!--
            We deliberately do NOT render a "No FAQs available yet" empty
            state. Even when the DB-driven list is empty, the page is not
            empty — the pinned "Replay tour" entry above is always visible.
            Showing "No FAQs available" next to a visible FAQ entry read as
            a bug to users, so the empty-list message is omitted entirely.
          -->

          @if (!loading() && filteredFaqs().length > 0) {
            <section class="faq-list">
              @for (faq of filteredFaqs(); track faq.id) {
                <div class="faq-item" [class.faq-item--open]="openId() === faq.id">
                  <button class="faq-question" (click)="toggle(faq.id)"
                          [attr.aria-expanded]="openId() === faq.id">
                    <span>
                      <span class="faq-cat-tag">{{ faq.category }}</span>
                      {{ faq.question }}
                    </span>
                    <svg class="faq-chevron" xmlns="http://www.w3.org/2000/svg"
                      width="16" height="16" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" stroke-width="2.5"
                      stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  @if (openId() === faq.id) {
                    <div class="faq-answer">
                      <p>{{ faq.answer }}</p>
                    </div>
                  }
                </div>
              }
            </section>
          }

          <!-- Contact support -->
          <div class="support-contact">
            <p>Didn't find what you're looking for?</p>
            <a class="support-contact__link" href="mailto:chris@sanctuarymg.com">
              Contact Support →
            </a>
          </div>

        </div>
      </main>
    </div>
  `,
  styles: [`
    /* ── Page shell ─────────────────────────────────────────────── */
    .page { display: flex; flex-direction: column; min-height: 100vh; }
    @media (min-width: 768px) { .page { flex-direction: row; } }

    /* ── Mobile top bar ──────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 100;
      background: #111318; border-bottom: 1px solid rgba(255,255,255,.07);
      height: 52px; display: flex; align-items: center; padding: 0 1.5rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; }
    .topbar__brand-icon { height: 22px; width: auto; }
    .topbar__brand-name { font-family: var(--font-brand); font-size: 1rem; font-weight: 800; letter-spacing: -.01em; color: #fff; }

    /* ── Main ────────────────────────────────────────────────────── */
    .main-content {
      flex: 1; min-width: 0;
      padding: 0 0 calc(72px + env(safe-area-inset-bottom, 0px));
      background: var(--color-surface);
    }
    @media (min-width: 768px) { .main-content { padding: 2rem 3rem 4rem; } }

    /* 1.5rem horizontal gutter matches the rest of the app's
       standalone pages (today-panel, entry-card, todos). */
    .support-wrap {
      padding: 1.5rem 1.5rem 2rem;
    }
    @media (min-width: 768px) {
      .support-wrap { max-width: 680px; margin: 0 auto; padding: 0; }
    }

    /* ── Header ──────────────────────────────────────────────────── */
    .support-header { margin-bottom: 1.75rem; }
    .support-title {
      font-size: clamp(1.375rem, 5vw, 1.75rem);
      font-weight: 800; color: var(--color-text); margin: 0 0 .375rem;
    }
    .support-sub { font-size: 1rem; color: var(--color-text); margin: 0; line-height: 1.6; }

    /* ── States ──────────────────────────────────────────────────── */
    .loading-state, .empty-state {
      padding: 2rem 0; text-align: center; color: var(--color-text-3); font-size: .9375rem;
    }

    /* ── FAQ list ────────────────────────────────────────────────── */
    .faq-list {
      display: flex; flex-direction: column;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      margin-bottom: 2rem;
    }

    .faq-item {
      border-bottom: 1px solid var(--color-border);
      &:last-child { border-bottom: none; }
      &--open { background: var(--color-surface); }
    }

    .faq-question {
      width: 100%; display: flex; align-items: center;
      justify-content: space-between; gap: 1rem;
      padding: 1rem 1.25rem;
      background: none; border: none; cursor: pointer;
      text-align: left;
      font-size: .9375rem; font-weight: 600;
      color: var(--color-text); font-family: var(--font-sans);
      transition: background .15s;
      &:hover { background: var(--color-surface-2); }
    }

    .faq-chevron {
      flex-shrink: 0; color: var(--color-text-3);
      transition: transform .25s ease;
    }
    .faq-item--open .faq-chevron { transform: rotate(180deg); }

    .faq-answer {
      /* Top padding gives the expanded answer a clear breath of
         whitespace below the question heading — without it, the body
         text sits flush with the chevron line and reads cramped. */
      padding: .375rem 1.25rem 1.125rem;
      /* Body copy standard — 1rem Inter, line-height 1.6, ink color.
         Was --font-serif (Georgia) which CLAUDE.md flags as reserved. */
      p {
        margin: 0;
        font-size: 1rem;
        color: var(--color-text);
        line-height: 1.6;
        font-family: var(--font-sans);
      }
    }
    /* Pinned FAQ section sits above the DB-driven list with a small
       extra bottom gap so the seam between them reads as intentional
       rather than crowded. */
    .faq-list--pinned { margin-bottom: 1rem; }
    .faq-replay-link {
      color: var(--color-accent);
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .faq-replay-link:hover { color: var(--color-accent-dark); }

    /* ── Search + category controls ──────────────────────────────── */
    .faq-controls { margin-bottom: 1.25rem; }
    .faq-search {
      display: flex; align-items: center; gap: .5rem;
      padding: .625rem .875rem;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 999px;
      transition: border-color .15s, box-shadow .15s;
    }
    .faq-search:focus-within {
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px var(--color-accent-light);
    }
    .faq-search__icon { width: 16px; height: 16px; color: var(--color-text-3); flex-shrink: 0; }
    .faq-search__input {
      flex: 1; min-width: 0;
      border: none; outline: none; background: transparent;
      font-family: inherit; font-size: 1rem; color: var(--color-text);
    }
    .faq-search__input::placeholder { color: var(--color-text-3); }
    .faq-search__clear {
      flex-shrink: 0;
      width: 24px; height: 24px;
      display: grid; place-items: center;
      background: var(--color-surface-2);
      border: none; border-radius: 50%;
      color: var(--color-text-2);
      cursor: pointer;
      font-size: 1rem; line-height: 1;
    }
    .faq-search__clear:hover { background: var(--color-border); color: var(--color-text); }

    .faq-cats {
      display: flex; flex-wrap: wrap; gap: .375rem;
      margin-top: .75rem;
    }
    .faq-cat {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 999px;
      padding: .375rem .875rem;
      font-family: inherit; font-size: .8125rem; font-weight: 500;
      color: var(--color-text-2);
      cursor: pointer;
      transition: background .15s, color .15s, border-color .15s;
    }
    .faq-cat:hover {
      background: var(--color-surface-2);
      border-color: var(--color-text-3);
      color: var(--color-text);
    }
    .faq-cat--active,
    .faq-cat--active:hover {
      background: var(--color-text);
      color: #fff;
      border-color: var(--color-text);
    }

    /* Tiny category pill prefix inside the question button. Visible
       on All view so the user knows what bucket each row is from. */
    .faq-cat-tag {
      display: inline-block;
      font-size: .6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--color-accent);
      margin-right: .5rem;
      vertical-align: middle;
    }

    .faq-reset-link {
      background: none; border: none; padding: 0 .25rem;
      color: var(--color-accent);
      font: inherit;
      cursor: pointer;
      text-decoration: underline;
    }
    .faq-reset-link:hover { color: var(--color-accent-dark); }

    /* ── Contact link ────────────────────────────────────────────── */
    .support-contact {
      text-align: center;
      padding: 1.25rem;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      p { margin: 0 0 .5rem; font-size: 1rem; color: var(--color-text); line-height: 1.6; }
    }
    .support-contact__link {
      font-size: .9375rem; font-weight: 600;
      color: var(--color-accent-dark);
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }
  `]
})
export class SupportComponent implements OnInit {
  private api = inject(ApiService);

  faqs           = signal<Faq[]>([]);
  loading        = signal(true);
  openId         = signal<string | null>(null);
  /** Free-text search across question + answer + category. */
  query          = signal<string>('');
  /** Active category filter; null = show all. */
  activeCategory = signal<string | null>(null);

  /** Distinct categories in priority order, derived from the loaded
   *  FAQ set so admin-added buckets appear automatically without a
   *  hard-coded list. Stable order: by first-seen-sortOrder. */
  categories = computed<string[]>(() => {
    const seen = new Map<string, number>();
    for (const f of this.faqs()) {
      if (!seen.has(f.category)) seen.set(f.category, f.sortOrder);
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([cat]) => cat);
  });

  /** Filtered list: category match AND (no query OR matches q on
   *  question/answer/category text). Case-insensitive contains-match,
   *  no fuzziness yet — the dataset is small enough that contains
   *  feels instant and predictable. */
  filteredFaqs = computed<Faq[]>(() => {
    const q   = this.query().trim().toLowerCase();
    const cat = this.activeCategory();
    return this.faqs().filter(f => {
      if (cat && f.category !== cat) return false;
      if (!q) return true;
      return (
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
      );
    });
  });

  ngOnInit(): void {
    this.api.getFaqs().subscribe({
      next: faqs => { this.faqs.set(faqs); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  toggle(id: string): void {
    this.openId.set(this.openId() === id ? null : id);
  }

  resetFilters(): void {
    this.query.set('');
    this.activeCategory.set(null);
  }
}
