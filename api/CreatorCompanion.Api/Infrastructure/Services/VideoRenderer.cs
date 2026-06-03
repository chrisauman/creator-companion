using System.Diagnostics;
using System.Linq;
using IOPath = System.IO.Path;   // SixLabors.ImageSharp.Drawing also defines `Path`
using CreatorCompanion.Api.Application.Interfaces;
using SixLabors.Fonts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace CreatorCompanion.Api.Infrastructure.Services;

/// <summary>
/// Renders the vertical "Daily Spark" Short. ImageSharp draws ~6s of
/// 1080x1920 frames for the selected <see cref="Theme"/> (a background
/// animation + color treatment), then FFmpeg encodes them to an H.264 /
/// yuv420p MP4 that YouTube/TikTok accept directly.
///
/// THEME LIBRARY: there are <see cref="ThemeCount"/> themes; the daily
/// poster passes a theme index (e.g. day-of-year) so the look rotates and
/// stays fresh, cycling the whole set before repeating. All motion is
/// periodic over the frame count so the clip loops seamlessly.
///
/// Every absolute pixel size is multiplied by <see cref="S"/> (1.0 at the
/// 1080p production size). Keeping the scale factor in the math means the
/// exact same code rendered the half-res preview reel — no separate path.
///
/// Degrade-never-fail: returns null if fonts are missing or FFmpeg errors,
/// so the posting pipeline skips video rather than crashing.
/// </summary>
public class VideoRenderer : IVideoRenderer
{
    private const int W = 1080, H = 1920, Fps = 24, F = 144;   // 6.0s seamless loop
    private const float S = W / 1080f;                          // 1.0 at production size

    private readonly ILogger<VideoRenderer> _log;
    private readonly string _ffmpeg;
    private readonly FontFamily? _serif;   // Fraunces — quote + wordmark
    private readonly FontFamily? _sans;    // Inter — eyebrow + CTA
    private readonly byte[]? _logoBytes;

    public bool IsAvailable => _serif is not null && _sans is not null;
    public int ThemeCount => Themes.Length;

    public VideoRenderer(IWebHostEnvironment env, IConfiguration config, ILogger<VideoRenderer> log)
    {
        _log = log;
        _ffmpeg = config["Ffmpeg:Path"] ?? "ffmpeg";
        try
        {
            var www = IOPath.Combine(env.ContentRootPath, "wwwroot");
            var col = new FontCollection();
            var fr = IOPath.Combine(www, "fonts", "Fraunces.ttf");
            var it = IOPath.Combine(www, "fonts", "Inter.ttf");
            if (File.Exists(fr)) _serif = col.Add(fr);
            if (File.Exists(it)) _sans = col.Add(it);
            var logo = IOPath.Combine(www, "brand", "logo-icon.png");
            if (File.Exists(logo)) _logoBytes = File.ReadAllBytes(logo);
            if (!IsAvailable) _log.LogWarning("Video renderer fonts missing in {Dir}; video disabled.", www);
        }
        catch (Exception ex) { _log.LogWarning(ex, "Video renderer font load failed; video disabled."); }
    }

