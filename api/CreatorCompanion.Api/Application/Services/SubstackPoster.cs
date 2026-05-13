using System.Net;

namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// Result of a Substack post attempt, surfaced to the admin UI + worker.
/// </summary>
public record SubstackPostResult(
    bool Success,
    int? StatusCode,
    string? NoteId,
    string? ErrorMessage,
    string? RawResponse  // truncated; useful for diagnosing schema drift
);

public interface ISubstackPoster
{
    /// <summary>
    /// Attempts to publish a Substack Note containing the given body
    /// text using the given session cookie. Returns success+noteId on a
    /// 2xx, otherwise surfaces the status code and response body.
    /// </summary>
    Task<SubstackPostResult> PostNoteAsync(string sessionCookie, string body, CancellationToken ct = default);
}

/// <summary>
/// Phase-1 implementation: sends a hand-crafted JSON body to the most
/// commonly observed Substack Notes endpoint
/// (https://substack.com/api/v1/comment/feed). The exact request shape
/// is unknown until phase 2 captures a real cURL from the admin's
/// browser; this implementation is good enough to verify the cookie is
/// being accepted by Substack (a 200/201 with a body, vs. a 401/403 if
/// the cookie is bad).
///
/// Expected outcomes for a freshly-pasted, valid cookie:
///   - Best case: post lands and we get a JSON body with an id field.
///   - Likely case: 400/422 because our envelope is wrong, but the
///     cookie itself authenticated — proving the auth half of the
///     pipeline works. We surface the raw response so the admin can
///     paste it back to me for phase 2.
///
/// We deliberately do NOT retry — phase 1 is "does the cookie work."
/// Retry/backoff lives in the background worker (phase 3).
/// </summary>
public class SubstackPoster : ISubstackPoster
{
    private const string NotesEndpoint = "https://substack.com/api/v1/comment/feed";

    private readonly HttpClient _http;
    private readonly ILogger<SubstackPoster> _log;

    public SubstackPoster(HttpClient http, ILogger<SubstackPoster> log)
    {
        _http = http;
        _log  = log;
    }

    public async Task<SubstackPostResult> PostNoteAsync(string sessionCookie, string body, CancellationToken ct = default)
    {
        // The admin pastes the FULL Cookie header value copied out of
        // their browser's DevTools request (every cookie, joined by
        // "; "). Substack sits behind Cloudflare and requires not just
        // substack.sid but cf_clearance, __cf_bm, AWSALBTG, etc. Phase
        // 1 tried to be clever about normalizing a bare-value paste —
        // that's gone now because we always need the full header.
        var cookieHeader = sessionCookie.Trim();

        // Best-guess Notes envelope until we capture a real one from
        // DevTools "Copy as cURL". Substack Notes are ProseMirror-doc
        // backed; this shape (bodyJson: { type:doc, content:[paragraph
        // [text]] }) matches their TipTap editor output. tabId/surface
        // are observed in the wild as required scaffolding.
        var envelope = new
        {
            bodyJson = new
            {
                type = "doc",
                content = new object[]
                {
                    new
                    {
                        type = "paragraph",
                        content = new object[]
                        {
                            new { type = "text", text = body }
                        }
                    }
                }
            },
            tabId = "for-you",
            surface = "feed"
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, NotesEndpoint);
        req.Headers.Add("Cookie", cookieHeader);

        // Browser-mimicking headers. Cloudflare's bot detection scores
        // requests on header fingerprints (Sec-Fetch-* group, modern
        // Chrome UA, Origin/Referer pair). Missing them is a strong
        // signal that the request isn't from a real browser. We can't
        // reproduce TLS-fingerprint matching here (would need a custom
        // SocketsHttpHandler), but the header set gets us close.
        req.Headers.UserAgent.ParseAdd(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
        req.Headers.Add("Accept", "application/json, text/plain, */*");
        req.Headers.Add("Accept-Language", "en-US,en;q=0.9");
        req.Headers.Add("Origin", "https://substack.com");
        req.Headers.Add("Referer", "https://substack.com/notes");
        req.Headers.Add("Sec-Fetch-Dest", "empty");
        req.Headers.Add("Sec-Fetch-Mode", "cors");
        req.Headers.Add("Sec-Fetch-Site", "same-origin");

        req.Content = JsonContent.Create(envelope);

        HttpResponseMessage? resp = null;
        try
        {
            resp = await _http.SendAsync(req, ct);
            var raw = await resp.Content.ReadAsStringAsync(ct);
            // Truncate for storage; full body in logs if we need it.
            var truncated = raw.Length > 1500 ? raw[..1500] + "…" : raw;

            if (!resp.IsSuccessStatusCode)
            {
                _log.LogWarning("Substack post failed: {Status} {Body}", (int)resp.StatusCode, truncated);
                return new SubstackPostResult(
                    Success: false,
                    StatusCode: (int)resp.StatusCode,
                    NoteId: null,
                    ErrorMessage: resp.StatusCode switch
                    {
                        HttpStatusCode.Unauthorized => "Substack rejected the cookie (401). Re-paste a fresh substack.sid.",
                        HttpStatusCode.Forbidden    => "Substack returned 403 — cookie may be tied to a different account or rate-limited.",
                        _                           => $"Substack returned {(int)resp.StatusCode}."
                    },
                    RawResponse: truncated
                );
            }

            // Try to extract a note id without locking ourselves into a
            // schema — we expect to refine this in phase 2.
            string? noteId = null;
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(raw);
                if (doc.RootElement.TryGetProperty("id", out var idEl))
                    noteId = idEl.ToString();
            }
            catch { /* best-effort */ }

            return new SubstackPostResult(true, (int)resp.StatusCode, noteId, null, truncated);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Substack post threw");
            return new SubstackPostResult(false, null, null, ex.Message, null);
        }
        finally
        {
            resp?.Dispose();
        }
    }
}
