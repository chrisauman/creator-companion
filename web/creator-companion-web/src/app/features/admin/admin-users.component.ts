import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="admin-page">
      <header class="admin-header">
        <h1>Admin Dashboard</h1>
        <a routerLink="/dashboard" class="btn btn--ghost btn--sm">← Back to App</a>
      </header>

      <nav class="admin-nav">
        <a routerLink="/admin" class="admin-nav__link">Overview</a>
        <a routerLink="/admin/users" class="admin-nav__link admin-nav__link--active">Users</a>
        <a routerLink="/admin/motivation" class="admin-nav__link">Content Library</a>
        <a routerLink="/admin/reminders" class="admin-nav__link">Reminders</a>
        <a routerLink="/admin/emails" class="admin-nav__link">Emails</a>
      </nav>

      <div class="toolbar">
        <input
          class="form-control search-input"
          type="search"
          placeholder="Search by email or username…"
          [(ngModel)]="searchQuery"
          (input)="onSearch()"
        />
        <span class="text-muted text-sm">{{ total() }} total</span>
      </div>

      @if (loading()) {
        <p class="text-muted">Loading…</p>
      } @else {
        <div class="table-wrap card">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td>
                    {{ u.username }}
                    @if (u.isAdmin) { <span class="badge badge--admin">admin</span> }
                  </td>
                  <td class="text-muted">{{ u.email }}</td>
                  <td>
                    <span class="badge" [class.badge--paid]="u.tier === 'Paid'">{{ u.tier }}</span>
                  </td>
                  <td>
                    <span class="badge" [class.badge--active]="u.isActive" [class.badge--inactive]="!u.isActive">
                      {{ u.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="text-muted text-sm">{{ u.createdAt | date:'mediumDate' }}</td>
                  <td><a [routerLink]="['/admin/users', u.id]" class="btn btn--ghost btn--sm">View</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <button class="btn btn--ghost btn--sm" [disabled]="page() === 1" (click)="prevPage()">← Prev</button>
          <span class="text-muted text-sm">Page {{ page() }}</span>
          <button class="btn btn--ghost btn--sm" [disabled]="!hasMore()" (click)="nextPage()">Next →</button>
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
    .admin-header h1 { font-size: 1.5rem; margin: 0; }
    .admin-nav { display: flex; gap: .25rem; margin-bottom: 2rem; border-bottom: 1px solid var(--color-border); padding-bottom: .75rem; }
    .admin-nav__link { padding: .4rem .9rem; border-radius: 6px; text-decoration: none; color: var(--color-text-muted); font-size: .875rem; }
    .admin-nav__link:hover, .admin-nav__link--active { background: var(--color-surface); color: var(--color-text); }
    .toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .search-input { max-width: 320px; }
    .table-wrap { overflow-x: auto; padding: 0; }
    .admin-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
    .admin-table th { text-align: left; padding: .75rem 1rem; border-bottom: 1px solid var(--color-border); font-weight: 600; color: var(--color-text-muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; }
    .admin-table td { padding: .75rem 1rem; border-bottom: 1px solid var(--color-border); }
    .admin-table tbody tr:last-child td { border-bottom: none; }
    .admin-table tbody tr:hover { background: var(--color-surface); }
    .badge { display: inline-block; padding: .15rem .5rem; border-radius: 999px; font-size: .7rem; font-weight: 600; background: var(--color-surface); color: var(--color-text-muted); }
    .badge--paid { background: #d4f0e0; color: #166534; }
    .badge--admin { background: #fde68a; color: #92400e; margin-left: .35rem; }
    .badge--active { background: #d4f0e0; color: #166534; }
    .badge--inactive { background: #fee2e2; color: #991b1b; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.25rem; }
  `]
})
export class AdminUsersComponent implements OnInit {
  private api = inject(ApiService);

  users    = signal<any[]>([]);
  total    = signal(0);
  page     = signal(1);
  loading  = signal(true);
  error    = signal('');
  hasMore  = signal(false);

  searchQuery = '';
  private searchTimer: any;
  private PAGE_SIZE = 25;

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.adminGetUsers(this.page(), this.PAGE_SIZE, this.searchQuery || undefined).subscribe({
      next: res => {
        this.users.set(res.users);
        this.total.set(res.total);
        this.hasMore.set(this.page() * this.PAGE_SIZE < res.total);
        this.loading.set(false);
      },
      error: () => { this.error.set('Failed to load users.'); this.loading.set(false); }
    });
  }

  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(1); this.load(); }, 350);
  }

  prevPage() { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage() { if (this.hasMore()) { this.page.update(p => p + 1); this.load(); } }
}
