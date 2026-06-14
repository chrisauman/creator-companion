using CreatorCompanion.Api.Application.Services;
using Xunit;

namespace CreatorCompanion.Tests;

/// <summary>
/// Covers the two cheap dedup tiers — exact-normalize and token-signature — and
/// the master-index classification. These are the safety net that stops research
/// re-surfacing things already queued/built, so the edge cases matter.
/// </summary>
public class KeywordDedupTests
{
    [Theory]
    [InlineData("Morning Pages App", "morning pages app")]
    [InlineData("  best   journaling   app!! ", "best journaling app")]
    [InlineData("Don't Break the Chain", "don t break the chain")]
    public void Normalize_lowercases_and_collapses(string input, string expected)
        => Assert.Equal(expected, KeywordDedup.Normalize(input));

    [Fact]
    public void Signature_ignores_filler_and_order()
    {
        // "best ... app" / "app for ..." / "... app" all reduce to the same core.
        var a = KeywordDedup.Signature("best morning pages app");
        var b = KeywordDedup.Signature("app for morning pages");
        var c = KeywordDedup.Signature("morning pages app");
        Assert.Equal(a, b);
        Assert.Equal(b, c);
    }

    [Fact]
    public void Signature_keeps_distinct_intents_distinct()
    {
        // Different qualifiers that DO change intent must not collapse.
        Assert.NotEqual(
            KeywordDedup.Signature("morning pages for anxiety"),
            KeywordDedup.Signature("morning pages for productivity"));
    }

    [Fact]
    public void Index_classifies_exact_near_and_new()
    {
        var index = new MasterKeywordIndex();
        index.Add("morning pages app", "morning-pages-app");

        Assert.Equal(DedupBucket.Duplicate, index.Classify("Morning Pages App").Bucket);
        Assert.Equal("morning-pages-app", index.Classify("morning pages app").MatchedSlug);
        Assert.Equal(DedupBucket.NearDuplicate, index.Classify("best morning pages app").Bucket);
        Assert.Equal(DedupBucket.New, index.Classify("art journal prompts").Bucket);
    }

    [Fact]
    public void Index_prefers_built_page_entry_for_slug()
    {
        var index = new MasterKeywordIndex();
        index.Add("art journal", null);                 // bare queue entry first
        index.Add("art journal", "art-journal-ideas");  // built page later
        Assert.Equal("art-journal-ideas", index.Classify("art journal").MatchedSlug);
    }
}
