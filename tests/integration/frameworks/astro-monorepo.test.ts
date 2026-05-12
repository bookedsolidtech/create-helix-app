/**
 * Astro monorepo end-to-end emit (v0.8.0 Phase C).
 *
 * Drives scaffoldProject with monorepoMode + includeDesignSystem and
 * asserts the FULL tree of files landed where Phase C specifies — both
 * the monorepo root (pnpm-workspace.yaml, turbo.json, tsconfig.base.json)
 * and apps/web (the Astro scaffold with native web component usage).
 *
 * Sister to the unit-style tests in
 * src/__tests__/astro-monorepo.test.ts — this file runs the public
 * scaffoldProject() API rather than the scaffold() wrapper to give us
 * a second angle on the dispatch, and uses the integration test helpers
 * (makeTmpRoot, assertFilesExist) for consistency with the rest of the
 * tests/integration/frameworks/ suite.
 *
 * Key contract pinned here (per user direction 2026-05-11): Astro
 * consumes the design-system as NATIVE web components — index.astro
 * uses <hx-button>/<hx-card>/<hx-icon> directly, NOT React-wrapper
 * imports. The design-system package's React wrappers (from v0.7.0
 * Phase F) remain available for Next.js / Vite consumers; the Astro
 * scaffold's only point of contact with the DS package is the tokens
 * CSS layer.
 */
