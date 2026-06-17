using System.Net;
using System.Text;
using System.Text.Json;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Infrastructure.Services;

// ── View models the controller assembles for the renderer ─────────────
public record BlogCardView(string Title, string Url, string? Snippet, string? ImageUrl, string? ImageAlt,
    string CategoryName, DateTime? Date, int ReadingMinutes);

public record BlogListingView(string Heading, string? Description, string? CategoryName, string CanonicalUrl,
    IReadOnlyList<BlogCardView> Cards, int CurrentPage, int TotalPages, string BasePath,
    IReadOnlyList<(string Name, string Url)> Breadcrumbs);

public record BlogRssItem(string Title, string Url, string? Description, DateTime Date);

public interface IBlogRenderer
{
    string RenderPost(BlogPost post, string categorySlug, string categoryName, BlogContent content,
        string url, IReadOnlyList<BlogCardView> related);
    string RenderListing(BlogListingView view);
    string Rss(IReadOnlyList<BlogRssItem> items);
}

/// <summary>
/// Server-side renderer for the blog: individual posts, the index + category
/// listings (paginated), and the RSS feed. Served on the marketing domain via
/// proxy, so it links the marketing styles.css + shared chrome and matches the
/// site design. Post bodies are pre-sanitized HTML emitted verbatim; all other
/// text is HTML-escaped. Emits BlogPosting/Breadcrumb/Organization (posts) and
/// CollectionPage/ItemList/Breadcrumb (listings) JSON-LD.
/// </summary>
public class BlogRenderer(IConfiguration config) : IBlogRenderer
{
    private readonly string _base = (config["Marketing:BaseUrl"] ?? "https://www.creatorcompanionapp.com").TrimEnd('/');
    private readonly string? _ga4 = config["Ga4:MeasurementId"];

    private static string E(string? s) => WebUtility.HtmlEncode(s ?? string.Empty);

    public string RenderPost(BlogPost post, string categorySlug, string categoryName, BlogContent content,
        string url, IReadOnlyList<BlogCardView> related)
    {
        var canonical = string.IsNullOrWhiteSpace(post.CanonicalUrl) ? url : post.CanonicalUrl!;
        var ogImage = !string.IsNullOrWhiteSpace(post.OgImageKey) ? post.OgImageKey!
            : !string.IsNullOrWhiteSpace(post.FeaturedImageUrl) ? Abs(post.FeaturedImageUrl!) : $"{_base}/og-image.png";
        var published = (post.PublishDate ?? post.PublishedAt ?? post.CreatedAt);
        var modified = post.LastUpdatedAt;
        var sb = new StringBuilder(16_384);

        sb.Append("<!DOCTYPE html><html lang=\"en\"><head>");
        MarketingChrome.AppendHead(sb);
        sb.Append($"<title>{E(string.IsNullOrWhiteSpace(post.MetaTitle) ? post.Title : post.MetaTitle)}</title>");
        sb.Append($"<meta name=\"description\" content=\"{E(post.MetaDescription)}\">");
        if (post.NoIndex) sb.Append("<meta name=\"robots\" content=\"noindex, nofollow\">");
        sb.Append($"<link rel=\"canonical\" href=\"{E(canonical)}\">");
        sb.Append("<meta property=\"og:type\" content=\"article\">");
        sb.Append($"<meta property=\"og:url\" content=\"{E(url)}\"><meta property=\"og:title\" content=\"{E(post.MetaTitle)}\">");
        sb.Append($"<meta property=\"og:description\" content=\"{E(post.MetaDescription)}\"><meta property=\"og:image\" content=\"{E(ogImage)}\">");
        sb.Append($"<meta property=\"article:published_time\" content=\"{published:yyyy-MM-ddTHH:mm:ssZ}\">");
        sb.Append($"<meta property=\"article:modified_time\" content=\"{modified:yyyy-MM-ddTHH:mm:ssZ}\">");
        sb.Append($"<meta property=\"article:section\" content=\"{E(categoryName)}\">");
        sb.Append("<meta name=\"twitter:card\" content=\"summary_large_image\">");
        sb.Append($"<meta name=\"twitter:title\" content=\"{E(post.MetaTitle)}\"><meta name=\"twitter:description\" content=\"{E(post.MetaDescription)}\"><meta name=\"twitter:image\" content=\"{E(ogImage)}\">");
        AppendPostJsonLd(sb, post, content, categoryName, categorySlug, url, ogImage, published, modified);
        MarketingChrome.AppendGa4(sb, _ga4);
        sb.Append("<style>").Append(Css).Append("</style></head><body class=\"page-inner\">");
        MarketingChrome.AppendNav(sb);

        sb.Append("<article class=\"bp\"><div class=\"bp-wrap\">");
        // breadcrumb
        sb.Append("<nav class=\"bp-crumbs\" aria-label=\"Breadcrumb\"><a href=\"/blog\">Blog</a> <span>›</span> ")
          .Append("<a href=\"/blog/").Append(E(categorySlug)).Append("\">").Append(E(categoryName)).Append("</a></nav>");
        sb.Append("<span class=\"bp-cat\">").Append(E(categoryName)).Append("</span>");
        sb.Append("<h1 class=\"bp-title\">").Append(E(post.Title)).Append("</h1>");
        if (!string.IsNullOrWhiteSpace(post.Dek)) sb.Append("<p class=\"bp-dek\">").Append(E(post.Dek)).Append("</p>");
        sb.Append("<div class=\"bp-meta\">").Append(published.ToString("MMMM d, yyyy"));
        if (modified.Date > published.Date) sb.Append(" · Updated ").Append(modified.ToString("MMMM d, yyyy"));
        sb.Append(" · ").Append(post.ReadingTimeMinutes).Append(" min read</div>");
        if (!string.IsNullOrWhiteSpace(post.FeaturedImageUrl))
            sb.Append("<img class=\"bp-hero\" src=\"").Append(E(post.FeaturedImageUrl)).Append("\" alt=\"").Append(E(post.FeaturedImageAlt)).Append("\">");

        // body — already sanitized HTML, emitted verbatim
        sb.Append("<div class=\"bp-body\">").Append(content.BodyHtml ?? "").Append("</div>");

        AppendFaq(sb, content.Faq);
        AppendCta(sb, content);
        // after-body region (Related Posts drops in here in a later version)
        if (related.Count > 0) AppendRelated(sb, related);
        sb.Append("<div class=\"bp-back\"><a href=\"/blog/").Append(E(categorySlug)).Append("\">← Back to ").Append(E(categoryName)).Append("</a></div>");
        sb.Append("</div></article>");

        MarketingChrome.AppendFooter(sb);
        MarketingChrome.AppendScripts(sb);
        sb.Append("</body></html>");
        return sb.ToString();
    }

