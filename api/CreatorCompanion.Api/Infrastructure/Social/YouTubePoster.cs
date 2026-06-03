using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Infrastructure.Social;

/// <summary>
/// YouTube poster (YouTube Data API v3). Uploads the daily themed "Daily
/// Spark" Short as a public video via <c>videos.insert</c>.
///
/// AUTH (Workspace-Internal OAuth): the stored credential is
/// {"clientId","clientSecret","refreshToken"}. We exchange the long-lived
/// refresh token for a short-lived access token on each post — the refresh
/// token doesn't expire for an Internal app, so no re-auth dance ever.
///
/// UPLOAD: a single multipart/related request (metadata JSON + the MP4
/// bytes) to the resumable/upload host. Our Shorts are ~1–2 MB so multipart
/// is simpler than the chunked resumable protocol and well within limits.
///
/// This is a VIDEO adapter (<see cref="IsVideo"/> = true): the posting
/// service renders the Short and hands us <see cref="SocialPublishRequest.VideoBytes"/>;
/// there is no image path. Vertical + short-duration + a "#Shorts" tag let
/// YouTube classify it as a Short automatically.
/// </summary>
public class YouTubePoster(IHttpClientFactory httpFactory, IEntryEncryptor encryptor) : ISocialPoster
{
    private const string TokenUrl  = "https://oauth2.googleapis.com/token";
    private const string UploadUrl = "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart";

    public SocialPlatform Platform => SocialPlatform.YouTube;
    public int  CharacterLimit => 4500;   // description limit is 5000; leave margin
    public bool SupportsImages => false;   // video platform — no image leg
    public bool IsVideo => true;

    public async Task<SocialPublishResult> PublishAsync(
        SocialAccount account, SocialPublishRequest request, CancellationToken ct)
    {
        if (request.VideoBytes is null || request.VideoBytes.Length == 0)
            return Fail("No video was rendered for the YouTube post.");

        var creds = ReadCreds(account);
        if (creds is null)
            return Fail("YouTube credentials are not set or unreadable (need clientId/clientSecret/refreshToken).");

        var http = httpFactory.CreateClient();

        // 1) refresh token -> access token
        string accessToken;
        {
            var form = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"]     = creds.Value.clientId,
                ["client_secret"] = creds.Value.clientSecret,
                ["refresh_token"] = creds.Value.refreshToken,
                ["grant_type"]    = "refresh_token",
            });
            using var tr = await http.PostAsync(TokenUrl, form, ct);
            var tb = await tr.Content.ReadAsStringAsync(ct);
            if (!tr.IsSuccessStatusCode)
                return Fail($"Google token refresh failed ({(int)tr.StatusCode}): {Brief(tb)}", (int)tr.StatusCode);
            accessToken = JsonNode.Parse(tb)?["access_token"]?.GetValue<string>() ?? "";
            if (string.IsNullOrEmpty(accessToken))
                return Fail("Google token refresh returned no access_token.");
        }

        // 2) build metadata
        var title = Clamp(string.IsNullOrWhiteSpace(request.VideoTitle) ? "Daily Spark" : request.VideoTitle!, 100);
        var description = (request.Text ?? string.Empty).Trim();
        if (!description.Contains("#Shorts", StringComparison.OrdinalIgnoreCase))
            description = (description + "\n\n#Shorts").Trim();

        var metadata = new JsonObject
        {
            ["snippet"] = new JsonObject
            {
                ["title"]       = title,
                ["description"] = Clamp(description, 4900),
                ["categoryId"]  = "22",   // People & Blogs
                ["tags"]        = new JsonArray("creativity", "dailyspark", "shorts"),
            },
            ["status"] = new JsonObject
            {
                ["privacyStatus"]            = "public",
                ["selfDeclaredMadeForKids"]  = false,
            },
        };

        // 3) multipart/related upload (metadata + media)
        using var content = new MultipartContent("related");
        var meta = new StringContent(metadata.ToJsonString(), Encoding.UTF8);
        meta.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        content.Add(meta);

        var media = new ByteArrayContent(request.VideoBytes);
        media.Headers.ContentType = new MediaTypeHeaderValue(request.VideoContentType ?? "video/mp4");
        content.Add(media);

        using var req = new HttpRequestMessage(HttpMethod.Post, UploadUrl) { Content = content };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var resp = await http.SendAsync(req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            return Fail($"YouTube upload failed ({(int)resp.StatusCode}): {GraphError(body)}", (int)resp.StatusCode);

        var videoId = JsonNode.Parse(body)?["id"]?.GetValue<string>();
        if (string.IsNullOrEmpty(videoId))
            return Fail("YouTube upload returned no video id.");

        var url = $"https://www.youtube.com/shorts/{videoId}";
        return new SocialPublishResult(true, url, videoId, null, (int)resp.StatusCode);
    }

    // ── helpers ──────────────────────────────────────────────────────
    private (string clientId, string clientSecret, string refreshToken)? ReadCreds(SocialAccount account)
    {
        if (string.IsNullOrWhiteSpace(account.CredentialsEncrypted)) return null;
        try
        {
            var json = encryptor.DecryptString(account.CredentialsEncrypted);
            var n = JsonNode.Parse(json);
            var id = n?["clientId"]?.GetValue<string>();
            var secret = n?["clientSecret"]?.GetValue<string>();
            var refresh = n?["refreshToken"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(refresh))
                return null;
            return (id!, secret!, refresh!);
        }
        catch { return null; }
    }

    private static string Clamp(string s, int max) => s.Length <= max ? s : s[..max];
    private static string Brief(string s) => s.Length > 300 ? s[..300] : s;

    /// <summary>Pull Google's nested error.message when present, else a brief body.</summary>
    private static string GraphError(string body)
    {
        try
        {
            var msg = JsonNode.Parse(body)?["error"]?["message"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(msg)) return msg!;
            // errors[].message for some Google APIs
            var arr = JsonNode.Parse(body)?["error"]?["errors"]?.AsArray();
            if (arr is { Count: > 0 }) return arr[0]?["message"]?.GetValue<string>() ?? Brief(body);
        }
        catch { /* fall through */ }
        return Brief(body);
    }

    private static SocialPublishResult Fail(string message, int? status = null) =>
        new(false, null, null, message, status);
}
