namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// Singleton settings row for the automated landing-page builder. Holds the
/// master switches + the daily worker's dedupe stamp. The GA4 measurement id
/// lives in config/env (not here), since it's a deploy-time secret-ish value.
/// </summary>
public class LandingPageSettings
{
    public int Id { get; set; }

    /// <summary>
    /// Master kill switch for the daily auto-generation worker. Off by default
    /// so nothing generates until the admin has a keyword queue + is ready.
    /// </summary>
    public bool AutoGenerateEnabled { get; set; } = false;

    /// <summary>
    /// When true, a generated page that clears <see cref="QualityThreshold"/>
    /// publishes immediately; a page that falls short is held as a Draft and
    /// flagged in the daily email regardless of this flag.
    /// </summary>
    public bool AutoPublishEnabled { get; set; } = true;

    /// <summary>0–100 score a page must reach to auto-publish. Default 70.</summary>
    public int QualityThreshold { get; set; } = 70;

    /// <summary>Local-time hour (ET) the daily generation runs. Default 7am.</summary>
    public int GenerateHourLocalEt { get; set; } = 7;

    /// <summary>Date (ET) of the last generation run — dedupes the 60s worker loop.</summary>
    public DateOnly? LastGeneratedDate { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
