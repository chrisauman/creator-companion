using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// One row per <see cref="SocialPlatform"/> the admin has connected for
/// the Marketing auto-poster. Holds the (encrypted) credentials, the
/// per-platform daily schedule, the enable flag, and a rolling health
/// snapshot. Rows are created lazily by the admin UI when the platform
/// is first opened — the picker/worker tolerate a missing row (treated
/// as "not connected, skip").
///
/// One admin, so this is effectively a small fixed set of singleton-ish
/// rows keyed by Platform (unique). No UserId — the Marketing surface is
/// admin-global, not per-user.
/// </summary>
public class SocialAccount
{
    public int Id { get; set; }

    /// <summary>Which platform this row configures. Unique.</summary>
    public SocialPlatform Platform { get; set; }

    /// <summary>
    /// Master per-platform toggle. False until the admin connects + turns
    /// it on. The daily worker skips any platform that is disabled OR has
    /// no usable credentials. Acts as the per-platform "kill switch" —
    /// the global kill switch lives on <see cref="SocialSettings"/>.
    /// </summary>
    public bool Enabled { get; set; } = false;

    /// <summary>
    /// Public handle / display identifier, e.g. "alice.bsky.social" or
    /// "@alice@mastodon.social". Plaintext — not a secret, used to build
    /// permalinks and shown in the admin UI so the admin can confirm
    /// which account is wired up. Nullable until connected.
    /// </summary>
    public string? Handle { get; set; }

    /// <summary>
    /// Non-secret endpoint/base URL the adapter needs. Plaintext.
    ///   - Mastodon: the instance base URL, e.g. "https://mastodon.social".
    ///   - Bluesky:  the PDS host, defaults to "https://bsky.social".
    /// Nullable until connected.
    /// </summary>
    public string? Endpoint { get; set; }

    /// <summary>
    /// AES-GCM-encrypted JSON credential blob (via <see cref="Application.Services.IEntryEncryptor"/>).
    /// Shape is per-platform and owned by the adapter:
    ///   - Bluesky:  {"appPassword":"xxxx-xxxx-xxxx-xxxx"}
    ///   - Mastodon: {"accessToken":"..."}
    /// Stored encrypted so a DB leak never exposes posting credentials —
    /// same threat model + key as user content (see EntryEncryptor).
    /// Nullable until connected.
    /// </summary>
    public string? CredentialsEncrypted { get; set; }

    /// <summary>
    /// Local-time hour (0–23) the daily spark should post for this
    /// platform, in <see cref="Application.Services.SocialPostingService"/>'s
    /// hardcoded schedule timezone (America/New_York). Per-platform so the
    /// admin can stagger platforms and hit each one's peak window.
    /// </summary>
    public int PostHourLocal { get; set; } = 9;

    /// <summary>Local-time minute (0–59) for the daily post.</summary>
    public int PostMinuteLocal { get; set; } = 0;

    // ── Evening Spark (optional second daily post) ───────────────────
    /// <summary>
    /// Opt-in: when true, this platform posts a SECOND card later in the day
    /// — a different (never-repeated) spark rendered on the dark "Blue Wash"
    /// card. Off by default so nothing changes until the admin enables it.
    /// </summary>
    public bool EveningEnabled { get; set; } = false;

    /// <summary>Local-time hour (0–23) for the evening post. Defaults to 6pm.</summary>
    public int EveningPostHourLocal { get; set; } = 18;

    /// <summary>Local-time minute (0–59) for the evening post.</summary>
    public int EveningPostMinuteLocal { get; set; } = 0;

    /// <summary>
    /// +/- jitter window in minutes applied to the scheduled time when
    /// each day's plan is created. A uniform random offset within
    /// [-Jitter, +Jitter] makes the cadence look human rather than
    /// bot-exact, which reduces spam-heuristic risk. 0 disables jitter.
    /// </summary>
    public int JitterMinutes { get; set; } = 20;

    // ── Rolling health snapshot (mirrors SubstackSettings) ───────────
    public DateTime? LastSuccessAt { get; set; }
    public DateTime? LastFailureAt { get; set; }
    public string? LastFailureMessage { get; set; }

    /// <summary>Resets to 0 on each successful post; surfaces "on fire" state in admin.</summary>
    public int ConsecutiveFailures { get; set; } = 0;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
