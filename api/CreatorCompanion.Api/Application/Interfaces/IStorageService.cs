namespace CreatorCompanion.Api.Application.Interfaces;

public interface IStorageService
{
    Task<string> SaveAsync(Stream fileStream, string fileName, string contentType);
    Task DeleteAsync(string storagePath);
    string GetUrl(string storagePath);

    /// <summary>
    /// Read the bytes at the given storage path. Added in the May 2026
    /// privacy pass so the API can fetch ciphertext from R2, decrypt it,
    /// and serve plaintext to the browser via an authenticated signed-URL
    /// endpoint. Without this, encrypted uploads would just be opaque
    /// blobs the browser could never display.
    /// </summary>
    Task<byte[]> ReadAllBytesAsync(string storagePath);
}