    public string RenderListing(BlogListingView v)
    {
        var sb = new StringBuilder(12_288);
        sb.Append("<!DOCTYPE html><html lang=\"en\"><head>");
        MarketingChrome.AppendHead(sb);
        var pageSuffix = v.CurrentPage > 1 ? $" — Page {v.CurrentPage}" : "";
        sb.Append($"<title>{E(v.Heading)}{pageSuffix} | Creator Companion</title>");
        sb.Append($"<meta name=\"description\" content=\"{E(v.Description ?? "Ideas and encouragement for a daily creative practice.")}\">");
        sb.Append($"<link rel=\"canonical\" href=\"{E(v.CanonicalUrl)}\">");
        // rel prev/next for paginated listings
        if (v.CurrentPage > 1) sb.Append($"<link rel=\"prev\" href=\"{E(PageUrl(v.BasePath, v.CurrentPage - 1))}\">");
        if (v.CurrentPage < v.TotalPages) sb.Append($"<link rel=\"next\" href=\"{E(PageUrl(v.BasePath, v.CurrentPage + 1))}\">");
        sb.Append("<meta property=\"og:type\" content=\"website\">");
        sb.Append($"<meta property=\"og:title\" content=\"{E(v.Heading)}\"><meta property=\"og:url\" content=\"{E(v.CanonicalUrl)}\">");
        AppendListingJsonLd(sb, v);
        MarketingChrome.AppendGa4(sb, _ga4);
        sb.Append("<style>").Append(Css).Append("</style></head><body class=\"page-inner\">");
        MarketingChrome.AppendNav(sb);

        sb.Append("<section class=\"bl-hero\"><div class=\"bp-wrap lp-center\">");
        if (v.Breadcrumbs.Count > 0)
        {
            sb.Append("<nav class=\"bp-crumbs bp-crumbs--center\" aria-label=\"Breadcrumb\">");
            for (var i = 0; i < v.Breadcrumbs.Count; i++)
            {
                if (i > 0) sb.Append(" <span>›</span> ");
                sb.Append("<a href=\"").Append(E(v.Breadcrumbs[i].Url)).Append("\">").Append(E(v.Breadcrumbs[i].Name)).Append("</a>");
            }
            sb.Append("</nav>");
        }
        sb.Append("<p class=\"lp-kicker\">").Append(E(v.CategoryName is null ? "The blog" : "Category")).Append("</p>");
        sb.Append("<h1 class=\"bl-h1\">").Append(E(v.Heading)).Append("</h1>");
        if (!string.IsNullOrWhiteSpace(v.Description)) sb.Append("<p class=\"lp-lead\">").Append(E(v.Description)).Append("</p>");
        sb.Append("</div></section>");

        sb.Append("<section class=\"bl-list\"><div class=\"bp-wrap\">");
        if (v.Cards.Count == 0) sb.Append("<p class=\"lp-lead lp-center\">New posts are on the way.</p>");
        else
        {
            sb.Append("<div class=\"bl-grid\">");
            foreach (var c in v.Cards) AppendCard(sb, c);
            sb.Append("</div>");
            AppendPagination(sb, v);
        }
        sb.Append("</div></section>");

        MarketingChrome.AppendFooter(sb);
        MarketingChrome.AppendScripts(sb);
        sb.Append("</body></html>");
        return sb.ToString();
    }

