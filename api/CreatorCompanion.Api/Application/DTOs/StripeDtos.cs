namespace CreatorCompanion.Api.Application.DTOs;

public record CreateCheckoutRequest(string PriceId);
public record CheckoutSessionResponse(string Url);
public record PortalSessionResponse(string Url);
public record StripeConfigResponse(string PublishableKey, string MonthlyPriceId, string AnnualPriceId);
