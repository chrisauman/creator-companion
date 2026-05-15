import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * App-wide "streak data may have changed — refetch" pulse.
 *
 * Several surfaces independently fetch /streak (sidebar's streak
 * number, threatened banner's visibility, daily-reminder card's
 * visibility, dashboard's milestone celebration). Before this
 * service those fetches only ran on ngOnInit, so after a successful
 * backfill the streak number / urgency cards stayed stale until
 * the user manually reloaded — even though the new entry had
 * already saved server-side.
 *
 * Publishers: anything that mutates entry state which could change
 * the streak — compose save (incl. backfill), edit save, edit
 * delete. Call `notify()` after the mutation API returns 200.
 *
 * Subscribers: components that derive UI from /streak — they
 * subscribe to `events$` in ngOnInit and refetch on each emission.
 *
 * No payload: each subscriber re-reads what it needs.
 */
@Injectable({ providedIn: 'root' })
export class StreakRefreshService {
  private subject = new Subject<void>();
  readonly events$: Observable<void> = this.subject.asObservable();

  notify(): void {
    this.subject.next();
  }
}
