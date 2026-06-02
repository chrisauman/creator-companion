using System.Text.Json.Nodes;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Infrastructure.Social;

/// <summary>
/// Threads poster (Meta Graph API, host graph.threads.net). Auth is a
/// long-lived Threads user access token (60 days, refreshable) the admin
/// generates once and pastes in.
///
/// Two-step publish: create a media container (text, or an IMAGE via a
/// public image_url — Threads does NOT accept binary upload) → wait for it
/// to finish → publish. The card is staged at a public URL by
/// IPublicImageHost and arrives as request.ImageUrl.
///
/// Credential: {"accessToken":"&lt;long-lived threads token&gt;"}. The
/// Threads user id is resolved from /me at post time.
/// </summary>
public class ThreadsPoster(IHttpClientFactory httpFactory, IEntryEncryptor encryptor)
    : MetaPosterBase(httpFactory, encryptor), ISocialPoster
{
    private const string Host = "https://graph.threads.net/v1.0";

    public SocialPlatform Platform => SocialPlatform.Threads;
    public int CharacterLimit => 500;
    public bool SupportsImages => true;
    public bool RequiresImageUrl => true;   // Threads needs image_url, not bytes

    public async Task<SocialPublishResult> PublishAsync(
        SocialAccount account, SocialPublishRequest request, CancellationToken ct)
    {
        var token = ReadToken(account);
        if (string.IsNullOrWhiteSpace(token))
            return Fail("Threads access token is not set.");

        var http = Http();

        // Resolve the Threads user id from the token.
        var (meOk, meBody, meStatus) = await GetAsync(http, $"{Host}/me?fields=id&access_token={token}", ct);
        if (!meOk) return Fail($"Threads token rejected ({meStatus}): {GraphError(meBody)}", meStatus);
        var userId = JsonNode.Parse(meBody)?["id"]?.GetValue<string>();
        if (string.IsNullOrEmpty(userId)) return Fail("Couldn't resolve the Threads user id.");

        // 1) Create the media container.
        var create = new Dictionary<string, string> { ["access_token"] = token, ["text"] = request.Text ?? "" };
        if (!string.IsNullOrWhiteSpace(request.ImageUrl))
        {
            create["media_type"] = "IMAGE";
            create["image_url"]  = request.ImageUrl!;
        }
        else
        {
            create["media_type"] = "TEXT";
        }

        var (cOk, cBody, cStatus) = await PostFormAsync(http, $"{Host}/{userId}/threads", create, ct);
        if (!cOk) return Fail($"Threads container failed ({cStatus}): {GraphError(cBody)}", cStatus);
        var creationId = JsonNode.Parse(cBody)?["id"]?.GetValue<string>();
        if (string.IsNullOrEmpty(creationId)) return Fail("Threads container response had no id.");

        // 2) Let the container finish processing the image, then publish.
        if (!string.IsNullOrWhiteSpace(request.ImageUrl))
            await WaitForContainerAsync(http, Host, creationId, token, "status", ct);

        var (pOk, pBody, pStatus) = await PostFormAsync(http, $"{Host}/{userId}/threads_publish",
            new Dictionary<string, string> { ["access_token"] = token, ["creation_id"] = creationId }, ct);
        if (!pOk) return Fail($"Threads publish failed ({pStatus}): {GraphError(pBody)}", pStatus);

        var postId = JsonNode.Parse(pBody)?["id"]?.GetValue<string>();

        // Best-effort permalink.
        string? permalink = null;
        if (!string.IsNullOrEmpty(postId))
        {
            var (lOk, lBody, _) = await GetAsync(http, $"{Host}/{postId}?fields=permalink&access_token={token}", ct);
            if (lOk) permalink = JsonNode.Parse(lBody)?["permalink"]?.GetValue<string>();
        }

        return new SocialPublishResult(true, permalink, postId, null, pStatus);
    }
}
