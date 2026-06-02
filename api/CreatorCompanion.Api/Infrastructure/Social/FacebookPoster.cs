using System.Text.Json.Nodes;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Infrastructure.Social;

/// <summary>
/// Facebook Page poster (Meta Graph API). Posts go to a Facebook PAGE
/// (Meta doesn't allow API posting to personal profiles). Auth is a
/// long-lived / effectively-permanent Page access token.
///
/// Image post → POST /{page-id}/photos with the public image url + caption
/// (the /photos endpoint also accepts binary, but we already host the card
/// publicly for Threads/IG, so a url is simplest). Text-only → /{page-id}/feed.
///
/// Credential: {"accessToken":"&lt;page access token&gt;"}. The Page id is
/// resolved from the token (/me returns the page for a page token).
/// </summary>
public class FacebookPoster(IHttpClientFactory httpFactory, IEntryEncryptor encryptor)
    : MetaPosterBase(httpFactory, encryptor), ISocialPoster
{
    private const string Host = "https://graph.facebook.com/v23.0";

    public SocialPlatform Platform => SocialPlatform.Facebook;
    public int CharacterLimit => 5000;   // FB allows ~63k; our captions are short
    public bool SupportsImages => true;
    public bool RequiresImageUrl => true;   // we post the card via its public url

    public async Task<SocialPublishResult> PublishAsync(
        SocialAccount account, SocialPublishRequest request, CancellationToken ct)
    {
        var token = ReadToken(account);
        if (string.IsNullOrWhiteSpace(token))
            return Fail("Facebook Page access token is not set.");

        var http = Http();

        // Resolve the Page id from the (page) token.
        var (meOk, meBody, meStatus) = await GetAsync(http, $"{Host}/me?fields=id&access_token={token}", ct);
        if (!meOk) return Fail($"Facebook token rejected ({meStatus}): {GraphError(meBody)}", meStatus);
        var pageId = JsonNode.Parse(meBody)?["id"]?.GetValue<string>();
        if (string.IsNullOrEmpty(pageId)) return Fail("Couldn't resolve the Facebook Page id from the token.");

        string url;
        Dictionary<string, string> form;
        if (!string.IsNullOrWhiteSpace(request.ImageUrl))
        {
            url  = $"{Host}/{pageId}/photos";
            form = new() { ["access_token"] = token, ["url"] = request.ImageUrl!, ["caption"] = request.Text ?? "" };
        }
        else
        {
            url  = $"{Host}/{pageId}/feed";
            form = new() { ["access_token"] = token, ["message"] = request.Text ?? "" };
        }

        var (ok, body, status) = await PostFormAsync(http, url, form, ct);
        if (!ok) return Fail($"Facebook post failed ({status}): {GraphError(body)}", status);

        var json = JsonNode.Parse(body);
        // /photos → { id, post_id }; /feed → { id }. post_id is the story.
        var storyId = json?["post_id"]?.GetValue<string>() ?? json?["id"]?.GetValue<string>();
        var permalink = storyId is null ? null : $"https://www.facebook.com/{storyId}";

        return new SocialPublishResult(true, permalink, storyId, null, status);
    }
}
