#!/usr/bin/env bash
# PreToolUse guard: block real-looking Gemini API keys (AIza…) from being written
# into tracked files or echoed in commands, and block git add/commit of .env files.
# Allowed locations for an AIza key: .env* local files (gitignored) and test fixtures.
# stdin = PreToolUse event JSON { tool_name, tool_input, ... }
set -uo pipefail

EVENT="$(cat)"
TOOL="$(printf '%s' "$EVENT" | jq -r '.tool_name // empty' 2>/dev/null)" || true
PATH_="$(printf '%s' "$EVENT" | jq -r '.tool_input.path // .tool_input.file_path // .tool_input.targetFile // .tool_input.file // empty' 2>/dev/null)" || true
CONTENT="$(printf '%s' "$EVENT" | jq -r '.tool_input.text // .tool_input.newStr // .tool_input.content // .tool_input.command // empty' 2>/dev/null)" || true

if printf '%s' "$CONTENT" | grep -Eq 'AIza[0-9A-Za-z_-]{30,}'; then
  is_env=0
  is_test=0
  case "$PATH_" in
    .env|*/.env|.env.local|*/.env.local|.env.development|*/.env.development|.env.production|*/.env.production|.env.production.local|*/.env.production.local) is_env=1 ;;
  esac
  case "$PATH_" in
    *.test.*|*.spec.*|*/tests/*|*/__tests__/*|*/test/*) is_test=1 ;;
  esac
  if [ "$is_env" = "0" ] && [ "$is_test" = "0" ]; then
    echo "BLOCKED (no-secret-leak): refusing to write/echo a real-looking API key. Put secrets in .env (gitignored) or a test fixture, never a tracked file or command." >&2
    exit 2
  fi
fi

if [ "$TOOL" = "execute_bash" ]; then
  CMD="$(printf '%s' "$EVENT" | jq -r '.tool_input.command // empty' 2>/dev/null)" || true
  # Block git add/commit that explicitly stages a real .env file (not .env.example).
  if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+(add|commit|rm)' &&
     printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])(\.env|\.env\.local|\.env\.development|\.env\.production|\.env\.production\.local)([[:space:]]|$)'; then
    echo "BLOCKED (no-secret-leak): refusing to git add/commit a .env file (secrets must not be committed)." >&2
    exit 2
  fi
fi

exit 0
