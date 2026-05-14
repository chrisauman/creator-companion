using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

/// <summary>
/// One-shot bulk migration that walks the database on first startup
/// after the May 2026 privacy pass and encrypts any rows still stored
/// as plaintext. Idempotent — IEntryEncryptor.EncryptString /
/// EncryptBytes are no-ops when the input is already wrapped, so
/// running multiple times is safe. After the first successful run all
/// content is encrypted; subsequent runs are O(n) scans that find
/// nothing to do.
///
/// Runs as an IHostedService so it kicks off on every API boot. The
/// design choice is "lazy if needed, idempotent always" rather than
/// "track a migration flag" — simpler, and the per-row check is
/// extremely cheap (just a prefix string compare).
///
/// Scope:
///   1. Entry.Title          (string, encrypted in place)
///   2. Entry.ContentText    (string, encrypted in place)
///   3. Draft.ContentText    (string, encrypted in place)
///   4. Tag.Name             (string, encrypted in place + NameHash populated)
///   5. EntryMedia.FileName  (string, encrypted in place)
///   6. EntryMedia bytes in storage (binary, encrypted in place)
///
/// If Entry:EncryptionKey is not configured the migrator logs a
/// warning and exits early — the API keeps running, but writes/reads
/// on encrypted paths will fail. This matches the lazy-init pattern
/// used by EntryEncryptor itself.
/// </summary>
public class ContentEncryptionMigrator(
    IServiceScopeFactory scopeFactory,
    IConfiguration config,
    ILogger<ContentEncryptionMigrator> logger) : IHostedService
{
    // Per-purpose hash domain — must match what TagService uses on
    // application writes so existing rows hash the same way new ones do.
    private const string TagHashDomain = "tag:name";

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        // Block startup until the migration completes. Reason: if the
        // API serves traffic mid-migration, two race conditions arise:
        //
        //   1. User creates a tag while the migrator hasn't reached
        //      that user's rows yet. TagService.SetEntryTagsAsync
        //      looks up tags by NameHash; existing-but-not-migrated
        //      tags have NameHash="", so the lookup misses and we
        //      insert a duplicate. The migrator later encrypts the
        //      pre-existing tag, leaving two rows for the same tag.
        //
        //   2. User updates an entry whose plaintext title/content the
        //      migrator has loaded into memory but not yet saved.
        //      EF Core doesn't use optimistic concurrency by default,
        //      so the migrator's later SaveChangesAsync would overwrite
        //      the user's just-saved encrypted value with a re-encryption
        //      of the OLD plaintext — losing the user's edit.
        //
        // For a journaling app with hundreds of rows, this completes
        // in seconds. Worth the brief startup delay to eliminate both
        // race classes entirely.
        logger.LogInformation("ContentEncryptionMigrator: starting synchronous bulk pass…");
        await RunSafelyAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task RunSafelyAsync(CancellationToken ct)
    {
        try
        {
            // Skip entirely if the key isn't configured — the warning
            // for that comes from EntryEncryptor's constructor, no
            // need to duplicate it here.
            if (string.IsNullOrWhiteSpace(config["Entry:EncryptionKey"]))
            {
                logger.LogInformation(
                    "ContentEncryptionMigrator: Entry:EncryptionKey not set, skipping.");
                return;
            }

            using var scope = scopeFactory.CreateScope();
            var db        = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var encryptor = scope.ServiceProvider.GetRequiredService<IEntryEncryptor>();
            var storage   = scope.ServiceProvider.GetRequiredService<IStorageService>();

            await MigrateEntriesAsync(db, encryptor, ct);
            await MigrateDraftsAsync(db, encryptor, ct);
            await MigrateTagsAsync(db, encryptor, ct);
            await MigrateMediaAsync(db, encryptor, storage, ct);

            logger.LogInformation("ContentEncryptionMigrator: pass complete.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "ContentEncryptionMigrator failed.");
        }
    }

    private async Task MigrateEntriesAsync(AppDbContext db, IEntryEncryptor encryptor, CancellationToken ct)
    {
        // Batch so we don't load thousands of rows at once. Each entry
        // row carries the long ContentText — memory cost matters.
        const int batchSize = 200;
        var migrated = 0;
        var skip = 0;
        while (!ct.IsCancellationRequested)
        {
            var batch = await db.Entries
                .OrderBy(e => e.CreatedAt)
                .Skip(skip)
                .Take(batchSize)
                .ToListAsync(ct);
            if (batch.Count == 0) break;

            foreach (var e in batch)
            {
                if (!encryptor.IsEncrypted(e.Title))
                {
                    e.Title = encryptor.EncryptString(e.Title);
                    migrated++;
                }
                if (!encryptor.IsEncrypted(e.ContentText))
                {
                    e.ContentText = encryptor.EncryptString(e.ContentText);
                    migrated++;
                }
            }

            await db.SaveChangesAsync(ct);
            skip += batch.Count;
        }
        if (migrated > 0)
            logger.LogInformation("ContentEncryptionMigrator: encrypted {Count} entry fields.", migrated);
    }

    private async Task MigrateDraftsAsync(AppDbContext db, IEntryEncryptor encryptor, CancellationToken ct)
    {
        const int batchSize = 200;
        var migrated = 0;
        var skip = 0;
        while (!ct.IsCancellationRequested)
        {
            var batch = await db.Drafts
                .OrderBy(d => d.CreatedAt)
                .Skip(skip)
                .Take(batchSize)
                .ToListAsync(ct);
            if (batch.Count == 0) break;

            foreach (var d in batch)
            {
                if (!encryptor.IsEncrypted(d.ContentText))
                {
                    d.ContentText = encryptor.EncryptString(d.ContentText);
                    migrated++;
                }
            }

            await db.SaveChangesAsync(ct);
            skip += batch.Count;
        }
        if (migrated > 0)
            logger.LogInformation("ContentEncryptionMigrator: encrypted {Count} draft fields.", migrated);
    }

    private async Task MigrateTagsAsync(AppDbContext db, IEntryEncryptor encryptor, CancellationToken ct)
    {
        // Tags are small but every row needs BOTH encryption of the
        // Name column AND population of the NameHash column. Hashing
        // works off the plaintext Name — so we hash first, encrypt
        // second, in that order.
        const int batchSize = 500;
        var migrated = 0;
        var skip = 0;
        while (!ct.IsCancellationRequested)
        {
            var batch = await db.Tags
                .OrderBy(t => t.CreatedAt)
                .Skip(skip)
                .Take(batchSize)
                .ToListAsync(ct);
            if (batch.Count == 0) break;

            foreach (var t in batch)
            {
                if (encryptor.IsEncrypted(t.Name))
                {
                    // Name already encrypted but the migrator might
                    // need to fill NameHash if a previous run was
                    // interrupted mid-tag. Skip — we'd need plaintext
                    // to hash, which we can recover by decrypting.
                    if (string.IsNullOrEmpty(t.NameHash))
                    {
                        var plain = encryptor.DecryptString(t.Name);
                        t.NameHash = encryptor.DeterministicHash(plain, TagHashDomain);
                        migrated++;
                    }
                    continue;
                }

                // Legacy plaintext name: hash from plaintext, then encrypt.
                t.NameHash = encryptor.DeterministicHash(t.Name, TagHashDomain);
                t.Name = encryptor.EncryptString(t.Name);
                migrated++;
            }

            await db.SaveChangesAsync(ct);
            skip += batch.Count;
        }
        if (migrated > 0)
            logger.LogInformation("ContentEncryptionMigrator: migrated {Count} tag rows.", migrated);
    }

    private async Task MigrateMediaAsync(
        AppDbContext db, IEntryEncryptor encryptor, IStorageService storage, CancellationToken ct)
    {
        // Media migration is the most expensive — for each row that's
        // not yet encrypted, we download bytes from R2, encrypt, and
        // re-upload. Keep the batch small + log progress so the operator
        // can watch it run.
        //
        // CRITICAL ORDER: upload-new → SaveChanges (DB now points at
        // new key) → THEN delete-old. Deleting the old blob before the
        // DB save commits would orphan the new blob and leave the DB
        // pointing at a deleted plaintext blob if SaveChanges fails.
        const int batchSize = 50;
        var migratedRows = 0;
        var migratedBlobs = 0;
        var skip = 0;
        while (!ct.IsCancellationRequested)
        {
            var batch = await db.EntryMedia
                .OrderBy(m => m.CreatedAt)
                .Skip(skip)
                .Take(batchSize)
                .ToListAsync(ct);
            if (batch.Count == 0) break;

            // Per-row record of "old key to delete after SaveChanges
            // succeeds." Populated during the encrypt pass; replayed
            // after the DB commit.
            var pendingDeletes = new List<string>();

            foreach (var m in batch)
            {
                if (!encryptor.IsEncrypted(m.FileName))
                {
                    m.FileName = encryptor.EncryptString(m.FileName);
                    migratedRows++;
                }

                try
                {
                    var raw = await storage.ReadAllBytesAsync(m.StoragePath);
                    if (!encryptor.IsEncryptedBytes(raw))
                    {
                        var encrypted = encryptor.EncryptBytes(raw);
                        await using var ms = new MemoryStream(encrypted);
                        var newPath = await storage.SaveAsync(ms, m.StoragePath, m.ContentType);
                        pendingDeletes.Add(m.StoragePath); // delete old AFTER save commits
                        m.StoragePath = newPath;
                        migratedBlobs++;
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex,
                        "ContentEncryptionMigrator: failed to encrypt media blob {StoragePath} — skipping.",
                        m.StoragePath);
                }
            }

            // Commit DB changes FIRST. Only after this succeeds is it
            // safe to delete the old plaintext blobs. If SaveChanges
            // throws, the new ciphertext blobs leak but no data is lost
            // — the next migrator run finds plaintext, re-encrypts, and
            // GC of orphan blobs is a separate concern.
            await db.SaveChangesAsync(ct);

            foreach (var oldPath in pendingDeletes)
            {
                try { await storage.DeleteAsync(oldPath); }
                catch (Exception ex)
                {
                    // Best-effort: an orphan plaintext blob is bad for
                    // disk usage but the DB row already points at the
                    // ciphertext so the privacy promise still holds.
                    logger.LogWarning(ex,
                        "ContentEncryptionMigrator: failed to delete old blob {Path}.", oldPath);
                }
            }

            skip += batch.Count;
        }
        if (migratedRows > 0 || migratedBlobs > 0)
            logger.LogInformation(
                "ContentEncryptionMigrator: migrated {Rows} media filenames, {Blobs} blobs.",
                migratedRows, migratedBlobs);
    }
}
