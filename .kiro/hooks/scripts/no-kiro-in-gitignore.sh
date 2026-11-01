#!/usr/bin/env bash
# PreToolUse guard: block edits to the repo-root .gitignore that add .kiro.
# stdin = PreToolUse event JSON { tool_name, tool_input, ... }
set -uo pipefail

EVENT="$(cat)"
PATH_="$(printf '%s' "$EVENT" | jq -r '.tool_input.path // .tool_input.file_path // .tool_input.targetFile // .tool_input.file // empty' 2>/dev/null)" || true
[ -z "$PATH_" ] && exit 0

base="$(basename "$PATH_")"
dir="$(dirname "$PATH_")"

if [ "$base" = ".gitignore" ] && {
  [ "$dir" = "/workspaces/trustcheck-ng" ] || [ "$dir" = "." ] || [ "$dir" = "$PWD" ]
}; then
  CONTENT="$(printf '%s' "$EVENT" | jq -r '.tool_input.text // .tool_input.newStr // .tool_input.content // empty' 2>/dev/null)" || true
  # Match ".kiro" or ".kiro/..." as a gitignore entry (line-start or whitespace-prefixed).
  if printf '%s\n' "$CONTENT" | grep -Eq '(^|[[:space:]])\.kiro(/.*)?($|[[:space:]])'; then
    echo "BLOCKED (no-kiro-in-gitignore): Do not add '.kiro' to .gitignore — specs, steering, and hooks must stay tracked. (project hard rule)" >&2
    exit 2
  fi
fi

exit 0
