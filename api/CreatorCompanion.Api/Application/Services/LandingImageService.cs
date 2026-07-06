using System.Text.Json.Nodes;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;

namespace CreatorCompanion.Api.Application.Services;

public record PexelsPhoto(long Id, string Photographer, string Alt, string ThumbUrl, string FullUrl);

public interface ILandingImageService
{
    bool IsConfigured { get; }

    /// <summary>Search Pexels (free, commercial-licensed) for the admin image picker.</summary>
    Task<IReadOnlyList<PexelsPhoto>> SearchAsync(string query, int perPage, CancellationToken ct);

    /// <summary>
    /// Download a chosen photo, store it, and return a relative, same-origin URL
    /// (lp-img/{id}) the marketing site serves via proxy — so it satisfies the
    /// marketing CSP's img-src 'self'. Null on failure.
    /// </summary>
    Task<string?> StoreFromUrlAsync(string url, CancellationToken ct);

    /// <summary>AI auto-source: search Pexels for a query and store the top result. Null if nothing/unconfigured.</summary>
    Task<string?> SourceForAsync(string query, CancellationToken ct);
}

/// <summary>
/// Free-stock image integration (Pexels) for landing pages. Search powers the
/// admin picker; store downloads a photo into R2, maps it to a GUID via
/// SocialCardAsset (reused as a generic public-image map), and returns a
/// same-origin lp-img/{id} URL. Degrades to empty/null when the Pexels key is
/// unset, so pages still build (just without sourced photos).
/// </summary>
public class LandingImageService(
    IHttpClientFactory httpFactory,
    IStorageService storage,
    AppDbContext db,
    IConfiguration config,
    ILogger<LandingImageService> log) : ILandingImageService
{
    private readonly string? _apiKey = config["Pexels:ApiKey"];
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<IReadOnlyList<PexelsPhoto>> SearchAsync(string query, int perPage, CancellationToken ct)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(query)) return [];
        try
        {
            var http = httpFactory.CreateClient("social");
            using var req = new HttpRequestMessage(HttpMethod.Get,
                $"https://api.pexels.com/v1/search?query={Uri.EscapeDataString(query)}&per_page={Math.Clamp(perPage, 1, 30)}&orientation=landscape");
            req.Headers.Add("Authorization", _apiKey);
            var resp = await http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) { log.LogWarning("Pexels search returned {Status}.", (int)resp.StatusCode); return []; }
            var node = JsonNode.Parse(await resp.Content.ReadAsStringAsync(ct));
            var photos = node?["photos"]?.AsArray();
            if (photos is null) return [];
            var list = new List<PexelsPhoto>();
            foreach (var p in photos)
            {
                var src = p?["src"];
                list.Add(new PexelsPhoto(
                    p?["id"]?.GetValue<long>() ?? 0,
                    p?["photographer"]?.GetValue<string>() ?? "",
                    p?["alt"]?.GetValue<string>() ?? "",
                    src?["medium"]?.GetValue<string>() ?? "",
                    src?["large2x"]?.GetValue<string>() ?? src?["large"]?.GetValue<string>() ?? src?["original"]?.GetValue<string>() ?? ""));
            }
            return list;
        }
        catch (Exception ex) { log.LogWarning(ex, "Pexels search failed."); return []; }
    }

    // Only Pexels' own hosts may be fetched server-side. This is the SSRF guard:
    // the URL comes from an admin request body, so without an allowlist it could
    // point at internal services / the cloud metadata endpoint (169.254.169.254).
    // The legitimate callers only ever pass Pexels URLs, so this never blocks a
    // real fetch. Redirects can't escape it — the INITIAL host must be allowed,
    // and Pexels never redirects off-network.
    private static bool IsAllowedImageHost(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != Uri.UriSchemeHttps) return false;
        return uri.Host.Equals("images.pexels.com", StringComparison.OrdinalIgnoreCase)
            || uri.Host.Equals("api.pexels.com", StringComparison.OrdinalIgnoreCase)
            || uri.Host.EndsWith(".pexels.com", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<string?> StoreFromUrlAsync(string url, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        if (!IsAllowedImageHost(url))
        {
            log.LogWarning("Refusing to fetch non-allowlisted image URL (SSRF guard).");
            return null;
        }
        try
        {
            // Normalize to a web-sized landscape JPEG via Pexels' own CDN params.
            var sized = url.Contains("images.pexels.com")
                ? $"{url.Split('?')[0]}?auto=compress&cs=tinysrgb&w=1400&h=1050&fit=crop"
                : url;

            var http = httpFactory.CreateClient("social");
            using var resp = await http.GetAsync(sized, ct);
            if (!resp.IsSuccessStatusCode) { log.LogWarning("Image download returned {Status}.", (int)resp.StatusCode); return null; }
            var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
            if (bytes.Length == 0) return null;

            using var ms = new MemoryStream(bytes);
            var key = await storage.SaveAsync(ms, "lp-img.jpg", "image/jpeg");
            var asset = new SocialCardAsset { StorageKey = key, ContentType = "image/jpeg" };
            db.SocialCardAssets.Add(asset);
            await db.SaveChangesAsync(ct);
            return $"lp-img/{asset.Id}";
        }
        catch (Exception ex) { log.LogWarning(ex, "Storing landing image failed."); return null; }
    }

    public async Task<string?> SourceForAsync(string query, CancellationToken ct)
    {
        var results = await SearchAsync(query, 5, ct);
        var pick = results.FirstOrDefault(r => !string.IsNullOrWhiteSpace(r.FullUrl));
        return pick is null ? null : await StoreFromUrlAsync(pick.FullUrl, ct);
    }
}
