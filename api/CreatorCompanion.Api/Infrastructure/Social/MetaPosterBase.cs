using System.Text.Json.Nodes;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Application.Services;
using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Infrastructure.Social;

/// <summary>
/// Shared plumbing for the Meta Graph API adapters (Threads, Facebook,
/// Instagram): the named HttpClient, reading the encrypted access token,
/// form-POST / GET helpers, and a container-status poll for the two-step
/// (create container → publish) flows. Credentials are stored as
/// {"accessToken":"..."} encrypted on SocialAccount.CredentialsEncrypted.
/// </summary>
public abstract class MetaPosterBase(IHttpClientFactory httpFactory, IEntryEncryptor encryptor)
{
    protected HttpClient Http() => httpFactory.CreateClient("social");

    protected string? ReadToken(SocialAccount account)
    {
        if (string.IsNullOrWhiteSpace(account.CredentialsEncrypted)) return null;
        try
        {
            var json = encryptor.DecryptString(account.CredentialsEncrypted);
            return JsonNode.Parse(json)?["accessToken"]?.GetValue<string>();
        }
        catch { return null; }
    }

    protected static async Task<(bool ok, string body, int status)> PostFormAsync(
        HttpClient http, string url, IDictionary<string, string> form, CancellationToken ct)
    {
        using var content = new FormUrlEncodedContent(form);
        var resp = await http.PostAsync(url, content, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        return (resp.IsSuccessStatusCode, body, (int)resp.StatusCode);
    }

    protected static async Task<(bool ok, string body, int status)> GetAsync(
        HttpClient http, string url, CancellationToken ct)
    {
        var resp = await http.GetAsync(url, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        return (resp.IsSuccessStatusCode, body, (int)resp.StatusCode);
    }

    /// <summary>
    /// Polls a media container until it reports finished (or times out).
    /// Threads exposes <c>status</c> (FINISHED/IN_PROGRESS/ERROR); Instagram
    /// exposes <c>status_code</c> with the same values. Pass the field name
    /// for the platform. Best-effort: returns when finished, on error, or at
    /// the deadline — the subsequent publish call surfaces any real problem.
    /// </summary>
    protected static async Task WaitForContainerAsync(
        HttpClient http, string host, string containerId, string token, string statusField, CancellationToken ct)
    {
        for (var i = 0; i < 10; i++)   // ~20s ceiling at 2s intervals
        {
            try
            {
                var (ok, body, _) = await GetAsync(
                    http, $"{host}/{containerId}?fields={statusField}&access_token={token}", ct);
                if (ok)
                {
                    var s = JsonNode.Parse(body)?[statusField]?.GetValue<string>();
                    if (s is "FINISHED" or "ERROR" or "EXPIRED") return;
                }
            }
            catch { /* keep waiting */ }
            try { await Task.Delay(TimeSpan.FromSeconds(2), ct); }
            catch (OperationCanceledException) { return; }
        }
    }

    /// <summary>Reads a Graph error's human message (error.message), else the raw body.</summary>
    protected static string GraphError(string body)
    {
        try
        {
            var msg = JsonNode.Parse(body)?["error"]?["message"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(msg)) return msg!;
        }
        catch { /* fall through */ }
        return body.Length > 500 ? body[..500] : body;
    }

    protected static SocialPublishResult Fail(string message, int? status = null) =>
        new(false, null, null, message, status);
}
