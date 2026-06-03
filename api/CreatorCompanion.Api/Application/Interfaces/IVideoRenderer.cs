namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// Renders a vertical (1080x1920) "Daily Spark" Short as an MP4 from a
/// quote — the branded dark kinetic card with a drifting cyan glow. Frames
/// are drawn with ImageSharp (same look as the still card) and encoded to
/// H.264 by FFmpeg.
///
/// Degrade-never-fail: returns null if fonts are missing or FFmpeg isn't
/// available / errors, so the posting pipeline can skip video rather than
/// crash. <see cref="IsAvailable"/> reflects fonts only; FFmpeg is probed
/// at render time.
/// </summary>
public interface IVideoRenderer
{
    bool IsAvailable { get; }

    /// <summary>Renders the spark to an MP4 (bytes), or null on any failure.</summary>
    Task<byte[]?> RenderAsync(string quote, string? eyebrow, CancellationToken ct);
}
