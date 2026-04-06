import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('astro');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'astro',
    componentBundles: ['core'],
    typescript: true,
    eslint: false,
    designTokens: true,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('astro integration', () => {
  it('generates all required files', async () => {
    const o = opts('astro-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'astro.config.mjs',
      'src/layouts/Layout.astro',
      'src/pages/index.astro',
      'src/pages/components.astro',
      'src/pages/docs.astro',
      'src/styles/global.css',
      'src/helix.d.ts',
      'src/helix-setup.ts',
      'helix-tokens.css',
      '.gitignore',
      'README.md',
    ]);
  });

  it('Layout.astro loads @helixui/library via script', async () => {
    const o = opts('astro-layout');
    await scaffoldProject(o);
    const layout = await readText(o.directory, 'src/layouts/Layout.astro');
    expect(layout).toContain("import '@helixui/library'");
    expect(layout).toContain('<script>');
    expect(layout).toContain('hx-theme');
    expect(layout).toContain('hx-top-nav');
    expect(layout).toContain('<slot />');
  });

  it('index.astro uses Layout and contains production hx-* components', async () => {
    const o = opts('astro-index');
    await scaffoldProject(o);
    const page = await readText(o.directory, 'src/pages/index.astro');
    expect(page).toContain("from '../layouts/Layout.astro'");
    expect(page).toContain('hx-button');
    expect(page).toContain('hx-card');
    expect(page).toContain('hx-badge');
    expect(page).toContain('hx-tag');
    expect(page).toContain('hx-avatar');
    expect(page).toContain('hx-progress-bar');
  });

  it('index.astro messaging highlights zero-JS and Astro+HELiX fit', async () => {
    const o = opts('astro-messaging');
    await scaffoldProject(o);
    const page = await readText(o.directory, 'src/pages/index.astro');
    expect(page).toContain('Zero JS');
    expect(page).toContain('HELiX + Astro');
    expect(page).toContain('Why Astro + HELiX');
  });

  it('helix.d.ts declares hx-* elements for Astro JSX', async () => {
    const o = opts('astro-dts');
    await scaffoldProject(o);
    const dts = await readText(o.directory, 'src/helix.d.ts');
    expect(dts).toContain('astroHTML.JSX');
    expect(dts).toContain("'hx-button'");
    expect(dts).toContain("'hx-card'");
    expect(dts).toContain("'hx-badge'");
    expect(dts).toContain("'hx-theme'");
  });

  it('global.css imports helix-tokens.css when designTokens is true', async () => {
    const o = opts('astro-global-css');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'src/styles/global.css');
    expect(css).toContain("@import '../../helix-tokens.css'");
    expect(css).toContain('--hx-page-bg');
    expect(css).toContain('.container');
    expect(css).toContain('.hero');
  });

  it('global.css does not import helix-tokens.css when designTokens is false', async () => {
    const o = opts('astro-no-tokens-css', { designTokens: false });
    await scaffoldProject(o);
    const css = await readText(o.directory, 'src/styles/global.css');
    expect(css).not.toContain("@import '../../helix-tokens.css'");
  });

  it('copies brand assets to public/og/', async () => {
    const o = opts('astro-assets');
    await scaffoldProject(o);
    // The Layout references these assets
    const layout = await readText(o.directory, 'src/layouts/Layout.astro');
    expect(layout).toContain('/og/bs-hx-square.png');
    expect(layout).toContain('/og/bs-bs-software-square.png');
    // index.astro references ecosystem promo images
    const page = await readText(o.directory, 'src/pages/index.astro');
    expect(page).toContain('/og/helixui.png');
    expect(page).toContain('/og/helixir.png');
    expect(page).toContain('/og/discord-ops.png');
  });

  it('components.astro page exists and uses hx-* components', async () => {
    const o = opts('astro-components-page');
    await scaffoldProject(o);
    const page = await readText(o.directory, 'src/pages/components.astro');
    expect(page).toContain("from '../layouts/Layout.astro'");
    expect(page).toContain('hx-card');
    expect(page).toContain('hx-badge');
    expect(page).toContain('hx-button');
  });

  it('docs.astro page exists and uses Layout', async () => {
    const o = opts('astro-docs-page');
    await scaffoldProject(o);
    const page = await readText(o.directory, 'src/pages/docs.astro');
    expect(page).toContain("from '../layouts/Layout.astro'");
    expect(page).toContain('hx-card');
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('astro-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
    expect(content).toContain('Selected bundles: core');
  });

  it('package.json has correct astro dependencies', async () => {
    const o = opts('astro-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{ dependencies: Record<string, string> }>(
      o.directory,
      'package.json',
    );
    expect(pkg.dependencies['astro']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies['@helixui/tokens']).toBeDefined();
  });

  it('package.json has astro scripts', async () => {
    const o = opts('astro-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('astro dev');
    expect(pkg.scripts['build']).toBe('astro build');
    expect(pkg.scripts['preview']).toBe('astro preview');
  });

  it('tsconfig.json has strict mode', async () => {
    const o = opts('astro-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{ compilerOptions: { strict: boolean } }>(
      o.directory,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('typescript: false omits tsconfig.json', async () => {
    const o = opts('astro-no-ts', { typescript: false });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'tsconfig.json'))).rejects.toThrow();
  });

  it('generates eslint.config.js and .prettierrc when eslint is true', async () => {
    const o = opts('astro-eslint', { eslint: true });
    await scaffoldProject(o);
    await assertFilesExist(o.directory, ['eslint.config.js', '.prettierrc']);
  });

  it('generates helix-tokens.css with design token overrides', async () => {
    const o = opts('astro-tokens');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('@import');
    expect(css).toContain('--hx-color-primary');
  });

  it('helix-tokens.css includes dark mode overrides when darkMode is true', async () => {
    const o = opts('astro-dark', { darkMode: true });
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('prefers-color-scheme: dark');
  });

  it('astro.config.mjs uses defineConfig', async () => {
    const o = opts('astro-config');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'astro.config.mjs');
    expect(config).toContain("from 'astro/config'");
    expect(config).toContain('defineConfig');
  });

  it('dry-run mode produces no files', async () => {
    const o = opts('astro-dry', { dryRun: true });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'package.json'))).rejects.toThrow();
  });
});
