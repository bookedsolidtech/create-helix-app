#!/usr/bin/env node
/**
 * Benchmark regression checker for CI.
 *
 * Usage:
 *   node scripts/bench-ci.mjs [--baseline tests/benchmarks/baselines.json] [--results bench-results.json]
 *
 * Reads vitest bench JSON output (via `--outputJson=<path>`) and compares each
 * benchmark's mean time against the stored baselines. Emits a warning (not an
 * error) when a benchmark exceeds REGRESSION_THRESHOLD above its baseline mean.
 *
 * Baselines are raw means from the machine that regenerated them, so the
 * threshold is deliberately generous: it absorbs the dev-laptop-vs-CI-runner
 * speed gap while still flagging egregious slowdowns.
 *
 * Exit code: 0 always (warn-only — regressions never block CI).
 *
 * Regenerate baselines:
 *   pnpm run bench:update-baselines
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBenchResults } from './lib/parse-bench-json.mjs';

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

// Warn only when a run is >6x its baseline mean. Baselines are raw means
// captured on whatever machine regenerated them (typically a fast dev laptop),
// and CI runners are routinely 2-3x slower on this I/O-bound scaffolding work —
// so the threshold has to clear that environment gap with margin to spare, or
// ordinary CI variance reads as a "regression." 5.0 (warn at >6x baseline)
// keeps ~2x headroom over the worst expected CI slowdown while still surfacing
// the order-of-magnitude regressions this coarse, warn-only check exists for.
const REGRESSION_THRESHOLD = 5.0;

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
    `[bench-ci] Run: pnpm run bench -- --outputJson=${path.relative(ROOT, resultsPath)}`,
  );
  process.exit(0);
}

/** @type {{ benchmarks: Record<string, { meanMs: number }> }} */
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

/** @type {unknown} */
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

// Parse vitest 4 bench JSON (see scripts/lib/parse-bench-json.mjs) into a
// "<describe> > <name>" -> mean (ms) map, keyed to match baselines.json.
const currentResults = parseBenchResults(results);

if (currentResults.size === 0) {
  console.warn('[bench-ci] No benchmark results found in results file — skipping regression check');
  console.warn('[bench-ci] Ensure vitest bench ran with --outputJson');
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

  if (!(baselineMean > 0)) {
    console.warn(
      `[bench-ci] SKIP     "${name}" — non-positive baseline (${baselineMean}); cannot compute a ratio`,
    );
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
