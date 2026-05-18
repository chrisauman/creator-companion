/**
 * Derives the user-facing plan state from the raw tier + trialEndsAt.
 *
 * Background: the database still stores `tier: 'Free' | 'Paid'` because
 * the EntitlementService distinguishes "has paid" from "in trial / no
 * subscription." But the user-facing model since the trial-only refactor
 * is different: there is no free plan — every account is either in the
 * 10-day trial, in the post-trial paywalled state, or actively paying.
 * Surfacing the raw word "Free" in the UI is confusing and inconsistent
 * with what the marketing site and signup flow tell users.
 *
 * This helper is the single source of truth for translating the data
 * model into the labels we show in account pages, admin lists, etc.
 * Use it anywhere the previous code did `user.tier === 'Paid' ? ... : ...`.
 */
export type PlanState = 'trial' | 'trial-expired' | 'paid';

export interface PlanDisplay {
  state: PlanState;
  /** Short, user-facing label. "Paid" / "Free trial" / "Trial expired" */
  label: string;
  /** Detailed label with countdown when in trial. */
  detailedLabel: string;
  /** Days remaining in trial; 0 when not in trial or already expired. */
  daysLeft: number;
}

interface PlanInput {
  tier?: 'Free' | 'Paid' | string;
  trialEndsAt?: string | null;
}

export function getPlanDisplay(user: PlanInput | null | undefined): PlanDisplay {
  if (!user || user.tier === 'Paid') {
    return { state: 'paid', label: 'Paid', detailedLabel: 'Paid', daysLeft: 0 };
  }

  // Anything below this point is tier=Free in the DB. The user-facing
  // story is trial-in-progress or trial-expired, never "free."
  if (!user.trialEndsAt) {
    // Legacy account without a trial timestamp — treat as expired so
    // the paywall is the correct surface, not a phantom "free plan."
    return { state: 'trial-expired', label: 'Trial expired', detailedLabel: 'Trial expired', daysLeft: 0 };
  }

  const endsAt = new Date(user.trialEndsAt).getTime();
  const now    = Date.now();

  if (endsAt <= now) {
    return { state: 'trial-expired', label: 'Trial expired', detailedLabel: 'Trial expired', daysLeft: 0 };
  }

  // Active trial — show countdown so users know where they stand.
  const msLeft = endsAt - now;
  const daysLeft = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  const detailedLabel = `Free trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;

  return {
    state: 'trial',
    label: 'Free trial',
    detailedLabel,
    daysLeft,
  };
}
