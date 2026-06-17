import { Component, OnInit, OnDestroy, NgZone, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AdminShellComponent } from './admin-shell.component';
import { ApiService, LpListItem, LpDetail, LpKeyword, LpSettings, LpUpsert, LpContent, PexelsPhoto,
  Vocab, CandidateResult, ResearchBatch } from '../../core/services/api.service';

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
          <button class="lpa-tab" [class.lpa-tab--on]="tab() === 'research'" (click)="tab.set('research'); loadResearch()">Research</button>
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
              <thead><tr><th>Keyword/Topic</th><th>Title</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (p of pages(); track p.id) {
                  <tr>
                    <td class="lpa-kw">{{ p.targetKeyword || '—' }}</td>
                    <td class="lpa-title">{{ p.metaTitle || '—' }}@if (p.noIndex) { <span class="lpa-pill lpa-pill--mute">noindex</span> }</td>
                    <td><span class="lpa-pill" [class.lpa-pill--pub]="p.status==='Published'" [class.lpa-pill--draft]="p.status==='Draft'">{{ p.status }}</span></td>
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

          <div class="lpe-split">
          <div class="lpe-form">

          @if (e.id) {
          <div class="lpa-card lpa-ai">
            <h3>✨ Edit with AI</h3>
            <p class="lpa-hint" style="margin-top:0">Describe a change in plain English. It stays inside the approved template — only the content changes. You review the diff before it's applied.</p>
            <textarea class="lpa-input" rows="2" placeholder="e.g. Add two FAQ items about anxiety journaling, and remove the objections section." [(ngModel)]="aiInstruction"></textarea>
            <div class="lpa-row" style="margin-top:.5rem; flex-wrap:wrap; align-items:center">
              <button class="lpa-btn" [disabled]="aiBusy() || !aiInstruction.trim()" (click)="runAiEdit()">{{ aiBusy() ? 'Thinking…' : 'Propose changes' }}</button>
              @if (e.hasPrevious) { <button class="lpa-link" (click)="undo(e.id)">↩ Undo last edit</button> }
              @for (chip of aiChips; track chip) { <button class="lpa-chip" (click)="aiInstruction = chip">{{ chip }}</button> }
            </div>
            @if (aiError()) { <p class="lpa-err">{{ aiError() }}</p> }
            @if (aiChanges().length) {
              <div class="lpa-diff">
                <div class="lpa-diff__h">Proposed changes — review, then Accept</div>
                @for (c of aiChanges(); track $index) {
                  <div class="lpa-diff__l" [class.lpa-diff__l--add]="c.startsWith('+')" [class.lpa-diff__l--del]="c.startsWith('-')">{{ c }}</div>
                }
                <div class="lpa-row" style="margin-top:.6rem">
                  <button class="lpa-btn" (click)="acceptAiEdit()">Accept changes</button>
                  <button class="lpa-link" (click)="discardAiEdit()">Discard</button>
                </div>
              </div>
            }
          </div>
          }

          <div class="lpa-card">
            <h3>SEO &amp; URL</h3>
            <label class="lpa-f"><span>Target keyword</span><input class="lpa-input" [(ngModel)]="e.targetKeyword"></label>
            <label class="lpa-f"><span>Slug <em>/{{ e.slug }}</em></span><input class="lpa-input" [(ngModel)]="e.slug"></label>
            <label class="lpa-f"><span>Meta title <em>{{ (e.metaTitle||'').length }}/60</em></span><input class="lpa-input" [(ngModel)]="e.metaTitle"></label>
            <label class="lpa-f"><span>Meta description <em>{{ (e.metaDescription||'').length }}/155</em></span><textarea class="lpa-input" rows="2" [(ngModel)]="e.metaDescription"></textarea></label>
            <label class="lpa-check"><input type="checkbox" [(ngModel)]="e.noIndex"> noindex (keep out of search + sitemap)</label>
          </div>

          <div class="lpa-card">
            <h3 id="lp-sec-hero">Hero</h3>
            <label class="lpa-f"><span>Kicker</span><input class="lpa-input" [(ngModel)]="e.content.hero!.kicker"></label>
            <label class="lpa-f"><span>Headline (H1)</span><input class="lpa-input" [(ngModel)]="e.content.hero!.h1"></label>
            <label class="lpa-f"><span>Subhead</span><textarea class="lpa-input" rows="2" [(ngModel)]="e.content.hero!.subhead"></textarea></label>
            <label class="lpa-f"><span>CTA label</span><input class="lpa-input" [(ngModel)]="e.content.hero!.ctaLabel"></label>
          </div>

          <div class="lpa-card">
            <h3 id="lp-sec-hook">Hook</h3>
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
            <h3 id="lp-sec-explainer">Explainer</h3>
            <label class="lpa-f"><span>Kicker</span><input class="lpa-input" [(ngModel)]="e.content.explainer!.kicker"></label>
            <label class="lpa-f"><span>Heading (H2)</span><input class="lpa-input" [(ngModel)]="e.content.explainer!.h2"></label>
            <div class="lpa-arr"><span>Paragraphs</span>
              @for (p of e.content.explainer!.paragraphs!; track $index) {
                <div class="lpa-row"><textarea class="lpa-input" rows="2" [(ngModel)]="e.content.explainer!.paragraphs![$index]"></textarea><button class="lpa-x" (click)="e.content.explainer!.paragraphs!.splice($index,1)">×</button></div>
              }
              <button class="lpa-add" (click)="e.content.explainer!.paragraphs!.push('')">+ paragraph</button>
            </div>
            <label class="lpa-f"><span>Image URL <button type="button" class="lpa-imgbtn" (click)="openImg('explainer')">🔍 Find photo</button></span><input class="lpa-input" [(ngModel)]="e.content.explainer!.imageUrl"></label>
            <label class="lpa-f"><span>Image alt</span><input class="lpa-input" [(ngModel)]="e.content.explainer!.imageAlt"></label>
          </div>

          <div class="lpa-card">
            <h3 id="lp-sec-benefitCards">Benefit cards</h3>
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
            <h3 id="lp-sec-band">Photo band</h3>
            <label class="lpa-f"><span>Heading</span><input class="lpa-input" [(ngModel)]="e.content.band!.heading"></label>
            <label class="lpa-f"><span>Subtext</span><textarea class="lpa-input" rows="2" [(ngModel)]="e.content.band!.subtext"></textarea></label>
            <label class="lpa-f"><span>Background image URL <button type="button" class="lpa-imgbtn" (click)="openImg('band')">🔍 Find photo</button></span><input class="lpa-input" [(ngModel)]="e.content.band!.imageUrl"></label>
          </div>

          <div class="lpa-card">
            <h3 id="lp-sec-tips">Tips</h3>
            @for (t of e.content.tips!; track $index) {
              <div class="lpa-sub"><div class="lpa-row"><input class="lpa-input" placeholder="Title" [(ngModel)]="t.title"><button class="lpa-x" (click)="e.content.tips!.splice($index,1)">×</button></div>
                <textarea class="lpa-input" rows="2" placeholder="Body" [(ngModel)]="t.body"></textarea></div>
            }
            <button class="lpa-add" (click)="e.content.tips!.push({})">+ tip</button>
          </div>

          <div class="lpa-card">
            <h3 id="lp-sec-featureRows">Feature rows</h3>
            @for (r of e.content.featureRows!; track $index) {
              <div class="lpa-sub">
                <div class="lpa-row"><input class="lpa-input" placeholder="Kicker" [(ngModel)]="r.kicker"><input class="lpa-input" placeholder="Heading" [(ngModel)]="r.h2"><button class="lpa-x" (click)="e.content.featureRows!.splice($index,1)">×</button></div>
                <textarea class="lpa-input" rows="2" placeholder="Body" [(ngModel)]="r.body"></textarea>
                <div class="lpa-row"><input class="lpa-input" placeholder="Media URL (screenshot or photo)" [(ngModel)]="r.mediaUrl"><button type="button" class="lpa-x" title="Find photo" (click)="openImg('row:' + $index)">🔍</button><input class="lpa-input" placeholder="Alt" [(ngModel)]="r.mediaAlt"></div>
                <div class="lpa-row"><label class="lpa-check"><input type="checkbox" [(ngModel)]="r.phone"> phone frame</label><label class="lpa-check"><input type="checkbox" [(ngModel)]="r.reverse"> image right</label></div>
              </div>
            }
            <button class="lpa-add" (click)="e.content.featureRows!.push({})">+ row</button>
          </div>

          <div class="lpa-card">
            <h3 id="lp-sec-objections">Objections</h3>
            @for (o of e.content.objections!; track $index) {
              <div class="lpa-sub"><div class="lpa-row"><input class="lpa-input" placeholder="Question" [(ngModel)]="o.q"><button class="lpa-x" (click)="e.content.objections!.splice($index,1)">×</button></div>
                <textarea class="lpa-input" rows="2" placeholder="Answer" [(ngModel)]="o.a"></textarea></div>
            }
            <button class="lpa-add" (click)="e.content.objections!.push({})">+ objection</button>
          </div>

          <div class="lpa-card">
            <h3 id="lp-sec-faq">FAQ</h3>
            @for (q of e.content.faq!; track $index) {
              <div class="lpa-sub"><div class="lpa-row"><input class="lpa-input" placeholder="Question" [(ngModel)]="q.q"><button class="lpa-x" (click)="e.content.faq!.splice($index,1)">×</button></div>
                <textarea class="lpa-input" rows="2" placeholder="Answer" [(ngModel)]="q.a"></textarea></div>
            }
            <button class="lpa-add" (click)="e.content.faq!.push({})">+ question</button>
          </div>

          <div class="lpa-card">
            <h3 id="lp-sec-finalCta">Final CTA</h3>
            <label class="lpa-f"><span>Heading</span><input class="lpa-input" [(ngModel)]="e.content.finalCta!.heading"></label>
            <label class="lpa-f"><span>Subtext</span><input class="lpa-input" [(ngModel)]="e.content.finalCta!.subtext"></label>
            <label class="lpa-f"><span>CTA label</span><input class="lpa-input" [(ngModel)]="e.content.finalCta!.ctaLabel"></label>
          </div>
          </div><!-- /lpe-form -->

          <div class="lpe-preview">
            @if (previewUrl()) {
              <p class="lpe-tip">Click any <strong>text</strong> in the preview to edit it inline · click a <strong>section</strong> to jump to its fields · then <strong>Save</strong>.</p>
              <iframe id="lpe-iframe" class="lpe-frame" [src]="previewUrl()" title="Live preview"></iframe>
            } @else {
              <p class="lpa-muted" style="padding:1rem">Save the page to open the live, click-to-edit preview here.</p>
            }
          </div>
          </div><!-- /lpe-split -->
        }

        <!-- ── KEYWORDS ── -->
        @if (tab() === 'keywords') {
          <div class="lpa-card">
            <h3>Add a keyword</h3>
            <div class="lpa-row"><input class="lpa-input" placeholder="Keyword (e.g. private journaling app)" [(ngModel)]="kwNew.keyword">
              <span class="lpa-seg" title="Build as a landing page or a blog post"><button [class.on]="kwNew.contentType==='page'" (click)="kwNew.contentType='page'">Page</button><button [class.on]="kwNew.contentType==='post'" (click)="kwNew.contentType='post'">Post</button></span>
              <input class="lpa-input lpa-input--sm" type="number" placeholder="Priority" [(ngModel)]="kwNew.priority">
              <button class="lpa-btn" [disabled]="!kwNew.keyword.trim()" (click)="addKeyword()">Add</button></div>
            <textarea class="lpa-input" rows="2" placeholder="Optional brief — angle / audience / must-haves" [(ngModel)]="kwNew.brief"></textarea>
            <p class="lpa-hint">Priority orders the queue — higher generates first (ties: oldest added first). Leave at 0 for first-come order.</p>
            <div class="lpa-row" style="margin-top:.6rem; align-items:center; flex-wrap:wrap">
              <label class="lpa-link" style="cursor:pointer">⬆ Import CSV<input type="file" accept=".csv,text/csv" hidden (change)="importKeywords($event)"></label>
              <span class="lpa-hint" style="margin:0">columns: <code>keyword, brief</code></span>
              @if (importMsg()) { <span class="lpa-ok">{{ importMsg() }}</span> }
              <span class="lpa-spacer"></span>
              <button class="lpa-link" [disabled]="genBusy()" (click)="generateNow()">{{ genBusy() ? 'Generating…' : 'Generate next page now (test)' }}</button>
            </div>
          </div>
          @if (!keywords().length) { <p class="lpa-muted">No keywords queued. Add some above; the 7am worker generates one page per day.</p> }
          @else {
            <table class="lpa-table">
              <thead><tr><th>Keyword</th><th>Type</th><th>Brief</th><th>Priority</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (k of keywords(); track k.id) {
                  <tr>
                    <td>{{ k.keyword }}@if (k.intent) { <span class="lpa-tag lpa-tag--sm">{{ k.intent }}</span> }
                      @if (k.discipline || k.painPoint) { <div class="lpa-kwmeta">{{ k.discipline }}@if (k.discipline && k.painPoint) { · }{{ k.painPoint }}</div> }</td>
                    <td><span class="lpa-seg" title="Landing page or blog post"><button [class.on]="k.contentType==='Page'" (click)="k.contentType='Page'; saveKeyword(k)">Page</button><button [class.on]="k.contentType==='Post'" (click)="k.contentType='Post'; saveKeyword(k)">Post</button></span></td>
                    <td class="lpa-muted lpa-brief">
                      @if (k.brief) { <span [title]="k.brief">{{ k.brief.slice(0, 90) }}{{ k.brief.length > 90 ? '…' : '' }}</span> }
                      @else if (k.status === 'Pending') { <span class="lpa-gen">generating…</span> }
                      @else { — }
                    </td>
                    <td><input class="lpa-input lpa-input--xs" type="number" [(ngModel)]="k.priority" (change)="saveKeyword(k)"></td>
                    <td><span class="lpa-pill" [class.lpa-pill--idea]="k.status==='Idea'">{{ k.status }}</span>@if (k.lastError) { <span class="lpa-err-inline" [title]="k.lastError">!</span> }</td>
                    <td class="lpa-actions">
                      @if (k.status === 'Idea') { <button class="lpa-link" (click)="promote(k)">Queue it</button> }
                      <button class="lpa-link lpa-link--danger" (click)="delKeyword(k)">Delete</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        }

        <!-- ── RESEARCH ── -->
        @if (tab() === 'research') {
          <div class="lpa-card">
            <h3>New research batch</h3>
            <p class="lpa-hint" style="margin-top:0">Pick an angle and let AI brainstorm candidates. Everything is auto-checked against what's already queued, built, or saved as an idea — so you never duplicate over time.</p>
            <label class="lpa-f"><span>Theme / angle</span><input class="lpa-input" placeholder="e.g. Musicians — practice consistency" [(ngModel)]="rTheme"></label>
            <div class="lpa-row" style="flex-wrap:wrap">
              <label class="lpa-f" style="flex:1; min-width:180px"><span>Discipline</span>
                <select class="lpa-input" [(ngModel)]="rDiscipline"><option [ngValue]="null">— any —</option>@for (v of disciplines(); track v.id) { <option [ngValue]="v.value">{{ v.value }}</option> }</select></label>
              <label class="lpa-f" style="flex:1; min-width:180px"><span>Pain-point</span>
                <select class="lpa-input" [(ngModel)]="rPainPoint"><option [ngValue]="null">— any —</option>@for (v of painPoints(); track v.id) { <option [ngValue]="v.value">{{ v.value }}</option> }</select></label>
            </div>
            <label class="lpa-f"><span>Extra direction (optional)</span><input class="lpa-input" placeholder="anything specific to steer the brainstorm" [(ngModel)]="rHints"></label>
            <div class="lpa-row" style="align-items:center; flex-wrap:wrap">
              <button class="lpa-btn" [disabled]="rBusy() || !rTheme.trim()" (click)="brainstorm()">{{ rBusy() ? 'Researching…' : '✨ Research with AI' }}</button>
              @if (settings() && !settings()!.anthropicConfigured) { <span class="lpa-hint" style="margin:0; color:#b45309">Needs the Anthropic key (Settings).</span> }
              @if (rMsg()) { <span class="lpa-ok">{{ rMsg() }}</span> }
            </div>
          </div>

          @if (cands().length) {
            <div class="lpa-card">
              <div class="lpa-row" style="align-items:center; margin-bottom:.4rem">
                <div class="lpa-counts">
                  <span class="lpa-count lpa-count--new">{{ newCount() }} new</span>
                  <span class="lpa-count lpa-count--near">{{ nearCount() }} near-dup</span>
                  <span class="lpa-count lpa-count--dup">{{ dupCount() }} duplicate</span>
                </div>
                <span class="lpa-spacer"></span>
                <span class="lpa-hint" style="margin:0">Unchecked non-duplicates are saved as ideas (remembered, never re-suggested).</span>
              </div>
              @for (c of cands(); track $index) {
                <div class="lpa-cand" [class.lpa-cand--dup]="c.bucket==='Duplicate'">
                  @if (c.bucket !== 'Duplicate') {
                    <input type="checkbox" [(ngModel)]="c.sel">
                  } @else { <span class="lpa-cand__ban">⊘</span> }
                  <div class="lpa-cand__body">
                    <span class="lpa-cand__kw">{{ c.keyword }}</span>
                    @if (c.bucket==='NearDuplicate' && c.matchedKeyword) { <span class="lpa-cand__match">~ like: {{ c.matchedKeyword }}@if (c.matchedSlug) { (built) }</span> }
                    @if (c.bucket==='Duplicate' && c.matchedKeyword) { <span class="lpa-cand__match lpa-cand__match--dup">already: {{ c.matchedSlug ? ('/' + c.matchedSlug) : c.matchedKeyword }}</span> }
                  </div>
                  @if (c.intent) { <span class="lpa-tag">{{ c.intent }}</span> }
                  @if (c.bucket !== 'Duplicate') {
                    <span class="lpa-seg" title="Build this as a landing page or a blog post">
                      <button [class.on]="c.ctype==='page'" (click)="c.ctype='page'">Page</button><button [class.on]="c.ctype==='post'" (click)="c.ctype='post'">Post</button>
                    </span>
                  }
                  <span class="lpa-bk" [class.lpa-bk--new]="c.bucket==='New'" [class.lpa-bk--near]="c.bucket==='NearDuplicate'" [class.lpa-bk--dup]="c.bucket==='Duplicate'">{{ bucketLabel(c.bucket) }}</span>
                </div>
              }
              <div class="lpa-row" style="margin-top:.8rem; align-items:center">
                <button class="lpa-btn" [disabled]="rCommitting()" (click)="commitResearch()">{{ rCommitting() ? 'Adding…' : ('Add ' + selectedCount() + ' to queue') }}</button>
                <span class="lpa-hint" style="margin:0">Briefs auto-generate once queued.</span>
              </div>
            </div>
          }

          <div class="lpa-card">
            <h3>Vocabulary</h3>
            <p class="lpa-hint" style="margin-top:0">The disciplines &amp; pain-points that anchor research. Prune or extend freely.</p>
            <div class="lpa-vocols">
              <div>
                <div class="lpa-voch">Disciplines</div>
                <div class="lpa-chips">@for (v of disciplines(); track v.id) { <span class="lpa-vchip">{{ v.value }}<button (click)="delVocab(v)">×</button></span> }</div>
                <div class="lpa-row" style="margin-top:.4rem"><input class="lpa-input lpa-input--sm" placeholder="add discipline" [(ngModel)]="newDiscipline" (keyup.enter)="addVocab('discipline')"><button class="lpa-add" (click)="addVocab('discipline')">+</button></div>
              </div>
              <div>
                <div class="lpa-voch">Pain-points</div>
                <div class="lpa-chips">@for (v of painPoints(); track v.id) { <span class="lpa-vchip">{{ v.value }}<button (click)="delVocab(v)">×</button></span> }</div>
                <div class="lpa-row" style="margin-top:.4rem"><input class="lpa-input lpa-input--sm" placeholder="add pain-point" [(ngModel)]="newPainPoint" (keyup.enter)="addVocab('painpoint')"><button class="lpa-add" (click)="addVocab('painpoint')">+</button></div>
              </div>
            </div>
          </div>

          @if (batches().length) {
            <div class="lpa-card">
              <h3>Recent research</h3>
              <table class="lpa-table">
                <thead><tr><th>Angle</th><th>Discipline</th><th>Pain-point</th><th>Found</th><th>Added</th><th>When</th></tr></thead>
                <tbody>
                  @for (b of batches(); track b.id) {
                    <tr><td>{{ b.theme }}</td><td class="lpa-muted">{{ b.discipline || '—' }}</td><td class="lpa-muted">{{ b.painPoint || '—' }}</td>
                      <td>{{ b.candidateCount }}</td><td>{{ b.addedCount }}</td><td class="lpa-muted">{{ b.createdAt | date:'MMM d' }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
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
        <!-- ── IMAGE PICKER ── -->
        @if (imgOpen()) {
          <div class="lpa-modal" (click)="imgOpen.set(false)">
            <div class="lpa-modal__box" (click)="$event.stopPropagation()">
              <div class="lpa-row"><input class="lpa-input" placeholder="Search free photos (Pexels)…" [(ngModel)]="imgQuery" (keyup.enter)="searchImg()"><button class="lpa-btn" (click)="searchImg()">Search</button><button class="lpa-x" (click)="imgOpen.set(false)">×</button></div>
              @if (imgBusy()) { <p class="lpa-muted">Working…</p> }
              <div class="lpa-imggrid">
                @for (ph of imgResults(); track ph.id) {
                  <button class="lpa-imgcard" [disabled]="imgBusy()" (click)="chooseImg(ph)"><img [src]="ph.thumbUrl" [alt]="ph.alt" loading="lazy"><span>{{ ph.photographer }}</span></button>
                }
              </div>
              @if (!imgResults().length && !imgBusy()) { <p class="lpa-muted">Type a search and press enter. Photos are from Pexels (free, commercial use). Requires the Pexels API key.</p> }
            </div>
          </div>
        }
      </div>
    </app-admin-shell>
  `,
  styles: [`
    .lpa { max-width: 1240px; margin: 0 auto; padding: 1.5rem; }
    .lpe-split { display: flex; gap: 1.25rem; align-items: flex-start; }
    .lpe-form { flex: 1 1 440px; min-width: 0; }
    .lpe-preview { flex: 1 1 540px; position: sticky; top: 1rem; align-self: flex-start; }
    .lpe-tip { font-size: .8rem; color: #0a6b7d; margin: 0 0 .5rem; background: #eef9fb; border: 1px solid #bdeef5; border-radius: 8px; padding: .5rem .75rem; }
    .lpe-frame { width: 100%; height: calc(100vh - 170px); min-height: 480px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; }
    .lpe-flash { animation: lpe-flash 1.2s ease; border-radius: 4px; }
    @keyframes lpe-flash { 0% { background: rgba(18,196,227,.22); } 100% { background: transparent; } }
    @media (max-width: 1080px) { .lpe-split { flex-direction: column; } .lpe-preview { position: static; width: 100%; } .lpe-frame { height: 72vh; } }
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
    .lpa-kw { color: #374151; }
    .lpa-actions { white-space: nowrap; text-align: right; }
    .lpa-muted { color: #9ca3af; }
    .lpa-hint { font-size: .8rem; color: #9ca3af; margin: .5rem 0 0; }
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
    .lpa-imgbtn { background: #eef9fb; border: 1px solid #bdeef5; color: #0a93ab; border-radius: 8px; padding: .15rem .5rem; font-size: .75rem; font-weight: 700; cursor: pointer; margin-left: .5rem; }
    .lpa-modal { position: fixed; inset: 0; background: rgba(12,14,19,.5); display: grid; place-items: center; z-index: 1000; padding: 1.5rem; }
    .lpa-modal__box { background: #fff; border-radius: 16px; padding: 1.25rem; width: 100%; max-width: 720px; max-height: 84vh; overflow: auto; }
    .lpa-imggrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .6rem; margin-top: .8rem; }
    .lpa-imgcard { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; background: #fff; cursor: pointer; padding: 0; text-align: left; }
    .lpa-imgcard img { width: 100%; height: 110px; object-fit: cover; display: block; }
    .lpa-imgcard span { display: block; font-size: .7rem; color: #9ca3af; padding: .3rem .5rem; }
    .lpa-imgcard:hover { border-color: #12C4E3; }
    .lpa-ai { border-color: #bdeef5; background: #f7fdfe; }
    .lpa-chip { background: #fff; border: 1px solid #e5e7eb; border-radius: 999px; padding: .25rem .7rem; font-size: .78rem; color: #4b5563; cursor: pointer; }
    .lpa-chip:hover { border-color: #12C4E3; color: #0a93ab; }
    .lpa-diff { margin-top: .8rem; border: 1px solid #e5e7eb; border-radius: 10px; padding: .75rem; background: #fff; }
    .lpa-diff__h { font-size: .75rem; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; margin-bottom: .5rem; }
    .lpa-diff__l { font-size: .85rem; padding: .2rem 0; color: #374151; }
    .lpa-diff__l--add { color: #047857; } .lpa-diff__l--del { color: #b91c1c; }
    .lpa-counts { display: flex; gap: .5rem; }
    .lpa-count { font-size: .78rem; font-weight: 700; padding: .15rem .55rem; border-radius: 999px; }
    .lpa-count--new { background: #eaf3de; color: #27500a; } .lpa-count--near { background: #faeeda; color: #633806; } .lpa-count--dup { background: #fcebeb; color: #791f1f; }
    .lpa-cand { display: flex; align-items: center; gap: .6rem; padding: .5rem .1rem; border-bottom: 1px solid #f1f1f1; }
    .lpa-cand--dup { opacity: .6; }
    .lpa-cand__ban { width: 16px; text-align: center; color: #a32d2d; }
    .lpa-cand__body { flex: 1; min-width: 0; }
    .lpa-cand__kw { font-size: .9375rem; }
    .lpa-cand__match { display: block; font-size: .75rem; color: #854f0b; margin-top: .1rem; }
    .lpa-cand__match--dup { color: #a32d2d; }
    .lpa-tag { font-size: .7rem; font-weight: 700; color: #6b7280; background: #eef0f2; padding: .12rem .5rem; border-radius: 999px; white-space: nowrap; }
    .lpa-tag--sm { margin-left: .4rem; font-size: .65rem; padding: .05rem .4rem; }
    .lpa-bk { font-size: .68rem; font-weight: 700; padding: .12rem .5rem; border-radius: 999px; white-space: nowrap; }
    .lpa-bk--new { background: #eaf3de; color: #27500a; } .lpa-bk--near { background: #faeeda; color: #633806; } .lpa-bk--dup { background: #fcebeb; color: #791f1f; }
    .lpa-vocols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
    @media (max-width: 700px) { .lpa-vocols { grid-template-columns: 1fr; } }
    .lpa-voch { font-size: .8125rem; font-weight: 700; color: #374151; margin-bottom: .5rem; }
    .lpa-chips { display: flex; flex-wrap: wrap; gap: .35rem; }
    .lpa-vchip { display: inline-flex; align-items: center; gap: .3rem; background: #f3f4f6; border-radius: 999px; padding: .2rem .3rem .2rem .6rem; font-size: .8rem; color: #374151; }
    .lpa-vchip button { background: none; border: none; color: #9ca3af; cursor: pointer; font-weight: 700; font-size: .9rem; line-height: 1; padding: 0 .2rem; }
    .lpa-vchip button:hover { color: #e11d48; }
    .lpa-kwmeta { font-size: .72rem; color: #9ca3af; margin-top: .1rem; }
    .lpa-brief { max-width: 320px; } .lpa-gen { color: #0a93ab; font-style: italic; }
    .lpa-pill--idea { background: #ede9fe; color: #6d28d9; }
    .lpa-seg { display: inline-flex; border: 1px solid #d1d5db; border-radius: 999px; overflow: hidden; flex: none; }
    .lpa-seg button { border: none; background: #fff; color: #6b7280; font-size: .72rem; font-weight: 700; padding: .25rem .6rem; cursor: pointer; }
    .lpa-seg button.on { background: #12C4E3; color: #053b45; }
  `]
})
export class AdminLandingComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private zone = inject(NgZone);
  private sanitizer = inject(DomSanitizer);
  private readonly previewOrigin = 'https://www.creatorcompanionapp.com';
  previewUrl = signal<SafeResourceUrl | null>(null);

  tab = signal<'pages' | 'research' | 'keywords' | 'settings'>('pages');
  loading = signal(false);
  saving = signal(false);
  msg = signal('');
  editError = signal('');

  // Edit-with-AI
  aiInstruction = '';
  aiBusy = signal(false);
  aiError = signal('');
  aiChanges = signal<string[]>([]);
  private aiProposedContent: LpContent | null = null;
  aiChips = ['Make the hook punchier', 'Rewrite for visual artists', 'Add 3 more FAQ items', 'Shorten the explainer'];

  // Research
  rTheme = ''; rDiscipline: string | null = null; rPainPoint: string | null = null; rHints = '';
  rBusy = signal(false); rCommitting = signal(false); rMsg = signal('');
  cands = signal<Array<CandidateResult & { sel: boolean; ctype: 'page' | 'post' }>>([]);
  newCount = signal(0); nearCount = signal(0); dupCount = signal(0);
  disciplines = signal<Vocab[]>([]); painPoints = signal<Vocab[]>([]);
  newDiscipline = ''; newPainPoint = '';
  batches = signal<ResearchBatch[]>([]);

  pages = signal<LpListItem[]>([]);
  total = signal(0);
  search = ''; statusFilter = ''; sort = 'updated';

  editing = signal<LpDetail | null>(null);

  keywords = signal<LpKeyword[]>([]);
  kwNew = { keyword: '', brief: '', priority: 0, contentType: 'page' as 'page' | 'post' };

  settings = signal<LpSettings | null>(null);

  icons = ['spark', 'shield', 'clock', 'chart', 'music', 'plus', 'heart', 'feather'];

  // Image picker
  imgOpen = signal(false);
  imgQuery = '';
  imgResults = signal<PexelsPhoto[]>([]);
  imgBusy = signal(false);
  private imgTargetKey = '';

  genBusy = signal(false);
  importMsg = signal('');

  ngOnInit(): void {
    this.loadPages();
    window.addEventListener('message', this.onMessage);
  }
  ngOnDestroy(): void { window.removeEventListener('message', this.onMessage); }

  // ── Live-preview bridge (messages from the edit-mode iframe) ──────────
  private onMessage = (e: MessageEvent): void => {
    if (e.origin !== this.previewOrigin) return;
    const d = e.data || {};
    this.zone.run(() => {
      if (d.type === 'lp-edit') this.applyInline(d.path, d.value);
      else if (d.type === 'lp-focus') this.focusSection(d.section);
    });
  };
  private applyInline(path: string, value: string): void {
    const e = this.editing(); if (!e) return;
    this.setByPath(e.content as Record<string, unknown>, path, value);
  }
  private setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const segs = path.split('.');
    let cur: any = obj;
    for (let i = 0; i < segs.length - 1; i++) {
      const k: any = /^\d+$/.test(segs[i]) ? +segs[i] : segs[i];
      if (cur[k] == null) return;
      cur = cur[k];
    }
    const last: any = /^\d+$/.test(segs[segs.length - 1]) ? +segs[segs.length - 1] : segs[segs.length - 1];
    cur[last] = value;
  }
  private focusSection(section: string): void {
    const el = document.getElementById('lp-sec-' + section);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('lpe-flash');
    setTimeout(() => el.classList.remove('lpe-flash'), 1200);
  }
  private loadPreview(id: string): void {
    this.api.adminLpPreview(id).subscribe(r =>
      this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(r.url + '&edit=1')));
  }
  private reloadPreview(): void {
    const e = this.editing();
    if (!this.previewUrl() && e?.id) { this.loadPreview(e.id); return; }
    const f = document.getElementById('lpe-iframe') as HTMLIFrameElement | null;
    f?.contentWindow?.postMessage({ type: 'lp-reload' }, this.previewOrigin);
  }

  importKeywords(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.api.adminLpImportKeywords(file).subscribe({
      next: r => { this.importMsg.set(`Imported ${r.imported}.`); this.loadKeywords(); setTimeout(() => this.importMsg.set(''), 4000); },
      error: () => this.importMsg.set('Import failed.'),
    });
    input.value = '';
  }

  openImg(target: string): void { this.imgTargetKey = target; this.imgResults.set([]); this.imgQuery = ''; this.imgOpen.set(true); }
  searchImg(): void {
    if (!this.imgQuery.trim()) return;
    this.imgBusy.set(true);
    this.api.adminLpSearchImages(this.imgQuery).subscribe({ next: r => { this.imgResults.set(r); this.imgBusy.set(false); }, error: () => this.imgBusy.set(false) });
  }
  chooseImg(ph: PexelsPhoto): void {
    this.imgBusy.set(true);
    this.api.adminLpUseImage(ph.fullUrl).subscribe({ next: r => { this.applyImg(r.url); this.imgBusy.set(false); this.imgOpen.set(false); }, error: () => this.imgBusy.set(false) });
  }
  private applyImg(url: string): void {
    const e = this.editing(); if (!e) return;
    const c = e.content;
    if (this.imgTargetKey === 'explainer') { c.explainer ??= {}; c.explainer.imageUrl = url; }
    else if (this.imgTargetKey === 'band') { c.band ??= {}; c.band.imageUrl = url; }
    else if (this.imgTargetKey.startsWith('row:')) {
      const i = +this.imgTargetKey.slice(4);
      if (c.featureRows && c.featureRows[i]) c.featureRows[i].mediaUrl = url;
    }
  }

  generateNow(): void {
    this.genBusy.set(true);
    this.api.adminLpGenerateNow().subscribe({
      next: r => { this.genBusy.set(false); this.msg.set(r.message); setTimeout(() => this.msg.set(''), 6000); this.loadKeywords(); },
      error: () => { this.genBusy.set(false); this.msg.set('Generation failed.'); },
    });
  }

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
    this.editError.set(''); this.msg.set(''); this.previewUrl.set(null);
    this.editing.set({ id: '', slug: '', status: 'Draft', targetKeyword: '', metaTitle: '', metaDescription: '', noIndex: false, qualityScore: null, generatedByAi: false, content: this.blankContent(), hasOriginal: false, hasPrevious: false, createdAt: '', updatedAt: '', publishedAt: null });
  }

  edit(p: LpListItem): void {
    this.editError.set(''); this.msg.set(''); this.previewUrl.set(null);
    this.api.adminLpGet(p.id).subscribe(d => { d.content = this.hydrate(d.content || {}); this.editing.set(d); this.loadPreview(d.id); });
  }

  closeEditor(): void { this.editing.set(null); this.previewUrl.set(null); this.loadPages(); }

  save(): void {
    const e = this.editing(); if (!e) return;
    this.saving.set(true); this.editError.set('');
    const payload: LpUpsert = { slug: e.slug, targetKeyword: e.targetKeyword, metaTitle: e.metaTitle, metaDescription: e.metaDescription, noIndex: e.noIndex, content: e.content };
    const obs = e.id ? this.api.adminLpUpdate(e.id, payload) : this.api.adminLpCreate(payload);
    obs.subscribe({
      next: d => { d.content = this.hydrate(d.content || {}); this.editing.set(d); this.saving.set(false); this.msg.set('Saved.'); setTimeout(() => this.msg.set(''), 2000); this.reloadPreview(); },
      error: err => { this.saving.set(false); this.editError.set(err?.error?.error ?? 'Save failed.'); },
    });
  }

  setStatus(p: LpListItem, status: string): void { this.api.adminLpSetStatus(p.id, status).subscribe(() => this.loadPages()); }
  del(p: LpListItem): void { if (confirm(`Delete "${p.metaTitle || p.slug}"? It will 410 for crawlers.`)) this.api.adminLpDelete(p.id).subscribe(() => this.loadPages()); }
  revert(id: string): void { if (confirm('Discard your edits and restore the AI original?')) this.api.adminLpRevert(id).subscribe(d => { d.content = this.hydrate(d.content || {}); this.editing.set(d); this.msg.set('Reverted.'); }); }

  /** Open the page on the marketing domain (signed preview token) so all assets resolve. */
  preview(id: string): void {
    this.api.adminLpPreview(id).subscribe(r => window.open(r.url, '_blank'));
  }

  // Keywords
  loadKeywords(): void { this.api.adminLpKeywords().subscribe(k => this.keywords.set(k)); }
  addKeyword(): void { this.api.adminLpCreateKeyword({ keyword: this.kwNew.keyword, brief: this.kwNew.brief || null, priority: this.kwNew.priority, contentType: this.kwNew.contentType }).subscribe(() => { this.kwNew = { keyword: '', brief: '', priority: 0, contentType: 'page' }; this.loadKeywords(); }); }
  saveKeyword(k: LpKeyword): void { this.api.adminLpUpdateKeyword(k.id, { keyword: k.keyword, brief: k.brief, priority: k.priority, status: k.status, contentType: k.contentType }).subscribe(); }
  delKeyword(k: LpKeyword): void { if (confirm(`Remove keyword "${k.keyword}"?`)) this.api.adminLpDeleteKeyword(k.id).subscribe(() => this.loadKeywords()); }

  // ── Edit with AI ──────────────────────────────────────────────────
  runAiEdit(): void {
    const e = this.editing(); if (!e?.id || !this.aiInstruction.trim()) return;
    this.aiBusy.set(true); this.aiError.set(''); this.aiChanges.set([]); this.aiProposedContent = null;
    this.api.adminLpAiEdit(e.id, this.aiInstruction.trim()).subscribe({
      next: p => { this.aiBusy.set(false); this.aiProposedContent = p.content; this.aiChanges.set(p.changes.length ? p.changes : ['Updated the page content.']); },
      error: err => { this.aiBusy.set(false); this.aiError.set(err?.error?.error ?? 'Could not generate that edit.'); },
    });
  }
  acceptAiEdit(): void {
    const e = this.editing(); if (!e || !this.aiProposedContent) return;
    e.content = this.hydrate(this.aiProposedContent);
    this.editing.set({ ...e });
    this.discardAiEdit();
    this.aiInstruction = '';
    this.save();   // persists (snapshots previous for undo) + reloads the live preview
  }
  discardAiEdit(): void { this.aiChanges.set([]); this.aiProposedContent = null; }
  undo(id: string): void {
    this.api.adminLpUndo(id).subscribe(d => { d.content = this.hydrate(d.content || {}); this.editing.set(d); this.msg.set('Undid last edit.'); setTimeout(() => this.msg.set(''), 2500); this.reloadPreview(); });
  }

  // ── Research ──────────────────────────────────────────────────────
  loadResearch(): void {
    this.api.adminLpVocab().subscribe(v => { this.disciplines.set(v.disciplines); this.painPoints.set(v.painPoints); });
    this.api.adminLpBatches().subscribe(b => this.batches.set(b));
    if (!this.settings()) this.loadSettings();
  }
  brainstorm(): void {
    if (!this.rTheme.trim()) return;
    this.rBusy.set(true); this.rMsg.set(''); this.cands.set([]);
    this.api.adminLpBrainstorm({ theme: this.rTheme.trim(), discipline: this.rDiscipline, painPoint: this.rPainPoint, hints: this.rHints || null }).subscribe({
      next: r => {
        this.rBusy.set(false);
        this.cands.set(r.candidates.map(c => ({ ...c, sel: c.bucket === 'New', ctype: this.suggestType(c.intent) })));
        this.newCount.set(r.newCount); this.nearCount.set(r.nearCount); this.dupCount.set(r.dupCount);
        if (!r.candidates.length) this.rMsg.set('No candidates came back — try a different angle or check the Anthropic key.');
      },
      error: () => { this.rBusy.set(false); this.rMsg.set('Research failed.'); },
    });
  }
  bucketLabel(b: string): string { return b === 'New' ? 'new' : b === 'NearDuplicate' ? 'near-dup' : 'duplicate'; }
  selectedCount(): number { return this.cands().filter(c => c.sel && c.bucket !== 'Duplicate').length; }
  /** Intent is only a hint — informational/method usually reads as a blog post; commercial as a landing page. */
  private suggestType(intent: string | null): 'page' | 'post' { return intent === 'commercial' || intent === 'navigational' ? 'page' : 'post'; }
  commitResearch(): void {
    const items = this.cands().filter(c => c.bucket !== 'Duplicate')
      .map(c => ({ keyword: c.keyword, intent: c.intent, action: (c.sel ? 'queue' : 'idea') as 'queue' | 'idea', contentType: c.ctype }));
    if (!items.length) { this.rMsg.set('Nothing to add.'); return; }
    this.rCommitting.set(true);
    this.api.adminLpCommitResearch({ theme: this.rTheme.trim(), method: 'ai', discipline: this.rDiscipline, painPoint: this.rPainPoint, notes: null, items }).subscribe({
      next: r => {
        this.rCommitting.set(false); this.cands.set([]);
        this.rMsg.set(`Queued ${r.queued}, saved ${r.ideas} as ideas${r.skippedAsDup ? `, skipped ${r.skippedAsDup} duplicate` : ''}.`);
        this.api.adminLpBatches().subscribe(b => this.batches.set(b));
      },
      error: () => { this.rCommitting.set(false); this.rMsg.set('Could not add those.'); },
    });
  }
  addVocab(kind: 'discipline' | 'painpoint'): void {
    const value = (kind === 'discipline' ? this.newDiscipline : this.newPainPoint).trim();
    if (!value) return;
    this.api.adminLpAddVocab(kind, value).subscribe(() => { if (kind === 'discipline') this.newDiscipline = ''; else this.newPainPoint = ''; this.loadResearch(); });
  }
  delVocab(v: Vocab): void { this.api.adminLpDeleteVocab(v.id).subscribe(() => this.loadResearch()); }
  promote(k: LpKeyword): void {
    this.api.adminLpUpdateKeyword(k.id, { keyword: k.keyword, brief: k.brief, priority: k.priority, status: 'Pending' }).subscribe(() => this.loadKeywords());
  }

  // Settings
  loadSettings(): void { this.api.adminLpSettings().subscribe(s => this.settings.set(s)); }
  saveSettings(): void { const s = this.settings(); if (!s) return; this.api.adminLpUpdateSettings({ autoGenerateEnabled: s.autoGenerateEnabled, autoPublishEnabled: s.autoPublishEnabled, qualityThreshold: s.qualityThreshold, generateHourLocalEt: s.generateHourLocalEt }).subscribe(r => { this.settings.set(r); this.msg.set('Saved.'); setTimeout(() => this.msg.set(''), 2000); }); }
}
