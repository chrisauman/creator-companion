using CreatorCompanion.Api.Application.Interfaces;
using Microsoft.Extensions.Logging;
using CreatorCompanion.Api.Common;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Stripe;
using Stripe.Checkout;

namespace CreatorCompanion.Api.Application.Services;

public class StripeService(AppDbContext db, IOptions<StripeConfig> config, IEmailService email) : IStripeService
{
    private readonly StripeConfig _cfg = config.Value;

    public async Task<string> CreateCheckoutSessionAsync(User user, string priceId, string successUrl, string cancelUrl)
    {
        StripeConfiguration.ApiKey = _cfg.SecretKey;

        var customerId = await EnsureCustomerAsync(user);

        var options = new SessionCreateOptions
        {
            Customer = customerId,
            Mode = "subscription",
            LineItems =
            [
                new SessionLineItemOptions { Price = priceId, Quantity = 1 }
            ],
            SuccessUrl = successUrl,
            CancelUrl  = cancelUrl,
            ClientReferenceId = user.Id.ToString(),
            SubscriptionData = new SessionSubscriptionDataOptions
            {
                Metadata = new Dictionary<string, string>
                {
                    ["userId"] = user.Id.ToString()
                }
            }
        };

        var svc     = new SessionService();
        var session = await svc.CreateAsync(options);
        return session.Url;
    }

    public async Task<string> CreatePortalSessionAsync(User user, string returnUrl)
    {
        StripeConfiguration.ApiKey = _cfg.SecretKey;

        if (string.IsNullOrEmpty(user.StripeCustomerId))
            throw new InvalidOperationException("No billing account found.");

        var options = new Stripe.BillingPortal.SessionCreateOptions
        {
            Customer  = user.StripeCustomerId,
            ReturnUrl = returnUrl
        };

        var svc     = new Stripe.BillingPortal.SessionService();
        var session = await svc.CreateAsync(options);
        return session.Url;
    }

    public async Task HandleWebhookAsync(string payload, string signature)
    {
        StripeConfiguration.ApiKey = _cfg.SecretKey;

        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(payload, signature, _cfg.WebhookSecret);
        }
        catch
        {
            throw new InvalidOperationException("Invalid Stripe webhook signature.");
        }

        switch (stripeEvent.Type)
        {
            case EventTypes.CheckoutSessionCompleted:
                await HandleCheckoutCompletedAsync(stripeEvent.Data.Object as Session);
                break;

            case EventTypes.CustomerSubscriptionUpdated:
                await HandleSubscriptionUpdatedAsync(stripeEvent.Data.Object as Subscription);
                break;

            case EventTypes.CustomerSubscriptionDeleted:
                await HandleSubscriptionDeletedAsync(stripeEvent.Data.Object as Subscription);
                break;

            case EventTypes.InvoicePaymentFailed:
                await HandleInvoicePaymentFailedAsync(stripeEvent.Data.Object as Invoice);
                break;
        }
    }

    private async Task HandleCheckoutCompletedAsync(Session? session)
    {
        if (session == null) return;

        if (!Guid.TryParse(session.ClientReferenceId, out var userId)) return;

        var user = await db.Users.FindAsync(userId);
        if (user == null) return;

        user.StripeCustomerId     = session.CustomerId;
        user.StripeSubscriptionId = session.SubscriptionId;
        user.Tier                 = AccountTier.Paid;
        user.UpdatedAt            = DateTime.UtcNow;

        await db.SaveChangesAsync();

        try { await email.SendPaymentReceiptAsync(user.Email, user.Username); }
        catch (Exception ex) { Console.WriteLine($"[WARN] Failed to send receipt email to {user.Email}: {ex.Message}"); }
    }

    private async Task HandleSubscriptionUpdatedAsync(Subscription? sub)
    {
        if (sub == null) return;

        var user = await db.Users.FirstOrDefaultAsync(u => u.StripeCustomerId == sub.CustomerId);
        if (user == null) return;

        user.StripeSubscriptionId = sub.Id;
        user.Tier = sub.Status is "active" or "trialing"
            ? AccountTier.Paid
            : AccountTier.Free;
        user.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
    }

    private async Task HandleSubscriptionDeletedAsync(Subscription? sub)
    {
        if (sub == null) return;

        var user = await db.Users.FirstOrDefaultAsync(u => u.StripeCustomerId == sub.CustomerId);
        if (user == null) return;

        user.Tier                 = AccountTier.Free;
        user.StripeSubscriptionId = null;
        user.UpdatedAt            = DateTime.UtcNow;

        await db.SaveChangesAsync();
    }

    private async Task HandleInvoicePaymentFailedAsync(Invoice? invoice)
    {
        if (invoice == null || string.IsNullOrEmpty(invoice.CustomerId)) return;

        var user = await db.Users.FirstOrDefaultAsync(u => u.StripeCustomerId == invoice.CustomerId);
        if (user == null) return;

        // Only downgrade after Stripe has exhausted all retries (billing_reason = subscription_cycle
        // failures arrive multiple times; the subscription status flips to past_due first, then
        // unpaid/canceled — CustomerSubscriptionUpdated/Deleted handles final cancellation).
        // Here we just downgrade immediately on any payment failure so users can't access paid
        // features while their payment is in a failed state.
        if (user.Tier == AccountTier.Paid)
        {
            user.Tier      = AccountTier.Free;
            user.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
    }

    private async Task<string> EnsureCustomerAsync(User user)
    {
        if (!string.IsNullOrEmpty(user.StripeCustomerId))
            return user.StripeCustomerId;

        var svc = new CustomerService();
        var customer = await svc.CreateAsync(new CustomerCreateOptions
        {
            Email    = user.Email,
            Name     = user.Username,
            Metadata = new Dictionary<string, string> { ["userId"] = user.Id.ToString() }
        });

        user.StripeCustomerId = customer.Id;
        user.UpdatedAt        = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return customer.Id;
    }
}
