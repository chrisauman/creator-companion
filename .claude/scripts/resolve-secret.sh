#!/usr/bin/env bash
# resolve-secret.sh KEY  ->  prints the secret value, or exits 1 if missing.
#
# Lookup precedence (first hit wins):
#   1. process environment ($KEY already set)
#   2. gitignored file  .claude/account.env.local   (KEY=value lines)
#   3. macOS Keychain    service "creator-companion", account KEY
#
# Used by seed-secrets.sh and by anyone who wants to export a token, e.g.
#   export VERCEL_TOKEN="$(.claude/scripts/resolve-secret.sh VERCEL_TOKEN)"
set -uo pipefail
key="${1:?usage: resolve-secret.sh KEY}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # -> .claude/

# 1) already in the environment
existing="$(printenv "$key" 2>/dev/null || true)"
if [ -n "${existing:-}" ]; then printf '%s' "$existing"; exit 0; fi

# 2) gitignored env file
envf="$here/account.env.local"
if [ -f "$envf" ]; then
  line="$(grep -E "^${key}=" "$envf" | tail -1 || true)"
  if [ -n "$line" ]; then printf '%s' "${line#*=}"; exit 0; fi
fi

# 3) macOS Keychain
if command -v security >/dev/null 2>&1; then
  v="$(security find-generic-password -s creator-companion -a "$key" -w 2>/dev/null || true)"
  if [ -n "$v" ]; then printf '%s' "$v"; exit 0; fi
fi

exit 1
