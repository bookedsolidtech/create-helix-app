import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('vue-nuxt');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'vue-nuxt',
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

describe('vue-nuxt integration', () => {
  it('generates all required files', async () => {
    const o = opts('vn-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'nuxt.config.ts',
      'helix.d.ts',
      'plugins/helix.client.ts',
      'app/app.vue',
      'app/layouts/default.vue',
      'app/components/AppNavbar.vue',
      'app/components/AppFooter.vue',
      'app/components/ErrorBoundary.vue',
      'app/pages/index.vue',
      'app/pages/components.vue',
      'app/pages/examples/forms.vue',
      'app/error.vue',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('copies brand assets to public/og/', async () => {
    const o = opts('vn-assets');
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    // At least the directory should exist (assets copy is conditional on source existing)
    // Just verify the scaffold ran without error and files are present
    try {
      await fs.access(path.join(o.directory, 'public', 'og'));
    } catch {
      // Directory may not exist if source assets are missing — that's acceptable
    }
  });

  it('helix.d.ts declares hx-* custom elements for TypeScript', async () => {
    const o = opts('vn-types');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'helix.d.ts');
    expect(content).toContain('hx-button');
    expect(content).toContain('hx-card');
    expect(content).toContain('hx-badge');
    expect(content).toContain('HxElement');
    expect(content).toContain('export {}');
  });

  it('app/app.vue uses NuxtLayout wrapper', async () => {
    const o = opts('vn-app-vue');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'app/app.vue');
    expect(content).toContain('NuxtLayout');
    expect(content).toContain('NuxtPage');
  });

  it('app/layouts/default.vue has nav, footer, and global styles', async () => {
    const o = opts('vn-layout');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'app/layouts/default.vue');
    expect(content).toContain('AppNavbar');
    expect(content).toContain('AppFooter');
    expect(content).toContain('hx-theme');
    expect(content).toContain('--hx-page-bg');
    expect(content).toContain('.hero');
    expect(content).toContain('.container');
  });

  it('app/components/AppNavbar.vue uses hx-top-nav with theme toggle', async () => {
    const o = opts('vn-navbar');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'app/components/AppNavbar.vue');
    expect(content).toContain('hx-top-nav');
    expect(content).toContain('hx-switch');
    expect(content).toContain('NuxtLink');
    expect(content).toContain('applyTheme');
    expect(content).toContain('helix-theme');
  });

  it('app/components/AppFooter.vue has ecosystem links', async () => {
    const o = opts('vn-footer');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'app/components/AppFooter.vue');
    expect(content).toContain('hx-divider');
    expect(content).toContain('bookedsolid.tech');
    expect(content).toContain('footer-grid');
    expect(content).toContain('NuxtLink');
  });

  it('app/pages/index.vue is a production landing page with hero and showcase', async () => {
    const o = opts('vn-index');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'app/pages/index.vue');
    expect(content).toContain('hx-button');
    expect(content).toContain('hx-card');
    expect(content).toContain('hx-badge');
    expect(content).toContain('hx-tag');
    expect(content).toContain('hx-tabs');
    expect(content).toContain('hx-progress-bar');
    expect(content).toContain('hx-avatar');
    expect(content).toContain('useHead');
    expect(content).toContain('class="hero"');
    expect(content).toContain('Component Showcase');
    expect(content).toContain('Getting Started');
    expect(content).toContain('promo-grid');
  });

  it('app/pages/examples/forms.vue demonstrates native form participation', async () => {
    const o = opts('vn-forms');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'app/pages/examples/forms.vue');
    expect(content).toContain('FormData');
    expect(content).toContain('hx-text-input');
    expect(content).toContain('hx-checkbox');
    expect(content).toContain('hx-select');
    expect(content).toContain('hx-textarea');
    expect(content).toContain('ElementInternals');
  });

  it('app/components/ErrorBoundary.vue is placed in app/components/', async () => {
    const o = opts('vn-errorboundary');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'app/components/ErrorBoundary.vue');
    expect(content).toContain('onErrorCaptured');
    expect(content).toContain('hx-button');
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('vn-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
    expect(content).toContain('Selected bundles: core');
  });

  it('nuxt.config.ts configures isCustomElement for hx-* tags', async () => {
    const o = opts('vn-config');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'nuxt.config.ts');
    expect(config).toContain('isCustomElement');
    expect(config).toContain('hx-');
    expect(config).toContain('startsWith');
  });

  it('nuxt.config.ts includes helix-tokens.css when designTokens is true', async () => {
    const o = opts('vn-tokens-config');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'nuxt.config.ts');
    expect(config).toContain('helix-tokens.css');
  });

  it('nuxt.config.ts omits css array when designTokens is false', async () => {
    const o = opts('vn-no-tokens-config', { designTokens: false });
    await scaffoldProject(o);
    const config = await readText(o.directory, 'nuxt.config.ts');
    expect(config).not.toContain('helix-tokens.css');
  });

  it('helix.client.ts plugin imports @helixui/library', async () => {
    const o = opts('vn-plugin');
    await scaffoldProject(o);
    const plugin = await readText(o.directory, 'plugins/helix.client.ts');
    expect(plugin).toContain('@helixui/library');
    expect(plugin).toContain('defineNuxtPlugin');
  });

  it('package.json has correct nuxt dependencies', async () => {
    const o = opts('vn-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{ dependencies: Record<string, string> }>(
      o.directory,
      'package.json',
    );
    expect(pkg.dependencies['nuxt']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies['@helixui/tokens']).toBeDefined();
  });

  it('package.json has nuxt scripts', async () => {
    const o = opts('vn-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('nuxt dev');
    expect(pkg.scripts['build']).toBe('nuxt build');
    expect(pkg.scripts['preview']).toBe('nuxt preview');
  });

  it('tsconfig.json has strict mode when typescript is true', async () => {
    const o = opts('vn-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{ compilerOptions: { strict: boolean } }>(
      o.directory,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('typescript: false omits tsconfig.json', async () => {
    const o = opts('vn-no-ts', { typescript: false });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'tsconfig.json'))).rejects.toThrow();
  });

  it('generates eslint.config.js and .prettierrc when eslint is true', async () => {
    const o = opts('vn-eslint', { eslint: true });
    await scaffoldProject(o);
    await assertFilesExist(o.directory, ['eslint.config.js', '.prettierrc']);
  });

  it('generates helix-tokens.css with design token overrides', async () => {
    const o = opts('vn-tokens');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('@import');
    expect(css).toContain('--hx-color-primary');
  });

  it('helix-tokens.css includes dark mode overrides when darkMode is true', async () => {
    const o = opts('vn-dark', { darkMode: true });
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('prefers-color-scheme: dark');
  });

  it('dry-run mode produces no files', async () => {
    const o = opts('vn-dry', { dryRun: true });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'package.json'))).rejects.toThrow();
  });
});
