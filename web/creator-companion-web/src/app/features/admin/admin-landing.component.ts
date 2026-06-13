import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminShellComponent } from './admin-shell.component';
import { ApiService, LpListItem, LpDetail, LpKeyword, LpSettings, LpUpsert, LpContent } from '../../core/services/api.service';

/**
 * Admin for the automated landing-page builder. Three tabs:
 *  - Pages    : searchable/sortable directory + a per-section structured editor.
 *  - Keywords : the generation queue (add/prioritise/brief/status).
 *  - Settings : auto-generate/publish switches, quality threshold, schedule.
 * The page content is the agreed template schema (LpContent); the server renders
 * it. "Preview" opens the live-rendered HTML in a new tab.
 */
@Component({
  selector: 'app-admin-landing',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminShellComponent],
  template: `
    <app-admin-shell active="landing">
      <div class="lpa">
        <div class="lpa-tabs">
          <button class="lpa-tab" [class.lpa-tab--on]="tab() === 'pages'" (click)="tab.set('pages')">Pages</button>
          <button class="lpa-tab" [class.lpa-tab--on]="tab() === 'keywords'" (click)="tab.set('keywords'); loadKeywords()">Keywords</button>
          <button class="lpa-tab" [class.lpa-tab--on]="tab() === 'settings'" (click)="tab.set('settings'); loadSettings()">Settings</button>
        </div>

        <!-- ── PAGES: directory ── -->
        @if (tab() === 'pages' && !editing()) {
          <div class="lpa-bar">
            <input class="lpa-input" placeholder="Search slug, keyword, title…" [(ngModel)]="search" (keyup.enter)="loadPages()">
            <select class="lpa-input lpa-input--sm" [(ngModel)]="statusFilter" (change)="loadPages()">
              <option value="">All statuses</option><option value="Published">Published</option>
              <option value="Draft">Draft</option><option value="Archived">Archived</option>
            </select>
            <select class="lpa-input lpa-input--sm" [(ngModel)]="sort" (change)="loadPages()">
              <option value="updated">Recently edited</option><option value="created">Newest</option>
              <option value="published">Recently published</option><option value="title">Title</option><option value="status">Status</option>
            </select>
            <button class="lpa-btn" (click)="newPage()">+ New page</button>
          </div>
          @if (loading()) { <p class="lpa-muted">Loading…</p> }
          @else if (!pages().length) { <p class="lpa-muted">No pages yet. Add keywords and let the daily generator build them — or create one manually.</p> }
          @else {
            <table class="lpa-table">
              <thead><tr><th>Title</th><th>Slug</th><th>Status</th><th>Source</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                @for (p of pages(); track p.id) {
                  <tr>
                    <td class="lpa-title">{{ p.metaTitle || p.targetKeyword }}@if (p.noIndex) { <span class="lpa-pill lpa-pill--mute">noindex</span> }</td>
                    <td><code>/{{ p.slug }}</code></td>
                    <td><span class="lpa-pill" [class.lpa-pill--pub]="p.status==='Published'" [class.lpa-pill--draft]="p.status==='Draft'">{{ p.status }}</span></td>
                    <td class="lpa-muted">{{ p.generatedByAi ? 'AI' : 'Manual' }}@if (p.qualityScore != null) { · {{ p.qualityScore }} }</td>
                    <td class="lpa-muted">{{ p.updatedAt | date:'MMM d, h:mm a' }}</td>
                    <td class="lpa-actions">
                      <button class="lpa-link" (click)="edit(p)">Edit</button>
                      <button class="lpa-link" (click)="preview(p.id)">Preview</button>
                      @if (p.status === 'Published') { <button class="lpa-link" (click)="setStatus(p,'Archived')">Unpublish</button> }
                      @else { <button class="lpa-link" (click)="setStatus(p,'Published')">Publish</button> }
                      <button class="lpa-link lpa-link--danger" (click)="del(p)">Delete</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <div class="lpa-page"><span class="lpa-muted">{{ total() }} pages</span></div>
          }
        }

        <!-- ── PAGES: editor ── -->
        @if (tab() === 'pages' && editing(); as e) {
          <div class="lpa-bar">
            <button class="lpa-link" (click)="closeEditor()">← Back</button>
            <span class="lpa-spacer"></span>
            @if (msg()) { <span class="lpa-ok">{{ msg() }}</span> }
            @if (e.hasOriginal && e.generatedByAi) { <button class="lpa-link" (click)="revert(e.id)">Revert to AI original</button> }
            <button class="lpa-link" (click)="e.id && preview(e.id)" [disabled]="!e.id">Preview</button>
            <button class="lpa-btn" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
          </div>
          @if (editError()) { <p class="lpa-err">{{ editError() }}</p> }

          <div class="lpa-card">
            <h3>SEO &amp; URL</h3>
            <label class="lpa-f"><span>Target keyword</span><input class="lpa-input" [(ngModel)]="e.targetKeyword"></label>
            <label class="lpa-f"><span>Slug <em>/{{ e.slug }}</em></span><input class="lpa-input" [(ngModel)]="e.slug"></label>
            <label class="lpa-f"><span>Meta title <em>{{ (e.metaTitle||'').length }}/60</em></span><input class="lpa-input" [(ngModel)]="e.metaTitle"></label>
            <label class="lpa-f"><span>Meta description <em>{{ (e.metaDescription||'').length }}/155</em></span><textarea class="lpa-input" rows="2" [(ngModel)]="e.metaDescription"></textarea></label>
            <label class="lpa-check"><input type="checkbox" [(ngModel)]="e.noIndex"> noindex (keep out of search + sitemap)</label>
          </div>

          <div class="lpa-card">
            <h3>Hero</h3>
            <label class="lpa-f"><span>Kicker</span><input class="lpa-input" [(ngModel)]="e.content.hero!.kicker"></label>
            <label class="lpa-f"><span>Headline (H1)</span><input class="lpa-input" [(ngModel)]="e.content.hero!.h1"></label>
            <label class="lpa-f"><span>Subhead</span><textarea class="lpa-input" rows="2" [(ngModel)]="e.content.hero!.subhead"></textarea></label>
            <label class="lpa-f"><span>CTA label</span><input class="lpa-input" [(ngModel)]="e.content.hero!.ctaLabel"></label>
          </div>

          <div class="lpa-card">
            <h3>Hook</h3>
            <label class="lpa-f"><span>Heading</span><input class="lpa-input" [(ngModel)]="e.content.hook!.heading"></label>
            <label class="lpa-f"><span>Lead</span><textarea class="lpa-input" rows="2" [(ngModel)]="e.content.hook!.lead"></textarea></label>
            <div class="lpa-arr"><span>Chips</span>
              @for (c of e.content.hook!.chips!; track $index) {
                <div class="lpa-row"><input class="lpa-input" [(ngModel)]="e.content.hook!.chips![$index]"><button class="lpa-x" (click)="e.content.hook!.chips!.splice($index,1)">×</button></div>
              }
              <button class="lpa-add" (click)="e.content.hook!.chips!.push('')">+ chip</button>
            </div>
          </div>

          <div class="lpa-card">
            <h3>Explainer</h3>
            <label class="lpa-f"><span>Kicker</span><input class="lpa-input" [(ngModel)]="e.content.explainer!.kicker"></label>
            <label class="lpa-f"><span>Heading (H2)</span><input class="lpa-input" [(ngModel)]="e.content.explainer!.h2"></label>
            <div class="lpa-arr"><span>Paragraphs</span>
              @for (p of e.content.explainer!.paragraphs!; track $index) {
                <div class="lpa-row"><textarea class="lpa-input" rows="2" [(ngModel)]="e.content.explainer!.paragraphs![$index]"></textarea><button class="lpa-x" (click)="e.content.explainer!.paragraphs!.splice($index,1)">×</button></div>
              }
              <button class="lpa-add" (click)="e.content.explainer!.paragraphs!.push('')">+ paragraph</button>
            </div>
            <label class="lpa-f"><span>Image URL</span><input class="lpa-input" [(ngModel)]="e.content.explainer!.imageUrl"></label>
            <label class="lpa-f"><span>Image alt</span><input class="lpa-input" [(ngModel)]="e.content.explainer!.imageAlt"></label>
          </div>

          <div class="lpa-card">
            <h3>Benefit cards</h3>
            @for (c of e.content.benefitCards!; track $index) {
              <div class="lpa-sub">
                <div class="lpa-row">
                  <select class="lpa-input lpa-input--sm" [(ngModel)]="c.icon"><option *ngFor="let i of icons" [value]="i">{{ i }}</option></select>
                  <input class="lpa-input" placeholder="Title" [(ngModel)]="c.title"><button class="lpa-x" (click)="e.content.benefitCards!.splice($index,1)">×</button>
                </div>
                <textarea class="lpa-input" rows="2" placeholder="Body" [(ngModel)]="c.body"></textarea>
              </div>
            }
            <button class="lpa-add" (click)="e.content.benefitCards!.push({icon:'spark'})">+ card</button>
          </div>

          <div class="lpa-card">
            <h3>Photo band</h3>
            <label class="lpa-f"><span>Heading</span><input class="lpa-input" [(ngModel)]="e.content.band!.heading"></label>
            <label class="lpa-f"><span>Subtext</span><textarea class="lpa-input" rows="2" [(ngModel)]="e.content.band!.subtext"></textarea></label>
            <label class="lpa-f"><span>Background image URL</span><input class="lpa-input" [(ngModel)]="e.content.band!.imageUrl"></label>
          </div>

          <div class="lpa-card">
            <h3>Tips</h3>
            @for (t of e.content.tips!; track $index) {
              <div class="lpa-sub"><div class="lpa-row"><input class="lpa-input" placeholder="Title" [(ngModel)]="t.title"><button class="lpa-x" (click)="e.content.tips!.splice($index,1)">×</button></div>
                <textarea class="lpa-input" rows="2" placeholder="Body" [(ngModel)]="t.body"></textarea></div>
            }
            <button class="lpa-add" (click)="e.content.tips!.push({})">+ tip</button>
          </div>

          <div class="lpa-card">
            <h3>Feature rows</h3>
            @for (r of e.content.featureRows!; track $index) {
              <div class="lpa-sub">
                <div class="lpa-row"><input class="lpa-input" placeholder="Kicker" [(ngModel)]="r.kicker"><input class="lpa-input" placeholder="Heading" [(ngModel)]="r.h2"><button class="lpa-x" (click)="e.content.featureRows!.splice($index,1)">×</button></div>
                <textarea class="lpa-input" rows="2" placeholder="Body" [(ngModel)]="r.body"></textarea>
                <div class="lpa-row"><input class="lpa-input" placeholder="Media URL (screenshot or photo)" [(ngModel)]="r.mediaUrl"><input class="lpa-input" placeholder="Alt" [(ngModel)]="r.mediaAlt"></div>
                <div class="lpa-row"><label class="lpa-check"><input type="checkbox" [(ngModel)]="r.phone"> phone frame</label><label class="lpa-check"><input type="checkbox" [(ngModel)]="r.reverse"> image right</label></div>
              </div>
            }
            <button class="lpa-add" (click)="e.content.featureRows!.push({})">+ row</button>
          </div>

          <div class="lpa-card">
            <h3>Objections</h3>
            @for (o of e.content.objections!; track $index) {
              <div class="lpa-sub"><div class="lpa-row"><input class="lpa-input" placeholder="Question" [(ngModel)]="o.q"><button class="lpa-x" (click)="e.content.objections!.splice($index,1)">×</button></div>
                <textarea class="lpa-input" rows="2" placeholder="Answer" [(ngModel)]="o.a"></textarea></div>
            }
            <button class="lpa-add" (click)="e.content.objections!.push({})">+ objection</button>
          </div>

          <div class="lpa-card">
            <h3>FAQ</h3>
            @for (q of e.content.faq!; track $index) {
              <div class="lpa-sub"><div class="lpa-row"><input class="lpa-input" placeholder="Question" [(ngModel)]="q.q"><button class="lpa-x" (click)="e.content.faq!.splice($index,1)">×</button></div>
                <textarea class="lpa-input" rows="2" placeholder="Answer" [(ngModel)]="q.a"></textarea></div>
            }
            <button class="lpa-add" (click)="e.content.faq!.push({})">+ question</button>
          </div>

          <div class="lpa-card">
            <h3>Final CTA</h3>
            <label class="lpa-f"><span>Heading</span><input class="lpa-input" [(ngModel)]="e.content.finalCta!.heading"></label>
            <label class="lpa-f"><span>Subtext</span><input class="lpa-input" [(ngModel)]="e.content.finalCta!.subtext"></label>
            <label class="lpa-f"><span>CTA label</span><input class="lpa-input" [(ngModel)]="e.content.finalCta!.ctaLabel"></label>
          </div>
        }

        <!-- ── KEYWORDS ── -->
        @if (tab() === 'keywords') {
          <div class="lpa-card">
            <h3>Add a keyword</h3>
            <div class="lpa-row"><input class="lpa-input" placeholder="Keyword (e.g. private journaling app)" [(ngModel)]="kwNew.keyword">
              <input class="lpa-input lpa-input--sm" type="number" placeholder="Priority" [(ngModel)]="kwNew.priority">
              <button class="lpa-btn" [disabled]="!kwNew.keyword.trim()" (click)="addKeyword()">Add</button></div>
            <textarea class="lpa-input" rows="2" placeholder="Optional brief — angle / audience / must-haves" [(ngModel)]="kwNew.brief"></textarea>
          </div>
          @if (!keywords().length) { <p class="lpa-muted">No keywords queued. Add some above; the 7am worker generates one page per day.</p> }
          @else {
            <table class="lpa-table">
              <thead><tr><th>Keyword</th><th>Brief</th><th>Priority</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (k of keywords(); track k.id) {
                  <tr>
                    <td>{{ k.keyword }}</td>
                    <td class="lpa-muted">{{ k.brief }}</td>
                    <td><input class="lpa-input lpa-input--xs" type="number" [(ngModel)]="k.priority" (change)="saveKeyword(k)"></td>
                    <td><span class="lpa-pill">{{ k.status }}</span>@if (k.lastError) { <span class="lpa-err-inline" [title]="k.lastError">!</span> }</td>
                    <td class="lpa-actions"><button class="lpa-link lpa-link--danger" (click)="delKeyword(k)">Delete</button></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        }

        <!-- ── SETTINGS ── -->
        @if (tab() === 'settings' && settings(); as s) {
          <div class="lpa-card">
            <h3>Automation</h3>
            <label class="lpa-check"><input type="checkbox" [(ngModel)]="s.autoGenerateEnabled"> Auto-generate one page per day at {{ s.generateHourLocalEt }}:00 ET</label>
            <label class="lpa-check"><input type="checkbox" [(ngModel)]="s.autoPublishEnabled"> Auto-publish pages that clear the quality bar (others held as drafts)</label>
            <label class="lpa-f"><span>Quality threshold (0–100): {{ s.qualityThreshold }}</span><input type="range" min="0" max="100" [(ngModel)]="s.qualityThreshold"></label>
            <label class="lpa-f"><span>Generation hour (ET)</span><input class="lpa-input lpa-input--sm" type="number" min="0" max="23" [(ngModel)]="s.generateHourLocalEt"></label>
            <button class="lpa-btn" (click)="saveSettings()">Save settings</button>
            @if (msg()) { <span class="lpa-ok">{{ msg() }}</span> }
          </div>
          <div class="lpa-card">
            <h3>Integration status</h3>
            <p class="lpa-int">Claude (content generation): <span [class.lpa-on]="s.anthropicConfigured" [class.lpa-off]="!s.anthropicConfigured">{{ s.anthropicConfigured ? 'connected' : 'not configured (Anthropic__ApiKey)' }}</span></p>
            <p class="lpa-int">Pexels (images): <span [class.lpa-on]="s.pexelsConfigured" [class.lpa-off]="!s.pexelsConfigured">{{ s.pexelsConfigured ? 'connected' : 'not configured (Pexels__ApiKey)' }}</span></p>
            <p class="lpa-int">Google Analytics: <span [class.lpa-on]="s.ga4Configured" [class.lpa-off]="!s.ga4Configured">{{ s.ga4Configured ? 'connected' : 'not configured (Ga4__MeasurementId)' }}</span></p>
            @if (s.lastGeneratedDate) { <p class="lpa-muted">Last generated: {{ s.lastGeneratedDate }}</p> }
          </div>
        }
      </div>
    </app-admin-shell>
  `,
  styles: [`
    .lpa { max-width: 920px; margin: 0 auto; padding: 1.5rem; }
    .lpa-tabs { display: flex; gap: .5rem; margin-bottom: 1.25rem; border-bottom: 1px solid #e5e7eb; }
    .lpa-tab { background: none; border: none; padding: .6rem .9rem; font-weight: 700; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; }
    .lpa-tab--on { color: #0c0e13; border-bottom-color: #12C4E3; }
    .lpa-bar { display: flex; align-items: center; gap: .5rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .lpa-spacer { flex: 1; }
    .lpa-input { width: 100%; padding: .55rem .7rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: .9375rem; font-family: inherit; }
    .lpa-input--sm { width: auto; min-width: 140px; } .lpa-input--xs { width: 70px; } .lpa-input--xs, .lpa-input--sm { flex: none; }
    .lpa-btn { background: #0c0e13; color: #fff; border: none; border-radius: 999px; padding: .55rem 1.1rem; font-weight: 700; cursor: pointer; white-space: nowrap; }
    .lpa-btn:disabled { opacity: .5; }
    .lpa-link { background: none; border: none; color: #0a93ab; font-weight: 600; cursor: pointer; padding: .2rem .4rem; }
    .lpa-link--danger { color: #e11d48; }
    .lpa-table { width: 100%; border-collapse: collapse; font-size: .9375rem; }
    .lpa-table th { text-align: left; color: #6b7280; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; padding: .4rem .5rem; border-bottom: 1px solid #e5e7eb; }
    .lpa-table td { padding: .55rem .5rem; border-bottom: 1px solid #f1f1f1; vertical-align: middle; }
    .lpa-title { font-weight: 600; }
    .lpa-actions { white-space: nowrap; text-align: right; }
    .lpa-muted { color: #9ca3af; }
    .lpa-pill { font-size: .7rem; font-weight: 700; padding: .15rem .5rem; border-radius: 999px; background: #eef0f2; color: #4b5563; }
    .lpa-pill--pub { background: #d1fae5; color: #047857; } .lpa-pill--draft { background: #fef3c7; color: #92400e; } .lpa-pill--mute { background: #f3f4f6; color: #9ca3af; margin-left: .4rem; }
    .lpa-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 1.25rem; margin-bottom: 1rem; }
    .lpa-card h3 { margin: 0 0 .9rem; font-size: 1rem; }
    .lpa-f { display: block; margin-bottom: .8rem; } .lpa-f span { display: block; font-size: .8125rem; font-weight: 700; margin-bottom: .25rem; color: #374151; }
    .lpa-f em { color: #9ca3af; font-weight: 400; font-style: normal; }
    .lpa-check { display: flex; align-items: center; gap: .5rem; font-size: .9rem; margin: .4rem 0; }
    .lpa-arr { margin-bottom: .8rem; } .lpa-arr > span { display: block; font-size: .8125rem; font-weight: 700; margin-bottom: .4rem; color: #374151; }
    .lpa-row { display: flex; gap: .5rem; align-items: flex-start; margin-bottom: .5rem; }
    .lpa-sub { border: 1px solid #eef0f2; border-radius: 10px; padding: .75rem; margin-bottom: .6rem; }
    .lpa-x { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; width: 34px; flex: none; cursor: pointer; color: #e11d48; font-weight: 700; }
    .lpa-add { background: #f3f4f6; border: 1px dashed #d1d5db; border-radius: 8px; padding: .4rem .8rem; font-weight: 600; color: #4b5563; cursor: pointer; }
    .lpa-ok { color: #047857; font-weight: 600; } .lpa-err { color: #e11d48; } .lpa-err-inline { color: #e11d48; font-weight: 800; margin-left: .3rem; cursor: help; }
    .lpa-int { margin: .3rem 0; font-size: .9rem; } .lpa-on { color: #047857; font-weight: 600; } .lpa-off { color: #b45309; font-weight: 600; }
    code { font-size: .85em; color: #4b5563; }
  `]
})
export class AdminLandingComponent implements OnInit {
  private api = inject(ApiService);

