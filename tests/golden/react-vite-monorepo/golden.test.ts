/**
 * Golden-snapshot test for the react-vite MONOREPO emit shape (v0.7.0 Phase E).
 *
 * Pins the file-tree contract documented on scaffold/react-vite/monorepo.ts:
 *
 *   - Monorepo root (Phase C): pnpm-workspace.yaml, turbo.json,
 *     tsconfig.json, tsconfig.base.json, package.json, README.md,
 *     .gitignore.
 *   - apps/web: Vite SPA scaffold redirected under apps/web/ via
 *     cloneOptionsForAppsWeb. Overrides land on top: package.json
 *     (workspace:* deps), vite.config.ts (optimizeDeps.exclude +
 *     server.fs.allow), tsconfig.json (extends ../../tsconfig.base.json),
 *     wrappers.tsx (re-export from @{scope}/design-system when DS opted in).
 *   - packages/design-system (Phase F): emitted when includeDesignSystem
 *     is true, via scaffoldWcStorybookMonorepo's secondary invocation.
 *   - packages/types + packages/utils (Phase G): always emitted as stub
 *     workspace packages.
 *
 * Unlike Next.js, the Vite flat scaffolder does NOT bake a per-install
 * randomBytes UTM ID into its Navbar (only scaffoldReactNext does,
 * src/scaffold.ts:1268). Vite's apps/web/src/components/Navbar.tsx is
 * therefore byte-stable and is included in the idempotency snapshot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';

const TARGET = '/tmp/helix-golden-react-vite-monorepo';

const FIXED_OPTIONS: ProjectOptions = {
  name: 'golden-rvm',
  directory: TARGET,
  framework: 'react-vite',
  componentBundles: ['core'],
  typescript: true,
  eslint: true,
  designTokens: true,
  darkMode: false,
  installDeps: false,
  force: true,
  monorepoMode: true,
  includeDesignSystem: true,
};

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function recur(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await recur(full);
      } else if (e.isFile()) {
        out.push(path.relative(root, full));
      }
    }
  }
  await recur(root);
  return out.sort();
}

describe('react-vite monorepo factory — golden snapshot (v0.7.0 Phase E)', () => {
  beforeAll(async () => {
    await fs.remove(TARGET);
    await scaffoldProject(FIXED_OPTIONS);
  });

  afterAll(async () => {
    await fs.remove(TARGET);
  });

  it('emits the canonical monorepo file-tree (~40 representative files)', async () => {
    const actual = await walkFiles(TARGET);

    const required = [
      // Monorepo root (Phase C).
      'pnpm-workspace.yaml',
      'turbo.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'package.json',
      'README.md',
      '.gitignore',
      // apps/web identity files (Phase E overlays).
      'apps/web/package.json',
      'apps/web/vite.config.ts',
      'apps/web/tsconfig.json',
      'apps/web/index.html',
      // apps/web token surface (inherited from flat).
      'apps/web/helix-tokens.css',
      'apps/web/helix-responsive.css',
      // Vite SPA structure (inherited from flat scaffold redirected under
      // apps/web/).
      'apps/web/src/main.tsx',
      'apps/web/src/App.tsx',
      'apps/web/src/index.css',
      // Component layer (Phase E wrappers.tsx overrides + flat-inherited).
      'apps/web/src/components/Navbar.tsx',
      'apps/web/src/components/ErrorBoundary.tsx',
      'apps/web/src/components/helix/wrappers.tsx',
      // Type declarations.
      'apps/web/src/helix.d.ts',
      'apps/web/src/helix-setup.ts',
      // packages/design-system (Phase F secondary invocation).
      'packages/design-system/package.json',
      'packages/design-system/tsconfig.json',
      'packages/design-system/src/index.ts',
      'packages/design-system/.storybook/main.ts',
      'packages/design-system/.storybook/preview.ts',
      // packages/types (Phase G).
      'packages/types/package.json',
      'packages/types/tsconfig.json',
      'packages/types/src/index.ts',
      // packages/utils (Phase G).
      'packages/utils/package.json',
      'packages/utils/tsconfig.json',
      'packages/utils/src/index.ts',
    ];

    const missing = required.filter((f) => !actual.includes(f));
    if (missing.length > 0) {
      throw new Error(
        `Golden snapshot — missing react-vite monorepo artefacts:\n  ${missing.join('\n  ')}\n\nIf the rename / move is intentional, update the required[] array in tests/golden/react-vite-monorepo/golden.test.ts.`,
      );
    }
    expect(missing).toEqual([]);
  });

  it('byte-identical re-scaffold for the JSON/text root + overlay files (idempotency, DXA F5)', async () => {
    // Vite's flat scaffold does NOT bake an install ID into Navbar.tsx
    // (verified via grep — only react-next, vue-nuxt, preact-vite do).
    // Navbar.tsx is therefore byte-stable and included in the snapshot.
    const snapshotFiles = [
      'pnpm-workspace.yaml',
      'turbo.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'package.json',
      '.gitignore',
      'README.md',
      'apps/web/package.json',
      'apps/web/vite.config.ts',
      'apps/web/tsconfig.json',
      'apps/web/index.html',
      'apps/web/src/App.tsx',
      'apps/web/src/main.tsx',
      'apps/web/src/index.css',
      'apps/web/src/components/Navbar.tsx',
      'apps/web/src/components/helix/wrappers.tsx',
      'packages/design-system/package.json',
      'packages/design-system/tsconfig.json',
      'packages/design-system/src/index.ts',
      'packages/types/package.json',
      'packages/types/src/index.ts',
      'packages/utils/package.json',
      'packages/utils/src/index.ts',
    ];

    const before: Record<string, string> = {};
    for (const f of snapshotFiles) {
      before[f] = await fs.readFile(path.join(TARGET, f), 'utf8');
    }

    await scaffoldProject(FIXED_OPTIONS);

    for (const [f, expected] of Object.entries(before)) {
      const after = await fs.readFile(path.join(TARGET, f), 'utf8');
      expect(after, `${f} drifted between idempotent runs`).toBe(expected);
    }
  });

  it('forbidden-pattern grep: monorepo root has no leaked apps/web artifacts', async () => {
    // The reverse — flat scaffold's vite.config.ts / index.html at the
    // monorepo root — would indicate dispatch is misrouted.
    const forbiddenAtRoot = [
      'vite.config.ts',
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/components/Navbar.tsx',
      'next.config.ts',
    ];
    for (const rel of forbiddenAtRoot) {
      const exists = await fs.pathExists(path.join(TARGET, rel));
      expect(exists, `unexpected flat-scaffold leakage at monorepo root: ${rel}`).toBe(false);
    }
  });

  it('apps/web/src/components/helix/wrappers.tsx re-exports from @{scope}/design-system', async () => {
    // Phase E + F contract — same as Phase D's wrappers contract. When
    // includeDesignSystem is true, wrappers.tsx routes through the DS
    // package; the no-DS case falls back to the flat path's
    // @helixui/library direct imports.
    const wrappers = await fs.readFile(
      path.join(TARGET, 'apps/web/src/components/helix/wrappers.tsx'),
      'utf8',
    );
    expect(wrappers).toContain("export * from '@golden-rvm/design-system'");
    expect(wrappers).not.toMatch(/import .* from '@helixui\/library'/);
  });

  it('apps/web/vite.config.ts wires optimizeDeps.exclude + server.fs.allow', async () => {
    const viteConfig = await fs.readFile(path.join(TARGET, 'apps/web/vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('optimizeDeps');
    expect(viteConfig).toContain('exclude');
    expect(viteConfig).toContain("'@golden-rvm/design-system'");
    // server.fs.allow lets the Vite dev server resolve symlinked workspace
    // packages above apps/web/.
    expect(viteConfig).toContain("'..'");
    expect(viteConfig).toContain("'../..'");
  });
});
