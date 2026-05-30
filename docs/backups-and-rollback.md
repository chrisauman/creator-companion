# Backups & rollback

Status: **PLAN — revisit soon.** The release-rollback path works today; the
data-backup path is a **known gap** (see "Action items"). This doc is the
single reference for both, plus the platform retention numbers behind them.

Last updated: 2026-05-30.

---

## Two different "something went wrong" cases — don't conflate them

**A) A bad RELEASE** (logic/UI/config bug, crash). Fix = roll back the
deployment. Frictionless and **lossless** on this stack. Works today.

**B) Lost/corrupted DATA** (accidental mass-delete, destructive migration,
corruption). Fix = restore the database from a backup. Inherently
**destructive + lossy** (you lose writes since the snapshot) and a
**break-glass** procedure, not a routine button. **Currently not possible —
no backups exist yet.**

~90% of incidents are (A) and never touch a backup. Backups exist for the
rare, catastrophic (B): user journal entries live in exactly one place
(Railway Postgres) and are the product.

---

## (A) Release rollback — runbook (works today)

The source of truth is git; pushing to `main` redeploys both frontend
(Vercel) and backend (Railway).

**Primary method — revert + redeploy (covers frontend AND backend):**
```bash
git revert <bad-sha>        # or a range; creates a new commit that undoes it
git push origin HEAD:main   # re-triggers Vercel + Railway deploys
```
Then confirm the live build flipped back:
```bash
curl -s https://app.creatorcompanionapp.com/ | grep -o 'cc-build" content="[a-f0-9]*"'
curl -s https://creator-companion-api-production.up.railway.app/health
```

**Faster frontend-only option — Vercel Instant Rollback:** promote the
previous production deployment (dashboard one-click, or `vercel rollback` /
`vercel promote <url>`). Seconds, no rebuild. NOTE: Vercel **Hobby** can only
roll back to the **single immediately-previous** production deploy.

**Backend-only option — Railway:** redeploy a previous deployment from the
service's "⋯" menu (retained ~2 weeks). Needs dashboard or `RAILWAY_TOKEN`.

**Why backend release-rollback is safe without a DB rollback:** migrations
are append-only + backwards-compatible (project rule), so older code runs
fine against the newer schema. Roll back *code*, leave the *schema*.
Exception: a release that changed data *semantics* or ran a data migration —
that's a (B) situation.

You can ask Claude to do (A): it will identify the last-good SHA, revert,
push, and verify the live SHA flipped.

---

## (B) Data restore — caveats + what we must build first

A data restore is only as good as the prep done BEFORE the incident. You
cannot bolt it on mid-crisis.

**Hard truths:**
- Overwrites the live DB; **any entries written since the snapshot are lost.**
- Only readable if `Entry__EncryptionKey` is unchanged — a restored DB with a
  rotated/lost key is unrecoverable garbage. **The key is a bigger single
  point of failure than the DB itself.**
- Always snapshot the CURRENT state before restoring, and require explicit
  human go-ahead.
- An **untested** backup is not a backup — verify a real restore once.

**Two restore paths (once backups exist):**
- *Offsite `pg_dump` (recommended to build):* `pg_restore`/`psql` against the
  connection string — Claude can run this end-to-end given the DB URL.
  Provider-independent; survives losing the Railway account.
- *Railway built-in:* restore is largely a **dashboard** operation; may not be
  fully automatable. Pro-only PITR (7-day WAL) if upgraded.

---

## Platform retention reference (verified 2026-05-30)

Plan-dependent rows are flagged **[confirm in dashboard]**. Sources linked.

| Platform | What's retained | Notes |
|---|---|---|
| **Railway — DB backups** | None automatic by default; scheduled (daily/wk/mo) or manual, retention per schedule. **PITR = Pro-only**, 7-day WAL. | We're **not** on PITR and have **no schedule configured** → currently **no DB safety net**. [confirm plan] ([backups](https://docs.railway.com/volumes/backups), [PITR](https://docs.railway.com/volumes/point-in-time-recovery)) |
| **Railway — deployments** | History ~**2 weeks**; redeploy/rollback any retained one. | Older-than-retention can't be rolled back. |
| **Vercel — deployments** | **Hobby: 30 days**; 10 most-recent prod + aliased always kept. | We're on Hobby. |
| **Vercel — Instant Rollback** | **Hobby: only the 1 immediately-previous** prod deploy (Pro: any retained). | Pairs with `deploy.yml` per-push verification. ([instant rollback](https://vercel.com/docs/instant-rollback)) |
| **Vercel — runtime logs** | **Hobby: 1 hour** (Pro: 1 day). | Short — don't rely on Vercel logs for forensics; Sentry is the record. |
| **Cloudflare R2 — objects** | Indefinite until deleted. **Versioning OFF by default** → deletes are **permanent**. | App's 48h trash purge hard-deletes R2 media; no second net unless we enable versioning. ([lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)) |
| **Resend — email logs** | **30 days** (all non-Enterprise). | [confirm in dashboard] ([quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)) |
| **Stripe — events** | Full payload **30 days**; activity logs **6 months**. | Not plan-gated. ([event retention](https://support.stripe.com/questions/stripe-event-retention-period)) |
| **Sentry — error events** | Developer/free: **30 days**; Team/Business: 90. | Replay is OFF (privacy posture). [confirm plan] ([retention](https://docs.sentry.io/security-legal-pii/security/data-retention-periods/)) |
| **GitHub — repo** | Indefinite (source of truth). | — |
| **GitHub — Actions logs/artifacts** | Default **90 days** (configurable 1–400). | — |

**Bottom line from the table:** the only irreplaceable data (Postgres
entries, R2 media) has the **weakest** retention — Railway has no configured
backups and R2 versioning is off. Everything else is comfortably covered.

---

## Action items (revisit soon — priority order)

1. **Secure the encryption key + secrets (zero infra, highest impact).**
   Store `Entry__EncryptionKey`, `Jwt__Secret`, Stripe/Resend keys in a
   password manager + an offline copy. A DB backup is worthless without the
   key. Do this first.
2. **Stand up DB backups.** Either configure a Railway scheduled backup
   (and/or upgrade for PITR) OR build an offsite job: daily GitHub Actions
   `pg_dump` → gzip → encrypt → R2, with retention. Recommended: offsite (we
   control it).
3. **Write + TEST a `restore.sh`.** Do one real restore into a scratch DB to
   prove the backup works and time it.
4. **Enable R2 bucket versioning** (recover deleted/overwritten media).
5. **Commit a `rollback` helper** (script + this runbook) so (A) is
   self-documenting for teammates.
6. **(Optional) Pre-deploy snapshot:** CI takes a `pg_dump` tagged with the
   SHA before any migration-bearing deploy → makes "restore to pre-deploy"
   real for the (B) case.

To confirm with Chris: Railway plan tier (backup/PITR options) and Sentry
plan (30 vs 90-day event retention).
