/**
 * Hardcoded library of brief journaling prompts for the Today panel's
 * "small prompt" card. The shuffle button cycles through these.
 *
 * In Phase F these will be replaced by an admin-managed Daily Prompts
 * table fetched from the backend.
 */
export const DASHBOARD_PROMPTS: readonly string[] = [
  'What excited you when you were creating today?',
  'What got in the way of your practice today?',
  'Describe something small you noticed.',
  'What did you almost write but didn\'t?',
  'Who or what made you feel seen today?',
  'What would you tell yourself one week ago?',
  'What\'s one thing you almost did but didn\'t?',
  'What were you avoiding today, and why?',
  'What surprised you this week?',
  'Where did your attention go that you didn\'t expect?',
  'What did you make today that you\'re proud of?',
  'What\'s a small win from this week?',
  'What\'s been on your mind that you haven\'t shared?',
  'What does your creative space need right now?',
  'What\'s a question you\'re sitting with?',
  'Describe a moment that made you feel alive today.',
  'What\'s something you\'re letting go of?',
  'What do you want to remember about today?',
  'What small risk did you take?',
  'What\'s something new you tried recently?',
];

/**
 * Returns a random prompt different from the current one (when
 * possible). Defaults to the hardcoded fallback list, but the Today
 * panel passes in the API-fetched library when available.
 */
export function pickRandomPrompt(
  current: string | null,
  list: readonly string[] = DASHBOARD_PROMPTS,
): string {
  if (list.length === 0) return current ?? '';
  if (list.length === 1) return list[0];
  let next = list[Math.floor(Math.random() * list.length)];
  let attempts = 0;
  while (next === current && attempts < 5) {
    next = list[Math.floor(Math.random() * list.length)];
    attempts++;
  }
  return next;
}
