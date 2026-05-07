# Creator Companion — End-to-End Testing & Deploy Checklist

> **Living document.** Update when features land or change. Single source of truth for QA + deploy.
> Last refreshed: 2026-05-07 (post trial-model + admin-shell + favorites-unification work).

## When to use this

- **Before any deploy that touches multiple features** — full pass.
- **After a major refactor** — full pass, especially the affected areas.
- **Spot-checking** — jump to the relevant section when you've changed just one feature.
- **After Railway / Vercel / Stripe / Resend config changes** — at minimum, run Pre-Deploy + Post-Deploy + Smoke Test sections.

## Legend

| Tag | Meaning |
|---|---|
| `[ANY]` | Run as any logged-in user — outcome the same regardless of trial state |
| `[TRIAL]` | Test with a user inside the 10-day trial window |
| `[SUBSCRIBED]` | Test with a user with an active Stripe subscription |
| `[LOCKED]` | Test with a trial-expired user, no active sub — should hit paywall |
| `[ADMIN]` | Test as an account with `IsAdmin = true` |
| `[GUEST]` | Test logged out |

---

# Pre-Test Setup

## Test accounts to maintain

| Browser | Account | State |
|---|---|---|
| **A** | `chris+trial@…` | Within 10-day trial. Set `TrialEndsAt` to ~5 days out for tests. |
| **B** | `chris+sub@…` | Active Stripe subscription. Use the Customer Portal to manage. |
| **C** (incognito) | `chris+expired@…` | Past trial, no sub. Set `TrialEndsAt` in the past, no `StripeSubscriptionId`. |
| **D** (incognito) | `chris+admin@…` | `IsAdmin = true`. Active subscription so admin nav is uncluttered. |

For trial expiration testing: directly update `User.TrialEndsAt` in the staging DB to flip a user between trial-active and trial-expired without waiting 10 days.

## Tools to have open

- [ ] Stripe Dashboard in **Test mode** (`https://dashboard.stripe.com/test/...`)
- [ ] Railway logs in a tab (filter to `ReminderBackgroundService` for reminder testing)
- [ ] Sentry / error monitor (when wired up)
- [ ] DevTools open in each browser — Console, Network, Application tabs visible
- [ ] Resend dashboard if testing email delivery
- [ ] A real phone or second device for push + PWA testing

## Stripe test cards

