namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// Resizes and re-encodes user-uploaded images before they hit
/// storage so we never persist multi-megabyte originals from modern
/// phone cameras.
/// </summary>
public interface IImageProcessor
{
    /// <summary>
    /// Read the source stream, downscale it so the longest side
    /// is no greater than <paramref name="maxLongestSide"/> pixels
    /// (preserving aspect ratio), apply EXIF orientation, and
    /// re-encode as JPEG at the configured quality.
    /// </summary>
    /// <returns>
    /// A tuple of the processed image data and the resulting MIME
    /// type ("image/jpeg"). Caller owns the returned stream and
    /// must dispose / read it.
    /// </returns>
    /// <remarks>
    /// HEIC inputs are <b>not</b> supported by the underlying
    /// ImageSharp engine — call <see cref="CanProcess"/> first to
    /// decide whether to process or pass through.
    /// </remarks>
    Task<(Stream Stream, string ContentType)> ProcessAsync(
        Stream source,
        int maxLongestSide,
        int jpegQuality = 82);

    /// <summary>
    /// True when the given MIME type can be decoded and re-encoded.
    /// HEIC / HEIF return false (we store those as-is for now).
    /// </summary>
    bool CanProcess(string contentType);
}
