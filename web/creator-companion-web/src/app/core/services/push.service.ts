import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class PushService {
  private api = inject(ApiService);

  get isSupported(): boolean {
    return typeof navigator !== 'undefined'
        && 'serviceWorker' in navigator
        && typeof window !== 'undefined'
        && 'PushManager' in window
        && typeof Notification !== 'undefined';
  }

  /** Centralized permission read with a `typeof` guard. Reading
   *  `Notification.permission` directly throws ReferenceError in older
   *  Safari and non-secure contexts; every caller should go through
   *  this method instead of touching the global. */
  async getPermissionState(): Promise<NotificationPermission> {
    if (typeof Notification === 'undefined') return 'denied';
    return Notification.permission;
  }

  async isSubscribed(): Promise<boolean> {
    if (!this.isSupported) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch {
      return false;
    }
  }

  /**
   * If the browser already has a push subscription, re-save it to the server.
   * Handles cases where the server lost the record (e.g. first enable failed
   * mid-flight, or the subscription pre-dated the current server state).
   */
  async syncToServer(): Promise<void> {
    if (!this.isSupported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      const json = sub.toJSON();
      await this.api.pushSubscribe({
        endpoint: json.endpoint!,
        p256dh:   (json.keys as any)['p256dh'],
        auth:     (json.keys as any)['auth'],
        platform: 'web'
      }).toPromise();
    } catch {
      // Best-effort — don't surface errors to the user
    }
  }

  async subscribe(): Promise<boolean> {
    if (!this.isSupported) return false;

    try {
      // Register service worker
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Get VAPID public key from API
      const { publicKey } = await this.api.getPushVapidKey().toPromise() as any;

      // Ask browser for permission + subscribe
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey) as BufferSource
      });

      const json = sub.toJSON();

      // Save to server
      await this.api.pushSubscribe({
        endpoint: json.endpoint!,
        p256dh:   (json.keys as any)['p256dh'],
        auth:     (json.keys as any)['auth'],
        platform: 'web'
      }).toPromise();

      return true;
    } catch (err) {
      console.error('Push subscription failed:', err);
      return false;
    }
  }

  async unsubscribe(): Promise<void> {
    if (!this.isSupported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      await this.api.pushUnsubscribe(sub.endpoint).toPromise();
      await sub.unsubscribe();
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }
}
