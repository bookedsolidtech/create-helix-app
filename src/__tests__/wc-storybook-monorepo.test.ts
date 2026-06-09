/**
 * v0.7.0 Phase F — wc-storybook monorepo emit (packages/design-system).
 *
 * Pins the contract documented on scaffold/wc-storybook/monorepo.ts:
 *
 *   - packages/design-system is a complete wc-storybook factory scaffold
 *     (the same .storybook/, src/base/, src/components/{ds}-button/,
 *     src/tokens/, src/stories/, vite.config.ts, custom-elements.json,
 *     tsconfig.build.json the flat path emits), redirected under the
 *     workspace package root.
 *   - packages/design-system/package.json is named `@{scope}/design-system`,
 *     is `private: true`, and exposes the `./` / `./tokens` / `./styles`
 *     exports field. Dependencies + devDependencies + peerDependencies
 *     match the wc-storybook template (Storybook 10 + Lit 3 + @helixui/*).
 *   - packages/design-system/tsconfig.json extends ../../tsconfig.base.json
 *     with composite:true + declaration:true so `tsc -b` from the
 *     monorepo root can build the package and apps/web can resolve types
 *     through the dist/ output.
 *   - packages/design-system/src/index.ts re-exports the 7 React wrappers
 *     (Button, Card, Dialog, Form, Select, Tabs, TextInput) via
 *     @lit/react createComponent, plus the DS Lit class + variant types
 *     the flat factory emits for Storybook stories.
 *   - includeDesignSystem:false short-circuits the DS emit entirely —
 *     the orchestrator drops the packages/design-system dir and Phase F
 *     does nothing (parity with the Phase C contract).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldProject } from '../scaffold.js';

const TEST_ROOT = path.join(tmpdir(), `create-helix-phase-f-${process.pid}`);

beforeEach(async () => {
  await fs.ensureDir(TEST_ROOT);
});

afterEach(async () => {
  await fs.remove(TEST_ROOT);
});

/**
 * Drive scaffoldProject directly so we exercise the wc-storybook monorepo
 * entry point that api.ts's public scaffold() silently coerces to flat
 * for wc-storybook. force:true tolerates leftover state across reruns.
 */
async function scaffoldWcMonorepo(args: {
  dir: string;
  name?: string;
  includeDesignSystem?: boolean;
}): Promise<void> {
  await fs.ensureDir(args.dir);
  await scaffoldProject({
    name: args.name ?? 'phase-f-wcs',
    directory: args.dir,
    framework: 'wc-storybook',
    componentBundles: ['all'],
    typescript: true,
    eslint: true,
    designTokens: true,
    darkMode: false,
    installDeps: false,
    force: true,
    monorepoMode: true,
    includeDesignSystem: args.includeDesignSystem ?? true,
  });
}

