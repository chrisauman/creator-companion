using CreatorCompanion.Api.Application.Interfaces;
using SixLabors.Fonts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace CreatorCompanion.Api.Infrastructure.Services;

/// <summary>
/// ImageSharp.Drawing implementation of the branded quote card. Mirrors
/// the in-app "engagement card" identity: cream gradient surface, a small
/// cyan caps eyebrow, the quote centered in Fraunces, and the wordmark
/// at the foot in Inter.
///
/// Fonts are bundled under wwwroot/fonts (Fraunces.ttf, Inter.ttf, both
/// OFL) and loaded once at startup into a FontCollection. If the files
/// are missing (e.g. trimmed from a build) the renderer reports
/// IsAvailable=false and Render returns null — posts then go out without
/// an image rather than failing.
///
/// Singleton: FontCollection load is one-shot and rendering is stateless.
/// </summary>
public class QuoteCardRenderer : IQuoteCardRenderer
{
    // 1080x1080 square — universally accepted across Bluesky, Mastodon,
    // and (later) the visual platforms. Brand palette pulled straight
    // from CLAUDE.md so the card reads as part of the product.
    private const int Size = 1080;
    private const int Margin = 110;
    private static readonly Color CreamTop  = Color.ParseHex("FDFAF2");
    private static readonly Color CreamBot  = Color.ParseHex("F6F1E6");
    private static readonly Color Ink        = Color.ParseHex("1A1D24");
    private static readonly Color InkMuted   = Color.ParseHex("6B7280");
    private static readonly Color Cyan        = Color.ParseHex("12C4E3");

    // Footer logo mark (the cyan-spiral brand icon) drawn above the
    // wordmark. Rendered at this size on the 1080² card.
    private const int LogoSize = 104;

    private readonly ILogger<QuoteCardRenderer> _log;
    private readonly FontFamily? _serif;   // Fraunces — the quote
    private readonly FontFamily? _sans;     // Inter — eyebrow + wordmark
    private readonly byte[]? _logoBytes;    // logo-icon.png; null = wordmark only

    public bool IsAvailable => _serif is not null && _sans is not null;

    public QuoteCardRenderer(IWebHostEnvironment env, ILogger<QuoteCardRenderer> log)
    {
        _log = log;
        try
        {
            var wwwroot = Path.Combine(env.ContentRootPath, "wwwroot");
            var dir = Path.Combine(wwwroot, "fonts");
            var collection = new FontCollection();
            var fraunces = Path.Combine(dir, "Fraunces.ttf");
            var inter    = Path.Combine(dir, "Inter.ttf");
            if (File.Exists(fraunces)) _serif = collection.Add(fraunces);
            if (File.Exists(inter))    _sans  = collection.Add(inter);

            // Logo is optional — if missing, the footer falls back to the
            // wordmark text alone (so rendering never depends on it).
            var logoPath = Path.Combine(wwwroot, "brand", "logo-icon.png");
            if (File.Exists(logoPath)) _logoBytes = File.ReadAllBytes(logoPath);

            if (!IsAvailable)
                _log.LogWarning("Quote card fonts not found in {Dir}; quote-card rendering disabled.", dir);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Quote card font load failed; quote-card rendering disabled.");
        }
    }

    public byte[]? Render(string quote, string? eyebrow = null)
    {
        if (!IsAvailable || string.IsNullOrWhiteSpace(quote)) return null;

        try
        {
            quote = quote.Trim();
            // Smart quotes around the text reinforce the "this is a quote"
            // read; curly marks match the literary brand voice.
            var display = $"“{quote}”";

            using var image = new Image<Rgba32>(Size, Size);
            image.Mutate(ctx =>
            {
                // Cream vertical gradient background.
                var bg = new LinearGradientBrush(
                    new PointF(0, 0), new PointF(0, Size),
                    GradientRepetitionMode.None,
                    new ColorStop(0f, CreamTop),
                    new ColorStop(1f, CreamBot));
                ctx.Fill(bg, new RectangleF(0, 0, Size, Size));

                // Optional cyan caps eyebrow near the top.
                if (!string.IsNullOrWhiteSpace(eyebrow))
                {
                    var eyebrowFont = _sans!.Value.CreateFont(30f, FontStyle.Bold);
                    var eyebrowOpts = new RichTextOptions(eyebrowFont)
                    {
                        Origin = new PointF(Size / 2f, 150f),
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                        TextAlignment = TextAlignment.Center,
                    };
                    ctx.DrawText(eyebrowOpts, eyebrow.ToUpperInvariant(), Cyan);
                }

                // Auto-size the quote to fit the central box. Slightly
                // shorter than the full height + nudged up to leave room for
                // the logo + wordmark lockup at the foot.
                var maxWidth  = Size - 2 * Margin;
                var maxHeight = 540f;
                var quoteFont = FitFont(display, maxWidth, maxHeight);
                var quoteOpts = new RichTextOptions(quoteFont)
                {
                    Origin = new PointF(Size / 2f, Size / 2f - 26f),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    TextAlignment = TextAlignment.Center,
                    WrappingLength = maxWidth,
                    LineSpacing = 1.18f,
                };
                ctx.DrawText(quoteOpts, display, Ink);

                // Footer: brand logo mark above the wordmark.
                if (_logoBytes is not null)
                {
                    using var logo = Image.Load<Rgba32>(_logoBytes);
                    logo.Mutate(x => x.Resize(LogoSize, LogoSize));
                    ctx.DrawImage(logo, new Point((Size - LogoSize) / 2, Size - 250), 1f);
                }

                var markFont = _sans!.Value.CreateFont(26f, FontStyle.Bold);
                var markOpts = new RichTextOptions(markFont)
                {
                    Origin = new PointF(Size / 2f, Size - 92f),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    TextAlignment = TextAlignment.Center,
                };
                ctx.DrawText(markOpts, "Creator Companion", InkMuted);
            });

            using var ms = new MemoryStream();
            image.SaveAsPng(ms);
            return ms.ToArray();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Quote card render failed; posting without image.");
            return null;
        }
    }

    /// <summary>
    /// Shrinks the Fraunces font until the wrapped quote fits the box.
    /// Starts big (punchy) and steps down; floors at a readable minimum
    /// so a very long spark still renders (just smaller).
    /// </summary>
    private Font FitFont(string text, float maxWidth, float maxHeight)
    {
        for (var size = 84f; size > 34f; size -= 4f)
        {
            var font = _serif!.Value.CreateFont(size, FontStyle.Regular);
            var opts = new TextOptions(font) { WrappingLength = maxWidth, LineSpacing = 1.18f };
            var measured = TextMeasurer.MeasureSize(text, opts);
            if (measured.Height <= maxHeight && measured.Width <= maxWidth)
                return font;
        }
        return _serif!.Value.CreateFont(34f, FontStyle.Regular);
    }
}
