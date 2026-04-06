/**
 * Performance benchmarks for create-helix scaffold operations.
 *
 * Run with:  pnpm run bench
 * CI check:  pnpm run bench:ci   (warns if >20% regression from baselines.json)
 *
 * Vitest bench mode is used so results are comparable across runs.
 * All filesystem-intensive benchmarks use dry-run mode to avoid disk I/O noise.
 */
import { bench, describe } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { scaffoldProject } from '../../src/scaffold.js';
import { getTemplate } from '../../src/templates.js';
import { validateProjectName } from '../../src/validation.js';
import { loadConfig } from '../../src/config.js';
import type { Framework } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All 15 supported frameworks. */
const ALL_FRAMEWORKS: Framework[] = [
  'react-next',
  'react-vite',
  'remix',
  'vue-nuxt',
  'vue-vite',
  'solid-vite',
  'qwik-vite',
  'svelte-kit',
  'angular',
  'astro',
  'vanilla',
  'lit-vite',
  'preact-vite',
  'stencil',
  'ember',
];

/** Minimal ProjectOptions for a dry-run scaffold (no disk writes). */
function dryRunOptions(framework: Framework, dir: string) {
  return {
    name: 'bench-project',
    directory: dir,
    framework,
    componentBundles: ['core' as const],
    typescript: true,
    eslint: true,
    designTokens: true,
    darkMode: false,
    installDeps: false,
    dryRun: true,
  };
}

// ---------------------------------------------------------------------------
// 1. Scaffold time per framework (target: <2 s each)
// ---------------------------------------------------------------------------

describe('scaffold time per framework', () => {
  for (const framework of ALL_FRAMEWORKS) {
    bench(
      `scaffold ${framework}`,
      async () => {
        const dir = path.join(os.tmpdir(), `helix-bench-${framework}-${Date.now()}`);
        await scaffoldProject(dryRunOptions(framework, dir));
      },
      {
        // Vitest bench options: time limit in ms (per iteration budget)
        time: 2000,
      },
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Template resolution time
// ---------------------------------------------------------------------------

describe('template resolution time', () => {
  bench('resolve template by id (all 15 frameworks)', () => {
    for (const fw of ALL_FRAMEWORKS) {
      const template = getTemplate(fw);
      if (!template) throw new Error(`Template not found: ${fw}`);
    }
  });

  bench('resolve single template — react-next', () => {
    const template = getTemplate('react-next');
    if (!template) throw new Error('Template not found: react-next');
  });

  bench('resolve unknown template (returns undefined)', () => {
    getTemplate('not-a-real-framework');
  });
});

// ---------------------------------------------------------------------------
// 3. Validation time for 1000 project names
// ---------------------------------------------------------------------------

// Pre-build a mixed set of names so array construction is not in the timed path
const VALID_NAMES: string[] = Array.from({ length: 500 }, (_, i) => `my-project-${i}`);
const INVALID_NAMES: string[] = [
  ...Array.from({ length: 200 }, (_, i) => `BadName${i}`), // uppercase
  ...Array.from({ length: 200 }, (_, i) => `../traversal-${i}`), // path separators
  ...Array.from({ length: 100 }, () => ''), // empty strings
];
const MIXED_NAMES: string[] = [...VALID_NAMES, ...INVALID_NAMES]; // exactly 1000

describe('validation time', () => {
  bench('validate 1000 project names (mixed valid/invalid)', () => {
    for (const name of MIXED_NAMES) {
      validateProjectName(name);
    }
  });

  bench('validate 500 valid project names', () => {
    for (const name of VALID_NAMES) {
      validateProjectName(name);
    }
  });

  bench('validate 500 invalid project names', () => {
    for (const name of INVALID_NAMES) {
      validateProjectName(name);
    }
  });

  bench('validate single valid name (baseline micro)', () => {
    validateProjectName('my-helix-app');
  });
});

// ---------------------------------------------------------------------------
// 4. Config file parsing time
// ---------------------------------------------------------------------------

/** Minimal .helixrc.json content exercising all supported fields. */
const FULL_CONFIG_JSON = JSON.stringify({
  defaults: {
    template: 'react-next',
    typescript: true,
    eslint: true,
    darkMode: false,
    tokens: true,
    bundles: ['core', 'forms'],
  },
  profiles: {
    production: { template: 'react-next', typescript: true, eslint: true, darkMode: false },
    minimal: { template: 'vanilla', typescript: false, eslint: false },
    spa: { template: 'react-vite', typescript: true, eslint: true, tokens: true },
  },
});

describe('config file parsing time', () => {
  bench('parse config from a temp .helixrc.json file (100 iterations)', () => {
    // Write a config file to a temp dir and parse it 100 times to simulate
    // repeated loadConfig calls (e.g. profile resolution in CI pipelines).
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-cfg-bench-'));
    const cfgPath = path.join(tmpDir, '.helixrc.json');
    fs.writeFileSync(cfgPath, FULL_CONFIG_JSON, 'utf-8');

    const savedCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      for (let i = 0; i < 100; i++) {
        loadConfig(false);
      }
    } finally {
      process.chdir(savedCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  bench('parse config with profile selection (100 iterations)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-prof-bench-'));
    const cfgPath = path.join(tmpDir, '.helixrc.json');
    fs.writeFileSync(cfgPath, FULL_CONFIG_JSON, 'utf-8');

    const savedCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      for (let i = 0; i < 100; i++) {
        loadConfig(false, 'production');
      }
    } finally {
      process.chdir(savedCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  bench('parse config — noConfig path (no filesystem access)', () => {
    for (let i = 0; i < 1000; i++) {
      loadConfig(true);
    }
  });

  bench('JSON.parse of full config string (baseline)', () => {
    for (let i = 0; i < 1000; i++) {
      JSON.parse(FULL_CONFIG_JSON);
    }
  });
});
