import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AdminShellComponent } from './admin-shell.component';
import { getPlanDisplay } from '../../core/utils/plan';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AdminShellComponent],
  template: `
    <app-admin-shell active="users">

      <div class="toolbar">
        <input
          class="form-control search-input"
          type="search"
          placeholder="Search by name or email…"
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
                <th>Name</th>
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
                    {{ u.firstName }} {{ u.lastName }}
                    @if (u.isAdmin) { <span class="badge badge--admin">admin</span> }
                  </td>
                  <td class="text-muted">{{ u.email }}</td>
                  <td>
                    <!-- Plan label is computed from (tier + trialEndsAt) so
                         trial users read as "Free trial" with their day count
                         instead of the raw "Free" tier value. See plan.ts. -->
                    <span class="badge"
                          [class.badge--paid]="planFor(u).state === 'paid'"
                          [class.badge--trial]="planFor(u).state === 'trial'"
                          [class.badge--expired]="planFor(u).state === 'trial-expired'">
                      {{ planFor(u).label }}
                    </span>
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
    </app-admin-shell>
  `,
  styles: [`
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
    /* Trial state: brand-cyan-leaning. Same palette as the dashboard
       trial banner and the account-page trial badge. */
    .badge--trial { background: #e6f9fd; color: #0a6e80; }
    /* Trial expired: rose, matches the .badge--inactive treatment to
       signal "needs attention" without screaming. */
    .badge--expired { background: #fff1f2; color: #9f1239; }
    .badge--admin { background: #fde68a; color: #92400e; margin-left: .35rem; }
    .badge--active { background: #d4f0e0; color: #166534; }
    .badge--inactive { background: #fee2e2; color: #991b1b; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.25rem; }
  `]
})
export class AdminUsersComponent implements OnInit {
  private api = inject(ApiService);

  /** Wrapper around getPlanDisplay so we can call it from the template
   *  per-row. The row data is `any` here (admin user list shape comes
   *  from the API anonymous object) but the helper only reads `tier`
   *  and `trialEndsAt`, both of which the admin endpoint returns. */
  planFor(u: any) { return getPlanDisplay(u); }

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
