/**
 * E2E tests: scaffold each framework, install dependencies, and build.
 *
 * Proves every generated project works out of the box by running a real
 * `pnpm install` and (where applicable) `pnpm run build` in each scaffolded
 * project directory.
 *
 * Timeout: 120 s per test (installs can be slow).
 */

import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import { scaffoldProject } from '../../src/scaffold.js';
import { makeTmpRoot, removeTempDir } from '../integration/frameworks/setup.js';
import type { Framework } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Framework metadata for the test matrix
// ---------------------------------------------------------------------------

interface FrameworkTestEntry {
  framework: Framework;
  /** Whether a build script is expected in the scaffolded package.json */
  hasBuild: boolean;
  /** Directory that should exist after a successful build */
  buildOutputDir: string;
  /** Known upstream build failure -- marks build test with it.fails() */
  knownBuildFailure?: string;
  /** Minimum Node.js major version required for install/build (skips on older) */
  minNodeMajor?: number;
}

const NODE_MAJOR = Number(process.versions.node.split('.')[0]);

const FRAMEWORKS: FrameworkTestEntry[] = [
  { framework: 'react-next', hasBuild: true, buildOutputDir: '.next' },
  { framework: 'react-vite', hasBuild: true, buildOutputDir: 'dist' },
  { framework: 'remix', hasBuild: true, buildOutputDir: 'build' },
  {
    framework: 'vue-nuxt',
    hasBuild: true,
    buildOutputDir: '.nuxt',
    minNodeMajor: 22,
  },
  { framework: 'vue-vite', hasBuild: true, buildOutputDir: 'dist' },
  { framework: 'solid-vite', hasBuild: true, buildOutputDir: 'dist' },
  {
    framework: 'qwik-vite',
    hasBuild: true,
    buildOutputDir: 'dist',
    knownBuildFailure: 'Qwik build fails in temp directory environment',
  },
  { framework: 'svelte-kit', hasBuild: true, buildOutputDir: '.svelte-kit' },
  { framework: 'angular', hasBuild: true, buildOutputDir: 'dist' },
  { framework: 'astro', hasBuild: true, buildOutputDir: 'dist' },
  { framework: 'lit-vite', hasBuild: true, buildOutputDir: 'dist' },
  { framework: 'preact-vite', hasBuild: true, buildOutputDir: 'dist' },
  { framework: 'stencil', hasBuild: true, buildOutputDir: 'www' },
  { framework: 'ember', hasBuild: true, buildOutputDir: 'dist' },
  // vanilla is pure HTML -- no install or build needed
];

// Collect temp dirs for cleanup
const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((d) => removeTempDir(d)));
});

// ---------------------------------------------------------------------------
// Helper: run a shell command and capture combined output
// ---------------------------------------------------------------------------

function run(cmd: string, cwd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 110_000, // slightly under test timeout
      env: { ...process.env, CI: '1' },
    }).toString();
    return { ok: true, output };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const stdout = e.stdout?.toString() ?? '';
    const stderr = e.stderr?.toString() ?? '';
    return { ok: false, output: `${stdout}\n${stderr}\n${e.message ?? ''}` };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.each(FRAMEWORKS)(
  'E2E scaffold + install + build: $framework',
  ({ framework, hasBuild, buildOutputDir, knownBuildFailure, minNodeMajor }) => {
    const skipForNode = minNodeMajor !== undefined && NODE_MAJOR < minNodeMajor;
    const tmpRoot = makeTmpRoot(`e2e-${framework}`);
    const projectDir = path.join(tmpRoot, `test-${framework}`);
    tempDirs.push(tmpRoot);

    it(`scaffolds ${framework} and produces package.json`, async () => {
      await fs.ensureDir(tmpRoot);

      await scaffoldProject({
        name: `test-${framework}`,
        directory: projectDir,
        framework,
        componentBundles: ['all'],
        typescript: true,
        eslint: false,
        designTokens: false,
        darkMode: false,
        installDeps: false,
      });

      const pkgPath = path.join(projectDir, 'package.json');
      expect(fs.existsSync(pkgPath)).toBe(true);
    }, 120_000);

    const installIt = skipForNode ? it.skip : it;
    installIt(
      `installs dependencies for ${framework}${skipForNode ? ` (requires Node >=${minNodeMajor})` : ''}`,
      () => {
        const result = run('pnpm install --no-frozen-lockfile', projectDir);

        // Flag @helixui package 404s with a clear message
        if (
          !result.ok &&
          (result.output.includes('ERR_PNPM_FETCH_404') || result.output.includes('404 Not Found'))
        ) {
          const helixPkgMatch = result.output.match(/@helixui\/[\w-]+/);
          if (helixPkgMatch) {
            throw new Error(
              `HELIX PACKAGE NOT FOUND: ${helixPkgMatch[0]} -- report to HELiX team\n\n${result.output}`,
            );
          }
        }

        expect(result.ok, `pnpm install failed:\n${result.output}`).toBe(true);
      },
      120_000,
    );

    if (hasBuild) {
      const buildIt = knownBuildFailure ? it.fails : skipForNode ? it.skip : it;
      buildIt(
        `builds ${framework} successfully${knownBuildFailure ? ` (KNOWN ISSUE: ${knownBuildFailure})` : ''}${skipForNode ? ` (requires Node >=${minNodeMajor})` : ''}`,
        () => {
          // Read package.json to confirm a build script exists
          const pkgPath = path.join(projectDir, 'package.json');
          const pkg = fs.readJsonSync(pkgPath) as {
            scripts?: Record<string, string>;
          };

          if (!pkg.scripts?.['build']) {
            // No build script -- nothing to verify
            return;
          }

          const result = run('pnpm run build', projectDir);
          expect(result.ok, `pnpm run build failed:\n${result.output}`).toBe(true);

          // Verify build output directory exists
          const outDir = path.join(projectDir, buildOutputDir);
          expect(
            fs.existsSync(outDir),
            `Expected build output at ${buildOutputDir}/ but it does not exist`,
          ).toBe(true);
        },
        120_000,
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Vanilla: only scaffold, no install or build
// ---------------------------------------------------------------------------

describe('E2E scaffold: vanilla (no install/build)', () => {
  const tmpRoot = makeTmpRoot('e2e-vanilla');
  const projectDir = path.join(tmpRoot, 'test-vanilla');
  tempDirs.push(tmpRoot);

  it('scaffolds vanilla and produces index.html', async () => {
    await fs.ensureDir(tmpRoot);

    await scaffoldProject({
      name: 'test-vanilla',
      directory: projectDir,
      framework: 'vanilla',
      componentBundles: ['all'],
      typescript: true,
      eslint: false,
      designTokens: false,
      darkMode: false,
      installDeps: false,
    });

    expect(fs.existsSync(path.join(projectDir, 'index.html'))).toBe(true);
  }, 120_000);
});
