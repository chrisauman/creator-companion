using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CreatorCompanion.Api.Application.DTOs;

namespace CreatorCompanion.Api.Application.Services;

public record GeneratedPage(string Slug, string MetaTitle, string MetaDescription, LpContent Content);

public interface ILandingPageGenerator
{
    bool IsConfigured { get; }

    /// <summary>
    /// Generates a complete landing page (SEO + section content) for a keyword
    /// via Claude. Returns null if the key is unset or the call/parse fails.
    /// </summary>
    Task<GeneratedPage?> GenerateAsync(string keyword, string? brief, IReadOnlyList<string> existingTitles, CancellationToken ct);

    /// <summary>
    /// Scores a generated page 0–100 on uniqueness (vs existing keywords), depth,
    /// and value — the auto-publish quality gate. Returns a conservative 50 on failure.
    /// </summary>
    Task<int> ScoreQualityAsync(GeneratedPage page, IReadOnlyList<string> existingKeywords, CancellationToken ct);
}

/// <summary>
/// AI landing-page author. Calls Claude's Messages API directly (no SDK) to
/// produce structured JSON matching the template schema, then a cheap Haiku
/// pass scores quality for the auto-publish gate. Brand voice + SEO rules live
/// in the system prompt. Degrades to null/50 on any failure — the worker treats
/// that as "skip / hold for review", never a crash.
/// </summary>
public class LandingPageGenerator(IHttpClientFactory httpFactory, IConfiguration config, ILogger<LandingPageGenerator> log)
    : ILandingPageGenerator
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    private readonly string? _apiKey = config["Anthropic:ApiKey"];
    private readonly string _genModel = config["Anthropic:GeneratorModel"] ?? "claude-sonnet-4-6";
    private readonly string _scoreModel = config["Anthropic:Model"] ?? "claude-haiku-4-5";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<GeneratedPage?> GenerateAsync(string keyword, string? brief, IReadOnlyList<string> existingTitles, CancellationToken ct)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(keyword)) return null;

        var existing = existingTitles.Count == 0 ? "(none yet)" : string.Join("; ", existingTitles.Take(40));
        var user =
            $"Target keyword/topic: \"{keyword}\"\n" +
            (string.IsNullOrWhiteSpace(brief) ? "" : $"Brief from the editor: {brief}\n") +
            $"\nExisting page titles (do NOT duplicate their angle): {existing}\n\n" +
            "Write a complete, genuinely useful landing page for this keyword. Return ONLY the JSON object.";

        var payload = new
        {
            model = _genModel,
            max_tokens = 4000,
            system = SystemPrompt,
            messages = new[] { new { role = "user", content = user } },
        };

        try
        {
            var text = await CallAsync(payload, ct);
            if (text is null) return null;
            var dto = ParseJson<GenDto>(text);
            if (dto?.Content is null || string.IsNullOrWhiteSpace(dto.MetaTitle)) return null;
            var slug = string.IsNullOrWhiteSpace(dto.Slug) ? keyword : dto.Slug!;
            return new GeneratedPage(slug, dto.MetaTitle!, dto.MetaDescription ?? "", dto.Content);
        }
        catch (Exception ex) { log.LogWarning(ex, "Landing page generation failed for '{Keyword}'.", keyword); return null; }
    }

    public async Task<int> ScoreQualityAsync(GeneratedPage page, IReadOnlyList<string> existingKeywords, CancellationToken ct)
    {
        if (!IsConfigured) return 50;
        var existing = existingKeywords.Count == 0 ? "(none)" : string.Join(", ", existingKeywords.Take(60));
        var summary = $"Title: {page.MetaTitle}\nDescription: {page.MetaDescription}\n" +
                      $"H1: {page.Content.Hero?.H1}\nExplainer: {string.Join(" ", page.Content.Explainer?.Paragraphs ?? new())}\n" +
                      $"Tips: {page.Content.Tips?.Count ?? 0}, FAQ: {page.Content.Faq?.Count ?? 0}, Cards: {page.Content.BenefitCards?.Count ?? 0}";
        var payload = new
        {
            model = _scoreModel,
            max_tokens = 10,
            system = "You are a strict SEO content editor. Score a landing page 0-100 on: genuine usefulness/depth, " +
                     "uniqueness vs the existing keyword list (penalise near-duplicates heavily), and on-topic completeness. " +
                     "A thin or templated page scores under 50. Reply with ONLY the integer.",
            messages = new[] { new { role = "user", content = $"Existing keywords: {existing}\n\n{summary}\n\nScore (0-100):" } },
        };
        try
        {
            var text = await CallAsync(payload, ct);
            if (text is not null && int.TryParse(new string(text.Where(char.IsDigit).ToArray()).Trim(), out var n))
                return Math.Clamp(n, 0, 100);
        }
        catch (Exception ex) { log.LogWarning(ex, "Quality scoring failed."); }
        return 50;
    }

    private async Task<string?> CallAsync(object payload, CancellationToken ct)
    {
        var http = httpFactory.CreateClient("social");
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"),
        };
        req.Headers.Add("x-api-key", _apiKey);
        req.Headers.Add("anthropic-version", "2023-06-01");
        var resp = await http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode)
        {
            log.LogWarning("Anthropic returned {Status} for landing-page generation.", (int)resp.StatusCode);
            return null;
        }
        var body = await resp.Content.ReadAsStringAsync(ct);
        return JsonNode.Parse(body)?["content"]?[0]?["text"]?.GetValue<string>();
    }

    /// <summary>Extract the first {...} block and deserialize — tolerant of stray prose.</summary>
    private static T? ParseJson<T>(string text)
    {
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) return default;
        return JsonSerializer.Deserialize<T>(text[start..(end + 1)], Json);
    }

    private class GenDto
    {
        public string? Slug { get; set; }
        public string? MetaTitle { get; set; }
        public string? MetaDescription { get; set; }
        public LpContent? Content { get; set; }
    }

    private const string SystemPrompt = """
You are the senior content + SEO writer for Creator Companion — a daily journaling app for creative people (writers, musicians, visual artists, filmmakers) that helps them keep a consistent creative practice. Key facts you may use: streak / "don't break the chain" with milestone badges + a 48-hour grace window; a daily Spark of encouragement + rotating prompts; up to 5 custom daily reminders; fully private (no social feed, no public profiles, no ads; encrypted; export/delete anytime); 10-day free trial then $5.99/month or $49.99/year.

VOICE: warm, calm, literary, encouraging — a cheerleader, never a drill sergeant. Frame creativity as "showing up" and "daily practice"; never shame; reframe setbacks gently. Speak to ALL creatives, not just writers. American English.

TASK: given a target keyword, write a genuinely useful, UNIQUE landing page that makes a creative person excited to try the app. Real advice and substance — never thin or templated. Weave the keyword naturally into the H1 and copy without stuffing.

Return ONLY a single JSON object (no markdown, no prose) with this exact shape:
{
  "slug": "kebab-case-from-keyword",
  "metaTitle": "<=60 chars, includes the keyword, ends with ' | Creator Companion'",
  "metaDescription": "<=155 chars, compelling, includes the keyword",
  "content": {
    "hero": { "kicker": "short eyebrow", "h1": "headline with the keyword", "subhead": "1-2 sentences", "ctaLabel": "Start your free 10-day trial" },
    "hook": { "heading": "a resonant promise", "lead": "1-2 sentences; you may use *emphasis*", "chips": ["3 short proof points"] },
    "explainer": { "kicker": "short", "h2": "What ... / Why ...", "paragraphs": ["2-3 substantive paragraphs of real explanation"], "imageUrl": "", "imageAlt": "describe an apt photo" },
    "benefitCards": [ { "icon": "spark|shield|clock|chart|music|plus|heart|feather", "title": "benefit", "body": "2-3 sentences" } ],
    "band": { "heading": "a short, quotable line", "subtext": "1 sentence", "imageUrl": "" },
    "tips": [ { "title": "actionable tip", "body": "1-2 sentences" } ],
    "featureRows": [
      { "kicker": "Don't break the chain", "h2": "...", "body": "tie the streak feature to this keyword", "mediaUrl": "images/mock-journal-mobile.jpg", "mediaAlt": "Creator Companion journal on a phone", "phone": true, "reverse": false },
      { "kicker": "A spark to begin", "h2": "...", "body": "tie the daily spark to this keyword", "mediaUrl": "images/spark-mockup.jpg", "mediaAlt": "Creator Companion daily spark on a phone", "phone": true, "reverse": true },
      { "kicker": "A nudge at your time", "h2": "...", "body": "tie reminders to this keyword", "mediaUrl": "images/reminders-mockup.jpg", "mediaAlt": "Creator Companion reminders on a phone", "phone": true, "reverse": false },
      { "kicker": "Yours alone", "h2": "Private by design", "body": "the privacy angle", "mediaUrl": "", "mediaAlt": "describe an apt calm photo", "phone": false, "reverse": true }
    ],
    "objections": [ { "q": "a real hesitation a creative would have", "a": "an empathetic reframe" } ],
    "faq": [ { "q": "a real question about this topic", "a": "a helpful, specific answer" } ],
    "finalCta": { "heading": "short closer", "subtext": "Ten days free. No credit card to start.", "ctaLabel": "Start your free trial" }
  }
}

RULES: 3-4 benefitCards; 4-6 tips; keep the 4 featureRows above (use those exact mediaUrl values for the three phone screenshots; leave the private row's mediaUrl ""); 3-4 objections; 5-7 faq. Leave explainer.imageUrl and band.imageUrl as "" (images are added separately). Output valid JSON only.
""";
}
