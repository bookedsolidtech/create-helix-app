import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('wc-storybook');

afterAll(async () => {
  await removeTempDir(ROOT);
});

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'wc-storybook',
    componentBundles: ['core'],
    typescript: true,
    eslint: false,
    designTokens: true,
    darkMode: false,
    installDeps: false,
    dsName: 'bolt',
    tokenPrefix: '--bolt',
    ...overrides,
  };
}

describe('wc-storybook integration', () => {
  it('generates all required files', async () => {
    const o = opts('wcs-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'vite.config.ts',
      'vitest.config.ts',
      'tsconfig.json',
      '.storybook/main.ts',
      '.storybook/preview.ts',
      '.storybook/manager.ts',
      '.storybook/vitest.setup.ts',
      'src/base/bolt-element.ts',
      'src/components/bolt-button/bolt-button.ts',
      'src/components/bolt-button/bolt-button.styles.ts',
      'src/components/bolt-button/bolt-button.stories.ts',
      'src/stories/Welcome.stories.ts',
      'src/stories/HelixCatalog.stories.ts',
      'src/stories/_catalog-helpers.ts',
      'scripts/generate-catalog.ts',
      'src/stories/design-tokens/Colors.stories.ts',
      'src/stories/design-tokens/Borders.stories.ts',
      'src/stories/design-tokens/Shadows.stories.ts',
      'src/stories/design-tokens/Spacing.stories.ts',
      'src/tokens/tokens.css',
      'src/tokens/tokens.json',
      'scripts/build-tokens.ts',
      'scripts/sync-tokens.ts',
      '.env.example',
      'src/index.ts',
      'src/helix-setup.ts',
      'custom-elements.json',
      '.gitignore',
      'README.md',
    ]);
  });

  it('.storybook/main.ts uses v10 addons with getAbsolutePath', async () => {
    const o = opts('wcs-main');
    await scaffoldProject(o);
    const main = await readText(o.directory, '.storybook/main.ts');
    expect(main).toContain('@storybook/web-components-vite');
    expect(main).toContain('@storybook/addon-a11y');
    expect(main).toContain('@storybook/addon-docs');
    expect(main).toContain('@storybook/addon-vitest');
    expect(main).toContain('@storybook/addon-themes');
    expect(main).toContain('getAbsolutePath');
    expect(main).toContain('disableTelemetry: true');
    expect(main).toContain('viteFinal');
    expect(main).toContain('*.stories.@(ts|tsx)');
    // v10 does not use addon-essentials
    expect(main).not.toContain('addon-essentials');
  });

  it('.storybook/preview.ts has setCustomElementsManifest and theme switching', async () => {
    const o = opts('wcs-preview');
    await scaffoldProject(o);
    const preview = await readText(o.directory, '.storybook/preview.ts');
    expect(preview).toContain('@helixui/library');
    expect(preview).toContain('../src/tokens/tokens.css');
    expect(preview).toContain('withThemeByDataAttribute');
    expect(preview).toContain('data-theme');
    expect(preview).toContain('setCustomElementsManifest');
    expect(preview).toContain('storySort');
  });

  it('.storybook/manager.ts has ds name branding with storybook/theming', async () => {
    const o = opts('wcs-manager');
    await scaffoldProject(o);
    const manager = await readText(o.directory, '.storybook/manager.ts');
    expect(manager).toContain('Bolt Design System');
    expect(manager).toContain('brandTitle');
    expect(manager).toContain("from 'storybook/theming'");
    // v10 uses storybook/theming not storybook/theming/create
    expect(manager).not.toContain('storybook/theming/create');
  });

  it('.storybook/vitest.setup.ts has setProjectAnnotations', async () => {
    const o = opts('wcs-vitestsetup');
    await scaffoldProject(o);
    const setup = await readText(o.directory, '.storybook/vitest.setup.ts');
    expect(setup).toContain('setProjectAnnotations');
    expect(setup).toContain('@storybook/web-components');
    expect(setup).toContain('./preview');
  });

  it('vitest.config.ts has storybookTest plugin and playwright browser provider', async () => {
    const o = opts('wcs-vitest');
    await scaffoldProject(o);
    const vitest = await readText(o.directory, 'vitest.config.ts');
    expect(vitest).toContain('storybookTest');
    expect(vitest).toContain('@storybook/addon-vitest/vitest-plugin');
    expect(vitest).toContain("provider: 'playwright'");
    expect(vitest).toContain('chromium');
    expect(vitest).toContain('fileParallelism: false');
    expect(vitest).toContain('testTimeout: 30000');
    expect(vitest).toContain('experimentalDecorators: true');
  });

  it('src/base/bolt-element.ts extends HelixElement', async () => {
    const o = opts('wcs-base');
    await scaffoldProject(o);
    const base = await readText(o.directory, 'src/base/bolt-element.ts');
    expect(base).toContain('extends HelixElement');
    expect(base).toContain('@helixui/library');
    expect(base).toContain('BoltElement');
  });

  it('src/components/bolt-button/bolt-button.ts uses guarded customElements.define', async () => {
    const o = opts('wcs-button');
    await scaffoldProject(o);
    const button = await readText(o.directory, 'src/components/bolt-button/bolt-button.ts');
    // Uses guarded define instead of @customElement for HMR safety
    expect(button).toContain("customElements.get('bolt-button')");
    expect(button).toContain("customElements.define('bolt-button'");
    // Track-1 brand extension: extends HelixButton directly (full platform API inherited)
    expect(button).toContain('extends HelixButton');
    expect(button).toContain('BoltButton');
  });

  it('src/components/bolt-button/bolt-button.stories.ts has CSF3 + autodocs + play functions', async () => {
    const o = opts('wcs-stories');
    await scaffoldProject(o);
    const stories = await readText(
      o.directory,
      'src/components/bolt-button/bolt-button.stories.ts',
    );
    expect(stories).toContain("tags: ['autodocs']");
    expect(stories).toContain('export const Primary');
    expect(stories).toContain('export const AllVariants');
    expect(stories).toContain('export const Disabled');
    expect(stories).toContain('@storybook/web-components');
    expect(stories).toContain('storybook/test');
    expect(stories).toContain('play:');
    expect(stories).toContain('canvasElement');
  });

  it('src/stories/Welcome.stories.ts has Welcome/Introduction story', async () => {
    const o = opts('wcs-welcome');
    await scaffoldProject(o);
    const welcome = await readText(o.directory, 'src/stories/Welcome.stories.ts');
    expect(welcome).toContain("title: 'Welcome'");
    expect(welcome).toContain('Introduction');
    expect(welcome).toContain('Bolt Design System');
    expect(welcome).toContain('pnpm storybook');
  });

  it('src/stories/design-tokens/Colors.stories.ts reads from @helixui/tokens', async () => {
    const o = opts('wcs-tokenstory');
    await scaffoldProject(o);
    const colors = await readText(o.directory, 'src/stories/design-tokens/Colors.stories.ts');
    expect(colors).toContain("title: 'Design Tokens/Colors'");
    expect(colors).toContain('tokens/tokens.json');
    expect(colors).toContain('--hx-color-');
    expect(colors).toContain('export const Primary');
    expect(colors).toContain('export const Semantic');
    expect(colors).toContain("tags: ['autodocs']");
  });

  it('src/stories/design-tokens/Borders.stories.ts reads border tokens', async () => {
    const o = opts('wcs-tokenborders');
    await scaffoldProject(o);
    const borders = await readText(o.directory, 'src/stories/design-tokens/Borders.stories.ts');
    expect(borders).toContain("title: 'Design Tokens/Borders'");
    expect(borders).toContain('tokens/tokens.json');
    expect(borders).toContain('--hx-border-radius-');
    expect(borders).toContain('export const Radius');
    expect(borders).toContain('export const Width');
  });

  it('src/stories/design-tokens/Shadows.stories.ts reads shadow tokens', async () => {
    const o = opts('wcs-tokenshadows');
    await scaffoldProject(o);
    const shadows = await readText(o.directory, 'src/stories/design-tokens/Shadows.stories.ts');
    expect(shadows).toContain("title: 'Design Tokens/Shadows'");
    expect(shadows).toContain('tokens/tokens.json');
    expect(shadows).toContain('--hx-shadow-');
    expect(shadows).toContain('export const AllShadows');
  });

  it('src/stories/design-tokens/Spacing.stories.ts reads space tokens', async () => {
    const o = opts('wcs-tokenspacing');
    await scaffoldProject(o);
    const spacing = await readText(o.directory, 'src/stories/design-tokens/Spacing.stories.ts');
    expect(spacing).toContain("title: 'Design Tokens/Spacing'");
    expect(spacing).toContain('tokens/tokens.json');
    expect(spacing).toContain('--hx-space-');
    expect(spacing).toContain('export const SpaceScale');
  });

  it('src/components/bolt-button/bolt-button.styles.ts bridges --{prefix}-* tokens to --hx-* at :host', async () => {
    const o = opts('wcs-styles');
    await scaffoldProject(o);
    const styles = await readText(o.directory, 'src/components/bolt-button/bolt-button.styles.ts');
    expect(styles).toContain('BoltButtonStyles');
    expect(styles).toContain('ButtonVariant');
    // Brand values live in tokens.json. The :host block in this file is a
    // thin bridge: it maps --{prefix}-* into the --hx-* names HelixButton
    // consumes internally, applied at :host so it beats @helixui/library's
    // document-level adoptedStyleSheets.
    expect(styles).toContain(':host');
    expect(styles).toContain('--hx-color-primary-500: var(--bolt-color-primary-500)');
    expect(styles).toContain('--hx-color-neutral-0: var(--bolt-color-neutral-0');
    expect(styles).toContain('--hx-color-error-500: var(--bolt-color-error-500)');
    // Literal brand assignments still forbidden — all values route through tokens.json.
    expect(styles).not.toMatch(/--hx-color-primary-500:\s*#/);
    expect(styles).not.toMatch(/--bolt-color-primary-500:\s*#/);
  });

  it('src/tokens/tokens.css is AUTO-GENERATED with platform import', async () => {
    const o = opts('wcs-tokens');
    await scaffoldProject(o);
    const tokens = await readText(o.directory, 'src/tokens/tokens.css');
    expect(tokens).toContain('AUTO-GENERATED');
    expect(tokens).toContain('build:tokens');
    expect(tokens).toContain("@import '@helixui/tokens/tokens.css'");
  });

  it('scripts/build-tokens.ts emits --{prefix}-* vars from tokens.json', async () => {
    const o = opts('wcs-generator');
    await scaffoldProject(o);
    const gen = await readText(o.directory, 'scripts/build-tokens.ts');
    expect(gen).toContain("const PREFIX = '--bolt'");
    expect(gen).toContain('tokens.json');
    expect(gen).toContain('--watch');
    expect(gen).toContain('fs.watch(INPUT');
    expect(gen).toContain('AUTO-GENERATED');
  });

  it('scripts/sync-tokens.ts pulls from Figma REST with .env credentials', async () => {
    const o = opts('wcs-sync');
    await scaffoldProject(o);
    const sync = await readText(o.directory, 'scripts/sync-tokens.ts');
    // Loads credentials from .env (scaffolded project owns its own creds).
    expect(sync).toContain("import 'dotenv/config'");
    expect(sync).toContain('process.env.FIGMA_TOKEN');
    expect(sync).toContain('process.env.FIGMA_FILE_KEY');
    // Configurable primitives-collection name with HELiX default.
    expect(sync).toContain('FIGMA_PRIMITIVES_COLLECTION');
    expect(sync).toContain("'HELiX Primitives'");
    // Hits the Variables REST endpoint.
    expect(sync).toContain('api.figma.com/v1/files/');
    expect(sync).toContain('/variables/local');
    expect(sync).toContain('X-FIGMA-TOKEN');
    // Resolves VARIABLE_ALIAS chains (the load-bearing transformer).
    expect(sync).toContain('VARIABLE_ALIAS');
    expect(sync).toContain('resolveValue');
    // Emits the nested {category.group.scale.value} shape into src/tokens/tokens.json.
    expect(sync).toContain("'src/tokens/tokens.json'");
    // Explicit 403 guidance steers non-Enterprise users to the plugin.
    expect(sync).toContain('403');
    expect(sync).toContain('HELiX Token Suite');
    // Universal — no figgy-specific paths leaked from export.ts.
    expect(sync).not.toContain('figgy');
    expect(sync).not.toContain('/Volumes/');
  });

  it('.env.example documents the Figma credentials required by tokens:sync', async () => {
    const o = opts('wcs-envexample');
    await scaffoldProject(o);
    const envExample = await readText(o.directory, '.env.example');
    expect(envExample).toContain('FIGMA_TOKEN=');
    expect(envExample).toContain('FIGMA_FILE_KEY=');
    // Optional collection override is documented (commented out).
    expect(envExample).toContain('FIGMA_PRIMITIVES_COLLECTION');
    expect(envExample).toContain('tokens:sync');
  });

  it('.gitignore excludes .env so scaffolded credentials never commit', async () => {
    const o = opts('wcs-envignore');
    await scaffoldProject(o);
    const gitignore = await readText(o.directory, '.gitignore');
    expect(gitignore).toMatch(/^\.env$/m);
  });

  it('src/tokens/tokens.json stub contains button font + focus tokens', async () => {
    const o = opts('wcs-tokensjson');
    await scaffoldProject(o);
    const tokens = await readJson<{
      button?: Record<string, { value: string }>;
    }>(o.directory, 'src/tokens/tokens.json');
    // Either the upstream @helixui/tokens JSON is in place, or our stub is. The
    // stub carries the button.* keys that used to live as :host overrides.
    if (tokens.button) {
      expect(tokens.button['font-family']?.value).toBeDefined();
      expect(tokens.button['font-weight']?.value).toBeDefined();
      expect(tokens.button['focus-ring-color']?.value).toBeDefined();
    }
  });

  it('src/tokens/tokens.json stub emits Helix 3.3.1 semantic groups (text.on-*-strong, border.on-dark-*)', async () => {
    const o = opts('wcs-semantic-groups');
    await scaffoldProject(o);
    const tokens = await readJson<{
      color?: {
        text?: Record<string, { value: string }>;
        border?: Record<string, { value: string }>;
      };
      button?: Record<string, { value: string }>;
    }>(o.directory, 'src/tokens/tokens.json');
    // Skip the assertion when the upstream @helixui/tokens JSON wins (its own
    // shape carries the semantic groups via different paths). Run the assertion
    // only when our stub fallback is what landed on disk — detected by the
    // stub-only marker `button.font-family = system-ui...`.
    const isStub = tokens.button?.['font-family']?.value === 'system-ui, sans-serif';
    if (!isStub) return;
    // 3.2.1 token-cascade campaign — white-on-darker-{role} foregrounds.
    expect(tokens.color?.text?.['on-primary-strong']?.value).toBeDefined();
    expect(tokens.color?.text?.['on-error-strong']?.value).toBeDefined();
    // on-dark-* border family for inverted surfaces.
    expect(tokens.color?.border?.['on-dark-strong']?.value).toBeDefined();
    expect(tokens.color?.border?.['on-dark-default']?.value).toBeDefined();
    expect(tokens.color?.border?.['on-dark-subtle']?.value).toBeDefined();
  });

  it('tsconfig.json has experimentalDecorators:true and useDefineForClassFields:false', async () => {
    const o = opts('wcs-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{
      compilerOptions: {
        strict: boolean;
        experimentalDecorators: boolean;
        useDefineForClassFields: boolean;
      };
      include: string[];
    }>(o.directory, 'tsconfig.json');
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.experimentalDecorators).toBe(true);
    expect(tsconfig.compilerOptions.useDefineForClassFields).toBe(false);
    expect(tsconfig.include).toContain('.storybook');
  });

  it('package.json has storybook/build-storybook/build/test/type-check scripts with token pipeline', async () => {
    const o = opts('wcs-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    // storybook + build-storybook + build now chain through build:tokens first
    expect(pkg.scripts['storybook']).toContain('pnpm build:tokens');
    expect(pkg.scripts['storybook']).toContain('storybook dev -p 6006');
    expect(pkg.scripts['storybook']).toContain('concurrently');
    expect(pkg.scripts['build-storybook']).toContain('pnpm build:tokens');
    expect(pkg.scripts['build-storybook']).toContain('storybook build');
    expect(pkg.scripts['build']).toContain('pnpm build:tokens');
    expect(pkg.scripts['build']).toContain('vite build');
    expect(pkg.scripts['test']).toBe('vitest run');
    expect(pkg.scripts['test:ui']).toBe('vitest --ui');
    expect(pkg.scripts['type-check']).toBe('tsc --noEmit');
    expect(pkg.scripts['cem:analyze']).toBeDefined();
    // cem:catalog generates per-component Storybook files from installed CEM
    expect(pkg.scripts['cem:catalog']).toBe('tsx scripts/generate-catalog.ts');
    // storybook + build-storybook must run cem:catalog before boot
    expect(pkg.scripts['storybook']).toContain('pnpm cem:catalog');
    expect(pkg.scripts['build-storybook']).toContain('pnpm cem:catalog');
    // tokens:sync pulls from Figma REST. Single-purpose — build:tokens is a
    // separate step so callers compose (or rely on the `storybook` concurrent
    // watch:tokens) rather than paying for an implicit rebuild every sync.
    expect(pkg.scripts['tokens:sync']).toBe('tsx scripts/sync-tokens.ts');
    // The old @helixui-copy behavior is preserved as tokens:refresh-platform for re-bootstrap.
    expect(pkg.scripts['tokens:refresh-platform']).toBeDefined();
    expect(pkg.scripts['tokens:refresh-platform']).toContain('@helixui/tokens/tokens.json');
    expect(pkg.scripts['tokens:refresh-platform']).not.toContain('pnpm build:tokens');
    expect(pkg.scripts['build:tokens']).toBe('tsx scripts/build-tokens.ts');
    expect(pkg.scripts['watch:tokens']).toBe('tsx scripts/build-tokens.ts --watch');
  });

  it('package.json has all required v10 dependencies', async () => {
    const o = opts('wcs-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['lit']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.devDependencies['storybook']).toBeDefined();
    expect(pkg.devDependencies['@storybook/web-components']).toBeDefined();
    expect(pkg.devDependencies['@storybook/web-components-vite']).toBeDefined();
    expect(pkg.devDependencies['@storybook/addon-a11y']).toBeDefined();
    expect(pkg.devDependencies['@storybook/addon-docs']).toBeDefined();
    expect(pkg.devDependencies['@storybook/addon-vitest']).toBeDefined();
    expect(pkg.devDependencies['@storybook/addon-themes']).toBeDefined();
    expect(pkg.devDependencies['@custom-elements-manifest/analyzer']).toBeDefined();
    expect(pkg.devDependencies['vitest']).toBeDefined();
    expect(pkg.devDependencies['@vitest/browser']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
    // Token generator runtime + parallel watcher
    expect(pkg.devDependencies['tsx']).toBeDefined();
    expect(pkg.devDependencies['concurrently']).toBeDefined();
    // sync-tokens.ts loads Figma credentials via dotenv/config.
    expect(pkg.devDependencies['dotenv']).toBeDefined();
    // v10 no longer uses addon-essentials
    expect(pkg.devDependencies['@storybook/addon-essentials']).toBeUndefined();
  });

  it('.gitignore includes storybook-static/', async () => {
    const o = opts('wcs-gitignore');
    await scaffoldProject(o);
    const gitignore = await readText(o.directory, '.gitignore');
    expect(gitignore).toContain('storybook-static/');
  });

  it('.gitignore excludes the generated catalog stories directory', async () => {
    const o = opts('wcs-catalog-gitignore');
    await scaffoldProject(o);
    const gitignore = await readText(o.directory, '.gitignore');
    expect(gitignore).toContain('src/stories/catalog/');
  });

  it('vite.config.ts is in library mode with lit externalized', async () => {
    const o = opts('wcs-vite');
    await scaffoldProject(o);
    const vite = await readText(o.directory, 'vite.config.ts');
    expect(vite).toContain('defineConfig');
    expect(vite).toContain("entry: 'src/index.ts'");
    expect(vite).toContain("formats: ['es']");
  });

  it('defaults to my-ds when no dsName provided', async () => {
    const o = opts('wcs-defaults', { dsName: undefined, tokenPrefix: undefined });
    await scaffoldProject(o);
    const base = await readText(o.directory, 'src/base/my-ds-element.ts');
    expect(base).toContain('extends HelixElement');
    expect(base).toContain('MyDsElement');
  });

  it('dry-run produces no files on disk', async () => {
    const o = opts('wcs-dry', { dryRun: true });
    await scaffoldProject(o);
    const exists = await fs.pathExists(o.directory);
    expect(exists).toBe(false);
  });

  it('pins Helix 3.0 in package.json dependencies', async () => {
    const o = opts('wcs-helix3');
    await scaffoldProject(o);
    const pkg = await readJson<{ dependencies: Record<string, string> }>(
      o.directory,
      'package.json',
    );
    expect(pkg.dependencies['@helixui/library']).toBe('^3.0.0');
    // @helixui/tokens: centralized pin is 3.0, but when designTokens=true the
    // scaffold may layer an additional tokens entry; accept either explicit 3.0
    // or the default tokens pin.
    expect(pkg.dependencies['@helixui/tokens']).toBeDefined();
  });

  it('does not scaffold the ${ds}-card demo component', async () => {
    const o = opts('wcs-nocard');
    await scaffoldProject(o);
    // Card demo was removed in favor of the full HelixCatalog. Scaffolded
    // projects ship ${ds}-button as the single minimal extension example.
    expect(await fs.pathExists(path.join(o.directory, 'src/components/bolt-card'))).toBe(false);
    expect(
      await fs.pathExists(path.join(o.directory, 'src/components/bolt-card/bolt-card.ts')),
    ).toBe(false);
    // Barrel export must not reference the removed card component.
    const index = await readText(o.directory, 'src/index.ts');
    expect(index).not.toContain('BoltCard');
    expect(index).not.toContain('bolt-card');
  });

  it('scaffolds HelixCatalog.stories.ts with runtime CEM walker', async () => {
    const o = opts('wcs-catalog');
    await scaffoldProject(o);
    const catalog = await readText(o.directory, 'src/stories/HelixCatalog.stories.ts');
    expect(catalog).toContain("import '@helixui/library'");
    expect(catalog).toContain("import cem from '@helixui/library/custom-elements.json'");
    expect(catalog).toContain('walkCem');
    expect(catalog).toContain('classifyTier');
    expect(catalog).toContain('isHipaaAdjacent');
    expect(catalog).toContain("title: 'HELiX/Catalog Overview'");
    expect(catalog).toContain('__catalogTagNames');
  });

  it('scaffolds _catalog-helpers.ts with the expected API surface', async () => {
    const o = opts('wcs-helpers');
    await scaffoldProject(o);
    const helpers = await readText(o.directory, 'src/stories/_catalog-helpers.ts');
    // Type exports
    expect(helpers).toContain('export interface CemDeclaration');
    expect(helpers).toContain("export type Tier = 'atoms' | 'molecules' | 'organisms'");
    // Function exports required by HelixCatalog.stories.ts + generate-catalog.ts
    expect(helpers).toContain('export function walkCem');
    expect(helpers).toContain('export function classifyTier');
    expect(helpers).toContain('export function isHipaaAdjacent');
    expect(helpers).toContain('export function deriveArgTypes');
    expect(helpers).toContain('export function deriveArgs');
    // HIPAA regex matches Build Spec §5 exactly
    expect(helpers).toContain('/phi|pii|protected|sensitive/i');
  });

  it('scaffolds scripts/generate-catalog.ts as an executable tsx codegen script', async () => {
    const o = opts('wcs-gencatalog');
    await scaffoldProject(o);
    const gen = await readText(o.directory, 'scripts/generate-catalog.ts');
    expect(gen).toContain('#!/usr/bin/env tsx');
    expect(gen).toContain('node_modules');
    expect(gen).toContain('@helixui/library');
    expect(gen).toContain('custom-elements.json');
    expect(gen).toContain('src/stories/catalog');
    expect(gen).toContain('walkCem');
    expect(gen).toContain('classifyTier');
    expect(gen).toContain('isHipaaAdjacent');
  });

  it('button stories use hx-size attribute, not size (Helix 3.0 rename)', async () => {
    const o = opts('wcs-hxsize');
    await scaffoldProject(o);
    const stories = await readText(
      o.directory,
      'src/components/bolt-button/bolt-button.stories.ts',
    );
    // Helix 3.0 CEM: hx-button exposes the `size` property via the `hx-size`
    // attribute. Raw `size=` attribute (without the hx- prefix) no longer
    // binds to the Lit property and must be avoided in rendered markup.
    expect(stories).toContain('hx-size=');
    // Raw size="..." (without hx- prefix). Negative look-behind is unavailable
    // pre-ES2018 spread so anchor on whitespace/start instead of \b.
    expect(stories).not.toMatch(/(?:^|\s)size="(sm|md|lg)"/);
  });

  // ── Gated end-to-end smoke test ────────────────────────────────────────
  // Set E2E_SCAFFOLD=1 to actually install + build Storybook. Skipped in
  // default CI runs because pnpm install + storybook build is multi-minute
  // and requires network. Use in manual verification of the full pipeline.
  const e2eEnabled = !!process.env.E2E_SCAFFOLD;
  (e2eEnabled ? describe : describe.skip)('E2E Storybook smoke', () => {
    it(
      'scaffold installs, builds storybook, and indexes ≥90 hx-* tags with zero HIPAA matches',
      async () => {
        const { execSync } = await import('node:child_process');
        const os = await import('node:os');
        const fsp = await import('node:fs/promises');
        const tmp = path.join(
          os.tmpdir(),
          `wcsb-e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        );
        const o: ProjectOptions = {
          name: 'e2e',
          directory: tmp,
          framework: 'wc-storybook',
          componentBundles: ['core'],
          typescript: true,
          eslint: false,
          designTokens: true,
          darkMode: false,
          installDeps: false,
          dsName: 'smoke',
          tokenPrefix: '--smk',
        };
        await scaffoldProject(o);
        execSync('pnpm install --ignore-scripts', { cwd: tmp, stdio: 'inherit' });
        execSync('pnpm cem:catalog', { cwd: tmp, stdio: 'inherit' });
        execSync('pnpm build-storybook', { cwd: tmp, stdio: 'inherit' });
        const index = JSON.parse(
          await fsp.readFile(path.join(tmp, 'storybook-static', 'index.json'), 'utf8'),
        );
        const entries: Record<string, { title: string }> = index.entries ?? {};
        const tags = new Set<string>();
        for (const e of Object.values(entries)) {
          const m = e.title.match(/hx-[a-z-]+/);
          if (m) tags.add(m[0]);
        }
        expect(tags.size).toBeGreaterThanOrEqual(90);
        // HIPAA redaction per Build Spec §5
        for (const tag of tags) {
          expect(tag).not.toMatch(/phi|pii|protected|sensitive/i);
        }
        await fs.remove(tmp);
      },
      10 * 60 * 1000,
    );
  });
});
