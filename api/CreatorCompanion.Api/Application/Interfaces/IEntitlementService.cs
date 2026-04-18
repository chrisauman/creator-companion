using CreatorCompanion.Api.Common;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface IEntitlementService
{
    TierLimits GetLimits(User user);
    void EnforceWordLimit(User user, string content);
    Task EnforceImageLimitAsync(User user, Guid entryId);
    void EnforceBackfill(User user, DateOnly entryDate, DateOnly today);
    void EnforcePause(User user);
    Task EnforceJournalLimitAsync(User user);
}
