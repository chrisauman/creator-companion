using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using WebPushLib = WebPush;

namespace CreatorCompanion.Api.Application.Services;

public class WebPushSender(IConfiguration config, ILogger<WebPushSender> logger) : IPushSender
{
    public async Task SendAsync(PushSubscription subscription, string title, string body)
    {
        if (subscription.Platform != "web")
        {
            // Future: FCM/APNs handled by a different sender
            logger.LogWarning("WebPushSender cannot handle platform '{Platform}'", subscription.Platform);
            return;
        }

        var subject    = config["Vapid:Subject"]!;
        var publicKey  = config["Vapid:PublicKey"]!;
        var privateKey = config["Vapid:PrivateKey"]!;

        var webPushClient = new WebPushLib.WebPushClient();
        webPushClient.SetVapidDetails(subject, publicKey, privateKey);

        var pushSubscription = new WebPushLib.PushSubscription(
            subscription.Endpoint,
            subscription.P256dh,
            subscription.Auth);

        var payload = System.Text.Json.JsonSerializer.Serialize(new { title, body });

        try
        {
            await webPushClient.SendNotificationAsync(pushSubscription, payload);
        }
        catch (WebPushLib.WebPushException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Gone)
        {
            // Subscription has expired or been unregistered — caller should clean it up
            throw;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send push to endpoint {Endpoint}", subscription.Endpoint);
            throw;
        }
    }
}
