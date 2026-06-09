/**
 * react-next monorepo end-to-end emit (v0.7.0 Phase D).
 *
 * Drives scaffoldProject with monorepoMode + includeDesignSystem and
 * asserts the FULL tree of files landed where Phase D specifies — both
 * the monorepo root (pnpm-workspace.yaml, turbo.json, tsconfig.base.json)
 * and apps/web (package.json with workspace:* deps, next.config.ts with
 * transpilePackages, the App Router structure inherited from the flat
 * scaffolder).
 *
 * Sister to the unit-style tests in
 * src/__tests__/react-next-monorepo.test.ts — this file runs the public
 * scaffoldProject() API rather than the scaffold() wrapper to give us a
 * second angle on the dispatch, and uses the integration test helpers
 * (makeTmpRoot, assertFilesExist) for consistency with the rest of the
 * tests/integration/frameworks/ suite.
 */
import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('react-next-monorepo');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
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
    ...overrides,
  };
}

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('react-next monorepo integration (Phase D)', () => {
  it('generates the full apps/web tree + monorepo root files', async () => {
    const o = opts('rnm-tree');
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
      // Workspace packages (stubs at this phase; D doesn't fill them).
      'packages/design-system',
      'packages/types',
      'packages/utils',
      // apps/web — the Next.js app.
      'apps/web/package.json',
      'apps/web/next.config.ts',
      'apps/web/tsconfig.json',
      'apps/web/helix-tokens.css',
      'apps/web/helix-responsive.css',
      'apps/web/src/app/page.tsx',
      'apps/web/src/app/layout.tsx',
      'apps/web/src/app/globals.css',
      'apps/web/src/components/navbar.tsx',
      'apps/web/src/components/footer.tsx',
      'apps/web/src/components/theme-toggle.tsx',
      'apps/web/src/components/helix/wrappers.tsx',
      'apps/web/src/components/helix/provider.tsx',
      'apps/web/src/helix.d.ts',
      'apps/web/src/helix-setup.ts',
      'apps/web/src/app/examples/forms/page.tsx',
      'apps/web/src/app/examples/dashboard/page.tsx',
    ]);
  });

  it('apps/web/package.json has the expected workspace:* deps', async () => {
    const o = opts('rnm-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      name: string;
      private: boolean;
      dependencies: Record<string, string>;
    }>(o.directory, 'apps/web/package.json');
    expect(pkg.name).toBe('@rnm-deps/web');
    expect(pkg.private).toBe(true);
    expect(pkg.dependencies['@rnm-deps/design-system']).toBe('workspace:*');
    expect(pkg.dependencies['@rnm-deps/types']).toBe('workspace:*');
    expect(pkg.dependencies['@rnm-deps/utils']).toBe('workspace:*');
  });

  it('apps/web/next.config.ts wires up transpilePackages + externalDir', async () => {
    const o = opts('rnm-cfg');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'apps/web/next.config.ts');
    expect(config).toContain('transpilePackages');
    expect(config).toContain("'@rnm-cfg/design-system'");
    expect(config).toMatch(/externalDir:\s*true/);
  });

  it('apps/web wires the @helixui/icons local-sprite setup', async () => {
    const o = opts('rnm-icons-setup');
    await scaffoldProject(o);

    // The runtime loader is HelixProvider (provider.tsx) — the monorepo
    // path reuses the flat react-next body, so this is the same loader the
    // flat scaffold emits. It points the @helixui/icons registry at
    // /icons/ BEFORE importing @helixui/library; otherwise <hx-icon>
    // sprites resolve to the blocked cross-origin jsdelivr CDN default.
    const provider = await readText(o.directory, 'apps/web/src/components/helix/provider.tsx');
    expect(provider).toContain("import('@helixui/icons')");
    expect(provider).toContain("setBasePath('/icons')");
    expect(provider).toContain("import('@helixui/library')");
    expect(provider.indexOf("setBasePath('/icons')")).toBeLessThan(
      provider.indexOf("import('@helixui/library')"),
    );

    // scripts/copy-helix-icons.mjs lands inside apps/web (not at the
    // monorepo root) — the script resolves @helixui/icons up the dep
    // tree, which works for pnpm's hoisted workspace layout.
    const copyScript = await readText(o.directory, 'apps/web/scripts/copy-helix-icons.mjs');
    expect(copyScript).toContain('@helixui/icons/dist/helix.svg');
    expect(copyScript).toContain('@helixui/icons/dist/fa-free-solid.svg');
    expect(copyScript).toContain('createRequire(import.meta.url)');
    expect(copyScript).toContain("join(process.cwd(), 'public', 'icons')");

    // apps/web/package.json postinstall runs the copy script.
    const pkg = await readJson<{ scripts: Record<string, string> }>(
      o.directory,
      'apps/web/package.json',
    );
    expect(pkg.scripts['postinstall']).toBe('node scripts/copy-helix-icons.mjs');

    // The workspace-root .gitignore excludes the postinstall-generated
    // apps/web sprite dir.
    const gitignore = await readText(o.directory, '.gitignore');
    expect(gitignore).toContain('apps/web/public/icons/');
  });

  it('monorepo root files are not duplicated under apps/web/', async () => {
    const o = opts('rnm-leak');
    await scaffoldProject(o);
    // apps/web should NOT shadow the monorepo root layout files.
    const checks: Array<[string, boolean]> = [
      ['apps/web/pnpm-workspace.yaml', false],
      ['apps/web/turbo.json', false],
      ['apps/web/tsconfig.base.json', false],
      // The reverse — monorepo root should NOT have a stray src/.
      ['src/helix-setup.ts', false],
      ['next.config.ts', false],
    ];
    const fs = await import('fs-extra');
    for (const [rel, shouldExist] of checks) {
      const exists = await fs.default.pathExists(path.join(o.directory, rel));
      expect(exists, `expected ${rel} exists=${String(shouldExist)}`).toBe(shouldExist);
    }
  });

  // v0.7.0 Phase H — DS opt-out coverage.
  //
  // The interactive prompt + scaffold() API support a monorepo without the
  // workspace design-system. When DS is opted out, three things must change
  // simultaneously and ONE thing must NOT change:
  //   - apps/web/package.json drops @{scope}/design-system from deps.
  //   - apps/web/next.config.ts drops it from transpilePackages.
  //   - packages/design-system/ directory is NOT created.
  //   - packages/types + packages/utils STILL scaffold (Phase G stubs are
  //     unconditional — they're useful without a DS package).
  describe('Phase H — DS opt-out variant', () => {
    it('drops @{scope}/design-system from apps/web/package.json deps + next.config.ts transpilePackages', async () => {
      const o = opts('rnm-no-ds', { includeDesignSystem: false });
      await scaffoldProject(o);

      const pkg = await readJson<{ dependencies: Record<string, string> }>(
        o.directory,
        'apps/web/package.json',
      );
      expect(pkg.dependencies['@rnm-no-ds/design-system']).toBeUndefined();
      expect(pkg.dependencies['@rnm-no-ds/types']).toBe('workspace:*');
      expect(pkg.dependencies['@rnm-no-ds/utils']).toBe('workspace:*');

      const nextConfig = await readText(o.directory, 'apps/web/next.config.ts');
      expect(nextConfig).not.toContain("'@rnm-no-ds/design-system'");
      expect(nextConfig).toContain("'@rnm-no-ds/types'");
      expect(nextConfig).toContain("'@rnm-no-ds/utils'");
    });

    it('does NOT create packages/design-system/ when DS opted out', async () => {
      const o = opts('rnm-no-ds-dir', { includeDesignSystem: false });
      await scaffoldProject(o);
      const fs = await import('fs-extra');
      const dsExists = await fs.default.pathExists(
        path.join(o.directory, 'packages/design-system'),
      );
      expect(dsExists).toBe(false);
    });

    it('packages/types + packages/utils ALWAYS scaffold regardless of DS opt-in', async () => {
      // Run BOTH variants (DS opted in / out) and confirm types + utils
      // always emit their full stub-package shape: package.json,
      // tsconfig.json, src/index.ts.
      const variants: Array<[boolean, string]> = [
        [true, 'rnm-ds-yes'],
        [false, 'rnm-ds-no'],
      ];
      for (const [includeDesignSystem, name] of variants) {
        const o = opts(name, { includeDesignSystem });
        await scaffoldProject(o);
        await assertFilesExist(o.directory, [
          'packages/types/package.json',
          'packages/types/tsconfig.json',
          'packages/types/src/index.ts',
          'packages/utils/package.json',
          'packages/utils/tsconfig.json',
          'packages/utils/src/index.ts',
        ]);
        const typesPkg = await readJson<{ name: string; private: boolean }>(
          o.directory,
          'packages/types/package.json',
        );
        expect(typesPkg.name).toBe(`@${name}/types`);
        expect(typesPkg.private).toBe(true);
      }
    });
  });
});
