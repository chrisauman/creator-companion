using System.Text.Json;
using System.Text.RegularExpressions;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Services;
using Microsoft.Extensions.Configuration;

namespace CreatorCompanion.Tests;

public class LandingPageRendererTests
{
    private static LandingPage Page(LpContent content, bool noindex = false) => new()
    {
        Slug = "test-page",
        Status = LandingPageStatus.Published,
        TargetKeyword = "test keyword",
        MetaTitle = "Test Page | Creator Companion",
        MetaDescription = "A test page description.",
        NoIndex = noindex,
        ContentJson = JsonSerializer.Serialize(content),
        PublishedAt = DateTime.UtcNow,
    };

    private static LandingPageRenderer Renderer() =>
        new(new ConfigurationBuilder().Build());

    [Fact]
    public void Renders_all_sections_and_escapes_content()
    {
        var content = new LpContent
        {
            Hero = new() { H1 = "Headline <script>", Kicker = "Kicker", Subhead = "Sub", CtaLabel = "Go" },
            Hook = new() { Heading = "Hook", Lead = "Lead with *emphasis*", Chips = { "A", "B" } },
            Explainer = new() { H2 = "What", Paragraphs = { "Para one." }, ImageUrl = "images/x.jpg", ImageAlt = "alt" },
            BenefitCards = { new() { Icon = "spark", Title = "Card", Body = "Body" } },
            Band = new() { Heading = "Band line", ImageUrl = "images/b.jpg" },
            Tips = { new() { Title = "Tip", Body = "Do this" } },
            FeatureRows = { new() { H2 = "Feature", Body = "Body", MediaUrl = "images/m.jpg", Phone = true } },
            Objections = { new() { Q = "Why?", A = "Because" } },
            Faq = { new() { Q = "Q1", A = "A1" } },
            FinalCta = new() { Heading = "End", CtaLabel = "Start" },
        };

        var html = Renderer().Render(Page(content), new List<LandingPage>());

        Assert.Contains("lp-hero", html);
        Assert.Contains("lp-chips", html);
        Assert.Contains("lp-cards", html);
        Assert.Contains("lp-band", html);
        Assert.Contains("lp-tips", html);
        Assert.Contains("lp-obj", html);
        Assert.Contains("lp-faq", html);
        Assert.Contains("lp-final", html);
        // HTML is escaped — no raw injected tag from content
        Assert.DoesNotContain("Headline <script>", html);
        Assert.Contains("Headline &lt;script&gt;", html);
        // *emphasis* becomes <em>
        Assert.Contains("<em>emphasis</em>", html);
    }

    [Fact]
    public void Emits_valid_jsonld_with_webpage_breadcrumb_and_faq()
    {
        var content = new LpContent { Hero = new() { H1 = "H" }, Faq = { new() { Q = "Q", A = "A" } } };
        var html = Renderer().Render(Page(content), new List<LandingPage>());

        var block = Regex.Match(html, "<script type=\"application/ld\\+json\">(.*?)</script>", RegexOptions.Singleline).Groups[1].Value;
        Assert.False(string.IsNullOrWhiteSpace(block));
        using var doc = JsonDocument.Parse(block);     // throws if invalid JSON
        var types = doc.RootElement.GetProperty("@graph").EnumerateArray()
            .Select(n => n.GetProperty("@type").GetString()).ToList();
        Assert.Contains("WebPage", types);
        Assert.Contains("BreadcrumbList", types);
        Assert.Contains("FAQPage", types);
    }

    [Fact]
    public void Noindex_emits_robots_meta()
    {
        var html = Renderer().Render(Page(new LpContent { Hero = new() { H1 = "H" } }, noindex: true), new List<LandingPage>());
        Assert.Contains("name=\"robots\" content=\"noindex", html);
    }

    [Fact]
    public void Hub_lists_pages()
    {
        var pages = new List<LandingPage> { Page(new LpContent()) };
        var html = Renderer().RenderHub(pages);
        Assert.Contains("lp-hub-grid", html);
        Assert.Contains("/test-page", html);
    }
}
