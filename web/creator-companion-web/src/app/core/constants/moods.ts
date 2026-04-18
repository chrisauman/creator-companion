export interface MoodOption {
  key: string;
  emoji: string;
}

export const MOODS: MoodOption[] = [
  { key: 'Accomplished', emoji: '🏆' },
  { key: 'Frustrated',   emoji: '😤' },
  { key: 'Stuck',        emoji: '😓' },
  { key: 'Inspired',     emoji: '✨' },
  { key: 'Playful',      emoji: '😄' },
  { key: 'Proud',        emoji: '🌟' },
  { key: 'Energized',    emoji: '⚡' },
  { key: 'Hopeful',      emoji: '🌱' },
  { key: 'Satisfied',    emoji: '😌' },
  { key: 'Grateful',     emoji: '🙏' },
  { key: 'Focused',      emoji: '🎯' },
  { key: 'Challenged',   emoji: '💪' },
  { key: 'Doubtful',     emoji: '🤔' },
  { key: 'Uncertain',    emoji: '😕' },
  { key: 'Restless',     emoji: '😬' },
  { key: 'Overwhelmed',  emoji: '😵' },
  { key: 'Curious',      emoji: '🧐' },
  { key: 'Impatient',    emoji: '⏳' },
  { key: 'Vulnerable',   emoji: '🥺' },
  { key: 'Drained',      emoji: '😪' },
  { key: 'Confident',    emoji: '😎' },
  { key: 'Disappointed', emoji: '😞' },
];

export function getMoodEmoji(key: string): string {
  return MOODS.find(m => m.key === key)?.emoji ?? '';
}
