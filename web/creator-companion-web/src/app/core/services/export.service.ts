import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap, map } from 'rxjs';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';
import { Entry, Journal } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private api  = inject(ApiService);
  private http = inject(HttpClient);
  private apiBase = environment.apiBaseUrl;

  exportJson(): void {
    this.api.getJournals().pipe(
      switchMap(journals => {
        return this.api.getEntries().pipe(
          map(list => ({ journals, list }))
        );
      }),
      switchMap(({ journals, list }) => {
        const fetches = list.map(item => this.api.getEntry(item.id));
        return new Observable<{ journals: Journal[]; entries: Entry[] }>(obs => {
          Promise.all(fetches.map(f => new Promise<Entry>((res, rej) =>
            f.subscribe({ next: res, error: rej })
          ))).then(entries => obs.next({ journals, entries }))
             .catch(e => obs.error(e))
             .finally(() => obs.complete());
        });
      })
    ).subscribe(({ journals, entries }) => {
      const payload = {
        exportedAt: new Date().toISOString(),
        journals,
        entries: entries.map(e => ({
          id: e.id,
          journal: journals.find(j => j.id === e.journalId)?.name ?? 'Unknown',
          date: e.entryDate,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          content: e.contentText,
          source: e.entrySource === 1 ? 'backfill' : 'direct',
          mediaCount: e.media.length
        }))
      };
      this.download(
        JSON.stringify(payload, null, 2),
        `creator-companion-export-${this.dateStamp()}.json`,
        'application/json'
      );
    });
  }

  exportText(): void {
    this.api.getEntries().pipe(
      switchMap(list => {
        const fetches = list.map(item => this.api.getEntry(item.id));
        return new Observable<Entry[]>(obs => {
          Promise.all(fetches.map(f => new Promise<Entry>((res, rej) =>
            f.subscribe({ next: res, error: rej })
          ))).then(entries => obs.next(entries))
             .catch(e => obs.error(e))
             .finally(() => obs.complete());
        });
      })
    ).subscribe(entries => {
      const lines: string[] = [
        'CREATOR COMPANION — EXPORT',
        `Exported: ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`,
        `Total entries: ${entries.length}`,
        '',
        '─'.repeat(60),
        ''
      ];

      for (const e of entries) {
        const date = new Date(e.entryDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        lines.push(date);
        lines.push('─'.repeat(date.length));
        lines.push('');
        lines.push(this.stripHtml(e.contentText));
        lines.push('');
        lines.push('');
      }

      this.download(
        lines.join('\n'),
        `creator-companion-export-${this.dateStamp()}.txt`,
        'text/plain'
      );
    });
  }

  /**
   * Full-archive export: hits GET /v1/users/me/export which streams a
   * ZIP containing export.json + every photo binary. The ZIP comes
   * back as a blob; we trigger a browser download via the same
   * blob-URL pattern used for the JSON/text exports. Authentication
   * piggybacks on the HttpClient's interceptor (Bearer token).
   *
   * Returns an Observable so the caller can show progress / disable
   * the button while the export streams. For a user with hundreds of
   * photos this can take 30+ seconds — sequential R2 reads server-side.
   */
  exportFullArchive(): Observable<Blob> {
    return this.http.get(`${this.apiBase}/users/me/export`, {
      responseType: 'blob',
    });
  }

  /** Convenience: trigger a download from the blob returned by
   *  exportFullArchive. Filename embeds today's date. */
  triggerArchiveDownload(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `creator-companion-export-${this.dateStamp()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private stripHtml(html: string): string {
    // Replace block-level tags with newlines for readable paragraph breaks
    const withBreaks = html
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n');
    // Strip all remaining tags
    const plain = withBreaks.replace(/<[^>]+>/g, '');
    // Decode common HTML entities
    return plain
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n') // collapse excess blank lines
      .trim();
  }

  private download(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private dateStamp(): string {
    return new Date().toISOString().substring(0, 10);
  }
}