    public string Rss(IReadOnlyList<BlogRssItem> items)
    {
        var sb = new StringBuilder(8192);
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        sb.Append("<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\"><channel>");
        sb.Append("<title>Creator Companion — The Blog</title>");
        sb.Append($"<link>{E(_base)}/blog</link>");
        sb.Append("<description>Ideas and encouragement for a daily creative practice.</description>");
        sb.Append("<language>en-us</language>");
        sb.Append($"<atom:link href=\"{E(_base)}/blog/rss.xml\" rel=\"self\" type=\"application/rss+xml\"/>");
        foreach (var it in items)
        {
            sb.Append("<item>");
            sb.Append("<title>").Append(E(it.Title)).Append("</title>");
            sb.Append("<link>").Append(E(it.Url)).Append("</link>");
            sb.Append("<guid isPermaLink=\"true\">").Append(E(it.Url)).Append("</guid>");
            if (!string.IsNullOrWhiteSpace(it.Description)) sb.Append("<description>").Append(E(it.Description)).Append("</description>");
            sb.Append("<pubDate>").Append(it.Date.ToString("R")).Append("</pubDate>");
            sb.Append("</item>");
        }
        sb.Append("</channel></rss>");
        return sb.ToString();
    }

    // ── pieces ────────────────────────────────────────────────────────
    private void AppendCard(StringBuilder sb, BlogCardView c)
    {
        sb.Append("<a class=\"bl-card reveal\" href=\"").Append(E(c.Url)).Append("\">");
        if (!string.IsNullOrWhiteSpace(c.ImageUrl))
            sb.Append("<div class=\"bl-card__img\"><img src=\"").Append(E(c.ImageUrl)).Append("\" alt=\"").Append(E(c.ImageAlt)).Append("\" loading=\"lazy\"></div>");
        sb.Append("<div class=\"bl-card__body\"><span class=\"bp-cat\">").Append(E(c.CategoryName)).Append("</span>");
        sb.Append("<h3>").Append(E(c.Title)).Append("</h3>");
        if (!string.IsNullOrWhiteSpace(c.Snippet)) sb.Append("<p>").Append(E(c.Snippet)).Append("</p>");
        sb.Append("<div class=\"bl-card__meta\">");
        if (c.Date is not null) sb.Append(c.Date.Value.ToString("MMM d, yyyy")).Append(" · ");
        sb.Append(c.ReadingMinutes).Append(" min read</div></div></a>");
    }

    private void AppendPagination(StringBuilder sb, BlogListingView v)
    {
        if (v.TotalPages <= 1) return;
        sb.Append("<nav class=\"bl-pager\" aria-label=\"Pagination\">");
        if (v.CurrentPage > 1) sb.Append("<a href=\"").Append(E(PageUrl(v.BasePath, v.CurrentPage - 1))).Append("\">← Prev</a>");
        for (var p = 1; p <= v.TotalPages; p++)
        {
            if (p == v.CurrentPage) sb.Append("<span class=\"bl-pager__cur\">").Append(p).Append("</span>");
            else sb.Append("<a href=\"").Append(E(PageUrl(v.BasePath, p))).Append("\">").Append(p).Append("</a>");
        }
        if (v.CurrentPage < v.TotalPages) sb.Append("<a href=\"").Append(E(PageUrl(v.BasePath, v.CurrentPage + 1))).Append("\">Next →</a>");
        sb.Append("</nav>");
    }

