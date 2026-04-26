namespace CreatorCompanion.Api.Common;

public class TierLimits
{
    public int MaxCharsPerEntry { get; set; }
    public int MaxImagesPerEntry { get; set; }
    public int MaxRemindersPerDay { get; set; }
    public bool CanUsePause { get; set; }
    public bool CanBackfill { get; set; }
    public bool CanRecoverDeleted { get; set; }
    public bool CanTrackMood { get; set; }
    public bool CanFavorite { get; set; }
    public bool CanFormatText { get; set; }
    public int MaxEntriesPerDay { get; set; }
    public int MaxTagsPerEntry { get; set; }
    public int MaxDiaries { get; set; } // -1 = unlimited
}

public class EntryLimitsConfig
{
    public TierLimits Free { get; set; } = new();
    public TierLimits Paid { get; set; } = new();
}
