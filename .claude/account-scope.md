# Account scope — Creator Companion

This project is pinned to a specific set of accounts so commands can't
cross over into another project's (notably **Sanctuary**) accounts on a
shared machine. Future sessions and new developers inherit these rules
automatically because the policy is committed; only the secret token
values are per-machine.

This file is the human-readable companion to the machine-enforced guard.
The canonical owner registry lives in `CLAUDE.md → Service accounts`.

## Expected accounts (ALLOW)

| Thing | Must be |
|---|---|
| Vercel org | `team_wv6NHwtrOwuk3b1oQXfKWYmm` (owns `creator-companion-onti` `prj_VtXOth7fmOAnFkaJ8NoL1YgLZT2W` and `creator-companion` `prj_t1qh8HpVcOAl0Qofr6ff6N3Mwree`) |
| GitHub repo | `chrisauman/creator-companion` via SSH host alias `github.com-chrisauman` |
| Git commit identity | `Chris Auman <chris.auman@gmail.com>` |
| Sentry org | `chris-auman` |

## Denied accounts (BLOCK)

| Thing | Denied value |
|---|---|
| Vercel scope/team | `sanctuary-projects` ("Sanctuary") |
| Git commit identity | `chris@sanctuarymg.com` |
| Tools not used here | `wrangler`, `neonctl` (R2 uses the S3 SDK; Postgres is on Railway) |

> Note discovered during setup: the machine's globally-active Vercel CLI
> scope was **Sanctuary** (`vercel teams ls` showed only `sanctuary-projects`,
> `vercel whoami` was "Not authorized"). That is exactly the crossover this
> guard exists to stop.

## How the guard works

- A `PreToolUse` hook (`.claude/scripts/account-guard.sh`, wired in
  `.claude/settings.json`) runs before every Bash command.
- It reads the command, figures out which account it would hit, and
  **exits 2 (block)** if that isn't this project's expected account or if
  it matches the deny-list. It prints a short `PASS` line when correct.
- **Allow-list model:** anything that isn't the expected account is
  blocked — no need to enumerate every wrong account.

### Enforcement strength (honest limits)

- **Strong (deterministic):** `vercel` (reads `.vercel/project.json`,
  `VERCEL_ORG_ID`, and `--scope`), `git` (reads `origin` URL and
  `user.email`), and all interactive logins (`vercel/gh/railway login`).
- **Best-effort:** `gh` and `railway` — their active account lives behind
  a token the guard can't introspect without running them. The guard
  blocks interactive logins and a wrong `--repo`, and otherwise trusts
  that the token in the environment is this project's. Keep the right
  token scoped (see below) and don't run their login commands.

## Secrets — where they live

- **Canonical store:** macOS Keychain, service `creator-companion`
  (one entry per token: `VERCEL_TOKEN`, `GH_TOKEN`, `RAILWAY_TOKEN`,
  `SENTRY_AUTH_TOKEN`).
- **Portable fallback:** a gitignored `.claude/account.env.local`
  (`KEY=value` lines) for machines without Keychain.
- **Resolver:** `.claude/scripts/resolve-secret.sh KEY` reads env →
  gitignored file → Keychain.
- Claude Code's `settings.json` `env` block can't run a Keychain lookup
  per command (values are literal strings), so tokens are **not**
  auto-injected. Export what you need when you want a CLI to authenticate:
  `export VERCEL_TOKEN="$(.claude/scripts/resolve-secret.sh VERCEL_TOKEN)"`.

## First-time setup (per developer / per machine)

```bash
./.claude/scripts/seed-secrets.sh
```
Paste each token from the **Creator Companion** accounts (never Sanctuary).
It stores them in your Keychain and sets the repo-local git identity.
Re-run any time to rotate a token. No secret is ever committed.

## Testing the guard

Pipe a fake hook payload to the guard and check the exit code (`2` = blocked):

```bash
G=.claude/scripts/account-guard.sh
echo '{"tool_input":{"command":"vercel deploy --scope sanctuary-projects"}}' | "$G"; echo "exit=$?"   # blocked
echo '{"tool_input":{"command":"vercel login"}}'                            | "$G"; echo "exit=$?"   # blocked
echo '{"tool_input":{"command":"wrangler deploy"}}'                         | "$G"; echo "exit=$?"   # blocked
echo '{"tool_input":{"command":"dotnet build"}}'                            | "$G"; echo "exit=$?"   # allowed (0)
```
For the git-identity check, point `CLAUDE_PROJECT_DIR` at a temp repo whose
`user.email` is the denied address and confirm a `git commit` payload is blocked.