    public async Task<byte[]?> RenderAsync(string quote, string? eyebrow, int themeIndex, CancellationToken ct)
    {
        if (!IsAvailable || string.IsNullOrWhiteSpace(quote)) return null;
        var theme = Themes[((themeIndex % Themes.Length) + Themes.Length) % Themes.Length];

        var work = IOPath.Combine(IOPath.GetTempPath(), "ccvideo-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(work);
        try
        {
            var display = $"“{quote.Trim()}”";
            for (var i = 0; i < F; i++)
            {
                using var frame = RenderFrame(theme, i, display, eyebrow);
                await frame.SaveAsPngAsync(IOPath.Combine(work, $"f{i:00000}.png"), ct);
            }

            var outPath = IOPath.Combine(work, "out.mp4");
            var args = $"-y -framerate {Fps} -i \"{IOPath.Combine(work, "f%05d.png")}\" " +
                       $"-c:v libx264 -pix_fmt yuv420p -movflags +faststart \"{outPath}\"";
            if (!await RunFfmpegAsync(args, ct) || !File.Exists(outPath)) return null;
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
            { RedirectStandardError = true, RedirectStandardOutput = true, UseShellExecute = false };
            using var p = Process.Start(psi);
            if (p is null) return false;
            var err = await p.StandardError.ReadToEndAsync(ct);
            await p.WaitForExitAsync(ct);
            if (p.ExitCode != 0)
            {
                _log.LogWarning("FFmpeg exited {Code}: {Err}", p.ExitCode, err.Length > 800 ? err[^800..] : err);
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

    // ====================================================================
    // THEME LIBRARY
    // ====================================================================
    /// <summary>One rotation entry: background animation + palette + base +
    /// foreground text colors.</summary>
    private record Theme(string Name, string Style, string BgTop, string BgBot, string[] Pal,
                         string Quote, string Eyebrow, string Word, string Cta,
                         bool CycleGlow = false, float Scrim = 0.40f, bool LightScrim = false);

    private static readonly Theme[] Themes =
    {
        new("Aurora Brand",   "aurora", "06121C","0A2230", new[]{"12C4E3","0FB8C7","2C7FB8","7FE3F4","E6D6B0"}, "FAF6EC","12C4E3","FAF6EC","9AA3B0"),
        new("Aurora Rainbow", "aurora", "0A0C12","12161F", new[]{"12C4E3","5B5BF0","9333EA","EC4899","F5A524"}, "FAF6EC","12C4E3","FAF6EC","9AA3B0"),
        new("Aurora Sunset",  "aurora", "1A0E16","241018", new[]{"FBBF24","F5A524","EC4899","FF6B4A","9333EA"}, "FFF6EC","FBBF24","FFF6EC","C9A88F"),
        new("Waves Brand",    "waves",  "071521","0A2233", new[]{"0FB8C7","12C4E3","2C7FB8","E6D6B0"},          "FAF6EC","12C4E3","FAF6EC","9AA3B0"),
        new("Waves Duotone",  "waves",  "0A0C18","141022", new[]{"12C4E3","5B5BF0","EC4899"},                   "FAF6EC","12C4E3","FAF6EC","9AA3B0"),
        new("Lines Rainbow",  "lines",  "0A0C12","12161F", new[]{"12C4E3","5B5BF0","9333EA","EC4899","F5A524"}, "FAF6EC","12C4E3","FAF6EC","9AA3B0", CycleGlow:true),
        new("Lines Cyan",     "lines",  "070C14","0B1726", new[]{"7FE3F4","12C4E3","0FB8C7"},                   "FAF6EC","12C4E3","FAF6EC","9AA3B0"),
        new("Mesh Indigo",    "mesh",   "0A0A18","10112A", new[]{"4F46E5","12C4E3","7C3AED"},                   "FAF6EC","8BA8FF","FAF6EC","9AA3B0"),
        new("Pulse Rings",    "rings",  "061018","0A1E2E", new[]{"12C4E3","7FE3F4","0FB8C7"},                   "FAF6EC","12C4E3","FAF6EC","9AA3B0"),
        new("Sheen Rainbow",  "sheen",  "0A0C12","111521", new[]{"12C4E3","5B5BF0","9333EA","EC4899","F5A524"}, "FAF6EC","12C4E3","FAF6EC","9AA3B0"),
        new("Beams Brand",    "beams",  "06121C","0A2230", new[]{"12C4E3","2C7FB8","0FB8C7","7FE3F4","E6D6B0"}, "FAF6EC","12C4E3","FAF6EC","9AA3B0"),
        new("Daylight Cream", "light",  "FDFAF2","F6F1E6", new[]{"12C4E3","0FB8C7","E6D6B0"},                   "1A1D24","0A93AB","1A1D24","6B7280", Scrim:0.0f, LightScrim:true),
    };

    // up to 5 blob slots: base x/y (fractions), drift amplitudes (px), phase
    private static readonly (float bx, float by, float ax, float ay, float ph)[] P =
    {
        (0.28f,0.30f,120,90,0.00f),(0.76f,0.28f,140,110,0.30f),(0.68f,0.66f,150,120,0.60f),
        (0.30f,0.70f,130,140,0.80f),(0.52f,0.50f,100,150,0.15f),
    };

    // ---- helpers -----------------------------------------------------------
    private static DrawingOptions Screen => new() { GraphicsOptions = new GraphicsOptions { ColorBlendingMode = PixelColorBlendingMode.Screen, Antialias = true } };
    private static DrawingOptions Normal => new() { GraphicsOptions = new GraphicsOptions { Antialias = true } };
    private static float Cl(float v) => v < 0 ? 0 : v > 1 ? 1 : v;
    private static float Ease(float t) { t = Cl(t); return 1 - (1 - t) * (1 - t); }
    private static float Tau => MathF.PI * 2;
    private static Color Hex(string h) => Color.ParseHex(h);
    private static Color Lerp(Color a, Color b, float f)
    {
        var pa = a.ToPixel<Rgba32>(); var pb = b.ToPixel<Rgba32>(); f = Cl(f);
        byte L(byte x, byte y) => (byte)(x + (y - x) * f);
        return Color.FromRgb(L(pa.R, pb.R), L(pa.G, pb.G), L(pa.B, pb.B));
    }

    // ---- frame -------------------------------------------------------------
    private Image<Rgba32> RenderFrame(Theme th, int i, string display, string? eyebrow)
    {
        float t = (float)i / F;
        var img = new Image<Rgba32>(W, H);
        img.Mutate(ctx =>
        {
            ctx.Fill(new LinearGradientBrush(new PointF(0, 0), new PointF(W, H), GradientRepetitionMode.None,
                new ColorStop(0f, Hex(th.BgTop)), new ColorStop(1f, Hex(th.BgBot))), new RectangularPolygon(0, 0, W, H));

            switch (th.Style)
            {
                case "aurora": Aurora(ctx, t, th.Pal, 760, 0.55f, th.Pal.Length); break;
                case "mesh":   Aurora(ctx, t, th.Pal, 1180, 0.42f, 3); break;
                case "beams":  Aurora(ctx, t, th.Pal, 760, 0.50f, th.Pal.Length); Beams(ctx, t, th.Pal); break;
                case "waves":  Waves(ctx, t, th.Pal); break;
                case "lines":  Lines(ctx, t, th.Pal, th.CycleGlow); break;
                case "rings":  Rings(ctx, t, th.Pal); break;
                case "sheen":  Sheen(ctx, t, th.Pal); break;
                case "light":  Light(ctx, t, th.Pal); break;
            }

            // legibility scrim behind the text block
            if (th.Scrim > 0)
            {
                var sc = th.LightScrim ? Color.White : Color.Black;
                ctx.Fill(new RadialGradientBrush(new PointF(W / 2f, H * 0.44f), W * 0.62f, GradientRepetitionMode.None,
                    new ColorStop(0f, sc.WithAlpha(th.Scrim)), new ColorStop(0.7f, sc.WithAlpha(th.Scrim * 0.5f)),
                    new ColorStop(1f, sc.WithAlpha(0f))), new RectangularPolygon(0, 0, W, H));
            }

            Foreground(ctx, th, i, display, eyebrow);
        });
        return img;
    }

    // ---- background styles -------------------------------------------------
    private static void Aurora(IImageProcessingContext ctx, float t, string[] pal, float rBase, float aBase, int count)
    {
        for (int n = 0; n < count && n < P.Length; n++)
        {
            var s = P[n]; var hue = Hex(pal[n % pal.Length]);
            float cx = W * s.bx + s.ax * S * MathF.Sin(Tau * (t + s.ph));
            float cy = H * s.by + s.ay * S * MathF.Cos(Tau * (t + s.ph));
            float a = aBase * (0.82f + 0.18f * MathF.Sin(Tau * (t + s.ph * 1.7f)));
            float r = rBase * S * (0.92f + 0.10f * MathF.Sin(Tau * (t * 1.3f + s.ph)));
            ctx.Fill(Screen, new RadialGradientBrush(new PointF(cx, cy), r, GradientRepetitionMode.None,
                new ColorStop(0f, hue.WithAlpha(a)), new ColorStop(0.5f, hue.WithAlpha(a * 0.45f)),
                new ColorStop(1f, hue.WithAlpha(0f))), new RectangularPolygon(0, 0, W, H));
        }
    }

    private static void Beams(IImageProcessingContext ctx, float t, string[] pal)
    {
        (Color hue, float sp, float ph)[] beams = { (Hex(pal[0]), 1f, 0f), (Hex(pal[1 % pal.Length]), -1f, 0.5f) };
        foreach (var bm in beams)
        {
            float ang = Tau * (t * bm.sp + bm.ph); float dx = MathF.Cos(ang), dy = MathF.Sin(ang);
            var p0 = new PointF(W / 2f - dx * W, H / 2f - dy * H); var p1 = new PointF(W / 2f + dx * W, H / 2f + dy * H);
            float band = (t * bm.sp + bm.ph) % 1f; if (band < 0) band += 1;
            ctx.Fill(Screen, new LinearGradientBrush(p0, p1, GradientRepetitionMode.Repeat,
                new ColorStop(Cl(band - 0.12f), bm.hue.WithAlpha(0f)), new ColorStop(band, bm.hue.WithAlpha(0.28f)),
                new ColorStop(Cl(band + 0.12f), bm.hue.WithAlpha(0f))), new RectangularPolygon(0, 0, W, H));
        }
    }

    private static void Waves(IImageProcessingContext ctx, float t, string[] pal)
    {
        float[] baseY = { 0.80f, 0.68f, 0.56f, 0.44f }; float[] amp = { 70, 90, 80, 100 };
        float[] len = { 1.3f, 1.0f, 1.6f, 0.9f }; float[] sp = { 1f, -1f, 1f, -1f };
        for (int b = 0; b < 4; b++)
        {
            var hue = Hex(pal[b % pal.Length]); float a = 0.52f - b * 0.05f;
            var pb = new PathBuilder(); float y0 = H * baseY[b];
            pb.MoveTo(new PointF(0, H)); pb.LineTo(new PointF(0, y0));
            for (float x = 0; x <= W; x += 14)
            {
                float ph = len[b] * Tau * (x / W) + Tau * t * sp[b];
                pb.LineTo(new PointF(x, y0 + amp[b] * S * MathF.Sin(ph) + 14f * S * MathF.Sin(Tau * t * sp[b] * 2)));
            }
            pb.LineTo(new PointF(W, H)); pb.CloseFigure();
            ctx.Fill(Screen, new LinearGradientBrush(new PointF(0, y0 - amp[b] * S), new PointF(0, H), GradientRepetitionMode.None,
                new ColorStop(0f, hue.WithAlpha(a)), new ColorStop(1f, hue.WithAlpha(a * 0.15f))), pb.Build());
        }
    }

    private static void Lines(IImageProcessingContext ctx, float t, string[] pal, bool cycle)
    {
        // glow behind the lines: cycles through the palette, or static on pal[1]
        if (cycle)
        {
            int n = pal.Length; float seg = t * n; int k = (int)seg % n;
            var gc = Lerp(Hex(pal[k]), Hex(pal[(k + 1) % n]), seg - (int)seg);
            ctx.Fill(Screen, new RadialGradientBrush(new PointF(W * 0.5f, H * 0.5f), W * 0.8f, GradientRepetitionMode.None,
                new ColorStop(0f, gc.WithAlpha(0.26f)), new ColorStop(0.7f, gc.WithAlpha(0f))), new RectangularPolygon(0, 0, W, H));
        }
        else
        {
            var g = Hex(pal[1 % pal.Length]);
            ctx.Fill(Screen, new RadialGradientBrush(new PointF(W * 0.5f, H * 0.5f), W * 0.8f, GradientRepetitionMode.None,
                new ColorStop(0f, g.WithAlpha(0.22f)), new ColorStop(0.7f, g.WithAlpha(0f))), new RectangularPolygon(0, 0, W, H));
        }

        ColorStop[] Stops(float a) => Enumerable.Range(0, pal.Length)
            .Select(j => new ColorStop(pal.Length == 1 ? 0 : (float)j / (pal.Length - 1), Hex(pal[j]).WithAlpha(a))).ToArray();
        var bWide = new LinearGradientBrush(new PointF(0, 0), new PointF(W, 0), GradientRepetitionMode.None, Stops(0.12f));
        var bMid = new LinearGradientBrush(new PointF(0, 0), new PointF(W, 0), GradientRepetitionMode.None, Stops(0.22f));
        var bCris = new LinearGradientBrush(new PointF(0, 0), new PointF(W, 0), GradientRepetitionMode.None, Stops(1f));
        (float y, float amp, float len, float sp, float w)[] L =
        { (0.16f,70,1.4f,1f,3f),(0.30f,95,1.1f,-1f,2.5f),(0.44f,80,1.7f,1f,2f),(0.60f,100,1.0f,-1f,3f),(0.74f,85,1.5f,1f,2.5f),(0.88f,110,1.2f,-1f,2f) };
        var paths = new List<IPath>();
        foreach (var ln in L)
        {
            float drift = 90f * S * MathF.Sin(Tau * (t * ln.sp)); var pts = new List<PointF>();
            for (float x = -60; x <= W + 60; x += 12) { float ph = ln.len * Tau * (x / W) + Tau * t * ln.sp; pts.Add(new PointF(x + drift, H * ln.y + ln.amp * S * MathF.Sin(ph))); }
            paths.Add(new PathBuilder().AddLines(pts).Build());
        }
        // halos first (under every crisp line), then the crisp strokes
        for (int j = 0; j < paths.Count; j++) ctx.Draw(Screen, Pens.Solid(bWide, L[j].w * 7 * S), paths[j]);
        for (int j = 0; j < paths.Count; j++) ctx.Draw(Screen, Pens.Solid(bMid, L[j].w * 3 * S), paths[j]);
        for (int j = 0; j < paths.Count; j++) ctx.Draw(Screen, Pens.Solid(bCris, L[j].w * S), paths[j]);
    }

    private static void Rings(IImageProcessingContext ctx, float t, string[] pal)
    {
        var cx = W / 2f; var cy = H * 0.44f; float maxR = H * 0.62f; const int N = 6;
        for (int k = 0; k < N; k++)
        {
            float frac = (t + (float)k / N) % 1f; float r = frac * maxR; float a = (1 - frac) * 0.55f;
            if (r < 4) continue;
            var hue = Hex(pal[k % pal.Length]);
            ctx.Draw(Screen, Pens.Solid(hue.WithAlpha(a), 5f * S), new EllipsePolygon(cx, cy, r, r));
        }
        ctx.Fill(Screen, new RadialGradientBrush(new PointF(cx, cy), W * 0.5f, GradientRepetitionMode.None,
            new ColorStop(0f, Hex(pal[0]).WithAlpha(0.30f)), new ColorStop(0.8f, Hex(pal[0]).WithAlpha(0f))), new RectangularPolygon(0, 0, W, H));
    }

    private static void Sheen(IImageProcessingContext ctx, float t, string[] pal)
    {
        float ang = Tau * t; float dx = MathF.Cos(ang), dy = MathF.Sin(ang);
        var p0 = new PointF(W / 2f - dx * W, H / 2f - dy * H); var p1 = new PointF(W / 2f + dx * W, H / 2f + dy * H);
        var stops = Enumerable.Range(0, pal.Length).Select(j => new ColorStop((float)j / (pal.Length - 1), Hex(pal[j]).WithAlpha(0.22f))).ToArray();
        ctx.Fill(Screen, new LinearGradientBrush(p0, p1, GradientRepetitionMode.None, stops), new RectangularPolygon(0, 0, W, H));
        float br = W * (0.55f + 0.06f * MathF.Sin(Tau * t));
        ctx.Fill(Screen, new RadialGradientBrush(new PointF(W * 0.5f, H * 0.46f), br, GradientRepetitionMode.None,
            new ColorStop(0f, Hex(pal[0]).WithAlpha(0.20f)), new ColorStop(0.8f, Hex(pal[0]).WithAlpha(0f))), new RectangularPolygon(0, 0, W, H));
    }

    // pastel tinted clouds on a cream base (Normal blend, low alpha)
    private static void Light(IImageProcessingContext ctx, float t, string[] pal)
    {
        for (int n = 0; n < pal.Length + 1; n++)
        {
            var s = P[n % P.Length]; var hue = Hex(pal[n % pal.Length]);
            float cx = W * s.bx + s.ax * S * MathF.Sin(Tau * (t + s.ph));
            float cy = H * s.by + s.ay * S * MathF.Cos(Tau * (t + s.ph));
            float a = 0.16f * (0.8f + 0.2f * MathF.Sin(Tau * (t + s.ph)));
            float r = 720 * S * (0.92f + 0.1f * MathF.Sin(Tau * (t * 1.3f + s.ph)));
            ctx.Fill(Normal, new RadialGradientBrush(new PointF(cx, cy), r, GradientRepetitionMode.None,
                new ColorStop(0f, hue.WithAlpha(a)), new ColorStop(1f, hue.WithAlpha(0f))), new RectangularPolygon(0, 0, W, H));
        }
    }

    // ---- foreground (theme-colored) ---------------------------------------
    private void Foreground(IImageProcessingContext ctx, Theme th, int i, string display, string? eyebrow)
    {
        var eyebrowText = (string.IsNullOrWhiteSpace(eyebrow) ? "Your Daily Spark" : eyebrow!).ToUpperInvariant();
        float eb = Cl((i - 6) / 16f);
        if (eb > 0)
            ctx.DrawText(new RichTextOptions(_sans!.Value.CreateFont(34f * S, FontStyle.Bold))
            { Origin = new PointF(W / 2f, 300 * S), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, TextAlignment = TextAlignment.Center },
                eyebrowText, Hex(th.Eyebrow).WithAlpha(eb));

        float e = Ease((i - 14) / 24f);
        if (e > 0)
        {
            var font = FitQuote(display);
            ctx.DrawText(new RichTextOptions(font)
            { Origin = new PointF(W / 2f, H * 0.44f + (1 - e) * 26 * S), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, TextAlignment = TextAlignment.Center, WrappingLength = W - 2 * (120 * S), LineSpacing = 1.18f },
                display, Hex(th.Quote).WithAlpha(e));
        }

        float lg = Ease((i - 40) / 24f);
        if (lg > 0 && _logoBytes is not null)
        {
            using var lo = Image.Load<Rgba32>(_logoBytes); lo.Mutate(x => x.Resize((int)(78 * S), (int)(78 * S)));
            var mf = _serif!.Value.CreateFont(40f * S, FontStyle.Bold); const string wm = "Creator Companion";
            var tw = TextMeasurer.MeasureSize(wm, new TextOptions(mf)).Width;
            var sx = (W - ((int)(104 * S) + tw)) / 2f; var cy = H - 360 * S;
            ctx.DrawImage(lo, new Point((int)sx, (int)(cy - 39 * S)), lg);
            ctx.DrawText(new RichTextOptions(mf) { Origin = new PointF(sx + 104 * S, cy), HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Center, TextAlignment = TextAlignment.Start }, wm, Hex(th.Word).WithAlpha(lg));
            ctx.DrawText(new RichTextOptions(_sans!.Value.CreateFont(30f * S, FontStyle.Bold)) { Origin = new PointF(W / 2f, H - 250 * S), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, TextAlignment = TextAlignment.Center }, "FOLLOW FOR A SPARK EVERY DAY", Hex(th.Cta).WithAlpha(lg));
        }
    }

    /// <summary>Auto-size the quote down until it fits the vertical box.</summary>
    private Font FitQuote(string text)
    {
        float maxW = W - 2 * (120 * S), maxH = 760 * S;
        for (var size = 100f * S; size > 40f * S; size -= 4f * S)
        {
            var f = _serif!.Value.CreateFont(size, FontStyle.Bold);
            var m = TextMeasurer.MeasureSize(text, new TextOptions(f) { WrappingLength = maxW, LineSpacing = 1.18f });
            if (m.Height <= maxH && m.Width <= maxW) return f;
        }
        return _serif!.Value.CreateFont(40f * S, FontStyle.Bold);
    }
}
