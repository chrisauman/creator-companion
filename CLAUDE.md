# Creator Companion — Project Briefing

Auto-loaded by Claude Code every session. Keep lean — every token costs context.
Update when decisions land. Don't put transient state here.

---

## What this is

This app is your digital creator companion. It will give you the daily support,reminders, motivation, inspiration, advice, organization, encouragement that you need to maintain a daily, creative practice indefinitely. 


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
- **Preferences** — toggle Daily Spark, toggle reminders globally, etc.
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
- **Vercel** — *(role to confirm — see TODO at bottom of this file)*
- **Cloudflare R2** — object storage for user media (avatars, future
  attachments). S3-compatible API.
- **Resend** — transactional email.
- **Stripe** — payments.

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
- **Single paid plan**: $5/month or $50/year (Stripe).
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

## Profile model

- **FirstName + LastName.** Username was removed — historical refactor.
- **Profile picture** uploaded to R2, compressed via ImageSharp.
- **TimeZoneId** captured at registration via
  `Intl.DateTimeFormat().resolvedOptions().timeZone`. Default for
  legacy accounts: `"UTC"` (means a 9am reminder fires at 9am UTC for
  them — surface this if reminder timing seems wrong).

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
- **Frontend deploy:** *(host TBC — likely Vercel)*, auto-deploy on push to `main`.
- **Backend deploy:** Railway, auto-deploy on push to `main`.
- **Marketing deploy:** *(host TBC — likely Vercel)*, auto-deploy on push to `main`.
- **Always build locally before committing** — don't push uncompiled.

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
7. Mass-rename routes/files without explicit instruction (URL bookmarks).

## TODO / open questions

- **Vercel's exact role.** Confirm whether Vercel hosts the frontend
  PWA, the marketing site, both, or something else. Update the
  Infrastructure and Build & deploy sections accordingly, then remove
  this TODO.
- **Pricing model decision.** Considering moving from "free + paid"
  to "10-day free trial → single paid plan (monthly or yearly)."
  Affects: signup flow, paywall placement, tier-gated features
  (currently very few — `IsPaid` claim, custom-reminder cap), trial
  countdown UI, expiration handling, billing copy on the marketing
  site. When committed, document the new flow here and remove this.
- **Encryption verification.** User notes: "all data is encrypted —
  need to check on this again." Audit at-rest encryption (Postgres
  on Railway, R2 buckets) and in-transit (HTTPS everywhere). Document
  what *is* encrypted and what isn't, plus any remaining gaps.

## How to update this file

Tell me "add X to CLAUDE.md" and I'll edit it. Or edit directly.
Keep additions terse — bullet form, ≤2 lines per item. If a section
grows past ~30 lines, link out to a `docs/` file instead.
