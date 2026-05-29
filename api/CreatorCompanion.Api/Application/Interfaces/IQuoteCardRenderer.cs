namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// Renders a Daily Spark (or any short text) as a branded square image —
/// a "quote card" — for attaching to social posts. Image posts get
/// materially more reach than plain text on every platform, and this is
/// the foundation for visual platforms later.
///
/// Degrade-never-fail: if the bundled fonts are missing or rendering
/// throws, <see cref="Render"/> returns null and the posting pipeline
/// simply posts without an image. <see cref="IsAvailable"/> lets callers
/// skip the work entirely when fonts didn't load.
/// </summary>
public interface IQuoteCardRenderer
{
    bool IsAvailable { get; }

    /// <summary>
    /// Renders <paramref name="quote"/> centered on the brand cream card,
    /// with an optional small caps eyebrow above it. Returns PNG bytes,
    /// or null on any failure.
    /// </summary>
    byte[]? Render(string quote, string? eyebrow = null);
}
