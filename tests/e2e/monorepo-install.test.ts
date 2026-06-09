/**
 * v0.7.0 Phase H — Monorepo install + type-check E2E smoke.
 *
 * For each of the three monorepo flavors (wc-storybook, react-next +
 * monorepo, react-vite + monorepo) this test:
 *
 *   1. Scaffolds into a fresh tmp dir.
 *   2. Runs `pnpm install` at the workspace root.
 *   3. Runs `pnpm run type-check` (turbo fans out across packages).
 *   4. Asserts exit code 0 + no ERR_PNPM_* or MODULE_NOT_FOUND in stderr.
 *
 * This is the acceptance gate for the v0.7.0 monorepo invariant. If
 * `pnpm install` can't resolve `workspace:*` deps, or if
 * `pnpm type-check` fails because design-system → @lit/react isn't
 * resolving, the scaffold is broken regardless of what the unit tests say.
 *
 * GATED BEHIND `E2E=1` (and `E2E_MONOREPO=1` for finer control). Skipped
 * by default because `pnpm install` is slow (30-60s/flavor) and requires
 * network access to the npm registry. The existing wc-storybook flat E2E
 * uses `E2E_SCAFFOLD=1`; we follow the same gating convention here.
 *
 * Sister to `tests/e2e/scaffold-install-build.test.ts` which covers the
 * FLAT scaffold variant for every framework — this file is the MONOREPO
 * equivalent for the three flavors we've shipped overlays for.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { scaffoldProject } from '../../src/scaffold.js';
import { makeTmpRoot, removeTempDir } from '../integration/frameworks/setup.js';
import type { ProjectOptions } from '../../src/types.js';

interface MonorepoFlavor {
  /** Human-readable label used in test descriptions + failure messages. */
  label: string;
  /** Project name + the workspace package scope (must be unscoped here —
   *  CLI rejects `@scope/name` for non-library frameworks; the scope is
   *  derived from this value at scaffold time). */
  name: string;
  /** Per-flavor scaffold inputs. The remaining ProjectOptions fields
   *  (typescript, eslint, etc.) are filled in by the shared template
   *  below. */
  framework: ProjectOptions['framework'];
  dsName?: string;
  tokenPrefix?: string;
}

const FLAVORS: MonorepoFlavor[] = [
  // wc-storybook standalone — entered via scaffoldProject's direct call;
  // emits the workspace root + the DS package. Fastest install of the
  // three because there's no apps/web pulling in the full Next/Vite tree.
  {
    label: 'wc-storybook',
    name: 'e2e-mr-wcs',
    framework: 'wc-storybook',
    dsName: 'smoke',
    tokenPrefix: '--smk',
  },
  // react-next + monorepo + DS — the heaviest of the three (Next 16 +
  // Storybook 10 + Lit 3 all installed). Validates Phase D's apps/web
  // overlays + Phase F's secondary DS emit + the React-wrappers barrel
  // compiles against @lit/react + @helixui/library.
  {
    label: 'react-next',
    name: 'e2e-mr-rnm',
    framework: 'react-next',
  },
  // react-vite + monorepo + DS — same overlay shape as react-next but the
  // Vite SPA replaces the Next App Router. Faster than react-next; still
  // validates the DS package's workspace consumption.
  {
    label: 'react-vite',
    name: 'e2e-mr-rvm',
    framework: 'react-vite',
  },
];

/**
 * Run a shell command and capture stdout + stderr + exit code. Mirrors
 * the helper in tests/e2e/scaffold-install-build.test.ts; duplicated
 * here rather than re-exported because the two suites are gated on
 * different env flags and may diverge.
 */
function run(cmd: string, cwd: string, timeoutMs: number): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
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

const e2eEnabled = !!process.env.E2E || !!process.env.E2E_MONOREPO;
const describeFn = e2eEnabled ? describe : describe.skip;

// Track temp dirs so afterAll can rm them even if a single test crashes.
const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((d) => removeTempDir(d)));
});

