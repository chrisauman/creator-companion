namespace CreatorCompanion.Api.Application.Interfaces;

public interface IStorageService
{
    Task<string> SaveAsync(Stream fileStream, string fileName, string contentType);
    Task DeleteAsync(string storagePath);
    string GetUrl(string storagePath);
}
