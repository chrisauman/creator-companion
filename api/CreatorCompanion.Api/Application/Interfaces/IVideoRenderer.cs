namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// Renders a vertical (1080x1920) "Daily Spark" Short as an MP4 from a
/// quote. The renderer owns a LIBRARY of visual themes (background
/// animation x color treatment); the caller passes a theme index so the
/// daily poster can rotate through them — a fresh look every day, cycling
/// the whole set before any repeat (same spirit as the never-repeat spark
/// picker). Frames are drawn with ImageSharp and encoded to H.264 by FFmpeg.
///
/// Degrade-never-fail: returns null if fonts are missing or FFmpeg isn't
/// available / errors, so the posting pipeline can skip video rather than
/// crash. <see cref="IsAvailable"/> reflects fonts only; FFmpeg is probed
/// at render time.
/// </summary>
public interface IVideoRenderer
{
    bool IsAvailable { get; }

    /// <summary>How many themes are in the rotation pool. The poster picks
    /// today's theme as <c>dayNumber % ThemeCount</c>.</summary>
    int ThemeCount { get; }

    /// <summary>
    /// Renders the spark to an MP4 (bytes), or null on any failure.
    /// <paramref name="themeIndex"/> selects the visual theme; it is taken
    /// modulo <see cref="ThemeCount"/>, so any integer (e.g. day-of-year)
    /// is safe to pass.
    /// </summary>
    Task<byte[]?> RenderAsync(string quote, string? eyebrow, int themeIndex, CancellationToken ct);
}
