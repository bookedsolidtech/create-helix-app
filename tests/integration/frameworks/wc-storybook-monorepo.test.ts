/**
 * wc-storybook monorepo end-to-end emit (v0.7.0 Phase F).
 *
 * Drives scaffoldProject with monorepoMode + includeDesignSystem and
 * asserts the FULL tree of files landed where Phase F specifies — both
 * the monorepo root (pnpm-workspace.yaml, turbo.json, tsconfig.base.json)
 * and packages/design-system (package.json with @{scope}/design-system +
 * private:true + exports field, tsconfig.json extending the workspace
 * base with composite:true, src/index.ts re-exporting the 7 React
 * wrappers via @lit/react, plus the full wc-storybook factory output:
 * .storybook/, src/base/, src/components/{ds}-button/, etc.).
 *
 * Sister to the unit-style tests in
 * src/__tests__/wc-storybook-monorepo.test.ts — this file runs the
 * scaffoldProject API surface and uses the integration test helpers
 * (makeTmpRoot, assertFilesExist) for consistency with the rest of
 * tests/integration/frameworks/.
 */
import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('wc-storybook-monorepo');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'wc-storybook',
    componentBundles: ['all'],
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

describe('wc-storybook monorepo integration (Phase F)', () => {
  it('generates the full packages/design-system tree + monorepo root files', async () => {
    const o = opts('wcs-tree');
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
      // Workspace package dirs (types + utils are Phase G stubs).
      'packages/design-system',
      'packages/types',
      'packages/utils',
      // packages/design-system — the wc-storybook factory output.
      'packages/design-system/package.json',
      'packages/design-system/tsconfig.json',
      'packages/design-system/tsconfig.build.json',
      'packages/design-system/vite.config.ts',
      'packages/design-system/custom-elements.json',
      'packages/design-system/.storybook/main.ts',
      'packages/design-system/.storybook/preview.ts',
      'packages/design-system/src/index.ts',
      'packages/design-system/src/base/wcs-tree-element.ts',
      'packages/design-system/src/components/wcs-tree-button',
      'packages/design-system/src/tokens',
      'packages/design-system/src/stories/Cover.mdx',
    ]);
  });

  it('packages/design-system/package.json has @{scope}/design-system identity + workspace exports', async () => {
    const o = opts('wcs-pkg');
    await scaffoldProject(o);
    const pkg = await readJson<{
      name: string;
      private: boolean;
      type: string;
      exports: Record<string, unknown>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      scripts: Record<string, string>;
      main?: string;
      files?: string[];
    }>(o.directory, 'packages/design-system/package.json');
    expect(pkg.name).toBe('@wcs-pkg/design-system');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
    // v0.9.1 cross-kit audit: './' resolves to src/index.ts (not dist/)
    // so apps/web type-checks against the workspace package without
    // first building it. See writeDesignSystemPackageJson for full
    // rationale (the Turborepo "internal packages" recipe).
    expect(pkg.exports['.']).toEqual({
      types: './src/index.ts',
      import: './src/index.ts',
    });
    expect(pkg.exports['./tokens']).toBe('./src/tokens/tokens.css');
    expect(pkg.exports['./styles']).toBe('./dist/styles.css');
    // Publishable-library identity surface is NOT carried over to the
    // workspace package.
    expect(pkg.main).toBeUndefined();
    expect(pkg.files).toBeUndefined();
    // Storybook 10 + Lit 3 stack inherited from the wc-storybook template.
    expect(pkg.dependencies.lit).toBeDefined();
    expect(pkg.devDependencies.storybook).toMatch(/^\^10\./);
    expect(pkg.peerDependencies['@helixui/library']).toBeDefined();
    // Scripts match the flat factory's wc-storybook getScripts() output.
    expect(pkg.scripts.storybook).toContain('storybook dev');
    expect(pkg.scripts['build-storybook']).toContain('storybook build');
  });

  it('packages/design-system/tsconfig.json extends ../../tsconfig.base.json with composite:true', async () => {
    const o = opts('wcs-tsc');
    await scaffoldProject(o);
    const tsconfig = await readJson<{
      extends: string;
      compilerOptions: Record<string, unknown>;
    }>(o.directory, 'packages/design-system/tsconfig.json');
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
    expect(tsconfig.compilerOptions.composite).toBe(true);
    expect(tsconfig.compilerOptions.declaration).toBe(true);
    expect(tsconfig.compilerOptions.outDir).toBe('./dist');
    // v0.7.0 Phase H follow-up — rootDir intentionally dropped (tsc
    // infers from `include`). See _shared.ts:writeDesignSystemTsConfig.
    expect(tsconfig.compilerOptions.rootDir).toBeUndefined();
    expect(tsconfig.compilerOptions.experimentalDecorators).toBe(true);
    expect(tsconfig.compilerOptions.useDefineForClassFields).toBe(false);
  });

  it('packages/design-system/src/index.ts re-exports the 7 React wrappers', async () => {
    const o = opts('wcs-index');
    await scaffoldProject(o);
    const indexTs = await readText(o.directory, 'packages/design-system/src/index.ts');
    expect(indexTs).toContain("import { createComponent } from '@lit/react'");
    for (const wrapper of ['Button', 'Card', 'Dialog', 'Form', 'Select', 'Tabs', 'TextInput']) {
      expect(indexTs).toContain(`export const ${wrapper} = createComponent`);
    }
  });

  it('monorepo root files are not duplicated under packages/design-system/', async () => {
    const o = opts('wcs-leak');
    await scaffoldProject(o);
    const checks: Array<[string, boolean]> = [
      ['packages/design-system/pnpm-workspace.yaml', false],
      ['packages/design-system/turbo.json', false],
      ['packages/design-system/tsconfig.base.json', false],
      // The reverse — wc-storybook factory output should NOT leak to root.
      ['src', false],
      ['.storybook', false],
      ['vite.config.ts', false],
      ['custom-elements.json', false],
    ];
    const fs = await import('fs-extra');
    for (const [rel, shouldExist] of checks) {
      const exists = await fs.default.pathExists(path.join(o.directory, rel));
      expect(exists, `expected ${rel} exists=${String(shouldExist)}`).toBe(shouldExist);
    }
  });

  it('react-next + includeDesignSystem also lays down packages/design-system', async () => {
    // Phase F retrofit: when a Next.js monorepo opts into the DS, the DS
    // package is emitted alongside apps/web via scaffoldWcStorybookMonorepo.
    const o = opts('rnm-with-ds', { framework: 'react-next' });
    await scaffoldProject(o);
    const dsPkg = await readJson<{ name: string; private: boolean }>(
      o.directory,
      'packages/design-system/package.json',
    );
    expect(dsPkg.name).toBe('@rnm-with-ds/design-system');
    expect(dsPkg.private).toBe(true);
    const indexTs = await readText(o.directory, 'packages/design-system/src/index.ts');
    expect(indexTs).toContain('export const Button = createComponent');
  });

  // v0.7.0 Phase H — wc-storybook direct + DS opt-out short-circuit.
  //
  // scaffoldWcStorybookMonorepo has a built-in short-circuit: when
  // options.includeDesignSystem === false there's nothing to emit
  // because the whole point of the wc-storybook monorepo entry is the
  // DS package itself. The root scaffold (Phase C) still runs and
  // packages/types + packages/utils STILL emit per Phase G's
  // unconditional contract.
  describe('Phase H — wc-storybook DS opt-out short-circuit', () => {
    it('emits root + types + utils but skips packages/design-system when DS opted out', async () => {
      const o = opts('wcs-no-ds', { includeDesignSystem: false });
      await scaffoldProject(o);

      // Root scaffold STILL emits.
      await assertFilesExist(o.directory, [
        'pnpm-workspace.yaml',
        'turbo.json',
        'package.json',
        'tsconfig.json',
        'tsconfig.base.json',
        'README.md',
        '.gitignore',
        // Phase G stubs are unconditional.
        'packages/types/package.json',
        'packages/types/src/index.ts',
        'packages/utils/package.json',
        'packages/utils/src/index.ts',
      ]);

      // packages/design-system/ MUST be absent — the orchestrator's
      // Phase C contract: includeDesignSystem:false → no DS dir, no
      // tsconfig reference, no storybook scripts.
      const fs = await import('fs-extra');
      const dsExists = await fs.default.pathExists(
        path.join(o.directory, 'packages/design-system'),
      );
      expect(dsExists).toBe(false);

      // Root tsconfig.json drops the DS project reference too.
      const rootTsconfig = await readJson<{ references: Array<{ path: string }> }>(
        o.directory,
        'tsconfig.json',
      );
      const refs = rootTsconfig.references.map((r) => r.path);
      expect(refs).not.toContain('./packages/design-system');
      expect(refs).toContain('./packages/types');
      expect(refs).toContain('./packages/utils');

      // Root package.json drops the storybook + build-storybook scripts.
      const rootPkg = await readJson<{ scripts: Record<string, string> }>(
        o.directory,
        'package.json',
      );
      expect(rootPkg.scripts['storybook']).toBeUndefined();
      expect(rootPkg.scripts['build-storybook']).toBeUndefined();
    });
  });
});
