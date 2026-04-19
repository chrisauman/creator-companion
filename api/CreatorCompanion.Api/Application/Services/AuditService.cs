using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;

namespace CreatorCompanion.Api.Application.Services;

public class AuditService(AppDbContext db, IHttpContextAccessor http) : IAuditService
{
    public async Task LogAsync(string eventName, Guid? userId = null, string? detail = null)
    {
        var ctx = http.HttpContext;
        var ip  = ctx?.Connection.RemoteIpAddress?.ToString()
               ?? ctx?.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        var ua  = ctx?.Request.Headers["User-Agent"].FirstOrDefault();

        db.AuditLogs.Add(new AuditLog
        {
            Event     = eventName,
            UserId    = userId,
            Detail    = detail,
            IpAddress = ip,
            UserAgent = ua
        });

        await db.SaveChangesAsync();
    }
}