    private void AppendFaq(StringBuilder sb, List<LpQa> faq)
    {
        if (faq is null || faq.Count == 0) return;
        sb.Append("<section class=\"bp-faq\"><h2>Questions, answered</h2>");
        for (var i = 0; i < faq.Count; i++)
            sb.Append("<details").Append(i == 0 ? " open" : "").Append("><summary>").Append(E(faq[i].Q)).Append("</summary><p>").Append(E(faq[i].A)).Append("</p></details>");
        sb.Append("</section>");
    }

    private void AppendCta(StringBuilder sb, BlogContent content)
    {
        var heading = string.IsNullOrWhiteSpace(content.CtaHeading) ? "Keep the chain alive — one small step a day." : content.CtaHeading!;
        var label = string.IsNullOrWhiteSpace(content.CtaLabel) ? "Start your free 10-day trial" : content.CtaLabel!;
        sb.Append("<aside class=\"bp-cta\"><p>").Append(E(heading)).Append("</p>");
        sb.Append("<a href=\"/signup.html\" class=\"lp-btn lp-btn--primary\">").Append(E(label)).Append("</a></aside>");
    }

    private void AppendRelated(StringBuilder sb, IReadOnlyList<BlogCardView> related)
    {
        sb.Append("<section class=\"bp-related\"><h2>Keep reading</h2><div class=\"bl-grid\">");
        foreach (var c in related) AppendCard(sb, c);
        sb.Append("</div></section>");
    }

    private void AppendPostJsonLd(StringBuilder sb, BlogPost post, BlogContent content, string categoryName,
        string categorySlug, string url, string ogImage, DateTime published, DateTime modified)
    {
        var org = new Dictionary<string, object>
        {
            ["@type"] = "Organization", ["@id"] = _base + "/#org", ["name"] = "Creator Companion",
            ["url"] = _base + "/", ["logo"] = _base + "/logo-icon.png",
        };
        var graph = new List<object>
        {
            org,
            new Dictionary<string, object>
            {
                ["@type"] = "BlogPosting",
                ["@id"] = url + "#post",
                ["headline"] = post.Title,
                ["description"] = post.MetaDescription,
                ["image"] = ogImage,
                ["datePublished"] = published.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                ["dateModified"] = modified.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                ["author"] = new Dictionary<string, object> { ["@id"] = _base + "/#org" },
                ["publisher"] = new Dictionary<string, object> { ["@id"] = _base + "/#org" },
                ["mainEntityOfPage"] = url,
                ["articleSection"] = categoryName,
                ["inLanguage"] = "en-US",
            },
            new Dictionary<string, object>
            {
                ["@type"] = "BreadcrumbList",
                ["itemListElement"] = new object[]
                {
                    new Dictionary<string, object> { ["@type"]="ListItem", ["position"]=1, ["name"]="Blog", ["item"]=_base + "/blog" },
                    new Dictionary<string, object> { ["@type"]="ListItem", ["position"]=2, ["name"]=categoryName, ["item"]=$"{_base}/blog/{categorySlug}" },
                    new Dictionary<string, object> { ["@type"]="ListItem", ["position"]=3, ["name"]=post.Title, ["item"]=url },
                },
            },
        };
        if (content.Faq is { Count: > 0 })
        {
            graph.Add(new Dictionary<string, object>
            {
                ["@type"] = "FAQPage",
                ["mainEntity"] = content.Faq.Where(q => !string.IsNullOrWhiteSpace(q.Q)).Select(q => new Dictionary<string, object>
                {
                    ["@type"] = "Question", ["name"] = q.Q ?? "",
                    ["acceptedAnswer"] = new Dictionary<string, object> { ["@type"] = "Answer", ["text"] = q.A ?? "" },
                }).ToArray(),
            });
        }
        sb.Append("<script type=\"application/ld+json\">")
          .Append(JsonSerializer.Serialize(new Dictionary<string, object> { ["@context"] = "https://schema.org", ["@graph"] = graph }))
          .Append("</script>");
    }