import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('astro-monorepo');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'astro',
    componentBundles: ['core'],
    typescript: true,
    eslint: true,
    designTokens: true,
    darkMode: false,
    installDeps: false,
    force: true,
    monorepoMode: true,
    includeDesignSystem: true,
    ...overrides,
  };
}

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('astro monorepo integration (Phase C)', () => {
  it('generates the full apps/web tree + monorepo root files', async () => {
    const o = opts('astro-tree');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      // Monorepo root.
      'pnpm-workspace.yaml',
      'turbo.json',
      'package.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'README.md',
      '.gitignore',
      // Workspace packages.
      'packages/design-system',
      'packages/types',
      'packages/utils',
      // apps/web — the Astro app.
      'apps/web/package.json',
      'apps/web/astro.config.mjs',
      'apps/web/tsconfig.json',
      'apps/web/src/env.d.ts',
      'apps/web/src/layouts/Layout.astro',
      'apps/web/src/pages/index.astro',
      'apps/web/src/pages/components.astro',
      'apps/web/src/components/ThemeToggle.astro',
      'apps/web/public/favicon.svg',
    ]);
  });

  it('apps/web/package.json has the expected workspace:* deps', async () => {
    const o = opts('astro-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      name: string;
      private: boolean;
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    }>(o.directory, 'apps/web/package.json');
    expect(pkg.name).toBe('@astro-deps/web');
    expect(pkg.private).toBe(true);
    expect(pkg.dependencies['@astro-deps/design-system']).toBe('workspace:*');
    expect(pkg.dependencies['@astro-deps/types']).toBe('workspace:*');
    expect(pkg.dependencies['@astro-deps/utils']).toBe('workspace:*');
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies.astro).toMatch(/^\^5\./);
    expect(pkg.scripts.dev).toBe('astro dev');
  });

  it('apps/web/astro.config.mjs wires up optimizeDeps + fs.allow', async () => {
    const o = opts('astro-cfg');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'apps/web/astro.config.mjs');
    expect(config).toContain('optimizeDeps');
    expect(config).toContain("'@astro-cfg/design-system'");
    expect(config).toContain('fs:');
    expect(config).toContain("'..'");
    expect(config).toContain("'../..'");
  });

  it('Layout.astro contains the HELiX runtime loader + ClientRouter', async () => {
    const o = opts('astro-layout');
    await scaffoldProject(o);
    const layout = await readText(o.directory, 'apps/web/src/layouts/Layout.astro');

    // Runtime loader — the inline <script>import '@helixui/library'</script>
    // block. Astro processes <script> tags + Vite bundles the import;
    // runs in the browser and calls customElements.define() once.
    expect(layout).toContain("import '@helixui/library'");
    expect(layout).toMatch(/<script>\s*\n\s*import '@helixui\/library';\s*\n\s*<\/script>/);

    // View transitions — Astro 5's ClientRouter (renamed from
    // <ViewTransitions /> in v4). Pin both the import source AND the
    // component reference so a copy edit can't drop one and pass.
    expect(layout).toContain('ClientRouter');
    expect(layout).toContain("import { ClientRouter } from 'astro:transitions'");

    // Tokens import targets the DS package's './tokens' export when
    // includeDesignSystem is true (the default for this opts() helper).
    expect(layout).toContain("import '@astro-layout/design-system/tokens'");
  });

  it('index.astro uses native <hx-*> tags (NOT React wrappers)', async () => {
    const o = opts('astro-native');
    await scaffoldProject(o);
    const index = await readText(o.directory, 'apps/web/src/pages/index.astro');
    expect(index).toContain('<hx-button');
    expect(index).toContain('<hx-card');
    expect(index).toContain('<hx-icon');
    // No React indirection.
    expect(index).not.toContain('createComponent');
    expect(index).not.toContain('@lit/react');
  });

  it('monorepo root files are not duplicated under apps/web/', async () => {
    const o = opts('astro-leak');
    await scaffoldProject(o);
    const fs = await import('fs-extra');
    const checks: Array<[string, boolean]> = [
      ['apps/web/pnpm-workspace.yaml', false],
      ['apps/web/turbo.json', false],
      ['apps/web/tsconfig.base.json', false],
      // The reverse — monorepo root should NOT have a stray astro.config.
      ['astro.config.mjs', false],
      ['src/layouts/Layout.astro', false],
    ];
    for (const [rel, shouldExist] of checks) {
      const exists = await fs.default.pathExists(path.join(o.directory, rel));
      expect(exists, `expected ${rel} exists=${String(shouldExist)}`).toBe(shouldExist);
    }
  });

  // v0.8.0 Phase C — DS opt-out coverage.
  //
  // When includeDesignSystem is false:
  //   - apps/web/package.json drops @{scope}/design-system from deps.
  //   - apps/web/package.json adds @helixui/tokens (the DS-package CSS
  //     layer isn't there to inherit, so apps/web reads tokens upstream).
  //   - apps/web/astro.config.mjs drops it from optimizeDeps.exclude.
  //   - apps/web/src/layouts/Layout.astro tokens import targets
  //     @helixui/tokens/tokens.css directly.
  //   - packages/design-system/ directory is NOT created.
  //   - packages/types + packages/utils STILL scaffold (Phase G stubs
  //     are unconditional — they're useful without a DS package).
  describe('DS opt-out variant', () => {
    it('drops @{scope}/design-system from apps/web/package.json deps + astro.config.mjs', async () => {
      const o = opts('astro-no-ds', { includeDesignSystem: false });
      await scaffoldProject(o);

      const pkg = await readJson<{ dependencies: Record<string, string> }>(
        o.directory,
        'apps/web/package.json',
      );
      expect(pkg.dependencies['@astro-no-ds/design-system']).toBeUndefined();
      expect(pkg.dependencies['@astro-no-ds/types']).toBe('workspace:*');
      expect(pkg.dependencies['@astro-no-ds/utils']).toBe('workspace:*');
      expect(pkg.dependencies['@helixui/tokens']).toBeDefined();

      const astroConfig = await readText(o.directory, 'apps/web/astro.config.mjs');
      expect(astroConfig).not.toContain("'@astro-no-ds/design-system'");
      expect(astroConfig).toContain("'@astro-no-ds/types'");

      const layout = await readText(o.directory, 'apps/web/src/layouts/Layout.astro');
      expect(layout).toContain("import '@helixui/tokens/tokens.css'");
      expect(layout).not.toContain("'@astro-no-ds/design-system/tokens'");

      const fs = await import('fs-extra');
      expect(await fs.default.pathExists(path.join(o.directory, 'packages/design-system'))).toBe(
        false,
      );
      expect(await fs.default.pathExists(path.join(o.directory, 'packages/types'))).toBe(true);
      expect(await fs.default.pathExists(path.join(o.directory, 'packages/utils'))).toBe(true);
    });
  });
});
