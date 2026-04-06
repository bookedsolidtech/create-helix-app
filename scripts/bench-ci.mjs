#!/usr/bin/env node
/**
 * Benchmark regression checker for CI.
 *
 * Usage:
 *   node scripts/bench-ci.mjs [--baseline tests/benchmarks/baselines.json] [--results bench-results.json]
 *
 * Reads vitest bench JSON output (via `--reporter=json --outputFile=<path>`) and
 * compares each benchmark's mean time against the stored baselines. Emits a
 * warning (not an error) when any benchmark regresses by more than 20%.
 *
 * Exit code: 0 always (warn-only — regressions never block CI).
 *
 * Regenerate baselines:
 *   pnpm run bench:update-baselines
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

const baselinePath = path.resolve(ROOT, getArg('--baseline', 'tests/benchmarks/baselines.json'));
const resultsPath = path.resolve(ROOT, getArg('--results', 'bench-results.json'));

const REGRESSION_THRESHOLD = 0.2; // 20%

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------

if (!fs.existsSync(baselinePath)) {
  console.warn(`[bench-ci] Baseline file not found: ${baselinePath} — skipping regression check`);
  process.exit(0);
}

if (!fs.existsSync(resultsPath)) {
  console.warn(`[bench-ci] Results file not found: ${resultsPath} — skipping regression check`);
  console.warn(
    `[bench-ci] Run: pnpm run bench -- --reporter=json --outputFile=${path.relative(ROOT, resultsPath)}`,
  );
  process.exit(0);
}

/** @type {{ benchmarks: Record<string, { meanMs: number }> }} */
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

/** @type {unknown} */
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

// ---------------------------------------------------------------------------
// Parse vitest bench JSON output
//
// Vitest bench JSON format (v3.x):
//   { testResults: [ { testFilePath, assertionResults: [ { fullName, duration, ... } ] } ] }
//
// We extract (fullName, duration) pairs. "duration" is the mean time in ms.
// ---------------------------------------------------------------------------

/** @type {Map<string, number>} */
const currentResults = new Map();

if (
  results &&
  typeof results === 'object' &&
  'testResults' in results &&
  Array.isArray(results.testResults)
) {
  for (const fileResult of results.testResults) {
    if (!Array.isArray(fileResult.assertionResults)) continue;
    for (const assertion of fileResult.assertionResults) {
      if (typeof assertion.fullName === 'string' && typeof assertion.duration === 'number') {
        currentResults.set(assertion.fullName, assertion.duration);
      }
    }
  }
}

if (currentResults.size === 0) {
  console.warn('[bench-ci] No benchmark results found in results file — skipping regression check');
  console.warn('[bench-ci] Ensure vitest bench ran with --reporter=json');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Compare against baselines
// ---------------------------------------------------------------------------

let regressionCount = 0;
let checkedCount = 0;

console.log('\n[bench-ci] Performance regression check');
console.log('─'.repeat(60));

for (const [name, { meanMs: baselineMean }] of Object.entries(baseline.benchmarks)) {
  const current = currentResults.get(name);
  if (current === undefined) {
    console.warn(`[bench-ci] MISSING  "${name}" — not present in results (skipped)`);
    continue;
  }

  checkedCount++;
  const ratio = (current - baselineMean) / baselineMean;
  const pctChange = (ratio * 100).toFixed(1);
  const direction = ratio >= 0 ? `+${pctChange}%` : `${pctChange}%`;

  if (ratio > REGRESSION_THRESHOLD) {
    regressionCount++;
    console.warn(
      `[bench-ci] WARNING  "${name}"\n` +
        `           baseline=${baselineMean.toFixed(3)}ms  current=${current.toFixed(3)}ms  change=${direction}  (>${(REGRESSION_THRESHOLD * 100).toFixed(0)}% threshold)`,
    );
  } else if (ratio < -0.1) {
    console.log(
      `[bench-ci] IMPROVED "${name}"\n` +
        `           baseline=${baselineMean.toFixed(3)}ms  current=${current.toFixed(3)}ms  change=${direction}`,
    );
  } else {
    console.log(`[bench-ci] OK       "${name}"  change=${direction}`);
  }
}

console.log('─'.repeat(60));
console.log(`[bench-ci] Checked ${checkedCount} benchmarks`);

if (regressionCount > 0) {
  console.warn(
    `[bench-ci] ${regressionCount} benchmark(s) regressed by >${(REGRESSION_THRESHOLD * 100).toFixed(0)}% — ` +
      `update baselines with: pnpm run bench:update-baselines`,
  );
} else {
  console.log('[bench-ci] No regressions detected.');
}

// Always exit 0 — regressions are warnings, not failures.
process.exit(0);
