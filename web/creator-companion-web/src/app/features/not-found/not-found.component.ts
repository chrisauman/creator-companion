import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                padding:2rem;background:var(--color-bg)">
      <div class="card fade-in" style="max-width:400px;width:100%;text-align:center;padding:2.5rem">
        <div style="font-size:3rem;margin-bottom:1rem">✦</div>
        <h1 style="font-size:1.5rem;margin-bottom:.5rem">Page not found</h1>
        <p class="text-muted" style="margin-bottom:2rem;line-height:1.6">
          The page you're looking for doesn't exist or has moved.
        </p>
        <a routerLink="/dashboard" class="btn btn--primary btn--full">Go to dashboard</a>
      </div>
    </div>
  `
})
export class NotFoundComponent {}
