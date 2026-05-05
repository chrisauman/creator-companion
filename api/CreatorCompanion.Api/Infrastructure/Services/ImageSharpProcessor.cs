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

    public bool CanProcess(string contentType) => Supported.Contains(contentType);

    public async Task<(Stream Stream, string ContentType)> ProcessAsync(
        Stream source,
        int maxLongestSide,
        int jpegQuality = 82)
    {
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
