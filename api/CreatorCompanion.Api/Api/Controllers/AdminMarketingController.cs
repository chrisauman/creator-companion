using System.Text.Json;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

/// <summary>
/// Admin-only controller for the Marketing auto-poster. Surfaces the
/// global kill switch + per-platform connection/schedule, today's plan
/// per platform (with "post now" / "reroll"), send history, eligible-
/// spark counts, and the ad-hoc compose path. The daily firing itself
/// runs in SocialPostingBackgroundService; this controller is config +
/// manual triggers, all routed through ISocialPostingService so the
/// firing logic lives in exactly one place.
/// </summary>
[ApiController]
[Route("v1/admin/marketing")]
[Authorize(Roles = "Admin")]
public class AdminMarketingController(
    AppDbContext db,
    ISocialPostingService posting,
    IEnumerable<ISocialPoster> posters,
    IHashtagService hashtags,
    IQuoteCardRenderer quoteCards,
    IEntryEncryptor encryptor,
    IStorageService storage) : ControllerBase
{
    private const long MaxImageBytes = 10 * 1024 * 1024; // 10 MB

    // ── Settings + accounts ──────────────────────────────────────────

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken ct)
    {
        var settings = await GetOrCreateSettingsAsync(ct);
        var accounts = await db.SocialAccounts.ToListAsync(ct);

        // Only expose platforms that actually have a shipped adapter, so
        // the UI never offers a platform we can't post to yet.
        var rows = posters
            .OrderBy(p => p.Platform)
            .Select(poster =>
            {
                var a = accounts.FirstOrDefault(x => x.Platform == poster.Platform);
                return new SocialAccountResponse(
                    Platform:            poster.Platform.ToString(),
                    Enabled:             a?.Enabled ?? false,
                    Handle:              a?.Handle,
                    Endpoint:            a?.Endpoint,
                    HasCredentials:      !string.IsNullOrWhiteSpace(a?.CredentialsEncrypted),
                    PostHourLocal:       a?.PostHourLocal ?? 9,
                    PostMinuteLocal:     a?.PostMinuteLocal ?? 0,
                    JitterMinutes:       a?.JitterMinutes ?? 20,
                    CharacterLimit:      poster.CharacterLimit,
                    SupportsImages:      poster.SupportsImages,
                    LastSuccessAt:       a?.LastSuccessAt,
                    LastFailureAt:       a?.LastFailureAt,
                    LastFailureMessage:  a?.LastFailureMessage,
                    ConsecutiveFailures: a?.ConsecutiveFailures ?? 0);
            })
            .ToList();

        return Ok(new SocialSettingsResponse(
            settings.AutoPostEnabled, settings.AutoHashtagsEnabled, settings.DailyQuoteCardsEnabled,
            hashtags.IsConfigured, quoteCards.IsAvailable, rows));
    }

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateSocialSettingsRequest req, CancellationToken ct)
    {
        var settings = await GetOrCreateSettingsAsync(ct);
        settings.AutoPostEnabled        = req.AutoPostEnabled;
        settings.AutoHashtagsEnabled    = req.AutoHashtagsEnabled;
        settings.DailyQuoteCardsEnabled = req.DailyQuoteCardsEnabled;
        settings.UpdatedAt              = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return await GetSettings(ct);
    }

    [HttpPut("accounts/{platform}")]
    public async Task<IActionResult> UpdateAccount(
        string platform, [FromBody] UpdateSocialAccountRequest req, CancellationToken ct)
    {
        if (!TryParsePlatform(platform, out var p))
            return BadRequest(new { error = $"Unknown platform '{platform}'." });
        if (ResolvePoster(p) is null)
            return BadRequest(new { error = $"No adapter for {p} yet." });

        var account = await db.SocialAccounts.FirstOrDefaultAsync(a => a.Platform == p, ct);
        if (account is null)
        {
            account = new SocialAccount { Platform = p };
            db.SocialAccounts.Add(account);
        }

        account.Enabled         = req.Enabled;
        account.Handle          = string.IsNullOrWhiteSpace(req.Handle) ? null : req.Handle.Trim();
        account.Endpoint        = string.IsNullOrWhiteSpace(req.Endpoint) ? null : req.Endpoint.Trim();
        account.PostHourLocal   = Math.Clamp(req.PostHourLocal, 0, 23);
        account.PostMinuteLocal = Math.Clamp(req.PostMinuteLocal, 0, 59);
        account.JitterMinutes   = Math.Clamp(req.JitterMinutes, 0, 240);
        account.UpdatedAt       = DateTime.UtcNow;

        // Only (re)write credentials when a new secret is actually
        // supplied — a blank field means "keep what's stored", so the
        // admin can tweak the schedule without re-pasting the secret.
        var credential = BuildCredentialJson(p, req);
        if (credential is not null)
            account.CredentialsEncrypted = encryptor.EncryptString(credential);

        await db.SaveChangesAsync(ct);
        return await GetSettings(ct);
    }

    // ── Today / fire-now / reroll ─────────────────────────────────────

    [HttpGet("today")]
    public async Task<IActionResult> GetToday(CancellationToken ct)
    {
        var today = TodayInScheduleTz();
        var plans = await db.SocialDailyPlans
            .Include(p => p.Spark)
            .Where(p => p.Date == today)
            .ToListAsync(ct);
        return Ok(plans.Select(MapPlan));
    }

    [HttpPost("today/fire-now")]
    public async Task<IActionResult> FireNow([FromQuery] string platform, CancellationToken ct)
    {
        if (!TryParsePlatform(platform, out var p))
            return BadRequest(new { error = $"Unknown platform '{platform}'." });

        var result = await posting.FireDailyNowAsync(p, ct);
        return Ok(new FireNowResponse(p.ToString(), result.Success, result.PostedUrl, result.ExternalId, result.ErrorMessage));
    }

    [HttpPost("today/reroll")]
    public async Task<IActionResult> Reroll([FromQuery] string platform, CancellationToken ct)
    {
        if (!TryParsePlatform(platform, out var p))
            return BadRequest(new { error = $"Unknown platform '{platform}'." });
        await posting.RerollTodayAsync(p, ct);
        return NoContent();
    }

    // ── History + eligible counts ─────────────────────────────────────

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(CancellationToken ct)
    {
        var plans = await db.SocialDailyPlans
            .Include(p => p.Spark)
            .OrderByDescending(p => p.Date).ThenBy(p => p.Platform)
            .Take(90)
            .ToListAsync(ct);
        return Ok(plans.Select(MapPlan));
    }

    [HttpGet("eligible-count")]
    public async Task<IActionResult> GetEligibleCount(CancellationToken ct)
    {
        var total = await db.MotivationEntries.CountAsync(ct);
        var result = new List<SocialEligibleCount>();
        foreach (var poster in posters.OrderBy(p => p.Platform))
        {
            var posted = await db.SocialDailyPlans
                .Where(p => p.Platform == poster.Platform && p.Status == SocialPostStatus.Posted)
                .Select(p => p.SparkId)
                .Distinct()
                .CountAsync(ct);
            result.Add(new SocialEligibleCount(poster.Platform.ToString(), Math.Max(0, total - posted)));
        }
        return Ok(result);
    }

    // ── Ad-hoc posts ──────────────────────────────────────────────────

    [HttpGet("posts")]
    public async Task<IActionResult> GetPosts(CancellationToken ct)
    {
        var posts = await db.SocialPosts
            .Include(p => p.Targets)
            .OrderByDescending(p => p.CreatedAt)
            .Take(50)
            .ToListAsync(ct);
        return Ok(posts.Select(MapPost));
    }

    [HttpPost("posts")]
    [RequestSizeLimit(MaxImageBytes + 512 * 1024)]
    public async Task<IActionResult> CreatePost([FromForm] CreateAdHocPostForm form, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(form.Body) && form.Image is null)
            return BadRequest(new { error = "A post needs body text or an image." });

        // Resolve + validate target platforms against shipped adapters.
        var platforms = new List<SocialPlatform>();
        foreach (var name in form.Platforms.Distinct())
        {
            if (TryParsePlatform(name, out var p) && ResolvePoster(p) is not null)
                platforms.Add(p);
        }
        if (platforms.Count == 0)
            return BadRequest(new { error = "Select at least one connected platform." });

        // Optional image: validate + store raw (admin promo media, not
        // private user content — no at-rest encryption needed here).
        string? imageKey = null, imageContentType = null;
        if (form.Image is { Length: > 0 } img)
        {
            if (img.Length > MaxImageBytes)
                return BadRequest(new { error = "Image exceeds 10 MB." });
            if (string.IsNullOrEmpty(img.ContentType) || !img.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { error = "Only image files are allowed." });

            await using var stream = img.OpenReadStream();
            imageKey = await storage.SaveAsync(stream, img.FileName, img.ContentType);
            imageContentType = img.ContentType;
        }

        var post = new SocialPost
        {
            Body              = (form.Body ?? string.Empty).Trim(),
            IncludeHashtags   = form.IncludeHashtags,
            GenerateQuoteCard = form.GenerateQuoteCard,
            ImageObjectKey    = imageKey,
            ImageContentType = imageContentType,
            ScheduledFor     = form.ScheduledFor,
            CreatedByUserId  = CurrentUserId(),
            CreatedAt        = DateTime.UtcNow,
            Targets          = platforms.Select(p => new SocialPostTarget { Platform = p }).ToList(),
        };
        db.SocialPosts.Add(post);
        await db.SaveChangesAsync(ct);

        // Publish immediately unless scheduled for the future. Scheduled
        // posts are picked up by the worker when due.
        if (post.ScheduledFor is null || post.ScheduledFor <= DateTime.UtcNow)
            await posting.PublishAdHocNowAsync(post.Id, ct);

        var fresh = await db.SocialPosts.Include(p => p.Targets).FirstAsync(p => p.Id == post.Id, ct);
        return Ok(MapPost(fresh));
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private SocialPlanResponse MapPlan(SocialDailyPlan p) => new(
        Id: p.Id, Date: p.Date, Platform: p.Platform.ToString(), ScheduledFor: p.ScheduledFor,
        Status: p.Status.ToString(), PostedAt: p.PostedAt, PostedText: p.PostedText,
        PostedUrl: p.PostedUrl, ErrorMessage: p.ErrorMessage, SparkId: p.SparkId,
        SparkTakeaway: p.Spark?.Takeaway ?? "(spark missing)");

    private AdHocPostResponse MapPost(SocialPost p) => new(
        Id: p.Id, Body: p.Body, IncludeHashtags: p.IncludeHashtags,
        ImageUrl: p.ImageObjectKey is null ? null : storage.GetUrl(p.ImageObjectKey),
        ScheduledFor: p.ScheduledFor, CreatedAt: p.CreatedAt,
        Targets: p.Targets.Select(t => new AdHocTargetResponse(
            t.Platform.ToString(), t.Status.ToString(), t.PostedUrl, t.ErrorMessage, t.PostedAt)).ToList());

    /// <summary>Builds the per-platform credential JSON, or null when no new secret was supplied.</summary>
    private static string? BuildCredentialJson(SocialPlatform platform, UpdateSocialAccountRequest req) => platform switch
    {
        SocialPlatform.Bluesky when !string.IsNullOrWhiteSpace(req.AppPassword)
            => JsonSerializer.Serialize(new { appPassword = req.AppPassword!.Trim() }),
        // Mastodon + the Meta platforms (Threads / Facebook Page / Instagram)
        // all authenticate with a single pasted access token.
        (SocialPlatform.Mastodon or SocialPlatform.Threads or SocialPlatform.Facebook
            or SocialPlatform.Instagram) when !string.IsNullOrWhiteSpace(req.AccessToken)
            => JsonSerializer.Serialize(new { accessToken = req.AccessToken!.Trim() }),
        _ => null,
    };

    private static bool TryParsePlatform(string? value, out SocialPlatform platform) =>
        Enum.TryParse(value, ignoreCase: true, out platform) && Enum.IsDefined(platform);

    private ISocialPoster? ResolvePoster(SocialPlatform platform) =>
        posters.FirstOrDefault(x => x.Platform == platform);

    private static DateOnly TodayInScheduleTz()
    {
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York"); }
        catch (TimeZoneNotFoundException) { tz = TimeZoneInfo.Utc; }
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
    }

    private async Task<SocialSettings> GetOrCreateSettingsAsync(CancellationToken ct)
    {
        var s = await db.SocialSettings.FirstOrDefaultAsync(ct);
        if (s is not null) return s;
        s = new SocialSettings();
        db.SocialSettings.Add(s);
        await db.SaveChangesAsync(ct);
        return s;
    }

    private Guid CurrentUserId()
    {
        var sub = User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value
               ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(sub, out var id) ? id : Guid.Empty;
    }
}
