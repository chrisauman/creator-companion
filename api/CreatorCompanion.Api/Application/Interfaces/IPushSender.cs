using CreatorCompanion.Api.Domain.Models;

namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// Abstraction for sending push notifications.
/// Currently implemented by WebPushSender (VAPID).
/// When Capacitor is added, swap in FcmPushSender for iOS/Android.
/// </summary>
public interface IPushSender
{
    Task SendAsync(PushSubscription subscription, string title, string body);
}