    private void AppendListingJsonLd(StringBuilder sb, BlogListingView v)
    {
        var items = v.Cards.Select((c, i) => (object)new Dictionary<string, object>
        { ["@type"] = "ListItem", ["position"] = i + 1, ["url"] = c.Url, ["name"] = c.Title }).ToArray();
        var graph = new List<object>
        {
            new Dictionary<string, object>
            {
                ["@type"] = "CollectionPage", ["@id"] = v.CanonicalUrl + "#collection", ["url"] = v.CanonicalUrl,
                ["name"] = v.Heading, ["description"] = v.Description ?? "", ["inLanguage"] = "en-US",
            },
            new Dictionary<string, object> { ["@type"] = "ItemList", ["itemListElement"] = items },
        };
        if (v.Breadcrumbs.Count > 0)
        {
            graph.Add(new Dictionary<string, object>
            {
                ["@type"] = "BreadcrumbList",
                ["itemListElement"] = v.Breadcrumbs.Select((b, i) => (object)new Dictionary<string, object>
                { ["@type"] = "ListItem", ["position"] = i + 1, ["name"] = b.Name, ["item"] = b.Url }).ToArray(),
            });
        }
        sb.Append("<script type=\"application/ld+json\">")
          .Append(JsonSerializer.Serialize(new Dictionary<string, object> { ["@context"] = "https://schema.org", ["@graph"] = graph }))
          .Append("</script>");
    }

    private string Abs(string url) => url.StartsWith("http") ? url : $"{_base}/{url.TrimStart('/')}";
    private static string PageUrl(string basePath, int page) => page <= 1 ? basePath : $"{basePath.TrimEnd('/')}/page/{page}";

