export interface Milestone {
  days: number;
  title: string;
  icon: string;
  description: string;
}

export const MILESTONES: Milestone[] = [
  { days: 7,   title: 'Novice',       icon: '⭐',  description: 'Awarded for a 7-day streak' },
  { days: 30,  title: 'Seeker',       icon: '🌟',  description: 'Awarded for a 30-day streak' },
  { days: 90,  title: 'Apprentice',   icon: '🏵️', description: 'Awarded for a 90-day streak' },
  { days: 120, title: 'Practitioner', icon: '🏅',  description: 'Awarded for a 120-day streak' },
  { days: 150, title: 'Journeyman',   icon: '🎖️', description: 'Awarded for a 150-day streak' },
  { days: 180, title: 'Maker',        icon: '🥉',  description: 'Awarded for a 180-day streak' },
  { days: 210, title: 'Craftsperson', icon: '🥈',  description: 'Awarded for a 210-day streak' },
  { days: 240, title: 'Devotee',      icon: '🥇',  description: 'Awarded for a 240-day streak' },
  { days: 270, title: 'Luminary',     icon: '🏆',  description: 'Awarded for a 270-day streak' },
  { days: 300, title: 'Sage',         icon: '💎',  description: 'Awarded for a 300-day streak' },
  { days: 330, title: 'Visionary',    icon: '⚜️', description: 'Awarded for a 330-day streak' },
  { days: 365, title: 'Master',       icon: '👑',  description: 'Awarded for a 365-day streak' },
];

export function getMilestoneForDays(days: number): Milestone | null {
  let result: Milestone | null = null;
  for (const m of MILESTONES) {
    if (days >= m.days) result = m;
    else break;
  }
  return result;
}

export function getMilestoneIndex(days: number): number {
  let index = -1;
  for (let i = 0; i < MILESTONES.length; i++) {
    if (days >= MILESTONES[i].days) index = i;
    else break;
  }
  return index;
}

/** Returns the next milestone after the user's current tier, or null at top tier. */
export function getNextMilestone(days: number): Milestone | null {
  const idx = getMilestoneIndex(days);
  return idx + 1 < MILESTONES.length ? MILESTONES[idx + 1] : null;
}

export interface MilestoneProgress {
  /** Current earned tier, null if user hasn't reached the first milestone yet. */
  current: Milestone | null;
  /** Next tier to earn, null when at top tier. */
  next: Milestone | null;
  /** Days completed within the current tier (0 if no tier yet). */
  daysIntoCurrentTier: number;
  /** Days remaining to reach the next tier (0 at top tier). */
  daysToNext: number;
  /** 0–100 progress through the current tier toward the next. */
  percentToNext: number;
  /** True once the user has reached the highest tier (365+). */
  isAtTopTier: boolean;
}

/**
 * Computes everything the dashboard needs to render the hybrid progress
 * reward (current tier badge + progress bar to next milestone). At the
 * top tier (Master, 365+ days) the badge is shown alone and the progress
 * bar is suppressed by callers.
 */
export function getMilestoneProgress(days: number): MilestoneProgress {
  const safeDays = Math.max(0, days | 0);
  const idx = getMilestoneIndex(safeDays);
  const current = idx >= 0 ? MILESTONES[idx] : null;
  const next = idx + 1 < MILESTONES.length ? MILESTONES[idx + 1] : null;
  const isAtTopTier = current !== null && next === null;

  if (!next) {
    return {
      current,
      next: null,
      daysIntoCurrentTier: safeDays - (current?.days ?? 0),
      daysToNext: 0,
      percentToNext: 100,
      isAtTopTier,
    };
  }

  const tierStart = current?.days ?? 0;
  const tierLength = Math.max(1, next.days - tierStart);
  const daysIntoCurrentTier = safeDays - tierStart;
  const daysToNext = Math.max(0, next.days - safeDays);
  const percentToNext = Math.min(100, Math.max(0, (daysIntoCurrentTier / tierLength) * 100));

  return { current, next, daysIntoCurrentTier, daysToNext, percentToNext, isAtTopTier };
}
