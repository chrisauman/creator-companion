using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Tests.Helpers;

public static class DbFactory
{
    public static AppDbContext Create(string? name = null)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(name ?? Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    public static async Task<(AppDbContext db, User user, Journal journal)> WithUserAndJournalAsync(
        string timezone = "UTC",
        AccountTier tier = AccountTier.Free)
    {
        var db = Create();
        var user = new User
        {
            Id = Guid.NewGuid(),
            FirstName = "Test",
            LastName = "User",
            Email = "test@example.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Password1!"),
            TimeZoneId = timezone,
            Tier = tier
        };
        var journal = new Journal
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Name = "My Journal",
            IsDefault = true
        };
        db.Users.Add(user);
        db.Journals.Add(journal);
        await db.SaveChangesAsync();
        return (db, user, journal);
    }

    public static Entry MakeEntry(Guid userId, Guid journalId, DateOnly date,
        string content = "This is a test entry with enough words to pass validation check.",
        EntrySource source = EntrySource.Direct,
        DateTime? deletedAt = null)
    {
        return new Entry
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            JournalId = journalId,
            EntryDate = date,
            ContentText = content,
            EntrySource = source,
            Metadata = "{}",
            DeletedAt = deletedAt
        };
    }
}
