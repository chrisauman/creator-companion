using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public class JournalService(AppDbContext db, IEntitlementService entitlements) : IJournalService
{
    public async Task<List<JournalResponse>> GetAllAsync(Guid userId)
    {
        return await db.Journals
            .Where(j => j.UserId == userId && j.DeletedAt == null)
            .OrderByDescending(j => j.IsDefault)
            .ThenBy(j => j.CreatedAt)
            .Select(j => new JournalResponse(
                j.Id,
                j.Name,
                j.Description,
                j.IsDefault,
                j.CreatedAt,
                j.Entries.Count(e => e.DeletedAt == null)))
            .ToListAsync();
    }

    public async Task<JournalResponse> GetByIdAsync(Guid userId, Guid journalId)
    {
        var journal = await db.Journals
            .Where(j => j.Id == journalId && j.UserId == userId && j.DeletedAt == null)
            .Select(j => new JournalResponse(
                j.Id,
                j.Name,
                j.Description,
                j.IsDefault,
                j.CreatedAt,
                j.Entries.Count(e => e.DeletedAt == null)))
            .FirstOrDefaultAsync()
            ?? throw new InvalidOperationException("Journal not found.");

        return journal;
    }

    public async Task<JournalResponse> CreateAsync(Guid userId, CreateJournalRequest request)
    {
        var user = await db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found.");

        await entitlements.EnforceJournalLimitAsync(user);

        var journal = new Journal
        {
            UserId = userId,
            Name = request.Name,
            Description = request.Description,
            IsDefault = false
        };

        db.Journals.Add(journal);
        await db.SaveChangesAsync();

        return new JournalResponse(journal.Id, journal.Name, journal.Description,
            journal.IsDefault, journal.CreatedAt, 0);
    }

    public async Task<JournalResponse> UpdateAsync(Guid userId, Guid journalId, UpdateJournalRequest request)
    {
        var journal = await db.Journals
            .FirstOrDefaultAsync(j => j.Id == journalId && j.UserId == userId && j.DeletedAt == null)
            ?? throw new InvalidOperationException("Journal not found.");

        journal.Name = request.Name;
        journal.Description = request.Description;
        journal.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        var entryCount = await db.Entries.CountAsync(e => e.JournalId == journalId && e.DeletedAt == null);
        return new JournalResponse(journal.Id, journal.Name, journal.Description,
            journal.IsDefault, journal.CreatedAt, entryCount);
    }

    public async Task DeleteAsync(Guid userId, Guid journalId)
    {
        var journal = await db.Journals
            .FirstOrDefaultAsync(j => j.Id == journalId && j.UserId == userId && j.DeletedAt == null)
            ?? throw new InvalidOperationException("Journal not found.");

        if (journal.IsDefault)
            throw new InvalidOperationException("The default journal cannot be deleted.");

        journal.DeletedAt = DateTime.UtcNow;
        journal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}
