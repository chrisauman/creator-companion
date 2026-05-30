# Staging environment (plan)

Status: **PLAN — future, after launch + backups.** Not built yet. This doc
captures the design so we can stand it up cleanly when the time comes.

Goal: a mirrored, isolated environment to develop + extensively test new
features (esp. the bigger Marketing follow-ons) against **fake data**
before they ever touch real users.

Last updated: 2026-05-30.

---

## Model

- **Branching:** `staging` branch → staging environment; `main` →
  production. Feature branches also get free Vercel **preview URLs**, so
  quick visual checks don't even need staging.
- **Frontend (Vercel):** preview/staging deploys are **free on Hobby**.
  Point `staging-app.creatorcompanionapp.com` at the `staging` branch.
- **Backend (Railway):** a **second Railway environment/service** deploying
  from `staging`, with its **own Postgres** and its own env vars.
- **CI:** extend `.github/workflows/deploy.yml` so `staging` pushes deploy
  to the staging targets, reusing the per-push verification pattern.

## The critical part: data + secrets isolation

A naive "mirror" leaks private data or real-world side effects. Rules:

1. **Staging gets its OWN database — never point it at prod.** And its
   **own `Entry__EncryptionKey`**, never the production key.
2. **Do NOT copy real user journal content into staging.** It's users'
   private writing, and copying it would spread the crown-jewel encryption
   key into a less-trusted environment. Use **synthetic/seed data**. Once
   backups exist, an **anonymized/sanitized** restore is the clean way to
   get realistic-but-safe data.
3. **All third-party services use TEST/sandbox in staging:**
   - **Stripe → TEST keys** (staging must never create real charges).
   - **Resend** → separate key; route all staging email to a single catch
     address so real users never receive test mail.
   - **R2** → separate staging bucket.
   - **Sentry** → staging environment tag (or separate project).
   - **VAPID/push** → separate keys (no real push to users' devices).
   - **Anthropic** → separate/low-limit key.
   - **Marketing auto-poster** → no real social creds + global kill switch
     OFF, so staging can never post to the real Bluesky/Mastodon accounts.
4. **Cookies/CORS:** the refresh-token cookie is domain-scoped and CORS is
   allow-listed — add staging origins; staging cookies must not collide
   with prod.
5. **Account isolation:** staging is another set of accounts/keys — fold it
   into `.claude/account-scope.md` so the guard knows staging vs prod.

## Cost & effort

- **Cost:** incremental. Vercel previews free; the real add is the
  **Railway staging service + its Postgres** (a few $/mo). Stripe test free;
  R2 staging bucket negligible.
- **Effort:** ~half a day. The app already reads all config from env and has
  environment branching in `Program.cs`; the fiddly bits are the secrets
  matrix, DNS/subdomains, and CI wiring — not app code.

## Sequencing

Recommended order: **launch → backups (docs/backups-and-rollback.md) →
staging → then build the bigger Marketing follow-ons against staging.**
Staging's value comes from testing risky new work on fake data first, and
its best data source is a sanitized restore — which depends on the backups
work landing first.

## Action items (when we pick this up)

1. Create `staging` branch + branch→deploy mappings (Vercel + Railway).
2. Provision the staging Railway service + Postgres + its own secrets
   (new encryption key, Stripe TEST, separate Resend/R2/Sentry/VAPID).
3. Seed staging with synthetic data (or wire the sanitized restore).
4. Add `staging-app.` (and `staging-api.` if needed) DNS + CORS + cookie
   scoping.
5. Extend `deploy.yml` with a staging job + health verification.
6. Record staging accounts/keys in `.claude/account-scope.md`.
7. Confirm the Marketing poster + push worker + trial emails are inert in
   staging (no real-user side effects).

## Open questions for Chris

- Dedicated staging subdomain(s) vs a separate staging domain?
- Synthetic seed data only, or invest in the sanitized-restore pipeline?
- Railway plan headroom for a second service + DB.
