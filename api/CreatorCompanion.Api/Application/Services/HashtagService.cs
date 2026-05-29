using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CreatorCompanion.Api.Application.Interfaces;

namespace CreatorCompanion.Api.Application.Services;

public interface IHashtagService
{
    /// <summary>
    /// Suggests up to <paramref name="maxCount"/> hashtags (each with a
    /// leading '#') relevant to the given post content, blended with
    /// evergreen tags for creative people sustaining a daily practice.
    /// Returns an empty list — never throws and never null — when the
    /// Anthropic key is unset or the call fails, so a hashtag outage can
    /// never block a post from going out.
    /// </summary>
    Task<IReadOnlyList<string>> GenerateAsync(string content, int maxCount, CancellationToken ct);

    /// <summary>True when an Anthropic API key is configured.</summary>
    bool IsConfigured { get; }
}

/// <summary>
/// Auto-hashtag enrichment via Anthropic's Claude Haiku (cheap + fast).
/// Calls the Messages API directly over HTTP — no SDK dependency, which
/// keeps the csproj lean and the call surface tiny (one POST).
///
/// Design rule: degrade, never fail. The whole posting pipeline treats
/// hashtags as a nice-to-have; if the key is missing or the API errors,
/// we log + return [] and the post still ships (just without tags). This
/// matches the admin's "wire it, graceful skip if unset" choice.
///
/// Key from Anthropic:ApiKey (Anthropic__ApiKey on Railway). Model from
/// Anthropic:Model, defaulting to the latest Haiku.
/// </summary>
public class HashtagService(
    IHttpClientFactory httpFactory,
    IConfiguration config,
    ILogger<HashtagService> log) : IHashtagService
{
    private const string DefaultModel = "claude-haiku-4-5";

    private readonly string? _apiKey = config["Anthropic:ApiKey"];
    private readonly string _model = config["Anthropic:Model"] ?? DefaultModel;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<IReadOnlyList<string>> GenerateAsync(string content, int maxCount, CancellationToken ct)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(content) || maxCount <= 0)
            return [];

        var system =
            "You generate concise, relevant hashtags for a social post from a daily-creativity app. " +
            "The app helps creative people (writers, musicians, visual artists, filmmakers) keep a " +
            "consistent daily creative practice. Given the post text, return ONLY hashtags — no prose, " +
            "no explanation. Blend tags specific to the post's content with a few evergreen tags about " +
            "creativity, daily practice, and showing up consistently (e.g. #CreativePractice #MakeEveryday " +
            "#AmWriting where genuinely apt). Use CamelCase for multi-word tags. Return them space-separated " +
            $"on a single line. Return at most {maxCount} hashtags.";

        var payload = new
        {
            model = _model,
            max_tokens = 120,
            system,
            messages = new[] { new { role = "user", content = Truncate(content, 1500) } },
        };

        try
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
                log.LogWarning("Hashtag generation failed: Anthropic returned {Status}.", (int)resp.StatusCode);
                return [];
            }

            var body = await resp.Content.ReadAsStringAsync(ct);
            var text = JsonNode.Parse(body)?["content"]?[0]?["text"]?.GetValue<string>();
            return Parse(text, maxCount);
        }
        catch (Exception ex)
        {
            // Never let a hashtag hiccup block a post.
            log.LogWarning(ex, "Hashtag generation threw; posting without hashtags.");
            return [];
        }
    }

    /// <summary>
    /// Parse the model's free-text reply into clean, de-duplicated
    /// hashtags. Defensive: tolerates commas, newlines, missing '#', and
    /// stray punctuation so we never emit a malformed tag onto a post.
    /// </summary>
    private static List<string> Parse(string? raw, int maxCount)
    {
        if (string.IsNullOrWhiteSpace(raw)) return [];

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<string>();

        foreach (var token in raw.Split([' ', ',', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries))
        {
            // Keep only alphanumerics from the token body; drop '#' and
            // any trailing punctuation the model added.
            var cleaned = new string(token.Where(char.IsLetterOrDigit).ToArray());
            if (cleaned.Length is 0 or > 60) continue;
            if (!seen.Add(cleaned)) continue;

            result.Add("#" + cleaned);
            if (result.Count >= maxCount) break;
        }

        return result;
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];
}
