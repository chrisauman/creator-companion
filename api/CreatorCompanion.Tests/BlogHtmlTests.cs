using CreatorCompanion.Api.Application.Services;
using Xunit;

namespace CreatorCompanion.Tests;

/// <summary>
/// Covers the blog body sanitizer (security-critical — it cleans AI + admin HTML
/// on every write) plus the reading-time/snippet derivations.
/// </summary>
public class BlogHtmlTests
{
    [Fact]
    public void Sanitize_strips_scripts_and_inline_styles()
    {
        var dirty = "<p style=\"color:red\">Hi</p><script>alert(1)</script><p onclick=\"x()\">Bye</p>";
        var clean = BlogHtml.Sanitize(dirty);
        Assert.DoesNotContain("<script", clean);
        Assert.DoesNotContain("onclick", clean);
        Assert.DoesNotContain("style=", clean);
        Assert.Contains("Hi", clean);
        Assert.Contains("Bye", clean);
    }

    [Fact]
    public void Sanitize_keeps_allowed_richtext()
    {
        var html = "<h2>Heading</h2><p>A <strong>bold</strong> and <em>italic</em> line.</p><ul><li>one</li></ul><blockquote>q</blockquote><a href=\"https://x.com\">link</a>";
        var clean = BlogHtml.Sanitize(html);
        Assert.Contains("<h2>", clean);
        Assert.Contains("<strong>", clean);
        Assert.Contains("<blockquote>", clean);
        Assert.Contains("href=\"https://x.com\"", clean);
    }

    [Fact]
    public void Sanitize_drops_h1_to_protect_single_title()
    {
        var clean = BlogHtml.Sanitize("<h1>Should go</h1><p>keep</p>");
        Assert.DoesNotContain("<h1", clean);
        Assert.Contains("keep", clean);
    }

    [Theory]
    [InlineData("<iframe src=\"https://www.youtube.com/embed/abc\"></iframe>", true)]
    [InlineData("<iframe src=\"https://player.vimeo.com/video/123\"></iframe>", true)]
    [InlineData("<iframe src=\"https://evil.example.com/x\"></iframe>", false)]
    [InlineData("<iframe src=\"http://www.youtube.com/embed/abc\"></iframe>", false)]
    public void Sanitize_only_allows_safelisted_video_embeds(string html, bool shouldKeep)
    {
        var clean = BlogHtml.Sanitize(html);
        Assert.Equal(shouldKeep, clean.Contains("<iframe"));
    }

    [Fact]
    public void ReadingTime_is_at_least_one_minute()
    {
        Assert.Equal(1, BlogHtml.ReadingTimeMinutes("<p>just a few words</p>"));
        var long_ = "<p>" + string.Join(' ', Enumerable.Repeat("word", 600)) + "</p>";
        Assert.Equal(3, BlogHtml.ReadingTimeMinutes(long_));   // 600/200 = 3
    }

    [Fact]
    public void Snippet_strips_tags_and_truncates_on_word_boundary()
    {
        var s = BlogHtml.Snippet("<h2>Title</h2><p>" + string.Join(' ', Enumerable.Repeat("alpha", 60)) + "</p>", 140);
        Assert.DoesNotContain("<", s);
        Assert.True(s.Length <= 142);   // + ellipsis
        Assert.EndsWith("…", s);
    }
}
