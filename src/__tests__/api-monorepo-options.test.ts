/**
 * v0.7.0 Phase B — public-API defaulting + dispatch routing for
 * monorepoMode / includeDesignSystem.
 *
 * Pins the contract documented on ScaffoldOptions:
 *   - framework ∈ {react-next, react-vite}: monorepoMode default true.
 *   - framework === 'wc-storybook': monorepoMode silently coerced to false.
 *   - explicit monorepoMode:false on react-next / react-vite routes to
 *     the flat scaffolder (no throw).
 *   - explicit monorepoMode:true on react-next / react-vite routes to
 *     the Phase A stub (throws "not yet implemented").
 *
 * Phase A established the dispatch fork; Phase B threads the prompt
 * answer + flag plumbing through to this API surface. The stubs
 * remain in place until Phases D/E/F land real emitters.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scaffold } from '../api.js';

const TEST_ROOT = path.join(tmpdir(), `create-helix-phase-b-${process.pid}`);

afterEach(async () => {
  await fs.remove(TEST_ROOT);
});

describe('v0.7.0 Phase B — scaffold() monorepoMode dispatch', () => {
  // Phase D update: react-next monorepo now emits a full apps/web tree
  // rather than throwing. Confirm the dispatch lands successfully and
  // produces the workspace shape (root pnpm-workspace.yaml + apps/web
  // dir). The exhaustive content assertions live in the dedicated Phase D
  // tests (react-next-monorepo.test.ts); this case just pins the dispatch
  // wiring at the api.ts boundary.
  it('react-next + monorepoMode:true routes to the monorepo emitter (no throw)', async () => {
    const dir = path.join(TEST_ROOT, 'rn-monorepo');
    const result = await scaffold({
      name: 'phase-b-rn-monorepo',
      directory: dir,
      framework: 'react-next',
      monorepoMode: true,
      force: true,
      installDeps: false,
    });
    expect(result.success).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'pnpm-workspace.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'package.json'))).toBe(true);
  });

  it('react-next + monorepoMode:false routes to the flat scaffolder (no throw)', async () => {
    const dir = path.join(TEST_ROOT, 'rn-flat');
    const result = await scaffold({
      name: 'phase-b-rn-flat',
      directory: dir,
      framework: 'react-next',
      monorepoMode: false,
      force: true,
      installDeps: false,
    });
    expect(result.success).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'package.json'))).toBe(true);
    // Flat shape: no monorepo wrapper directories.
    expect(await fs.pathExists(path.join(dir, 'apps'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'packages'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'pnpm-workspace.yaml'))).toBe(false);
  });

  it('react-vite + monorepoMode:true routes to the monorepo stub (throws)', async () => {
    await expect(
      scaffold({
        name: 'phase-b-rv-monorepo',
        directory: path.join(TEST_ROOT, 'rv-monorepo'),
        framework: 'react-vite',
        monorepoMode: true,
        force: true,
        installDeps: false,
      }),
    ).rejects.toThrow(/react-vite monorepo scaffolder not yet implemented/i);
  });

  it('react-vite + monorepoMode:false routes to the flat scaffolder (no throw)', async () => {
    const dir = path.join(TEST_ROOT, 'rv-flat');
    const result = await scaffold({
      name: 'phase-b-rv-flat',
      directory: dir,
      framework: 'react-vite',
      monorepoMode: false,
      force: true,
      installDeps: false,
    });
    expect(result.success).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'package.json'))).toBe(true);
  });
});

describe('v0.7.0 Phase B — scaffold() monorepoMode defaults', () => {
  it('omitting monorepoMode for react-next defaults to true (routes to monorepo emitter)', async () => {
    // Phase D update: default routes to the now-implemented emitter
    // rather than the Phase A stub. Confirm the workspace shape
    // (pnpm-workspace.yaml + apps/web) lands.
    const dir = path.join(TEST_ROOT, 'rn-default');
    const result = await scaffold({
      name: 'phase-b-rn-default',
      directory: dir,
      framework: 'react-next',
      force: true,
      installDeps: false,
    });
    expect(result.success).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'pnpm-workspace.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'package.json'))).toBe(true);
  });

  it('omitting monorepoMode for react-vite defaults to true (routes to stub)', async () => {
    await expect(
      scaffold({
        name: 'phase-b-rv-default',
        directory: path.join(TEST_ROOT, 'rv-default'),
        framework: 'react-vite',
        force: true,
        installDeps: false,
      }),
    ).rejects.toThrow(/react-vite monorepo scaffolder not yet implemented/i);
  });
});

describe('v0.7.0 Phase B — wc-storybook coercion', () => {
  it('wc-storybook + monorepoMode:true is silently coerced to false (no throw)', async () => {
    // wc-storybook IS the DS — passing monorepoMode:true is not an
    // error, it's a config-noise quirk we absorb. The scaffold succeeds
    // with the flat shape.
    const dir = path.join(TEST_ROOT, 'wcs-coerced');
    const result = await scaffold({
      name: 'phase-b-wcs-coerced',
      directory: dir,
      framework: 'wc-storybook',
      monorepoMode: true, // ignored
      force: true,
      installDeps: false,
    });
    expect(result.success).toBe(true);
    // Flat shape: no monorepo wrapper directories.
    expect(await fs.pathExists(path.join(dir, 'apps'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'packages'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'pnpm-workspace.yaml'))).toBe(false);
  });

  it('wc-storybook without monorepoMode also produces the flat shape', async () => {
    const dir = path.join(TEST_ROOT, 'wcs-default');
    const result = await scaffold({
      name: 'phase-b-wcs-default',
      directory: dir,
      framework: 'wc-storybook',
      force: true,
      installDeps: false,
    });
    expect(result.success).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages'))).toBe(false);
  });
});

describe('v0.7.0 Phase B — includeDesignSystem default tracks monorepoMode', () => {
  // Phase B does not ship the (monorepoMode:true, includeDesignSystem:false)
  // combo. The defaulting rule is: when monorepoMode is true,
  // includeDesignSystem is also true unless caller explicitly passes
  // false. This test pins the documented coupling so a future change
  // that decouples them surfaces here first.
  it('omitting includeDesignSystem on a monorepo react-next defaults to true', async () => {
    // Phase D update: confirm the apps/web/package.json depends on
    // @{scope}/design-system at workspace:* (the proof that
    // includeDesignSystem resolved true under the hood).
    const dir = path.join(TEST_ROOT, 'rn-ids-default');
    const result = await scaffold({
      name: 'phase-b-rn-ids-default',
      directory: dir,
      framework: 'react-next',
      monorepoMode: true,
      // includeDesignSystem omitted — should default true.
      force: true,
      installDeps: false,
    });
    expect(result.success).toBe(true);
    const appPkg = await fs.readJson(path.join(dir, 'apps', 'web', 'package.json'));
    expect(appPkg.dependencies['@phase-b-rn-ids-default/design-system']).toBe('workspace:*');
  });
});
