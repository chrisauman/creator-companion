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

        // Idempotency: Stripe retries any non-2xx delivery and can also
        // replay events (manual resend from dashboard, post-outage
        // backfill). Without this guard:
        //  - HandleCheckoutCompletedAsync re-sends receipt emails.
        //  - HandleSubscriptionUpdatedAsync replays old state transitions
        //    out of order (e.g. an old "canceled" event reverting a fresh
        //    "active" tier flip).
        // The ProcessedStripeEvents table is keyed on Stripe's event id;
        // we attempt an INSERT first; a duplicate-key violation means
        // "already processed — return 200 without doing anything."
        var alreadyProcessed = await db.ProcessedStripeEvents
            .AsNoTracking()
            .AnyAsync(e => e.Id == stripeEvent.Id);
        if (alreadyProcessed) return;

        db.ProcessedStripeEvents.Add(new Domain.Models.ProcessedStripeEvent
        {
            Id          = stripeEvent.Id,
            EventType   = stripeEvent.Type,
            ProcessedAt = DateTime.UtcNow
        });
        try
        {
            // Save the idempotency marker FIRST so a duplicate delivery
            // arriving while the handlers run still hits the dedupe path.
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Concurrent delivery beat us to it; treat as already-processed.
            return;
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

        try { await email.SendPaymentReceiptAsync(user.Email, user.FirstName); }
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

        // Do NOT downgrade on the first payment failure. Stripe's Smart
        // Retries can fire this event multiple times across the dunning
        // period (3D Secure flakes, bank fraud rules, expiring cards
        // that succeed on the next attempt). Flipping a paying customer
        // to Free at retry #1 locks them out mid-day even when Stripe
        // will succeed on a retry an hour later.
        //
        // Final cancellation is owned by HandleSubscriptionUpdatedAsync
        // (status transitions to "canceled"/"unpaid") and
        // HandleSubscriptionDeletedAsync. Keep this handler as a hook
        // for surfacing past-due status / notifying the user without
        // revoking access.
        //
        // Intentional no-op — left in place because Stripe is configured
        // to send invoice.payment_failed and a missing handler would
        // log noise.
        _ = user; // suppress unused-variable warning while leaving the read for side-effects if reintroduced
        await Task.CompletedTask;
    }

    public async Task CancelSubscriptionAsync(string subscriptionId)
    {
        StripeConfiguration.ApiKey = _cfg.SecretKey;
        var svc = new SubscriptionService();
        await svc.CancelAsync(subscriptionId);
    }

    private async Task<string> EnsureCustomerAsync(User user)
    {
        if (!string.IsNullOrEmpty(user.StripeCustomerId))
            return user.StripeCustomerId;

        var svc = new CustomerService();
        var customer = await svc.CreateAsync(new CustomerCreateOptions
        {
            Email    = user.Email,
            Name     = $"{user.FirstName} {user.LastName}".Trim(),
            Metadata = new Dictionary<string, string> { ["userId"] = user.Id.ToString() }
        });

        user.StripeCustomerId = customer.Id;
        user.UpdatedAt        = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return customer.Id;
    }
}
