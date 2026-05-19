using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public class DraftService(AppDbContext db, IEntryEncryptor encryptor, IEntitlementService entitlements) : IDraftService
{
    // Drafts hold in-progress entry text — same privacy posture as
    // published entries. Encrypt ContentText at rest using the same
    // master key as Entry.ContentText. MapToResponse decrypts before
    // returning to the client (transparent for legacy plaintext rows).

    public async Task<DraftResponse> UpsertAsync(Guid userId, UpsertDraftRequest request)
    {
        // 402 if trial expired and no active sub. Drafts only make sense
        // if you can eventually publish them — without access, a trial-
        // expired user can't promote the draft to an entry (EntryService
        // would block) so accepting more autosave traffic is wasted
        // work. DiscardAsync stays open so cleanup still works.
        var user = await db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found.");
        entitlements.EnforceAccess(user);

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
                ContentText = encryptor.EncryptString(request.ContentText),
                Metadata = request.Metadata ?? "{}"
            };
            db.Drafts.Add(draft);
        }
        else
        {
            draft.ContentText = encryptor.EncryptString(request.ContentText);
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

    private DraftResponse MapToResponse(Draft draft) =>
        new(draft.Id, draft.JournalId, draft.EntryDate,
            encryptor.DecryptString(draft.ContentText), draft.Metadata, draft.UpdatedAt);
}
