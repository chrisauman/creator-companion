import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SwUpdate } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  template: `
    <router-outlet />
    @if (updateAvailable) {
      <div class="update-banner">
        <span>A new version is available.</span>
        <button class="update-banner__btn" (click)="applyUpdate()">Refresh</button>
      </div>
    }
  `,
  styles: [`
    .update-banner {
      position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%);
      background: var(--color-text); color: #fff;
      padding: .75rem 1.25rem; border-radius: var(--radius-lg);
      display: flex; align-items: center; gap: 1rem;
      font-size: .875rem; z-index: 9999;
      box-shadow: 0 4px 16px rgba(0,0,0,.25);
    }
    .update-banner__btn {
      background: var(--color-accent-dark); color: #fff; border: none;
      padding: .35rem .85rem; border-radius: var(--radius-md);
      font-size: .8125rem; font-weight: 600; cursor: pointer;
    }
  `]
})
export class App implements OnInit {
  private swUpdate = inject(SwUpdate, { optional: true });
  updateAvailable = false;

  ngOnInit(): void {
    if (!this.swUpdate?.isEnabled) return;

    this.swUpdate.versionUpdates.subscribe(event => {
      if (event.type === 'VERSION_READY') {
        this.updateAvailable = true;
      }
    });
  }

  applyUpdate(): void {
    window.location.reload();
  }
}
