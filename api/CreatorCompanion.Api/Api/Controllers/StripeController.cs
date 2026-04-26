using System.Security.Claims;
using System.Text;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Common;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/stripe")]
public class StripeController(
    IStripeService stripe,
    AppDbContext db,
    IOptions<StripeConfig> config) : ControllerBase
{
    private readonly StripeConfig _cfg = config.Value;
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    [HttpGet("config")]
    [Authorize]
    public IActionResult GetConfig() =>
        Ok(new StripeConfigResponse(_cfg.PublishableKey, _cfg.MonthlyPriceId, _cfg.AnnualPriceId));

    [HttpPost("checkout")]
    [Authorize]
    public async Task<IActionResult> CreateCheckout([FromBody] CreateCheckoutRequest request)
    {
        var user = await db.Users.FindAsync(UserId);
        if (user == null) return Unauthorized();

        var appUrl = HttpContext.Request.Headers["Origin"].FirstOrDefault()
            ?? "https://app.creatorcompanionapp.com";

        try
        {
            var url = await stripe.CreateCheckoutSessionAsync(
                user,
                request.PriceId,
                $"{appUrl}/billing/success",
                $"{appUrl}/billing/cancel");
            return Ok(new CheckoutSessionResponse(url));
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("portal")]
    [Authorize]
    public async Task<IActionResult> CreatePortal()
    {
        var user = await db.Users.FindAsync(UserId);
        if (user == null) return Unauthorized();

        var appUrl = HttpContext.Request.Headers["Origin"].FirstOrDefault()
            ?? "https://app.creatorcompanionapp.com";

        try
        {
            var url = await stripe.CreatePortalSessionAsync(user, $"{appUrl}/account");
            return Ok(new PortalSessionResponse(url));
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Webhook()
    {
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var payload   = await reader.ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"].FirstOrDefault() ?? string.Empty;

        try
        {
            await stripe.HandleWebhookAsync(payload, signature);
            return Ok();
        }
        catch (InvalidOperationException)
        {
            return BadRequest();
        }
    }
}
