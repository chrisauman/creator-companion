using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

public class AnalyticsEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public AnalyticsEventType EventType { get; set; }

    // JSON context (never entry content)
    public string Metadata { get; set; } = "{}";
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
}
