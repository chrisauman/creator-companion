namespace CreatorCompanion.Api.Domain.Models;

/// <summary>
/// Idempotency record for Stripe webhook delivery. Stripe retries any
/// non-2xx response under back-off and may also redeliver events for
/// other reasons (replay after outage, manual resend from dashboard).
/// Without this table, the same `checkout.session.completed` could fire
/// duplicate receipt emails or re-flip subscription state out of order.
///
/// The Id is Stripe's event id (e.g. `evt_1OabcDEF…`) and is treated
/// as the natural primary key.
/// </summary>
public class ProcessedStripeEvent
{
    public string Id { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;
}
