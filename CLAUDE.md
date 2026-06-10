# Creator Companion — Project Briefing

Auto-loaded by Claude Code every session. Keep lean — every token costs context.
Update when decisions land. Don't put transient state here.

---

## What this is

This app is your digital creator companion. It will give you the daily support,reminders, motivation, inspiration, advice, organization, encouragement that you need to maintain a daily, creative practice indefinitely. 


## Roadmap / what's next (read this when Chris asks "what's next")

Chris asked that these be surfaced whenever he asks what's next. Agent-
memory was uninstalled, so THIS file is the cross-session memory — keep this
list current as items land. Priority order:

1. **Activate the Marketing auto-poster** (built + deployed, dormant).
   Connect Bluesky/Mastodon in `/admin → Marketing → Settings`, do a test
   post (Today → Post now), confirm the quote card renders + summary email,
   then flip the global kill switch on. Optional: set `Anthropic__ApiKey`
   on Railway for auto-hashtags. See "Marketing auto-poster (built)".
2. **Backups & rollback** — `docs/backups-and-rollback.md`. Release
   rollback works today; **DB backups are a real gap**. Do: secure the
   encryption key + secrets offline → stand up DB backups (offsite
   `pg_dump`→R2) → write + TEST a restore → enable R2 versioning.
3. **Staging environment** — `docs/staging-environment.md`. Mirrored,
   isolated env for testing features on fake data before users see them.
   Sequence AFTER backups (a sanitized restore feeds staging).
4. **Marketing fast-follows** — Threads/Twitter `ISocialPoster` adapters,
   clickable Bluesky hashtags (facets), scheduled-post queue, weekly recap
   post, occasional app-link CTA with UTM, day-of-week peak-time posting.

Detail + caveats live in the linked docs and the deeper TODO section below.


## Features (product surface)

Brief inventory so I can reason about the product without grepping.

