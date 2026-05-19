import { Component, inject, signal, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AdminShellComponent } from './admin-shell.component';

const TEMPLATES = [
  { key: 'welcome', label: 'Welcome Email', description: 'Sent to new users immediately after registration.' }
];

@Component({
  selector: 'app-admin-emails',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminShellComponent],
  template: `
    <app-admin-shell active="emails">
      <div class="emails-layout">

        <!-- Template list sidebar -->
        <div class="template-list">
          @for (t of templates; track t.key) {
            <button class="template-item"
                    [class.template-item--active]="activeKey() === t.key"
                    (click)="selectTemplate(t.key)">
              <span class="template-item__label">{{ t.label }}</span>
              <span class="template-item__desc">{{ t.description }}</span>
            </button>
          }
        </div>

        <!-- Editor -->
        <div class="editor-panel card">
          @if (loading()) {
            <p class="text-muted">Loading…</p>
          } @else {
            <div class="editor-header">
              <h2>{{ activeTemplate()?.label }}</h2>
              <p class="text-muted text-sm">{{ activeTemplate()?.description }}</p>
            </div>

            <div class="field" style="margin-bottom:1rem">
              <label>Subject line</label>
              <input type="text" [(ngModel)]="subject" placeholder="Email subject" />
            </div>

            <div class="field">
              <label>Body content</label>
              <p class="text-muted text-sm" style="margin-bottom:.5rem">
                Use <code>&#123;username&#125;</code> or <code>&#123;displayName&#125;</code>
                to insert the recipient's first name.
              </p>

              <!-- Formatting toolbar -->
              <div class="toolbar">
                <button type="button" class="toolbar-btn" title="Bold" (click)="format('bold')"><strong>B</strong></button>
                <button type="button" class="toolbar-btn" title="Italic" (click)="format('italic')"><em>I</em></button>
                <button type="button" class="toolbar-btn toolbar-btn--text" title="Heading 2" (click)="format('h2')">H2</button>
                <button type="button" class="toolbar-btn toolbar-btn--text" title="Heading 3" (click)="format('h3')">H3</button>
                <button type="button" class="toolbar-btn toolbar-btn--text" title="Bullet list" (click)="format('ul')">• List</button>
                <button type="button" class="toolbar-btn toolbar-btn--text" title="Normal paragraph" (click)="format('p')">¶ Normal</button>
              </div>

              <div #editor
                   class="rich-editor"
                   contenteditable="true"
                   (input)="onEditorInput()"
                   (keydown)="onEditorKeydown($event)">
              </div>
            </div>

            @if (!isCustom() && !loading()) {
              <p class="text-muted text-sm" style="margin-top:.5rem">
                Currently using the built-in default. Edit and save to
                customise.
              </p>
            }

            <div class="editor-footer">
              @if (saved())     { <span class="action-msg text-success">Saved!</span> }
              @if (saveError()) { <span class="action-msg text-danger">Failed to save.</span> }
              @if (testSent())  { <span class="action-msg text-success">Test sent to {{ testSentTo() }}.</span> }
              @if (testError()) { <span class="action-msg text-danger">Test failed: {{ testError() }}</span> }

              <button class="btn btn--secondary"
                      [disabled]="sendingTest() || saving()"
                      (click)="sendTest()"
                      title="Sends the SAVED template to your own admin email">
                {{ sendingTest() ? 'Sending…' : 'Send test to me' }}
              </button>
              <button class="btn btn--primary" [disabled]="saving()" (click)="save()">
                {{ saving() ? 'Saving…' : 'Save template' }}
              </button>
            </div>
          }
        </div>
      </div>
    </app-admin-shell>
  `,
  styles: [`
    /* Two-column emails-layout. The shell already provides the page
       container + padding, so this drops its own outer padding/
       max-width to avoid double-spacing. */
    .emails-layout {
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: 1.5rem;
    }
    @media (max-width: 720px) {
      .emails-layout { grid-template-columns: 1fr; }
    }

    .template-list {
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }

    .template-item {
      background: var(--surface, #fff);
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 8px;
      padding: .75rem 1rem;
      text-align: left;
      cursor: pointer;
      transition: border-color .15s;
      width: 100%;
    }
    .template-item:hover { border-color: var(--color-accent); }
    .template-item--active {
      border-color: var(--color-accent);
      background: var(--color-accent-light);
    }
    .template-item__label { display: block; font-weight: 600; font-size: .9rem; }
    .template-item__desc  { display: block; font-size: .8rem; color: var(--text-muted, #6b7280); margin-top: .2rem; }

    .editor-panel { padding: 1.5rem; }
    .editor-header { margin-bottom: 1.5rem; }
    .editor-header h2 { margin: 0 0 .25rem; }

    .toolbar {
      display: flex;
      gap: .25rem;
      padding: .4rem .5rem;
      background: var(--bg, #f9fafb);
      border: 1px solid var(--border, #e5e7eb);
      border-bottom: none;
      border-radius: 6px 6px 0 0;
    }
    .toolbar-btn {
      background: none;
      border: 1px solid transparent;
      border-radius: 4px;
      padding: .25rem .5rem;
      cursor: pointer;
      font-size: .875rem;
      color: var(--text, #111);
      line-height: 1;
      min-width: 28px;
    }
    .toolbar-btn:hover { background: var(--surface, #fff); border-color: var(--border, #e5e7eb); }
    .toolbar-btn--text { font-size: .8rem; font-weight: 600; }

    .rich-editor {
      min-height: 280px;
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 0 0 6px 6px;
      padding: .75rem 1rem;
      outline: none;
      font-family: var(--font-sans);
      font-size: .9375rem;
      line-height: 1.6;
      color: var(--text, #111);
    }
    .rich-editor:focus { border-color: var(--color-accent); }
    .rich-editor h2 { font-size: 1.2rem; margin: .75rem 0 .25rem; }
    .rich-editor h3 { font-size: 1rem; margin: .75rem 0 .25rem; }
    .rich-editor p  { margin: .4rem 0; }
    .rich-editor ul { padding-left: 1.5rem; margin: .4rem 0; }

    .editor-footer {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 1.25rem;
      justify-content: flex-end;
    }
    .action-msg { font-size: .875rem; }

    code {
      background: var(--bg, #f3f4f6);
      padding: .1rem .3rem;
      border-radius: 3px;
      font-size: .85rem;
    }
  `]
})
export class AdminEmailsComponent implements OnInit {
  private api = inject(ApiService);
  @ViewChild('editor') editorRef!: ElementRef<HTMLDivElement>;

