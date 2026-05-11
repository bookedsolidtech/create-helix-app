/**
 * Golden-snapshot test for the react-next MONOREPO emit shape (v0.7.0 Phase D).
 *
 * Pins the file-tree contract documented on scaffold/react-next/monorepo.ts:
 *
 *   - Monorepo root (Phase C): pnpm-workspace.yaml, turbo.json,
 *     tsconfig.json, tsconfig.base.json, package.json, README.md,
 *     .gitignore.
 *   - apps/web: Next.js 16 + App Router scaffold redirected under
 *     apps/web/ via cloneOptionsForAppsWeb. Overrides land on top:
 *     package.json (workspace:* deps), next.config.ts (transpilePackages),
 *     tsconfig.json (extends ../../tsconfig.base.json), wrappers.tsx
 *     (re-export from @{scope}/design-system when DS opted in).
 *   - packages/design-system (Phase F): emitted when includeDesignSystem
 *     is true, via scaffoldWcStorybookMonorepo's secondary invocation.
 *   - packages/types + packages/utils (Phase G): always emitted as stub
 *     workspace packages.
 *
 * Idempotency snapshot SKIPS apps/web/src/components/navbar.tsx — the
 * flat scaffolder bakes a per-install randomBytes UTM ID into its <img>
 * tag (src/scaffold.ts:1268). That's pre-existing flat behavior, not a
 * Phase D regression; everything the monorepo overlay owns is byte-stable.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';

const TARGET = '/tmp/helix-golden-react-next-monorepo';

const FIXED_OPTIONS: ProjectOptions = {
  name: 'golden-rnm',
  directory: TARGET,
  framework: 'react-next',
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

describe('react-next monorepo factory — golden snapshot (v0.7.0 Phase D)', () => {
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
      // apps/web identity files (Phase D overlays).
      'apps/web/package.json',
      'apps/web/next.config.ts',
      'apps/web/tsconfig.json',
      // apps/web token surface (inherited from flat).
      'apps/web/helix-tokens.css',
      'apps/web/helix-responsive.css',
      // App Router structure (inherited from flat scaffold redirected
      // under apps/web/).
      'apps/web/src/app/page.tsx',
      'apps/web/src/app/layout.tsx',
      'apps/web/src/app/globals.css',
      'apps/web/src/app/examples/forms/page.tsx',
      'apps/web/src/app/examples/dashboard/page.tsx',
      'apps/web/src/app/examples/layout.tsx',
      'apps/web/src/app/components/page.tsx',
      'apps/web/src/app/docs/page.tsx',
      // Component layer (Phase D wrappers.tsx overrides + flat-inherited).
      'apps/web/src/components/navbar.tsx',
      'apps/web/src/components/footer.tsx',
      'apps/web/src/components/theme-toggle.tsx',
      'apps/web/src/components/ErrorBoundary.tsx',
      'apps/web/src/components/helix/wrappers.tsx',
      'apps/web/src/components/helix/provider.tsx',
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
        `Golden snapshot — missing react-next monorepo artefacts:\n  ${missing.join('\n  ')}\n\nIf the rename / move is intentional, update the required[] array in tests/golden/react-next-monorepo/golden.test.ts.`,
      );
    }
    expect(missing).toEqual([]);
  });

  it('byte-identical re-scaffold for the JSON/text root + overlay files (idempotency, DXA F5)', async () => {
    // Skips apps/web/src/components/navbar.tsx — the flat scaffolder
    // bakes a per-install UTM ID into it (src/scaffold.ts:1268). The
    // overlay-owned files are deterministic by design and pinned here.
    const snapshotFiles = [
      'pnpm-workspace.yaml',
      'turbo.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'package.json',
      '.gitignore',
      'README.md',
      'apps/web/package.json',
      'apps/web/next.config.ts',
      'apps/web/tsconfig.json',
      'apps/web/src/components/helix/wrappers.tsx',
      'apps/web/src/app/layout.tsx',
      'apps/web/src/app/page.tsx',
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
    // apps/web/* should NOT shadow the monorepo root layout files.
    // The reverse — the flat scaffold's next.config.ts at the monorepo
    // root — would mean dispatch is misrouted.
    const forbiddenAtRoot = [
      'next.config.ts',
      'next-env.d.ts',
      'src/app/page.tsx',
      'src/components/navbar.tsx',
      'index.html',
      'vite.config.ts',
    ];
    for (const rel of forbiddenAtRoot) {
      const exists = await fs.pathExists(path.join(TARGET, rel));
      expect(exists, `unexpected flat-scaffold leakage at monorepo root: ${rel}`).toBe(false);
    }
  });

  it('apps/web/src/components/helix/wrappers.tsx re-exports from @{scope}/design-system', async () => {
    // Phase D + F contract: when includeDesignSystem is true, wrappers.tsx
    // is REWRITTEN to re-export from the workspace DS package, NOT to
    // import @helixui/library directly. Otherwise apps/web bypasses the
    // brand layer and any DS-specific overrides.
    const wrappers = await fs.readFile(
      path.join(TARGET, 'apps/web/src/components/helix/wrappers.tsx'),
      'utf8',
    );
    expect(wrappers).toContain("export * from '@golden-rnm/design-system'");
    // No leftover direct @helixui/library imports in the overridden wrappers.
    expect(wrappers).not.toMatch(/import .* from '@helixui\/library'/);
  });

  it('apps/web/next.config.ts lists workspace packages in transpilePackages', async () => {
    const nextConfig = await fs.readFile(path.join(TARGET, 'apps/web/next.config.ts'), 'utf8');
    expect(nextConfig).toContain('transpilePackages');
    expect(nextConfig).toContain("'@golden-rnm/design-system'");
    expect(nextConfig).toContain("'@golden-rnm/types'");
    expect(nextConfig).toContain("'@golden-rnm/utils'");
    expect(nextConfig).toMatch(/externalDir:\s*true/);
  });
});
