using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CreatorCompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFaqCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── Schema ──────────────────────────────────────────────────
            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "Faqs",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "General");

            migrationBuilder.CreateIndex(
                name: "IX_Faqs_Category",
                table: "Faqs",
                column: "Category");

            // ── Seed FAQ content ────────────────────────────────────────
            //
            // Comprehensive starter library covering onboarding, features,
            // limitations, account, billing, and best practices. Inserts
            // are guarded with WHERE NOT EXISTS so this migration is safe
            // to re-run on environments that already have FAQs. Existing
            // admin-managed FAQs are preserved.
            //
            // The Postgres-specific syntax (WHERE NOT EXISTS, gen_random_uuid())
            // is intentional — this seed only runs against the production
            // Postgres database; InMemory test fixtures don't apply migrations.
            //
            // Sort order is assigned in 10-unit increments so admins can
            // wedge new questions in between without renumbering everything.
            // Default IsPublished = true.
            //
            // To add more later, prefer the admin UI (POST /v1/admin/faq)
            // rather than another migration.

            SeedFaq(migrationBuilder, "Getting started", 100, "What is Creator Companion?",
                "Creator Companion is a daily journaling app built for creative people who want to show up for their work every single day. It's part journal, part accountability partner, part gentle coach — designed to turn \"I should be making something\" into \"I made something today.\" Whether you write, paint, compose, film, code, design, or build with your hands, this is the place to mark the steps.");

            SeedFaq(migrationBuilder, "Getting started", 110, "Who is Creator Companion for?",
                "Anyone with a creative practice they want to stay consistent with. Writers, illustrators, musicians, filmmakers, designers, photographers, makers, founders — if the work is yours and you want to do it every day, this is built for you. You don't need to call yourself an \"artist.\" If you make things, you belong here.");

            SeedFaq(migrationBuilder, "Getting started", 120, "How does it work?",
                "Every day, you log one journal entry — just a few words about what you did, made, thought, or noticed in your creative practice. That entry keeps your streak alive. Along the way, your companion offers a daily creative spark, writing prompts, custom reminders, a to-do list, and a place to look back at everything you've made. Small steps add up to big work over time.");

            SeedFaq(migrationBuilder, "Getting started", 130, "What counts as a \"step\" in my creative practice?",
                "Anything you decide. Wrote a paragraph? That's a step. Sketched a face? Step. Tuned a guitar to play later? Step. Researched a project, watched a tutorial, organized your studio, sent a single email about a freelance gig — all steps. The point isn't producing a masterpiece daily. The point is showing up. Big steps and tiny steps both count.");

            SeedFaq(migrationBuilder, "Getting started", 140, "Why only 10 words?",
                "Because 10 words is enough to prove to yourself you showed up. Most habit apps fail because they ask too much on bad days. Creator Companion deliberately sets the floor low so on the days when life is messy, you can still log something honest and move on. You'll often write more — you only need ten.");

            SeedFaq(migrationBuilder, "Getting started", 150, "Do I have to write something profound?",
                "Absolutely not. Some days your entry will be a sentence. Some days it'll be a paragraph. Some days it'll be just \"got nothing today, but I tried, and that counts.\" All of those are valid. The streak doesn't care if it's poetry — it cares that you showed up.");

            SeedFaq(migrationBuilder, "Getting started", 160, "Is this a writing app, or something else?",
                "It's a practice app — the journal entries are how you track the work, not the work itself. A painter might write \"Finished the underpainting on the portrait\" plus a photo. A musician might log \"Worked the bridge for 45 min, almost there.\" The journal is your private record. The creative work happens wherever you make it.");

            SeedFaq(migrationBuilder, "Getting started", 170, "How long does it take to get going?",
                "Less than a minute. Sign up, get a 10-day free trial with full access, and your first entry takes about as long as a tweet. The whole app is designed to be in-and-out — log your step, see your streak grow, get back to making.");

            // ── Daily practice & journaling ─────────────────────────────
            SeedFaq(migrationBuilder, "Daily practice", 200, "How do I log an entry?",
                "Tap \"Log Today's Progress\" from the sidebar (desktop) or the cyan plus button at the top of the screen (mobile). Type a few words, optionally add a photo, set a mood, add tags, and hit Save. That's it — your streak grows and you're back to making.");

            SeedFaq(migrationBuilder, "Daily practice", 210, "Can I add photos to my entries?",
                "Yes — up to 20 photos per entry. Snapshots of works-in-progress, finished pieces, your messy desk, a sketch you scribbled at lunch. Your journal becomes a visual record of your practice over time, not just a wall of text. Photos are securely stored and only visible to you.");

            SeedFaq(migrationBuilder, "Daily practice", 220, "Can I edit a past entry?",
                "Yes. Tap any entry in your journal, then tap Edit. You can update the title, body, photos, tags, and mood. Edits keep your streak intact.");

            SeedFaq(migrationBuilder, "Daily practice", 230, "Can I add a mood to my entries?",
                "Yes — and we recommend it. Tagging entries with a mood (energized, focused, frustrated, vulnerable, accomplished, etc.) helps you spot patterns later. You might notice you create your best work in certain emotional states, or that your frustrated days secretly produce your most honest work.");

            SeedFaq(migrationBuilder, "Daily practice", 240, "Can I use tags?",
                "Yes. Tag entries with anything — project names, themes, mediums, collaborators, places. Then filter your journal by tag to see the arc of a specific project over weeks or months. Tags are how you turn a journal into a searchable record of every project you've ever worked on.");

            SeedFaq(migrationBuilder, "Daily practice", 250, "Can I search my entries?",
                "Yes — search by title, tag, mood, or date directly from your journal. Want to find every entry about that novel chapter you started in March? Tap the search bar and type a keyword.");

            SeedFaq(migrationBuilder, "Daily practice", 260, "What if I forget to log an entry for the day?",
                "You have a 48-hour grace window. If you miss a day, you can come back within 48 hours, log the missed day, and keep your streak alive. Life happens — your streak doesn't have to suffer for it.");

            SeedFaq(migrationBuilder, "Daily practice", 270, "Can I write longer entries if I want to?",
                "Absolutely. Entries support up to 2,500 words — plenty for full reflective writing, project debriefs, or long-form journaling. The 10-word minimum is a floor, not a ceiling.");

            SeedFaq(migrationBuilder, "Daily practice", 280, "Can I format text in my entries?",
                "Yes — there's a formatting toolbar with bold, italic, lists, and headings so your longer entries can have structure and feel like real writing, not a soup of plain text.");

            SeedFaq(migrationBuilder, "Daily practice", 290, "Can I see my past entries by month?",
                "Yes — your journal is organized chronologically with month dividers (on wide screens). You can scroll back through your entire history, filter by tag or mood, or jump to a specific date via the search bar.");

            // ── Streaks & motivation ────────────────────────────────────
            SeedFaq(migrationBuilder, "Streaks", 300, "What's a streak?",
                "A streak is the number of consecutive days you've logged a creative entry. It's the heart of the app — the visible proof that you've shown up. Streaks live in your sidebar and grow every day you write. Watching the number climb is genuinely addictive in the best way.");

            SeedFaq(migrationBuilder, "Streaks", 310, "What happens if I miss a day?",
                "You get a 48-hour grace window. Miss a day and log within 48 hours? Streak preserved. Miss longer than that without pausing, and your streak resets to zero — but your longest streak is permanently banked. The numbers you've earned are forever yours, even when a chapter ends.");

            SeedFaq(migrationBuilder, "Streaks", 320, "Can I \"backfill\" a missed day?",
                "Yes — within the 48-hour grace window, you can log an entry for yesterday or the day before. After that the window closes (the goal is daily practice, not weekly catch-up).");

            SeedFaq(migrationBuilder, "Streaks", 330, "Can I pause my streak for vacations or life events?",
                "Yes — you can pause your streak for up to 10 days at a time when you know you'll be away (vacation, wedding, family emergency, a tough stretch at work). Just hit pause from your account before you leave. Your streak stays exactly where it was, waiting for you.");

            SeedFaq(migrationBuilder, "Streaks", 340, "What if I lose a big streak?",
                "It happens to everyone, and Creator Companion doesn't shame you for it. When you come back, you'll see a gentle \"Welcome Back\" screen that reframes your previous streak as a completed chapter rather than a loss — and helps you start the next one. Your longest streak is forever yours.");

            SeedFaq(migrationBuilder, "Streaks", 350, "Are there rewards for long streaks?",
                "Yes — you'll earn milestone badges as your streak grows. Quiet little markers of what you've built. The real reward is the body of work that accumulates, but the badges are a satisfying way to see your effort recognized.");

            SeedFaq(migrationBuilder, "Streaks", 360, "How does the streak know what day it is?",
                "It uses your local timezone, captured when you signed up. So \"midnight\" means midnight where you live. You can update your timezone any time from your account if you move or travel.");

            SeedFaq(migrationBuilder, "Streaks", 370, "Can I see my full streak history?",
                "Yes — your streak history page shows every chapter you've completed, including the lengths and dates. Open the menu and tap the streak counter to see your full timeline. It's a quiet way to admire what you've done.");

            SeedFaq(migrationBuilder, "Streaks", 380, "What's the \"longest streak\"?",
                "Your longest consecutive streak ever — banked forever, even if your current streak resets. It's your personal best, and nothing can take it away from you.");

            SeedFaq(migrationBuilder, "Streaks", 390, "I broke my streak after a hundred days. Can I just get it back?",
                "We don't restore streaks — the consistency is what makes them meaningful. But your longest streak (100 days, in this case) is permanently recorded as part of your story. Start the next chapter when you're ready. Everyone does.");

            // ── Reminders, sparks, prompts, to-dos ──────────────────────
            SeedFaq(migrationBuilder, "Reminders & tools", 400, "How do reminders work?",
                "You can set up to 5 custom push notification reminders per day — different times, different messages. Maybe one in the morning to start your practice, another after lunch as a nudge to log, another at night for a wind-down session. They're general-purpose, so use them for anything that supports your practice: \"Drink water,\" \"Walk for 20 min,\" \"Pitch one editor.\"");

            SeedFaq(migrationBuilder, "Reminders & tools", 410, "What's the Daily Spark?",
                "A short piece of creative advice or inspiration shown on your dashboard each day. We've built up a library of hundreds of sparks — the kind of wisdom artists pass to each other quietly. Some are practical. Some are philosophical. Some are gentle reminders. You can save your favorites to return to whenever you need a boost.");

            SeedFaq(migrationBuilder, "Reminders & tools", 420, "What's a Daily Prompt?",
                "A journal prompt designed to get you thinking. They appear on your dashboard and rotate daily — perfect for those days when you want to write but don't know where to start. Tap one to seed an entry, or browse the full library to find one that resonates.");

            SeedFaq(migrationBuilder, "Reminders & tools", 430, "Can I save my favorite sparks?",
                "Yes — tap the heart on any spark to save it. Your favorites live in your Favorites tab alongside your favorited journal entries. They're there when you need a boost or a reminder of something that hit home before.");

            SeedFaq(migrationBuilder, "Reminders & tools", 440, "How does the to-do list work?",
                "A simple checklist. Use it for recurring daily items you want to do every day (\"Practice scales for 20 min\"), or one-time tasks you don't want to forget. Tap to check things off — that small dopamine hit is part of the design.");

            SeedFaq(migrationBuilder, "Reminders & tools", 450, "Can I have recurring to-do items?",
                "Yes — mark a to-do as recurring and it shows up every day automatically. Perfect for \"Show up to the studio\" / \"Write 500 words\" / \"Take a walk\" — the small commitments that compound over time.");

            SeedFaq(migrationBuilder, "Reminders & tools", 460, "Will reminders work if I close the app?",
                "Yes — once you grant notification permission, you'll get push notifications even when the app isn't open. For the most reliable experience, install the app to your phone's home screen (it's a PWA — see the Technical section).");

            SeedFaq(migrationBuilder, "Reminders & tools", 470, "Can I customize my reminder messages?",
                "Yes. Each of your 5 reminders can have its own time AND its own message. Write yourself notes-from-future-you: \"Hey, you're tired — but a sentence still counts.\" Past-you can be very persuasive to today-you.");

            // ── Favorites & history ─────────────────────────────────────
            SeedFaq(migrationBuilder, "Favorites & history", 500, "Can I save my favorite journal entries?",
                "Yes — favorite any entry by tapping the heart. Your favorites appear together in a single Favorites view, separated from the firehose of your full journal. Use it for entries you want to return to: breakthroughs, defining moments, lessons you don't want to forget.");

            SeedFaq(migrationBuilder, "Favorites & history", 510, "What's the difference between favoriting an entry and favoriting a spark?",
                "Both show up in the same Favorites view, sorted by when you favorited them. Sparks are advice and inspiration from the app's library; entries are your own writing. Together, they make a curated highlight reel of what you've made and what's moved you.");

            SeedFaq(migrationBuilder, "Favorites & history", 520, "Can I export my journal?",
                "Yes — head to your Account page. Your work is yours and we believe you should always be able to take it with you, no questions asked.");

            SeedFaq(migrationBuilder, "Favorites & history", 530, "Can I delete entries?",
                "Yes. Deleted entries go to a trash folder for 48 hours in case you change your mind, then they're permanently gone. Nothing is lost forever right away — but the trash empties itself so your journal stays tidy.");

            // ── Account & privacy ───────────────────────────────────────
            SeedFaq(migrationBuilder, "Account & privacy", 600, "Is my journal private?",
                "Yes. Your entries are visible only to you. There's no public feed, no social layer, no audience. This is your space to make things and reflect on the making.");

            SeedFaq(migrationBuilder, "Account & privacy", 610, "Where is my data stored?",
                "On secure cloud servers in the United States. Postgres database for your account and entries, encrypted object storage for your photos. All connections are HTTPS-only, and your data is backed up regularly.");

            SeedFaq(migrationBuilder, "Account & privacy", 620, "How is my password protected?",
                "Your password is hashed with BCrypt at industry-recommended strength — we never store the plain text. Even our team can't read your password. We also enforce per-account login lockout after repeated failed attempts, so brute-force attacks fail.");

            SeedFaq(migrationBuilder, "Account & privacy", 630, "Can I change my password?",
                "Yes — head to your Account page. There's also a \"Forgot password\" link on the sign-in screen if you can't remember it; we'll email you a reset link.");

            SeedFaq(migrationBuilder, "Account & privacy", 640, "How do I update my profile information?",
                "From your Account page you can update your name, email, profile photo, and timezone. Changes save instantly.");

            SeedFaq(migrationBuilder, "Account & privacy", 650, "Can I delete my account?",
                "Yes — from your Account page. We'll keep your data for 90 days in case you change your mind, then it's permanently removed. You can sign back in anytime during that window and everything is exactly where you left it.");

            SeedFaq(migrationBuilder, "Account & privacy", 660, "Will my entries be used to train AI?",
                "No. Your entries belong to you and are never used for training, advertising, or shared with third parties. They're stored to display back to you, and that's it.");

            SeedFaq(migrationBuilder, "Account & privacy", 670, "Can I sign in from multiple devices?",
                "Yes — sign in from your phone, your laptop, your tablet, whatever you've got. Your journal syncs across all of them so you can pick up wherever you left off.");

            // ── Pricing & billing ───────────────────────────────────────
            SeedFaq(migrationBuilder, "Pricing & billing", 700, "How much does Creator Companion cost?",
                "$5/month or $50/year (you save $10 by paying yearly). Every new account gets a 10-day free trial with full access — no credit card required to start.");

            SeedFaq(migrationBuilder, "Pricing & billing", 710, "Is there a free version?",
                "There's a 10-day free trial that gives you full access to every feature. After the trial, a subscription is required to keep using the app. This keeps the experience simple — one plan, every feature, no upsells.");

            SeedFaq(migrationBuilder, "Pricing & billing", 720, "How does the free trial work?",
                "When you sign up, you get 10 days of full access immediately. No credit card required. We'll email you a few days before the trial ends. If you don't subscribe by then, your account simply pauses — you can come back and subscribe at any time and pick up where you left off.");

            SeedFaq(migrationBuilder, "Pricing & billing", 730, "What happens at the end of my trial if I don't subscribe?",
                "Nothing dramatic. You'll see a \"subscribe to continue\" prompt when you next visit the app. Your entries are safe — we hold them for 90 days while you decide. No surprise charges, no ticking clock.");

            SeedFaq(migrationBuilder, "Pricing & billing", 740, "How do I subscribe?",
                "When you're in the app, tap \"Subscribe now\" from the trial banner at the top of your dashboard, or from the Account page. You'll be sent to Stripe to enter your card details — the same secure checkout used by thousands of trusted businesses.");

            SeedFaq(migrationBuilder, "Pricing & billing", 750, "Can I cancel anytime?",
                "Yes — anytime, right from inside the app. Head to Account → Subscription. You'll keep access for the remainder of your billing period. No phone calls, no cancellation forms, no \"are you sure?\" gauntlet.");

            SeedFaq(migrationBuilder, "Pricing & billing", 760, "Do you offer refunds?",
                "Because the 10-day free trial gives you full access before any payment, we generally don't process refunds — the trial is your evaluation window. If something has gone genuinely wrong, please email support and we'll work with you.");

            SeedFaq(migrationBuilder, "Pricing & billing", 770, "What happens to my data when I cancel?",
                "We hold everything for 90 days after cancellation in case you change your mind. You can sign back in any time during that window and your entries, streaks, photos, and history are exactly where you left them. After 90 days, the account is permanently removed.");

            SeedFaq(migrationBuilder, "Pricing & billing", 780, "What payment methods do you accept?",
                "All major credit cards (Visa, Mastercard, American Express, Discover) and most regional methods supported by Stripe. Payments are processed securely — we never see or store your card details directly.");

            SeedFaq(migrationBuilder, "Pricing & billing", 790, "Can I switch between monthly and yearly?",
                "Yes — manage your subscription anytime from the Account page. Switching plans takes effect at your next billing cycle.");

            // ── Best practices ──────────────────────────────────────────
            SeedFaq(migrationBuilder, "Best practices", 800, "When's the best time to write my entry?",
                "Whenever works for your rhythm. Some people prefer mornings as a planning ritual. Others write at night as a reflection. Many use the in-between moments — after a session, on the commute, during a coffee break. There's no \"right\" time. There's just the time you'll actually do it.");

            SeedFaq(migrationBuilder, "Best practices", 810, "I keep forgetting to log. Any tips?",
                "Set up a reminder! That's literally what they're for. Pick a time when you tend to be at your phone or computer (after dinner is popular). Make the reminder message cheeky or motivating. The first month is the hardest; after that, you'll often remember on your own.");

            SeedFaq(migrationBuilder, "Best practices", 820, "What if I have nothing to say?",
                "Use a Daily Prompt for a starting point, or just describe your day in five words. \"Wrote nothing. Thought about a lot.\" counts. The streak isn't about quality — it's about presence.");

            SeedFaq(migrationBuilder, "Best practices", 830, "How do I rebuild after a long break?",
                "One entry. That's it. Don't try to \"catch up.\" Don't write a long apology. Just log today. Yesterday was yesterday. The next streak begins with one entry today.");

            SeedFaq(migrationBuilder, "Best practices", 840, "Should I write about creative work specifically, or my whole life?",
                "Whatever serves your practice. Some users keep it tightly focused on creative work; others use it as a general daily journal that includes their creative life. There's no wrong answer — your journal, your rules.");

            SeedFaq(migrationBuilder, "Best practices", 850, "How do I keep this from feeling like a chore?",
                "Lower the bar. Always. If logging feels heavy, write three words. Add a photo. Pick a mood. The whole design is to make showing up frictionless. The day it feels like a chore is the day to write the shortest entry of your life and move on.");

            // ── Technical ───────────────────────────────────────────────
            SeedFaq(migrationBuilder, "Technical", 900, "Can I install Creator Companion on my phone?",
                "Yes — it's a Progressive Web App (PWA), which means you can install it directly to your home screen on both iOS and Android with no App Store required. From your phone's browser, tap Share → Add to Home Screen. It then launches like a native app.");

            SeedFaq(migrationBuilder, "Technical", 910, "Does it work on desktop too?",
                "Yes — there's a full desktop experience optimized for larger screens. Sidebar navigation, side-by-side entry reading, the works. Your data syncs across all your devices automatically.");

            SeedFaq(migrationBuilder, "Technical", 920, "Can I use Creator Companion offline?",
                "You can browse recently-viewed content offline, but logging entries and editing requires a connection (so your work is safely backed up). The app reconnects automatically when you're back online.");

            SeedFaq(migrationBuilder, "Technical", 930, "How do I enable notifications?",
                "When you first set up a reminder, your browser will ask for permission. If you accidentally denied it, you can re-enable from your browser's site settings. On mobile, install the app to your home screen first for the most reliable notification delivery.");

            SeedFaq(migrationBuilder, "Technical", 940, "Can I rewatch the onboarding tour?",
                "Yes — from your Account page, click \"Show tour again,\" or just visit /onboarding?replay=1 directly. You'll see the welcome cards followed by the tooltips that walk you through your dashboard.");

            SeedFaq(migrationBuilder, "Technical", 950, "Why do I see a \"your trial ends in X days\" banner?",
                "We want you to know what's coming so there are no surprises. The banner is dismissible (tap the ×) and only appears during the trial window.");
        }

        /// <summary>
        /// Idempotent insert: only adds the FAQ if no row with that exact
        /// Question already exists. Lets the migration safely run on a
        /// database that already has admin-managed FAQs.
        /// </summary>
        private static void SeedFaq(MigrationBuilder mb, string category, int sortOrder, string question, string answer)
        {
            // E' Postgres dollar-quoted strings are not portable across all environments;
            // we use parameterized SQL via .Sql() with single-quote escaping for
            // simplicity and broad compatibility. The content is static, written
            // by us, no SQL injection surface.
            var qEsc  = question.Replace("'", "''");
            var aEsc  = answer.Replace("'", "''");
            var cEsc  = category.Replace("'", "''");
            mb.Sql($@"
                INSERT INTO ""Faqs"" (""Id"", ""Question"", ""Answer"", ""Category"", ""SortOrder"", ""IsPublished"", ""CreatedAt"", ""UpdatedAt"")
                SELECT gen_random_uuid(), '{qEsc}', '{aEsc}', '{cEsc}', {sortOrder}, TRUE, NOW(), NOW()
                WHERE NOT EXISTS (SELECT 1 FROM ""Faqs"" WHERE ""Question"" = '{qEsc}');
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // We intentionally do NOT delete seeded FAQ rows on rollback —
            // they may have been edited by admins after the migration ran,
            // and rollback shouldn't quietly erase that work. Dropping the
            // Category column will make those rows fall back to the EF
            // default "General" if/when the column is restored later.
            migrationBuilder.DropIndex(
                name: "IX_Faqs_Category",
                table: "Faqs");

            migrationBuilder.DropColumn(
                name: "Category",
                table: "Faqs");
        }
    }
}
