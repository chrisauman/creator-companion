using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CreatorCompanion.Api.Application.DTOs;

namespace CreatorCompanion.Api.Application.Services;

public record GeneratedPage(string Slug, string MetaTitle, string MetaDescription, LpContent Content);

/// <summary>One brainstormed research candidate: the term + its inferred intent.</summary>
public record KeywordCandidate(string Keyword, string? Intent);

/// <summary>Result of an AI content edit: the new content + a human-readable change list.</summary>
public record AiEditResult(LpContent Content, IReadOnlyList<string> Changes);

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

    /// <summary>
    /// Brainstorm keyword/topic candidates for a research angle (Sonnet). Returns
    /// raw candidates — dedup against the master index happens downstream. Empty
    /// list on failure/no-key.
    /// </summary>
    Task<IReadOnlyList<KeywordCandidate>> BrainstormAsync(
        string theme, string? discipline, string? painPoint, string? hints, IReadOnlyList<string> avoid, CancellationToken ct);

    /// <summary>
    /// Write the descriptive brief a page will be built around when a keyword is
    /// committed to the queue (Sonnet). Returns null on failure — the page can
    /// still be generated keyword-only.
    /// </summary>
    Task<string?> GenerateBriefAsync(
        string keyword, string? theme, string? discipline, string? painPoint, string? intent,
        IReadOnlyList<string> relatedTitles, CancellationToken ct);

    /// <summary>
    /// Apply a natural-language edit to an existing page's content (Sonnet),
    /// staying strictly inside the template schema and changing ONLY what the
    /// instruction asks. Returns null if the key is unset or the result is
    /// invalid — callers must never apply a null/partial result.
    /// </summary>
    Task<AiEditResult?> EditContentAsync(LpContent current, string instruction, CancellationToken ct);
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

    public async Task<IReadOnlyList<KeywordCandidate>> BrainstormAsync(
        string theme, string? discipline, string? painPoint, string? hints, IReadOnlyList<string> avoid, CancellationToken ct)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(theme)) return Array.Empty<KeywordCandidate>();
        var avoidStr = avoid.Count == 0 ? "(none yet)" : string.Join("; ", avoid.Take(80));
        var user =
            $"Research angle: {theme}\n" +
            (string.IsNullOrWhiteSpace(discipline) ? "" : $"Creative discipline: {discipline}\n") +
            (string.IsNullOrWhiteSpace(painPoint) ? "" : $"Pain-point / job-to-be-done: {painPoint}\n") +
            (string.IsNullOrWhiteSpace(hints) ? "" : $"Extra direction from the editor: {hints}\n") +
            $"\nAlready covered — do NOT repeat these or trivial rewordings of them: {avoidStr}\n\n" +
            "Brainstorm 25-35 fresh keyword/topic candidates for this angle. Return ONLY the JSON object.";
        var payload = new
        {
            model = _genModel,
            max_tokens = 2000,
            system = BrainstormPrompt,
            messages = new[] { new { role = "user", content = user } },
        };
        try
        {
            var text = await CallAsync(payload, ct);
            var dto = text is null ? null : ParseJson<BrainstormDto>(text);
            if (dto?.Candidates is null) return Array.Empty<KeywordCandidate>();
            return dto.Candidates
                .Where(c => !string.IsNullOrWhiteSpace(c.Keyword))
                .Select(c => new KeywordCandidate(c.Keyword!.Trim(), Normalize(c.Intent)))
                .ToList();
        }
        catch (Exception ex) { log.LogWarning(ex, "Keyword brainstorm failed for '{Theme}'.", theme); return Array.Empty<KeywordCandidate>(); }

        static string? Normalize(string? intent)
        {
            intent = intent?.Trim().ToLowerInvariant();
            return intent is "informational" or "commercial" or "method" or "navigational" ? intent : null;
        }
    }

    public async Task<string?> GenerateBriefAsync(
        string keyword, string? theme, string? discipline, string? painPoint, string? intent,
        IReadOnlyList<string> relatedTitles, CancellationToken ct)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(keyword)) return null;
        var related = relatedTitles.Count == 0 ? "(none yet)" : string.Join("; ", relatedTitles.Take(30));
        var user =
            $"Keyword/topic: \"{keyword}\"\n" +
            (string.IsNullOrWhiteSpace(theme) ? "" : $"Angle: {theme}\n") +
            (string.IsNullOrWhiteSpace(discipline) ? "" : $"Discipline: {discipline}\n") +
            (string.IsNullOrWhiteSpace(painPoint) ? "" : $"Pain-point: {painPoint}\n") +
            (string.IsNullOrWhiteSpace(intent) ? "" : $"Search intent: {intent}\n") +
            $"Existing pages (for internal-link ideas): {related}\n\n" +
            "Write the page brief now.";
        var payload = new
        {
            model = _genModel,
            max_tokens = 1200,
            system = BriefPrompt,
            messages = new[] { new { role = "user", content = user } },
        };
        try
        {
            var text = await CallAsync(payload, ct);
            return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
        }
        catch (Exception ex) { log.LogWarning(ex, "Brief generation failed for '{Keyword}'.", keyword); return null; }
    }

    public async Task<AiEditResult?> EditContentAsync(LpContent current, string instruction, CancellationToken ct)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(instruction)) return null;
        var currentJson = JsonSerializer.Serialize(current, Json);
        var user =
            "Here is the current page content JSON:\n\n" + currentJson +
            "\n\nInstruction: " + instruction.Trim() +
            "\n\nReturn ONLY the JSON object {\"content\": {...}, \"changes\": [...]}.";
        var payload = new
        {
            model = _genModel,
            max_tokens = 5000,
            system = EditPrompt,
            messages = new[] { new { role = "user", content = user } },
        };
        try
        {
            var text = await CallAsync(payload, ct);
            if (text is null) return null;
            var dto = ParseJson<EditDto>(text);
            // Guard: a valid edit must return the full content object. A null
            // content means the model misbehaved — never partial-apply.
            if (dto?.Content is null) return null;
            var changes = (dto.Changes ?? new()).Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()).ToList();
            return new AiEditResult(dto.Content, changes);
        }
        catch (Exception ex) { log.LogWarning(ex, "AI content edit failed."); return null; }
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

    private class BrainstormDto { public List<CandidateDto>? Candidates { get; set; } }
    private class CandidateDto { public string? Keyword { get; set; } public string? Intent { get; set; } }
    private class EditDto { public LpContent? Content { get; set; } public List<string>? Changes { get; set; } }

    private const string BrainstormPrompt = """
You are an SEO keyword researcher for Creator Companion — a private daily journaling app that helps creative people (writers, musicians, visual artists, filmmakers, photographers, and more) keep a consistent creative practice. Features you can lean on: streaks / "don't break the chain", a daily Spark + rotating prompts, up to 5 custom reminders, fully private (no feed/ads), 10-day free trial.

Given a research angle, brainstorm specific, realistic search terms a creative person might type — long-tail and mid-tail, not generic head terms. Mix intents. Avoid near-duplicates of each other and of the "already covered" list. Each must be genuinely buildable into a useful page for THIS app.

Tag each with intent: "informational" (how-to/learn), "commercial" (best/app/comparison), "method" (a named practice e.g. morning pages, artist's way), or "navigational".

Return ONLY this JSON (no prose):
{ "candidates": [ { "keyword": "lowercase search phrase", "intent": "informational|commercial|method|navigational" } ] }
""";

    private const string BriefPrompt = """
You are a senior content strategist for Creator Companion (a private daily journaling app for creative people — streaks, daily Spark, prompts, reminders, fully private, 10-day trial then $5.99/mo).

Write a tight, build-ready brief for ONE landing page so a writer can build a genuinely useful, on-brand page around it. Voice is warm, calm, literary, encouraging — speaks to ALL creatives, never just writers, never shames.

Return PLAIN TEXT (no JSON, no markdown headers like ##) using exactly these labelled lines:
Audience: who is searching this and the emotional moment they're in
Intent: what they actually want from the result
Promise: the single argument this page makes
Key points: 4-6 semicolon-separated points the page must cover
Suggested blocks: which sections fit (hero, hook, explainer, benefit cards, tips, feature rows, objections, faq, final cta) and why a couple of them matter here
Tone: any angle-specific tone notes
Internal links: which existing pages (from the list) to link, or "none yet"
Keep it under ~220 words. Be specific to the keyword, not generic.
""";

    private const string EditPrompt = """
You edit the structured CONTENT of an existing Creator Companion landing page. You do NOT control layout, styling, or branding — a fixed template renders whatever content you return, so you can only change the DATA within the schema below.

ABSOLUTE RULES:
- Return the ENTIRE content object, not a fragment.
- Change ONLY what the instruction asks. Every other field must be preserved BYTE-FOR-BYTE.
- To remove a section, set it to null (objects) or an empty array (lists). The template hides empty sections.
- Stay on-brand: warm, calm, encouraging, speaks to all creatives, never shames. American English.
- Never invent new top-level fields or change the schema shape.

Schema (same as generation): content = { hero:{kicker,h1,subhead,ctaLabel,videoUrl,posterUrl}, hook:{heading,lead,chips[]}, explainer:{kicker,h2,paragraphs[],imageUrl,imageAlt}, benefitCards:[{icon,title,body}], band:{heading,subtext,imageUrl}, tips:[{title,body}], featureRows:[{kicker,h2,body,mediaUrl,mediaAlt,phone,reverse}], objections:[{q,a}], faq:[{q,a}], finalCta:{heading,subtext,ctaLabel} }

Return ONLY this JSON:
{ "content": { ...the full edited content... }, "changes": ["+ added X", "- removed Y", "~ reworded Z"] }
The "changes" array is a short human-readable summary (use +/-/~ prefixes), one line per distinct change.
""";

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
