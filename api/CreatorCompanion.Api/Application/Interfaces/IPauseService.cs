using CreatorCompanion.Api.Application.DTOs;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface IPauseService
{
    Task<PauseResponse> CreatePauseAsync(Guid userId, CreatePauseRequest request);
    Task<PauseResponse?> GetActivePauseAsync(Guid userId);
    Task CancelPauseAsync(Guid userId, Guid pauseId);
}
