import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Renders a clean line-icon for one of the 12 streak tiers.
 * Tier titles map to milestone titles in core/constants/milestones.ts:
 *   Novice (7d)        → spark
 *   Seeker (30d)       → compass
 *   Apprentice (90d)   → open book
 *   Practitioner (120d)→ pen nib
 *   Journeyman (150d)  → path arrows
 *   Maker (180d)       → hammer
 *   Craftsperson (210d)→ chisel
 *   Devotee (240d)     → flame
 *   Luminary (270d)    → lantern
 *   Sage (300d)        → eye
 *   Visionary (330d)   → telescope/star
 *   Master (365d)      → crown
 *
 * Renders nothing for unknown tier titles (e.g. before the first milestone).
 */
@Component({
  selector: 'app-tier-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    @switch (tier) {
      @case ('Novice') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 4 L13 11 L20 12 L13 13 L12 20 L11 13 L4 12 L11 11 Z"/>
        </svg>
      }
      @case ('Seeker') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M16 8 L13 13 L8 16 L11 11 Z" fill="currentColor"/>
        </svg>
      }
      @case ('Apprentice') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 5 a16 16 0 0 1 9 2 a16 16 0 0 1 9 -2 V19 a16 16 0 0 0 -9 2 a16 16 0 0 0 -9 -2 Z"/>
          <line x1="12" y1="7" x2="12" y2="21"/>
        </svg>
      }
      @case ('Practitioner') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 3 L19 3 L17 13 L12 22 L7 13 Z"/>
          <line x1="9" y1="3" x2="9" y2="13"/>
          <line x1="15" y1="3" x2="15" y2="13"/>
          <circle cx="12" cy="14" r="1.5" fill="currentColor"/>
        </svg>
      }
      @case ('Journeyman') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 3 L19 3"/>
          <path d="M5 8 L19 8"/>
          <path d="M5 13 L19 13"/>
          <path d="M5 18 L19 18"/>
          <path d="M14 6 L17 8 L14 10"/>
          <path d="M10 11 L7 13 L10 15"/>
        </svg>
      }
      @case ('Maker') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="6" width="14" height="6" rx="1.5"/>
          <path d="M17 9 H21"/>
          <line x1="10" y1="12" x2="10" y2="21"/>
          <line x1="7" y1="21" x2="13" y2="21"/>
        </svg>
      }
      @case ('Craftsperson') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 3 L21 10 L18 13 L11 6 Z"/>
          <path d="M11 6 L4 19"/>
          <path d="M3 21 L4 19 L6 20"/>
          <path d="M14 3 L17 6"/>
        </svg>
      }
      @case ('Devotee') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2 C8 7 6 11 6 15 a6 6 0 0 0 12 0 c0 -2 -1 -4 -2 -5 c-1 2 -2 3 -3 3 c1 -3 0 -7 -1 -11 z"/>
        </svg>
      }
      @case ('Luminary') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 2 H15 V4 H9 Z"/>
          <path d="M7 4 H17 L17 18 a3 3 0 0 1 -3 3 H10 a3 3 0 0 1 -3 -3 Z"/>
          <line x1="10" y1="9" x2="10" y2="16"/>
          <line x1="14" y1="9" x2="14" y2="16"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
        </svg>
      }
      @case ('Sage') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12 C5 7 8 5 12 5 C16 5 19 7 22 12 C19 17 16 19 12 19 C8 19 5 17 2 12 Z"/>
          <circle cx="12" cy="12" r="3.5"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
        </svg>
      }
      @case ('Visionary') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 15 L8 10 L14 16 L9 21 Z"/>
          <path d="M11 11 L20 2"/>
          <path d="M16 2 L20 2 L20 6"/>
          <circle cx="6" cy="6" r="1" fill="currentColor"/>
          <circle cx="18" cy="14" r=".75" fill="currentColor"/>
        </svg>
      }
      @case ('Master') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9 L6 16 H18 L21 9 L17 12 L12 5 L7 12 Z"/>
          <line x1="6" y1="20" x2="18" y2="20"/>
          <circle cx="12" cy="5" r=".75" fill="currentColor"/>
          <circle cx="3" cy="9" r=".75" fill="currentColor"/>
          <circle cx="21" cy="9" r=".75" fill="currentColor"/>
        </svg>
      }
      @default {
        <!-- Unknown tier — render nothing -->
      }
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; line-height: 0; }
    svg { display: block; }
  `]
})
export class TierIconComponent {
  /** The tier title (e.g. "Novice", "Master"). */
  @Input() tier: string | null | undefined = null;
  @Input() size: number = 14;
  @Input() strokeWidth: number = 1.5;
}
