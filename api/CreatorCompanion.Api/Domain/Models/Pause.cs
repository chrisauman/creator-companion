using CreatorCompanion.Api.Domain.Enums;

namespace CreatorCompanion.Api.Domain.Models;

public class Pause
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public PauseStatus Status { get; set; } = PauseStatus.Active;
    public string? Reason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
}
