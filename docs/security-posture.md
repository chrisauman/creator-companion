# Security Posture — Creator Companion

Audit-grade inventory of every security control that's actually implemented
and verified in the codebase. Use this when:

- Reviewing a PR that touches auth, billing, storage, or any user-data path
- Onboarding to the project (or onboarding a security reviewer)
- Investigating an incident — "what should already be defending us here?"
- Planning a feature that introduces a new trust boundary

CLAUDE.md carries the short "must-know rules" summary in its Security posture
section. This doc is the long-form reference behind it. **If anything here
disagrees with the running code, the code wins — open a follow-up to fix the
drift.**

**Last full audit:** 2026-05-25 (defensive review pass)
**Prior audit:** 2026-05 (original hardening pass referenced throughout
CLAUDE.md)

**Active hardening campaign (post-2026-05-25 review):**
- 2026-05-25 — **Phase 1 shipped** (commit `eb4bcd2`): closes risks #1
  (refresh-token-in-body), #3 (PII in JWT — email + firstName +
  lastName + tier all removed), and #4 (CSP `connect-src` `https:`
  no-op). See §§1.2, 1.1, and 8.2 below.
- 2026-05-25 — **Phase 2 shipped** (commit `eaf367b`): HIBP
  compromised-password check at registration, password change, and
  password reset. See §4.6 below.
- 2026-05-26 — **Auth-surface parity pass shipped** (commit `97d7da4`):
  password-rules checklist on marketing signup + reset-password,
  email-exists recovery links, password visibility toggles,
  consistent 429/5xx error messages across all 5 auth surfaces.
- 2026-05-26 — **PR 2 shipped** (commit `de87f3e`): Cloudflare Turnstile
  bot-protection on register / login / forgot-password. See §4.7
  below.
- 2026-05-26 — **Resend silent-failure fix shipped** (commit `b1a2e7e`):
  ResendClientOptions.ThrowExceptions=true, message id captured +
  persisted. Admin "Sent" badge now reflects actual delivery. See
  §13 / accepted-as-is for the audit trail.
- 2026-05-26 — **Phase 3 (distributed rate-limit counters) deferred
  with reasoning.** Not a code change — a security-posture decision
  to accept the existing four-layer brute-force defense as
  sufficient now that Turnstile is shipped. See §7.3 (updated) and
  §13 (new accepted-as-is entry).
- 2026-05-27 — **Phase 6 shipped:** per-user `SecurityStamp` column +
  `"stamp"` JWT claim + cached `OnTokenValidated` check. Bumping the
  stamp invalidates every outstanding access token for that user
  within the cache TTL (~2 min, often instant via explicit
  Invalidate). Bumped on admin promote/demote, admin deactivate,
  admin password reset, user password change, and password reset.
  Closes Risk #8 (admin-demotion window). See §1.10 below.
- 2026-05-27 — **Risk #6 shipped:** trial timer now starts at
  email verification (not registration). `EmailVerificationGuardMiddleware`
  blocks every gated endpoint for unverified signed-in users with
  `code: "email_unverified"`. Frontend renders a full-takeover
  verify-email screen (takes precedence over paywall) with a
  resend button, sign-out escape hatch, and a link-landing page
  at `/verify-email`. Closes "sign up with any email, get 10
  days free." See §1.11 below.
