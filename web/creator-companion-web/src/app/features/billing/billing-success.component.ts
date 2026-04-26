import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-billing-success',
  standalone: true,
  template: `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--color-bg)">
      <div class="card fade-in" style="max-width:420px;width:100%;text-align:center;padding:2.5rem">
        <div style="font-size:3rem;margin-bottom:1rem">🎉</div>
        <h1 style="font-size:1.5rem;margin-bottom:.5rem">You're on the Paid plan!</h1>
        <p class="text-muted" style="margin-bottom:2rem">
          All features are now unlocked. Welcome to the full Creator Companion experience.
        </p>
        <button class="btn btn--primary btn--full" (click)="go()">Go to dashboard</button>
      </div>
    </div>
  `
})
export class BillingSuccessComponent implements OnInit {
  private auth   = inject(AuthService);
  private api    = inject(ApiService);
  private router = inject(Router);

  ngOnInit(): void {
    // Refresh the user so the tier badge updates
    this.api.getMe().subscribe(u => this.auth.setUser(u));
  }

  go(): void { this.router.navigate(['/dashboard']); }
}
