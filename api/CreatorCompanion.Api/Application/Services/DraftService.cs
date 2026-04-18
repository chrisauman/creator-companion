using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public class DraftService(AppDbContext db) : IDraftService
{
    public async Task<DraftResponse> UpsertAsync(Guid userId, UpsertDraftRequest request)
    {
        var journal = await db.Journals
            .FirstOrDefaultAsync(j => j.Id == request.JournalId && j.UserId == userId && j.DeletedAt == null)
            ?? throw new InvalidOperationException("Journal not found.");

        var draft = await db.Drafts
            .FirstOrDefaultAsync(d =>
                d.UserId == userId &&
                d.JournalId == request.JournalId &&
                d.EntryDate == request.EntryDate);

        if (draft is null)
        {
            draft = new Draft
            {
                UserId = userId,
                JournalId = request.JournalId,
                EntryDate = request.EntryDate,
                ContentText = request.ContentText,
                Metadata = request.Metadata ?? "{}"
            };
            db.Drafts.Add(draft);
        }
        else
        {
            draft.ContentText = request.ContentText;
            draft.Metadata = request.Metadata ?? draft.Metadata;
            draft.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
        return MapToResponse(draft);
    }

    public async Task<DraftResponse?> GetAsync(Guid userId, Guid journalId, DateOnly entryDate)
    {
        var draft = await db.Drafts
            .FirstOrDefaultAsync(d =>
                d.UserId == userId &&
                d.JournalId == journalId &&
                d.EntryDate == entryDate);

        return draft is null ? null : MapToResponse(draft);
    }

    public async Task DiscardAsync(Guid userId, Guid journalId, DateOnly entryDate)
    {
        var draft = await db.Drafts
            .FirstOrDefaultAsync(d =>
                d.UserId == userId &&
                d.JournalId == journalId &&
                d.EntryDate == entryDate);

        if (draft is not null)
        {
            db.Drafts.Remove(draft);
            await db.SaveChangesAsync();
        }
    }

    private static DraftResponse MapToResponse(Draft draft) =>
        new(draft.Id, draft.JournalId, draft.EntryDate,
            draft.ContentText, draft.Metadata, draft.UpdatedAt);
}
