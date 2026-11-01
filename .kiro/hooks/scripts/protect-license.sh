#!/usr/bin/env bash
# PreToolUse guard: block writes/edits/deletes to the repo-root LICENSE file.
# stdin = PreToolUse event JSON { tool_name, tool_input, ... }
set -uo pipefail

EVENT="$(cat)"
PATH_="$(printf '%s' "$EVENT" | jq -r '.tool_input.path // .tool_input.file_path // .tool_input.targetFile // .tool_input.file // empty' 2>/dev/null)" || true
[ -z "$PATH_" ] && exit 0

base="$(basename "$PATH_")"
dir="$(dirname "$PATH_")"

# Only the project root LICENSE is protected (not other files named LICENSE).
if [ "$base" = "LICENSE" ] && {
  [ "$dir" = "/workspaces/trustcheck-ng" ] || [ "$dir" = "." ] || [ "$dir" = "$PWD" ]
}; then
  echo "BLOCKED (protect-license): The LICENSE file must not be modified. (project hard rule)" >&2
  exit 2
fi

exit 0
