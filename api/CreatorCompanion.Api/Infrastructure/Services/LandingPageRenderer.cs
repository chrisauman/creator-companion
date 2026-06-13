using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Infrastructure.Services;

/// <summary>
/// Server-side renderer for landing pages. Ports the marketing "morning pages"
/// template into a parameterized document driven by <see cref="LpContent"/>.
/// The page is served on the marketing domain via proxy, so it links the
/// marketing site's own styles.css / fonts / assets by relative URL — design
/// stays identical to the hand-built pages. All content text is HTML-escaped;
/// a tiny *emphasis* subset is the only markup we synthesize from content.
/// </summary>
public partial class LandingPageRenderer(IConfiguration config) : ILandingPageRenderer
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly string _base = (config["Marketing:BaseUrl"] ?? "https://www.creatorcompanionapp.com").TrimEnd('/');
    private readonly string? _ga4 = config["Ga4:MeasurementId"];

    public string Render(LandingPage page, IReadOnlyList<LandingPage> related)
    {
        LpContent c;
        try { c = JsonSerializer.Deserialize<LpContent>(page.ContentJson, JsonOpts) ?? new(); }
        catch { c = new(); }

        var url = $"{_base}/{page.Slug}";
        var ogImage = string.IsNullOrWhiteSpace(page.OgImageKey) ? $"{_base}/og-image.png" : page.OgImageKey!;
        var sb = new StringBuilder(16_384);

        sb.Append("<!DOCTYPE html><html lang=\"en\"><head>");
        sb.Append("<meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
        sb.Append($"<title>{E(page.MetaTitle)}</title>");
        sb.Append($"<meta name=\"description\" content=\"{E(page.MetaDescription)}\">");
        if (page.NoIndex) sb.Append("<meta name=\"robots\" content=\"noindex, nofollow\">");
        sb.Append("<link rel=\"icon\" type=\"image/x-icon\" href=\"favicon.ico\">");
        sb.Append("<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"><link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>");
        sb.Append("<link href=\"https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700;800;900&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,600;1,700&display=swap\" rel=\"stylesheet\">");
        sb.Append("<link rel=\"stylesheet\" href=\"styles.css\">");
        sb.Append($"<link rel=\"canonical\" href=\"{E(url)}\">");
        sb.Append("<meta property=\"og:type\" content=\"website\">");
        sb.Append($"<meta property=\"og:url\" content=\"{E(url)}\"><meta property=\"og:title\" content=\"{E(page.MetaTitle)}\">");
        sb.Append($"<meta property=\"og:description\" content=\"{E(page.MetaDescription)}\"><meta property=\"og:image\" content=\"{E(ogImage)}\">");
        sb.Append("<meta name=\"twitter:card\" content=\"summary_large_image\">");
        sb.Append($"<meta name=\"twitter:title\" content=\"{E(page.MetaTitle)}\"><meta name=\"twitter:description\" content=\"{E(page.MetaDescription)}\"><meta name=\"twitter:image\" content=\"{E(ogImage)}\">");
        AppendJsonLd(sb, page, c, url);
        AppendGa4(sb);
        sb.Append("<style>").Append(Css).Append("</style>");
        sb.Append("</head><body class=\"page-inner\">");

        AppendNav(sb);
        AppendHero(sb, c.Hero);
        AppendHook(sb, c.Hook);
        AppendExplainer(sb, c.Explainer);
        AppendCards(sb, c.BenefitCards);
        AppendBand(sb, c.Band);
        AppendTips(sb, c.Tips);
        AppendFeatureRows(sb, c.FeatureRows);
        AppendObjections(sb, c.Objections);
        AppendFaq(sb, c.Faq);
        AppendRelated(sb, related);
        AppendFinalCta(sb, c.FinalCta);
        AppendFooter(sb);
        AppendScripts(sb);

        sb.Append("</body></html>");
        return sb.ToString();
    }

    // ── sections ─────────────────────────────────────────────────────
    private void AppendHero(StringBuilder sb, LpHero? h)
    {
        if (h is null) return;
        var video = string.IsNullOrWhiteSpace(h.VideoUrl) ? "video/hero.mp4" : h.VideoUrl!;
        var poster = string.IsNullOrWhiteSpace(h.PosterUrl) ? "video/hero-poster.jpg" : h.PosterUrl!;
        sb.Append("<header class=\"lp-hero\" style=\"background:#0a0d14 url('").Append(E(poster)).Append("') center/cover no-repeat\">");
        sb.Append("<video class=\"lp-hero__video\" data-src=\"").Append(E(video)).Append("\" muted loop playsinline poster=\"").Append(E(poster)).Append("\" aria-hidden=\"true\"></video>");
        sb.Append("<div class=\"lp-hero__scrim\"></div><div class=\"lp-hero__inner\">");
        if (!string.IsNullOrWhiteSpace(h.Kicker)) sb.Append("<p class=\"lp-kicker\">").Append(Inline(h.Kicker)).Append("</p>");
        sb.Append("<h1>").Append(Inline(h.H1)).Append("</h1>");
        if (!string.IsNullOrWhiteSpace(h.Subhead)) sb.Append("<p class=\"lp-sub\">").Append(Inline(h.Subhead)).Append("</p>");
        sb.Append("<div class=\"lp-cta-row\"><a href=\"signup.html\" class=\"lp-btn lp-btn--primary\">").Append(E(h.CtaLabel ?? "Start your free trial")).Append("</a>");
        sb.Append("<a href=\"#what\" class=\"lp-btn lp-btn--ghost\">Learn more</a></div></div></header>");
    }

    private void AppendHook(StringBuilder sb, LpHook? h)
    {
        if (h is null || (string.IsNullOrWhiteSpace(h.Heading) && string.IsNullOrWhiteSpace(h.Lead))) return;
        sb.Append("<section class=\"lp-section lp-section--cream\" id=\"what\"><div class=\"lp-wrap lp-center reveal\">");
        if (!string.IsNullOrWhiteSpace(h.Heading)) sb.Append("<h2 class=\"lp-h2\">").Append(Inline(h.Heading)).Append("</h2>");
        if (!string.IsNullOrWhiteSpace(h.Lead)) sb.Append("<p class=\"lp-lead\">").Append(Inline(h.Lead)).Append("</p>");
        if (h.Chips.Count > 0)
        {
            sb.Append("<div class=\"lp-chips\">");
            foreach (var chip in h.Chips)
                sb.Append("<span class=\"lp-chip\">").Append(Check).Append(' ').Append(E(chip)).Append("</span>");
            sb.Append("</div>");
        }
        sb.Append("</div></section>");
    }

    private void AppendExplainer(StringBuilder sb, LpExplainer? e)
    {
        if (e is null || string.IsNullOrWhiteSpace(e.H2)) return;
        sb.Append("<section class=\"lp-section lp-section--white\"><div class=\"lp-wrap\"><div class=\"lp-row reveal\"><div class=\"lp-row__text\">");
        if (!string.IsNullOrWhiteSpace(e.Kicker)) sb.Append("<p class=\"lp-kicker\">").Append(Inline(e.Kicker)).Append("</p>");
        sb.Append("<h2 class=\"lp-h2\">").Append(Inline(e.H2)).Append("</h2>");
        foreach (var p in e.Paragraphs) sb.Append("<p class=\"lp-lead\">").Append(Inline(p)).Append("</p>");
        sb.Append("</div>");
        if (!string.IsNullOrWhiteSpace(e.ImageUrl))
            sb.Append("<div class=\"lp-row__media\"><img src=\"").Append(E(e.ImageUrl)).Append("\" alt=\"").Append(E(e.ImageAlt)).Append("\" loading=\"lazy\"></div>");
        sb.Append("</div></div></section>");
    }

    private void AppendCards(StringBuilder sb, List<LpCard> cards)
    {
        if (cards.Count == 0) return;
        sb.Append("<section class=\"lp-section lp-section--cream\"><div class=\"lp-wrap\"><div class=\"lp-cards reveal\">");
        foreach (var card in cards)
        {
            sb.Append("<div class=\"lp-card\"><div class=\"lp-card__icon\">").Append(Icon(card.Icon)).Append("</div>");
            sb.Append("<h3>").Append(Inline(card.Title)).Append("</h3><p>").Append(Inline(card.Body)).Append("</p></div>");
        }
        sb.Append("</div></div></section>");
    }

    private void AppendBand(StringBuilder sb, LpBand? b)
    {
        if (b is null || string.IsNullOrWhiteSpace(b.Heading)) return;
        var img = string.IsNullOrWhiteSpace(b.ImageUrl) ? "images/lp-morning-ritual.jpg" : b.ImageUrl!;
        sb.Append("<section class=\"lp-band\" style=\"background:#0a0d14 url('").Append(E(img)).Append("') center/cover no-repeat\"><div class=\"lp-band__inner reveal\">");
        sb.Append("<h2>").Append(Inline(b.Heading)).Append("</h2>");
        if (!string.IsNullOrWhiteSpace(b.Subtext)) sb.Append("<p>").Append(Inline(b.Subtext)).Append("</p>");
        sb.Append("</div></section>");
    }

    private void AppendTips(StringBuilder sb, List<LpTip> tips)
    {
        if (tips.Count == 0) return;
        sb.Append("<section class=\"lp-section lp-section--white\"><div class=\"lp-wrap\"><div class=\"lp-tips reveal\">");
        var n = 1;
        foreach (var t in tips)
        {
            sb.Append("<div class=\"lp-tip\"><div class=\"lp-tip__num\">").Append(n++).Append("</div><div><h3>")
              .Append(Inline(t.Title)).Append("</h3><p>").Append(Inline(t.Body)).Append("</p></div></div>");
        }
        sb.Append("</div></div></section>");
    }

    private void AppendFeatureRows(StringBuilder sb, List<LpFeatureRow> rows)
    {
        if (rows.Count == 0) return;
        sb.Append("<section class=\"lp-section lp-section--cream\"><div class=\"lp-wrap\">");
        foreach (var r in rows)
        {
            sb.Append("<div class=\"lp-row").Append(r.Reverse ? " lp-row--reverse" : "").Append(" reveal\">");
            var text = new StringBuilder("<div class=\"lp-row__text\">");
            if (!string.IsNullOrWhiteSpace(r.Kicker)) text.Append("<p class=\"lp-kicker\">").Append(Inline(r.Kicker)).Append("</p>");
            text.Append("<h2 class=\"lp-h2\" style=\"font-size:clamp(1.5rem,3vw,2rem)\">").Append(Inline(r.H2)).Append("</h2>");
            text.Append("<p class=\"lp-lead\">").Append(Inline(r.Body)).Append("</p></div>");
            var media = new StringBuilder("<div class=\"lp-row__media\">");
            if (!string.IsNullOrWhiteSpace(r.MediaUrl))
            {
                if (r.Phone) media.Append("<div class=\"lp-phone\"><img src=\"").Append(E(r.MediaUrl)).Append("\" alt=\"").Append(E(r.MediaAlt)).Append("\" loading=\"lazy\"></div>");
                else media.Append("<img src=\"").Append(E(r.MediaUrl)).Append("\" alt=\"").Append(E(r.MediaAlt)).Append("\" loading=\"lazy\">");
            }
            media.Append("</div>");
            // reverse rows lead with media for the alternating zig-zag
            if (r.Reverse) sb.Append(media).Append(text); else sb.Append(text).Append(media);
            sb.Append("</div>");
        }
        sb.Append("</div></section>");
    }

    private void AppendObjections(StringBuilder sb, List<LpQa> items)
    {
        if (items.Count == 0) return;
        sb.Append("<section class=\"lp-section lp-section--white\"><div class=\"lp-wrap\"><div class=\"lp-obj reveal\">");
        foreach (var i in items)
            sb.Append("<div class=\"lp-obj__item\"><p class=\"lp-obj__q\">").Append(Inline(i.Q)).Append("</p><p class=\"lp-obj__a\">").Append(Inline(i.A)).Append("</p></div>");
        sb.Append("</div></div></section>");
    }

    private void AppendFaq(StringBuilder sb, List<LpQa> faq)
    {
        if (faq.Count == 0) return;
        sb.Append("<section class=\"lp-section lp-section--cream\"><div class=\"lp-wrap\"><div class=\"lp-center reveal\"><h2 class=\"lp-h2\">Questions, answered</h2></div><div class=\"lp-faq reveal\">");
        var first = true;
        foreach (var qa in faq)
        {
            sb.Append("<details").Append(first ? " open" : "").Append("><summary>").Append(Inline(qa.Q)).Append("</summary><p>").Append(Inline(qa.A)).Append("</p></details>");
            first = false;
        }
        sb.Append("</div></div></section>");
    }

    private void AppendRelated(StringBuilder sb, IReadOnlyList<LandingPage> related)
    {
        if (related.Count == 0) return;
        sb.Append("<section class=\"lp-section lp-section--white\"><div class=\"lp-wrap lp-center reveal\"><p class=\"lp-kicker\">Keep reading</p><h2 class=\"lp-h2\">Related practices</h2><div class=\"lp-related\">");
        foreach (var r in related.Take(6))
        {
            var label = string.IsNullOrWhiteSpace(r.MetaTitle) ? r.TargetKeyword : r.MetaTitle;
            sb.Append("<a href=\"/").Append(E(r.Slug)).Append("\">").Append(E(label)).Append("</a>");
        }
        sb.Append("</div></div></section>");
    }

    private void AppendFinalCta(StringBuilder sb, LpFinalCta? f)
    {
        var heading = f?.Heading ?? "Start today.";
        var sub = f?.Subtext ?? "Ten days free. No credit card to start.";
        var cta = f?.CtaLabel ?? "Start your free trial";
        sb.Append("<section class=\"lp-final\"><h2>").Append(Inline(heading)).Append("</h2><p>").Append(Inline(sub)).Append("</p>");
        sb.Append("<a href=\"signup.html\" class=\"lp-btn lp-btn--primary\">").Append(E(cta)).Append("</a></section>");
    }

    // ── head bits ────────────────────────────────────────────────────
    private void AppendJsonLd(StringBuilder sb, LandingPage page, LpContent c, string url)
    {
        var graph = new List<object>
        {
            new Dictionary<string, object>
            {
                ["@type"] = "BreadcrumbList",
                ["itemListElement"] = new object[]
                {
                    new Dictionary<string, object> { ["@type"]="ListItem", ["position"]=1, ["name"]="Home", ["item"]=_base + "/" },
                    new Dictionary<string, object> { ["@type"]="ListItem", ["position"]=2, ["name"]=page.MetaTitle, ["item"]=url },
                },
            },
        };
        if (c.Faq.Count > 0)
        {
            graph.Add(new Dictionary<string, object>
            {
                ["@type"] = "FAQPage",
                ["mainEntity"] = c.Faq.Where(q => !string.IsNullOrWhiteSpace(q.Q)).Select(q => new Dictionary<string, object>
                {
                    ["@type"] = "Question",
                    ["name"] = q.Q ?? "",
                    ["acceptedAnswer"] = new Dictionary<string, object> { ["@type"] = "Answer", ["text"] = q.A ?? "" },
                }).ToArray(),
            });
        }
        var doc = new Dictionary<string, object> { ["@context"] = "https://schema.org", ["@graph"] = graph };
        sb.Append("<script type=\"application/ld+json\">").Append(JsonSerializer.Serialize(doc)).Append("</script>");
    }

    private void AppendGa4(StringBuilder sb)
    {
        if (string.IsNullOrWhiteSpace(_ga4)) return;
        var id = WebUtility.HtmlEncode(_ga4);
        sb.Append($"<script async src=\"https://www.googletagmanager.com/gtag/js?id={id}\"></script>");
        sb.Append("<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','")
          .Append(id).Append("');</script>");
    }

    // ── helpers ──────────────────────────────────────────────────────
    private static string E(string? s) => WebUtility.HtmlEncode(s ?? string.Empty);

    /// <summary>Escape, then turn *text* into &lt;em&gt;text&lt;/em&gt; — safe because we escape first.</summary>
    private static string Inline(string? s) => EmphasisRegex().Replace(E(s), "<em>$1</em>");

    [GeneratedRegex(@"\*([^*]+)\*")]
    private static partial Regex EmphasisRegex();

    private const string Check = "<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 6 9 17l-5-5\"/></svg>";

    private static string Icon(string? key)
    {
        var inner = (key ?? "spark") switch
        {
            "shield"  => "<rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>",
            "clock"   => "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
            "chart"   => "<path d=\"M3 3v18h18\"/><path d=\"m19 9-5 5-4-4-4 4\"/>",
            "music"   => "<path d=\"M9 18V5l12-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"16\" r=\"3\"/>",
            "plus"    => "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 12h8M12 8v8\"/>",
            "heart"   => "<path d=\"M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.2l7.8-7.8 1.1-1.1a5.5 5.5 0 0 0 0-7.8z\"/>",
            "feather" => "<path d=\"M20.2 3.8a5.5 5.5 0 0 0-7.8 0L4 12.2V20h7.8l8.4-8.4a5.5 5.5 0 0 0 0-7.8z\"/><path d=\"M16 8 2 22M17.5 15H9\"/>",
            _         => "<path d=\"M13 2 3 14h7l-1 8 10-12h-7l1-8z\"/>", // spark
        };
        return $"<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">{inner}</svg>";
    }

    // ── constant chrome (nav / footer / scripts) ─────────────────────
    private static void AppendNav(StringBuilder sb) => sb.Append(NavHtml);
    private static void AppendFooter(StringBuilder sb) => sb.Append(FooterHtml);
    private static void AppendScripts(StringBuilder sb) => sb.Append(ScriptsHtml);

    private const string NavHtml = """
<nav class="nav nav--scrolled" id="nav"><div class="nav__inner"><a href="/" class="nav__logo"><img src="logo-icon.png" alt="" class="nav__logo-icon"><span class="nav__logo-name">Creator Companion</span></a><div class="nav__links"><a href="/#pricing">Pricing</a><a href="/#faq-home">FAQ</a><a href="https://app.creatorcompanionapp.com/login">Log in</a><a href="signup.html" class="btn btn--primary btn--sm">Start free trial</a></div><button class="nav__hamburger" id="hamburger" aria-label="Open menu"><span></span><span></span><span></span></button></div></nav>
<div class="mobile-menu" id="mobileMenu"><a href="/#pricing">Pricing</a><a href="/#faq-home">FAQ</a><a href="https://app.creatorcompanionapp.com/login">Log in</a><a href="signup.html" class="btn btn--primary btn--sm">Start free trial</a></div>
""";

    private const string FooterHtml = """
<footer class="site-footer"><div class="container"><div class="site-footer__top"><a href="/" class="site-footer__logo"><img src="logo-icon.png" alt="" class="site-footer__logo-icon"><span class="site-footer__logo-name">Creator Companion</span></a><nav class="site-footer__nav"><a href="/#pricing">Pricing</a><a href="/#faq-home">FAQ</a><a href="signup.html">Sign up</a><a href="https://app.creatorcompanionapp.com/login">Log in</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a></nav></div><div class="site-footer__bottom"><span>© 2026 Creator Companion. All rights reserved.</span><div class="site-footer__socials"><a class="site-footer__social" href="https://bsky.app/profile/creatorcompanion.bsky.social" target="_blank" rel="noopener noreferrer" aria-label="Creator Companion on Bluesky"><svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.296 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/></svg></a><a class="site-footer__social" href="https://mastodon.social/@creatorcompanion" target="_blank" rel="noopener noreferrer me" aria-label="Creator Companion on Mastodon"><svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"/></svg></a><a class="site-footer__social" href="https://substack.com/@creatorcompanion" target="_blank" rel="noopener noreferrer" aria-label="Creator Companion on Substack"><svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/></svg></a></div></div></div></footer>
""";

    private const string ScriptsHtml = """
<script>
const hamburger=document.getElementById('hamburger'),menu=document.getElementById('mobileMenu');
hamburger.addEventListener('click',()=>{hamburger.classList.toggle('open');menu.classList.toggle('open');});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{hamburger.classList.remove('open');menu.classList.remove('open');}));
(function(){var v=document.querySelector('.lp-hero__video');if(!v)return;var s=navigator.connection&&navigator.connection.saveData,r=window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(window.matchMedia('(min-width: 769px)').matches&&!s&&!r){v.muted=true;v.src=v.dataset.src;v.load();v.addEventListener('canplay',function(){v.classList.add('is-playing');},{once:true});var p=v.play();if(p&&p.catch)p.catch(function(){});}})();
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-in');io.unobserve(e.target);}});},{threshold:0.12,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});
</script>
""";

    // The scoped landing-page CSS — kept identical to the hand-built template so
    // rendered pages match the marketing design exactly.
    private const string Css = """
:root{--lp-ink:#0c0e13;--lp-cyan:#12C4E3;--lp-cyan-deep:#0a93ab;}
.lp-wrap{max-width:1080px;margin:0 auto;padding:0 1.5rem;}
.lp-section{padding:clamp(4rem,8vw,6.75rem) 0;}
.lp-section--cream{background:linear-gradient(180deg,#fdfaf2 0%,#f6f1e6 100%);}
.lp-section--white{background:#fff;}
.lp-center{text-align:center;max-width:44rem;margin:0 auto;}
.lp-kicker{font-size:.8125rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--lp-cyan-deep);margin-bottom:.9rem;}
.lp-h2{font-family:'Fraunces',Georgia,serif;font-weight:800;letter-spacing:-.02em;font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.12;color:var(--lp-ink);margin:0 0 1rem;}
.lp-lead{font-size:1.0625rem;line-height:1.75;color:#3a3e4a;margin:0 0 1rem;}
.lp-btn{display:inline-flex;align-items:center;gap:.5rem;font-weight:700;font-size:1rem;padding:.9rem 1.6rem;border-radius:999px;text-decoration:none;transition:background .15s,color .15s,transform .15s,border-color .15s;}
.lp-btn--primary{background:var(--lp-ink);color:#fff;}
.lp-btn--ghost{color:var(--lp-ink);border:1px solid rgba(12,14,19,.18);}
@media (hover:hover) and (pointer:fine){.lp-btn--primary:hover{background:#0bd2f0;color:#06222a;transform:translateY(-1px);}.lp-btn--ghost:hover{border-color:var(--lp-cyan);color:var(--lp-cyan-deep);}}
.lp-hero{position:relative;overflow:hidden;min-height:92vh;display:flex;align-items:center;padding:7rem 1.5rem 4rem;text-align:center;color:#fff;}
.lp-hero__video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;opacity:0;transition:opacity 1s ease;}
.lp-hero__video.is-playing{opacity:1;}
.lp-hero__scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,16,.5) 0%,rgba(8,10,16,.2) 38%,rgba(8,10,16,.82) 100%),radial-gradient(75% 55% at 50% 65%,rgba(18,196,227,.12),transparent 72%);}
.lp-hero__inner{position:relative;z-index:2;max-width:56rem;margin:0 auto;}
.lp-hero h1{font-family:'Fraunces',Georgia,serif;font-weight:800;letter-spacing:-.02em;font-size:clamp(2.4rem,5.4vw,3.7rem);line-height:1.06;color:#fff;max-width:24ch;margin:0 auto 1.1rem;text-shadow:0 2px 24px rgba(0,0,0,.45);}
.lp-hero .lp-kicker{color:#5fe0f5;}
.lp-hero p.lp-sub{font-size:1.15rem;line-height:1.6;color:rgba(255,255,255,.85);max-width:42rem;margin:0 auto 2rem;text-shadow:0 1px 16px rgba(0,0,0,.4);}
.lp-cta-row{display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;}
.lp-hero .lp-btn--primary{background:var(--lp-cyan);color:#06222a;}
.lp-hero .lp-btn--ghost{color:#fff;border-color:rgba(255,255,255,.55);}
@media (hover:hover) and (pointer:fine){.lp-hero .lp-btn--primary:hover{background:#0bd2f0;}.lp-hero .lp-btn--ghost:hover{border-color:#fff;background:rgba(255,255,255,.1);}}
.lp-chips{display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;margin-top:1.75rem;}
.lp-chip{display:inline-flex;align-items:center;gap:.45rem;font-size:.875rem;font-weight:600;color:#3a3e4a;background:#fff;border:1px solid rgba(190,170,130,.32);border-radius:999px;padding:.5rem 1rem;}
.lp-chip svg{color:var(--lp-cyan-deep);}
.lp-row{display:grid;grid-template-columns:1fr 1fr;gap:clamp(2rem,5vw,4.5rem);align-items:center;}
.lp-row+.lp-row{margin-top:clamp(3rem,6vw,5rem);}
.lp-row__media img{width:100%;border-radius:22px;box-shadow:0 26px 64px -30px rgba(12,14,19,.4);display:block;}
.lp-phone{max-width:270px;margin:0 auto;border-radius:38px;padding:10px;background:#0c0e13;box-shadow:0 34px 70px -30px rgba(12,14,19,.5);}
.lp-phone img{display:block;width:100%;border-radius:28px;}
@media (max-width:760px){.lp-row{grid-template-columns:1fr;gap:2rem;}.lp-row__media{order:-1;}}
.lp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.25rem;margin-top:2.5rem;}
.lp-card{background:#fff;border:1px solid rgba(190,170,130,.3);border-radius:18px;padding:1.75rem;}
.lp-card__icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:rgba(18,196,227,.12);color:var(--lp-cyan-deep);margin-bottom:1.1rem;}
.lp-card h3{font-size:1.15rem;font-weight:800;color:var(--lp-ink);margin:0 0 .5rem;}
.lp-card p{font-size:1rem;line-height:1.65;color:#4a4f5e;margin:0;}
.lp-band{position:relative;padding:clamp(5rem,10vw,8rem) 1.5rem;text-align:center;color:#fff;}
.lp-band::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,10,16,.72),rgba(8,10,16,.82));}
.lp-band__inner{position:relative;max-width:40rem;margin:0 auto;}
.lp-band h2{font-family:'Fraunces',Georgia,serif;font-weight:800;font-size:clamp(1.9rem,4.5vw,3rem);line-height:1.12;margin:0 0 1rem;}
.lp-band p{font-size:1.15rem;line-height:1.65;color:rgba(255,255,255,.82);margin:0;}
.lp-tips{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem 2.25rem;margin-top:2.75rem;}
.lp-tip{display:flex;gap:1rem;}
.lp-tip__num{flex:none;width:40px;height:40px;border-radius:50%;background:var(--lp-ink);color:#fff;font-family:'Fraunces',serif;font-weight:700;display:grid;place-items:center;}
.lp-tip h3{font-size:1.0625rem;font-weight:800;color:var(--lp-ink);margin:.35rem 0 .4rem;}
.lp-tip p{font-size:.9875rem;line-height:1.6;color:#4a4f5e;margin:0;}
.lp-obj{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.25rem;margin-top:2.5rem;}
.lp-obj__item{background:#fff;border:1px solid rgba(190,170,130,.3);border-radius:18px;padding:1.6rem 1.75rem;}
.lp-obj__q{font-weight:800;color:var(--lp-ink);margin:0 0 .5rem;font-size:1.0625rem;}
.lp-obj__a{font-size:1rem;line-height:1.65;color:#4a4f5e;margin:0;}
.lp-obj__q::before{content:'\201C';color:var(--lp-cyan);font-family:'Fraunces',serif;font-weight:800;margin-right:.15rem;}
.lp-faq{max-width:46rem;margin:2.25rem auto 0;}
.lp-faq details{border-bottom:1px solid rgba(12,14,19,.1);padding:1.15rem 0;}
.lp-faq summary{font-weight:700;font-size:1.0625rem;color:var(--lp-ink);cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:1rem;}
.lp-faq summary::-webkit-details-marker{display:none;}
.lp-faq summary::after{content:'+';color:var(--lp-cyan);font-weight:700;}
.lp-faq details[open] summary::after{content:'\2013';}
.lp-faq p{font-size:1rem;line-height:1.7;color:#4a4f5e;margin:.75rem 0 0;}
.lp-related{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:center;margin-top:1.75rem;}
.lp-related a{font-size:.9375rem;font-weight:700;color:var(--lp-ink);background:#fff;border:1px solid rgba(190,170,130,.32);border-radius:999px;padding:.6rem 1.1rem;text-decoration:none;transition:border-color .15s,color .15s;}
@media (hover:hover) and (pointer:fine){.lp-related a:hover{border-color:var(--lp-cyan);color:var(--lp-cyan-deep);}}
.lp-final{background:var(--lp-ink);text-align:center;padding:clamp(4rem,9vw,6.5rem) 1.5rem;}
.lp-final h2{font-family:'Fraunces',Georgia,serif;font-weight:800;color:#fff;font-size:clamp(1.9rem,4.5vw,2.9rem);margin:0 0 1rem;}
.lp-final p{color:rgba(255,255,255,.7);font-size:1.0625rem;margin:0 0 2rem;}
.lp-final .lp-btn--primary{background:var(--lp-cyan);color:#06222a;}
@media (hover:hover) and (pointer:fine){.lp-final .lp-btn--primary:hover{background:#0bd2f0;}}
.reveal{opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease;}
.reveal.is-in{opacity:1;transform:none;}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none;}}
""";
}
