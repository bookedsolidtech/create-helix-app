#!/usr/bin/env node
/**
 * Regenerates tests/benchmarks/baselines.json from a fresh vitest bench run.
 *
 * Usage:
 *   pnpm run bench:update-baselines
 *
 * This script is called automatically by the bench:update-baselines npm script,
 * which first runs `vitest bench --outputJson=bench-results.json` then invokes
 * this script to extract each benchmark's mean time and write baselines.json.
 *
 * Baselines store the raw measured mean (not a padded ceiling) so bench-ci's
 * regression math stays meaningful. Cross-machine headroom — a dev laptop is
 * faster than a CI runner — lives in bench-ci's deliberately generous
 * REGRESSION_THRESHOLD instead, so regenerating here can never shrink a ceiling
 * and start false-tripping CI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBenchResults } from './lib/parse-bench-json.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const resultsPath = path.resolve(ROOT, 'bench-results.json');
const baselinePath = path.resolve(ROOT, 'tests/benchmarks/baselines.json');

if (!fs.existsSync(resultsPath)) {
  console.error(`[update-baselines] Results file not found: ${resultsPath}`);
  console.error('[update-baselines] Run: vitest bench --outputJson=bench-results.json');
  process.exit(1);
}

/** @type {unknown} */
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

/** @type {Record<string, { meanMs: number }>} */
const benchmarks = {};

for (const [name, mean] of parseBenchResults(results)) {
  // Round to 3 significant figures, not 3 decimals — the sub-microsecond
  // micro-benchmarks (~0.0002ms) would otherwise floor to 0 and make bench-ci
  // divide by zero.
  benchmarks[name] = { meanMs: mean > 0 ? Number(mean.toPrecision(3)) : 0 };
}

if (Object.keys(benchmarks).length === 0) {
  console.error('[update-baselines] No benchmark results found in results file.');
  console.error('[update-baselines] Ensure vitest bench ran with --outputJson');
  process.exit(1);
}

const today = new Date().toISOString().split('T')[0];

/** @type {{ _meta: object, benchmarks: typeof benchmarks }} */
const baseline = {
  _meta: {
    description: 'Baseline benchmark results for create-helix scaffold performance.',
    generated: today,
    vitest: '4.x',
    node: process.version,
    note: 'Values are raw measured mean iteration times in milliseconds from the machine that regenerated them. bench-ci compares against these with a deliberately generous, cross-machine REGRESSION_THRESHOLD (warn-only, never fails) so a slower CI runner does not false-trip. Regenerate with: pnpm run bench:update-baselines.',
  },
  benchmarks,
};

fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');

console.log(
  `[update-baselines] Written ${Object.keys(benchmarks).length} baselines to ${path.relative(ROOT, baselinePath)}`,
);
