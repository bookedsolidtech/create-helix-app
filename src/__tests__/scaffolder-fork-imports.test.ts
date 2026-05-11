/**
 * v0.7.0 Phase A — module-structure smoke tests.
 *
 * Asserts that the forked scaffolder modules (3 frameworks x 3 files)
 * exist and export the expected function symbols. Doesn't invoke them
 * (the flat re-exports are exercised by existing tests; the monorepo
 * stubs are exercised by the throws-test below).
 *
 * Per PE P1 (fork-don't-branch): this test pins the fork SHAPE so
 * future churn can't accidentally collapse the structure back into a
 * monorepoMode conditional inside a 5000-LOC scaffolder body.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffoldProject } from '../scaffold.js';
import type { ProjectOptions } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '..');

const FORK_FILES: ReadonlyArray<readonly [string, string]> = [
  ['scaffold/react-next/_shared.ts', ''],
  ['scaffold/react-next/flat.ts', 'scaffoldReactNextFlat'],
  ['scaffold/react-next/monorepo.ts', 'scaffoldReactNextMonorepo'],
  ['scaffold/react-vite/_shared.ts', ''],
  ['scaffold/react-vite/flat.ts', 'scaffoldReactViteFlat'],
  ['scaffold/react-vite/monorepo.ts', 'scaffoldReactViteMonorepo'],
  ['scaffold/wc-storybook/_shared.ts', ''],
  ['scaffold/wc-storybook/flat.ts', 'scaffoldWcStorybookFlat'],
  ['scaffold/wc-storybook/monorepo.ts', 'scaffoldWcStorybookMonorepo'],
];

describe('v0.7.0 Phase A — scaffolder fork module structure', () => {
  for (const [rel, expectedExport] of FORK_FILES) {
    it(`${rel} exists on disk`, async () => {
      const fullPath = path.join(SRC_DIR, rel);
      expect(await fs.pathExists(fullPath)).toBe(true);
    });

    if (expectedExport) {
      it(`${rel} exports ${expectedExport}`, async () => {
        // Use the compiled .js spec; vitest resolves source via the
        // .js spec already used throughout the codebase.
        const importSpec = `../${rel.replace(/\.ts$/, '.js')}`;
        const mod = (await import(importSpec)) as Record<string, unknown>;
        expect(typeof mod[expectedExport]).toBe('function');
      });
    }
  }
});

describe('v0.7.0 Phase A — monorepoMode dispatch routes to stubs', () => {
  function makeOptions(framework: ProjectOptions['framework']): ProjectOptions {
    return {
      name: 'phase-a-stub',
      directory: `/tmp/helix-phase-a-stub-${framework}`,
      framework,
      componentBundles: ['all'],
      typescript: true,
      eslint: true,
      designTokens: true,
      darkMode: false,
      installDeps: false,
      force: true,
      monorepoMode: true,
    };
  }

  // Phase D update: react-next monorepo no longer throws. The dispatch
  // pins are now exercised by the api-monorepo-options + Phase D's
  // dedicated react-next-monorepo emit tests; this suite stays focused on
  // the still-stubbed react-vite + wc-storybook frameworks.
  it('react-next + monorepoMode resolves successfully (Phase D landed)', async () => {
    // Drive through scaffoldProject directly so we exercise the same
    // dispatch surface as the original stub assertion. force:true
    // tolerates leftover state across reruns in the shared /tmp dir.
    await expect(scaffoldProject(makeOptions('react-next'))).resolves.toBeUndefined();
  });

  it('react-vite + monorepoMode throws "not yet implemented"', async () => {
    await expect(scaffoldProject(makeOptions('react-vite'))).rejects.toThrow(
      /react-vite monorepo scaffolder not yet implemented/i,
    );
  });

  it('wc-storybook + monorepoMode throws "not yet implemented"', async () => {
    await expect(scaffoldProject(makeOptions('wc-storybook'))).rejects.toThrow(
      /wc-storybook monorepo scaffolder not yet implemented/i,
    );
  });
});
