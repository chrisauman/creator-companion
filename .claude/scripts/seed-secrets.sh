#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# One-time per-developer setup for Creator Companion account scoping.
#
# Stores THIS project's tokens in your macOS Keychain (default) or a
# gitignored env file, and sets the repo-local git identity. No secret
# ever touches git. Re-run any time to add/rotate a token.
#
# Tokens must come from the CREATOR COMPANION accounts — never Sanctuary:
#   VERCEL_TOKEN        Vercel  → Account Settings → Tokens
#   GH_TOKEN            GitHub (chrisauman) → Settings → Developer settings → PAT
#   RAILWAY_TOKEN       Railway → Account → Tokens
#   SENTRY_AUTH_TOKEN   Sentry (chris-auman) → User Settings → Auth Tokens
# ─────────────────────────────────────────────────────────────────────
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # -> .claude/
repo="$(cd "$here/.." && pwd)"

GIT_NAME="${CC_GIT_NAME:-Chris Auman}"
GIT_EMAIL="${CC_GIT_EMAIL:-chris.auman@gmail.com}"
KEYS=(VERCEL_TOKEN GH_TOKEN RAILWAY_TOKEN SENTRY_AUTH_TOKEN)

echo "Creator Companion — account scope setup"
echo "Tokens are saved to your macOS Keychain (service: creator-companion)."
echo "Press Enter to skip any token you don't have yet."
echo

for k in "${KEYS[@]}"; do
  printf "  %s: " "$k"
  IFS= read -rs v; echo
  v="${v//$'\r'/}"                        # strip stray CR from a paste
  v="${v#"${v%%[![:space:]]*}"}"           # trim leading whitespace
  v="${v%"${v##*[![:space:]]}"}"           # trim trailing whitespace
  [ -z "${v:-}" ] && { echo "    (skipped)"; continue; }
  # Hidden input makes a double-paste easy AND invisible. Echo the
  # captured length so you can sanity-check it (a Vercel token is ~60
  # chars; 120 means it was pasted twice — re-run and paste once).
  echo "    captured ${#v} characters"
  if command -v security >/dev/null 2>&1; then
    security add-generic-password -U -s creator-companion -a "$k" -w "$v" >/dev/null \
      && echo "    -> stored in Keychain"
  else
    # Cross-platform fallback: gitignored env file (chmod 600).
    touch "$here/account.env.local"; chmod 600 "$here/account.env.local"
    grep -vE "^${k}=" "$here/account.env.local" > "$here/account.env.local.tmp" 2>/dev/null || true
    mv -f "$here/account.env.local.tmp" "$here/account.env.local" 2>/dev/null || true
    printf '%s=%s\n' "$k" "$v" >> "$here/account.env.local"
    echo "    -> stored in gitignored .claude/account.env.local"
  fi
done

echo
echo "Setting repo-local git identity…"
git -C "$repo" config user.name  "$GIT_NAME"
git -C "$repo" config user.email "$GIT_EMAIL"
echo "  $(git -C "$repo" config user.name) <$(git -C "$repo" config user.email)>"

echo
echo "Done. The guard enforces the right account on every command."
echo
echo "Claude Code's settings 'env' can't run Keychain lookups per-command,"
echo "so to let a CLI auto-authenticate in your shell, export what you need:"
echo "  export VERCEL_TOKEN=\"\$($repo/.claude/scripts/resolve-secret.sh VERCEL_TOKEN)\""
echo "  export SENTRY_AUTH_TOKEN=\"\$($repo/.claude/scripts/resolve-secret.sh SENTRY_AUTH_TOKEN)\""
