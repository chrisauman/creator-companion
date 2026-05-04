/**
 * The 12 moods supported across the app. Visual representation is now
 * line-style face icons via MoodIconComponent — emoji are no longer
 * the primary representation. The list intentionally pairs six active /
 * forward-moving moods with six reflective / challenging ones, in
 * picker display order.
 *
 * Existing entries in the database may still carry legacy mood values
 * not in this list (e.g. "Curious", "Drained", "Confident"). Those
 * are preserved on the entry but render without an icon and aren't
 * selectable in the new picker.
 */
export interface MoodOption {
  key: string;
}

export const MOODS: MoodOption[] = [
  // Active / forward-moving
  { key: 'Inspired' },
  { key: 'Focused' },
  { key: 'Energized' },
  { key: 'Accomplished' },
  { key: 'Proud' },
  { key: 'Grateful' },
  // Reflective / challenging
  { key: 'Hopeful' },
  { key: 'Challenged' },
  { key: 'Vulnerable' },
  { key: 'Frustrated' },
  { key: 'Disappointed' },
  { key: 'Stuck' },
];

/**
 * @deprecated Emoji are replaced by line icons rendered via
 * MoodIconComponent. This function now always returns an empty string
 * so legacy templates that still call it stay safe but contribute no
 * extra glyphs. New code should use <app-mood-icon> instead.
 */
export function getMoodEmoji(_key: string): string {
  return '';
}
