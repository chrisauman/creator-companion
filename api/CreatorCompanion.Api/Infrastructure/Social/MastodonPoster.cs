using System.Net.Http.Headers;
using System.Text.Json.Nodes;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Infrastructure.Social;

/// <summary>
/// Mastodon poster. Auth is a personal access token created on the
/// instance (Preferences → Development → New application, with the
/// "write:statuses" + "write:media" scopes, then copy the access token).
/// No OAuth dance needed for a single-user admin token.
///
/// Flow: optional POST /api/v2/media (multipart) → POST /api/v1/statuses
/// with the media id attached. The status response includes a ready-made
/// public "url" so no permalink reconstruction is needed.
///
/// Credential blob shape (encrypted on SocialAccount.CredentialsEncrypted):
///   {"accessToken":"..."}
/// Instance base URL = SocialAccount.Endpoint (e.g. "https://mastodon.social").
///
/// Note on char limit: Mastodon's default is 500 but instances can raise
/// it. We use the conservative 500 default; if a connected instance
/// allows more, truncation just leaves headroom unused — never an error.
/// </summary>
public class MastodonPoster(IHttpClientFactory httpFactory, IEntryEncryptor encryptor) : ISocialPoster
{
    public SocialPlatform Platform => SocialPlatform.Mastodon;
    public int CharacterLimit => 500;
    public bool SupportsImages => true;

    public async Task<SocialPublishResult> PublishAsync(
        SocialAccount account, SocialPublishRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(account.Endpoint))
            return Fail("Mastodon instance URL is not set (e.g. https://mastodon.social).");

        var token = ReadCredential(account, "accessToken");
        if (string.IsNullOrWhiteSpace(token))
            return Fail("Mastodon access token is not set. Create one in Preferences → Development on your instance.");

        var instance = account.Endpoint.TrimEnd('/');
        var http = httpFactory.CreateClient("social");

        string? mediaId = null;
        if (request.ImageBytes is { Length: > 0 })
        {
            mediaId = await UploadMediaAsync(http, instance, token, request, ct);
            if (mediaId is null)
                return Fail("Mastodon media upload failed.");
        }

        // POST /api/v1/statuses as form-urlencoded (Mastodon accepts form
        // bodies; media_ids[] is the array convention).
        var form = new List<KeyValuePair<string, string>> { new("status", request.Text) };
        if (mediaId is not null) form.Add(new("media_ids[]", mediaId));

        using var req = new HttpRequestMessage(HttpMethod.Post, $"{instance}/api/v1/statuses")
        {
            Content = new FormUrlEncodedContent(form),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var resp = await http.SendAsync(req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            return Fail($"Mastodon post failed ({(int)resp.StatusCode}): {Trim(body)}", (int)resp.StatusCode);

        var status = JsonNode.Parse(body);
        var url = status?["url"]?.GetValue<string>();
        var id = status?["id"]?.GetValue<string>();
        return new SocialPublishResult(true, url, id, null, (int)resp.StatusCode);
    }

    /// <summary>Uploads media via /api/v2/media and returns the media id, or null on failure.</summary>
    private static async Task<string?> UploadMediaAsync(
        HttpClient http, string instance, string token, SocialPublishRequest request, CancellationToken ct)
    {
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(request.ImageBytes!);
        file.Headers.ContentType = new MediaTypeHeaderValue(request.ImageContentType ?? "image/jpeg");
        content.Add(file, "file", "image");
        if (!string.IsNullOrWhiteSpace(request.ImageAltText))
            content.Add(new StringContent(request.ImageAltText), "description");

        using var req = new HttpRequestMessage(HttpMethod.Post, $"{instance}/api/v2/media") { Content = content };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var resp = await http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode) return null;
        var body = await resp.Content.ReadAsStringAsync(ct);
        return JsonNode.Parse(body)?["id"]?.GetValue<string>();
    }

    private string? ReadCredential(SocialAccount account, string key)
    {
        if (string.IsNullOrWhiteSpace(account.CredentialsEncrypted)) return null;
        try
        {
            var json = encryptor.DecryptString(account.CredentialsEncrypted);
            return JsonNode.Parse(json)?[key]?.GetValue<string>();
        }
        catch { return null; }
    }

    private static SocialPublishResult Fail(string message, int? status = null) =>
        new(false, null, null, message, status);

    private static string Trim(string s) => s.Length > 500 ? s[..500] : s;
}
