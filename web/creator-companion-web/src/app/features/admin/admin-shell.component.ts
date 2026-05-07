import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

/**
 * Shared chrome for every /admin/* page: page container with max-width
 * + padding, the "Admin Dashboard" header with the Back-to-App link,
 * and the admin nav with the seven section links.
 *
 * Each admin page wraps its content like:
 *
 *     <app-admin-shell active="emails">
 *       ...page-specific content...
 *     </app-admin-shell>
 *
 * Why this exists: previously every admin page hand-coded its own
 * <header> + <nav> + container styles. Drift was inevitable —
 * admin-faq lost the Daily Prompts link, admin-emails didn't have
 * a self-link, admin-user-detail missed Content Library, and the CSS
 * values diverged. With one source of truth, adding/renaming a
 * section is a one-line change here, and styling stays uniform across
 * every admin route.
 *
 * The `active` input drives the highlight; pages pass one of the seven
 * keys below. Anything else just renders no active state, which is a
 * reasonable failure mode (still navigable).
 */
@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="admin-page">
      <header class="admin-header">
        <h1>Admin Dashboard</h1>
        <a routerLink="/dashboard" class="btn btn--ghost btn--sm">← Back to App</a>
      </header>

      <nav class="admin-nav">
        <a routerLink="/admin"            class="admin-nav__link" [class.admin-nav__link--active]="active === 'overview'">Overview</a>
        <a routerLink="/admin/users"      class="admin-nav__link" [class.admin-nav__link--active]="active === 'users'">Users</a>
        <a routerLink="/admin/motivation" class="admin-nav__link" [class.admin-nav__link--active]="active === 'motivation'">Content Library</a>
        <a routerLink="/admin/reminders"  class="admin-nav__link" [class.admin-nav__link--active]="active === 'reminders'">Reminders</a>
        <a routerLink="/admin/emails"     class="admin-nav__link" [class.admin-nav__link--active]="active === 'emails'">Emails</a>
        <a routerLink="/admin/faq"        class="admin-nav__link" [class.admin-nav__link--active]="active === 'faq'">FAQ</a>
        <a routerLink="/admin/prompts"    class="admin-nav__link" [class.admin-nav__link--active]="active === 'prompts'">Daily Prompts</a>
      </nav>

      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    /* Page container — same max-width + padding rhythm the rest of the
       admin pages use. Sits centered with comfortable horizontal
       padding so content doesn't crash into the viewport edges. */
    .admin-page {
      max-width: 960px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    .admin-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
    }
    .admin-header h1 {
      font-family: var(--font-sans);
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -.01em;
      margin: 0;
    }
    .admin-header .btn--ghost {
      background: transparent;
      color: var(--color-text-2);
      border: 1px solid var(--color-border);
      border-radius: 999px;
    }
    .admin-header .btn--ghost:hover {
      color: var(--color-text);
      background: var(--color-surface-2);
    }

    /* Tabs row. Wraps on narrow viewports so we never lose links to
       overflow. Each link has the same padding/font/colour treatment;
       the active variant gets the accent-light tint. */
    .admin-nav {
      display: flex;
      gap: .25rem;
      flex-wrap: wrap;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--color-border);
      padding-bottom: 1rem;
    }
    .admin-nav__link {
      padding: .375rem .875rem;
      border-radius: var(--radius-sm);
      font-size: .875rem;
      font-weight: 500;
      color: var(--color-text-2);
      text-decoration: none;
      transition: background .15s, color .15s;
    }
    .admin-nav__link:hover {
      background: var(--color-surface-2);
      color: var(--color-text);
    }
    .admin-nav__link--active {
      background: var(--color-accent-light);
      color: var(--color-accent-dark);
      font-weight: 600;
    }
  `]
})
export class AdminShellComponent {
  /** Which section is currently active. Drives the nav highlight. */
  @Input() active:
    'overview' | 'users' | 'motivation' | 'reminders'
    | 'emails' | 'faq' | 'prompts' = 'overview';
}
