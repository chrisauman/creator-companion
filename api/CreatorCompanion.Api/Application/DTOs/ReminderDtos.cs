using System.ComponentModel.DataAnnotations;

namespace CreatorCompanion.Api.Application.DTOs;

public record CreateReminderRequest(
    [Required] string Time,            // "HH:mm" e.g. "08:30"
    [MaxLength(200)] string? Message   // null = use default message
);

public record UpdateReminderRequest(
    [Required] string Time,
    [MaxLength(200)] string? Message,
    bool IsEnabled
);

public record ReminderResponse(
    Guid Id,
    string Time,        // "HH:mm"
    string? Message,
    bool IsEnabled,
    bool IsDefault,
    DateTime CreatedAt
);

public record SubscribeRequest(
    [Required] string Endpoint,
    [Required] string P256dh,
    [Required] string Auth,
    string Platform = "web"
);

public record UnsubscribeRequest(
    [Required] string Endpoint
);
