#!/usr/bin/env bash
#
# Build, package, and install the Automatos cockpit into your local editor.
# One command instead of `npm run seed` + F5 (which only ever ran a throwaway
# Extension-Development window). After this, the cockpit is a real installed
# extension: open ANY workspace and the Automatos icon is in the Activity Bar.
#
#   ./scripts/install-extension.sh            # installs into VS Code (default)
#   ./scripts/install-extension.sh cursor     # installs into Cursor instead
#
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-code}"

echo "==> Packaging extension (.vsix)…"
npm run package --silent

VSIX="$(ls -t ./*.vsix 2>/dev/null | head -1)"
if [ -z "${VSIX:-}" ]; then
  echo "No .vsix was produced — aborting." >&2
  exit 1
fi
echo "==> Built: $VSIX"

# Resolve a VS Code-family CLI: prefer one already on PATH, else the macOS
# app bundle for the well-known editors.
resolve_cli() {
  if command -v "$1" >/dev/null 2>&1; then command -v "$1"; return 0; fi
  local p=""
  case "$1" in
    code)          p="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ;;
    cursor)        p="/Applications/Cursor.app/Contents/Resources/app/bin/cursor" ;;
    code-insiders) p="/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders" ;;
  esac
  if [ -n "$p" ] && [ -x "$p" ]; then echo "$p"; return 0; fi
  return 1
}

if CLI="$(resolve_cli "$TARGET")"; then
  echo "==> Installing into: $CLI"
  "$CLI" --install-extension "$VSIX" --force
  echo ""
  echo "Done. Reload the editor (Cmd+Shift+P → 'Developer: Reload Window'),"
  echo "then click the Automatos icon in the Activity Bar."
else
  echo "Couldn't find a '$TARGET' CLI on this machine." >&2
  echo "Install it by hand: VS Code → Extensions panel → '…' menu →" >&2
  echo "'Install from VSIX…' → choose:" >&2
  echo "  $PWD/${VSIX#./}" >&2
  exit 1
fi