| Card | Behavior |
|---|---|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0002` | Card declined immediately |
| `4000 0000 0000 0341` | Succeeds initially, fails on subsequent renewal |
| `4000 0025 0000 3155` | Requires 3D Secure authentication |
| `4000 0000 0000 9995` | Insufficient funds |

## Database state utilities

Common manual DB tweaks for testing:

| Field | Purpose |
|---|---|
| `User.TrialEndsAt = now() - 1 day` | Force trial expiration |
| `User.TrialEndsAt = now() + 9 days` | Reset to fresh trial |
| `User.StripeSubscriptionId = NULL` | Simulate no subscription |
| `User.StreakThreatenedNotifiedFor = NULL` | Re-arm threatened push |
| `Reminder.LastSentAt = NULL` | Re-arm a reminder for re-testing same day |
| `Entry.IsFavorited = true, FavoritedAt = now() - 1 hour` | Force into Favorites view |
| `Entry.DeletedAt = now() - 49 hours` | Test trash auto-purge |

## Build / deploy preflight

- [ ] Working tree is clean — `git status` empty
- [ ] On `main`, up to date with `origin/main`
- [ ] Backend builds: `cd api && dotnet build CreatorCompanion.Api/CreatorCompanion.Api.csproj` → 0 errors
- [ ] Frontend builds: `cd web/creator-companion-web && npx ng build --configuration=production` → 0 errors
- [ ] Migrations run cleanly on staging copy of prod DB
- [ ] Stripe keys are NOT swapped (test on staging, live on prod) — visible in env vars
- [ ] VAPID keys match between client (`getVapidPublicKey` endpoint output) and server (env)
- [ ] Resend domain verified — no "Domain not verified" warning

---

# PART 1 — Registration & Trial Onboarding

## 1.1 Form validation [ANY]

Go to `/register`.

- [ ] Page loads. **Single plan** displayed (no Free/Paid choice — trial-only signup).
- [ ] Submit empty form → validation error on every required field.
- [ ] First name < 1 char → blocked.
- [ ] Last name < 1 char → blocked.
- [ ] Invalid email format (no `@`, no domain) → blocked.
- [ ] Password < 8 chars → blocked.
- [ ] Duplicate email (already registered) → server error shown clearly, not a generic "Something went wrong."
- [ ] Network drop mid-submit → graceful error, button re-enables, no double-submit.

## 1.2 Successful trial signup [TRIAL]

- [ ] Submit valid form → account created.
- [ ] Backend: `User.TrialEndsAt = CreatedAt + 10 days`. Verify in DB.
- [ ] Backend: `User.StripeSubscriptionId IS NULL`. Stripe NOT touched at signup.
- [ ] Welcome email arrives. Subject correct, body renders, no `{firstName}` literal.
- [ ] Sender domain: `@creatorcompanionapp.com` (once Resend domain verified).
- [ ] Email does not land in spam (Gmail and Apple Mail).
- [ ] Redirected to `/onboarding` (not dashboard).

## 1.3 Onboarding flow [TRIAL]

- [ ] Step 1 loads — intro text, Continue button works.
- [ ] Step 2 — streak mechanics; Continue and Skip both work.
- [ ] Step 3 — privacy / encryption assurance; Continue and Skip both work.
- [ ] Step 4 — push notification prompt.
  - [ ] Click Enable → browser permission dialog.
  - [ ] Grant → success state, subscription registered (verify `PushSubscription` row in DB).
  - [ ] Skip → moves on without enabling.
  - [ ] Previously-denied permission → "blocked in browser settings" message (not a crash).
  - [ ] Browser without push support (older Safari) → graceful "not supported" message.
- [ ] Step 5 — "Ready to write?" CTA.
- [ ] Click "Write my first entry" → navigated to `/entry/new`, `OnboardingCompleted = true` in DB.
- [ ] Revisit `/onboarding` after completion → redirected to dashboard (already done).

## 1.4 First-run feature tour *(when implemented)*

- [ ] Lands on dashboard for the first time → tour overlay appears.
- [ ] Step 1 highlights sidebar logo / collapse.
- [ ] Step 2 highlights New Entry button.
- [ ] Step 3 highlights streak widget.
- [ ] Step 4 highlights Reminders nav.
- [ ] Step 5 — done.
- [ ] Skip works at any step.
- [ ] `cc_tour_seen` localStorage flag prevents re-showing.
- [ ] Account page has "Show tour again" link that re-triggers it.
- [ ] Mobile rendering — overlays work without horizontal scroll, tooltips fit on screen.

## 1.5 Already logged in [ANY]

- [ ] `/register` while logged in → redirect away (publicGuard).
- [ ] `/login` while logged in → redirect away.

---

# PART 2 — Login, Session, Password Reset

## 2.1 Login [ANY]

- [ ] Empty form → validation errors.
- [ ] Wrong password → error shown, **does not** reveal whether email exists.
- [ ] Wrong email entirely → same error, does not reveal email is unregistered.
- [ ] Correct credentials → redirected to `/dashboard`.
- [ ] Email is case-insensitive on login (e.g. `Chris@…` works).

## 2.2 Session persistence [ANY]

- [ ] Log in, close tab, reopen app URL → still logged in.
- [ ] Hard refresh → still logged in.
- [ ] Two browsers simultaneously → both work independently.
- [ ] Log out on one browser → other browser still logged in.
- [ ] Wait past access-token expiration (~15 min) → next API call triggers refresh, request retries successfully, no UI flash.
- [ ] Refresh token expired (clear `cc_refresh` cookie manually) → next 401 from API → silent logout, redirected to `/login`.

## 2.3 Logout [ANY]

- [ ] Log out → redirected to `/login`.
- [ ] Press Back button → cannot reach a protected page.
- [ ] Direct nav to `/dashboard` after logout → redirected to `/login`.
- [ ] Refresh token revoked server-side (verify `RefreshTokens` row deleted or marked revoked).

## 2.4 Forgot / reset password [ANY]

- [ ] `/forgot-password` empty email → validation error.
- [ ] Non-existent email → generic success, **does not** confirm email is unregistered.
- [ ] Real email → reset email arrives.
- [ ] Reset link → lands on `/reset-password` with token populated.
- [ ] New password < 8 chars → validation error.
- [ ] Submit valid new password → success.
- [ ] Old password → fails on subsequent login.
- [ ] New password → succeeds.
- [ ] Re-using same reset link → fails (token already used).
- [ ] Fabricated token → fails gracefully.
- [ ] More than ~5 reset requests in 60s → rate-limited (HTTP 429).

## 2.5 Route guards [ANY]

| Origin | Destination | Expected |
|---|---|---|
| Logged out | `/dashboard` | → `/login` |
| Logged out | `/entry/new` | → `/login` |
| Logged out | `/account` | → `/login` |
| Logged out | `/admin` | → `/login` |
| Trial active | `/admin` (non-admin) | → `/dashboard` |
| Subscribed | `/admin` (non-admin) | → `/dashboard` |
| Admin | `/admin` | ✓ Admin overview |
| Trial expired | `/dashboard` | Paywall takeover (read-only nav) |

---

# PART 3 — Trial Expiration & Paywall

This section is **new** with the trial-only model.

## 3.1 Active trial banner [TRIAL]

- [ ] Day 1–5 of trial → unobtrusive trial countdown banner on dashboard ("8 days left in your trial").
- [ ] Day 6–9 → banner becomes more prominent (e.g. brand cyan, slightly larger).
- [ ] Day 10 → final-day urgency state.
- [ ] "Subscribe now" link in banner opens `/billing` or directly Stripe Checkout.

## 3.2 Trial expiration moment [TRIAL → LOCKED]

Set `TrialEndsAt = now() - 1 minute`, refresh.

- [ ] Dashboard replaced with paywall takeover screen.
- [ ] Existing entries are READ-ONLY — user can view them (so they can decide to subscribe with full context).
- [ ] All write APIs return **402 Payment Required**:
  - [ ] `POST /v1/entries` → 402
  - [ ] `PUT /v1/entries/{id}` → 402
  - [ ] `POST /v1/entries/{id}/favorite` → 402
  - [ ] `POST /v1/reminders` (or any custom-create) → 402
  - [ ] `POST /v1/action-items` → 402
  - [ ] `POST /v1/pauses` → 402
- [ ] All read APIs continue to return normal data:
  - [ ] `GET /v1/entries` → 200
  - [ ] `GET /v1/favorites` → 200
  - [ ] `GET /v1/entries/streak` → 200
- [ ] User cannot navigate around the paywall — every protected route swaps to the paywall.
- [ ] Subscribe CTA prominent. Click → Stripe Checkout opens.

## 3.3 Mid-action expiration [TRIAL → LOCKED]

Edge case: user is mid-write when trial expires.

- [ ] User is composing an entry, their trial expires (manually flip `TrialEndsAt`).
- [ ] Click Save → 402 returned, user sees subscribe modal.
- [ ] **Draft is preserved** — they can save it after subscribing.
- [ ] Subscribe → close modal → Save again → succeeds with the draft.

## 3.4 Activation moment [LOCKED → SUBSCRIBED]

- [ ] Locked user clicks Subscribe.
- [ ] Stripe Checkout opens with two options ($5/mo, $50/yr).
- [ ] Complete with `4242 4242 4242 4242` → redirected back to app.
- [ ] Webhook `customer.subscription.created` fires (verify in Stripe dashboard + Railway logs).
- [ ] User entitlement immediately flips — paywall removed, no logout/login required.
- [ ] Confirmation email arrives.
- [ ] All write APIs now return 200/201 again.

---

# PART 4 — Creating Entries [ANY who has access]

The trial / subscribed user has full access; we don't gate features by tier anymore.

## 4.1 Basic creation

- [ ] Navigate to `/entry/new` — composer loads.
- [ ] Empty submit → blocked with helpful error (minimum word count, currently set in `EntryLimitsConfig`).
- [ ] Write 10+ words with a title → entry created, redirected to dashboard.
- [ ] Entry appears in column 2 list with date eyebrow + title + (photo if present).
- [ ] Entry without title → saves with auto-generated title from preview.

## 4.2 Word count

- [ ] Verify the limit (currently 2,500 words per `EntryLimitsConfig`) — write up to it, save succeeds.
- [ ] One word over → save blocked, counter shows error state.
- [ ] Approaching limit (within ~50 words) → counter shifts to warning color.

## 4.3 Rich text

- [ ] Toolbar (Bold / Italic / H2 / H3 / List / Numbered list) is present.
- [ ] Apply each formatting → renders correctly in editor.
- [ ] Save → reload → formatting persists.
- [ ] Cmd+B / Cmd+I keyboard shortcuts work.
- [ ] Pasting from external source — formatting is sanitized (no inline styles, no scripts).

## 4.4 Mood

- [ ] Mood picker shows all 12 options with emojis.
- [ ] Select a mood → saved on entry, visible on view page.
- [ ] Edit entry → change mood → saved.
- [ ] Edit entry → clear mood → saved (mood = null).

## 4.5 Image uploads

- [ ] Upload 1 image → succeeds, thumbnail shown.
- [ ] Upload up to 20 → all succeed.
- [ ] Try 21st → blocked with clear error.
- [ ] >20 MB file → rejected.
- [ ] Unsupported type (`.pdf`, `.gif`) → rejected.
- [ ] Valid types: JPEG, PNG, WEBP, HEIC (iPhone) → all succeed.
- [ ] HEIC: verify it converts/displays correctly in browsers that don't natively render HEIC.
- [ ] Remove image before saving → not uploaded to R2.
- [ ] Network drop mid-upload → entry still saves, user sees "Some images failed to upload" message.
- [ ] Image order on view page matches upload order.

## 4.6 Tags

- [ ] Add up to 20 tags → all save.
- [ ] 21st tag → blocked.
- [ ] Type existing tag → autocomplete suggestion appears.
- [ ] Select autocomplete → no duplicate created.
- [ ] Add tag with Enter → works.
- [ ] Add tag with comma → works.
- [ ] Remove tag with × → removed.
- [ ] Brand new tag → saved, appears in user's tag list.
- [ ] Case handling: `Travel` and `travel` should not be duplicated (case-insensitive merge).
- [ ] Whitespace-only tag → blocked.

## 4.7 Backfill (logging past dates)

- [ ] Date picker shows: Today, Yesterday, 2 days ago.
- [ ] Select Yesterday → entry saved with yesterday's `EntryDate`.
- [ ] Select 2 days ago → saves with that date.
- [ ] Direct API call to backfill 3+ days ago → blocked server-side.
- [ ] Backfilled entry appears in correct chronological position in dashboard list.
- [ ] Backfill same date twice → second blocked (one entry per day per date).

## 4.8 Draft auto-save

- [ ] Start typing → "Draft saved" indicator within ~2 seconds.
- [ ] Navigate away mid-entry → return → draft restored.
- [ ] Submit entry → draft discarded for that date.
- [ ] Discard draft manually → editor clears, no draft persists.
- [ ] Drafts are per-date (today's draft does not appear on a yesterday's compose).
- [ ] Open `/entry/new` in two tabs → drafts don't corrupt each other (last write wins, no merge conflicts).

---

# PART 5 — Viewing Entries [ANY]

## 5.1 Entry view page

- [ ] Click entry from dashboard → reader loads with title, date, body.
- [ ] Mood badge shown if mood set.
- [ ] Backfill indicator shown if `EntrySource = Backfill`.
- [ ] Rich-text content renders correctly (formatted entries don't break).
- [ ] Tags shown as links → clicking navigates to `/entries/by-tag/:name`.
- [ ] Image gallery loads.
- [ ] Large images don't break layout.
- [ ] Entry not found / wrong user → 404 or redirect (not a 500).

## 5.2 Favoriting

- [ ] Click heart → entry favorited, heart fills with brand cyan.
- [ ] Click again → unfavorited.
- [ ] Backend: `Entry.IsFavorited` toggles, `Entry.FavoritedAt` set/cleared.
- [ ] Favorited entry appears in `/favorites` view.
- [ ] Unfavorite from `/favorites` → optimistically removes from list.

## 5.3 Edit / delete from view page

- [ ] Edit → `/entry/:id/edit`.
- [ ] Delete → confirmation modal with **clear "Permanently deleted after 48 hours" warning** (this is the new copy we shipped).
- [ ] Confirm → entry to trash, redirected to dashboard.
- [ ] Cancel → modal closes, entry remains.

---

# PART 6 — Editing Entries [ANY]

## 6.1 Edit form

- [ ] Edit page loads existing title, body, mood, tags, images.
- [ ] Rich text loads correctly into editor.
- [ ] Edit title → saves.
- [ ] Edit body → saves.
- [ ] Add / remove tags → saves.
- [ ] Change mood → saves.
- [ ] Clear mood → saves (mood = null).
- [ ] Word limit enforced on edit (same as create — 2500 words).
- [ ] Cannot change `EntryDate` from edit form.

## 6.2 Image management on edit

- [ ] Existing images shown.
- [ ] Remove existing → deleted from R2 on save (verify file gone).
- [ ] Add more, up to 20 total.
- [ ] Reorder works (if drag-reorder is implemented).

---

# PART 7 — Dashboard [ANY]

## 7.1 Layout & loading

- [ ] Loads without errors.
- [ ] Sidebar streak widget shows current + best streak + History link.
- [ ] Active sidebar nav item matches the surface visible in column 3.
- [ ] Skeleton loading states appear briefly, resolve cleanly.
- [ ] Entry list (column 2) loads with entries in newest-first order.

## 7.2 Search

- [ ] Type in search → entries filter in real time.
- [ ] Search by title keyword → matching entries shown.
- [ ] Search by tag name → matching entries shown.
- [ ] No matches → "No entries match" empty state.
- [ ] Clear search → all entries shown.

## 7.3 Sorting

- [ ] Newest First (default) → descending by date.
- [ ] Oldest First → ascending.
- [ ] Other sorts (if added — favorites, etc.) → behave correctly.

## 7.4 Pagination

- [ ] >60 entries → "Load more" appears.
- [ ] Click → next page appended.
- [ ] All entries eventually loadable.
- [ ] No duplicates after load-more.

## 7.5 Empty state

- [ ] Brand-new account, no entries → warm "No entries yet" empty state with CTA.

## 7.6 Daily Spark

- [ ] Spark hero appears in column 3 Today panel.
- [ ] Eyebrow "YOUR DAILY SPARK" with pulsing cyan dot.
- [ ] Heart on left, expand chevron top-right (corner cluster).
- [ ] Click heart → favorited (cyan when active).
- [ ] Click chevron → expands to full content.
- [ ] Click "Read more" link inline → expands.
- [ ] Read more for spark with no `fullContent` → no expand affordance shown.

## 7.7 Daily Prompt

- [ ] Prompt card below Spark.
- [ ] Eyebrow "YOUR DAILY PROMPT" with pulsing cyan dot.
- [ ] "Journal about this" CTA → opens composer with the prompt as context.
- [ ] Shuffle button → cycles to a different prompt.

## 7.8 Mood-as-entry-starter

- [ ] Mood card below Prompt: 12 mood icons.
- [ ] Tap mood → composer opens with that mood pre-selected.

## 7.9 Streak engagement cards (mutually exclusive)

The three cards in column 3 NEVER overlap — exactly one (or zero) shows.

| State | Card visible |
|---|---|
| Logged today | None |
| Missed yesterday only (within grace) | **Daily Reminder** |
| Missed yesterday + today (in 48h grace) | **Threatened banner** |
| Streak broken (>= 3 days) | **Welcome Back** (full takeover) |
| Brand-new user, zero entries | **Daily Reminder** (onboarding nudge) |

- [ ] Each state is reachable by manipulating `Entry.EntryDate` and entry counts in DB.
- [ ] No overlap when multiple states could apply.
- [ ] Preview routes for visual inspection (admin-only):
  - [ ] `/dashboard?preview=daily-reminder`
  - [ ] `/dashboard?preview=threatened`
  - [ ] `/dashboard?preview=welcome-back`
  - [ ] `/dashboard?section=streak-history&demo=streaks`

## 7.10 Threatened banner specifics

- [ ] Title: "2 days have slipped by — but you've got this."
- [ ] CTA "Log recent progress" opens composer with **yesterday's date pre-filled**.
- [ ] Once user logs yesterday's entry → banner disappears, daily reminder card appears.
- [ ] Server-side push fires once after 10am user-local (verify via `User.StreakThreatenedNotifiedFor`).
- [ ] Push doesn't re-fire same day (dedupe).
- [ ] Push doesn't fire before 10am local.

## 7.11 Welcome Back

- [ ] After streak break (currentStreak=0, longestStreak>0) → full-takeover Welcome Back screen.
- [ ] "Last chapter was X days" copy reflects actual streak length.
- [ ] "Log today's progress" CTA → opens composer.
- [ ] Skip / View dashboard → dismisses for this break (`cc_welcome_back_seen_<userId>_<lastEntryDate>` set).
- [ ] Refresh after dismissing → does NOT reappear for same break.
- [ ] New future break → re-appears (different `lastEntryDate` key).

## 7.12 Push notification nudge

- [ ] If push not enabled and supported → nudge banner appears.
- [ ] Click Enable → permission dialog.
- [ ] Grant → nudge disappears, subscription registered.
- [ ] Dismiss → disappears (verify whether returns next session — by design or accident).

## 7.13 Streak milestones

- [ ] Hit milestone (7, 30, 100, etc. — see `getMilestoneProgress`) → celebration overlay.
- [ ] Overlay shows correct milestone title + streak count.
- [ ] Dismissable.

---

# PART 8 — Streak History (new surface) [ANY]

- [ ] Click `History →` in sidebar streak widget → column 3 swaps.
- [ ] Lifetime stats card with light-cyan tint. Three numbers: Best Streak / Chapters / Days Journaled.
- [ ] If no completed chapters → empty-state copy "You've kept your streak alive!..."
- [ ] If completed chapters exist → "Your chapters" list, **personal best pinned top**, rest in most-recent-first order.
- [ ] Each chapter card shows: days, date range, entry count, ★ Best Streak badge if applicable.
- [ ] Sidebar nav item shows "Journal" highlighted (streak-history isn't its own nav item).
- [ ] Demo mode: `/dashboard?section=streak-history&demo=streaks` → 5 sample chapters.

---

# PART 9 — Favorites (unified Sparks + Entries) [ANY]

- [ ] Sidebar "Favorites" link visible only when user has at least one favorite.
- [ ] Click → column 3 swaps (desktop) or `/favorites` standalone (mobile).
- [ ] List shows mixed types — sparks AND journal entries.
- [ ] Sorted by `favoritedAt DESC`.
- [ ] Spark cards: eyebrow "Daily Spark", takeaway, expand chevron, brand-cyan heart.
- [ ] Entry cards: eyebrow "JOURNAL ENTRY", date, bold title, optional first photo, brand-cyan heart.
- [ ] Click spark → expands inline.
- [ ] Click entry → opens in column-3 reader (desktop) or navigates to `/entry/:id` (mobile).
- [ ] Click heart on either type → optimistic remove from list. Server toggles correctly.
- [ ] Network failure → optimistic remove reverts.
- [ ] Load more pagination — page size 25, button only when `hasMore`.
- [ ] Empty state: "No favorites yet. Tap the heart on a Spark or any entry to save it here."

---

# PART 10 — To-Do List [ANY]

## 10.1 Layout & access

- [ ] Sidebar "To Do List" → column 3 swap (desktop) or `/todos` (mobile).
- [ ] On mobile, hamburger button visible in topbar (recently fixed across all standalone pages).

## 10.2 Add an item

- [ ] Persistent "+ Add an item" input at top.
- [ ] Type + Enter → new item appears at the **TOP** of active list.
- [ ] Existing items shift down (sortOrder +1).
- [ ] Empty input + Enter → no-op.
- [ ] Past 100 active items → input disabled with "Complete or delete some items to add more."

## 10.3 Reorder

- [ ] Drag handle (left side, dotted dots, muted at rest, brighter on hover).
- [ ] Drag works on desktop mouse + mobile touch.
- [ ] Drop reorders correctly.
- [ ] On failure (network) → list reloads from server.

## 10.4 Edit

- [ ] Single-click anywhere on text → enters edit mode (textarea replaces span).
- [ ] Long entries auto-resize the textarea (no single-line truncation — was a bug).
- [ ] Type → text updates.
- [ ] Enter → saves.
- [ ] Escape → cancels (restores original).
- [ ] Click outside (blur) → saves.
- [ ] Empty text + blur → cancels (restores original) rather than deleting.
- [ ] Hover during edit mode → cyan tint background.

## 10.5 Complete

- [ ] Click round checkbox → item moves to Done section at bottom.
- [ ] `IsCompleted = true`, `CompletedAt = now()` in DB.
- [ ] Done section collapsed by default.
- [ ] Expand → completed items shown with strikethrough + filled cyan checkbox.
- [ ] Click filled checkbox → uncompletes; item returns to **TOP** of active list (consistent with new item behavior).

## 10.6 Delete

**Desktop:**
- [ ] Hover row → X delete button fades in on right.
- [ ] Click X → optimistic remove. On failure → restored.

**Mobile:**
- [ ] Swipe row left → red Delete tile reveals.
- [ ] Tap tile → confirms delete.
- [ ] Tap elsewhere → tile dismisses (revealed state cleared).
- [ ] Swipe doesn't conflict with vertical scroll (>8px vertical → swipe cancelled).

## 10.7 Clear all done

- [ ] "Clear all done" link below expanded Done section.
- [ ] Confirms via dialog.
- [ ] Clears all completed items.
- [ ] Optimistic update; restored on failure.

---

# PART 11 — Tags [ANY]

## 11.1 Tag autocomplete

- [ ] Existing tags appear in autocomplete on entry create / edit.
- [ ] Recently-used tags rank higher (if implemented).
- [ ] Typing → narrows suggestions.

## 11.2 Tag-filtered view

- [ ] Click a tag on entry view → `/entries/by-tag/:name`.
- [ ] Only entries with that tag shown.
- [ ] Tag with no entries → empty state.

## 11.3 Tag rename / merge

- [ ] Rename tag from account page (if implemented) → updates everywhere.
- [ ] Rename to existing name → merge or block (verify which).
- [ ] Rename to empty → blocked.

## 11.4 Tag delete

- [ ] Delete tag → removed from all entries.
- [ ] Entries themselves NOT deleted.
- [ ] Tag no longer in autocomplete.

---

# PART 12 — Journals [ANY]

- [ ] Default journal exists.
- [ ] Create additional journals — no cap (or cap if defined).
- [ ] Default journal cannot be deleted.
- [ ] Entries scoped per journal.
- [ ] Filter entry list by journal (if implemented).

---

# PART 13 — Trash & Recovery [ANY]

## 13.1 Soft delete

- [ ] Click delete on entry → modal with **clear "permanently deleted after 48 hours" warning** (recently shipped).
- [ ] Confirm → entry to trash, removed from main list.
- [ ] `/trash` route shows deleted entry.
- [ ] Card shows deleted date + countdown to auto-purge.

## 13.2 Recovery

- [ ] Recover button on each trash item.
- [ ] Click → entry restored to main list with original date, content, mood, tags, images.
- [ ] Verify all metadata fully restored (tags re-linked, images re-linked).

## 13.3 Auto-purge

- [ ] Entry deleted >48h ago → no longer in trash, hard-deleted from DB.
- [ ] Media files for purged entries → removed from R2 (verify no orphans).

## 13.4 Permanent delete

- [ ] "Delete permanently" button in trash → confirm dialog.
- [ ] Confirm → instantly hard-deleted (does not wait for 48h).
- [ ] Media also deleted.

---

# PART 14 — Streak System [ANY]

## 14.1 Streak calculation

- [ ] One entry today → currentStreak = 1.
- [ ] Consecutive days → increments correctly.
- [ ] Miss a day with no pause → resets to 0 (or 1 if today was logged).
- [ ] longestStreak only ever increases.
- [ ] totalEntries counts non-deleted entries.
- [ ] totalActiveDays counts unique calendar days.

## 14.2 Streak with pause

- [ ] Pause covers today → streak doesn't break without entry.
- [ ] Pause days do NOT increment streak number.
- [ ] Pause spanning multiple days → bridges gap correctly.
- [ ] Cancel pause → streak resumes.
- [ ] `IsPaused = true` while active, `false` after.

## 14.3 Streak display

- [ ] Sidebar widget shows correct numbers.
- [ ] Updates after entry save (or on next page load).

---

# PART 15 — Streak Pause [ANY]

## 15.1 Pause creation

- [ ] Account page → Pause section visible.
- [ ] Select start + end → create.
- [ ] Active pause shown in account page.
- [ ] Try to create overlapping second pause → blocked.
- [ ] Past start date → blocked.
- [ ] End before start → blocked.
- [ ] End = start → blocked (must be at least 1 day later).

## 15.2 Monthly limit

- [ ] Exactly 10 days → allowed.
- [ ] 11 days → blocked.
- [ ] Pause spanning month boundary → days correctly split (e.g. May 29–June 3 = 3 May days + 3 June days).
- [ ] Cancelled pauses still count toward monthly limit.
- [ ] New month → counter resets.

## 15.3 Cancellation

- [ ] Cancel active pause → status → Cancelled.
- [ ] Can create new pause if days allow.

---

# PART 16 — Reminders [ANY]

**Major refactor area** — reminders are now general-purpose, fixed 5 slots, fire on schedule unconditionally. No entry-based gating, no streak-pause skip.

## 16.1 Slots

- [ ] Reminders page shows exactly 5 slots (lazy-created on first GET).
- [ ] Each slot: time picker, optional message, on/off toggle.
- [ ] No "add" / "delete" UI — slots are fixed.
- [ ] All 5 slots are editable, identical behavior.

## 16.2 Editing

- [ ] Set time on slot 1 → toggle on → save.
- [ ] Backend: `Reminder.LastSentAt` cleared (so a fresh schedule fires today).
- [ ] Set custom message → save.
- [ ] Empty message → falls back to default ("Remember to log today's progress to keep your streak alive!").
- [ ] Toggle off → reminder doesn't fire.
- [ ] Toggle back on → fires next time match.

## 16.3 Firing

- [ ] Set slot for ~3 minutes from now → notification arrives.
- [ ] Fire occurs even if user logged an entry today (no entry-based gating).
- [ ] Fire occurs even if user is mid-pause (no pause skip — was removed).
- [ ] Worker uses "scheduled time has passed today AND not sent today" — robust to drift / restarts.
- [ ] Multiple reminders set close together → all fire correctly.
- [ ] After fire → `LastSentAt` updated → won't re-fire same day.

## 16.4 "Send Test" button

- [ ] Button on reminders page.
- [ ] Click → calls `POST /v1/push/test` → fires immediately.
- [ ] Returns per-device status: `{sent, total, expired, errors, message}`.
- [ ] Status displayed clearly: green for success, red for issues.
- [ ] No subscriptions → message: "No push subscriptions registered for this account..."
- [ ] Expired (410 Gone) endpoints → pruned from DB in same call.

## 16.5 Reset all

- [ ] "Reset all" button → confirm dialog.
- [ ] Wipes all 5 slots, recreates fresh disabled noon slots.

---

# PART 17 — Push Notifications [ANY]

## 17.1 Subscription setup

- [ ] Onboarding push prompt → subscription registered (`PushSubscription` row).
- [ ] Account page → Enable → subscription registered.
- [ ] DevTools → Application → Notifications → endpoint visible.
- [ ] Backend logs: subscription stored.

## 17.2 Multi-device

- [ ] Enable on desktop + phone → both receive.
- [ ] Disable on one → other still receives.

## 17.3 Disable

- [ ] Click Disable → server-side subscription removed.
- [ ] Reminder doesn't fire.
- [ ] Re-enable → resumes.

## 17.4 Stale subscriptions

- [ ] Clear browser data / uninstall PWA → subscription invalid.
- [ ] Next push attempt → 410 Gone → subscription cleaned up server-side.
- [ ] Re-enable → fresh subscription.

## 17.5 Browser support

- [ ] Chrome: works.
- [ ] Safari (iOS 16.4+): works.
- [ ] Firefox: works.
- [ ] Older Safari / unsupported: graceful "not supported" message, no crash.

## 17.6 PWA install (when implemented)

- [ ] Chrome desktop: `beforeinstallprompt` fires → banner appears.
- [ ] Click install → native dialog → installed → opens in standalone mode.
- [ ] Notification rendering after install: **single icon** (Creator Companion), no Chrome chrome.
- [ ] iOS Safari: "Add to Home Screen" instruction card (no `beforeinstallprompt` on iOS).
- [ ] Already installed → banner doesn't show.
- [ ] Dismiss banner → localStorage flag prevents re-prompting.

---

# PART 18 — Account Settings [ANY]

## 18.1 Profile

- [ ] Account page loads with current first/last name, email, tier, timezone, profile image.

## 18.2 Change password

- [ ] Wrong current password → error.
- [ ] New < 8 chars → error.
- [ ] Same as current → blocked (if enforced).
- [ ] Valid → success.
- [ ] Old password fails subsequent login.

## 18.3 Timezone

- [ ] Change timezone → saved.
- [ ] Reminders fire at correct local time after change.
- [ ] Entry dates reflect correct local day.

## 18.4 Profile picture

- [ ] Upload → success, image compressed (verify size).
- [ ] Stored on R2 (verify path in DB).
- [ ] Sidebar avatar updates immediately.
- [ ] Remove picture → reverts to initial-letter fallback.

## 18.5 Subscription management

- [ ] "Manage subscription" → Stripe Customer Portal opens.
- [ ] View subscription details, change plan, update card, cancel — all routed through portal.
- [ ] Cancellation → tier flips at period end (verify webhook).

## 18.6 Reminder / motivation preferences

- [ ] Toggle "Show Daily Spark" off → card disappears from dashboard.
- [ ] Toggle on → reappears.
- [ ] Toggle "Show Daily Reminders" similarly.

## 18.7 Account self-deletion *(when implemented)*

- [ ] Account page → Delete Account section.
- [ ] Click → strong warning + confirm with password.
- [ ] On confirm: cascade delete entries, drafts, media (R2), pauses, reminders, push subs, refresh tokens.
- [ ] Stripe: cancel any active subscription.
- [ ] Audit log entry written.
- [ ] User redirected to logged-out state with confirmation.
- [ ] Data export download offered before delete.

## 18.8 Data export

- [ ] Account page → Export Data.
- [ ] Download includes: all entries, drafts, tags, journals, mood data, attached image URLs.
- [ ] Format reasonable (JSON or zip with markdown files).
- [ ] Large accounts (~1000 entries) → handles without timing out.

---

# PART 19 — Billing & Stripe [SUBSCRIBED, LOCKED]

## 19.1 Subscription via Checkout

- [ ] From paywall or upgrade CTA → Stripe Checkout opens.
- [ ] Both prices visible: $5/mo, $50/yr.
- [ ] Annual price displayed as discounted ("Save $10/year" or similar).
- [ ] Complete with `4242` → redirected back, success state shown.
- [ ] Webhook `customer.subscription.created` fires.
- [ ] Backend: `User.StripeCustomerId`, `StripeSubscriptionId` set.
- [ ] `User.TrialEndsAt` left as-is (not cleared) — historical record.

## 19.2 Webhook coverage (test each in Stripe dashboard "Send test webhook")

| Event | Expected backend behavior |
|---|---|
| `checkout.session.completed` | Sub recorded, IDs stored |
| `customer.subscription.created` | Tier active |
| `customer.subscription.updated` (active) | No-op (already active) |
| `customer.subscription.updated` (cancel_at_period_end) | Tier active until `current_period_end` |
| `customer.subscription.deleted` | Tier locked, `StripeSubscriptionId` cleared |
| `invoice.payment_succeeded` | Logged (Stripe sends receipt) |
| `invoice.payment_failed` | Logged, possibly grace state set |
| `customer.subscription.trial_will_end` | (if Stripe-managed trial — we use our own) |

- [ ] Webhook signature validation: tampered body → 400 returned, not processed.
- [ ] **Idempotency**: Stripe retries (sends same event twice) → not double-processed. Verify by sending test webhook twice; user state reflects single update.

## 19.3 Subscription cancellation

- [ ] Cancel via Customer Portal → subscription `cancel_at_period_end = true`.
- [ ] Access continues until period end.
- [ ] Webhook `customer.subscription.deleted` fires at period end.
- [ ] User locked out at that moment (paywall takeover).
- [ ] Re-subscribe → unlocks.

## 19.4 Failed payment

- [ ] Card `4000 0000 0000 0341` — succeeds initially, fails on next renewal.
- [ ] Webhook `invoice.payment_failed` fires.
- [ ] Verify intended behavior: brief grace period? Immediate lock?
- [ ] Stripe sends "update payment method" email (configure in Stripe).
- [ ] User updates card via portal → re-attempted payment succeeds → access restored.

## 19.5 Plan change (monthly ↔ yearly)

- [ ] User on monthly clicks "Switch to annual" via portal.
- [ ] Stripe prorates correctly.
- [ ] Webhook `customer.subscription.updated` fires.
- [ ] Backend reflects new plan.
- [ ] Renewal date adjusts.

## 19.6 Edge: trial expires while subscription pending

- [ ] User has trial expiring tomorrow + initiates Stripe Checkout (asynchronously).
- [ ] Trial expires before checkout completes.
- [ ] Checkout completes → webhook fires → user un-locked.
- [ ] No window where user is locked out despite paying.

---

# PART 20 — Emails [ANY]

## 20.1 Welcome email

- [ ] Sent on registration.
- [ ] Subject correct.
- [ ] Body renders, no `{firstName}` literal.
- [ ] From `@creatorcompanionapp.com`.
- [ ] Not in spam (Gmail, Apple Mail, Outlook).

## 20.2 Email verification *(when enforced)*

- [ ] Verification email arrives.
- [ ] Link works → marks email verified.
- [ ] Re-using used link → fails gracefully.
- [ ] Expired link → fails gracefully.
- [ ] Until verified, certain actions blocked (define which — typically writing entries).

## 20.3 Password reset

- [ ] Sent on request.
- [ ] Link works.
- [ ] From correct sender.
- [ ] Expires (typically 1 hour).
- [ ] One-time use.

## 20.4 Lifecycle emails *(when implemented)*

- [ ] Trial ending in 3 days (Day 7 of trial) — sent.
- [ ] Trial ending in 1 day (Day 9) — sent.
- [ ] Trial ended, locked out — sent at `TrialEndsAt`.
- [ ] Subscription cancelled — sent.
- [ ] Subscription renewal failed — sent.
- [ ] 7 days inactive (no entry) — sent ONCE.
- [ ] 30 days inactive — sent ONCE.
- [ ] No further re-engagement after Day 30 (don't be annoying).
- [ ] Each email has unsubscribe link (legal requirement for non-transactional emails).
- [ ] User can disable lifecycle emails in account settings.

## 20.5 Admin email template editor

- [ ] `/admin/emails` loads.
- [ ] Welcome template loads with current subject + body.
- [ ] Edit + save → persists.
- [ ] Formatting toolbar (B, I, H2, H3, list) all work.
- [ ] `{firstName}` placeholder hint.
- [ ] After edit, register a new user → email reflects updated template.

---

# PART 21 — Admin Panel [ADMIN]

All admin pages now share `<app-admin-shell>` — chrome consistency must hold.

## 21.1 Shell consistency

- [ ] Every admin page has the same header ("Admin Dashboard" + Back to App).
- [ ] Every admin page has the same nav: Overview, Users, Content Library, Reminders, Emails, FAQ, Daily Prompts.
- [ ] Active highlight matches the visible page.
- [ ] Click-through every nav item from every page → no broken links, no layout shift.
- [ ] Mobile nav wraps cleanly.

## 21.2 Overview

- [ ] `/admin` loads with stats: total users, paid, free, active, total entries, etc.
- [ ] Stats reflect actual DB state (cross-reference with known accounts).
- [ ] **Preview surfaces section** at the bottom: 4 cards linking to streak-history demo, welcome back, threatened banner, daily reminder. All require admin claim.

## 21.3 Users list

- [ ] `/admin/users` loads paginated list.
- [ ] Search by email → correct user.
- [ ] Search by name → correct user.
- [ ] Pagination works.
- [ ] Click user → user detail.

## 21.4 User detail

- [ ] Shows: name, email, tier, TZ, isAdmin, isActive, onboarding, entry count, journal count, active pause, pause days used.
- [ ] Change tier → effect immediate.
- [ ] Reset password → user can log in with new.
- [ ] Toggle `isActive` off → user cannot log in.
- [ ] Toggle `isAdmin` on → user can access admin.
- [ ] Cancel active pause → pause removed.
- [ ] Send test notification → arrives on user's devices.
- [ ] View user's entries → list loads.

## 21.5 Motivation library (Sparks)

- [ ] `/admin/motivation` lists all motivation entries.
- [ ] Create new with takeaway, fullContent, category → saved.
- [ ] Edit → updates.
- [ ] Delete → removed.
- [ ] Today's entry → users see it on dashboard.

## 21.6 Reminder config

- [ ] `/admin/reminders` shows config row.
- [ ] Edit thresholds + messages → save.
- [ ] Changes take effect on next worker tick.

## 21.7 Email templates

- [ ] `/admin/emails` lists templates.
- [ ] Edit + save persists.
- [ ] New users get updated content.

## 21.8 FAQ

- [ ] `/admin/faq` lists FAQs.
- [ ] Drag-reorder works.
- [ ] Toggle published → unpublished hidden from public FAQ.
- [ ] Add / edit / delete → all work.

## 21.9 Daily Prompts

- [ ] `/admin/prompts` lists all.
- [ ] Drag-reorder works.
- [ ] Add / edit / delete → all work.
- [ ] Unpublished prompts → hidden from rotation.

---

# PART 22 — PWA & Mobile

## 22.1 Install

- [ ] Android Chrome: install prompt appears (when banner implemented).
- [ ] Install → home screen icon → opens in standalone mode.
- [ ] iOS Safari: Add to Home Screen via share sheet → works.
- [ ] Installed PWA opens to correct start URL (`/dashboard`).

## 22.2 Offline

- [ ] Disconnect network → app shows graceful offline state, not blank/crash.
- [ ] Reconnect → resumes without hard refresh.
- [ ] Service worker caches `/offline.html` for navigations.

## 22.3 Mobile UX

- [ ] No horizontal scroll on any page.
- [ ] Entry composer: keyboard doesn't obscure content.
- [ ] Image picker opens camera/gallery.
- [ ] Tap targets minimum ~44px.
- [ ] All standalone pages have hamburger button in mobile topbar (notifications, todos, favorites, account — recently fixed).
- [ ] Sidebar drawer slides in/out smoothly.

## 22.4 Push on mobile

- [ ] After PWA install + push enabled → notifications arrive when app closed.
- [ ] Tap notification → opens app.
- [ ] Notification rendering: single icon (Creator Companion), no Chrome chrome (after PWA install).

---

# PART 23 — Security

## 23.1 Cross-user data isolation

- [ ] Copy entry URL from User A → paste in User B's browser → 403 or redirect.
- [ ] Edit URL of another user's entry → blocked.
- [ ] Direct API call to another user's resource → 403 (verify for: entries, journals, tags, drafts, action items, reminders, pauses, push subs, motivation favorites).
- [ ] Trash recovery of another user's entry → blocked.

## 23.2 Admin isolation

- [ ] Non-admin user cannot reach `/admin/*` routes (UI redirect).
- [ ] Non-admin API call to `/v1/admin/*` → 403.

## 23.3 API security

- [ ] Unauthenticated → all protected endpoints return 401.
- [ ] Stripe webhook with bad signature → 400.
- [ ] Rate limiting:
  - [ ] Login: >10 attempts in 60s → 429.
  - [ ] Password reset: >5 in 60s → 429.
  - [ ] General writes: >30 in 60s → 429.
- [ ] CORS: API rejects origins not in allow-list.

## 23.4 Input handling

- [ ] Entry body with `<script>alert(1)</script>` → rendered safely (escaped or sanitized; verify it does NOT execute on view page).
- [ ] Tag with HTML → safe.
- [ ] Very long title → truncated or rejected, no buffer overflow.
- [ ] SQL injection attempt → safe (EF Core parameterizes).
- [ ] File upload with executable extension renamed to `.jpg` → MIME-checked server-side, rejected if not really an image.

## 23.5 Encryption verification

- [ ] **In transit**: All requests over HTTPS. HTTP redirected.
- [ ] **At rest — Postgres**: Confirm Railway-managed Postgres has encryption at rest (default — confirm with Railway support / dashboard).
- [ ] **At rest — R2**: Cloudflare R2 encrypts at rest by default (AES-256).
- [ ] **JWT secret**: in env vars, not in repo (`grep -r 'Jwt:Secret' --include='*.cs'` should only find the read).
- [ ] **VAPID keys**: same.
- [ ] **Stripe keys**: same.
- [ ] **Database connection string**: same.

## 23.6 Security headers *(when middleware added)*

Run `https://securityheaders.com/?q=app.creatorcompanionapp.com` and verify:
- [ ] `Strict-Transport-Security` (HSTS) — present, max-age >= 1 year.
- [ ] `X-Content-Type-Options: nosniff`.
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` (or stricter).
- [ ] `X-Frame-Options: DENY` (or `SAMEORIGIN`).
- [ ] `Content-Security-Policy` — locks down script sources.
- [ ] Score: A or A+.

## 23.7 Audit log

- [ ] Login → audit row.
- [ ] Password change → audit row.
- [ ] Subscription created/cancelled → audit row.
- [ ] Account deletion → audit row.
- [ ] Verify: audit logs do NOT contain plaintext passwords or full payment card data.

---

# PART 24 — Edge Cases & Boundary Conditions

## 24.1 Entry edges

- [ ] 11:58 PM entry → `EntryDate` reflects user's local day, not UTC.
- [ ] 12:01 AM entry → next-day local, even if UTC was previous day.
- [ ] Backfill same date twice → second blocked.
- [ ] Delete only entry today, then create new → works (slot freed by soft delete).
- [ ] Recover after 48+ hours → fails (auto-purged).
- [ ] Entry exactly at word limit → accepted.
- [ ] Entry one word over → blocked.

## 24.2 Streak edges

- [ ] Entries every day for a week → streak = 7.
- [ ] Pause 2 days mid-week → streak still continues, paused days don't increment.
- [ ] Miss one day no pause → streak resets.
- [ ] Multiple entries one day → 1 streak day.
- [ ] Backfill yesterday after missing → streak continues (saved).
- [ ] Streak at 23 days, miss today, backfill tomorrow at 11pm → still saved.
- [ ] Streak at 23 days, miss today AND tomorrow, backfill day-3 → stream broken (past 48h grace).

## 24.3 Pause edges

- [ ] Pause spans month boundary → days correctly counted in each month.
- [ ] Cancel a pause early → cancelled days still count.
- [ ] Month rolls over → counter resets.

## 24.4 Tag edges

- [ ] Whitespace-only → blocked.
- [ ] Same name, same case → blocked.
- [ ] Mixed case (Travel vs travel) → merged or blocked (verify which).
- [ ] Delete tag used by many entries → entries remain, tag removed.

## 24.5 Trial edges

- [ ] Sign up at midnight UTC → `TrialEndsAt = signup + 10 days` exactly.
- [ ] TZ change after signup → trial countdown shows correct days remaining in new TZ.
- [ ] Subscribe AFTER trial expired → subscription activates, lockout removed.
- [ ] Subscribe DURING trial → trial discarded, immediately on subscription billing.
- [ ] Re-register with same email → blocked (no trial reset by re-register).

## 24.6 Subscription edges

- [ ] Cancel mid-period → continues until `current_period_end`.
- [ ] Failed payment with grace → access continues for grace period.
- [ ] Card expiration → Stripe sends update prompt; no immediate lockout.
- [ ] Plan change mid-period → prorated (Stripe handles).
- [ ] Refund issued → access continues unless subscription explicitly cancelled.
- [ ] Two devices, one subscribes → both reflect state immediately on next request (refresh token + capabilities re-fetch).

## 24.7 Reminder edges

- [ ] Reminder time = 23:59 → fires before midnight.
- [ ] Reminder time = 00:00 → fires at midnight (verify behavior).
- [ ] DST transition day → no duplicate fire / no skip.
- [ ] Worker restart mid-loop → no double-fire (LastSentAt guard).
- [ ] User in 30/45-min offset TZ (India, Nepal) → reminder fires at correct local time.

## 24.8 Push edges

- [ ] Push fired while user is in app → behavior consistent (silent or shown — verify intent).
- [ ] Push during do-not-disturb → OS handles (we don't need to).
- [ ] Multiple devices → all get push.
- [ ] Subscription expired → 410 Gone → cleaned up server-side.

## 24.9 Image edges

- [ ] Very long filename → handled (truncated or stored as-is, no error).
- [ ] Exactly 20MB → accepted.
- [ ] 20.1MB → rejected.
- [ ] HEIC from iPhone → uploaded, displays in browsers via conversion or via supported browsers.
- [ ] Same image twice → both stored OR second rejected (verify).
- [ ] Delete entry with images → media deleted from R2 (verify no orphans).

## 24.10 Trash edges

- [ ] Delete + create new on same date → works.
- [ ] Permanently delete during 48h window → instant.
- [ ] Recover entry that was the user's only entry that day → totalActiveDays correctly increments back.

## 24.11 Concurrency edges

- [ ] Open entry/new in two tabs → drafts don't corrupt.
- [ ] Two devices logged in → both can save entries on same day if backfill allows.
- [ ] Two simultaneous favorite toggles → final state consistent.
- [ ] Two simultaneous push subscriptions on same device → only one row (upsert by endpoint).

## 24.12 Migration edges

- [ ] Run all migrations on a fresh DB → no errors.
- [ ] Run migrations on a copy of prod → no data loss.
- [ ] Backfill migrations (e.g. `AddEntryFavoritedAt`) — only touches rows that need it (idempotent).

---

# PART 25 — Performance & UX

## 25.1 Loading times

- [ ] Dashboard with 50+ entries → first paint < 2s, fully loaded < 4s.
- [ ] Entry with 20 images → renders without layout shift.
- [ ] Large entry (~2,500 words) → renders without lag.
- [ ] Slow 3G simulation (DevTools throttle) → acceptable degradation, no crashes.

## 25.2 Database performance

- [ ] EF Core logging on → no N+1 queries on hot paths:
  - [ ] Entry list (column 2 dashboard)
  - [ ] Streak compute
  - [ ] Favorites view (mixed query)
- [ ] Indexes on FK columns + common composite queries (`Entries(UserId, EntryDate)`, etc.).
- [ ] Slow query log clean (Railway dashboard).

## 25.3 Error states

- [ ] 404 entry → graceful page, not 500.
- [ ] 500 from API → user-facing error message, no app crash.
- [ ] Image upload fails → clear error, not stuck spinner.
- [ ] Network drop mid-action → retries or clear failure state.

## 25.4 Form states

- [ ] Submit buttons disabled while request in flight.
- [ ] Loading spinners on async ops.
- [ ] Success messages auto-dismiss appropriately.
- [ ] Error messages specific, not "Something went wrong."

---

# PART 26 — Email Deliverability

Run after Resend domain verification.

- [ ] Welcome from `@creatorcompanionapp.com`.
- [ ] DKIM signature present + valid (check email headers).
- [ ] SPF passes ([mail-tester.com](https://mail-tester.com)).
- [ ] DMARC record in place.
- [ ] Gmail → inbox, not spam.
- [ ] Apple Mail → inbox.
- [ ] Outlook → inbox.
- [ ] Resend dashboard → domain Verified, no recent bounces.
- [ ] mail-tester.com score: 9/10 or 10/10.

---

# PART 27 — Pre-Deploy Checklist

Run these BEFORE every production deploy.

## 27.1 Code

- [ ] All commits reviewed (or self-reviewed for solo).
- [ ] No `console.log` / debug statements left in.
- [ ] No commented-out code blocks larger than ~10 lines.
- [ ] No TODO comments for things that should block this deploy.
- [ ] CLAUDE.md updated if any architectural decision changed.

## 27.2 Builds

- [ ] Backend builds clean (`dotnet build`).
- [ ] Frontend builds clean (`ng build --configuration=production`).
- [ ] Bundle size hasn't ballooned (Vercel deployment shows bundle stats).

## 27.3 Database

- [ ] Any migrations are append-only (no destructive `DROP COLUMN`, `DELETE`, `TRUNCATE` without explicit signoff).
- [ ] Migrations run cleanly on staging copy of prod DB.
- [ ] Backup verified within last 24h (Railway dashboard).

## 27.4 Environment

- [ ] Stripe keys: live on prod Railway, test on staging Railway. NOT swapped.
- [ ] Resend key: production key on prod, sandbox / test on staging.
- [ ] R2 buckets: prod bucket vs staging bucket.
- [ ] VAPID keys match between client and server in each env.
- [ ] CORS origins include the right domain for each env.
- [ ] No secrets accidentally committed to repo (`git log -p | grep -iE 'sk_live|whsec'`).

## 27.5 Smoke test in staging

Quick end-to-end on staging before pushing to prod:

- [ ] Register new account → trial active → write entry.
- [ ] Log out → log back in.
- [ ] Subscribe in Stripe test mode → confirm webhook fires.
- [ ] Trigger a push → verify on a real device.
- [ ] Open mobile view → confirm hamburger + nav work.
- [ ] Hit `/admin` as admin → confirm shell loads correctly across all 7 pages.

---

# PART 28 — Post-Deploy Verification

Within 5 minutes of pushing to prod:

- [ ] Hit homepage → 200, nothing visibly broken.
- [ ] Existing user: log in → dashboard loads with their data.
- [ ] Sentry / error monitor not flooded with new errors.
- [ ] Railway logs not flooded with errors.
- [ ] Reminder background service still ticking (logs show "ReminderTick" entries).
- [ ] No 5xx responses in last 5 min (Railway / Vercel dashboards).
- [ ] DB query times haven't regressed (compare Railway metrics).
- [ ] Push notifications still firing for active users (test with own account).
- [ ] Stripe webhook endpoint receiving events (Stripe dashboard → Webhooks → recent events).

If any of those fail → rollback (Part 29).

---

# PART 29 — Rollback Procedure

If a deploy is bad:

## 29.1 Backend (Railway)

- [ ] Railway dashboard → Service → Deployments tab.
- [ ] Find previous successful deployment.
- [ ] Click "Redeploy" on that one.
- [ ] Verify rollback succeeded (health check).

## 29.2 Frontend (Vercel)

- [ ] Vercel dashboard → Project → Deployments.
- [ ] Find previous deployment marked "Production".
- [ ] Click "Promote to Production".
- [ ] Confirm.

## 29.3 Database migration rollback

If the bad deploy included a migration that needs to be reversed:

- [ ] **First, take a backup**: Railway → Postgres → Backups → manual snapshot.
- [ ] Generate down-migration SQL: `dotnet ef migrations script <PreviousMigration> <BadMigration> --output rollback.sql`.
- [ ] Review the SQL carefully (especially data backfills).
- [ ] Apply via Railway DB console (or `psql` if you have direct access).
- [ ] Verify schema matches the rolled-back code.

## 29.4 Post-rollback verification

- [ ] Smoke test (Part 27.5).
- [ ] Sentry quiet.
- [ ] Document the failure mode for the next attempt.

---

# PART 30 — Recommendations / Open Items

Prioritized list of things to ship before / shortly after launch.

## High priority (should ship before public launch)

- [ ] **Sentry / error monitoring** — frontend + backend.
- [ ] **Account self-deletion** — required by GDPR (EU) and CCPA (California).
- [ ] **Email verification** — block writing entries until verified, prevents fake accounts.
- [ ] **Stripe webhook idempotency** — verify duplicate events don't double-process.
- [ ] **Privacy Policy + Terms of Service pages** — required for app store, Stripe, GDPR.
- [ ] **Security headers middleware** (HSTS, CSP, etc.).
- [ ] **`UserId` audit on every endpoint** — verify no horizontal privilege escalation.
- [ ] **Encryption verification documented** — at rest (Postgres, R2) + in transit. For the marketing copy.
- [ ] **OG image** — `marketing/og-image.png` missing; social shares show no preview.
- [ ] **PWA install prompt** — fixes the dual-icon notification issue.
- [ ] **Onboarding feature tour** — discussed; not yet built.
- [ ] **Lifecycle emails** — trial-ending (Day 7, Day 9), failed payment, inactive nudges.

## Medium priority

- [ ] **Trash deletion warning modal** — done (verify the new copy is in place).
- [ ] **Invalid timezone fallback** — if `TimeZoneId` is somehow invalid, reminder service throws. Catch + fall back to UTC.
- [ ] **User deletion warning re: Stripe** — admin deleting a user with active sub should also cancel the sub.
- [ ] **Password strength meter** — currently 8+ char minimum.
- [ ] **Rate limiting on forgot-password** — verify it's covered.
- [ ] **Image alt text** — accessibility.
- [ ] **Keyboard navigation audit** — tab through the app; verify all interactive elements reachable.

## Low priority / nice-to-have

- [ ] **Reminder confirmation toast** — after enabling, fire a test push automatically.
- [ ] **Session expiry message** — "Your session expired, please log in again" vs silent redirect.
- [ ] **Entry word count on dashboard card** — at-a-glance progress.
- [ ] **Dark mode** — substantial design exercise; reflective journaling apps usually skip.
- [ ] **A/B testing infrastructure** — premature; defer.
- [ ] **Native mobile apps** — PWA is enough for a long time.

---

# Appendix A — Quick Reference

## Common test commands

```bash
# Backend build
cd api && dotnet build CreatorCompanion.Api/CreatorCompanion.Api.csproj

# Frontend build
cd web/creator-companion-web && npx ng build --configuration=production

# Run migrations on staging
cd api/CreatorCompanion.Api && dotnet ef database update --connection "<staging-conn-string>"

# Generate new migration
cd api/CreatorCompanion.Api && dotnet ef migrations add <Name>

# Rollback to specific migration
cd api/CreatorCompanion.Api && dotnet ef migrations script <PreviousMigration> <BadMigration> --output rollback.sql
```

## Useful URLs to bookmark

- Stripe Dashboard (test): https://dashboard.stripe.com/test
- Stripe Dashboard (live): https://dashboard.stripe.com
- Railway: https://railway.app
- Vercel: https://vercel.com
- Resend: https://resend.com
- Cloudflare R2: https://dash.cloudflare.com
- mail-tester.com (deliverability check)
- securityheaders.com (security headers audit)

## Preview routes (admin only)

| URL | Surface |
|---|---|
| `/dashboard?preview=welcome-back` | Welcome Back screen |
| `/dashboard?preview=threatened` | Threatened banner |
| `/dashboard?preview=daily-reminder` | Daily Reminder card |
| `/dashboard?section=streak-history&demo=streaks` | Streak History with sample chapters |

---

# Appendix B — Update Log

| Date | What changed | By |
|---|---|---|
| 2026-05-07 | Major revision: trial-only model, new features (streak engagement, history, favorites unification, to-do redesign, admin shell, push streak threatened) | — |

> **When you ship something significant, update this document and the date above.** Treat it as code: version it, commit it, review it.
