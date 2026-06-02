using System.Text.Json.Nodes;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Infrastructure.Social;

/// <summary>
/// Instagram poster (Meta Graph API). Posts to an IG Business/Creator
/// account linked to a Facebook Page. Auth is a Page/user access token
/// (same one Facebook uses).
///
/// IG is IMAGE-ONLY for our purposes — there is no text-only post, and the
/// image MUST be a public image_url (no binary upload). Two-step: create
/// container (image_url + caption) → wait for it to finish → publish.
/// Rate limit: 25 API publishes / 24h per account.
///
/// Credential: {"accessToken":"&lt;page/user token&gt;"}. The IG user id is
/// resolved from /me?fields=instagram_business_account at post time.
/// </summary>
public class InstagramPoster(IHttpClientFactory httpFactory, IEntryEncryptor encryptor)
    : MetaPosterBase(httpFactory, encryptor), ISocialPoster
{
    private const string Host = "https://graph.facebook.com/v23.0";

    public SocialPlatform Platform => SocialPlatform.Instagram;
    public int CharacterLimit => 2200;
    public bool SupportsImages => true;
    public bool RequiresImageUrl => true;   // IG needs image_url (no binary upload)

    public async Task<SocialPublishResult> PublishAsync(
        SocialAccount account, SocialPublishRequest request, CancellationToken ct)
    {
        var token = ReadToken(account);
        if (string.IsNullOrWhiteSpace(token))
            return Fail("Instagram access token is not set.");

        // IG can't post text-only — it always needs the card image.
        if (string.IsNullOrWhiteSpace(request.ImageUrl))
            return Fail("Instagram posts require an image (enable quote cards or attach one).");

        var http = Http();

        // Resolve the IG Business account id from the page/user token.
        var (meOk, meBody, meStatus) = await GetAsync(
            http, $"{Host}/me?fields=instagram_business_account&access_token={token}", ct);
        if (!meOk) return Fail($"Instagram token rejected ({meStatus}): {GraphError(meBody)}", meStatus);
        var igUserId = JsonNode.Parse(meBody)?["instagram_business_account"]?["id"]?.GetValue<string>();
        if (string.IsNullOrEmpty(igUserId))
            return Fail("No Instagram Business account is linked to this token's Page.");

        // 1) Create the media container.
        var (cOk, cBody, cStatus) = await PostFormAsync(http, $"{Host}/{igUserId}/media",
            new Dictionary<string, string>
            {
                ["access_token"] = token,
                ["image_url"]    = request.ImageUrl!,
                ["caption"]      = request.Text ?? "",
            }, ct);
        if (!cOk) return Fail($"Instagram container failed ({cStatus}): {GraphError(cBody)}", cStatus);
        var creationId = JsonNode.Parse(cBody)?["id"]?.GetValue<string>();
        if (string.IsNullOrEmpty(creationId)) return Fail("Instagram container response had no id.");

        // 2) Wait for processing, then publish.
        await WaitForContainerAsync(http, Host, creationId, token, "status_code", ct);

        var (pOk, pBody, pStatus) = await PostFormAsync(http, $"{Host}/{igUserId}/media_publish",
            new Dictionary<string, string> { ["access_token"] = token, ["creation_id"] = creationId }, ct);
        if (!pOk) return Fail($"Instagram publish failed ({pStatus}): {GraphError(pBody)}", pStatus);

        var mediaId = JsonNode.Parse(pBody)?["id"]?.GetValue<string>();

        // Best-effort permalink.
        string? permalink = null;
        if (!string.IsNullOrEmpty(mediaId))
        {
            var (lOk, lBody, _) = await GetAsync(http, $"{Host}/{mediaId}?fields=permalink&access_token={token}", ct);
            if (lOk) permalink = JsonNode.Parse(lBody)?["permalink"]?.GetValue<string>();
        }

        return new SocialPublishResult(true, permalink, mediaId, null, pStatus);
    }
}
