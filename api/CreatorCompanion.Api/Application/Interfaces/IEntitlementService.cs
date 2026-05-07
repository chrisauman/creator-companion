using CreatorCompanion.Api.Common;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface IEntitlementService
{
    /// <summary>
    /// Resolves a user's effective limits. With the trial-only pricing
    /// model (no Free tier), all users in good standing get the full
    /// paid limits — this returns those values once `HasAccess` is true,
    /// otherwise returns Free as a defensive fallback (most call sites
    /// also gate on HasAccess, so the Free path should be unreachable
    /// in practice).
    /// </summary>
    TierLimits GetLimits(User user);

    /// <summary>
    /// True iff the user can read AND write their data right now —
    /// either inside their 10-day trial OR with an active Stripe
    /// subscription. Single source of truth; every entitlement check
    /// AND the global write-block filter route through here.
    /// </summary>
    bool HasAccess(User user);

    /// <summary>
    /// True iff the user is currently inside their trial window.
    /// Used by the frontend to decide whether to show the trial
    /// countdown banner. Distinct from HasAccess because a subscribed
    /// user has access without a trial; an expired user has neither.
    /// </summary>
    bool IsInTrial(User user);

    /// <summary>
    /// True iff the user has an active Stripe subscription. Used by
    /// the frontend to hide the "Subscribe" CTA and show "Manage
    /// subscription" instead.
    /// </summary>
    bool HasActiveSubscription(User user);

    void EnforceWordLimit(User user, string content);
    Task EnforceImageLimitAsync(User user, Guid entryId);
    void EnforceBackfill(User user, DateOnly entryDate, DateOnly today);
    void EnforcePause(User user);
    Task EnforceJournalLimitAsync(User user);

    /// <summary>
    /// Throws when the user no longer has access (trial expired AND
    /// no active subscription). All write endpoints call this as
    /// their first line of defense; the global filter catches anything
    /// missed. Read endpoints stay open so users can still see their
    /// existing data while deciding to subscribe.
    /// </summary>
    void EnforceAccess(User user);
}
