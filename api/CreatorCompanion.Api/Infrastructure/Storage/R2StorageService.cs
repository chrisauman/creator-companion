using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using CreatorCompanion.Api.Application.Interfaces;

namespace CreatorCompanion.Api.Infrastructure.Storage;

public class R2StorageService : IStorageService, IDisposable
{
    private readonly AmazonS3Client _client;
    private readonly string _bucket;
    private readonly string _publicUrl;

    public R2StorageService(IConfiguration config)
    {
        var accountId  = config["R2:AccountId"]      ?? throw new InvalidOperationException("R2:AccountId is not configured.");
        var accessKey  = config["R2:AccessKeyId"]    ?? throw new InvalidOperationException("R2:AccessKeyId is not configured.");
        var secretKey  = config["R2:SecretAccessKey"] ?? throw new InvalidOperationException("R2:SecretAccessKey is not configured.");
        _bucket        = config["R2:BucketName"]     ?? throw new InvalidOperationException("R2:BucketName is not configured.");
        _publicUrl     = config["R2:PublicUrl"]      ?? throw new InvalidOperationException("R2:PublicUrl is not configured.");

        var endpoint = new AmazonS3Config
        {
            ServiceURL     = $"https://{accountId}.r2.cloudflarestorage.com",
            ForcePathStyle = true
        };

        _client = new AmazonS3Client(
            new BasicAWSCredentials(accessKey, secretKey),
            endpoint);
    }

    public async Task<string> SaveAsync(Stream fileStream, string fileName, string contentType)
    {
        var key = $"{Guid.NewGuid()}_{Path.GetFileName(fileName)}";

        var request = new PutObjectRequest
        {
            BucketName  = _bucket,
            Key         = key,
            InputStream = fileStream,
            ContentType = contentType,
            DisablePayloadSigning = true
        };

        await _client.PutObjectAsync(request);
        return key;
    }

    public async Task DeleteAsync(string storagePath)
    {
        await _client.DeleteObjectAsync(_bucket, storagePath);
    }

    public string GetUrl(string storagePath)
    {
        // Guard: if storagePath is already an absolute URL (e.g. legacy row), return as-is.
        if (storagePath.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            storagePath.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            return storagePath;

        return $"{_publicUrl.TrimEnd('/')}/{Uri.EscapeDataString(storagePath)}";
    }

    public void Dispose() => _client.Dispose();
}
