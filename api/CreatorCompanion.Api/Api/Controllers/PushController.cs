using System.Security.Claims;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/push")]
[Authorize]
public class PushController(AppDbContext db, IConfiguration config) : ControllerBase
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
