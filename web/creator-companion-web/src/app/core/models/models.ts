export interface User {
  id: string;
  username: string;
  email: string;
  tier: 'Free' | 'Paid';
  timeZoneId: string;
  onboardingCompleted: boolean;
  createdAt: string;
  trialEndsAt?: string;
  showMotivation: boolean;
  showActionItems: boolean;
}

export interface MotivationEntry {
  id: string;
  title: string;
  takeaway: string;
  fullContent: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: User;
}

export interface Journal {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  entryCount: number;
}

export interface Entry {
  id: string;
  journalId: string;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  contentText: string;
  mood?: string;
  isFavorited: boolean;
  entrySource: number;
  visibility: number;
  metadata: string;
  media: MediaItem[];
  tags: string[];
}

export interface EntryListItem {
  id: string;
  journalId: string;
  entryDate: string;
  createdAt: string;
  title: string;
  contentPreview: string;
  entrySource: number;
  mediaCount: number;
  firstImageUrl?: string;
  deletedAt?: string;
  mood?: string;
  tags: string[];
  isFavorited: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  usageCount: number;
}

export interface MediaItem {
  id: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  takenAt?: string;
  url: string;
}

export interface Draft {
  id: string;
  journalId: string;
  entryDate: string;
  contentText: string;
  metadata: string;
  updatedAt: string;
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  totalEntries: number;
  totalMediaCount: number;
  totalActiveDays: number;
  lastEntryDate?: string;
  isPaused: boolean;
  activePauseId?: string;
  pauseStart?: string;
  pauseEnd?: string;
  pauseDaysUsedThisMonth: number;
}

export interface Pause {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  reason?: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  time: string;      // "HH:mm"
  message?: string;  // null = default message
  isEnabled: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface ReminderConfigResponse {
  dailyUpToDays: number;
  every2DaysUpToDays: number;
  every3DaysUpToDays: number;
  messageActiveStreak: string;
  messageJustBroke: string;
  messageShortLapse: string;
  messageMediumLapse: string;
  messageLongAbsence: string;
  updatedAt: string;
}

export interface UpdateReminderConfigRequest {
  dailyUpToDays: number;
  every2DaysUpToDays: number;
  every3DaysUpToDays: number;
  messageActiveStreak: string;
  messageJustBroke: string;
  messageShortLapse: string;
  messageMediumLapse: string;
  messageLongAbsence: string;
}

export interface ActionItem {
  id: number;
  text: string;
  sortOrder: number;
  isCompleted: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface Capabilities {
  maxWordsPerEntry: number;
  maxImagesPerEntry: number;
  maxRemindersPerDay: number;
  canUsePause: boolean;
  canBackfill: boolean;
  canRecoverDeleted: boolean;
  canTrackMood: boolean;
  canFavorite: boolean;
  canFormatText: boolean;
  maxEntriesPerDay: number;
  maxTagsPerEntry: number;
  maxDiaries: number;
}
