import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, AfterViewInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';

/**
 * WYSIWYG editor for the blog post body. Wraps TipTap with the post schema:
 * H2/H3 (the post title is the page's only H1), bold/italic, lists, blockquotes,
 * links, inline images, and safe-listed YouTube embeds. Emits HTML on every
 * change; the server re-sanitizes on save (never trust the client). The image
 * button defers to the parent (Pexels picker) via (requestImage); call
 * insertImage(url, alt) to drop the chosen photo at the cursor.
 */
@Component({
  selector: 'app-blog-body-editor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bbe">
      <div class="bbe-tb" role="toolbar" aria-label="Body formatting">
        <button type="button" [class.on]="active('bold')" (click)="cmd('bold')" title="Bold"><strong>B</strong></button>
        <button type="button" [class.on]="active('italic')" (click)="cmd('italic')" title="Italic"><em>I</em></button>
        <span class="bbe-div"></span>
        <button type="button" [class.on]="active('heading', { level: 2 })" (click)="cmd('h2')" title="Heading 2">H2</button>
        <button type="button" [class.on]="active('heading', { level: 3 })" (click)="cmd('h3')" title="Heading 3">H3</button>
        <span class="bbe-div"></span>
        <button type="button" [class.on]="active('bulletList')" (click)="cmd('bullet')" title="Bullet list">• List</button>
        <button type="button" [class.on]="active('orderedList')" (click)="cmd('numbered')" title="Numbered list">1. List</button>
        <button type="button" [class.on]="active('blockquote')" (click)="cmd('quote')" title="Quote">❝</button>
        <span class="bbe-div"></span>
        <button type="button" [class.on]="active('link')" (click)="cmd('link')" title="Link">🔗</button>
        <button type="button" (click)="requestImage.emit()" title="Insert image">🖼</button>
        <button type="button" (click)="cmd('youtube')" title="Embed a YouTube video">▶ YouTube</button>
      </div>
      <div #host class="bbe-doc"></div>
    </div>
  `,
  styles: [`
    .bbe { border: 1px solid #d1d5db; border-radius: 10px; overflow: hidden; background: #fff; }
    .bbe-tb { display: flex; align-items: center; gap: .15rem; flex-wrap: wrap; padding: .4rem .5rem; border-bottom: 1px solid #eef0f2; background: #fafafa; }
    .bbe-tb button { border: none; background: transparent; border-radius: 6px; padding: .3rem .55rem; font-size: .85rem; color: #4b5563; cursor: pointer; line-height: 1; }
    .bbe-tb button:hover { background: #eef9fb; color: #0a93ab; }
    .bbe-tb button.on { background: #d8f4fa; color: #0a6b7d; font-weight: 700; }
    .bbe-div { width: 1px; height: 18px; background: #e5e7eb; margin: 0 .25rem; }
    .bbe-doc { padding: 1rem 1.1rem; min-height: 320px; max-height: 60vh; overflow: auto; }
    .bbe-doc :first-child { margin-top: 0; }
    .bbe-doc .ProseMirror { outline: none; font-size: 1rem; line-height: 1.7; color: #1f2430; }
    .bbe-doc h2 { font-size: 1.4rem; font-weight: 800; margin: 1.4rem 0 .5rem; }
    .bbe-doc h3 { font-size: 1.15rem; font-weight: 800; margin: 1.1rem 0 .4rem; }
    .bbe-doc p { margin: 0 0 .85rem; }
    .bbe-doc ul, .bbe-doc ol { margin: 0 0 .85rem; padding-left: 1.3rem; }
    .bbe-doc blockquote { border-left: 3px solid #12C4E3; margin: 1rem 0; padding: .2rem 0 .2rem 1rem; color: #374151; font-style: italic; }
    .bbe-doc a { color: #0a93ab; text-decoration: underline; }
    .bbe-doc img { max-width: 100%; height: auto; border-radius: 10px; margin: .75rem 0; }
    .bbe-doc iframe { width: 100%; aspect-ratio: 16/9; border: 0; border-radius: 10px; margin: .75rem 0; }
    .bbe-doc .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #9ca3af; float: left; height: 0; pointer-events: none; }
  `]
})
export class BlogBodyEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('host') host!: ElementRef<HTMLDivElement>;
  @Input() html = '';
  @Output() htmlChange = new EventEmitter<string>();
  /** Toolbar image button — parent opens its Pexels picker, then calls insertImage(). */
  @Output() requestImage = new EventEmitter<void>();

  private editor: Editor | null = null;
  version = signal(0);   // bump to refresh active states

  ngAfterViewInit(): void {
    this.editor = new Editor({
      element: this.host.nativeElement,
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] }, link: false }),
        Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener', target: '_blank' } }),
        Image.configure({ inline: false, HTMLAttributes: { loading: 'lazy' } }),
        Youtube.configure({ width: 640, height: 360, nocookie: true }),
        Placeholder.configure({ placeholder: 'Write the post… (the AI usually drafts this for you)' }),
      ],
      content: this.html || '',
      onUpdate: ({ editor }) => { this.version.update(v => v + 1); this.htmlChange.emit(editor.getHTML()); },
      onSelectionUpdate: () => this.version.update(v => v + 1),
    });
  }

  ngOnChanges(ch: SimpleChanges): void {
    // External content change (load, AI-edit accept, undo) — replace without looping.
    if (ch['html'] && this.editor && this.html !== this.editor.getHTML())
      this.editor.commands.setContent(this.html || '', { emitUpdate: false });
  }

  ngOnDestroy(): void { this.editor?.destroy(); this.editor = null; }

  active(name: string, attrs?: object): boolean { return this.editor?.isActive(name, attrs) ?? false; }

  cmd(type: string): void {
    if (!this.editor) return;
    const c = this.editor.chain().focus();
    switch (type) {
      case 'bold': c.toggleBold().run(); break;
      case 'italic': c.toggleItalic().run(); break;
      case 'h2': c.toggleHeading({ level: 2 }).run(); break;
      case 'h3': c.toggleHeading({ level: 3 }).run(); break;
      case 'bullet': c.toggleBulletList().run(); break;
      case 'numbered': c.toggleOrderedList().run(); break;
      case 'quote': c.toggleBlockquote().run(); break;
      case 'link': {
        if (this.editor.isActive('link')) { c.unsetLink().run(); break; }
        const url = window.prompt('Link URL (https://…)');
        if (url) c.setLink({ href: url }).run();
        break;
      }
      case 'youtube': {
        const url = window.prompt('YouTube video URL');
        if (url) (this.editor.chain().focus() as any).setYoutubeVideo({ src: url }).run();
        break;
      }
    }
  }

  insertImage(src: string, alt = ''): void {
    this.editor?.chain().focus().setImage({ src, alt }).run();
  }
}
