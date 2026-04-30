using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface IStripeService
{
    Task<string> CreateCheckoutSessionAsync(User user, string priceId, string successUrl, string cancelUrl);
    Task<string> CreatePortalSessionAsync(User user, string returnUrl);
    Task HandleWebhookAsync(string payload, string signature);
    Task CancelSubscriptionAsync(string subscriptionId);
}
