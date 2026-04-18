using CreatorCompanion.Api.Application.Interfaces;

namespace CreatorCompanion.Api.Infrastructure.Storage;

// Dev-only implementation. Swap for AzureBlobStorageService in production
// without changing any service or controller code.
public class LocalStorageService(IConfiguration config, IWebHostEnvironment env) : IStorageService
{
    private readonly string _basePath = Path.Combine(
        env.ContentRootPath, "uploads");

    public async Task<string> SaveAsync(Stream fileStream, string fileName, string contentType)
    {
        Directory.CreateDirectory(_basePath);

        var uniqueName = $"{Guid.NewGuid()}_{Path.GetFileName(fileName)}";
        var fullPath = Path.Combine(_basePath, uniqueName);

        await using var fs = File.Create(fullPath);
        await fileStream.CopyToAsync(fs);

        return uniqueName; // stored as relative path / blob key
    }

    public Task DeleteAsync(string storagePath)
    {
        var fullPath = Path.Combine(_basePath, storagePath);
        if (File.Exists(fullPath))
            File.Delete(fullPath);
        return Task.CompletedTask;
    }

    public string GetUrl(string storagePath) =>
        $"/v1/media/file/{Uri.EscapeDataString(storagePath)}";
}