- **Open phases:** 4 (TOTP 2FA — deferred at user's request),
  5 (login telemetry + new-device email — next up). Tracked in the
  conversation triage.

---

## 1. Authentication & session management

### 1.1 JWT access tokens
- Signed HS256 with `Jwt:Secret` from configuration (`Program.cs:145`).
- ~60 min TTL.
- `ClockSkew = TimeSpan.Zero` (`Program.cs:163`) — no leniency at the
  expiry boundary. Means clock drift between client and Railway is a
  real concern; symptom is instant 401s after fresh login.
- **Claims (as of 2026-05-25 Phase 1):** `sub` (user GUID), `jti`
  (unique token id), and `role` (only when the user is admin).
  Previously also carried `email`, `firstName`, `lastName`, and `tier`
  — those were continuous PII broadcasts via the `Authorization`
  header on every request, visible to any TLS-inspecting proxy
  (corporate firewall, browser extension, debug tooling, screen
  share). Removed in Phase 1; frontend reads profile data via
  `/v1/users/me` instead (already implemented).

### 1.2 Refresh tokens
- Carrier: `HttpOnly Secure SameSite=None` cookie named `cc_refresh_token`,
  scoped to the parent registrable domain via `Auth:CookieDomain` so
  `app.*` and `api.*` subdomains share it. Without `Domain` set, mobile
  Chrome's tracking-protection blocks the cross-subdomain cookie even
  when both subdomains share the same eTLD+1.
- 90-day expiry on the cookie.
- SHA-256 hashed at rest in `RefreshTokens` table.
- Partial unique index on `TokenHash IS NOT NULL` — prevents the all-NULL
  uniqueness conflict during the legacy column drop migration.
- **The `/refresh` and `/revoke` endpoints do NOT accept a token from
  the request body.** Previously they did, as a localStorage fallback —
  that opened a cross-site CSRF path where any allow-listed origin with
  a malicious page could mint refreshes via cookie OR a stolen body
  token. Cookie-only is the current contract. (`AuthController.cs:103–109`,
  `:131`)
- Atomic rotation via `ExecuteUpdate WHERE RevokedAt IS NULL`. Prevents
  the classic refresh-on-rotation replay race.
- Cap of **5 active refresh tokens per user**. Considered reducing to 3
  in the prior audit; left at 5 because most users have mobile + desktop
  + tablet legitimately.
- **Refresh token NEVER appears in response bodies (as of 2026-05-25
  Phase 1).** `AuthResponse.RefreshToken` is annotated
  `[property: JsonIgnore]` so the field stays on the .NET type (the
  controller still reads it to set the HttpOnly cookie) but is
  omitted from JSON serialization on every endpoint. Brings the
  wire format in line with the documented cookie-only contract.

### 1.3 Password hashing
- BCrypt work factor **12** (OWASP 2024 recommendation).
- Legacy factor-10 hashes are transparently rehashed at factor 12 on
  the user's next successful login.
- `Microsoft.AspNetCore.Cryptography.KeyDerivation` is not used —
  BCrypt is the only hash. Don't mix hash schemes.

### 1.4 Login lockout (per-account)
- **10 failures / 15 minutes** = lockout.
- Persisted on `User.FailedLoginCount` + `User.LockedUntil` — survives
  redeploys and applies globally across replicas. DB-backed, not
  memory-backed. This is the durable brute-force defense.
- Locked-out path runs a dummy BCrypt verification to match
  wrong-password timing — prevents timing-based account enumeration.
- Lockout response copy is identical to "Invalid credentials" so an
  attacker can't probe whether an account exists OR whether it's
  currently locked.

### 1.5 Forgot-password timing
- Unknown-email path executes the same dummy-work pattern (a BCrypt
  cycle + DB query latency) so its end-to-end latency matches the
  registered-email path.
- Response copy is identical ("If that email is registered, a reset
  link has been sent.") regardless of whether the email exists.
- Reset tokens SHA-256 hashed at rest, single-use, expire after 1 hour.

### 1.6 Email verification tokens
- Same SHA-256-at-rest + partial unique index pattern as refresh tokens
  and reset tokens.
- Single-use, expire after 24 hours.
- **NOT required before granting the 10-day trial** — flagged as a
  policy call in the deferred items. An attacker can sign up with any
  email and immediately get 10 days of full access (Risk #6 in the
  2026-05-25 audit).

### 1.7 Password change
- `PATCH /v1/users/me/password` (`UsersController.cs:98`).
- **Requires the current password** before accepting the new one.
- Blocks reuse (new must differ from current).
- **Revokes every other active refresh token for this user** on success
  — assumes a password change is a "someone may have got in" security
  signal and ends other devices' sessions immediately.

### 1.8 Email change
- **NOT exposed to users.** The user cannot self-change their email.
- Admin-only via `AdminController` (`AdminController.cs:192`).
- This closes a major account-takeover lateral path — even if an
  attacker gets in, they can't migrate the account to an email they
  control.

### 1.9 Account self-deletion
- `DELETE /v1/users/me` (`UsersController.cs:487`).
- Hard-deletes the user and **all dependent rows + R2 media**.
- Stays open even during trial-expired lockout, deliberately — a
  locked-out user must always be able to leave with their data.

### 1.10 SecurityStamp + immediate access-token revocation (2026-05-27, Phase 6)
- **Goal:** invalidate every outstanding access token for a user
  within ~2 minutes of any privilege change, without waiting for
  the natural ~60 min JWT expiry. Closes Risk #8 (admin demoted but
  still holds a valid admin JWT for up to an hour).
- **Mechanism:** every JWT carries a `"stamp"` claim = `User.SecurityStamp`
  (32-char random). The JwtBearer `OnTokenValidated` event (wired
  in `Program.cs`) compares the claim to the row's current value
  via `IUserStampService`, which caches per-user lookups for ~2 min.
  Mismatched stamp → `ctx.Fail()` → request gets 401.
- **What bumps the stamp:**
  - Admin promote/demote (closes the demote-window itself)
  - Admin deactivate (paired with refresh-token revoke)
  - Admin password reset
  - User password change (paired with other-device refresh-revoke)
  - User-initiated password reset via the forgot-password flow
- **Why a cache.** Without one, every authenticated request gains
  a DB hit. 2-min TTL absorbs the vast majority of traffic; bumps
  call `Invalidate(userId)` after `SaveChanges` so the change takes
  effect immediately (not after TTL).
- **Legacy-token grace.** JWTs minted before this rollout carry no
  `"stamp"` claim. `OnTokenValidated` treats a missing claim as
  valid — those tokens still die via the ~60 min lifetime check.
  Without this grace, every active user would get force-logged-out
  on deploy.
- **Migration:** `AddSecurityStampToUser` adds the column with empty
  default, then `UPDATE … SET SecurityStamp = gen_random_uuid()::text`
  to give every existing user a unique value. The C# default
  initializer (`Guid.NewGuid().ToString("N")`) covers new users.
- **Files:**
  - `Domain/Models/User.cs` — `SecurityStamp` property
  - `Application/Interfaces/IUserStampService.cs`
  - `Application/Services/UserStampService.cs` (cache + DB lookup)
  - `Application/Services/AuthService.cs` — emits claim, bumps on reset
  - `Api/Controllers/UsersController.cs` — bumps on password change
  - `Api/Controllers/AdminController.cs` — bumps on demote/deactivate
  - `Program.cs` — registers service, wires `OnTokenValidated`
  - `Migrations/20260527005814_AddSecurityStampToUser.cs`
- **Tests:**
  - `SecurityHardeningTests.GeneratedJwt_carries_stamp_claim_matching_user_row`
  - `SecurityHardeningTests.ResetPasswordAsync_bumps_security_stamp`
  - `SecurityHardeningTests.NewlyCreatedUser_gets_unique_security_stamp`
  - `UserStampServiceTests.*` (cache hit, miss, invalidate)

### 1.11 Email verification before trial (2026-05-27, Risk #6)
- **Goal:** stop attackers from signing up with a fake email and
  getting 10 days of full access without ever proving ownership.
  The trial timer now starts at email-verification, not registration,
  and ALL access (read + write) is blocked for unverified accounts.
- **Mechanism:**
  - `AuthService.RegisterAsync` leaves `TrialEndsAt = null` and
    sends a verification email as before. The user is auto-logged-in
    (gets a JWT) but every gated endpoint refuses to serve them.
  - `AuthService.VerifyEmailAsync` sets `EmailVerified = true`, grants
    the 10-day trial (only if currently null — idempotent guard
    against re-verify races), bumps SecurityStamp (so the open
    session's JWT gets force-refreshed and the new one carries
    `verified=true`).
  - JWT carries a `"verified": "true"` claim (present-when-true).
    `EmailVerificationGuardMiddleware` runs after auth, before
    controllers; if the claim is missing or false, returns 402 with
    `code: "email_unverified"` unless the path is on the allowlist.
  - **Defense in depth:** `EntitlementService.HasAccess` ALSO
    requires `EmailVerified=true` — if the middleware were ever
    removed or re-ordered, service-layer writes still refuse.
- **Allowlist** (paths reachable for an unverified signed-in user):
  - `GET /v1/users/me` (verify-screen needs to know who you are)
  - `GET /v1/users/me/capabilities` (state for the screen)
  - `POST /v1/auth/resend-verification` (Resend button)
  - `DELETE /v1/users/me` (account self-delete — same principle as
    trial-expired lockout)
- **Legacy-token grace.** JWTs minted before the rollout don't carry
  the `"verified"` claim. The middleware does a 2-min cached DB
  lookup on `EmailVerified`; verified grandfathered users continue
  uninterrupted (their tokens naturally expire in ~60 min).
- **Backfill migration:** `GrandfatherEmailVerifiedForExistingUsers`
  sets every existing user to `EmailVerified=true`. The new
  rule applies ONLY to users registering post-deploy.
- **Resend endpoint:** `POST /v1/auth/resend-verification` (anonymous,
  rate-limited 10/60s like the other pre-auth endpoints). Privacy
  posture mirrors forgot-password — silent no-op for unknown
  emails or already-verified users; controller returns the same
  generic response either way. Drops any outstanding live
  verification tokens before issuing a fresh one.
- **Frontend:**
  - `VerifyEmailScreenComponent` (full-takeover, sibling to paywall)
    — fires on `capabilities.emailVerified === false`. Resend
    button with 30s cooldown + sign-out escape hatch.
  - `VerifyEmailPage` (`/verify-email?token=...`) — landing page for
    the link in the email. Success → auto-redirect to dashboard
    after 3s; failure → "request a new link" copy.
  - `AuthService.showVerifyEmail` signal; `showPaywall` is now
    suppressed when this is true so the two takeovers never compete.
- **Files:**
  - `Application/Services/AuthService.cs` — verify grants trial +
    bumps stamp; new `ResendVerificationAsync`; register sets null
  - `Application/Interfaces/IAuthService.cs`
  - `Application/Services/EntitlementService.cs` — `HasAccess` adds
    EmailVerified gate
  - `Application/DTOs/AuthDtos.cs` — new `ResendVerificationRequest`
  - `Api/Controllers/AuthController.cs` — new resend endpoint
  - `Api/Controllers/UsersController.cs` — capabilities exposes
    EmailVerified
  - `Common/EmailVerificationGuardMiddleware.cs`
  - `Program.cs` — wires middleware + rate-limit rule
  - `Migrations/20260527011709_GrandfatherEmailVerifiedForExistingUsers.cs`
  - Frontend: `shared/verify-email-screen/`,
    `features/auth/verify-email/`, `core/services/api.service.ts`
    (new methods), `core/services/auth.service.ts` (showVerifyEmail),
    `core/interceptors/auth.interceptor.ts` (402 comment), `app.ts`
    (overlay slot), `app.routes.ts` (new route),
    `core/models/models.ts` (capabilities field)
- **Tests:**
  - `SecurityHardeningTests.Register_does_not_grant_trial_until_email_verified`
  - `SecurityHardeningTests.VerifyEmail_grants_trial_and_bumps_stamp`
  - `SecurityHardeningTests.VerifyEmail_idempotent_for_trial_start`
  - `SecurityHardeningTests.ResendVerification_silently_noops_for_already_verified_user`
  - `SecurityHardeningTests.ResendVerification_silently_noops_for_unknown_email`
  - `SecurityHardeningTests.ResendVerification_replaces_existing_live_token`
  - `SecurityHardeningTests.EntitlementService_HasAccess_false_for_unverified_user_even_in_trial_window`

---

## 2. Authorization

### 2.1 Default posture
- Every authenticated controller carries class-level `[Authorize]`.
- No fallback `RequireAuthenticatedUser` policy is set globally —
  endpoint-by-endpoint annotation is the source of truth. This means
  a newly-added controller that forgets `[Authorize]` would be
  anonymous by default. **Mitigation: include this in PR checklist
  for new controllers.**

### 2.2 Admin authorization
- Two equivalent patterns in use:
  - `[Authorize(Roles = "Admin")]` — direct role check
  - `[Authorize(Policy = "AdminOnly")]` — policy defined as
    `RequireRole("Admin")` (`Program.cs:169`)
- Functionally identical. Inconsistency is cosmetic. Don't refactor
  for its own sake; do match the surrounding controller's pattern when
  adding new admin endpoints.

### 2.3 Anonymous endpoints (complete inventory)
Every `[AllowAnonymous]` route in production has been deliberately
chosen and justified:

| Endpoint | Why anonymous | Auth substitute |
|---|---|---|
| `POST /v1/auth/register` | Pre-auth surface | Rate-limited 10/60s |
| `POST /v1/auth/login` | Pre-auth surface | Rate-limited 10/60s + per-account lockout |
| `POST /v1/auth/refresh` | Cookie-based auth | Cookie validation |
| `POST /v1/auth/revoke` | Cookie-based auth | Cookie validation |
| `GET /v1/auth/verify-email` | Token in URL | Hashed token validation, single-use |
| `POST /v1/auth/forgot-password` | Pre-auth | Rate-limited 10/60s + dummy-work timing |
| `POST /v1/auth/reset-password` | Pre-auth | Hashed token validation, single-use |
| `GET /v1/faq/public` | Marketing-side public FAQ | No PII; published-only filter |
| `GET /v1/media/{mediaId}` | Inline image serving | URL-signed token cross-checks `mediaId` AND `signedUserId` against the row owner (`MediaController.cs:71–77`) |
| `GET /v1/media/file/{fileName}` | Dev-only local file serve | **Guarded `if (!env.IsDevelopment()) return NotFound()`** — effectively dead in production |
| `POST /v1/stripe/webhook` | Stripe-initiated | Webhook signature verified via `EventUtility.ConstructEvent` before any state change |

### 2.4 IDOR protection
- Every entry/draft/journal/tag/reminder/action-item query is scoped by
  the authenticated `UserId` in a `Where(x => x.UserId == userId)`
  clause. Spot-checked across `EntryService`, `DraftService`,
  `JournalService`, `TagService`.
- Media serve cross-checks `signedMediaId == requested mediaId` AND
  `signedUserId == row owner` before returning bytes.

### 2.5 Admin audit logging
- `IAuditService` records: promote/demote, tier change, activate/deactivate,
  password reset, delete user, pause cancel/clear.
- `SetActive(false)` **immediately revokes the target user's refresh
  tokens** in the same transaction.
- Admin demotion does NOT revoke the demoted user's existing access
  token — that token lives until its ~60min TTL. Flagged as Risk #8
  in the 2026-05-25 audit (admin-demotion-window vulnerability).

---

## 3. Stripe webhook hardening

### 3.1 Signature verification
- `EventUtility.ConstructEvent(payload, signature, _cfg.WebhookSecret)`
  (`StripeService.cs:74`). Standard correct pattern — verifies the HMAC
  before any state change.

### 3.2 Idempotency
- `ProcessedStripeEvents` table keyed on Stripe event ID. Replays no-op
  (the event row already exists; the handler exits early).

### 3.3 Cross-checks
- Checkout completion cross-checks `customer.email == user.email`. A
  checkout for someone else's email cannot grant your account a
  subscription.

### 3.4 Downgrade gating
- **`InvoicePaymentFailed` does NOT downgrade.** Final cancellation
  comes only via `customer.subscription.updated` or `.deleted`. Avoids
  accidentally locking users out on a transient card decline that
  Stripe will retry through dunning.

### 3.5 Rate-limit whitelist
- `post:/v1/stripe/webhook` is exempt from the global write rate limit
  (`Program.cs:215`) because Stripe retries with back-off — a 429 would
  silently drop subscription state changes after Stripe gives up.
  Signature verification is the auth gate.

---

## 4. Input handling, content safety, validation

### 4.1 Image processing
- **ImageSharp** pinned to `3.1.10` (the high-sev CVE that ended the
  3.x line is closed in this patch).
- **50MP decompression-bomb guard** via `Image.IdentifyAsync` BEFORE
  `Image.LoadAsync` — rejects pixel-dimension explosions before they
  allocate buffer memory.
- 4.x major bump is a deferred item (breaking API changes; scoped as
  a separate focused PR).

### 4.2 HTML sanitization
- **HtmlSanitizer 9.0.892**, locked to an explicit tag/attribute/URL-scheme
  allowlist.
- Inline `style` attributes **blocked** (so an attacker can't smuggle
  CSS-based exfil or display tricks).
- Non-`http(s)/mailto` URL schemes **blocked** (no `javascript:`,
  `data:`, `file:`, etc.).
- Applied to any user-submitted rich text before persistence.

### 4.3 Upload size limits
- `[RequestSizeLimit(25 * 1024 * 1024)]` on the journal media upload
  endpoint (`MediaController.cs:26`).
- Separate `MaxProfileImageBytes` cap on `POST /v1/users/me/profile-image`.
- Cap enforced by ASP.NET before the request body fully arrives —
  attacker can't tie up resources by sending a giant body.

### 4.4 Per-entry limits
- Configurable via `EntryLimitsConfig`. Currently:
  - Max words per entry: 2,500
  - Max images per entry: 20
  - Allowed image MIME types only
- Server-enforced, NOT client-trusted. Frontend mirrors the same caps
  for UX, but the backend re-checks.

### 4.5 Other server-enforced caps
- To-do items: **100 active** per user (server-enforced).
- Tags per entry: configurable via `EntryLimitsConfig`.
- Reminder slots: **5 fixed**, lazy-created on first GET.
- Refresh tokens: 5 active per user (see §1.2).

### 4.6 HIBP compromised-password check (2026-05-25, Phase 2)
- **Goal:** reject passwords that have appeared in known public
  breaches before we accept them. Defends against credential
  stuffing (the dominant modern brute-force vector — attackers
  replay breach lists rather than guessing).
- **API:** Have I Been Pwned "Pwned Passwords" range endpoint
  (`https://api.pwnedpasswords.com/range/{prefix}`). Free, no
  account, no API key.
- **Privacy posture:** k-anonymity protocol. We SHA-1 hash the
  password locally and send only the first 5 hex characters of
  the hash. HIBP returns ~500 candidate suffixes (padded via
  `Add-Padding: true` header so response size leaks nothing
  about the prefix). We check our suffix locally. **The
  password and the full hash never leave our server.**
- **Call sites:**
  - `AuthService.RegisterAsync` — first thing the method does,
    before the email-exists check.
  - `AuthService.ResetPasswordAsync` — runs before the reset
    token is consumed, so a compromised new password rejection
    doesn't burn the user's valid token.
  - `UsersController.ChangePassword` — runs AFTER the current-
    password verification, so HIBP is only called for proven
    authenticated callers (no random-probe oracle).
- **Fail-open:** any transport error (timeout, DNS failure, 5xx,
  malformed body) is caught in `HibpPasswordSafetyService`,
  logged via the standard logger (so Sentry picks it up), and
  the password is allowed through. HIBP outages must never
  block legitimate users.
- **Timeout:** 1 second per check.
- **User-facing error:** *"This password has appeared in a
  public data breach. Please choose a different one for your
  safety."* — returned as 400 Bad Request from the controller.
- **Files:**
  - `Application/Interfaces/IPasswordSafetyService.cs`
  - `Infrastructure/Services/HibpPasswordSafetyService.cs`
  - Wired in `Program.cs` via `AddHttpClient<IPasswordSafetyService, HibpPasswordSafetyService>`
- **Tests:** `AuthServiceTests.Register_CompromisedPassword_Rejected`,
  `AuthServiceTests.ResetPassword_CompromisedPassword_Rejected`,
  plus the test fixture's `NullPasswordSafetyService` for tests
  that exercise other paths.

### 4.7 Cloudflare Turnstile bot-protection (2026-05-26)
- **Goal:** reject automated traffic at the three public-facing
  auth endpoints (register / login / forgot-password) before it
  hits any business logic. Closes the bot-signup, credential-
  stuffing, and forgot-password-flood vectors.
- **Service:** Cloudflare Turnstile, "Managed" widget mode
  (auto-decides invisible vs interactive based on Cloudflare's
  risk signals). 1M requests/month free.
- **Hostnames covered:** `creatorcompanionapp.com` and
  `app.creatorcompanionapp.com` — both registered with the widget.
- **Frontend:**
  - Script loaded once globally in `index.html` (Angular app)
    and `signup.html` (marketing) with `render=explicit` + async +
    defer.
  - Shared `TurnstileComponent` (`web/.../shared/turnstile/`)
    wraps the mount/unmount/reset lifecycle for the Angular
    surfaces; marketing's standalone signup duplicates the same
    pattern in vanilla JS.
  - Site key in `environment.production.ts` (real key) and
    `environment.ts` (Cloudflare's always-pass test key
    `1x00000000000000000000AA` for local dev).
  - Token is single-use; widget is reset after any submit failure
    so retries always get a fresh token.
- **Backend:**
  - `ITurnstileVerifier` interface, `CloudflareTurnstileVerifier`
    implementation. Typed `HttpClient` with 5-second timeout,
    base URL `https://challenges.cloudflare.com/`.
  - Wired into `AuthController.Register / Login / ForgotPassword`
    via a private `RequireHumanAsync` helper that runs BEFORE any
    business logic. Token verification at the front of the
    pipeline means a bot never touches password hashing, lockout
    counters, or the email send.
  - Secret key in Railway env var `Turnstile__SecretKey`
    (double underscore). Local dev leaves this blank — verifier
    becomes a no-op and logs a warning at every call.
- **Failure posture:** **fail closed**. Missing token, invalid
  token, Cloudflare API error, network timeout — all reject the
  request with 403 + `code: "turnstile_failed"`. Unlike HIBP
  (which fails open because it's an additional layer), Turnstile
  IS the bot defense; failing open would defeat the purpose.
  Cloudflare's siteverify runs at 99.99%+ availability so the
  false-positive lockout risk is tiny.
- **Operator escape hatch:** blanking `Turnstile__SecretKey` in
  Railway disables Turnstile entirely (verifier returns true,
  logs warning). Lets an emergency operator turn it off without
  a code deploy. Documented as the explicit posture for any env
  that doesn't have the key configured.
- **CSP updates:** `https://challenges.cloudflare.com` added to
  `script-src` and `frame-src` in both `web/.../vercel.json`
  and `marketing/vercel.json`.

---

## 5. At-rest encryption + privacy of stored content

### 5.1 Platform-level
- **Postgres at rest** — Neon platform default.
- **R2 at rest** — Cloudflare platform default.

### 5.2 Application-layer envelope encryption
- Entry content + media bytes + media filenames encrypted with a
  per-content data key, sealed with the master key from
  `Entry:EncryptionKey` config.
- Implemented in `EntryEncryptor.cs` + `MediaUrlSigner.cs`.
- `ContentEncryptionMigrator` background-encrypts any legacy plaintext
  rows that pre-date the May 2026 rollout.
- **Magic-byte check on the blob** disambiguates encrypted vs. legacy
  plaintext in `MediaController.Serve` so the migrator can run lazily
  without breaking image serving mid-migration.

### 5.3 Token hashing at rest
- Refresh tokens, password reset tokens, email verification tokens —
  all SHA-256 hashed before storage. Even a DB dump leak does not
  yield usable tokens.
- Legacy plain `Token` columns retained during 30-day rotation window;
  follow-up migration drops them ~June 2026.

---

## 6. Soft delete + lifecycle cleanup

### 6.1 Trash retention
- Entries soft-deleted (`DeletedAt` timestamp) for **48 hours**.
- After 48 hours, hard-deleted by `ReminderBackgroundService.PurgeExpiredTrashAsync`.

### 6.2 R2 cleanup paths
Three paths that delete user content also clean orphaned R2 media:
- Entry hard-delete (after the 48h trash window)
- Self-account-delete (`DELETE /v1/users/me`)
- Admin-delete-user

### 6.3 Known gap
- **Storage-upload-before-DB-row** can orphan an R2 blob if the
  `SaveChanges()` fails after the upload succeeds. Periodic R2
  reconciliation job is the right answer; deferred as bigger infra
  work. Flagged as Risk #7 in the 2026-05-25 audit.

---

## 7. Network-level controls

### 7.1 CORS
- **Production:** strict allowlist from `Cors:AllowedOrigins` config.
- Allowed headers: `Authorization`, `Content-Type`, `Accept`,
  `X-Requested-With` (no wildcards).
- Allowed methods: standard verbs only.
- `AllowCredentials()` required for the cookie-bearing refresh flow.
- **Development:** loose `localhost`/LAN-IP allow only when
  `env.IsDevelopment()`. The prior version had production accidentally
  allowing any `localhost:*` origin (browser extensions, attacker
  pages on the LAN) — that's closed.

### 7.2 Reverse proxy IP resolution
- `UseForwardedHeaders` registered early (`Program.cs:442`) so
  `Connection.RemoteIpAddress` reflects the real client.
- `ForwardLimit = 1` — trust one hop only (Railway's proxy).
- Rate limiter reads from `RemoteIpAddress`, **not** the raw
  `X-Forwarded-For` header. An attacker cannot spoof their IP by
  forging that header.
- `KnownNetworks` is empty (deferred — Railway uses dynamic proxy IPs
  and doesn't publish the range). Current trust-one-hop posture is
  the right answer for a managed platform.

### 7.3 Rate limiting
- Backend: `AspNetCoreRateLimit` library.
- Auth endpoints (login/register/forgot-password/reset-password):
  **10 / 60s per IP**.
- All POST/PUT/PATCH/DELETE globally: **30 / 60s per IP**.
- Counter store: **in-memory** (`MemoryCacheRateLimitCounterStore`).
  Per-process, lost on restart, not shared across replicas. This is
  Risk #5 from the 2026-05-25 audit; **deferred as acceptable on
  2026-05-26** (see §13 for the full reasoning). Short version:
  the IP rate limit is the 4th of four defense layers against
  credential stuffing; the three above it (Turnstile at the door,
  per-account lockout DB-backed, BCrypt-12 per-attempt cost) carry
  the real load, so the in-memory limitation doesn't materially
  weaken the overall posture.

### 7.4 The four-layer brute-force defense (current as of 2026-05-26)

Documented here as a single block so the layering shows clearly
when reading just this section. The 2026-05-26 decision to defer
distributed rate-limit counters rests on this layering.

| Layer | What it does | Where it lives |
|---|---|---|
| **1. Cloudflare Turnstile** | Filters bot traffic at the auth surface before any backend logic runs. Missing or invalid token → 403 with `code: "turnstile_failed"`. Bot-net rotating IPs gets stopped here, not at rate-limit | `§4.7`, `AuthController.RequireHumanAsync` |
| **2. Per-account lockout** | 10 wrong-password attempts in 15 minutes locks the specific user account. **DB-backed** — survives restarts, applies across all instances. Locked path runs dummy BCrypt to match timing | `§1.4` |
| **3. BCrypt work factor 12** | Each wrong-password attempt costs ~250ms of server CPU. Makes per-attempt brute force economically painful even at high request volumes | `§1.3` |
| **4. IP rate limit (this section)** | 10 auth requests / 60s per IP. Soft outer layer — slows casual probing, doesn't stop a determined distributed attacker | `§7.3` |

The IP rate limit's in-memory limitation (counters reset on
restart, don't share across replicas) is meaningful in isolation —
an attacker who knows about it could time attempts around deploys
or split across instances. But in the layered context, any such
attacker still has to:
- defeat Turnstile (the bot vector is essentially closed today)
- AND avoid tripping per-account lockout (10/15min hard cap per
  user, can't be evaded by rotating IPs)
- AND eat BCrypt's 250ms-per-attempt cost (limits per-account
  attempt rate to ~4/sec even with perfect parallelism)

The IP rate limit then becomes "casual probing slowdown" rather
than "primary defense" — and the bar for the casual case is low
enough that an in-memory counter that occasionally resets is
acceptable. A distributed counter store would be defense-in-depth
on a threat that's already heavily defended.

---

## 8. HTTP security headers

### 8.1 API responses (Program.cs:445–460)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0` (deprecated header, explicitly disabled per
  OWASP — CSP is the modern mitigation)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  (skipped on `localhost`)
- **No CSP on API responses** — API doesn't render HTML; correct.

### 8.2 Web app responses (vercel.json)
Sent by Vercel for the frontend project:
- `Content-Security-Policy`:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline'` — `'unsafe-inline'` required by
    Angular runtime; nonce-based CSP refactor is a deferred item
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
  - `font-src 'self' data: https://fonts.gstatic.com`
  - `img-src 'self' data: blob: https:`
  - `connect-src 'self' <api hosts> https://*.r2.dev https://*.r2.cloudflarestorage.com`
    — tightened 2026-05-25 Phase 1 by removing the trailing
    `https:` token that made the named allowlist effectively a
    no-op. The directive is now a real allowlist.
  - `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`
- Cache-Control: long-lived for fingerprinted assets; `no-cache` for
  `index.html`, `sw.js`, `manifest.webmanifest`.

### 8.3 Marketing site headers
- `marketing/vercel.json` carries its own header set with HSTS,
  X-Frame-Options, Referrer-Policy. Marketing is the higher-exposure
  surface (public, indexed) and has the fuller header treatment.

---

## 9. Service worker posture

- `public/sw.js` is **push-only** — no fetch interception, no caching.
- An earlier kill-switch traced an iOS slow-launch to WebKit standalone
  startup, NOT the SW. The SW is deliberately kept minimal pending
  more evidence.
- Push handler validates the payload structure before notifying.

---

## 10. Production error responses

- `Program.cs:417–439` — production exception handler returns generic
  `{ error: "An unexpected error occurred." }` with HTTP 500. **No
  stack traces, no internal info leaks.**
- `NoAccessException` maps to HTTP 402 with the explicit trial-expired
  message — that one is safe to leak because it carries no internal
  detail.
- `DeveloperExceptionPage` only active in development.

---

## 11. Observability hardening (Sentry)

### 11.1 Source map protection
- `angular.json` sets `sourceMap.hidden = true` — `.map` files are
  emitted alongside `.js` bundles but NOT linked via
  `sourceMappingURL`. Browsers don't fetch them.
- `@sentry/cli` uploads `.map` files to Sentry from CI, **then the
  deploy workflow deletes them from `.vercel/output/static` before
  deploy**. Defense in depth — even pattern-matching `/main-XXX.js.map`
  returns 404 from production.

### 11.2 Privacy scrubbing (CRITICAL — do not loosen)
A journaling app where entry content IS the product means user-written
text must never reach a third-party error tracker. Two scrubbing layers:

- **Backend `BeforeSend`** (`Program.cs`):
  - Strips `Authorization` + `Cookie` headers from every event
  - Replaces request body with `[scrubbed]` when URL matches the
    sensitive-route list: `/v1/entries`, `/v1/drafts`, `/v1/journals`,
    `/v1/auth/`, `/v1/users/me`, `/v1/admin/email-templates`
  - **Maintenance note:** add to this list when new content-bearing
    endpoints land

- **Frontend `beforeBreadcrumb`** (`main.ts`):
  - Same URL pattern
  - Drops `body` from XHR/fetch breadcrumbs
  - `beforeSend` strips `Authorization` headers as belt-and-suspenders

- **Session Replay is OFF and stays OFF.** Recording the DOM would
  record the user's writing in real time. If ever turned on, MUST be
  paired with `maskAllText: true` + `blockAllMedia: true`.

- **`SendDefaultPii = false`** on both sides. User context, if set,
  uses the user ID GUID only — never email, name, or IP.

### 11.3 Background worker error capture
- `ReminderBackgroundService`, `SubstackPostingBackgroundService`,
  `ContentEncryptionMigrator` all forward outer-catch exceptions to
  `SentrySdk.CaptureException` alongside `logger.LogError`. Silent
  worker failures in Railway logs were a real prior problem;
  instrumentation is intentional. **Don't strip these.**

---

## 12. Dependency posture

Production NuGet packages (`api/CreatorCompanion.Api/CreatorCompanion.Api.csproj`):
- `AspNetCoreRateLimit` 5.0.0
- `AWSSDK.S3` 3.7.400.3 (for R2's S3-compatible API)
- `BCrypt.Net-Next` 4.1.0
- `HtmlSanitizer` 9.0.892
- `SixLabors.ImageSharp` 3.1.10 (CVE-current within 3.x; 4.x bump deferred)
- `Microsoft.AspNetCore.Authentication.JwtBearer` 10.0.6
- `Npgsql.EntityFrameworkCore.PostgreSQL` 9.0.4
- `Resend` 0.4.0
- `Sentry.AspNetCore` 5.7.0
- `Stripe.net` 51.1.0
- `WebPush` 1.0.12

GitHub Dependabot alerts are the upstream watch mechanism. **Check the
GitHub Security tab when a Dependabot email arrives.**

---

## 13. Deliberately accepted as-is (post-2026-05-25 review)

Things considered during the May 2026 defensive review and decided to
be acceptable in their current form. Re-litigate if the threat model
changes.

| Item | Why accepted |
|---|---|
| `script-src 'unsafe-inline'` in web CSP | Angular runtime needs it; nonce-based CSP is a deeper refactor. Acceptable until we have evidence of XSS attempt. |
| `style-src 'unsafe-inline'` in web CSP | Same Angular constraint. Style injection is a lower-impact XSS vector than script. |
| Stripe webhook is `[AllowAnonymous]` | Required by Stripe's design. Signature verification is the auth gate. |
| `MediaController.ServeFile` is `[AllowAnonymous]` | Dev-only path guarded with `if (!env.IsDevelopment()) return NotFound()`. Dead in production. |
| `FaqController.GetPublic` is anonymous | No PII; published-only filter. |
| JWT `sub` claim contains the user GUID | Standard, correct. |
| CORS uses `AllowCredentials()` | Required for the cookie refresh flow. Locked to the explicit allowlist in production. |
| No CSRF token middleware | Cookie is `SameSite=None; Secure` + CORS allowlist + Origin checks. Cross-origin state-changing requests still need CORS approval. Acceptable for current threat model; an explicit CSRF token would be belt-and-suspenders. |
| In-memory rate-limit counter store (Risk #5 deferral, 2026-05-26) | The IP rate limit is layer 4 of the four-layer brute-force defense (see §7.4). Layers 1–3 — Turnstile at the door, DB-backed per-account lockout, BCrypt-12 per-attempt cost — carry the real load against credential stuffing. The IP limit's role is "casual probing slowdown," not "primary defense." A distributed counter store (Redis, Postgres-backed, or Cloudflare-edge) would close the per-replica / restart-resets gap but adds infrastructure for a threat already heavily defended. Decision: accept the in-memory limitation; revisit if Sentry/Railway logs show real distributed credential-stuffing traffic that's bypassing Turnstile. |

### 13.1 Phase 3 deferral — full reasoning (Risk #5, 2026-05-26)

Spelled out at length because the call rests on a layering argument
that's easy to forget when re-reading just the row above.

**The original finding (2026-05-25 review):** `AspNetCoreRateLimit`
uses `MemoryCacheRateLimitCounterStore`. Counters live in each
.NET process's RAM. Three resulting weaknesses:

1. **Restart-reset.** Every redeploy zeros the counters. An attacker
   timing attempts around our deploy cadence gets free credits.
2. **Per-replica.** If Railway ever scales the API to >1 instance,
   each instance has its own counter. The effective ceiling becomes
   `replicas × 10/60s` per IP.
3. **Per-process, period.** A future process crash + restart has
   the same effect as a redeploy.

**Why the original instinct was Redis.** Standard answer in
`AspNetCoreRateLimit`'s own docs: swap `MemoryCacheRateLimitCounterStore`
for `DistributedCacheRateLimitCounterStore` backed by Redis.
Counters survive restarts, shared across replicas, well-trodden
pattern, ~1 day of work.

**Why we're not doing that now.** Reassessed on 2026-05-26 after
the Turnstile rollout (`de87f3e`) reshaped the threat model.
Documented as the four-layer defense in §7.4. Quick summary:

| Layer | Stops |
|---|---|
| Turnstile (§4.7) | Bot traffic (the dominant credential-stuffing vector) — at the door, before any backend logic |
| Per-account lockout (§1.4) | Targeted per-user brute force — DB-backed, immune to per-replica / restart issues |
| BCrypt-12 (§1.3) | Economic-scale per-attempt cost — ~250ms/attempt regardless of rate limiter |
| IP rate limit (§7.3) | Casual probing slowdown |

The IP rate limit's role demoted from "primary brute-force defense"
to "casual probing slowdown." For an attacker to actually benefit
from the in-memory counter limitation, they would need to:
- defeat Turnstile (currently essentially closed),
- AND attack across enough accounts to evade per-account lockout
  (10 wrong-passwords / 15min hard cap, can't be bypassed by
  rotating IPs),
- AND absorb BCrypt-12's ~250ms-per-attempt cost (limits
  effective rate to ~4/sec/account even at perfect parallelism).

At that point the restart-resets-counter detail is the least of
our problems.

**The added cost of fixing it now:**
- Another service in the stack (Redis on Railway adds ~$5/mo + a
  new outage surface + another credential to rotate).
- OR a Postgres-backed counter table (writes on every authenticated
  request, hot rows, eventual VACUUM pain — not free either).
- OR Cloudflare-edge rate limiting (free tier exists, but means
  we're committing to keeping Cloudflare in front of the API
  permanently — currently we only use Cloudflare for R2 and
  Turnstile).

**Reassess if any of these are true:**
- Sentry shows credential-stuffing traffic at volume that's
  visibly evading Turnstile.
- Railway scales the API horizontally (today it's a single
  instance; the per-replica gap is hypothetical).
- We adopt Cloudflare in front of the API for other reasons —
  edge rate limiting becomes free at that point.
- The threat model changes (e.g., we add a high-value endpoint
  that needs stricter per-IP throttling than the existing
  defense layers cover).

Until then: in-memory is acceptable. The doc admits the gap
honestly; defense-in-depth on a defended threat isn't worth
the infrastructure cost.

---

## 14. Monitoring cadence

Logs and dashboards worth a regular scan:

| Source | What to look for | Cadence |
|---|---|---|
| Sentry (backend project) | New error categories, 4xx/5xx spikes, events from sensitive routes that still carry a body field | Daily glance, weekly deep dive |
| Sentry (frontend project) | XHR/fetch failures clustered on auth endpoints, new unhandled errors after release | Daily glance, weekly deep dive |
| Railway logs (api service) | `FailedLoginCount` increments on real user emails (credential stuffing), `LockedUntil` set on accounts you didn't expect | Weekly |
| Stripe dashboard → Events | `customer.subscription.*` with unexpected email mismatches; webhook delivery failures (signature mismatch or our endpoint rejecting) | Weekly |
| Cloudflare R2 | Storage usage growth vs. user count growth — divergence may indicate the orphan-blob leak | Monthly |
| GitHub Security tab | Dependabot alerts on backend (.NET) and frontend (npm) deps | Whenever GitHub emails |
| GitHub Actions | `deploy.yml` per-push verification; `health-check.yml` daily live-SHA + `/health` probe. Both fire email on red. | Auto-alerts; just verify email delivery still works |

---

## 15. Open risks (active, tracked separately)

The 2026-05-25 defensive review surfaced eight findings. As they're
closed, they move into the implemented sections above. Current
state:

**Closed:**
- ~~#1 Refresh token returned in response bodies~~ → closed
  2026-05-25 Phase 1. See §1.2.
- ~~#3 Email + name + tier claims in JWT~~ → closed 2026-05-25
  Phase 1 (broader than originally scoped — all unused PII
  claims removed). See §1.1.
- ~~#4 CSP `connect-src` includes `https:`~~ → closed 2026-05-25
  Phase 1. See §8.2.
- ~~#8 Admin demotion window~~ → closed 2026-05-27 Phase 6.
  SecurityStamp bump on demote (+ activate/deactivate, password
  change/reset) invalidates outstanding access tokens within the
  2-min cache TTL via `OnTokenValidated`. See §1.10.
- ~~#6 Email verification not required before trial granted~~ →
  closed 2026-05-27. Trial timer now starts at verification;
  `EmailVerificationGuardMiddleware` blocks all access pre-verify
  except a small allowlist; backfill migration grandfathers
  existing users so they're unaffected. See §1.11.

**Deferred with reasoning (still risks, but accepted as-is):**
- **#5** — Rate limit counters in-memory only (not distributed).
  Deferred 2026-05-26 after Turnstile rollout reshaped the threat
  model. IP rate limit is now layer 4 of a four-layer defense
  (§7.4); the in-memory limitation is "casual probing slowdown
  occasionally resets" rather than "primary defense fails open."
  Full reasoning in §13.1. Revisit if Sentry shows distributed
  credential-stuffing evading Turnstile, or if we ever scale the
  API horizontally on Railway.

**Open:**
- **#2** — Push subscription silent take-over
  (`PushController.Subscribe`). Needs threat-model discussion.
  *(#6 moved to Closed — see Risk #6 closure above.)*
- **#7** — Storage upload before DB row commit (R2 orphan
  reconciliation). Operational, not security-critical.
  *(#8 moved to Closed — see Phase 6 above.)*

**New defenses added (not closure of original findings, but new
controls):**
- 2026-05-25 Phase 2: HIBP compromised-password check. See §4.6.
- 2026-05-26: Cloudflare Turnstile bot-protection on
  register/login/forgot-password. See §4.7. Materially reshaped
  the brute-force threat model — see §7.4 for the layering.

---

## 16. How this doc stays accurate

- **When a security control changes**, update this doc in the same
  PR as the code change. Otherwise the doc drifts and becomes
  worse-than-no-doc.
- **When a new feature lands** that introduces a trust boundary
  (new endpoint type, new external integration, new data type
  persisted), add it to the appropriate section here. The Sentry
  sensitive-route list in §11.2 is the most common place to update.
- **When an audit happens**, append a row to the "Last full audit"
  block at the top. Don't rewrite past entries — they're history.
- **When a flagged risk gets resolved**, move it from §15 to the
  relevant implemented section and update the inline references.
