using System.Net;
using System.Text.RegularExpressions;
using AngleSharp.Dom;
using Ganss.Xss;

namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// Server-side sanitization + derivations for blog post bodies. The body is
/// stored as rich-text HTML, so it MUST be sanitized on every write (never trust
/// AI output or admin input). Allowlist is broader than the journal composer's
/// (long-form needs H2/H3, images, blockquotes, safe video embeds) but still
/// strips scripts, inline styles, event handlers, and any iframe whose host
/// isn't a safe-listed video provider. Also derives reading time + the snippet.
/// </summary>
public static partial class BlogHtml
{
    // Hosts allowed as iframe embeds (must pair with the marketing CSP frame-src).
    private static readonly string[] EmbedHosts =
    {
        "youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com",
        "player.vimeo.com", "vimeo.com",
    };

    private static readonly HtmlSanitizer Sanitizer = BuildSanitizer();

    private static HtmlSanitizer BuildSanitizer()
    {
        var s = new HtmlSanitizer();

        s.AllowedTags.Clear();
        foreach (var t in new[]
                 {
                     "p", "br", "strong", "em", "b", "i", "u", "s", "del",
                     "ul", "ol", "li",
                     "h2", "h3",                         // post title is the only H1
                     "blockquote", "code", "pre", "hr",
                     "a", "span",
                     "img", "figure", "figcaption",
                     "iframe", "div",                    // div carries TipTap's youtube wrapper
                 })
            s.AllowedTags.Add(t);

        s.AllowedAttributes.Clear();
        foreach (var a in new[]
                 {
                     "href", "title", "target", "rel",
                     "src", "alt", "width", "height", "loading",
                     "allow", "allowfullscreen", "frameborder",
                     "data-youtube-video",
                 })
            s.AllowedAttributes.Add(a);

        s.AllowedCssProperties.Clear();          // no inline style at all
        s.AllowedSchemes.Clear();
        s.AllowedSchemes.Add("http");
        s.AllowedSchemes.Add("https");
        s.AllowedSchemes.Add("mailto");

        // Drop any iframe pointing somewhere other than a safe-listed video host.
        s.PostProcessNode += (_, e) =>
        {
            if (e.Node is IElement el && string.Equals(el.NodeName, "IFRAME", StringComparison.OrdinalIgnoreCase)
                && !IsAllowedEmbed(el.GetAttribute("src")))
                el.Remove();
        };

        return s;
    }

    private static bool IsAllowedEmbed(string? src)
    {
        if (string.IsNullOrWhiteSpace(src)) return false;
        if (!Uri.TryCreate(src, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != "https") return false;
        return EmbedHosts.Contains(uri.Host, StringComparer.OrdinalIgnoreCase);
    }

    public static string Sanitize(string? html) =>
        string.IsNullOrWhiteSpace(html) ? string.Empty : Sanitizer.Sanitize(html);

    /// <summary>Plain text from HTML — for word count + snippet. Strips tags, decodes entities, collapses space.</summary>
    public static string PlainText(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;
        var noTags = TagRegex().Replace(html, " ");
        var decoded = WebUtility.HtmlDecode(noTags);
        return WhitespaceRegex().Replace(decoded, " ").Trim();
    }

    public static int ReadingTimeMinutes(string? html)
    {
        var words = PlainText(html).Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
        return Math.Max(1, (int)Math.Ceiling(words / 200.0));
    }

    public static string Snippet(string? html, int maxChars = 140)
    {
        var text = PlainText(html);
        if (text.Length <= maxChars) return text;
        var cut = text[..maxChars];
        var lastSpace = cut.LastIndexOf(' ');
        if (lastSpace > 40) cut = cut[..lastSpace];
        return cut.TrimEnd() + "…";
    }

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex TagRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();
}
