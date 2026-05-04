import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Renders a clean line-icon face for one of the 12 supported moods.
 * Returns nothing for unknown / legacy moods so older entries gracefully
 * display blank rather than an emoji.
 *
 * Supported moods (keep in sync with the design system):
 *   Active:      Inspired, Focused, Energized, Accomplished, Proud, Grateful
 *   Reflective:  Hopeful, Challenged, Vulnerable, Frustrated, Disappointed, Stuck
 */
@Component({
  selector: 'app-mood-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    @switch (mood) {
      @case ('Inspired') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="14" r="7.5"/>
          <circle cx="9.5" cy="13" r="0.6" fill="currentColor" stroke="none"/>
          <circle cx="14.5" cy="13" r="0.6" fill="currentColor" stroke="none"/>
          <path d="M9.5 16 q2.5 2 5 0"/>
          <path d="M12 1.5 L12.6 3.4 L14.5 4 L12.6 4.6 L12 6.5 L11.4 4.6 L9.5 4 L11.4 3.4 Z"
                fill="currentColor" stroke="none"/>
        </svg>
      }
      @case ('Focused') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="7" y1="11" x2="10" y2="11"/>
          <line x1="14" y1="11" x2="17" y2="11"/>
          <line x1="9.5" y1="15" x2="14.5" y2="15"/>
        </svg>
      }
      @case ('Energized') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="8"/>
          <circle cx="9.5" cy="11" r="0.95" fill="currentColor" stroke="none"/>
          <circle cx="14.5" cy="11" r="0.95" fill="currentColor" stroke="none"/>
          <path d="M8 14 q4 4 8 0"/>
          <line x1="2" y1="8" x2="3.5" y2="9"/>
          <line x1="22" y1="8" x2="20.5" y2="9"/>
          <line x1="2" y1="16" x2="3.5" y2="15"/>
          <line x1="22" y1="16" x2="20.5" y2="15"/>
        </svg>
      }
      @case ('Accomplished') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M7.5 11 q1.5 -1.5 3 0"/>
          <path d="M13.5 11 q1.5 -1.5 3 0"/>
          <path d="M8.5 14.5 q3.5 3 7 0"/>
        </svg>
      }
      @case ('Proud') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M7 8.5 q1.5 -1 3 0"/>
          <path d="M14 8.5 q1.5 -1 3 0"/>
          <circle cx="9.5" cy="11" r="0.6" fill="currentColor" stroke="none"/>
          <circle cx="14.5" cy="11" r="0.6" fill="currentColor" stroke="none"/>
          <path d="M9.5 15 q2.5 1.5 5 0"/>
        </svg>
      }
      @case ('Grateful') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M7.5 11 q1.5 1.5 3 0"/>
          <path d="M13.5 11 q1.5 1.5 3 0"/>
          <path d="M9.5 15 q2.5 1.5 5 0"/>
        </svg>
      }
      @case ('Hopeful') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="14" r="7.5"/>
          <circle cx="9.5" cy="12.5" r="0.6" fill="currentColor" stroke="none"/>
          <circle cx="14.5" cy="12.5" r="0.6" fill="currentColor" stroke="none"/>
          <line x1="9.5" y1="11.5" x2="9.5" y2="9.5"/>
          <line x1="14.5" y1="11.5" x2="14.5" y2="9.5"/>
          <path d="M9.5 16 q2.5 1.5 5 0"/>
          <circle cx="12" cy="3" r="0.5" fill="currentColor" stroke="none"/>
          <circle cx="12" cy="5" r="0.4" fill="currentColor" stroke="none"/>
        </svg>
      }
      @case ('Challenged') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="7" y1="9" x2="10.5" y2="8.5"/>
          <line x1="13.5" y1="8.5" x2="17" y2="9"/>
          <circle cx="9.5" cy="11.5" r="0.6" fill="currentColor" stroke="none"/>
          <circle cx="14.5" cy="11.5" r="0.6" fill="currentColor" stroke="none"/>
          <line x1="9.5" y1="15.5" x2="14.5" y2="15.5"/>
        </svg>
      }
      @case ('Vulnerable') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <circle cx="9.5" cy="11" r="0.7" fill="currentColor" stroke="none"/>
          <circle cx="14.5" cy="11" r="0.7" fill="currentColor" stroke="none"/>
          <path d="M9.5 16 q2.5 -1.5 5 0"/>
          <path d="M9.2 12.5 c -0.4 1.5 -0.4 2.6 0.3 3.2 c 0.7 -0.6 0.7 -1.7 0.3 -3.2 z"
                fill="currentColor" stroke="none"/>
        </svg>
      }
      @case ('Frustrated') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="7" y1="8" x2="10.5" y2="9.5"/>
          <line x1="13.5" y1="9.5" x2="17" y2="8"/>
          <circle cx="9.5" cy="12" r="0.55" fill="currentColor" stroke="none"/>
          <circle cx="14.5" cy="12" r="0.55" fill="currentColor" stroke="none"/>
          <path d="M8.5 16 q1 -1 2 0 q1 1 2 0 q1 -1 2 0 q0.5 0.5 1 0"/>
        </svg>
      }
      @case ('Disappointed') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <circle cx="9.5" cy="11" r="0.6" fill="currentColor" stroke="none"/>
          <circle cx="14.5" cy="11" r="0.6" fill="currentColor" stroke="none"/>
          <path d="M9 16.5 q3 -2.5 6 0"/>
        </svg>
      }
      @case ('Stuck') {
        <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="7.5" y1="11" x2="10.5" y2="11"/>
          <line x1="13.5" y1="11" x2="16.5" y2="11"/>
          <line x1="9" y1="15.5" x2="15" y2="15.5"/>
        </svg>
      }
      @default {
        <!-- Unknown / legacy mood — render nothing -->
      }
    }
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      line-height: 0;
    }
    svg { display: block; }
  `]
})
export class MoodIconComponent {
  @Input() mood: string | null | undefined = null;
  @Input() size: number = 16;
  @Input() strokeWidth: number = 1.6;
}

/** The 12 moods supported by the icon component, in display order. */
export const SUPPORTED_MOOD_KEYS = [
  'Inspired', 'Focused', 'Energized', 'Accomplished', 'Proud', 'Grateful',
  'Hopeful', 'Challenged', 'Vulnerable', 'Frustrated', 'Disappointed', 'Stuck'
] as const;

export type SupportedMoodKey = typeof SUPPORTED_MOOD_KEYS[number];

export function isSupportedMood(key: string | null | undefined): key is SupportedMoodKey {
  return key != null && (SUPPORTED_MOOD_KEYS as readonly string[]).includes(key);
}
