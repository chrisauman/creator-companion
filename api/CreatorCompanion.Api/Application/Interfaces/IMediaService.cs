using CreatorCompanion.Api.Application.DTOs;
using Microsoft.AspNetCore.Http;

namespace CreatorCompanion.Api.Application.Interfaces;

public interface IMediaService
{
    Task<MediaSummary> UploadAsync(Guid userId, Guid entryId, IFormFile file);
    Task DeleteAsync(Guid userId, Guid mediaId);
}
