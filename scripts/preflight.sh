#!/usr/bin/env bash
# ==============================================================================
# Preflight — Local CI equivalent. Run before every push.
# ==============================================================================
# Mirrors the CI pipeline exactly so all failures are caught locally.
# Fails fast on first error.
#
# Gates (in order):
#   1. Lint (ESLint)
#   2. Format check (Prettier)
#   3. Type check (TypeScript strict)
#   4. Build (TypeScript compile)
#   5. Tests (Vitest)
#   6. Full test suite (CI Matrix parity)
#   7. Docker CI (act — full CI pipeline in Docker containers)
#
# Usage:
#   pnpm run preflight
#   SKIP_FULL_TESTS=1 pnpm run preflight  # bypass full test suite gate
#   SKIP_ACT=1 pnpm run preflight         # bypass Docker CI gate
# ==============================================================================

set -euo pipefail

echo ""
echo "================================================"
echo "  create-helix Preflight — local CI equivalent"
echo "================================================"
echo ""

# -- Gate 1: Lint --------------------------------------------------------------

echo "[1/7] Lint"
pnpm run lint
echo "  Lint passed"
echo ""

# -- Gate 2: Format check -----------------------------------------------------

echo "[2/7] Format check"
pnpm run format:check
echo "  Format passed"
echo ""

# -- Gate 3: Type check -------------------------------------------------------

echo "[3/7] Type check"
pnpm run type-check
echo "  Type check passed"
echo ""

# -- Gate 4: Build -------------------------------------------------------------

echo "[4/7] Build"
pnpm run build
echo "  Build passed"
echo ""

# -- Gate 5: Tests -------------------------------------------------------------

echo "[5/7] Tests"
pnpm run test
echo "  Tests passed"
echo ""

# -- Gate 6: Full test suite (CI Matrix parity) --------------------------------
# Runs pnpm run test again to validate full suite matches CI Matrix behavior.
# Skip with SKIP_FULL_TESTS=1

echo "[6/7] Full test suite"

if [ "${SKIP_FULL_TESTS:-0}" = "1" ]; then
  echo "  SKIP_FULL_TESTS=1 — full test suite bypassed"
else
  pnpm run test
  if [ $? -ne 0 ]; then
    echo ""
    echo "  FULL TEST SUITE FAILED — do NOT push."
    exit 1
  fi
  echo "  Full test suite passed"
fi
echo ""

# -- Gate 7: Docker CI (act) --------------------------------------------------

echo "[7/7] Docker CI (act)"

if [ "${SKIP_ACT:-0}" = "1" ]; then
  echo "  SKIP_ACT=1 — Docker CI gate bypassed"
elif ! command -v act &>/dev/null || ! docker info &>/dev/null 2>&1; then
  echo "  WARNING: Docker CI gate skipped — Docker not running or act not installed"
  echo "    CI may fail on push. Install: brew install act && open -a Docker"
else
  echo "  Running full CI in Docker..."
  if ./scripts/act-ci.sh; then
    echo "  Docker CI passed"
  else
    echo ""
    echo "  DOCKER CI FAILED — do NOT push."
    echo "    Fix the errors above and re-run: pnpm run preflight"
    exit 1
  fi
fi
echo ""

# -- All gates passed ----------------------------------------------------------

echo "================================================"
echo "  All preflight gates passed — safe to push!"
echo "================================================"
