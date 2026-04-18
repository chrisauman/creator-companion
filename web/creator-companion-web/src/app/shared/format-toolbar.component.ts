import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor } from '@tiptap/core';

@Component({
  selector: 'app-format-toolbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="format-toolbar" role="toolbar" aria-label="Text formatting">

      <button type="button" class="tb-btn"
        [class.tb-btn--active]="isActive('bold')"
        (click)="run('bold')"
        [disabled]="disabled"
        title="Bold (Ctrl+B)">
        <strong>B</strong>
      </button>

      <button type="button" class="tb-btn tb-btn--italic"
        [class.tb-btn--active]="isActive('italic')"
        (click)="run('italic')"
        [disabled]="disabled"
        title="Italic (Ctrl+I)">
        <em>I</em>
      </button>

      <button type="button" class="tb-btn"
        [class.tb-btn--active]="isActive('heading')"
        (click)="run('h2')"
        [disabled]="disabled"
        title="Heading 2">
        H2
      </button>

      <span class="tb-divider"></span>

      <button type="button" class="tb-btn"
        [class.tb-btn--active]="isActive('bulletList')"
        (click)="run('bullet')"
        [disabled]="disabled"
        title="Bullet list">
        • List
      </button>

      <button type="button" class="tb-btn"
        [class.tb-btn--active]="isActive('orderedList')"
        (click)="run('numbered')"
        [disabled]="disabled"
        title="Numbered list">
        1. List
      </button>

    </div>
  `,
  styles: [`
    .format-toolbar {
      display: flex;
      align-items: center;
      gap: .125rem;
      padding: .3125rem .25rem;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      margin-bottom: .75rem;
      flex-wrap: wrap;
    }

    .tb-btn {
      display: inline-flex; align-items: center; justify-content: center;
      padding: .25rem .5rem;
      border: none; border-radius: 5px;
      background: transparent;
      color: var(--color-text-2);
      font-family: var(--font-sans, system-ui);
      font-size: .8125rem;
      line-height: 1;
      cursor: pointer;
      white-space: nowrap;
      transition: background .1s, color .1s;

      strong { font-weight: 700; font-size: .9rem; }
      &--italic em { font-style: italic; font-size: .9rem; }

      &:hover:not(:disabled) {
        background: var(--color-accent-light);
        color: var(--color-accent-dark);
      }
      &--active {
        background: var(--color-accent-light);
        color: var(--color-accent-dark);
        font-weight: 600;
      }
      &:disabled { opacity: .4; cursor: not-allowed; }
    }

    .tb-divider {
      display: inline-block;
      width: 1px; height: 18px;
      background: var(--color-border);
      margin: 0 .25rem;
      flex-shrink: 0;
    }
  `]
})
export class FormatToolbarComponent {
  /** TipTap Editor instance passed from the parent. */
  @Input() editor: Editor | null = null;
  /** Incremented by the parent on every editor update/selection change — triggers active-state re-evaluation. */
  @Input() version = 0;
  @Input() disabled = false;

  run(type: 'bold' | 'italic' | 'h2' | 'bullet' | 'numbered'): void {
    if (!this.editor) return;
    const chain = this.editor.chain().focus();
    switch (type) {
      case 'bold':     chain.toggleBold().run(); break;
      case 'italic':   chain.toggleItalic().run(); break;
      case 'h2':       chain.toggleHeading({ level: 2 }).run(); break;
      case 'bullet':   chain.toggleBulletList().run(); break;
      case 'numbered': chain.toggleOrderedList().run(); break;
    }
  }

  isActive(type: string, options?: object): boolean {
    return this.editor?.isActive(type, options) ?? false;
  }
}
