#!/usr/bin/env bash
# Quality gates: no direct MUI, zero tsc diagnostics, builds clean.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.bun/bin:${PATH}"

echo "==> No direct MUI / Material UI imports"
if command -v rg >/dev/null 2>&1; then
  if rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' \
      -e "@mui/" -e "@material-ui/" -e "from ['\"]@mui" -e "from ['\"]@material-ui" \
      apps packages; then
    echo "ERROR: Direct MUI imports found. Use shared/custom UI packages only." >&2
    exit 1
  fi
else
  if grep -RInE --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
      -e '@mui/|@material-ui/' apps packages; then
    echo "ERROR: Direct MUI imports found. Use shared/custom UI packages only." >&2
    exit 1
  fi
fi
echo "OK: no MUI imports"

echo "==> Typecheck (lint) — zero errors"
bun run lint

echo "==> Build all packages (fail on compile errors)"
# Capture stderr; treat TypeScript/build warnings as failures when present.
BUILD_LOG="$(mktemp)"
if ! bun run build >"$BUILD_LOG" 2>&1; then
  echo "ERROR: build failed" >&2
  cat "$BUILD_LOG" >&2
  rm -f "$BUILD_LOG"
  exit 1
fi
if grep -Eiq 'warning TS|\berror TS|\bERROR\b|⚠|WARNING:' "$BUILD_LOG"; then
  echo "ERROR: build produced warnings/errors (zero-tolerance policy)" >&2
  cat "$BUILD_LOG" >&2
  rm -f "$BUILD_LOG"
  exit 1
fi
rm -f "$BUILD_LOG"
echo "OK: build clean (zero warnings)"

echo "==> Unit coverage ≥90%"
bun run test:unit

echo "==> Integration coverage ≥90% (in-process API; Bun enforces per-file thresholds)"
COV_LOG="$(mktemp)"
if ! DEV_AUTH=true bun test --coverage \
    apps/api/src/api.integration.test.ts \
    apps/api/src/residents.integration.test.ts >"$COV_LOG" 2>&1; then
  echo "ERROR: integration tests or coverage threshold failed" >&2
  cat "$COV_LOG" >&2
  rm -f "$COV_LOG"
  exit 1
fi
# Belt-and-suspenders: require overall lines ≥90 even if Bun table format changes.
if ! awk '/All files/ {
  gsub(/%/, "", $4);
  if ($4+0 < 90) { exit 1 }
  exit 0
}' "$COV_LOG"; then
  echo "ERROR: overall integration line coverage below 90%" >&2
  cat "$COV_LOG" >&2
  rm -f "$COV_LOG"
  exit 1
fi
cat "$COV_LOG"
rm -f "$COV_LOG"

echo "All quality gates passed."
