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
