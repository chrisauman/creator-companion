using System.Security.Claims;
using System.Text;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Common;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace CreatorCompanion.Api.Api.Controllers;

[ApiController]
[Route("v1/stripe")]
public class StripeController(
    IStripeService stripe,
    AppDbContext db,
    IOptions<StripeConfig> config,
    IConfiguration appConfig) : ControllerBase
{
    private readonly StripeConfig _cfg = config.Value;
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")!);

    // Stripe success/cancel/portal-return URLs come from server config
    // ONLY — never from the request's Origin/Referer header. The latter
    // is a small open-redirect-ish vector: a malicious page could hit
    // /v1/stripe/checkout, get a Stripe Checkout URL whose success_url
    // returns to its own domain (carrying the session_id in the query
    // string), and capture the post-payment redirect.
    private string AppBaseUrl =>
        (appConfig["App:BaseUrl"] ?? "https://app.creatorcompanionapp.com").TrimEnd('/');

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

        var appUrl = AppBaseUrl;

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

        var appUrl = AppBaseUrl;

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
