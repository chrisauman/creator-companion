using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Application.Interfaces;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using CreatorCompanion.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Application.Services;

public class PauseService(AppDbContext db, IEntitlementService entitlement) : IPauseService
{
    private const int MonthlyPauseLimit = 10;
    private const int DefaultPauseDays = 7;

    public async Task<PauseResponse> CreatePauseAsync(Guid userId, CreatePauseRequest request)
    {
        var user = await db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found.");

        entitlement.EnforcePause(user);

        // SERIALIZABLE transaction with a per-user advisory lock so two
        // concurrent CreatePauseAsync calls can't both read pre-existing
        // pause totals, both pass the 10-day cap, and both insert. The
        // advisory lock keys on the user id (hashed to a stable int64)
        // and is released when the transaction commits or rolls back.
        await using var tx = await db.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.Serializable);

        var lockKey = unchecked((long)userId.GetHashCode()) ^ 0x70617573650000L; // "pause"
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock({lockKey})");

        // Ensure no active pause already exists
        var existing = await db.Pauses
            .AnyAsync(p => p.UserId == userId && p.Status == PauseStatus.Active);
        if (existing)
            throw new InvalidOperationException("You already have an active pause. Cancel it before creating a new one.");

        var userTz = TimeZoneInfo.FindSystemTimeZoneById(user.TimeZoneId);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, userTz));

        if (request.StartDate < today)
            throw new InvalidOperationException("Pause start date cannot be in the past.");

        var endDate = request.EndDate ?? request.StartDate.AddDays(DefaultPauseDays);

        if (endDate <= request.StartDate)
            throw new InvalidOperationException("Pause end date must be after the start date.");

        // Enforce 10-day monthly limit: check each calendar month the pause spans
        await EnforceMonthlyLimitAsync(userId, request.StartDate, endDate);

        var pause = new Pause
        {
            UserId = userId,
            StartDate = request.StartDate,
            EndDate = endDate,
            Reason = request.Reason,
            Status = PauseStatus.Active
        };

        db.Pauses.Add(pause);
        await db.SaveChangesAsync();
        await tx.CommitAsync();

        return ToResponse(pause);
    }

    public async Task<PauseResponse?> GetActivePauseAsync(Guid userId)
    {
        var pause = await db.Pauses
            .Where(p => p.UserId == userId && p.Status == PauseStatus.Active)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync();

        return pause is null ? null : ToResponse(pause);
    }

    public async Task CancelPauseAsync(Guid userId, Guid pauseId)
    {
        var pause = await db.Pauses
            .FirstOrDefaultAsync(p => p.Id == pauseId && p.UserId == userId)
            ?? throw new InvalidOperationException("Pause not found.");

        if (pause.Status != PauseStatus.Active)
            throw new InvalidOperationException("Only active pauses can be cancelled.");

        pause.Status = PauseStatus.Cancelled;
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Checks that the proposed [start, end] range doesn't push any calendar month over
    /// <see cref="MonthlyPauseLimit"/> paused days when combined with existing active pauses.
    /// </summary>
    private async Task EnforceMonthlyLimitAsync(Guid userId, DateOnly start, DateOnly end)
    {
        // Collect the distinct (year, month) pairs the new pause touches
        var months = new HashSet<(int Year, int Month)>();
        for (var d = start; d <= end; d = d.AddDays(1))
            months.Add((d.Year, d.Month));

        // Count ALL pauses this month (active or cancelled) — cancelling early doesn't refund days
        var allPauses = await db.Pauses
            .Where(p => p.UserId == userId)
            .Select(p => new { p.StartDate, p.EndDate })
            .ToListAsync();

        foreach (var (year, month) in months)
        {
            var monthStart = new DateOnly(year, month, 1);
            var monthEnd = new DateOnly(year, month, DateTime.DaysInMonth(year, month));

            // Days from all prior pauses that fall in this month
            int existingDays = allPauses.Sum(p =>
            {
                var overlapStart = p.StartDate > monthStart ? p.StartDate : monthStart;
                var overlapEnd   = p.EndDate   < monthEnd   ? p.EndDate   : monthEnd;
                return overlapEnd >= overlapStart
                    ? overlapEnd.DayNumber - overlapStart.DayNumber + 1
                    : 0;
            });

            // Days the new pause would add to this month
            var newStart = start > monthStart ? start : monthStart;
            var newEnd   = end   < monthEnd   ? end   : monthEnd;
            int newDays  = newEnd.DayNumber - newStart.DayNumber + 1;

            if (existingDays + newDays > MonthlyPauseLimit)
                throw new InvalidOperationException(
                    $"This pause would exceed the {MonthlyPauseLimit}-day monthly limit for {monthStart:MMMM yyyy}.");
        }
    }

    private static PauseResponse ToResponse(Pause p) => new(
        p.Id,
        p.StartDate,
        p.EndDate,
        p.Status,
        p.Reason,
        p.CreatedAt
    );
}
