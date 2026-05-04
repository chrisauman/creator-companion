import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink],
  template: `
    <div class="admin-page">
      <header class="admin-header">
        <h1>Admin Dashboard</h1>
        <a routerLink="/dashboard" class="btn btn--ghost btn--sm">← Back to App</a>
      </header>

      <nav class="admin-nav">
        <a routerLink="/admin" class="admin-nav__link admin-nav__link--active">Overview</a>
        <a routerLink="/admin/users" class="admin-nav__link">Users</a>
        <a routerLink="/admin/motivation" class="admin-nav__link">Content Library</a>
        <a routerLink="/admin/reminders" class="admin-nav__link">Notifications</a>
        <a routerLink="/admin/emails" class="admin-nav__link">Emails</a>
        <a routerLink="/admin/faq" class="admin-nav__link">FAQ</a>
        <a routerLink="/admin/prompts" class="admin-nav__link">Daily Prompts</a>
      </nav>

      @if (loading()) {
        <p class="text-muted">Loading stats…</p>
      } @else if (stats()) {
        <div class="stats-grid">
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().totalUsers }}</span>
            <span class="stat-card__label">Total Users</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().paidUsers }}</span>
            <span class="stat-card__label">Paid Users</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().freeUsers }}</span>
            <span class="stat-card__label">Free Users</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().activeUsers }}</span>
            <span class="stat-card__label">Active Accounts</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().totalEntries }}</span>
            <span class="stat-card__label">Total Entries</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().totalJournals }}</span>
            <span class="stat-card__label">Total Journals</span>
          </div>
          <div class="stat-card card stat-card--accent">
            <span class="stat-card__value">{{ stats().newUsersLast30Days }}</span>
            <span class="stat-card__label">New Users (30d)</span>
          </div>
          <div class="stat-card card stat-card--accent">
            <span class="stat-card__value">{{ stats().entriesLast30Days }}</span>
            <span class="stat-card__label">Entries (30d)</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ stats().totalMediaCount | number }}</span>
            <span class="stat-card__label">Media Files</span>
          </div>
          <div class="stat-card card">
            <span class="stat-card__value">{{ formatBytes(stats().totalMediaBytes) }}</span>
            <span class="stat-card__label">Total Storage Used</span>
          </div>
        </div>
      }

      @if (error()) {
        <div class="alert alert--error">{{ error() }}</div>
      }
    </div>
  `,
  styles: [`
    .admin-page { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
    .admin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    .admin-header h1 {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 1.75rem; font-weight: 700;
      letter-spacing: -.01em; margin: 0;
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
    .admin-nav {
      display: flex; gap: .25rem; flex-wrap: wrap;
      margin-bottom: 2rem; border-bottom: 1px solid var(--color-border);
      padding-bottom: 1rem;
    }
    .admin-nav__link {
      padding: .375rem .875rem; border-radius: var(--radius-sm);
      font-size: .875rem; font-weight: 500; color: var(--color-text-2);
      text-decoration: none; transition: background .15s, color .15s;
    }
    .admin-nav__link:hover { background: var(--color-surface-2); color: var(--color-text); }
    .admin-nav__link--active {
      background: var(--color-accent-light);
      color: var(--color-accent-dark);
      font-weight: 600;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 1rem;
    }
    .stat-card {
      padding: 1.25rem;
      text-align: center;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      transition: border-color .15s, transform .15s;
    }
    .stat-card:hover {
      border-color: var(--color-text-3);
      transform: translateY(-1px);
    }
    .stat-card--accent {
      background: linear-gradient(135deg, rgba(18,196,227,.04), rgba(18,196,227,.08));
      border-color: rgba(18,196,227,.25);
    }
    .stat-card__value {
      display: block;
      font-family: 'Fraunces', Georgia, serif;
      font-size: 2rem; font-weight: 700;
      letter-spacing: -.02em;
      color: var(--color-text);
    }
    .stat-card__label {
      display: block; font-size: .6875rem;
      color: var(--color-text-3);
      margin-top: .375rem;
      text-transform: uppercase;
      letter-spacing: .1em;
      font-weight: 600;
    }
  `]
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);

  stats   = signal<any>(null);
  loading = signal(true);
  error   = signal('');

  ngOnInit() {
    this.api.adminGetStats().subscribe({
      next: s => { this.stats.set(s); this.loading.set(false); },
      error: () => { this.error.set('Failed to load stats.'); this.loading.set(false); }
    });
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${i === 0 ? val : val.toFixed(1)} ${units[i]}`;
  }
}
