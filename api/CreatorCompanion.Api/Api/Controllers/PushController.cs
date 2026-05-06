using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WebPushLib = WebPush;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/push")]
[Authorize]
public class PushController(AppDbContext db, IConfiguration config, IPushSender sender) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    /// <summary>Returns the VAPID public key so the browser can subscribe.</summary>
    [HttpGet("vapid-public-key")]
    public IActionResult GetVapidPublicKey()
    {
        var key = config["Vapid:PublicKey"];
        if (string.IsNullOrEmpty(key))
            return StatusCode(503, new { error = "Push notifications not configured." });

        return Ok(new { publicKey = key });
    }

    /// <summary>Saves or refreshes a push subscription for the current device.</summary>
    [HttpPost("subscribe")]
    public async Task<IActionResult> Subscribe([FromBody] SubscribeRequest request)
    {
        // Upsert: update if endpoint already exists, otherwise create
        var existing = await db.PushSubscriptions
            .FirstOrDefaultAsync(s => s.Endpoint == request.Endpoint);

        if (existing is not null)
        {
            existing.P256dh     = request.P256dh;
            existing.Auth       = request.Auth;
            existing.LastSeenAt = DateTime.UtcNow;
        }
        else
        {
            db.PushSubscriptions.Add(new PushSubscription
            {
                UserId   = UserId,
                Platform = request.Platform,
                Endpoint = request.Endpoint,
                P256dh   = request.P256dh,
                Auth     = request.Auth,
            });
        }

        await db.SaveChangesAsync();
        return Ok(new { subscribed = true });
    }

    /// <summary>
    /// Sends a test notification to every registered subscription for the
    /// current user, immediately. Used by the "Send test" button on the
    /// notifications settings page so users can verify push delivery
    /// independently of the daily reminder schedule. Returns per-endpoint
    /// status so the UI can surface specific failures (no subscription,
    /// expired subscription, VAPID misconfigured, etc).
    /// </summary>
    [HttpPost("test")]
    public async Task<IActionResult> SendTest()
    {
        var subs = await db.PushSubscriptions.Where(s => s.UserId == UserId).ToListAsync();
        if (subs.Count == 0)
            return Ok(new { sent = 0, total = 0, message = "No push subscriptions registered for this account. Toggle Notifications off and back on to re-subscribe." });

        var sent = 0;
        var expired = new List<string>();
        var errors = new List<string>();

        foreach (var sub in subs)
        {
            try
            {
                await sender.SendAsync(sub, "Creator Companion", "Test notification — push delivery is working.");
                sent++;
            }
            catch (WebPushLib.WebPushException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Gone)
            {
                expired.Add(sub.Endpoint);
            }
            catch (Exception ex)
            {
                errors.Add(ex.Message);
            }
        }

        if (expired.Count > 0)
        {
            var stale = await db.PushSubscriptions.Where(s => expired.Contains(s.Endpoint)).ToListAsync();
            db.PushSubscriptions.RemoveRange(stale);
            await db.SaveChangesAsync();
        }

        return Ok(new {
            sent,
            total   = subs.Count,
            expired = expired.Count,
            errors  = errors.Count > 0 ? errors : null,
            message = sent > 0
                ? $"Test notification sent to {sent} of {subs.Count} device(s)."
                : "All subscriptions failed. Re-enable notifications to refresh."
        });
    }

    /// <summary>Removes a push subscription (e.g. user disables notifications).</summary>
    [HttpDelete("subscribe")]
    public async Task<IActionResult> Unsubscribe([FromBody] UnsubscribeRequest request)
    {
        var sub = await db.PushSubscriptions
            .FirstOrDefaultAsync(s => s.Endpoint == request.Endpoint && s.UserId == UserId);

        if (sub is not null)
        {
            db.PushSubscriptions.Remove(sub);
            await db.SaveChangesAsync();
        }

        return NoContent();
    }
}
