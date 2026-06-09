/**
 * react-vite monorepo end-to-end emit (v0.7.0 Phase E).
 *
 * Drives scaffoldProject with monorepoMode + includeDesignSystem and
 * asserts the FULL tree of files landed where Phase E specifies — both
 * the monorepo root (pnpm-workspace.yaml, turbo.json, tsconfig.base.json)
 * and apps/web (package.json with workspace:* deps, vite.config.ts with
 * optimizeDeps.exclude + server.fs.allow, the Vite SPA structure
 * inherited from the flat scaffolder).
 *
 * Sister to the unit-style tests in
 * src/__tests__/react-vite-monorepo.test.ts — this file runs the public
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

const ROOT = makeTmpRoot('react-vite-monorepo');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
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
    ...overrides,
  };
}

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('react-vite monorepo integration (Phase E)', () => {
  it('generates the full apps/web tree + monorepo root files', async () => {
    const o = opts('rvm-tree');
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
      // Workspace packages (stubs at this phase; E doesn't fill them).
      'packages/design-system',
      'packages/types',
      'packages/utils',
      // apps/web — the Vite SPA.
      'apps/web/package.json',
      'apps/web/vite.config.ts',
      'apps/web/tsconfig.json',
      'apps/web/index.html',
      'apps/web/helix-tokens.css',
      'apps/web/helix-responsive.css',
      'apps/web/src/main.tsx',
      'apps/web/src/App.tsx',
      'apps/web/src/index.css',
      'apps/web/src/components/Navbar.tsx',
      'apps/web/src/components/helix/wrappers.tsx',
      'apps/web/src/helix.d.ts',
      'apps/web/src/helix-setup.ts',
    ]);
  });

  it('apps/web/package.json has the expected workspace:* deps', async () => {
    const o = opts('rvm-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      name: string;
      private: boolean;
      dependencies: Record<string, string>;
    }>(o.directory, 'apps/web/package.json');
    expect(pkg.name).toBe('@rvm-deps/web');
    expect(pkg.private).toBe(true);
    expect(pkg.dependencies['@rvm-deps/design-system']).toBe('workspace:*');
    expect(pkg.dependencies['@rvm-deps/types']).toBe('workspace:*');
    expect(pkg.dependencies['@rvm-deps/utils']).toBe('workspace:*');
  });

  it('apps/web/vite.config.ts wires up optimizeDeps.exclude + server.fs.allow', async () => {
    const o = opts('rvm-cfg');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'apps/web/vite.config.ts');
    expect(config).toContain('optimizeDeps');
    expect(config).toContain('exclude');
    expect(config).toContain("'@rvm-cfg/design-system'");
    // server.fs.allow lets dev-server resolve the workspace tree above
    // apps/web/.
    expect(config).toContain("'..'");
    expect(config).toContain("'../..'");
  });

  it('apps/web wires the @helixui/icons local-sprite setup', async () => {
    const o = opts('rvm-icons-setup');
    await scaffoldProject(o);

    // react-vite's helix-setup.ts is its runtime loader (main.tsx imports
    // it). The monorepo path reuses the flat react-vite body, so this is
    // the same loader the flat scaffold emits. It points the
    // @helixui/icons registry at /icons/ BEFORE loading the library — and
    // does so inside an async IIFE rather than with a top-level await,
    // which would break `vite build` (default browser target has no TLA
    // support).
    const helixSetup = await readText(o.directory, 'apps/web/src/helix-setup.ts');
    expect(helixSetup).toContain("import { setBasePath } from '@helixui/icons'");
    expect(helixSetup).toContain("setBasePath('/icons')");
    expect(helixSetup).toContain("await import('@helixui/library')");
    expect(helixSetup).toContain('void (async () => {');
    expect(helixSetup).not.toMatch(/^await import/m);
    expect(helixSetup.indexOf("setBasePath('/icons')")).toBeLessThan(
      helixSetup.indexOf("await import('@helixui/library')"),
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
    const o = opts('rvm-leak');
    await scaffoldProject(o);
    // apps/web should NOT shadow the monorepo root layout files.
    const checks: Array<[string, boolean]> = [
      ['apps/web/pnpm-workspace.yaml', false],
      ['apps/web/turbo.json', false],
      ['apps/web/tsconfig.base.json', false],
      // The reverse — monorepo root should NOT have a stray src/ or
      // index.html.
      ['src/helix-setup.ts', false],
      ['vite.config.ts', false],
      ['index.html', false],
    ];
    const fs = await import('fs-extra');
    for (const [rel, shouldExist] of checks) {
      const exists = await fs.default.pathExists(path.join(o.directory, rel));
      expect(exists, `expected ${rel} exists=${String(shouldExist)}`).toBe(shouldExist);
    }
  });

  // v0.7.0 Phase H — DS opt-out coverage.
  //
  // Mirror of Phase D's DS opt-out variant for the Vite path. When DS is
  // opted out:
  //   - apps/web/package.json drops @{scope}/design-system from deps.
  //   - apps/web/vite.config.ts drops it from optimizeDeps.exclude.
  //   - packages/design-system/ directory is NOT created.
  //   - packages/types + packages/utils STILL scaffold (Phase G stubs are
  //     unconditional).
  describe('Phase H — DS opt-out variant', () => {
    it('drops @{scope}/design-system from apps/web/package.json deps + vite.config.ts optimizeDeps.exclude', async () => {
      const o = opts('rvm-no-ds', { includeDesignSystem: false });
      await scaffoldProject(o);

      const pkg = await readJson<{ dependencies: Record<string, string> }>(
        o.directory,
        'apps/web/package.json',
      );
      expect(pkg.dependencies['@rvm-no-ds/design-system']).toBeUndefined();
      expect(pkg.dependencies['@rvm-no-ds/types']).toBe('workspace:*');
      expect(pkg.dependencies['@rvm-no-ds/utils']).toBe('workspace:*');

      const viteConfig = await readText(o.directory, 'apps/web/vite.config.ts');
      expect(viteConfig).not.toContain("'@rvm-no-ds/design-system'");
      expect(viteConfig).toContain("'@rvm-no-ds/types'");
      expect(viteConfig).toContain("'@rvm-no-ds/utils'");
    });

    it('does NOT create packages/design-system/ when DS opted out', async () => {
      const o = opts('rvm-no-ds-dir', { includeDesignSystem: false });
      await scaffoldProject(o);
      const fs = await import('fs-extra');
      const dsExists = await fs.default.pathExists(
        path.join(o.directory, 'packages/design-system'),
      );
      expect(dsExists).toBe(false);
    });

    it('packages/types + packages/utils ALWAYS scaffold regardless of DS opt-in', async () => {
      const variants: Array<[boolean, string]> = [
        [true, 'rvm-ds-yes'],
        [false, 'rvm-ds-no'],
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
        const utilsPkg = await readJson<{ name: string; private: boolean }>(
          o.directory,
          'packages/utils/package.json',
        );
        expect(utilsPkg.name).toBe(`@${name}/utils`);
        expect(utilsPkg.private).toBe(true);
      }
    });
  });
});
