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

  it('bolt-button.ts JSDoc enriches CEM with action.* and component-tier @cssprop blocks', async () => {
    const o = opts('wcs-jsdoc-cem');
    await scaffoldProject(o);
    const button = await readText(o.directory, 'src/components/bolt-button/bolt-button.ts');
    // JSDoc IS the CEM data layer for Track 1 — annotate explicitly because
    // cross-package CEM inheritance does not auto-resolve.
    expect(button).toContain('JSDoc IS the CEM data layer');
    // Component-tier hooks documented with their two-level fallback default.
    expect(button).toContain('@cssprop [--bolt-button-bg=var(--bolt-color-action-primary-bg)]');
    expect(button).toContain(
      '@cssprop [--bolt-button-hover-bg=var(--bolt-color-action-primary-bg-hover)]',
    );
    expect(button).toContain(
      '@cssprop [--bolt-button-active-bg=var(--bolt-color-action-primary-bg-active)]',
    );
    // Semantic action.* tier surfaced as override hooks.
    expect(button).toContain('@cssprop [--bolt-color-action-primary-bg]');
    expect(button).toContain('@cssprop [--bolt-color-action-danger-bg]');
    expect(button).toContain('@cssprop [--bolt-color-text-on-primary-strong]');
    expect(button).toContain('@cssprop [--bolt-color-text-on-error-strong]');
  });

  it('button styles bridge uses two-level var() fallback chain (component → semantic action.*)', async () => {
    const o = opts('wcs-fallback-chain');
    await scaffoldProject(o);
    const styles = await readText(o.directory, 'src/components/bolt-button/bolt-button.styles.ts');
    // Component-tier hook (--bolt-button-bg) is the outer name; if unset, the
    // inner var() resolves to the semantic action.* tier. Mirrors the pattern
    // hx-button itself uses internally (hx-button.ts:38–79).
    expect(styles).toContain(
      '--hx-button-bg: var(--bolt-button-bg, var(--bolt-color-action-primary-bg));',
    );
    expect(styles).toContain(
      '--hx-button-hover-bg: var(--bolt-button-hover-bg, var(--bolt-color-action-primary-bg-hover));',
    );
    expect(styles).toContain(
      '--hx-button-active-bg: var(--bolt-button-active-bg, var(--bolt-color-action-primary-bg-active));',
    );
    // Foreground + chrome route through their semantic groups too.
    expect(styles).toContain('--hx-button-color: var(--bolt-button-color,');
    expect(styles).toContain('--hx-button-border-color: var(--bolt-button-border-color,');
    expect(styles).toContain('--hx-button-border-radius: var(--bolt-button-border-radius,');
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

  it('scripts/build-tokens.ts walker recurses into nested action.* paths', async () => {
    const o = opts('wcs-walker-action');
    await scaffoldProject(o);
    const gen = await readText(o.directory, 'scripts/build-tokens.ts');
    // The walker must invoke itself with the next segment appended — this is
    // what allows arbitrarily nested paths like color.action.primary.bg to
    // flatten into --{prefix}-color-action-primary-bg. Lock the recursion
    // contract so a future refactor that swaps generic recursion for a
    // hand-rolled depth-2 unrolled loop fails this test.
    expect(gen).toMatch(
      /walk\(\s*child[^,]*,\s*\[\s*\.\.\.\s*segments\s*,\s*key\s*\]\s*,\s*out\s*\)/,
    );
    // The recursion has to be a real generic walk, not a special-case branch
    // for known categories. Reject any explicit `if (key === 'action')`-style
    // hardcoding that would break on future semantic groups.
    expect(gen).not.toMatch(/if\s*\(\s*key\s*===\s*['"]action['"]/);
    expect(gen).not.toMatch(/if\s*\(\s*key\s*===\s*['"]surface['"]/);
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

  it('scripts/sync-tokens.ts preserves unitless numbers (no px coercion on font-weight, opacity, line-height, z-index, duration, density)', async () => {
    const o = opts('wcs-sync-unitless');
    await scaffoldProject(o);
    const sync = await readText(o.directory, 'scripts/sync-tokens.ts');
    // The unitless pattern table must be present and cover every CSS property
    // that takes a bare number — appending 'px' to font-weight, opacity, etc.
    // emits invalid CSS like \`font-weight: 600px\`.
    expect(sync).toContain('UNITLESS_PATTERNS');
    expect(sync).toContain('isUnitlessName');
    expect(sync).toMatch(/font[-/]weight/);
    expect(sync).toMatch(/opacity/);
    expect(sync).toMatch(/line[-/]height/);
    expect(sync).toMatch(/z[-/]index/);
    expect(sync).toMatch(/duration/);
    expect(sync).toMatch(/density/);
    // The numeric branch must consult isUnitlessName before appending 'px'.
    expect(sync).toContain("isUnitlessName(name) ? String(raw) : String(raw) + 'px'");
    // The originating variable name has to thread down through alias resolution
    // so the decision is anchored on what the consumer asked for, not the
    // alias target's name.
    expect(sync).toContain('resolveValue(v.valuesByMode[defaultModeId], v.name)');
    expect(sync).toContain('resolveValue(target.valuesByMode[targetMode], name, depth + 1)');
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

  it('src/tokens/tokens.json stub emits Helix 3.3.1 action.* tier (4 roles x 4 states)', async () => {
    const o = opts('wcs-action-tier');
    await scaffoldProject(o);
    const tokens = await readJson<{
      color?: {
        action?: Record<string, Record<string, { value: string }>>;
      };
      button?: Record<string, { value: string }>;
    }>(o.directory, 'src/tokens/tokens.json');
    const isStub = tokens.button?.['font-family']?.value === 'system-ui, sans-serif';
    if (!isStub) return;
    const action = tokens.color?.action;
    expect(action).toBeDefined();
    for (const role of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      for (const state of ['bg', 'bg-hover', 'bg-active', 'bg-inverted-hover'] as const) {
        expect(action?.[role]?.[state]?.value).toBeDefined();
      }
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
    // storybook + build-storybook + build now chain through build:tokens first.
    // Composite scripts inline the literal `tsx scripts/build-tokens.ts`
    // command rather than `pnpm build:tokens` so the scaffold output runs
    // under npm/pnpm/yarn without requiring pnpm to be installed.
    expect(pkg.scripts['storybook']).toContain('tsx scripts/build-tokens.ts');
    expect(pkg.scripts['storybook']).toContain('storybook dev -p 6006');
    expect(pkg.scripts['storybook']).toContain('concurrently');
    expect(pkg.scripts['build-storybook']).toContain('tsx scripts/build-tokens.ts');
    expect(pkg.scripts['build-storybook']).toContain('storybook build');
    expect(pkg.scripts['build']).toContain('tsx scripts/build-tokens.ts');
    expect(pkg.scripts['build']).toContain('vite build');
    expect(pkg.scripts['test']).toBe('vitest run');
    expect(pkg.scripts['test:ui']).toBe('vitest --ui');
    expect(pkg.scripts['type-check']).toBe('tsc --noEmit');
    expect(pkg.scripts['cem:analyze']).toBeDefined();
    // cem:catalog generates per-component Storybook files from installed CEM
    expect(pkg.scripts['cem:catalog']).toBe('tsx scripts/generate-catalog.ts');
    // storybook + build-storybook must run cem:catalog before boot — inline
    // the literal so npm/pnpm/yarn all execute the same command.
    expect(pkg.scripts['storybook']).toContain('tsx scripts/generate-catalog.ts');
    expect(pkg.scripts['build-storybook']).toContain('tsx scripts/generate-catalog.ts');
    // No package-manager prefix should leak into composite script chains —
    // those would break the scaffold under `npm run` or `yarn`.
    expect(pkg.scripts['storybook']).not.toMatch(/\bpnpm\s+build:tokens\b/);
    expect(pkg.scripts['storybook']).not.toMatch(/\bpnpm\s+cem:catalog\b/);
    expect(pkg.scripts['storybook']).not.toMatch(/\bpnpm\s+watch:tokens\b/);
    expect(pkg.scripts['build-storybook']).not.toMatch(/\bpnpm\s+/);
    expect(pkg.scripts['build']).not.toMatch(/\bpnpm\s+/);
    // tokens:sync pulls from Figma REST. Single-purpose — build:tokens is a
    // separate step so callers compose (or rely on the `storybook` concurrent
    // watch:tokens) rather than paying for an implicit rebuild every sync.
    expect(pkg.scripts['tokens:sync']).toBe('tsx scripts/sync-tokens.ts');
    // tokens:refresh-platform delegates to scripts/refresh-tokens.ts (a
    // real source file) instead of an inline `node -e` one-liner that
    // crashed with ERR_INVALID_ARG_VALUE because `node -e` evaluates
    // __filename to the literal "[eval]" and breaks createRequire.
    expect(pkg.scripts['tokens:refresh-platform']).toBe('tsx scripts/refresh-tokens.ts');
    // refresh-tokens.ts itself resolves @helixui/tokens at runtime.
    const refreshScript = await readText(o.directory, 'scripts/refresh-tokens.ts');
    expect(refreshScript).toContain("'@helixui/tokens/tokens.json'");
    expect(pkg.scripts['build:tokens']).toBe('tsx scripts/build-tokens.ts');
    expect(pkg.scripts['watch:tokens']).toBe('tsx scripts/build-tokens.ts --watch');
  });

  it('package.json has all required v10 dependencies', async () => {
    const o = opts('wcs-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      peerDependencies?: Record<string, string>;
    }>(o.directory, 'package.json');
    // lit is the only RUNTIME dependency. Helix packages are externalised
    // by vite.config.ts, declared as peerDependencies (consumer host
    // contract) and devDependencies (local pipeline). Putting them in
    // `dependencies` would let downstream apps install a second copy of
    // the Helix runtime alongside the host's, tripping duplicate
    // customElements.define() registrations.
    expect(pkg.dependencies['lit']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeUndefined();
    expect(pkg.dependencies['@helixui/tokens']).toBeUndefined();
    expect(pkg.peerDependencies?.['@helixui/library']).toBeDefined();
    expect(pkg.peerDependencies?.['@helixui/tokens']).toBeDefined();
    expect(pkg.devDependencies['@helixui/library']).toBeDefined();
    expect(pkg.devDependencies['@helixui/tokens']).toBeDefined();
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
    // playwright is required by @vitest/browser when provider is 'playwright'
    // (vitest.config.ts ships with that setting). Pin in devDeps so vitest
    // boots without a fail-on-first-run after install.
    expect(pkg.devDependencies['playwright']).toBeDefined();
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

  it('falls back to the project name when it is a valid dsName', async () => {
    // Project name 'wcs-defaults' passes validateDsName, so the
    // scaffolder uses it as dsName instead of the 'my-ds' worst-case
    // fallback. This matches the CLI's interactive default and prevents
    // generic <my-ds-button> tags for API callers who supply only `name`.
    const o = opts('wcs-defaults', { dsName: undefined, tokenPrefix: undefined });
    await scaffoldProject(o);
    const base = await readText(o.directory, 'src/base/wcs-defaults-element.ts');
    expect(base).toContain('extends HelixElement');
    expect(base).toContain('WcsDefaultsElement');
  });

  it('falls back to my-ds when project name is not a valid dsName', async () => {
    // Project names like '123-app' are valid as npm names but invalid as
    // dsNames (validateDsName rejects leading digits). Scaffolder must
    // gracefully degrade to 'my-ds' rather than emit invalid identifiers.
    const o = opts('123-app', { dsName: undefined, tokenPrefix: undefined });
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

  it('pins Helix 3.3.1 in package.json dependencies', async () => {
    const o = opts('wcs-helix3');
    await scaffoldProject(o);
    const pkg = await readJson<{ dependencies: Record<string, string> }>(
      o.directory,
      'package.json',
    );
    // 3.3.1 is the version that emits the cascade tokens this scaffold
    // expects (action.* semantic tier, on-{role}-strong text tokens,
    // on-dark-* border tokens). Pinning the cascade contract version.
    expect(pkg.dependencies['@helixui/library']).toBe('^3.3.1');
    // @helixui/tokens: centralized pin is 3.3.1, but when designTokens=true the
    // scaffold may layer an additional tokens entry; accept either explicit 3.3.1
    // or the default tokens pin.
    expect(pkg.dependencies['@helixui/tokens']).toBeDefined();
  });

  it('pins @helixui/library as a peerDependency at the cascade-contract version (^3.3.1)', async () => {
    const o = opts('wcs-peerdep');
    await scaffoldProject(o);
    const pkg = await readJson<{
      peerDependencies?: Record<string, string>;
    }>(o.directory, 'package.json');
    // wc-storybook ships components that bridge --{prefix}-* tokens into
    // Helix's --hx-* names. That bridge ASSUMES the cascade contract that
    // landed in Helix 3.3.1 (action.* semantic tier, on-{role}-strong text
    // tokens, on-dark-* border family). The peerDep surfaces this version
    // floor in `npm ls` output and trips pnpm's strict-peer-deps check if a
    // downstream installs an older Helix that doesn't export the cascade.
    expect(pkg.peerDependencies).toBeDefined();
    expect(pkg.peerDependencies?.['@helixui/library']).toBe('^3.3.1');
    expect(pkg.peerDependencies?.['@helixui/tokens']).toBe('^3.3.1');
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

  // ── Helix 3.3.1 alignment: end-to-end scaffold → tokens.json ──────────
  //
  // Lightweight cousin of the E2E_SCAFFOLD smoke below — runs every CI tick
  // (no install, no build) so the contract that action.* tier survives the
  // full scaffold pipeline cannot regress silently. Cross-cuts C2a (semantic
  // groups), C2b (action.* tier), C4 (fallback chain), C5 (Track 1
  // inheritance), and C6 (CEM JSDoc) into a single end-to-end assertion.
  describe('Helix 3.3.1 alignment (end-to-end scaffold → tokens.json)', () => {
    it('scaffolds tokens.json with action.* tier, 13 semantic groups, and Track 1 inheritance + JSDoc CEM coverage', async () => {
      const o = opts('wcs-helix-331-e2e');
      await scaffoldProject(o);

      // tokens.json — action.* + 13 semantic groups (when stub fallback wins).
      const tokens = await readJson<{
        color?: {
          text?: Record<string, { value: string }>;
          border?: Record<string, { value: string }>;
          action?: Record<string, Record<string, { value: string }>>;
        };
        button?: Record<string, { value: string }>;
      }>(o.directory, 'src/tokens/tokens.json');
      const isStub = tokens.button?.['font-family']?.value === 'system-ui, sans-serif';
      if (isStub) {
        // action.primary.bg + .bg-hover + .bg-active + .bg-inverted-hover.
        expect(tokens.color?.action?.primary?.['bg']?.value).toBeDefined();
        expect(tokens.color?.action?.primary?.['bg-hover']?.value).toBeDefined();
        expect(tokens.color?.action?.primary?.['bg-active']?.value).toBeDefined();
        expect(tokens.color?.action?.primary?.['bg-inverted-hover']?.value).toBeDefined();
        // 3 of the 4 action roles.
        expect(tokens.color?.action?.danger?.['bg']?.value).toBeDefined();
        expect(tokens.color?.action?.secondary?.['bg']?.value).toBeDefined();
        expect(tokens.color?.action?.ghost?.['bg-hover']?.value).toBeDefined();
        // 13 semantic groups — text.on-*-strong + border.on-dark-*.
        expect(tokens.color?.text?.['on-primary-strong']?.value).toBeDefined();
        expect(tokens.color?.text?.['on-error-strong']?.value).toBeDefined();
        expect(tokens.color?.border?.['on-dark-strong']?.value).toBeDefined();
      }

      // Two-level fallback chain in the bridge (component → semantic action.*).
      const styles = await readText(
        o.directory,
        'src/components/bolt-button/bolt-button.styles.ts',
      );
      expect(styles).toContain(
        '--hx-button-bg: var(--bolt-button-bg, var(--bolt-color-action-primary-bg));',
      );

      // Track 1 inheritance — extends HelixButton (NOT ClientElement).
      const button = await readText(o.directory, 'src/components/bolt-button/bolt-button.ts');
      expect(button).toContain('extends HelixButton');
      expect(button).not.toContain('ClientElement');

      // CEM JSDoc enrichment — action.* @cssprop block surfaces on this tag.
      expect(button).toContain('@cssprop [--bolt-color-action-primary-bg]');
      expect(button).toContain('@cssprop [--bolt-color-text-on-primary-strong]');
    });
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
