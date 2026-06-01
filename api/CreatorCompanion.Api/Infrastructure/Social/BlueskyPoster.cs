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
/// Bluesky / AT Protocol poster. Auth is an app password (created at
/// Settings → App Passwords on bsky.app) — NOT the account password —
/// exchanged for a short-lived session JWT per publish. No full OAuth
/// dance, which is why Bluesky is the easiest v1 target.
///
/// Flow: createSession (identifier + app password) → optional uploadBlob
/// for an image → createRecord (app.bsky.feed.post). The returned at-uri
/// (at://did/app.bsky.feed.post/&lt;rkey&gt;) is converted to a public
/// https://bsky.app/profile/&lt;handle&gt;/post/&lt;rkey&gt; permalink.
///
/// v1 posts plain text. Bluesky needs "facets" (byte-offset annotations)
/// to make #hashtags + links tappable; we emit plain text for now (tags
/// still display, just aren't clickable). Faceting is a documented
/// fast-follow — see CLAUDE.md Marketing section.
///
/// Credential blob shape (encrypted on SocialAccount.CredentialsEncrypted):
///   {"appPassword":"xxxx-xxxx-xxxx-xxxx"}
/// Identifier = SocialAccount.Handle (e.g. "alice.bsky.social").
/// Host       = SocialAccount.Endpoint ?? "https://bsky.social".
/// </summary>
public class BlueskyPoster(IHttpClientFactory httpFactory, IEntryEncryptor encryptor) : ISocialPoster
{
    private const string DefaultHost = "https://bsky.social";

    public SocialPlatform Platform => SocialPlatform.Bluesky;
    public int CharacterLimit => 300;
    public bool SupportsImages => true;

    public async Task<SocialPublishResult> PublishAsync(
        SocialAccount account, SocialPublishRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(account.Handle))
            return Fail("Bluesky handle is not set.");

        var appPassword = ReadCredential(account, "appPassword");
        if (string.IsNullOrWhiteSpace(appPassword))
            return Fail("Bluesky app password is not set. Create one at Settings → App Passwords on bsky.app.");

        var host = (account.Endpoint ?? DefaultHost).TrimEnd('/');
        var http = httpFactory.CreateClient("social");

        // 1. createSession → accessJwt + did
        var sessionResp = await http.PostAsync(
            $"{host}/xrpc/com.atproto.server.createSession",
            JsonContent(new { identifier = account.Handle, password = appPassword }),
            ct);
        var sessionBody = await sessionResp.Content.ReadAsStringAsync(ct);
        if (!sessionResp.IsSuccessStatusCode)
            return Fail($"Bluesky auth failed ({(int)sessionResp.StatusCode}): {Trim(sessionBody)}", (int)sessionResp.StatusCode);

        var session = JsonNode.Parse(sessionBody);
        var accessJwt = session?["accessJwt"]?.GetValue<string>();
        var did = session?["did"]?.GetValue<string>();
        if (string.IsNullOrEmpty(accessJwt) || string.IsNullOrEmpty(did))
            return Fail("Bluesky auth response missing accessJwt/did.", (int)sessionResp.StatusCode);

        // 2. Build the post record. Add an image embed if present.
        var record = new JsonObject
        {
            ["$type"]     = "app.bsky.feed.post",
            ["text"]      = request.Text,
            ["createdAt"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
        };

        if (request.ImageBytes is { Length: > 0 })
        {
            var blob = await UploadBlobAsync(http, host, accessJwt, request, ct);
            if (blob is null)
                return Fail("Bluesky image upload failed.");

            record["embed"] = new JsonObject
            {
                ["$type"] = "app.bsky.embed.images",
                ["images"] = new JsonArray(new JsonObject
                {
                    ["alt"]   = request.ImageAltText ?? string.Empty,
                    ["image"] = blob,
                }),
            };
        }

        // 3. createRecord
        using var createReq = new HttpRequestMessage(HttpMethod.Post, $"{host}/xrpc/com.atproto.repo.createRecord");
        createReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessJwt);
        createReq.Content = JsonContent(new
        {
            repo = did,
            collection = "app.bsky.feed.post",
            record,
        });
        var createResp = await http.SendAsync(createReq, ct);
        var createBody = await createResp.Content.ReadAsStringAsync(ct);
        if (!createResp.IsSuccessStatusCode)
            return Fail($"Bluesky post failed ({(int)createResp.StatusCode}): {Trim(createBody)}", (int)createResp.StatusCode);

        var created = JsonNode.Parse(createBody);
        var uri = created?["uri"]?.GetValue<string>(); // at://did/app.bsky.feed.post/<rkey>
        var rkey = uri?.Split('/').LastOrDefault();
        var permalink = rkey is null ? null : $"https://bsky.app/profile/{account.Handle}/post/{rkey}";

        return new SocialPublishResult(true, permalink, rkey, null, (int)createResp.StatusCode);
    }

    /// <summary>Uploads the image and returns the AT-Protocol blob node to embed, or null on failure.</summary>
    private static async Task<JsonNode?> UploadBlobAsync(
        HttpClient http, string host, string accessJwt, SocialPublishRequest request, CancellationToken ct)
    {
        using var blobReq = new HttpRequestMessage(HttpMethod.Post, $"{host}/xrpc/com.atproto.repo.uploadBlob");
        blobReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessJwt);
        var content = new ByteArrayContent(request.ImageBytes!);
        content.Headers.ContentType = new MediaTypeHeaderValue(request.ImageContentType ?? "image/jpeg");
        blobReq.Content = content;

        var resp = await http.SendAsync(blobReq, ct);
        if (!resp.IsSuccessStatusCode) return null;
        var body = await resp.Content.ReadAsStringAsync(ct);
        // Response: { "blob": { "$type": "blob", "ref": {...}, ... } }
        // DeepClone() detaches the node from its parent (the parsed response
        // root). Without it, assigning the blob into the embed JsonObject
        // throws "The node already has a parent."
        return JsonNode.Parse(body)?["blob"]?.DeepClone();
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

    private static HttpContent JsonContent(object payload) =>
        new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

    private static SocialPublishResult Fail(string message, int? status = null) =>
        new(false, null, null, message, status);

    private static string Trim(string s) => s.Length > 500 ? s[..500] : s;
}
