using System.Text.Json;
using CreatorCompanion.Api.Application.DTOs;
using CreatorCompanion.Api.Domain.Enums;
using CreatorCompanion.Api.Domain.Models;
using Microsoft.EntityFrameworkCore;

namespace CreatorCompanion.Api.Infrastructure.Data;

/// <summary>
/// Seeds the hand-built "morning pages" page into the landing-page system as
/// record #1 — so it's now managed/served dynamically like every future page,
/// and so it validates that the renderer reproduces the original design. Idempotent:
/// only inserts if the slug doesn't already exist (so admin edits are never
/// clobbered on the next deploy).
/// </summary>
public static class LandingPageSeeder
{
    public static async Task SeedAsync(AppDbContext db)
    {
        const string slug = "morning-pages-app";
        if (await db.LandingPages.AnyAsync(p => p.Slug == slug)) return;

        var content = new LpContent
        {
            Hero = new()
            {
                Kicker = "Your daily creative practice",
                H1 = "A morning pages app that keeps you showing up.",
                Subhead = "Three pages, every morning, before the day pulls you away. Creator Companion turns the habit into a streak you won't want to break — private, calm, and built for any creative practice.",
                CtaLabel = "Start your free 10-day trial",
            },
            Hook = new()
            {
                Heading = "The hardest part of a creative life isn't talent. It's showing up.",
                Lead = "Morning pages are how you show up. Creator Companion is how you *keep* showing up — one quiet, honest page at a time, until the practice starts carrying you instead of the other way around.",
                Chips = { "10-day free trial", "No social feed, ever", "Built for any creative" },
            },
            Explainer = new()
            {
                Kicker = "The practice",
                H2 = "What are morning pages?",
                Paragraphs =
                {
                    "Morning pages are three pages of longhand, stream-of-consciousness writing done first thing each morning — a practice Julia Cameron made famous in *The Artist's Way*. You're not writing for an audience, and you're certainly not writing anything good. You're clearing the mental clutter so the real work can surface.",
                    "Painters, musicians, writers, and filmmakers all use them as a warm-up for the day — a way to move the fear, the to-do list, and the self-doubt out of the way before the real making begins.",
                },
                ImageUrl = "images/lp-writing-coffee.jpg",
                ImageAlt = "A handwritten notebook beside a cup of coffee in soft morning light",
            },
            BenefitCards =
            {
                new() { Icon = "music",   Title = "It quiets the inner critic",          Body = "When nothing has to be good, the critic has nothing to guard. The pages give your worries somewhere to go, so they stop guarding the door to your real work." },
                new() { Icon = "spark",   Title = "It beats the blank page",             Body = "Momentum is built, not found. A few honest sentences first thing makes the next, braver act of creation feel possible — because you've already begun." },
                new() { Icon = "chart",   Title = "Momentum compounds",                  Body = "One page is a moment. A hundred pages is an identity. The streak is where a nice idea quietly becomes the kind of person you are." },
                new() { Icon = "plus",    Title = "It separates practice from product",  Body = "Not everything you make has to be for someone. Morning pages protect a space that's just for you — and that's often where your best public work comes from." },
            },
            Band = new()
            {
                Heading = "You don't have to feel inspired. You just have to begin.",
                Subtext = "Inspiration is what shows up *after* you do — never before. The practice is simply being there when it arrives.",
                ImageUrl = "images/lp-morning-ritual.jpg",
            },
            Tips =
            {
                new() { Title = "Anchor it to something you already do", Body = "Pages with your first coffee, before the phone, beside the same window. Attach the new habit to an old one and you'll skip the daily decision." },
                new() { Title = "Lower the bar on purpose",             Body = "The goal is three pages, not three *good* pages. On a rough morning, a single honest sentence still counts. Done beats perfect, always." },
                new() { Title = "Don't reread right away",              Body = "Morning pages aren't for editing. Resist the urge to judge them. They've already done their job the moment they leave your head." },
                new() { Title = "Forgive the misses",                  Body = "A chain that bends doesn't have to break. Miss a morning, and the only move that matters is the next one. Shame ends streaks; grace restarts them." },
                new() { Title = "Keep the streak in sight",            Body = "Visible progress is its own motivation. Watching the days stack up makes you want to protect them — which is exactly the point." },
                new() { Title = "Let a prompt carry you",              Body = "Some mornings you'll have nothing. That's fine — a small nudge or a single question is enough to get the hand moving until the mind catches up." },
            },
            FeatureRows =
            {
                new() { Kicker = "Don't break the chain", H2 = "A streak you won't want to break", Body = "Every morning you write adds a link to the chain. Milestone badges mark the distance you've come, and a 48-hour grace window means one off-day never undoes your momentum.", MediaUrl = "images/mock-journal-mobile.jpg", MediaAlt = "Creator Companion journal entry on a phone", Phone = true },
                new() { Kicker = "A spark to begin", H2 = "A little encouragement, every day", Body = "A fresh daily spark and a rotating prompt meet you on the mornings you've got nothing — a small push to lower the bar and just start the first line.", MediaUrl = "images/spark-mockup.jpg", MediaAlt = "Creator Companion daily spark on a phone", Phone = true, Reverse = true },
                new() { Kicker = "A nudge at your time", H2 = "A reminder for the moment that fits", Body = "Set a gentle daily reminder for your real morning — 6am or 9, with coffee or on the train — so the practice finds you instead of the other way around.", MediaUrl = "images/reminders-mockup.jpg", MediaAlt = "Creator Companion daily reminders on a phone", Phone = true },
                new() { Kicker = "Yours alone", H2 = "Private by design", Body = "A journal is one of the most intimate things you'll ever keep. Creator Companion has no social feed, no public profiles, and no advertising — your pages are encrypted and entirely yours, to export or delete whenever you wish.", MediaUrl = "images/lp-morning-light.jpg", MediaAlt = "Soft morning light through a window beside a plant", Reverse = true },
            },
            Objections =
            {
                new() { Q = "I don't have time.", A = "You have ten minutes — the ones you'd have lost to the phone anyway. Pages don't need an hour; they need a beginning. Start with one page and let the day keep the rest." },
                new() { Q = "I'm not a writer.", A = "Good — morning pages aren't writing, they're clearing. They were made for painters and musicians and makers of every kind. The pages are the warm-up, not the performance." },
                new() { Q = "I always forget.", A = "That's what the reminder and the streak are for. The app remembers so you don't have to, and the growing chain gives you a reason to come back before you've even had your coffee." },
                new() { Q = "I already broke my streak once.", A = "So did everyone who's ever kept one. A missed day isn't a failure — it's a chapter ending. Creator Companion is built to help you start the next one, gently, today." },
            },
            Faq =
            {
                new() { Q = "What are morning pages?", A = "Three pages of longhand, stream-of-consciousness writing done first thing each morning — a practice popularized by Julia Cameron in The Artist's Way. The goal isn't a finished piece; it's to clear your head and prime your creativity. Creator Companion brings the ritual to any device and any creative practice." },
                new() { Q = "Do I have to write by hand?", A = "No. The original practice is longhand, but the point is the daily ritual, not the medium. With Creator Companion you type your pages on your phone or computer, and the streak keeps you coming back." },
                new() { Q = "How long should morning pages take?", A = "Usually fifteen to thirty minutes. Three pages is the classic target, but the real goal is to write until the noise quiets. On busy mornings, a few honest sentences still counts — showing up matters more than length." },
                new() { Q = "What do I write about?", A = "Anything and everything — whatever is on your mind. Morning pages aren't meant to be good or even coherent. You're emptying the clutter so the real ideas can surface. Creator Companion also offers a daily prompt if you'd like a gentle starting point." },
                new() { Q = "Is my writing private?", A = "Yes. Creator Companion has no social feed, no public profiles, and no advertising. Your pages are encrypted and yours alone — you can export or delete everything at any time." },
                new() { Q = "I'm not a writer — is this still for me?", A = "Absolutely. Morning pages were created for all creatives — painters, musicians, filmmakers, makers of every kind. The pages are a warm-up for your real work, not the work itself. Creator Companion frames everything as a daily creative practice, not just writing." },
                new() { Q = "How much does it cost?", A = "Start with a 10-day free trial. After that it's $5.99/month or $49.99/year. One simple plan, no upsells." },
            },
            FinalCta = new()
            {
                Heading = "Tomorrow morning, begin.",
                Subtext = "Ten days free. No credit card to start.",
                CtaLabel = "Start your free trial",
            },
        };

        var json = JsonSerializer.Serialize(content);
        var now = DateTime.UtcNow;
        db.LandingPages.Add(new LandingPage
        {
            Slug = slug,
            Status = LandingPageStatus.Published,
            TargetKeyword = "morning pages app",
            MetaTitle = "Morning Pages App — A Daily Creative Practice | Creator Companion",
            MetaDescription = "A morning pages app for any creative practice. Show up every day, keep your streak, and write your pages privately — no ads, no social feed. Free for 10 days.",
            ContentJson = json,
            OriginalContentJson = json,
            GeneratedByAi = false,
            CreatedAt = now,
            UpdatedAt = now,
            PublishedAt = now,
        });
        await db.SaveChangesAsync();
    }
}
