namespace CreatorCompanion.Api.Application.Interfaces;

/// <summary>
/// Seeds a brand-new account with a single "Hello World" journal
/// entry — title, welcome body, and a starter image — so the user
/// lands on a populated journal instead of an empty page. The user
/// can edit or delete it like any other entry.
///
/// Best-effort: failures are logged and swallowed so a seed problem
/// (storage outage, missing image asset) never blocks registration.
/// </summary>
public interface IWelcomeEntryService
{
    Task SeedAsync(Guid userId, Guid journalId, string timeZoneId, CancellationToken ct = default);
}
