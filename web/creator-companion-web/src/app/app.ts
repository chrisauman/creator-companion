import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { interval } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`
})
export class App implements OnInit {
  private swUpdate = inject(SwUpdate, { optional: true });

  ngOnInit(): void {
    if (!this.swUpdate?.isEnabled) return;

    // Auto-reload as soon as a new version is ready — editor autosaves so no work is lost
    this.swUpdate.versionUpdates.subscribe(async event => {
      if (event.type === 'VERSION_READY') {
        await this.swUpdate!.activateUpdate();
        window.location.reload();
      }
    });

    // Check for updates immediately and then every 30 seconds
    this.swUpdate.checkForUpdate();
    interval(30_000).subscribe(() => this.swUpdate!.checkForUpdate());
  }
}
