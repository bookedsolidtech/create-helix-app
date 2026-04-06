#!/usr/bin/env node
/**
 * Regenerates tests/benchmarks/baselines.json from a fresh vitest bench run.
 *
 * Usage:
 *   pnpm run bench:update-baselines
 *
 * This script is called automatically by the bench:update-baselines npm script,
 * which first runs `vitest bench --reporter=json --outputFile=bench-results.json`
 * then invokes this script to extract mean times and write baselines.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const resultsPath = path.resolve(ROOT, 'bench-results.json');
const baselinePath = path.resolve(ROOT, 'tests/benchmarks/baselines.json');

if (!fs.existsSync(resultsPath)) {
  console.error(`[update-baselines] Results file not found: ${resultsPath}`);
  console.error(
    '[update-baselines] Run: vitest bench --reporter=json --outputFile=bench-results.json',
  );
  process.exit(1);
}

/** @type {unknown} */
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

/** @type {Record<string, { meanMs: number }>} */
const benchmarks = {};

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
        benchmarks[assertion.fullName] = { meanMs: Math.round(assertion.duration * 1000) / 1000 };
      }
    }
  }
}

if (Object.keys(benchmarks).length === 0) {
  console.error('[update-baselines] No benchmark results found in results file.');
  console.error('[update-baselines] Ensure vitest bench ran with --reporter=json');
  process.exit(1);
}

const today = new Date().toISOString().split('T')[0];

/** @type {{ _meta: object, benchmarks: typeof benchmarks }} */
const baseline = {
  _meta: {
    description: 'Baseline benchmark results for create-helix scaffold performance.',
    generated: today,
    vitest: '3.x',
    node: process.version,
    note: 'Values are mean iteration times in milliseconds. CI warns (does not fail) if any benchmark regresses >20% from these baselines. Regenerate with: pnpm run bench:update-baselines',
  },
  benchmarks,
};

fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');

console.log(
  `[update-baselines] Written ${Object.keys(benchmarks).length} baselines to ${path.relative(ROOT, baselinePath)}`,
);