    private const string Css = """
:root{--lp-ink:#0c0e13;--lp-cyan:#12C4E3;--lp-cyan-deep:#0a93ab;}
.bp-wrap{max-width:1080px;margin:0 auto;padding:0 1.5rem;}
.lp-center{text-align:center;max-width:44rem;margin:0 auto;}
.lp-kicker{font-size:.8125rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--lp-cyan-deep);margin-bottom:.9rem;}
.lp-lead{font-size:1.0625rem;line-height:1.75;color:#3a3e4a;}
.lp-btn{display:inline-flex;align-items:center;gap:.5rem;font-weight:700;font-size:1rem;padding:.9rem 1.6rem;border-radius:999px;text-decoration:none;transition:background .15s,transform .15s;}
.lp-btn--primary{background:var(--lp-cyan);color:#06222a;}
@media (hover:hover) and (pointer:fine){.lp-btn--primary:hover{background:#0bd2f0;transform:translateY(-1px);}}
.bp{padding:7.5rem 0 4rem;background:#fff;}
.bp .bp-wrap{max-width:760px;}
.bp-crumbs{font-size:.85rem;color:#8a8f9c;margin-bottom:1rem;}
.bp-crumbs a{color:var(--lp-cyan-deep);text-decoration:none;}
.bp-crumbs span{margin:0 .25rem;color:#c3c7d0;}
.bp-crumbs--center{justify-content:center;}
.bp-cat{display:inline-block;font-size:.75rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--lp-cyan-deep);background:rgba(18,196,227,.12);padding:.25rem .7rem;border-radius:999px;}
.bp-title{font-family:'Fraunces',Georgia,serif;font-weight:800;letter-spacing:-.02em;font-size:clamp(2rem,4.5vw,3rem);line-height:1.12;color:var(--lp-ink);margin:.8rem 0 .6rem;}
.bp-dek{font-size:1.25rem;line-height:1.5;color:#4a4f5e;margin:0 0 .9rem;}
.bp-meta{font-size:.9rem;color:#8a8f9c;margin-bottom:1.75rem;}
.bp-hero{width:100%;border-radius:18px;margin-bottom:2rem;box-shadow:0 26px 64px -34px rgba(12,14,19,.4);display:block;}
.bp-body{font-size:1.125rem;line-height:1.8;color:#2a2e39;max-width:68ch;}
.bp-body p{margin:0 0 1.35rem;}
.bp-body h2{font-family:'Fraunces',Georgia,serif;font-weight:800;font-size:1.6rem;line-height:1.2;color:var(--lp-ink);margin:2.5rem 0 .9rem;}
.bp-body h3{font-weight:800;font-size:1.2rem;color:var(--lp-ink);margin:1.8rem 0 .6rem;}
.bp-body ul,.bp-body ol{margin:0 0 1.35rem;padding-left:1.3rem;}
.bp-body li{margin:.4rem 0;}
.bp-body a{color:var(--lp-cyan-deep);text-decoration:underline;text-underline-offset:2px;}
.bp-body blockquote{margin:1.75rem 0;padding:.4rem 0 .4rem 1.4rem;border-left:3px solid var(--lp-cyan);font-family:'Fraunces',Georgia,serif;font-size:1.3rem;line-height:1.45;color:var(--lp-ink);font-style:italic;}
.bp-body img{max-width:100%;height:auto;border-radius:14px;margin:1.5rem 0;}
.bp-body figure{margin:1.75rem 0;}.bp-body figcaption{font-size:.85rem;color:#8a8f9c;text-align:center;margin-top:.5rem;}
.bp-body iframe{width:100%;aspect-ratio:16/9;border:0;border-radius:14px;margin:1.5rem 0;}
.bp-body div[data-youtube-video]{margin:1.5rem 0;}
.bp-faq{max-width:68ch;margin:3rem 0 0;}
.bp-faq h2{font-family:'Fraunces',Georgia,serif;font-weight:800;font-size:1.5rem;margin:0 0 1rem;color:var(--lp-ink);}
.bp-faq details{border-bottom:1px solid rgba(12,14,19,.1);padding:1.05rem 0;}
.bp-faq summary{font-weight:700;font-size:1.05rem;color:var(--lp-ink);cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:1rem;}
.bp-faq summary::-webkit-details-marker{display:none;}
.bp-faq summary::after{content:'+';color:var(--lp-cyan);font-weight:700;}
.bp-faq details[open] summary::after{content:'\2013';}
.bp-faq p{font-size:1.0625rem;line-height:1.7;color:#4a4f5e;margin:.7rem 0 0;}
.bp-cta{margin:3rem 0 0;background:linear-gradient(180deg,#fdfaf2,#f6f1e6);border:1px solid rgba(190,170,130,.4);border-radius:18px;padding:2rem;text-align:center;}
.bp-cta p{font-family:'Fraunces',Georgia,serif;font-size:1.4rem;font-weight:700;color:var(--lp-ink);margin:0 0 1.1rem;}
.bp-related{margin-top:3.5rem;}.bp-related h2{font-family:'Fraunces',Georgia,serif;font-size:1.5rem;margin:0 0 1.25rem;}
.bp-back{margin-top:2.5rem;}.bp-back a{font-weight:700;color:var(--lp-cyan-deep);text-decoration:none;}
.bl-hero{background:linear-gradient(180deg,#fdfaf2 0%,#f6f1e6 100%);padding:8rem 0 3.5rem;}
.bl-h1{font-family:'Fraunces',Georgia,serif;font-weight:800;letter-spacing:-.02em;font-size:clamp(2.2rem,5vw,3.2rem);line-height:1.1;color:var(--lp-ink);margin:0 0 1rem;}
.bl-list{background:#fff;padding:3.5rem 0 5rem;}
.bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.5rem;}
.bl-card{display:flex;flex-direction:column;background:#fff;border:1px solid rgba(190,170,130,.3);border-radius:18px;overflow:hidden;text-decoration:none;transition:border-color .15s,transform .15s,box-shadow .15s;}
@media (hover:hover) and (pointer:fine){.bl-card:hover{border-color:var(--lp-cyan);transform:translateY(-3px);box-shadow:0 22px 48px -28px rgba(12,14,19,.32);}}
.bl-card__img{aspect-ratio:16/9;background:#eef1f3;overflow:hidden;}
.bl-card__img img{width:100%;height:100%;object-fit:cover;display:block;}
.bl-card__body{padding:1.25rem 1.35rem 1.4rem;display:flex;flex-direction:column;gap:.5rem;}
.bl-card__body h3{font-family:'Fraunces',Georgia,serif;font-size:1.25rem;line-height:1.25;color:var(--lp-ink);margin:.15rem 0 0;font-weight:800;}
.bl-card__body p{font-size:.95rem;line-height:1.55;color:#4a4f5e;margin:0;}
.bl-card__meta{font-size:.8rem;color:#8a8f9c;margin-top:auto;padding-top:.4rem;}
.bl-pager{display:flex;gap:.4rem;justify-content:center;align-items:center;margin-top:3rem;flex-wrap:wrap;}
.bl-pager a,.bl-pager span{min-width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;padding:0 .6rem;border-radius:9px;font-weight:700;font-size:.9rem;text-decoration:none;}
.bl-pager a{color:var(--lp-ink);border:1px solid rgba(190,170,130,.4);}
.bl-pager__cur{background:var(--lp-cyan);color:#06222a;}
@media (hover:hover) and (pointer:fine){.bl-pager a:hover{border-color:var(--lp-cyan);color:var(--lp-cyan-deep);}}
.reveal{opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease;}
.reveal.is-in{opacity:1;transform:none;}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none;}}
""";
}
