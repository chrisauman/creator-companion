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
- 2026-05-25 — **Phase 2 shipped** (commit TBD on push): HIBP
  compromised-password check at registration, password change, and
  password reset. See §4.6 below.
- **Open phases** (3–6): distributed rate-limit counters, TOTP 2FA,
  login telemetry + new-device email, admin-demotion immediate
  revocation. Tracked in the conversation triage.

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
  Per-process, lost on restart. Flagged as Risk #5 in the 2026-05-25
  audit — the per-account login lockout (§1.4) is the durable
  brute-force defense; this is the soft outer layer.

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

**Open:**
- **#2** — Push subscription silent take-over
  (`PushController.Subscribe`). Needs threat-model discussion.
- **#5** — Rate limit counters in-memory only (not distributed).
  Tracked as Phase 3.
- **#6** — Email verification not required before trial granted.
  Product/policy call.
- **#7** — Storage upload before DB row commit (R2 orphan
  reconciliation). Operational, not security-critical.
- **#8** — Admin demotion window — access token survives
  demotion until TTL. Tracked as Phase 6 (depends on Phase 3 if
  using the Redis-blocklist approach).

**New defenses added (not closure of original findings, but new
controls):**
- 2026-05-25 Phase 2: HIBP compromised-password check. See §4.6.

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
