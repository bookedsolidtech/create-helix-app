import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject, getLastScaffoldTiming } from '../scaffold.js';
import type { ProjectOptions } from '../types.js';

const TEST_DIR = '/tmp/helix-test-timing';

function makeOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name: 'timing-app',
    directory: path.join(TEST_DIR, overrides.name ?? 'timing-app'),
    framework: 'react-next',
    componentBundles: ['core'],
    typescript: true,
    eslint: false,
    designTokens: false,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(TEST_DIR);
});

afterAll(async () => {
  await fs.remove(TEST_DIR);
});

// ─── Timing data capture ─────────────────────────────────────────────────────

describe('scaffold timing — data capture', () => {
  it('captures timing data after scaffoldProject()', async () => {
    const opts = makeOptions({ name: 'capture-test' });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
  });

  it('timing.totalMs is a positive number', async () => {
    const opts = makeOptions({ name: 'total-ms-test' });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    expect(timing!.totalMs).toBeGreaterThan(0);
  });

  it('timing.fileCount is a positive integer', async () => {
    const opts = makeOptions({ name: 'file-count-test' });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    expect(timing!.fileCount).toBeGreaterThan(0);
    expect(Number.isInteger(timing!.fileCount)).toBe(true);
  });

  it('timing.bytesWritten is a positive number', async () => {
    const opts = makeOptions({ name: 'bytes-test' });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    expect(timing!.bytesWritten).toBeGreaterThan(0);
  });

  it('timing.dependencyCount is a non-negative integer', async () => {
    const opts = makeOptions({ name: 'dep-count-test' });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    expect(timing!.dependencyCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(timing!.dependencyCount)).toBe(true);
  });
});

// ─── Phase timing ─────────────────────────────────────────────────────────────

describe('scaffold timing — per-phase breakdown', () => {
  it('phases object has all four required fields', async () => {
    const opts = makeOptions({ name: 'phases-fields-test' });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    const { phases } = timing!;
    expect(typeof phases.validationMs).toBe('number');
    expect(typeof phases.templateResolutionMs).toBe('number');
    expect(typeof phases.fileGenerationMs).toBe('number');
    expect(typeof phases.fileWritingMs).toBe('number');
  });

  it('all phase durations are non-negative', async () => {
    const opts = makeOptions({ name: 'phases-nonneg-test' });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    const { phases } = timing!;
    expect(phases.validationMs).toBeGreaterThanOrEqual(0);
    expect(phases.templateResolutionMs).toBeGreaterThanOrEqual(0);
    expect(phases.fileGenerationMs).toBeGreaterThanOrEqual(0);
    expect(phases.fileWritingMs).toBeGreaterThanOrEqual(0);
  });

  it('totalMs is at least as large as each individual phase', async () => {
    const opts = makeOptions({ name: 'total-ge-phases-test' });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    expect(timing!.totalMs).toBeGreaterThanOrEqual(timing!.phases.validationMs);
    expect(timing!.totalMs).toBeGreaterThanOrEqual(timing!.phases.templateResolutionMs);
    expect(timing!.totalMs).toBeGreaterThanOrEqual(timing!.phases.fileGenerationMs);
  });
});

// ─── JSON mode — timing included ──────────────────────────────────────────────

describe('scaffold timing — JSON output shape', () => {
  it('getLastScaffoldTiming() shape matches ScaffoldTiming interface', async () => {
    const opts = makeOptions({ name: 'json-shape-test' });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    // Top-level fields
    expect(timing).toHaveProperty('totalMs');
    expect(timing).toHaveProperty('fileCount');
    expect(timing).toHaveProperty('bytesWritten');
    expect(timing).toHaveProperty('dependencyCount');
    // Phases object
    expect(timing).toHaveProperty('phases');
    expect(timing!.phases).toHaveProperty('validationMs');
    expect(timing!.phases).toHaveProperty('templateResolutionMs');
    expect(timing!.phases).toHaveProperty('fileGenerationMs');
    expect(timing!.phases).toHaveProperty('fileWritingMs');
  });

  it('timing data can be serialized to JSON without loss of required fields', async () => {
    const opts = makeOptions({ name: 'json-serial-test' });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    const serialized = JSON.parse(JSON.stringify(timing)) as typeof timing;
    expect(serialized).not.toBeNull();
    expect(serialized!.totalMs).toBeGreaterThan(0);
    expect(serialized!.phases.validationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── Dry-run timing ───────────────────────────────────────────────────────────

describe('scaffold timing — dry run', () => {
  it('captures timing even in dry-run mode', async () => {
    const opts = makeOptions({ name: 'dryrun-timing-test', dryRun: true });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    expect(timing!.totalMs).toBeGreaterThan(0);
  });

  it('dry-run fileCount matches getDryRunEntries() length', async () => {
    const { getDryRunEntries } = await import('../scaffold.js');
    const opts = makeOptions({ name: 'dryrun-count-test', dryRun: true });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    const entries = getDryRunEntries();
    expect(timing).not.toBeNull();
    expect(timing!.fileCount).toBe(entries.length);
  });
});

// ─── Verbose mode ─────────────────────────────────────────────────────────────

describe('scaffold timing — verbose mode', () => {
  it('scaffold completes without error in verbose mode', async () => {
    const opts = makeOptions({ name: 'verbose-timing-test', verbose: true });
    await expect(scaffoldProject(opts)).resolves.toBeUndefined();
  });

  it('timing data is still captured in verbose mode', async () => {
    const opts = makeOptions({ name: 'verbose-data-test', verbose: true });
    await scaffoldProject(opts);
    const timing = getLastScaffoldTiming();
    expect(timing).not.toBeNull();
    expect(timing!.phases.validationMs).toBeGreaterThanOrEqual(0);
  });
});