  tab = signal<'pages' | 'keywords' | 'settings'>('pages');
  loading = signal(false);
  saving = signal(false);
  msg = signal('');
  editError = signal('');

  pages = signal<LpListItem[]>([]);
  total = signal(0);
  search = ''; statusFilter = ''; sort = 'updated';

  editing = signal<LpDetail | null>(null);

  keywords = signal<LpKeyword[]>([]);
  kwNew = { keyword: '', brief: '', priority: 0 };

  settings = signal<LpSettings | null>(null);

  icons = ['spark', 'shield', 'clock', 'chart', 'music', 'plus', 'heart', 'feather'];

  ngOnInit(): void { this.loadPages(); }

  loadPages(): void {
    this.loading.set(true);
    this.api.adminLpList({ search: this.search, status: this.statusFilter, sort: this.sort, take: 100 }).subscribe({
      next: r => { this.pages.set(r.items); this.total.set(r.total); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  private blankContent(): LpContent {
    return { hero: {}, hook: { chips: [] }, explainer: { paragraphs: [] }, benefitCards: [], band: {}, tips: [], featureRows: [], objections: [], faq: [], finalCta: {} };
  }
  // Ensure every section object/array exists so the editor can bind safely.
  private hydrate(c: LpContent): LpContent {
    c.hero ??= {}; c.hook ??= {}; c.hook.chips ??= []; c.explainer ??= {}; c.explainer.paragraphs ??= [];
    c.benefitCards ??= []; c.band ??= {}; c.tips ??= []; c.featureRows ??= []; c.objections ??= []; c.faq ??= []; c.finalCta ??= {};
    return c;
  }

  newPage(): void {
    this.editError.set(''); this.msg.set('');
    this.editing.set({ id: '', slug: '', status: 'Draft', targetKeyword: '', metaTitle: '', metaDescription: '', noIndex: false, qualityScore: null, generatedByAi: false, content: this.blankContent(), hasOriginal: false, createdAt: '', updatedAt: '', publishedAt: null });
  }

  edit(p: LpListItem): void {
    this.editError.set(''); this.msg.set('');
    this.api.adminLpGet(p.id).subscribe(d => { d.content = this.hydrate(d.content || {}); this.editing.set(d); });
  }

  closeEditor(): void { this.editing.set(null); this.loadPages(); }

  save(): void {
    const e = this.editing(); if (!e) return;
    this.saving.set(true); this.editError.set('');
    const payload: LpUpsert = { slug: e.slug, targetKeyword: e.targetKeyword, metaTitle: e.metaTitle, metaDescription: e.metaDescription, noIndex: e.noIndex, content: e.content };
    const obs = e.id ? this.api.adminLpUpdate(e.id, payload) : this.api.adminLpCreate(payload);
    obs.subscribe({
      next: d => { d.content = this.hydrate(d.content || {}); this.editing.set(d); this.saving.set(false); this.msg.set('Saved.'); setTimeout(() => this.msg.set(''), 2000); },
      error: err => { this.saving.set(false); this.editError.set(err?.error?.error ?? 'Save failed.'); },
    });
  }

  setStatus(p: LpListItem, status: string): void { this.api.adminLpSetStatus(p.id, status).subscribe(() => this.loadPages()); }
  del(p: LpListItem): void { if (confirm(`Delete "${p.metaTitle || p.slug}"? It will 410 for crawlers.`)) this.api.adminLpDelete(p.id).subscribe(() => this.loadPages()); }
  revert(id: string): void { if (confirm('Discard your edits and restore the AI original?')) this.api.adminLpRevert(id).subscribe(d => { d.content = this.hydrate(d.content || {}); this.editing.set(d); this.msg.set('Reverted.'); }); }

  /** Open the live-rendered HTML in a new tab via a Blob URL (no document.write). */
  preview(id: string): void {
    this.api.adminLpPreview(id).subscribe(html => {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  // Keywords
  loadKeywords(): void { this.api.adminLpKeywords().subscribe(k => this.keywords.set(k)); }
  addKeyword(): void { this.api.adminLpCreateKeyword({ keyword: this.kwNew.keyword, brief: this.kwNew.brief || null, priority: this.kwNew.priority }).subscribe(() => { this.kwNew = { keyword: '', brief: '', priority: 0 }; this.loadKeywords(); }); }
  saveKeyword(k: LpKeyword): void { this.api.adminLpUpdateKeyword(k.id, { keyword: k.keyword, brief: k.brief, priority: k.priority, status: k.status }).subscribe(); }
  delKeyword(k: LpKeyword): void { if (confirm(`Remove keyword "${k.keyword}"?`)) this.api.adminLpDeleteKeyword(k.id).subscribe(() => this.loadKeywords()); }

  // Settings
  loadSettings(): void { this.api.adminLpSettings().subscribe(s => this.settings.set(s)); }
  saveSettings(): void { const s = this.settings(); if (!s) return; this.api.adminLpUpdateSettings({ autoGenerateEnabled: s.autoGenerateEnabled, autoPublishEnabled: s.autoPublishEnabled, qualityThreshold: s.qualityThreshold, generateHourLocalEt: s.generateHourLocalEt }).subscribe(r => { this.settings.set(r); this.msg.set('Saved.'); setTimeout(() => this.msg.set(''), 2000); }); }
}
