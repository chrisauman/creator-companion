#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# PreToolUse account guard for Creator Companion.
#
# Allow-list model: block any account-touching CLI command that would hit
# anything other than THIS project's expected accounts. Reads the Claude
# Code hook payload (JSON) on stdin; the command under inspection is at
# .tool_input.command. Exit 2 blocks the tool call (stderr is shown to
# the model); exit 0 allows it.
#
# Expected/denied values come from env (set in .claude/settings.json), with
# safe defaults baked in so the guard still works if the env isn't loaded.
#
# Enforcement strength (be honest about this — see .claude/account-scope.md):
#   STRONG  vercel (reads .vercel link + VERCEL_ORG_ID + --scope),
#           git    (reads remote URL + user.email), interactive logins.
#   BEST-EFFORT  gh / railway (their active account lives behind a token
#           the guard can't introspect without running them) — we block
#           wrong --repo and all interactive logins, and trust the token.
# ─────────────────────────────────────────────────────────────────────
set -uo pipefail

EXP_VERCEL_ORG="${CC_VERCEL_ORG:-team_wv6NHwtrOwuk3b1oQXfKWYmm}"
EXP_GH_REPO="${CC_GITHUB_REPO:-chrisauman/creator-companion}"
EXP_GH_HOST="${CC_GIT_SSH_HOST:-github.com-chrisauman}"
EXP_GIT_EMAIL="${CC_GIT_EMAIL:-chris.auman@gmail.com}"
EXP_SENTRY_ORG="${CC_SENTRY_ORG:-chris-auman}"
DENY_VERCEL="${CC_DENY_VERCEL:-sanctuary-projects}"
DENY_GIT_EMAIL="${CC_DENY_GIT_EMAIL:-chris@sanctuarymg.com}"
PROJ="${CLAUDE_PROJECT_DIR:-$(pwd)}"

payload="$(cat)"

# Extract .tool_input.command — jq, then python3, then a crude sed fallback.
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
if [ -z "${cmd:-}" ]; then
  cmd="$(printf '%s' "$payload" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("tool_input",{}).get("command","") or "")
except Exception: pass' 2>/dev/null)"
fi
# Nothing to inspect → allow (non-Bash tools, empty command).
[ -z "${cmd:-}" ] && exit 0

lc="$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')"
block(){ echo "BLOCKED (account guard): $1" >&2; exit 2; }
pass(){  echo "PASS (account guard): $1" >&2; exit 0; }

# 1) Never allow interactive logins — they write GLOBAL cross-account state
#    and are the root cause of credential crossover. Token/env auth only.
case "$lc" in
  *"vercel login"*|*"vercel switch"*)
    block "interactive 'vercel login/switch' writes global auth. Use a project-scoped VERCEL_TOKEN.";;
  *"gh auth login"*|*"gh auth switch"*)
    block "interactive 'gh auth login/switch' writes global auth. Use a project-scoped GH_TOKEN.";;
  *"railway login"*)
    block "interactive 'railway login' writes global auth. Use a project-scoped RAILWAY_TOKEN.";;
esac

# 2) Tools this project does not use — refuse outright (defensive).
if printf '%s' "$lc" | grep -qE '(^|[;&|[:space:]])(wrangler|neonctl)([[:space:]]|$)'; then
  block "this project doesn't use wrangler/neonctl; refusing to run it."
fi

# 3) vercel — verify --scope, VERCEL_ORG_ID, and the local .vercel link.
if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])vercel([[:space:]]|$)'; then
  scope="$(printf '%s' "$cmd" | sed -nE 's/.*--scope[ =]+([^ ]+).*/\1/p')"
  if [ -n "$scope" ] && [ "$scope" = "$DENY_VERCEL" ]; then
    block "vercel --scope '$scope' is the DENIED account."
  fi
  if [ -n "${VERCEL_ORG_ID:-}" ] && [ "${VERCEL_ORG_ID}" != "$EXP_VERCEL_ORG" ]; then
    block "VERCEL_ORG_ID='${VERCEL_ORG_ID}' != expected '$EXP_VERCEL_ORG'."
  fi
  if [ -f "$PROJ/.vercel/project.json" ]; then
    org="$(sed -nE 's/.*"orgId":"([^"]+)".*/\1/p' "$PROJ/.vercel/project.json")"
    if [ -n "$org" ] && [ "$org" != "$EXP_VERCEL_ORG" ]; then
      block ".vercel link orgId '$org' != expected '$EXP_VERCEL_ORG'. Re-link to the Creator Companion org."
    fi
  fi
  pass "vercel → org $EXP_VERCEL_ORG"
fi

# 4) git push / remote — enforce the scoped SSH host + repo on origin.
if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git([[:space:]].*)?[[:space:]](push|remote)([[:space:]]|$)'; then
  url="$(git -C "$PROJ" remote get-url origin 2>/dev/null || true)"
  case "$url" in
    "" ) : ;;  # no origin yet — nothing to enforce
    *"$EXP_GH_HOST:$EXP_GH_REPO"* ) : ;;
    * ) block "origin '$url' is not '$EXP_GH_HOST:$EXP_GH_REPO'. Wrong GitHub account/host.";;
  esac
fi

# 5) git commit / push — enforce author identity (block the Sanctuary email).
if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git([[:space:]].*)?[[:space:]](commit|push)([[:space:]]|$)'; then
  em="$(git -C "$PROJ" config user.email 2>/dev/null || true)"
  if [ "$em" = "$DENY_GIT_EMAIL" ]; then
    block "git user.email is the DENIED identity '$DENY_GIT_EMAIL'. Set it to '$EXP_GIT_EMAIL'."
  fi
  if [ -n "$em" ] && [ "$em" != "$EXP_GIT_EMAIL" ]; then
    block "git user.email '$em' != expected '$EXP_GIT_EMAIL'."
  fi
  pass "git → $EXP_GH_REPO as $EXP_GIT_EMAIL"
fi

# 6) sentry-cli (incl. `npx @sentry/cli`) — verify --org / SENTRY_ORG.
if printf '%s' "$lc" | grep -qE 'sentry-cli|@sentry/cli'; then
  o="$(printf '%s' "$cmd" | sed -nE 's/.*--org[ =]+([^ ]+).*/\1/p')"
  if [ -n "$o" ] && [ "$o" != "$EXP_SENTRY_ORG" ]; then
    block "sentry --org '$o' != expected '$EXP_SENTRY_ORG'."
  fi
  if [ -n "${SENTRY_ORG:-}" ] && [ "${SENTRY_ORG}" != "$EXP_SENTRY_ORG" ]; then
    block "SENTRY_ORG='${SENTRY_ORG}' != expected '$EXP_SENTRY_ORG'."
  fi
  pass "sentry-cli → org $EXP_SENTRY_ORG"
fi

# 7) gh — best-effort: block a wrong --repo; account is governed by GH_TOKEN.
if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])gh([[:space:]]|$)'; then
  r="$(printf '%s' "$cmd" | sed -nE 's/.*(-R|--repo)[ =]+([^ ]+).*/\2/p')"
  if [ -n "$r" ] && [ "$r" != "$EXP_GH_REPO" ]; then
    block "gh --repo '$r' != expected '$EXP_GH_REPO'."
  fi
fi

# Everything else (dotnet, npm, ls, …) is none of our business.
exit 0
