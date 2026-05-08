import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Faq } from '../../core/models/models';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { MobileHeaderComponent } from '../../shared/mobile-header/mobile-header.component';
@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent, MobileHeaderComponent],
  template: `
    <div class="page">

      <!-- Desktop sidebar -->
      <app-sidebar active="dashboard" />

      <app-mobile-header />
<main class="main-content">
        <div class="support-wrap">

          <div class="support-header">
            <h1 class="support-title">Help & Support</h1>
            <p class="support-sub">Find answers to common questions below.</p>
          </div>

          <!-- FAQ list -->
          @if (loading()) {
            <div class="loading-state">Loading…</div>
          }

          @if (!loading() && faqs().length === 0) {
            <div class="empty-state">No FAQs available yet. Check back soon.</div>
          }

          @if (!loading() && faqs().length > 0) {
            <section class="faq-list">
              @for (faq of faqs(); track faq.id) {
                <div class="faq-item" [class.faq-item--open]="openId() === faq.id">
                  <button class="faq-question" (click)="toggle(faq.id)">
                    <span>{{ faq.question }}</span>
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
      height: 52px; display: flex; align-items: center; padding: 0 .75rem;
    }
    @media (min-width: 768px) { .topbar { display: none; } }
    .topbar__brand { display: flex; align-items: center; gap: .5rem; text-decoration: none; }
    .topbar__brand-icon { height: 22px; width: auto; }
    .topbar__brand-name { font-family: var(--font-sans); font-size: .875rem; font-weight: 700; color: #fff; }

    /* ── Main ────────────────────────────────────────────────────── */
    .main-content {
      flex: 1; min-width: 0;
      padding: 0 0 calc(72px + env(safe-area-inset-bottom, 0px));
      background: var(--color-surface);
    }
    @media (min-width: 768px) { .main-content { padding: 2rem 3rem 4rem; } }

    .support-wrap {
      padding: 1.5rem 1.125rem 2rem;
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
    .support-sub { font-size: .9375rem; color: var(--color-text-2); margin: 0; }

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
      padding: 0 1.25rem 1.125rem;
      p {
        margin: 0;
        font-size: .9375rem;
        color: var(--color-text);
        line-height: 1.7;
        font-family: var(--font-serif);
      }
    }

    /* ── Contact link ────────────────────────────────────────────── */
    .support-contact {
      text-align: center;
      padding: 1.25rem;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      p { margin: 0 0 .5rem; font-size: .9375rem; color: var(--color-text-2); }
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

  faqs    = signal<Faq[]>([]);
  loading = signal(true);
  openId  = signal<string | null>(null);

  ngOnInit(): void {
    this.api.getFaqs().subscribe({
      next: faqs => { this.faqs.set(faqs); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  toggle(id: string): void {
    this.openId.set(this.openId() === id ? null : id);
  }
}