describe('v0.7.0 Phase F — wc-storybook monorepo emits packages/design-system', () => {
  it('produces the workspace-aware manifest (name, private, exports)', async () => {
    const dir = path.join(TEST_ROOT, 'pkg');
    await scaffoldWcMonorepo({ dir, name: 'aurora-app' });

    const pkg = await fs.readJson(path.join(dir, 'packages', 'design-system', 'package.json'));
    expect(pkg.name).toBe('@aurora-app/design-system');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
    expect(pkg.version).toBe('0.0.0');

    // Exports field is the contract apps/web's `@aurora-app/design-system`
    // import resolves against.
    //
    // v0.9.1 cross-kit audit: './' resolves to src/index.ts (not
    // dist/index.{d.ts,js}) — the Turborepo "internal packages" recipe.
    // Apps with bundler transpilation (Next.js transpilePackages, Vite
    // optimizeDeps.exclude + server.fs.allow) compile the workspace
    // package's source on demand, so we don't need pre-built dist
    // artifacts at type-check or dev-server time. The earlier dist/-
    // pointing exports broke `pnpm install && pnpm --filter=@scope/web
    // type-check` cold-start because dist/ doesn't exist until the DS
    // is explicitly built first, and pnpm-filter bypasses Turbo's
    // dependency graph.
    expect(pkg.exports['.']).toEqual({
      types: './src/index.ts',
      import: './src/index.ts',
    });
    // v0.9.1 round-6 follow-up: Lit-class re-exports moved off the
    // package root to './lit' so apps/web type-checks never pull
    // decorator-based Lit source files into their compilation.
    expect(pkg.exports['./lit']).toEqual({
      types: './src/lit.ts',
      import: './src/lit.ts',
    });
    expect(pkg.exports['./tokens']).toBe('./src/tokens/tokens.css');
    // './styles' remains pointed at dist/ because the compiled stylesheet
    // only exists post-build — it's an OPTIONAL artifact, not part of
    // the always-on consumer contract.
    expect(pkg.exports['./styles']).toBe('./dist/styles.css');

    // The publishable-library identity surface is NOT carried over from
    // the flat template — workspace package, not a publishable lib.
    expect(pkg.main).toBeUndefined();
    expect(pkg.module).toBeUndefined();
    expect(pkg.types).toBeUndefined();
    expect(pkg.files).toBeUndefined();
    expect(pkg.customElements).toBeUndefined();
    expect(pkg.sideEffects).toBeUndefined();

    // Dependencies + devDependencies match the wc-storybook template
    // (sample assertions; the full set lives in templates.ts).
    expect(pkg.dependencies.lit).toMatch(/^\^3\./);
    expect(pkg.devDependencies.storybook).toMatch(/^\^10\./);
    expect(pkg.devDependencies['@storybook/web-components-vite']).toBeDefined();
    expect(pkg.devDependencies.vite).toBeDefined();
    expect(pkg.devDependencies.vitest).toBeDefined();
    expect(pkg.devDependencies.typescript).toBeDefined();
    expect(pkg.peerDependencies['@helixui/library']).toBeDefined();

    // Scripts are the same Storybook + token + CEM chain the flat factory
    // emits — Turborepo invokes `storybook` / `build-storybook` from the
    // monorepo root via --filter=@aurora-app/design-system.
    expect(pkg.scripts.storybook).toContain('storybook dev');
    expect(pkg.scripts['build-storybook']).toContain('storybook build');
    expect(pkg.scripts['type-check']).toBe('tsc --noEmit');
    expect(pkg.scripts['cem:catalog']).toBeDefined();
  });

  it('overrides tsconfig.json to extend ../../tsconfig.base.json with composite:true', async () => {
    const dir = path.join(TEST_ROOT, 'tsconfig');
    await scaffoldWcMonorepo({ dir, name: 'aurora-app' });

    const tsconfig = await fs.readJson(
      path.join(dir, 'packages', 'design-system', 'tsconfig.json'),
    );
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
    expect(tsconfig.compilerOptions.composite).toBe(true);
    expect(tsconfig.compilerOptions.declaration).toBe(true);
    expect(tsconfig.compilerOptions.declarationMap).toBe(true);
    expect(tsconfig.compilerOptions.outDir).toBe('./dist');
    // v0.7.0 Phase H follow-up — rootDir intentionally NOT set; tsc
    // infers it from `include` patterns. Pinning ./src here trapped
    // helix.storybook.config.ts (at the package root) and tokens.json
    // (excluded by the *.ts glob) outside the project, breaking
    // `pnpm type-check`.
    expect(tsconfig.compilerOptions.rootDir).toBeUndefined();
    // Lit decorator runtime — both flags required for components to render.
    expect(tsconfig.compilerOptions.experimentalDecorators).toBe(true);
    expect(tsconfig.compilerOptions.useDefineForClassFields).toBe(false);
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    expect(tsconfig.include).toContain('src/**/*.ts');
    expect(tsconfig.include).toContain('src/**/*.tsx');
    // v0.7.0 Phase H follow-up — JSON token files + the root-level
    // Storybook config knob have to be in the project graph.
    expect(tsconfig.include).toContain('src/**/*.json');
    expect(tsconfig.include).toContain('helix.storybook.config.ts');
    expect(tsconfig.include).toContain('custom-elements.json');
    expect(tsconfig.exclude).toContain('node_modules');
    expect(tsconfig.exclude).toContain('.storybook');
    expect(tsconfig.exclude).toContain('scripts');

    // The base file itself exists at the monorepo root (emitted by Phase C).
    const base = await fs.readJson(path.join(dir, 'tsconfig.base.json'));
    expect(base.compilerOptions.strict).toBe(true);
  });

  it('emits src/index.ts re-exporting the 7 React wrappers via @lit/react', async () => {
    const dir = path.join(TEST_ROOT, 'index');
    await scaffoldWcMonorepo({ dir, name: 'aurora-app' });

    const indexTs = await fs.readFile(
      path.join(dir, 'packages', 'design-system', 'src', 'index.ts'),
      'utf8',
    );

    // @lit/react bridge + the 7 component-import side effects.
    expect(indexTs).toContain("import { createComponent } from '@lit/react'");
    expect(indexTs).toContain("import '@helixui/library/components/hx-button'");
    expect(indexTs).toContain("import '@helixui/library/components/hx-card'");
    expect(indexTs).toContain("import '@helixui/library/components/hx-dialog'");
    expect(indexTs).toContain("import '@helixui/library/components/hx-form'");
    expect(indexTs).toContain("import '@helixui/library/components/hx-select'");
    expect(indexTs).toContain("import '@helixui/library/components/hx-tabs'");
    expect(indexTs).toContain("import '@helixui/library/components/hx-text-input'");

    // The 7 React-wrapper named exports.
    expect(indexTs).toContain('export const Button = createComponent');
    expect(indexTs).toContain('export const Card = createComponent');
    expect(indexTs).toContain('export const Dialog = createComponent');
    expect(indexTs).toContain('export const Form = createComponent');
    expect(indexTs).toContain('export const Select = createComponent');
    expect(indexTs).toContain('export const Tabs = createComponent');
    expect(indexTs).toContain('export const TextInput = createComponent');

    // Event-name → onHandler mapping for the components with custom events.
    expect(indexTs).toContain('onHxClick');
    expect(indexTs).toContain('onHxChange');
    expect(indexTs).toContain('onHxSubmit');
    expect(indexTs).toContain('onHxOpen');
    expect(indexTs).toContain('onHxClose');

    // v0.9.1 round-6 follow-up: Lit class + variant-type re-exports
    // moved off the package-root index.ts to src/lit.ts (exposed via
    // the './lit' subpath in package.json exports). The package root
    // stays React-only so apps/web type-checks never pull
    // decorator-based source files into compilation. Storybook
    // stories continue to use relative imports — no API change there.
    expect(indexTs).not.toContain("from './base/");
    expect(indexTs).not.toContain('AuroraAppButton');

    const litTs = await fs.readFile(
      path.join(dir, 'packages', 'design-system', 'src', 'lit.ts'),
      'utf8',
    );
    expect(litTs).toContain("from './base/aurora-app-element.js'");
    expect(litTs).toContain('AuroraAppButton');
    expect(litTs).toContain('ButtonVariant');
  });

  it('redirects every wc-storybook factory output under packages/design-system', async () => {
    const dir = path.join(TEST_ROOT, 'tree');
    await scaffoldWcMonorepo({ dir, name: 'aurora-app' });

    const dsDir = path.join(dir, 'packages', 'design-system');

    // .storybook/ — preview, main, manager all written by the factory.
    expect(await fs.pathExists(path.join(dsDir, '.storybook', 'main.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(dsDir, '.storybook', 'preview.ts'))).toBe(true);

    // src/base/{ds}-element.ts — the brand-extending base class.
    expect(await fs.pathExists(path.join(dsDir, 'src', 'base', 'aurora-app-element.ts'))).toBe(
      true,
    );

    // src/components/{ds}-button/ — the seed component.
    expect(await fs.pathExists(path.join(dsDir, 'src', 'components', 'aurora-app-button'))).toBe(
      true,
    );

    // src/tokens/ — the brand token bridge.
    expect(await fs.pathExists(path.join(dsDir, 'src', 'tokens'))).toBe(true);

    // src/stories/ — Cover.mdx, Foundations pages, etc.
    expect(await fs.pathExists(path.join(dsDir, 'src', 'stories', 'Cover.mdx'))).toBe(true);

    // Library-mode infrastructure (vite.config.ts, tsconfig.build.json,
    // custom-elements.json) all redirected as well.
    expect(await fs.pathExists(path.join(dsDir, 'vite.config.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(dsDir, 'tsconfig.build.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dsDir, 'custom-elements.json'))).toBe(true);

    // Nothing leaked back to the monorepo root — the root has the
    // workspace package.json, NOT the factory's library package.json.
    const rootPkg = await fs.readJson(path.join(dir, 'package.json'));
    expect(rootPkg.workspaces).toEqual(['apps/*', 'packages/*']);
    expect(rootPkg.dependencies?.lit).toBeUndefined();
  });
});

describe('v0.7.0 Phase F — includeDesignSystem:false short-circuits the DS emit', () => {
  it('omits packages/design-system entirely', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds');
    await scaffoldWcMonorepo({ dir, name: 'plain-wcs', includeDesignSystem: false });
    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(false);
    // Phase C's orchestrator still emits the rest of the root.
    expect(await fs.pathExists(path.join(dir, 'pnpm-workspace.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'turbo.json'))).toBe(true);
  });
});

describe('v0.7.0 Phase F — Phase D + E retrofits: react-next / react-vite emit the DS package alongside apps/web', () => {
  it('react-next + includeDesignSystem:true emits packages/design-system with the DS overlay', async () => {
    const dir = path.join(TEST_ROOT, 'rn-with-ds');
    await fs.ensureDir(dir);
    await scaffoldProject({
      name: 'aurora-stack',
      directory: dir,
      framework: 'react-next',
      componentBundles: ['all'],
      typescript: true,
      eslint: true,
      designTokens: true,
      darkMode: false,
      installDeps: false,
      force: true,
      monorepoMode: true,
      includeDesignSystem: true,
    });

    // apps/web (Phase D) AND packages/design-system (Phase F) both
    // present and populated.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'package.json'))).toBe(true);
    const dsPkg = await fs.readJson(path.join(dir, 'packages', 'design-system', 'package.json'));
    expect(dsPkg.name).toBe('@aurora-stack/design-system');
    expect(dsPkg.private).toBe(true);
    expect(dsPkg.exports['.']).toBeDefined();

    // The React-wrappers barrel exists and exports the 7 components.
    const indexTs = await fs.readFile(
      path.join(dir, 'packages', 'design-system', 'src', 'index.ts'),
      'utf8',
    );
    expect(indexTs).toContain('export const Button = createComponent');
    expect(indexTs).toContain('export const TextInput = createComponent');

    // apps/web's wrappers.tsx re-exports from the workspace package by
    // name (Phase D's contract); the DS package's actual src/index.ts is
    // what that re-export resolves against.
    const appWrappers = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'components', 'helix', 'wrappers.tsx'),
      'utf8',
    );
    expect(appWrappers).toContain("from '@aurora-stack/design-system'");
  });

  it('react-vite + includeDesignSystem:true emits packages/design-system with the DS overlay', async () => {
    const dir = path.join(TEST_ROOT, 'rv-with-ds');
    await fs.ensureDir(dir);
    await scaffoldProject({
      name: 'aurora-spa',
      directory: dir,
      framework: 'react-vite',
      componentBundles: ['all'],
      typescript: true,
      eslint: true,
      designTokens: true,
      darkMode: false,
      installDeps: false,
      force: true,
      monorepoMode: true,
      includeDesignSystem: true,
    });

    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'package.json'))).toBe(true);
    const dsPkg = await fs.readJson(path.join(dir, 'packages', 'design-system', 'package.json'));
    expect(dsPkg.name).toBe('@aurora-spa/design-system');

    // Same React-wrappers barrel under packages/design-system regardless
    // of the consuming app framework.
    const indexTs = await fs.readFile(
      path.join(dir, 'packages', 'design-system', 'src', 'index.ts'),
      'utf8',
    );
    expect(indexTs).toContain('export const Button = createComponent');
  });

  it('react-next + includeDesignSystem:false does NOT emit packages/design-system', async () => {
    const dir = path.join(TEST_ROOT, 'rn-no-ds');
    await fs.ensureDir(dir);
    await scaffoldProject({
      name: 'plain-rn',
      directory: dir,
      framework: 'react-next',
      componentBundles: ['all'],
      typescript: true,
      eslint: true,
      designTokens: true,
      darkMode: false,
      installDeps: false,
      force: true,
      monorepoMode: true,
      includeDesignSystem: false,
    });
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(false);
  });
});
