namespace CreatorCompanion.Api.Domain.Enums;

/// <summary>
/// Social platforms the Marketing auto-poster can target. Stored as the
/// int value in Postgres so renames never break existing rows — only
/// ever APPEND new members, never reorder or reuse a number.
///
/// v1 ships Bluesky + Mastodon (free, open APIs, no approval gates).
/// Threads (Meta API + OAuth) and Twitter/X (paid tier in practice) are
/// reserved here so adding their <see cref="Application.Interfaces.ISocialPoster"/>
/// adapter later is purely additive — no enum/migration churn.
///
/// Substack is intentionally NOT in this enum: it has no posting API and
/// is handled by the separate daily-email-reminder pipeline
/// (SubstackPostingService). If we ever fold that in as a "post = email
/// the admin" adapter, add it as the next appended member.
/// </summary>
public enum SocialPlatform
{
    Bluesky  = 0,
    Mastodon = 1,
    Threads  = 2,
    Twitter  = 3,
}
