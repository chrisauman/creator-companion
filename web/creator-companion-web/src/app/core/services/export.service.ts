import { Injectable, inject } from '@angular/core';
import { Observable, switchMap, map } from 'rxjs';
import { ApiService } from './api.service';
import { Entry, Journal } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private api = inject(ApiService);

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