  templates = TEMPLATES;
  activeKey   = signal('welcome');
  loading     = signal(true);
  saving      = signal(false);
  saved       = signal(false);
  saveError   = signal(false);
  // Tracks whether the loaded template is a custom-saved row or the
  // built-in default. UI uses this to show "Currently using built-in
  // default" — without it admins thought the editor was broken when
  // it was just unedited.
  isCustom    = signal(false);
  // Test-send state. Separate signals from save() so a failed test
  // doesn't clobber a successful save banner and vice versa.
  sendingTest = signal(false);
  testSent    = signal(false);
  testSentTo  = signal('');
  testError   = signal<string | null>(null);

  subject = '';

  activeTemplate() {
    return TEMPLATES.find(t => t.key === this.activeKey());
  }

  ngOnInit() {
    this.loadTemplate('welcome');
  }

  selectTemplate(key: string) {
    this.activeKey.set(key);
    this.loadTemplate(key);
  }

  private loadTemplate(key: string) {
    this.loading.set(true);
    this.saved.set(false);
    this.saveError.set(false);
    this.testSent.set(false);
    this.testError.set(null);
    this.api.adminGetEmailTemplate(key).subscribe({
      next: t => {
        // Backend now returns the built-in default when no custom
        // row exists, with `isCustom=false`. Pre-populating the
        // editor with default content means admins can SEE what's
        // being sent today and edit from there, instead of staring
        // at an empty form and assuming the email is broken.
        this.subject = t.subject ?? '';
        this.isCustom.set(!!t.isCustom);
        this.loading.set(false);
        setTimeout(() => {
          if (this.editorRef) {
            this.editorRef.nativeElement.innerHTML = t.htmlContent ?? '';
          }
        });
      },
      error: () => {
        // True 404 only if backend has no default for this key either.
        this.subject = '';
        this.isCustom.set(false);
        this.loading.set(false);
        setTimeout(() => {
          if (this.editorRef) this.editorRef.nativeElement.innerHTML = '';
        });
      }
    });
  }

  sendTest() {
    this.testSent.set(false);
    this.testError.set(null);
    this.sendingTest.set(true);
    this.api.adminSendTestEmail(this.activeKey()).subscribe({
      next: r => {
        this.sendingTest.set(false);
        this.testSent.set(true);
        this.testSentTo.set(r.to);
        // Auto-clear the success banner so it doesn't sit forever.
        // Errors stay until the admin retries — they need to read them.
        setTimeout(() => this.testSent.set(false), 6000);
      },
      error: err => {
        this.sendingTest.set(false);
        // The backend returns 500 with { error: "<resend message>" }
        // for delivery failures — surface that verbatim so the admin
        // can debug (bad API key, unverified domain, rate-limit, etc).
        const msg = err?.error?.error ?? err?.message ?? 'Unknown error';
        this.testError.set(msg);
      }
    });
  }

  onEditorInput() {}

  onEditorKeydown(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
    }
  }

  format(cmd: string) {
    const el = this.editorRef?.nativeElement;
    if (!el) return;
    el.focus();
    switch (cmd) {
      case 'bold':   document.execCommand('bold', false); break;
      case 'italic': document.execCommand('italic', false); break;
      case 'ul':     document.execCommand('insertUnorderedList', false); break;
      case 'h2':     document.execCommand('formatBlock', false, 'h2'); break;
      case 'h3':     document.execCommand('formatBlock', false, 'h3'); break;
      case 'p':      document.execCommand('formatBlock', false, 'p'); break;
    }
  }

  save() {
    const html = this.editorRef?.nativeElement.innerHTML ?? '';
    this.saving.set(true);
    this.saved.set(false);
    this.saveError.set(false);
    this.api.adminSaveEmailTemplate(this.activeKey(), this.subject, html).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: () => {
        this.saving.set(false);
        this.saveError.set(true);
      }
    });
  }
}