describeFn('v0.7.0 Phase H — monorepo install + type-check E2E smoke (gated on E2E=1)', () => {
  describe.each(FLAVORS)('$label monorepo', (flavor) => {
    const tmpRoot = makeTmpRoot(`e2e-mr-${flavor.label}`);
    const projectDir = path.join(tmpRoot, flavor.name);
    tempDirs.push(tmpRoot);

    it(
      `scaffolds + installs deps + type-checks ${flavor.label}`,
      async () => {
        // ── Scaffold ──────────────────────────────────────────────
        await fs.ensureDir(tmpRoot);
        const options: ProjectOptions = {
          name: flavor.name,
          directory: projectDir,
          framework: flavor.framework,
          componentBundles: ['core'],
          typescript: true,
          eslint: true,
          designTokens: true,
          darkMode: false,
          installDeps: false,
          force: true,
          monorepoMode: true,
          includeDesignSystem: true,
          ...(flavor.dsName ? { dsName: flavor.dsName } : {}),
          ...(flavor.tokenPrefix ? { tokenPrefix: flavor.tokenPrefix } : {}),
        };
        await scaffoldProject(options);

        // Scaffold sanity — pnpm-workspace.yaml has to exist for
        // `pnpm install` to even try resolving workspace:* refs.
        const wsYaml = path.join(projectDir, 'pnpm-workspace.yaml');
        expect(fs.existsSync(wsYaml)).toBe(true);

        // ── pnpm install ──────────────────────────────────────────
        // --no-frozen-lockfile so the absence of pnpm-lock.yaml (we
        // don't commit one) doesn't fail. --ignore-scripts because
        // some Storybook deps trigger post-install hooks that don't
        // matter for type-check.
        const installResult = run(
          'pnpm install --no-frozen-lockfile --ignore-scripts',
          projectDir,
          5 * 60 * 1000, // 5 min cap for pnpm install
        );

        // pnpm 404 errors usually mean a HELiX package isn't published
        // at the version we declared. Surface that distinctly so a
        // Phase F/G dep-pinning bug doesn't read as a generic install
        // failure.
        if (
          !installResult.ok &&
          (installResult.output.includes('ERR_PNPM_FETCH_404') ||
            installResult.output.includes('404 Not Found'))
        ) {
          const helixPkgMatch = installResult.output.match(/@helixui\/[\w-]+/);
          if (helixPkgMatch) {
            throw new Error(
              `HELIX PACKAGE NOT FOUND: ${helixPkgMatch[0]} -- report to HELiX team\n\n${installResult.output}`,
            );
          }
        }

        expect(
          installResult.ok,
          `${flavor.label}: pnpm install failed:\n${installResult.output}`,
        ).toBe(true);

        // Catch the two common workspace-dep resolution failures even
        // when `pnpm install` exits 0 (rare but recorded in pnpm
        // history — install logs the failure to stderr and exits 0).
        expect(
          installResult.output,
          `${flavor.label}: pnpm install stderr contained ERR_PNPM_*`,
        ).not.toMatch(/ERR_PNPM_[A-Z_]+/);
        expect(
          installResult.output,
          `${flavor.label}: pnpm install stderr contained MODULE_NOT_FOUND`,
        ).not.toContain('MODULE_NOT_FOUND');

        // ── pnpm type-check ───────────────────────────────────────
        // Turbo fans out to every workspace package's `type-check`
        // script (`tsc --noEmit`). If the DS package's React-wrappers
        // barrel can't resolve @lit/react + @helixui/library, this
        // step fails — that's the Phase F invariant we want to gate
        // on.
        const tcResult = run('pnpm run type-check', projectDir, 5 * 60 * 1000);

        expect(
          tcResult.ok,
          `${flavor.label}: pnpm run type-check failed:\n${tcResult.output}`,
        ).toBe(true);
      },
      15 * 60 * 1000, // 15 min cap per flavor (install + type-check)
    );
  });
});
