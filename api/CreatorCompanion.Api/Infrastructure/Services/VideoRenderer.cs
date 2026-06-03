using System.Diagnostics;
using CreatorCompanion.Api.Application.Interfaces;
using SixLabors.Fonts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace CreatorCompanion.Api.Infrastructure.Services;

/// <summary>
/// Renders the vertical "Daily Spark" Short. Draws ~150 ImageSharp frames
/// of the dark kinetic card (cyan glow drifts + breathes, the quote fades/
/// rises in, the logo lockup settles, then it dissolves so the clip loops
/// seamlessly), writes them to a temp dir, and shells out to FFmpeg to
/// encode H.264 / yuv420p MP4 — universally accepted by YouTube/TikTok.
///
/// FFmpeg path from config Ffmpeg:Path (default "ffmpeg" on PATH — apt on
/// Railway, brew locally). Fonts/logo bundled under wwwroot, same as the
/// quote-card renderer. Creative is intentionally simple for v1; refine later.
/// </summary>
public class VideoRenderer : IVideoRenderer
{
    private const int W = 1080, H = 1920;
    private const int Fps = 24;
    private const int F = 150;                 // ~6.25s loop
    private const int Margin = 120;

    private static readonly Color Cream = Color.ParseHex("FAF6EC");
    private static readonly Color Cyan  = Color.ParseHex("12C4E3");
    private static readonly Color LiteMute = Color.ParseHex("8A93A0");

    private readonly ILogger<VideoRenderer> _log;
    private readonly string _ffmpeg;
    private readonly FontFamily? _serif;       // Fraunces — quote + wordmark
    private readonly FontFamily? _sans;        // Inter — eyebrow + CTA
    private readonly byte[]? _logoBytes;

    public bool IsAvailable => _serif is not null && _sans is not null;

    public VideoRenderer(IWebHostEnvironment env, IConfiguration config, ILogger<VideoRenderer> log)
    {
        _log = log;
        _ffmpeg = config["Ffmpeg:Path"] ?? "ffmpeg";
        try
        {
            var www = Path.Combine(env.ContentRootPath, "wwwroot");
            var col = new FontCollection();
            var fr = Path.Combine(www, "fonts", "Fraunces.ttf");
            var it = Path.Combine(www, "fonts", "Inter.ttf");
            if (File.Exists(fr)) _serif = col.Add(fr);
            if (File.Exists(it)) _sans  = col.Add(it);
            var logo = Path.Combine(www, "brand", "logo-icon.png");
            if (File.Exists(logo)) _logoBytes = File.ReadAllBytes(logo);
            if (!IsAvailable) _log.LogWarning("Video renderer fonts missing in {Dir}; video disabled.", www);
        }
        catch (Exception ex) { _log.LogWarning(ex, "Video renderer font load failed; video disabled."); }
    }

