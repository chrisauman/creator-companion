namespace CreatorCompanion.Api.Application.Interfaces;

public interface IAuditService
{
    Task LogAsync(string eventName, Guid? userId = null, string? detail = null);
}
