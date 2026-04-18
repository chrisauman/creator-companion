namespace CreatorCompanion.Api.Domain.Enums;

public enum AccountTier { Free, Paid }

public enum EntrySource { Direct, Backfill }

public enum EntryStatus { Draft, Submitted, Deleted }

public enum Visibility { Private, Shared, Public }

public enum PauseStatus { Active, Expired, Cancelled }

public enum AnalyticsEventType
{
    EntryCreated,
    EntryAbandoned,
    StreakContinued,
    StreakBroken,
    ReminderTriggered
}