    public async Task<byte[]?> RenderAsync(string quote, string? eyebrow, CancellationToken ct)
    {
        if (!IsAvailable || string.IsNullOrWhiteSpace(quote)) return null;

        var work = Path.Combine(Path.GetTempPath(), "ccvideo-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(work);
        try
        {
            var display = $"“{quote.Trim()}”";
            for (var i = 0; i < F; i++)
            {
                using var frame = RenderFrame(i, display, eyebrow);
                await frame.SaveAsPngAsync(Path.Combine(work, $"f{i:00000}.png"), ct);
            }

            var outPath = Path.Combine(work, "out.mp4");
            var args = $"-y -framerate {Fps} -i \"{Path.Combine(work, "f%05d.png")}\" " +
                       $"-c:v libx264 -pix_fmt yuv420p -movflags +faststart \"{outPath}\"";
            if (!await RunFfmpegAsync(args, ct) || !File.Exists(outPath))
                return null;

            return await File.ReadAllBytesAsync(outPath, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Video render failed.");
            return null;
        }
        finally
        {
            try { Directory.Delete(work, recursive: true); } catch { /* best effort */ }
        }
    }

    private async Task<bool> RunFfmpegAsync(string args, CancellationToken ct)
    {
        try
        {
            var psi = new ProcessStartInfo(_ffmpeg, args)
            {
                RedirectStandardError = true, RedirectStandardOutput = true, UseShellExecute = false,
            };
            using var p = Process.Start(psi);
            if (p is null) return false;
            var err = await p.StandardError.ReadToEndAsync(ct);
            await p.WaitForExitAsync(ct);
            if (p.ExitCode != 0)
            {
                _log.LogWarning("FFmpeg exited {Code}: {Err}", p.ExitCode,
                    err.Length > 800 ? err[^800..] : err);
                return false;
            }
            return true;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "FFmpeg invocation failed (is '{Path}' installed?).", _ffmpeg);
            return false;
        }
    }

    private static float Cl(float v) => v < 0 ? 0 : v > 1 ? 1 : v;
    private static float Ease(float t) { t = Cl(t); return 1 - (1 - t) * (1 - t); }

    private Image<Rgba32> RenderFrame(int i, string display, string? eyebrow)
    {
        float ph = 2 * MathF.PI * i / F;
        float outro = i < 108 ? 1f : Cl((141f - i) / 33f);
        var img = new Image<Rgba32>(W, H);
        img.Mutate(ctx =>
        {
            // dark gradient ground
            ctx.Fill(new LinearGradientBrush(new PointF(0, 0), new PointF(0, H), GradientRepetitionMode.None,
                new ColorStop(0f, Color.ParseHex("0B0D12")), new ColorStop(1f, Color.ParseHex("161A23"))),
                new RectangleF(0, 0, W, H));
            // drifting + breathing cyan glow
            float gx = W * 0.5f + 130 * MathF.Sin(ph), gy = H * 0.40f + 110 * MathF.Cos(ph);
            float ga = 0.22f + 0.10f * MathF.Sin(ph);
            ctx.Fill(new RadialGradientBrush(new PointF(gx, gy), W * 0.85f, GradientRepetitionMode.None,
                new ColorStop(0f, Cyan.WithAlpha(ga)), new ColorStop(0.55f, Cyan.WithAlpha(ga * 0.4f)),
                new ColorStop(1f, Cyan.WithAlpha(0f))), new RectangleF(0, 0, W, H));

            float eb = Cl((i - 6) / 16f) * outro;
            if (eb > 0 && !string.IsNullOrWhiteSpace(eyebrow))
                ctx.DrawText(new RichTextOptions(_sans!.Value.CreateFont(34f, FontStyle.Bold))
                { Origin = new PointF(W / 2f, 300), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, TextAlignment = TextAlignment.Center },
                    eyebrow!.ToUpperInvariant(), Cyan.WithAlpha(eb));

            float e = Ease((i - 14) / 24f);
            if (e * outro > 0)
            {
                var font = FitQuote(display);
                ctx.DrawText(new RichTextOptions(font)
                {
                    Origin = new PointF(W / 2f, H * 0.46f + (1 - e) * 26),
                    HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
                    TextAlignment = TextAlignment.Center, WrappingLength = W - 2 * Margin, LineSpacing = 1.18f,
                }, display, Cream.WithAlpha(e * outro));
            }

            float lg = Ease((i - 40) / 24f) * outro;
            if (lg > 0 && _logoBytes is not null)
            {
                using var lo = Image.Load<Rgba32>(_logoBytes); lo.Mutate(x => x.Resize(78, 78));
                var mf = _serif!.Value.CreateFont(40f, FontStyle.Bold); const string wm = "Creator Companion";
                var tw = TextMeasurer.MeasureSize(wm, new TextOptions(mf)).Width;
                var sx = (W - (104 + tw)) / 2f; var cy = H - 360f;
                ctx.DrawImage(lo, new Point((int)sx, (int)(cy - 39)), lg);
                ctx.DrawText(new RichTextOptions(mf) { Origin = new PointF(sx + 104, cy), HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Center, TextAlignment = TextAlignment.Start }, wm, Cream.WithAlpha(lg));
                ctx.DrawText(new RichTextOptions(_sans!.Value.CreateFont(30f, FontStyle.Bold)) { Origin = new PointF(W / 2f, H - 250f), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, TextAlignment = TextAlignment.Center }, "FOLLOW FOR A SPARK EVERY DAY", LiteMute.WithAlpha(lg));
            }
        });
        return img;
    }

    /// <summary>Auto-size the quote down until it fits the vertical box.</summary>
    private Font FitQuote(string text)
    {
        float maxW = W - 2 * Margin, maxH = 760f;
        for (var size = 100f; size > 40f; size -= 4f)
        {
            var f = _serif!.Value.CreateFont(size, FontStyle.Bold);
            var m = TextMeasurer.MeasureSize(text, new TextOptions(f) { WrappingLength = maxW, LineSpacing = 1.18f });
            if (m.Height <= maxH && m.Width <= maxW) return f;
        }
        return _serif!.Value.CreateFont(40f, FontStyle.Bold);
    }
}