- **Daily journal** — text + photos + mood. Streak-gamified ("don't
  break the chain"). Entries searchable, sortable, taggable, favoritable.
- **Tag library** — user-built and maintainable. Drives entry filtering.
- **Reminders** — up to 5 custom push notifications/day. User sets time
  and message. General-purpose (not just journal nags). See dedicated
  section below.
- **To-do list** — simple checklist for daily-recurring items or one-offs.
- **Streak system** — daily counter, milestone reward badges, longest-
  streak always shown. 48h backlog grace; 10-day pause for life events.
- **Daily Spark** — short piece of advice on the dashboard, expandable
  to full content. ~300–400 sparks built in. Favorable.
- **Prompt library** — large library of journal prompts that auto-rotate
  on the dashboard; user can also click through to find one they like.
- **Mood-as-entry-starter** — clicking a mood icon opens a new entry
  with that mood pre-set.
- **Trash & restore** — soft-deleted entries are recoverable for 48h
  before hard-delete.
- **Image compression** — uploads are downscaled + recompressed via
  ImageSharp before storage (R2). Keeps user storage / bandwidth sane.
- **Preferences** (REMOVED May 2026) — the Daily Spark + Daily
  Reminders toggles were inert UI (nothing on the dashboard
  actually read `showMotivation` / `showActionItems`, so toggling
  did nothing visible). UI removed entirely; backend columns +
  API endpoints retained for cleanup. Both features now always-on
  for every paid user.
- **FAQ + support** — self-serve help content; user can also delete
  account and export data from the account page.
- **Admin** — separate `/admin` area: stats dashboard, user management,
  email/notification template editing, Spark + prompt content
  management, FAQ editing.
- **Mobile + desktop** — single PWA, responsive. Mobile gets a slide-in
  drawer + bottom nav; desktop gets the persistent sidebar.

## Limits & abuse controls

Server-enforced caps to prevent abuse and runaway costs:

- **Word count per entry** — capped (see `EntryLimitsConfig`).
- **Image count + total size per entry** — capped.
- **Allowed file types** — image MIME types only.
- **Rate limiting** — auth endpoints (login/register/forgot/reset),
  POST/PUT/DELETE/PATCH globally. Configured in `Program.cs` via
  `AspNetCoreRateLimit`. Uses real client IP via `ForwardedHeaders`.
- **Trash retention** — 48h before hard-delete (acts as user safety
  net AND prevents indefinite soft-deleted bloat).

## Tone & design philosophy

- **Voice:** cheerful, calm, empathetic cheerleader. Patient. Never
  drill-sergeant. Marketing leans literary; in-app copy stays warm.
- **Vocabulary:** the product frames daily activity as "logging a step
  in your creative practice," not "writing." Avoid writing-specific
  copy ("words", "lines", "sentences") in shared UI — works for visual
  artists, musicians, filmmakers too. Entry composer can use writing
  vocabulary; emotional shells (Welcome Back, threatened banner,
  Welcome screens) should use "progress" / "step" framing.
- **Failure framing:** never name the loss. Streak breaks are "chapters
  ending," not failures. Reframe forward, lower the bar to restart.
- **Permission to be imperfect** is what keeps users coming back. Loss
  aversion drives daily return; shame drives quitting.


## Repo layout

```
api/                              .NET 10 backend
  CreatorCompanion.Api/           the service
  CreatorCompanion.Tests/         xunit tests
web/creator-companion-web/        Angular 17+ PWA (frontend)
  src/app/features/               feature components (one folder per route)
  src/app/shared/                 shared components (sidebar, mobile-nav)
  src/app/core/                   services, interceptors, models
  public/                         static assets (logos, manifest, sw.js)
marketing/                        static HTML/CSS/JS marketing site
.claude/                          editor + tool config
```

## Infrastructure / hosting

- **GitHub** — source of truth for all code. Pushing to `main` triggers
  the auto-deploys below.
- **Railway** — hosts the **backend API** (the .NET server). Long-running
  process, handles auth, DB queries, push delivery, the reminder worker.
  Postgres also runs on Railway.
- **Vercel** — hosts BOTH the **frontend PWA** (project
  `creator-companion-onti`, custom domain `app.creatorcompanionapp.com`)
  AND the **marketing site** (separate project, root domain
  `creatorcompanionapp.com`). The PWA project deploys via CLI from
  GitHub Actions; the marketing project deploys via Vercel's native
  GitHub integration. See "Build & deploy" and "Deploy reliability"
  sections for full details.
- **Cloudflare R2** — object storage for user media (avatars, future
  attachments). S3-compatible API.
- **Resend** — transactional email.
- **Stripe** — payments.
- **Sentry** — error tracking + performance traces. Both backend
  (.NET SDK in Program.cs) and frontend (Angular SDK in main.ts) report
  to separate Sentry projects. SDK no-ops when the DSN env var is
  unset, so dev environments without Sentry just skip reporting.
  See "Observability (Sentry)" section below for env var names + the
  privacy posture (which is critical — DON'T loosen it).

## Service accounts (registry)

Single source of truth for **which account owns each piece of the
stack**. Exists to prevent credential-crossover with other projects
on the same machine (one painful learning: macOS keychain stores
ONE credential per host, so signing into `Sanctuarymg` GitHub in
another context overwrote the `chrisauman` entry and broke pushes).

**This file contains identifiers ONLY, never secrets.** Login emails,
account slugs, project names, dashboard URLs — yes. Passwords, API
tokens, DSNs, connection strings — never. Those live in your password
manager and in service-side env vars (Railway, Vercel, GitHub
repo secrets).

Fields with `[TBD]` need Chris to confirm; update them as you
verify each.

**Enforced, not just documented (May 2026).** A committed `PreToolUse`
guard (`.claude/scripts/account-guard.sh`, wired in
`.claude/settings.json`) blocks any command pointed at the wrong account
(allow-list model; the denied account is **Sanctuary**). Full rules,
secret storage (macOS Keychain + gitignored fallback), and the one-time
`seed-secrets.sh` setup live in [`.claude/account-scope.md`](.claude/account-scope.md).
The repo-local git identity is pinned to `Chris Auman
<chris.auman@gmail.com>` so commits can't be authored as the Sanctuary
identity.

### GitHub
- **Account / owner:** `chrisauman`
- **Login email:** [TBD — chris to confirm]
- **Repo:** `https://github.com/chrisauman/creator-companion`
- **Default branch:** `main`
- **Notes:** Pushes use macOS keychain credentials for `github.com`.
  If you've signed into other GitHub accounts on this machine, clear
  the keychain entry before pushing here (`git credential reject`
  with `host=github.com`).

### Sentry
- **Account holder:** Chris Auman
- **Org slug:** `chris-auman`  → dashboard at `https://chris-auman.sentry.io`
- **Org ID:** `4511419335966720`
- **Data storage region:** US
- **Login email:** [TBD — chris to confirm]
- **Projects:**
  - `creator-companion-api` — backend, platform: ASP.NET Core
  - `creator-companion-web` — frontend, platform: Angular  *(TBD — to be created)*
- **DSN env var locations:** backend DSN → Railway `Sentry__Dsn`
  (double underscore); frontend DSN → Vercel `SENTRY_DSN` (Production
  scope), consumed at build time by `scripts/inject-version.mjs`.

### Railway
- **Account holder:** [TBD]
- **Login email:** [TBD]
- **Project name:** [TBD]
- **Service(s):** [TBD — backend API service, Postgres add-on]
- **Notes:** auto-deploys on push to `main` via Railway's GitHub App
  integration.

### Vercel
- **Account holder:** `chrisauman` (Vercel user). Confirmed via a project-
  scoped token: `vercel whoami` → `chrisauman`, `vercel teams ls` →
  only `chrisauman's projects`.
- **Login email:** [TBD]
- **Org / Account ID:** `team_wv6NHwtrOwuk3b1oQXfKWYmm` = the **Hobby
  personal scope "chrisauman's projects"** (slug `chrisauman`,
  `vercel.com/chrisauman`). It's a personal Hobby account — Vercel just
  uses a `team_…`-style id for it. This is the `VERCEL_ORG_ID` used by CI.
  **Deny:** the `sanctuary-projects` ("Sanctuary") team — which is what
  the machine's globally-active `vercel` CLI was pointed at before the
  account guard went in (`vercel teams ls` showed Sanctuary; the scoped
  token now shows chrisauman's projects).
- **Projects (both under the org above):**
  - `creator-companion-onti` — the PWA, `prj_VtXOth7fmOAnFkaJ8NoL1YgLZT2W`,
    custom domain `app.creatorcompanionapp.com`. Root dir
    `web/creator-companion-web`. Deploys via CLI from
    `.github/workflows/deploy.yml`.
  - `creator-companion` — marketing, `prj_t1qh8HpVcOAl0Qofr6ff6N3Mwree`,
    custom domain `creatorcompanionapp.com`. Deploys via Vercel's native
    GitHub integration.

### Cloudflare R2
- **Account holder:** [TBD]
- **Login email:** [TBD]
- **Bucket name(s):** [TBD]
- **Notes:** S3-compatible; SDK uses AWSSDK.S3 NuGet pointed at R2
  endpoint.

### Resend
- **Account holder:** [TBD]
- **Login email:** [TBD]
- **From-address domain:** [TBD — code defaults to
  `noreply@creatorcompanion.app` but live env var on Railway
  (`Resend:FromEmail`) may differ.]
- **Notes:** API key on Railway as `Resend:ApiKey`.

### Stripe
- **Account holder:** [TBD]
- **Login email:** [TBD]
- **Mode:** LIVE (production)
- **Products / prices:**
  - Monthly $5.99 — price ID `price_1TXski2fl0VNYpt98pYOBkFn`
  - Annual $49.99 — price ID `price_1TXsm02fl0VNYpt9b371lP7m`
  - Test product $0.50 — price ID `price_1TXsrL2fl0VNYpt95sEXNOdi`
- **Webhook endpoint:** [TBD — destination URL on Railway]

### Domain registrar
- **Account holder:** [TBD]
- **Login email:** [TBD]
- **Domains:** `creatorcompanionapp.com` (apex + subdomains).
- **DNS hosted at:** [TBD — registrar's nameservers or Cloudflare?]

## Architecture

- **Frontend:** Angular 17+ standalone components, signals everywhere,
  styles inline in `styles: [\`...\`]` per component. No ngModule. PWA
  with `public/manifest.webmanifest` + `public/sw.js`.
- **Backend:** .NET 10, EF Core, JWT bearer auth, controllers under
  `api/CreatorCompanion.Api/Api/Controllers/`, services in
  `Application/Services/`, models in `Domain/Models/`.
- **Storage:** Cloudflare R2 (S3-compatible) for user media; local FS
  in dev. Switch in `Program.cs` based on environment.
- **Image processing:** SixLabors.ImageSharp via `IImageProcessor`,
  used for avatar uploads (downscale + recompress).
- **Push:** Web Push w/ VAPID. `IPushSender` → `WebPushSender`.
  `ReminderBackgroundService` is a hosted service, 60s loop.
- **Email:** Resend.
- **Payments:** Stripe (`IStripeService`).

## Auth

- JWT bearer. **Access token in memory** (`TokenService`), **refresh
  token in HttpOnly cookie** (`SameSite=None; Secure`).
- `authInterceptor` attaches `Authorization: Bearer …` to every call.
  On 401, calls `auth.refreshToken()`, retries with new token. Shared
  `_refresh$` observable de-dupes concurrent refresh attempts.
- `ClockSkew = TimeSpan.Zero` in `Program.cs` — be careful with clock
  drift between client and Railway. Symptom: instant 401s after fresh
  login. Don't tighten further.

## Brand

- **Accent:** `#12C4E3` (the only blue/cyan in the app). Hover variant:
  `#0bd2f0`. **Never darker teal.**
- **Marketing-site color latitude (deliberate exception).** The brand
  cyan-only rule applies to the **app** (`web/creator-companion-web/`).
  The **marketing site** (`marketing/`) is allowed to be louder — the
  homepage hero uses a multi-stop rainbow gradient (cyan → indigo →
  purple → pink → amber) as a deliberate "expressive on the outside,
  focused on the inside" positioning. Don't flatten it during an
  audit. New marketing sections should still anchor in brand cyan;
  the rainbow is the hero's signature, not a license for arbitrary
  color use across every marketing surface.
- **Ink:** `#0c0e13` / `#1a1d24`.
- **Cream gradient:** `#fdfaf2` → `#f6f1e6`.
- **Primary CTAs:** black bg + white text default; brighter cyan
  (`#0bd2f0`) + white text on hover.
- **Exception:** sidebar **New Entry** button stays brand cyan (black
  on dark sidebar would disappear). One deliberate inversion.
- **Danger / urgency color:** `#e11d48` (rose-600). Used by the
  favorited-heart, `.link-btn--danger`, and the red eyebrow + pulsing
  dot on the threatened-banner / daily-reminder cards. The only red
  in the app — reserve it for genuine urgency, not for general accent.
- **Fonts:**
  - `--font-sans`: Inter (default UI)
  - `--font-brand`: Fraunces 700/800/900 (brand wordmark, hero quotes)
  - `--font-serif`: Georgia (rarely used; reserved)
- **Brand wordmark** = live text in Fraunces 800, NOT a PNG. The
  `logo-icon.png` (cyan-on-black square) is fine to use as the icon.
- **Logo files:** `logo-icon.png` (square brand mark), `logo-full.png`
  (dark wordmark designed for light backgrounds — use invert filter
  for dark contexts, OR prefer live Fraunces text).

## Streak rules

- **48-hour backlog grace:** if a user misses a day, they can still
  write that day's entry within 48h to save the streak. The
  ThreatenedBanner surfaces this; previously it was silent.
- **Pause feature:** users can pause their streak proactively for
  **up to 10 days** per pause (vacation, life emergency). Server
  enforces the limit. `Pauses` table.
- **Milestone badges:** users earn badges at streak milestones (see
  `getMilestoneProgress` and `core/constants/milestones.ts`). The
  current and longest streaks are always surfaced on the dashboard.
- **Reset:** breaks past the 48h window reset the counter to 0.
  Longest-streak is *banked*, not erased.

## Column-3 card visual identity

The Today column's "engagement cards" (Daily Spark, Daily Prompt,
Threatened Banner, Daily Reminder) all share one visual treatment so
they read as a single family. Any new card in column 3 should match:

- Cream gradient surface (`#fdfaf2` → `#f6f1e6`).
- Soft warm border (`rgba(190,170,130,.22)`), 20px radius.
- Radial cyan glow `::before` in top-right (low opacity, subtle).
- Eyebrow in caps + pulsing dot (cyan for routine, red `#e11d48` for
  urgency moments).
- Quote at `1.25rem / 600` letter-spacing `-.01em`, `var(--font-sans)`.
  (700 felt too heavy at this size inside the cream cards; 600 keeps
  the "card as quote" feel without shouting.)
- Primary CTA: dark-ink pill, brand cyan on hover.
- All siblings inside today-panel's `.today` wrapper (`max-width:
  720px`, `padding: .75rem 1.5rem 3rem`, `margin-bottom: 1rem` per
  card) so spacing stays uniform — DON'T put them in separate
  wrappers in the dashboard template, that broke spacing once.

## Favorites surface

`/favorites` is a unified view of favorited Sparks AND favorited Journal
entries, sorted by `favoritedAt DESC`. One component
(`FavoriteSparksComponent` — internal class name kept) renders both,
embedded in column 3 (desktop) or standalone (mobile).

- Backend: `GET /v1/favorites?skip=&take=` returns
  `{ items: [{type:'spark'|'entry', favoritedAt, spark?, entry?}], hasMore }`.
  Default page size 25, max 100. Paid-tier gated. Soft-deleted entries
  filtered out.
- `Entry.FavoritedAt` (DateTime?) tracks per-entry favorite timestamp.
  Set/cleared by `EntryService.ToggleFavoriteAsync`. Backfilled to
  `UpdatedAt` for pre-existing favorites in migration `AddEntryFavoritedAt`.
- Legacy `/v1/motivation/favorites` endpoint still exists for backwards
  compat; favorites surface uses the new unified endpoint exclusively.
- Sidebar / mobile-nav label: **"Favorites"** (was "Favorite Sparks").
- Entry click → embedded mode emits `(openEntryRequest)` event for
  dashboard to swap column 3 to reader; standalone mode navigates to
  `/entry/:id`.

## Streak engagement card mutual exclusivity

The three "did you log today?" cards in column 3 are mutually
exclusive — exactly one (or zero) of them ever shows. State table:

| State                                       | Card visible      |
|---------------------------------------------|-------------------|
| Logged today                                | none              |
| No entry today, streak alive (yest. logged) | Daily Reminder    |
| Missed yesterday + today (48h grace)        | Threatened Banner |
| Streak broken (>= 3 days back)              | Welcome Back (full-takeover) overlays everything |
| Brand-new user, zero entries                | Daily Reminder (onboarding nudge) |

If you add a fourth state-driven card, slot it into this table —
overlapping urgency cues compete and dilute the moment. Each card's
component owns its own visibility check; the dashboard never gates
them based on each other.

## Streak restart system (built)

Three surfaces handle the streak-break emotional arc; all live in
`features/dashboard/`. Tone: cheerful, never names the loss.

- **`StreakHistoryComponent`** — `?section=streak-history`. Past
  chapters in column 3, personal-best pinned to top. Demo data
  via `?demo=streaks`. Endpoint: `GET /v1/entries/streak/history`
  (also `IStreakService.GetHistoryAsync`).
- **`ThreatenedBannerComponent`** — auto-renders at top of column 3
  (Today mode only) when `currentStreak > 0 && lastEntryDate is
  exactly 2 days back`. "Log your progress" → `composeDate` →
  `NewEntryComponent [initialDate]` pre-fills the missed day.
- **`DailyReminderCardComponent`** — soft "log today's progress"
  prompt at the top of the Today column on any day no entry has
  been logged. Self-deciding: hides when logged today AND when
  threatened banner is showing (those states never overlap). Shown
  for brand-new users with zero entries (onboarding nudge). Preview
  via `?preview=daily-reminder`.
- **Streak-threatened push** — `ReminderBackgroundService.
  ProcessThreatenedNotificationsAsync` mirrors the banner condition
  and fires one push per missed-day-event after 10am user-local.
  Deduped via `User.StreakThreatenedNotifiedFor` (DateOnly?).
- **`WelcomeBackComponent`** — full-takeover after a break. Shows
  when `currentStreak === 0 && longestStreak > 0` and not already
  dismissed (key: `cc_welcome_back_seen_<userId>_<lastEntryDate>`
  in localStorage — re-fires on each new break).

## Preview infrastructure (admin-only)

`/admin` has a "Preview surfaces" section linking to:
- `?section=streak-history&demo=streaks` — sample chapters
- `?preview=welcome-back` — Welcome Back overlay
- `?preview=threatened` — threatened banner

Dashboard reads `?preview=` in `applySectionQueryParam` and ONLY
honors it for admins (`tokens.isAdmin()`). All previews are read-only
— no API writes, no streak changes. `dismissPreview()` clears the
signal AND strips the URL param.

## Pricing model (trial-only)

- **10-day free trial** on signup. After expiration: locked out
  unless subscribed.
- **Single paid plan**: $5.99/month or $49.99/year (Stripe).
- **Source of truth**: `EntitlementService.HasAccess(user)` =
  `HasActiveSubscription(user) || IsInTrial(user)`.
  Subscription is "active" iff `User.Tier == Paid` (Stripe webhook
  flips this). Trial is active iff `User.TrialEndsAt > now`.
- **Write block**: every write path eventually calls
  `entitlements.EnforceAccess(user)`, which throws `NoAccessException`
  → mapped to **HTTP 402 Payment Required** by the global handler.
  Frontend interceptor catches 402 → invalidates capabilities →
  paywall renders.
- **Reads stay open** during trial expiration so users see their
  existing data while deciding to subscribe.
- **What's gated vs open** (audit pass May 2026):
  - **Gated (402 if no access):** entries (create/edit/delete/favorite),
    journals, image uploads, action-item creation, pause creation,
    motivation/daily-prompt favorites, reminder writes (POST/PUT/
    DELETE/reset/auto-enable-first), tag writes (create/rename/
    delete), draft upsert.
  - **Open during lockout (deliberate):** all reads, account self-
    service (profile/email/password/preferences/photo), push
    subscription register/unregister/test, pause cancellation,
    existing action-item edit/toggle/reorder/delete, draft discard.
    Rationale: managing your account or cleaning up existing items
    isn't "creating new content" — locking it punishes users mid-
    subscribe-decision.
  - **Worker-side**: `ReminderBackgroundService.ProcessOneAsync`
    also skips firing for no-access users (HasAccess check at top)
    so trial-expired users don't get scheduled pushes for reminders
    they configured pre-expiry. Resumes automatically on subscribe.
  - **Don't ungate account self-service.** Profile/email/password/
    preferences/photo MUST stay open during lockout — a locked-out
    user still needs to update their card details or change their
    email to subscribe.
- **Trial lifecycle emails** fired by `ReminderBackgroundService.
  ProcessTrialEmailsAsync`: 3-day reminder, 1-day reminder,
  trial-ended notification. Each deduped via its own column on
  `User` (`TrialReminder3dSentAt`, `TrialReminder1dSentAt`,
  `TrialEndedEmailSentAt`).
- **Frontend surfaces**: `<app-trial-banner>` at top of dashboard
  during trial (red+urgent in final 2 days); `<app-paywall>` full-
  takeover when access is lost.
- **Stripe price IDs** are env-var driven (`Stripe:MonthlyPriceId`,
  `Stripe:AnnualPriceId`) — when prices change, update Railway env
  and create matching products in Stripe dashboard.

## Reminders (recent refactor — important)

- **5 fixed slots per user.** Lazy-created on first GET. UI never
  exposes add/delete; users edit time/message/on-off per slot.
- **General-purpose.** Fire unconditionally on schedule. Use them for
  anything (journal, hydration, walks).
- **Do NOT reintroduce:**
  - "Skip if already journaled today" (broke contract for non-journal
    reminders — was removed deliberately)
  - "Skip if streak paused" (same reason)
  - Tiered messages by days-since-last-entry (`SelectMessage` is gone)
- **Worker matching:** `userNow >= scheduledToday AND !alreadySentToday`.
  NOT exact-minute match (60s loop drifts; redeploys land mid-minute).
- **Edit clears `LastSentAt`** so changing a slot's time treats it as a
  fresh schedule (so the user can test by setting "5 minutes from now").
- **User-facing label:** "Reminders." Internal route still
  `/notifications`, internal type literals still `'notifications'`
  (URLs and identifiers preserved for bookmarks / refactor cost).
- **"How to" toggle (May 2026)** replaces the prior "Reset all"
  button in the section header. The schedule-rule hint is now
  collapsed by default behind a `showHowTo` signal — reclaims
  vertical space above the reminder slots (which is what users
  came to edit). `resetReminders()` method retained in code for
  potential future wiring through a menu.

## Marketing auto-poster (built)

Admin-only `/admin/marketing` section. Auto-posts Daily Sparks to social
platforms on a per-platform schedule, plus ad-hoc compose. Separate
subsystem from the Substack email-reminder (which stays for the no-API
Substack case). Shipped platforms: **Bluesky, Mastodon, Facebook,
Instagram, Threads** (image/text) + **YouTube** (a daily video Short).
**Twitter** is a reserved `SocialPlatform` enum member with no adapter
(paid API). Meta trio (FB/IG/Threads) needs public `image_url` → see
`IPublicImageHost`.

- **Decisions (locked with Chris, May–Jun 2026):** independent spark per
  platform (each platform draws its own never-repeated spark) · auto-
  publish under a global kill switch (no review queue) · per-platform
  post time + jitter · truncate-to-fit long sparks (no threading) ·
  image cards + video Shorts (YouTube) · optional Evening Spark (2nd
  daily post, dark card, own spark, later time) · daily summary email +
  immediate failure alert, both to **chris.auman@gmail.com** · auto-
  hashtags via Claude Haiku, graceful-skip if no key.
- **Backend:** `SocialPostingService` (picker/schedule/jitter/fire/
  ad-hoc fan-out) + `SocialPostingBackgroundService` (60s worker,
  independent of the reminder + Substack workers). `ISocialPoster`
  adapters: `BlueskyPoster` (AT Protocol app-password), `MastodonPoster`
  (instance + access token). `IHashtagService` → Anthropic Messages API.
  Tables: `SocialSettings` (global kill switch + summary dedupe),
  `SocialAccount` (per-platform creds + schedule, creds AES-GCM-encrypted
  via `IEntryEncryptor`), `SocialDailyPlan` (unique `(Date,Platform,Slot)`
  — per-platform never-repeat anti-join, mirrors `SubstackDailyPlan`),
  `SocialPost` + `SocialPostTarget` (ad-hoc, per-platform leg status).
  Adapters also: `Bluesky/Mastodon` (byte upload), `MetaPosterBase` →
  `Threads/Facebook/Instagram` (Graph API, public image_url), `YouTubePoster`
  (Data API v3 video upload). Controller: `AdminMarketingController` at
  `/v1/admin/marketing`.
- **Frontend:** `admin-marketing.component.ts` — Settings / Today /
  Compose / History tabs. Nav entry in `admin-shell`.
- **Quote cards (built):** `QuoteCardRenderer` (ImageSharp.Drawing +
  bundled OFL fonts in `wwwroot/fonts/`: Fraunces for the quote, Inter
  for eyebrow/wordmark) renders a 1080² branded cream card. Daily posts
  attach one when `SocialSettings.DailyQuoteCardsEnabled` (default on)
  and the platform supports images; ad-hoc posts via
  `SocialPost.GenerateQuoteCard` when no image is uploaded. Renderer
  returns null on any failure → post still goes out text-only.
- **Evening Spark (built, Jun 2026):** optional SECOND daily post per
  platform. `SocialDailyPlan.Slot` (Morning/Evening); unique key
  `(Date,Platform,Slot)`. Evening draws its OWN never-repeated spark
  (picker excludes any spark already planned that day for the platform, so
  Morning ≠ Evening) and renders the **dark "Blue Wash" card**
  (`QuoteCardRenderer.Render(..., dark: true)` — deep blue-teal surface +
  central cyan wash + cream text, eyebrow "EVENING SPARK"). Opt-in per
  platform: `SocialAccount.EveningEnabled` + `EveningPostHourLocal/Minute`
  (default 6pm, off). Admin Settings has the toggle + time; Today shows a
  Morning and an Evening row per platform with independent post-now/reroll.
- **Video Shorts (built):** `IVideoRenderer` (`VideoRenderer`) draws
  1080×1920 frames via ImageSharp and FFmpeg-encodes an H.264 MP4 (FFmpeg
  in the API Dockerfile). 12-theme rotating library (theme = day-of-year %
  12). Used by `YouTubePoster`; evening slot offsets the theme so the two
  daily clips differ. Degrades to null (skips video) if fonts/FFmpeg absent.
- **Required env vars (Railway):** `Anthropic__ApiKey` (hashtags; absent
  = posts go out without tags). Social creds are entered in the admin UI,
  not env. Reuses `Entry__EncryptionKey` to encrypt stored creds.
- **Safe by default:** `AutoPostEnabled` defaults false and no accounts
  are connected, so nothing posts until Chris connects a platform in
  Settings and flips the kill switch on.
- **Adding a platform:** append the `SocialPlatform` enum member, write
  an `ISocialPoster` adapter, register it in `Program.cs`. No core/
  migration churn — `(Date,Platform,Slot)` keying already generalises.
  Set `IsVideo`/`RequiresImageUrl`/`SupportsImages` on the adapter as fits.
- **Known limitations / fast-follows:** Bluesky posts are plain text
  (hashtags/links not yet faceted-clickable); day-of-week peak-time
  variation not built (per-platform fixed time + jitter only). YouTube
  upload is built but untested live (needs Chris's Google OAuth creds);
  Google/YouTube setup walkthrough still pending (`docs/youtube-setup.md`
  TBD). Optional AI-condensed short spark text for a text-only post is
  discussed-not-built (CSV export endpoint shipped for offline editing).

## Profile model

- **FirstName + LastName.** Username was removed — historical refactor.
- **Profile picture** uploaded to R2, compressed via ImageSharp.
- **TimeZoneId** captured at registration via
  `Intl.DateTimeFormat().resolvedOptions().timeZone`. Default for
  legacy accounts: `"UTC"` (means a 9am reminder fires at 9am UTC for
  them — surface this if reminder timing seems wrong).

## Showing visual output (Chris's preference)

When there's something visual to show — rendered quote cards, generated
images, UI mockups, screenshots — **render it to a file and `open` it in
Preview so Chris can actually see it**, then add a brief "what you're
looking at" + any honest caveats. Don't just describe it in text. (Pattern
he asked to standardize, May 2026, after the quote-card preview.)

## Coding conventions

- **Comments matter.** Explain *why*, not *what*. Future-Claude (and
  future-Chris) needs the reasoning, not the literal behavior.
- **Heavy inline comments preferred** over external docs that drift.
- **Use Edit, not Write,** for existing files. Diffs are easier to
  review than full rewrites.
- **No emojis in code** unless explicitly requested.
- **Standalone Angular components** only. Signals for state. Inline
  styles in `styles: [\`...\`]`.
- **Backend services scoped/singleton appropriately** — see
  `Program.cs` for the pattern.
- **EF Core migrations** are append-only. **NEVER write a destructive
  migration** (DELETE + bulk INSERT). One did this for reminders and
  it broke login on deploy. Backwards-compatible only.

## Build & deploy

- **Frontend build:** `cd web/creator-companion-web && npx ng build --configuration=production`
- **Backend build:** `cd api && dotnet build CreatorCompanion.Api/CreatorCompanion.Api.csproj`
- **Frontend deploy:** Vercel project `creator-companion-onti`, custom
  domain `app.creatorcompanionapp.com`. Auto-deploys on push to
  `main` via `.github/workflows/deploy.yml` using `vercel deploy
  --prebuilt --prod` (CLI, not the deploy hook — see below).
- **Backend deploy:** Railway, auto-deploys on push to `main` via
  Railway's GitHub App integration.
- **Marketing deploy:** Vercel project (separate from app project),
  custom domain `creatorcompanionapp.com`, auto-deploys on push to
  `main`.
- **Always build locally before committing** — don't push uncompiled.

## Deploy reliability (read this when something breaks)

The May 2026 saga that produced this section: Vercel's hook→build
binding for the app project silently corrupted after a GitHub
disconnect/reconnect — hooks returned `{"state":"PENDING"}` but
the jobs never materialized as Deployments-tab rows. Combined with
a few other landmines (monorepo skip-by-path, a phantom EF
migration, `adduser` missing from the .NET 10 slim image), 9
commits orphaned silently over a weekend with no visible signal.

The current setup is designed so that can never happen invisibly
again. Two independent safety nets:

- **Per-push verification.** The `deploy-vercel` job in
  `.github/workflows/deploy.yml` ends with a step that polls the
  live site for the `cc-build` meta tag (stamped at build time by
  `scripts/inject-version.mjs`) and fails red within 10 minutes if
  the new SHA doesn't reach production. Silent push-time orphan →
  red workflow → email notification.
- **Daily independent check.** `.github/workflows/health-check.yml`
  runs at 14:00 UTC every day plus manually via `workflow_dispatch`.
  Compares the live web SHA stamp to `main` HEAD AND probes the
  API `/health` endpoint. Catches anything that drifts between
  pushes (Vercel project paused, Railway service down, DNS issue,
  CDN serving stale HTML, token revoked, etc.) — red workflow →
  email notification.

**If a workflow goes red:**

1. Open the failing run on GitHub Actions and read the step output.
   The job names and error messages are designed to be self-
   describing — e.g. `Verify deploy reached production` failing
   means the deploy step "succeeded" but the new SHA never appeared
   on production.
2. The workflow files themselves contain extensive comment blocks
   with troubleshooting checklists for each known failure mode.
   Read them in `deploy.yml` and `health-check.yml` before
   speculating.
3. If the Vercel CLI step in deploy.yml fails, the error from the
   CLI is shown verbatim. Common causes: token revoked (recreate
   at Vercel → avatar → Account Settings → Tokens), `vercel.json`
   route pattern rejected by CLI's strict path-to-regexp validator
   (must use named groups, not bare `.*`), or project Root
   Directory mismatch.

**Required GitHub secrets:**

- `VERCEL_TOKEN` — Personal token, Full Account scope, no expiration.
- `VERCEL_ORG_ID` — Hobby plan: personal Account ID (from Vercel →
  Account Settings → General → "Your ID"), not a team ID.
- `VERCEL_PROJECT_ID` — Project ID for `creator-companion-onti`
  (Project Settings → General, starts with `prj_`).
- `RAILWAY_TOKEN` — Used by Railway's GitHub integration; not
  directly invoked by the workflow but kept here for reference.

The `VERCEL_DEPLOY_HOOK` secret still exists but is unused —
deploy hooks proved unreliable. Safe to delete after Q3 2026 if
no further hook-based fallback is needed.

**Things NOT to do (would re-break the chain):**

- Don't reintroduce the Vercel deploy hook as the primary deploy
  mechanism. It's a less-reliable trigger pipeline than CLI deploy.
- Don't `cd web/creator-companion-web` before running `vercel`
  CLI commands in CI — the project's Root Directory setting will
  double-resolve and the build will fail with "path does not exist."
- Don't use bare regex patterns like `.*` in `vercel.json` `source`
  fields outside a named group — Vercel CLI's local validator
  rejects them even though Vercel's server-side build accepts them.
  Use `:name(regex)` or `:name*` path-to-regexp v6 syntax.
- Don't write EF migrations that DropIndex without `IF EXISTS` or
  CreateIndex without `IF NOT EXISTS` against indexes that may not
  exist in production. Wrap in raw `migrationBuilder.Sql(…)` with
  the guards.
- Don't add packages or commands to the API Dockerfile that aren't
  in the .NET 10 ASP.NET slim base image (no `adduser`, etc.). Use
  numeric `USER <uid>` directives instead — Linux doesn't require
  a passwd entry.

## Commit conventions

- Only commit when the user **explicitly asks** ("deploy", "commit",
  "push"). Never auto-commit after editing.
- Commit messages explain *why* in 1–2 sentences. Use HEREDOC for
  multi-line. Sign with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- **Never `--no-verify`** unless the user explicitly says so.
- **Never amend.** Always new commits.
- **Don't push to remote** unless asked.

## Gotchas (real ones we've hit)

- **Service worker** (`public/sw.js`) intercepts only navigation
  requests. JS bundles are NOT cached by SW — but Cloudflare can
  cache `index.html`. Hard reload (Cmd+Shift+R) when changes don't
  show.
- **Push notification icon paths** must match exactly: filenames are
  `icon-192x192.png` etc., NOT `icon-192.png`. Earlier mismatch made
  notifications icon-less.
- **Reminder worker drift:** `process + Task.Delay(60s)` loop drifts
  past minute boundaries. Use time-passed match, not exact-minute.
- **Native macOS notification icon position** can't be controlled
  from web push — install as PWA to get app-icon-on-left rendering.
- **Component style budgets** in `angular.json` are 12kB. Heavy
  components (dashboard, edit-entry) exceed this; warnings only,
  not errors. Don't bloat them further unless necessary.
- **localStorage persists across logout/login.** It's per-origin, not
  per-session, not per-user. Any UI preference stored there (e.g.,
  the legacy `cc_today_collapsed` mobile-today-panel state) survives
  logout, login as a different user, browser quit, everything.
  For per-session UI state, keep it in-memory only. For genuine
  cross-session preference, persist server-side. Removed
  `cc_today_collapsed` May 2026 — cleanup `removeItem` runs in
  `DashboardComponent.ngOnInit` so existing browsers get reset.
- **Backticks inside CSS comments inside `styles: [\`...\`]`** break
  the Angular template-literal parser ("Failed to resolve styles at
  position 0"). Don't quote class/property names with backticks in
  inline styles. Use plain text or single quotes.
- **`api.creatorcompanionapp.com` SSL cert is broken on Railway** —
  the custom hostname serves the default `*.up.railway.app` cert
  instead of `*.creatorcompanionapp.com`, so any browser hitting it
  fails the TLS handshake. NEVER call this hostname from a browser
  fetch — the request will fail with no usable error before any
  HTTP layer responds (Network tab shows "(failed) preflight" +
  "(failed) fetch" with 0 bytes). Both vercel.json files (app and
  marketing) carry a `/v1/* → creator-companion-api-production.up.railway.app/v1/*`
  rewrite so browser code can use a same-origin `/v1` path
  exclusively. **If you add a new HTML page that calls the API, use
  `/v1/...` not `https://api.creatorcompanionapp.com/v1/...`.**
  The custom-hostname SSL should still get fixed on Railway
  eventually (it's a 5-min dashboard task — re-issue the cert for
  the custom domain) but the proxy means we're not blocked on it.

## Mobile touch UX patterns (iOS Safari)

Hard-won rules from iPhone PWA testing. Apply to every new
interactive surface on mobile — these aren't optional polish.

- **Gate `:hover` to pointer-fine devices.** Wrap any `:hover` rule
  on a tappable element in `@media (hover: hover) and (pointer: fine)
  { ... }`. iOS Safari treats first-tap as hover and second-tap as
  click on elements that have both `:hover` AND a click handler —
  producing the "first tap only highlights, second tap activates"
  two-step. Affected: `mobile-header__compose`, `todo-list__item`,
  `todo-list__items--done .todo-list__item`, every BTN with a hover
  variant.
- **Don't put `cursor: text` on clickable elements.** iOS reads
  `cursor: text` as a hint that the element is text content and
  shows a text cursor on first tap before recognizing it as a click
  target. Use `cursor: pointer` (or `inherit` from a pointer parent)
  for clickable surfaces, even text-containing ones. This was the
  root cause of the to-do row's "first tap does nothing" bug.
- **Put `touch-action: manipulation` on the WHOLE tap surface.**
  Not the inner span. On a small inner element, iOS still runs
  gesture disambiguation on taps landing in the surrounding padding.
  `touch-action: manipulation` disables the 300ms tap delay AND
  prevents the second tap being read as smart-zoom — but only for
  the area it actually covers.
- **Add `-webkit-tap-highlight-color: transparent`** on tap targets.
  Suppresses the iOS gray tap flash users mistake for "highlighted
  but nothing happened." Pairs naturally with the hover-gate fix.
- **Add `-webkit-touch-callout: none`** on text-containing tap
  targets to prevent the iOS long-press magnifier from popping up
  and interrupting taps that hold a fraction too long.
- **Avoid `will-change: transform` on elements containing
  focusable inputs.** Creates a compositor layer where iOS's
  focus/viewport-zoom heuristics misbehave — textareas auto-zoom
  on focus even with explicit `font-size: 16px`. Remove unless
  actively animating; transitions don't need it for short single-
  row movements. (The to-do row had this and it was triggering the
  zoom-then-stuck-viewport symptom even after the 16px fix.)
- **Explicit `font-size: 16px` on inputs/textareas (not `1rem`).**
  styles.scss has a global `@media (max-width: 767px)` rule
  enforcing 16px on every input/textarea, but stating it locally on
  the surfaces where iOS auto-zoom matters most (entry textareas,
  to-do edit, add-tag input, etc.) is defense-in-depth — protects
  against a future global-rule refactor silently reintroducing the
  zoom and keeps the iOS-zoom intent obvious at the call site.
- **Don't stack touch handlers + gesture libraries on the same
  element** if you also want fast clicks. Custom touchstart/
  touchmove/touchend handlers AND cdkDrag on the same `<li>` made
  iOS wait to disambiguate "tap vs. start-of-gesture" before
  firing click, costing the first-tap response. The to-do swipe-
  to-delete was removed in May 2026 for this reason; replaced with
  an always-visible × button. If a gesture is genuinely needed,
  put it on a dedicated handle child element, not the click target.

When debugging a mobile UX issue that doesn't reproduce on desktop,
run through this list before assuming it's a browser bug.

## Typography standard

One body-copy rule across the app. Don't deviate without a reason.

- **Body copy** (descriptive paragraphs, sub-text inside cards):
  `font-size: 1rem` (16px), `line-height: 1.6`,
  `color: var(--color-text)`, `font-family: var(--font-sans)`.
- **Entry body** (long-form reading): `font-size: 1.0625rem` (17px),
  `line-height: 1.75`, same color + family.
- **Featured quote** (Daily Spark takeaway, Daily Prompt question,
  hero-card headlines): `font-size: 1.25rem`, `font-weight: 600`,
  `letter-spacing: -.01em`, same color + family. Deliberate
  hierarchy — quotes should read as larger than body.
- **Eyebrows / labels**: caps `font-size: .8125rem` (13px),
  `letter-spacing: .12em`, `font-weight: 700`, accent color.

`var(--color-text-2)` and `var(--color-text-3)` are for genuinely
tertiary microcopy only — timestamps, entry-counts, drag handles,
metadata. NOT for body paragraphs. If you find yourself reaching
for grey text on a paragraph, use `--color-text` and let visual
hierarchy come from size + weight instead.

When you add a new card or section, lift these values from this
section rather than inventing fresh ones. If you genuinely need a
different size, add a comment explaining why.

## Spacing standard (gutters)

App-wide horizontal gutter on standalone pages:
- **Mobile** (`< 768px`): `1.5rem` (24px) inside the inner content
  wrapper (`.body-inner`, `.support-wrap`, `.entry-card`, `.today`,
  `.main-content` if it carries padding).
- **Desktop** (`>= 768px`): `2.5rem` for column-3 / wide reading
  surfaces (`.body-inner`); `2rem` for the entry-card; `3rem` for
  full-width admin/account `.main-content`. Pick what fits the
  surface, not a fresh number.
- **Vertical**: pages set `padding-top: 0` and let the first child
  (page header, eyebrow, hero card) own the breathing room from
  the sticky mobile-header. Bottom padding includes
  `env(safe-area-inset-bottom)` on mobile to clear the home
  indicator.

Don't reach for `1.125rem` or `1rem` horizontal on mobile — those
were one-off mistakes; they always read as cramped next to the
1.5rem standard everywhere else.

## Mobile + desktop parity (default assumption)

Layout / UX changes apply to **both** breakpoints unless the user
explicitly says otherwise. When touching a feature on one surface,
audit the matching surface for parity in the same change. Common
gotchas where this has slipped:

- **Embedded vs. standalone.** The dashboard renders some features
  in its right column on desktop (`entry-reader.component.ts`,
  `notifications.component.ts` with `embedded=true`, etc.) and the
  same features have standalone routes on mobile (`view-entry`,
  `/notifications`, `/todos`, `/favorites`, `/streak-history`).
  When a UI decision lands in the embedded variant, propagate to
  the standalone route — and vice versa.
- **Dual-rendered Daily Spark (the worst offender).** The Daily
  Spark has TWO collapse/expand states in two different components:
  `sparkExpanded` in `today-panel.component.ts` (desktop hero) and
  `todayCollapsed` in `dashboard.component.ts` (mobile-only wrapper
  around the whole today-panel). Plus a now-hidden third
  `motivationExpanded` in `dashboard.component.ts` (`.motivation-
  card--mobile`, display:none everywhere). When a Daily-Spark bug
  is reported "on mobile", grep both components — fixing the wrong
  one is the easy mistake. The pattern generalises: any feature
  that has been "moved into the Today panel" still has an old
  mobile-only implementation hanging around. Search broadly.
- **Button placement.** Save / Edit / Delete moved to the bottom
  of forms is a project convention; verify both the embedded
  reader/editor AND the standalone page reflect it.
- **Background colors, fonts, spacing.** When changing one,
  inspect the matching surface for consistency.

If the user asks to change something on "desktop" without saying
"only desktop", ask if they want it on mobile too — don't assume
desktop-only.

## Things to never do

1. Reintroduce entry-based gating in reminders.
2. Write a destructive EF migration.
3. Auto-commit without explicit user instruction.
4. Use `--no-verify` or `--no-gpg-sign` to bypass hooks.
5. Replace the brand cyan `#12C4E3` with a darker teal.
6. Replace the live Fraunces wordmark with a PNG raster.
7. Reintroduce swipe-to-delete (or any custom horizontal-touch
   gesture) on a row that's ALSO the click-to-edit target. The
   gesture-vs-tap disambiguation costs iOS the first-tap response
   and confuses every user. The to-do list went through this
   loop in May 2026; resolved by removing the gesture in favour
   of a visible × button. If you need both, put the gesture on a
   dedicated handle child element, never the row body.
8. Persist transient UI state (collapse/expand, panel-open,
   "did I scroll past this?") to localStorage scoped by origin
   alone. It survives logout/login and confuses users when they
   "reset" and the state persists. In-memory by default; only
   persist with a per-user-id key AND a clear reset path. See
   the `cc_today_collapsed` removal in May 2026.
7. Mass-rename routes/files without explicit instruction (URL bookmarks).

## Security posture (current state)

Snapshot of what's enforced server-side as of the May 2026 audit pass.
Re-read this before changing auth, billing, or storage paths.

**For the audit-grade inventory** (every control, every code path,
every deliberately-accepted-as-is decision, plus monitoring cadence)
see [`docs/security-posture.md`](docs/security-posture.md). Updated
2026-05-25 after the second defensive review pass. The bullets below
are the must-know operational rules; the doc is the long-form reference.

- **JWT access token** in memory only, ~60min TTL, `ClockSkew=0`.
- **Refresh token** in HttpOnly Secure SameSite=None cookie ONLY —
  never returned to JS, never stored in localStorage, never accepted
  from the request body. SHA-256 hashed at rest; legacy plain rows
  honored during the 30-day rotation window then a follow-up
  migration drops the plain `Token` column.
- **Password hashing** BCrypt work factor 12 (OWASP 2024+). Legacy
  factor-10 hashes are rehashed transparently on next successful login.
- **Per-account login lockout** — 10 failures / 15 minutes, persisted
  on `User.FailedLoginCount` + `User.LockedUntil`. Survives redeploys
  and applies globally across replicas. Locked-out path runs dummy
  BCrypt to match wrong-password timing. Lockout response copy is the
  same as "Invalid credentials" so attackers can't probe membership.
- **Forgot-password** uses the same dummy-work pattern; unknown-email
  path's latency tracks the registered-email path.
- **Password reset / email verification tokens** SHA-256 hashed at
  rest with partial unique indexes (`TokenHash` IS NOT NULL).
- **Stripe webhooks** idempotent via `ProcessedStripeEvents` table
  (Stripe event id PK). InvoicePaymentFailed does NOT downgrade; final
  cancellation comes via `customer.subscription.updated` / `.deleted`.
  Checkout completion cross-checks `customer.email == user.email`.
- **CORS production** locked to the configured `Cors:AllowedOrigins`
  allowlist; loose localhost/LAN match only in Development.
- **ImageSharp** 3.1.10 (high-sev CVE closed) + 50MP decompression-
  bomb guard via `Image.IdentifyAsync` before `LoadAsync`.
- **HtmlSanitizer** locked to an explicit tag/attribute/URL-scheme
  allowlist. Inline `style` and non-http(s)/mailto schemes blocked.
- **Trash purge** — soft-deleted entries hard-delete after 48h via
  `ReminderBackgroundService` calling `IEntryService.PurgeExpiredTrashAsync`.
  Entry HardDelete, self-account-delete, and admin-delete-user all
  clean orphaned R2 media.
- **Admin actions** audit-logged via `IAuditService` (promote/demote,
  tier change, activate/deactivate, password reset, delete user,
  pause cancel/clear). SetActive(false) immediately revokes that
  user's refresh tokens.
- **Service worker** is push-only (no fetch interception, no cache)
  — the earlier kill-switch traced the iOS slow-launch to WebKit
  standalone startup, not the SW, but we deliberately keep the SW
  minimal pending more evidence.

## Observability (Sentry)

Error tracking + performance traces on both sides. SDK is no-op when
DSN is unset, so missing env vars are graceful, not catastrophic.

- **Backend**: `Sentry.AspNetCore` package, wired in `Program.cs` via
  `builder.WebHost.UseSentry(...)`. Reads `Sentry:Dsn` from config.
  `TracesSampleRate = 0.1` (10% of requests get perf traces — keeps
  free tier alive). `SendDefaultPii = false`. Release tagged with
  `RAILWAY_GIT_COMMIT_SHA` if set.
- **Frontend**: `@sentry/angular` package, init in `main.ts` BEFORE
  `bootstrapApplication`. `ErrorHandler` + `TraceService` providers
  in `app.config.ts`. DSN injected at deploy time by
  `scripts/inject-version.mjs` swapping the `__SENTRY_DSN__` sentinel
  in the bundled `environment.production.ts`.
- **Background worker capture**: `ReminderBackgroundService`,
  `SubstackPostingBackgroundService`, and `ContentEncryptionMigrator`
  all forward outer-catch exceptions to `Sentry.SentrySdk.
  CaptureException(ex)` alongside `logger.LogError`. Don't strip these
  — silent worker failures in Railway logs were a real problem before.
- **Source maps**: `angular.json` sets `sourceMap.hidden = true`, so
  `.map` files are emitted alongside `.js` bundles but NOT linked via
  `sourceMappingURL` (browsers don't fetch them). The deploy workflow
  uploads them to Sentry via `@sentry/cli`, then DELETES them from
  `.vercel/output/static` before deploy. Defense in depth — without
  the delete, a determined attacker could pattern-match
  `/main-XXX.js.map` and reach source.

### Privacy posture (CRITICAL — don't loosen)

A journaling app where entry content IS the product means user-written
text MUST NEVER appear in third-party error tracker payloads. Both
SDKs scrub before sending:

- **Backend `BeforeSend`** in `Program.cs`: strips `Authorization` +
  `Cookie` headers from every event. Replaces request body with
  `[scrubbed]` when the URL matches `ContainsSensitiveRoute` —
  currently: `/v1/entries`, `/v1/drafts`, `/v1/journals`, `/v1/auth/`,
  `/v1/users/me`, `/v1/admin/email-templates`. **Add to that list
  whenever new content-bearing endpoints land.**
- **Frontend `beforeBreadcrumb`** in `main.ts`: same URL pattern;
  drops `body` from XHR/fetch breadcrumbs. `beforeSend` strips auth
  headers as a belt-and-suspenders measure.
- **Session Replay is OFF and stays OFF.** Sentry's Session Replay
  records the user's DOM, which on a journaling app means recording
  their writing in real time. If you ever turn this on, it MUST be
  paired with `maskAllText: true` and `blockAllMedia: true` — and
  even then think hard.
- **`SendDefaultPii = false` on both sides.** User context, if set,
  uses the user ID GUID only — never email, name, or IP.

### Required env vars (set out-of-band, not in the repo)

- **Railway** (backend): `Sentry__Dsn` = backend project DSN.
  Format: `https://<key>@<org>.ingest.sentry.io/<project>`.
- **Vercel** (frontend project): `SENTRY_DSN` = frontend project DSN.
  Production scope. `vercel pull` makes it available to
  `inject-version.mjs` at deploy time.
- **GitHub repo secrets** (for source map upload from CI):
  - `SENTRY_AUTH_TOKEN` — org-scope token with `project:read` +
    `project:releases` scopes
  - `SENTRY_ORG` — org slug
  - `SENTRY_PROJECT_WEB` — Angular project slug

If any of those three GitHub secrets is missing, the source-map upload
step skips silently and the workflow keeps deploying. Frontend
without a `SENTRY_DSN` ships with the SDK no-op'd. Backend without
`Sentry__Dsn` does the same.

## Known deferred items (won't-fix with reasoning)

Items the May 2026 audit pass flagged but didn't fix, with rationale.
Document here so future audits don't re-spend the cycles deciding.

- **Distributed rate-limit counters (Phase 3, deferred 2026-05-26)** —
  `AspNetCoreRateLimit`'s `MemoryCacheRateLimitCounterStore` is
  per-process and lost on restart. The 2026-05-25 audit flagged this
  as Risk #5 and proposed Redis-backed distributed counters. Deferred
  after the Turnstile rollout (`de87f3e`) made the IP rate limit
  layer 4 of a four-layer defense — layers 1–3 (Turnstile, per-account
  DB-backed lockout, BCrypt-12) carry the real load against credential
  stuffing, so the in-memory limitation is "casual probing slowdown
  occasionally resets" rather than "primary defense fails open." Full
  reasoning in `docs/security-posture.md` §13.1. Revisit if Sentry
  shows distributed credential-stuffing evading Turnstile, or if we
  ever scale the API horizontally on Railway.
- **ForwardedHeaders `KnownNetworks` allow-list** — Audit recommended
  populating with Railway's proxy IP ranges. Railway uses dynamic
  proxy IPs and doesn't publish them, so the only working alternative
  would be an HTTP-level IP filter at Railway's edge — which doesn't
  exist as a feature. The current `ForwardLimit=1` + trust-one-hop is
  the right posture for a managed platform.
- **Refresh-token family-based reuse detection** — Audit recommended
  per-family revoke-on-reuse. The current atomic rotation
  (ExecuteUpdate WHERE RevokedAt IS NULL) prevents the replay
  scenario; family detection would add a column, a state machine, and
  notification logic for an attack profile we don't see in practice.
  If we ever ship a refresh-token-stolen incident, revisit.
- **Web app `vercel.json` HSTS/X-Frame-Options/Referrer-Policy** —
  Audit recommended adding these. The proper fix is nonce-based CSP
  (Angular's inline runtime currently needs `'unsafe-inline'` which
  neuters the existing CSP). Doing the nonce refactor properly is real
  work; the marketing site is the higher-exposure surface and already
  has the full header set via `marketing/vercel.json`.
- **Storage-upload-before-DB-row orphan-on-failure** — Audit noted
  that MediaService writes to R2 before the `EntryMedia` row commits,
  so a failed SaveChanges leaks the blob. The right answer is a
  periodic R2 reconciliation job that deletes objects with no matching
  EntryMedia row; that's bigger infra work, and the cost is bounded
  by storage pricing not security.
- **Tests use InMemoryDatabase** — CLAUDE.md feedback says no DB
  mocking, but Testcontainers-Postgres migration touches the whole
  test suite (existing InMemory tests would need fixture rewrites).
  Postgres-only operations (advisory locks, ExecuteUpdate, isolation
  levels) are gated on `IsRelational()` / `ProviderName "Npgsql"` in
  the production code so tests don't fail spuriously; the
  concurrency/race coverage that needs a real Postgres is documented
  as a Postgres-required follow-up in `SecurityHardeningTests.cs`'s
  header comment. Migrate the fixture when next touching the test
  infra.
- **Legacy "Free-tier limits" tests** — Seven tests in
  EntitlementServiceTests / EntryServiceTests assert that `Tier=Free`
  users get a 100-word cap, 1-journal cap, no-backfill, etc. That
  behavior was removed in the trial-only refactor: an in-trial Free
  user gets PaidLimits via `EnforceAccess`; a post-trial user gets
  blocked entirely. Tests are marked `[Fact(Skip = "...")]` with
  rationale rather than deleted; rewrite to assert post-trial
  NoAccessException + verify in-trial limit shape.
- **Drop legacy plain `Token` columns** — Time-based deferred. Wait
  30 days post-deploy of the at-rest-hash rollout (May 2026 → June
  2026) for refresh tokens to age out, then a follow-up migration
  drops `Token` columns from `RefreshTokens`, `PasswordResetTokens`,
  `EmailVerificationTokens` and removes the legacy-fallback lookups
  in `AuthService.RefreshAsync` / `VerifyEmailAsync` /
  `ResetPasswordAsync`.
- **ImageSharp 4.x major bump** — Closes the remaining moderate CVE
  (GHSA-rxmq-m78w-7wmc). 4.x has breaking API changes; scope as a
  separate focused PR, not bundled with the audit pass.
- **Refresh-token cap reduced from 5 to 3** — Lower cap would surface
  multi-device token theft sooner. Five is fine for most users
  (mobile + desktop + tablet); not worth shaking up here.
- **`logout()` race window with the publicGuard auto-restore** —
  `cc_just_logged_out` sessionStorage flag handles this for one page
  load; a quick browser-back inside that window restores the session.
  Acceptable.
- **Various design polish items**: column-3 eyebrow size (.6875rem
  vs CLAUDE.md's documented .8125rem — the .6875rem is the
  consistent reality across the codebase, CLAUDE.md is stale on this
  specific number); embedded-vs-standalone reader typography
  hierarchy (embedded uses 1rem/1.5, standalone uses 1.0625rem/1.75 —
  consolidating is bigger UI work); admin status pills using Tailwind
  palette instead of brand tokens (admin-only surface, low priority).

## TODO / open questions

- **Backups & rollback (REVISIT SOON — committed 2026-05-30).** Release
  rollback works today (git revert + push, or Vercel Instant Rollback);
  **DB backups are a known gap** — Railway has no configured backups and
  R2 versioning is off, so the only irreplaceable data (Postgres entries,
  R2 media) is currently unprotected. The `Entry__EncryptionKey` is a
  catastrophic single point of failure (a DB backup is unreadable without
  it). Full plan, runbook, restore caveats, and the verified per-platform
  retention table live in [`docs/backups-and-rollback.md`](docs/backups-and-rollback.md).
  Priority: (1) secure the encryption key + secrets offline, (2) stand up
  DB backups (offsite `pg_dump`→R2 recommended), (3) write + TEST a
  restore, (4) R2 versioning. Confirm Railway + Sentry plan tiers.
- **Staging environment (REVISIT — future, after backups).** Mirrored,
  isolated env (own DB + own encryption key + synthetic data; Stripe TEST,
  test-mode third-party, Marketing poster inert) for testing features
  before they reach users. Full design in
  [`docs/staging-environment.md`](docs/staging-environment.md). Sequence
  after backups so a sanitized restore can feed staging's data.
- **Encryption at rest.** Railway Postgres is encrypted at rest per
  their docs; R2 buckets are encrypted at rest per Cloudflare's docs.
  Tokens (refresh / reset / verify) are SHA-256-hashed at rest as of
  the May 2026 pass. Still to verify: backup encryption posture,
  whether column-level encryption is needed for PII beyond passwords.
- **Drop legacy plain Token columns.** After 30 days post-deploy of
  the at-rest-hash rollout (May 2026 + 30d), drop `Token` columns
  from `RefreshTokens`, `PasswordResetTokens`,
  `EmailVerificationTokens` and remove the legacy-fallback lookups
  in `AuthService.RefreshAsync` / `VerifyEmailAsync` /
  `ResetPasswordAsync`.
- **Email verification gating.** Currently the 10-day trial is
  issued at registration regardless of email verification. Policy
  decision: require verified email before granting trial / before
  allowing writes?
- **Multi-platform daily-spark posting — BUILT (May 2026).** Shipped
  as the Marketing auto-poster (Bluesky + Mastodon v1). See the
  "Marketing auto-poster (built)" section above. The old Substack
  email-reminder pipeline stays as-is, separate, for the no-API
  Substack case. Threads/Twitter are reserved enum members; ship an
  `ISocialPoster` adapter to add them.
- **Mobile search/sort bar — collapse for space.** The dashboard's
  search input + sort `<select>` row eats ~80px of vertical space at
  the top of every entry list view on mobile, pushing the entries
  themselves below the fold. Discussed May 2026; deferred. Four
  options on the table, ordered from least to most invasive:
  1. **Just smaller** — media query that shrinks padding + font on
     mobile. ~30% space saved. Zero UX shift, smallest impact.
  2. **Hide sort, keep search** — search input stays prominent;
     sort moves behind a small filter-icon menu at the end of the
     search bar. Sort is the less-used action; this prioritises
     search. ~30% space saved.
  3. **Compact icons, expand on tap** *(recommended pick)* — default
     shows only two small icons (search 🔍 + sort ↕). Tap search →
     expands inline to full input. Tap sort → opens an action sheet
     with the three options (Newest / Oldest / ★ Favorites). ~50%
     space saved. Standard mobile pattern (Gmail, X, Slack).
  4. **Single "Filter" button → bottom sheet** — entire row becomes
     one chip; tap opens a drawer with both controls inside. Most
     space saved (~55%) but every search becomes 3 taps instead of
     1. Heaviest UX cost.

  Code location: `dashboard.component.ts` around line 208 (`.search-
  bar`); CSS at line 896. Targeting mobile breakpoint (< 768px). When
  picking up, confirm choice with user before implementing — none of
  the options is obviously right and the trade-offs matter.

## How to update this file

Tell me "add X to CLAUDE.md" and I'll edit it. Or edit directly.
Keep additions terse — bullet form, ≤2 lines per item. If a section
grows past ~30 lines, link out to a `docs/` file instead.
