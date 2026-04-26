import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-billing-cancel',
  standalone: true,
  template: `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--color-bg)">
      <div class="card fade-in" style="max-width:420px;width:100%;text-align:center;padding:2.5rem">
        <div style="font-size:3rem;margin-bottom:1rem">↩️</div>
        <h1 style="font-size:1.5rem;margin-bottom:.5rem">Payment cancelled</h1>
        <p class="text-muted" style="margin-bottom:2rem">
          No worries — you're still on the free plan. You can upgrade any time from your account page.
        </p>
        <button class="btn btn--primary btn--full" (click)="go()">Go to dashboard</button>
      </div>
    </div>
  `
})
export class BillingCancelComponent {
  private router = inject(Router);
  go(): void { this.router.navigate(['/dashboard']); }
}
