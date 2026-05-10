using CreatorCompanion.Api.Application.Interfaces;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;

namespace CreatorCompanion.Api.Infrastructure.Services;

/// <summary>
/// IImageProcessor backed by SixLabors.ImageSharp. Decodes JPEG,
/// PNG, and WebP; outputs JPEG. Auto-orients per EXIF so photos
/// rotated by a phone camera show up the right way after upload.
/// </summary>
public sealed class ImageSharpProcessor : IImageProcessor
{
    /// <summary>
    /// MIME types we can round-trip through ImageSharp. HEIC/HEIF are
    /// intentionally excluded — the underlying engine doesn't ship
    /// with a HEIC decoder, so we fall back to storing the original.
    /// </summary>
    private static readonly HashSet<string> Supported = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp"
    };

    // Decompression-bomb guard: reject any image whose pixel count
    // exceeds this before we let ImageSharp allocate a full buffer.
    // 50 megapixels covers any phone/DSLR with headroom; anything
    // bigger is almost certainly a crafted file aimed at OOMing the
    // process. (Image.Identify only reads the header so this check
    // is cheap.)
    private const long MaxPixelCount = 50L * 1024 * 1024;

    public bool CanProcess(string contentType) => Supported.Contains(contentType);

    public async Task<(Stream Stream, string ContentType)> ProcessAsync(
        Stream source,
        int maxLongestSide,
        int jpegQuality = 82)
    {
        // Identify header-only before LoadAsync — bails on a crafted
        // 100KB PNG that would decompress to multi-GB.
        var startPos = source.CanSeek ? source.Position : 0;
        ImageInfo info;
        try
        {
            info = await Image.IdentifyAsync(source);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException("Unsupported or malformed image file.", ex);
        }

        if (info is null)
            throw new InvalidOperationException("Unsupported or malformed image file.");

        if ((long)info.Width * info.Height > MaxPixelCount)
            throw new InvalidOperationException(
                $"Image is too large to process ({info.Width}x{info.Height}).");

        // Identify consumed the header; rewind before LoadAsync.
        if (source.CanSeek) source.Position = startPos;

        using var image = await Image.LoadAsync(source);

        // Auto-rotate based on EXIF orientation — required so photos
        // taken in portrait don't render sideways.
        image.Mutate(ctx =>
        {
            ctx.AutoOrient();

            // Only downscale; never enlarge. ResizeMode.Max preserves
            // aspect ratio and caps the longest dimension.
            if (image.Width > maxLongestSide || image.Height > maxLongestSide)
            {
                ctx.Resize(new ResizeOptions
                {
                    Size = new Size(maxLongestSide, maxLongestSide),
                    Mode = ResizeMode.Max
                });
            }
        });

        var output = new MemoryStream();
        await image.SaveAsJpegAsync(output, new JpegEncoder { Quality = jpegQuality });
        output.Position = 0;
        return (output, "image/jpeg");
    }
}
