import {
  Component, Input, Output, EventEmitter, signal, ElementRef, ViewChild,
  OnChanges, SimpleChanges, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Chip-based tag input with autocomplete.
 *
 * Renders as a bordered input box containing chips + a live text field.
 * Type to filter existing suggestions; press Enter, comma, or Tab to add;
 * Backspace on empty input removes the last chip.
 */
@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      class="tag-box"
      [class.tag-box--focused]="focused()"
      [class.tag-box--disabled]="disabled"
      (click)="focusInput()"
    >
      <!-- Existing tag chips -->
      <span class="tag-chip" *ngFor="let tag of tags">
        <span class="tag-chip__hash">#</span>{{ tag }}
        <button
          class="tag-chip__remove"
          type="button"
          [disabled]="disabled"
          (click)="removeTag(tag); $event.stopPropagation()"
          aria-label="Remove tag"
        >×</button>
      </span>

      <!-- Typing area (hidden when at limit) -->
      <span class="tag-input-sizer" *ngIf="tags.length < maxTags">
        <input
          #tagInput
          class="tag-input"
          type="text"
          [(ngModel)]="inputValue"
          (ngModelChange)="onInputChange()"
          (keydown)="onKeydown($event)"
          (focus)="focused.set(true); showDropdown.set(true)"
          (blur)="onBlur()"
          [placeholder]="tags.length === 0 ? 'Add a tag…' : '+'"
          [disabled]="disabled"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </span>

      <!-- At-limit label -->
      <span class="tag-limit-note" *ngIf="tags.length >= maxTags">
        {{ maxTags }}/{{ maxTags }} tags
      </span>

      <!-- Autocomplete dropdown -->
      <div class="tag-dropdown" *ngIf="showDropdown() && filteredSuggestions().length > 0">
        <button
          class="tag-dropdown__item"
          type="button"
          *ngFor="let s of filteredSuggestions(); let i = index"
          [class.tag-dropdown__item--active]="i === activeIndex()"
          (mousedown)="selectSuggestion(s)"
        >
          <span class="tag-dropdown__hash">#</span>{{ s }}
        </button>
      </div>
    </div>

    <p class="tag-hint" *ngIf="focused() && tags.length < maxTags">
      Press <kbd>Enter</kbd> or <kbd>,</kbd> to add · <kbd>Backspace</kbd> to remove last
    </p>
  `,
  styles: [`
    :host { display: block; position: relative; }

    .tag-box {
      display: flex; flex-wrap: wrap; align-items: center; gap: .375rem;
      min-height: 42px; padding: .375rem .625rem;
      border: 1.5px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      cursor: text;
      transition: border-color .15s;
      position: relative;

      &--focused { border-color: var(--color-accent); }
      &--disabled { opacity: .6; cursor: not-allowed; pointer-events: none; }
    }

    /* Existing chips */
    .tag-chip {
      display: inline-flex; align-items: center; gap: .2rem;
      background: var(--color-accent-light); border: 1px solid var(--color-accent);
      border-radius: 100px; padding: .2rem .5rem .2rem .45rem;
      font-size: .8125rem; color: var(--color-accent-dark); font-weight: 500;
      line-height: 1.3;
    }
    .tag-chip__hash { opacity: .6; font-weight: 400; margin-right: .05rem; }
    .tag-chip__remove {
      border: none; background: none; cursor: pointer; padding: 0;
      font-size: .9rem; line-height: 1; color: var(--color-accent-dark);
      opacity: .55; display: flex; align-items: center; margin-left: .1rem;
      &:hover { opacity: 1; }
      &:disabled { cursor: not-allowed; }
    }

    /* Text input */
    .tag-input-sizer { display: contents; } /* let the input be a direct flex child */
    .tag-input {
      border: none; outline: none; background: transparent;
      font-size: .9rem; color: var(--color-text); font-family: var(--font-sans);
      flex: 1 1 100px; min-width: 80px; padding: .1rem 0;
      &::placeholder { color: var(--color-text-3); }
    }

    .tag-limit-note {
      font-size: .75rem; color: var(--color-text-3);
      padding: .1rem .25rem;
    }

    /* Dropdown */
    .tag-dropdown {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 200;
      max-height: 200px; overflow-y: auto;
      background: var(--color-surface); border: 1px solid var(--color-border);
      border-radius: var(--radius-md); box-shadow: var(--shadow-md);
    }
    .tag-dropdown__item {
      display: flex; align-items: center; gap: .2rem;
      width: 100%; text-align: left; padding: .5rem .75rem;
      border: none; background: none; cursor: pointer; font-size: .875rem;
      color: var(--color-text-2); font-family: var(--font-sans);
      &:hover, &--active { background: var(--color-accent-light); color: var(--color-accent-dark); }
    }
    .tag-dropdown__hash { opacity: .5; font-size: .8rem; }

    /* Hint line below */
    .tag-hint {
      font-size: .75rem; color: var(--color-text-3); margin-top: .375rem;
      kbd {
        display: inline-block; padding: .05rem .3rem;
        border: 1px solid var(--color-border); border-radius: 3px;
        font-family: var(--font-sans); font-size: .7rem;
        background: var(--color-surface-2);
      }
    }
  `]
})
export class TagInputComponent implements OnChanges {
  @ViewChild('tagInput') private tagInputEl?: ElementRef<HTMLInputElement>;

  @Input() tags: string[] = [];
  @Input() suggestions: string[] = [];
  /** Defaults to 3; guards against undefined when capabilities haven't loaded yet. */
  @Input() set maxTags(v: number) { this._maxTags = v > 0 ? v : 3; }
  get maxTags(): number { return this._maxTags; }
  private _maxTags = 3;
  @Input() disabled = false;

  @Output() tagsChange = new EventEmitter<string[]>();

  inputValue = '';
  focused  = signal(false);
  showDropdown = signal(false);
  activeIndex  = signal(-1);
  filteredSuggestions = signal<string[]>([]);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['suggestions'] || changes['tags']) {
      this.updateFiltered();
    }
  }

  focusInput(): void {
    this.tagInputEl?.nativeElement.focus();
  }

  onInputChange(): void {
    this.updateFiltered();
    this.activeIndex.set(-1);
    this.showDropdown.set(true);
  }

  onBlur(): void {
    // Small delay so dropdown clicks register before blur closes it
    setTimeout(() => {
      this.focused.set(false);
      this.showDropdown.set(false);
    }, 150);
  }

  onKeydown(event: KeyboardEvent): void {
    const sug = this.filteredSuggestions();

    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      if (event.key === 'Tab' && !this.inputValue.trim() && this.activeIndex() < 0) return;
      event.preventDefault();
      if (this.activeIndex() >= 0 && this.activeIndex() < sug.length) {
        this.selectSuggestion(sug[this.activeIndex()]);
      } else {
        this.addCurrentInput();
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.set(Math.min(this.activeIndex() + 1, sug.length - 1));
      this.showDropdown.set(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, -1));
    } else if (event.key === 'Backspace' && this.inputValue === '' && this.tags.length > 0) {
      this.removeTag(this.tags[this.tags.length - 1]);
    } else if (event.key === 'Escape') {
      this.showDropdown.set(false);
      this.tagInputEl?.nativeElement.blur();
    }
  }

  selectSuggestion(name: string): void {
    this.addTag(name);
    this.inputValue = '';
    this.updateFiltered();
    this.showDropdown.set(false);
    this.activeIndex.set(-1);
    setTimeout(() => this.tagInputEl?.nativeElement.focus(), 0);
  }

  removeTag(name: string): void {
    this.tagsChange.emit(this.tags.filter(t => t !== name));
    this.updateFiltered();
  }

  private addCurrentInput(): void {
    if (!this.inputValue.trim()) return;
    this.addTag(this.inputValue);
    this.inputValue = '';
    this.updateFiltered();
    this.showDropdown.set(false);
  }

  private addTag(raw: string): void {
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, '');
    if (!normalized) return;
    if (this.tags.includes(normalized)) return;
    if (this.tags.length >= this.maxTags) return;
    this.tagsChange.emit([...this.tags, normalized]);
  }

  private updateFiltered(): void {
    const q = this.inputValue.trim().toLowerCase().replace(/\s+/g, '');
    const existing = new Set(this.tags);
    this.filteredSuggestions.set(
      this.suggestions
        .filter(s => !existing.has(s) && (q === '' || s.includes(q)))
        .slice(0, 8)
    );
  }
}
