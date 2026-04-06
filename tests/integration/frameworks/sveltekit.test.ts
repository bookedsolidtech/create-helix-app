import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('sveltekit');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'svelte-kit',
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

describe('svelte-kit integration', () => {
  it('generates all required files', async () => {
    const o = opts('sk-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'svelte.config.js',
      'vite.config.ts',
      'src/routes/+page.svelte',
      'src/routes/+layout.svelte',
      'src/app.html',
      'src/app.css',
      'src/lib/helix-setup.ts',
      'src/helix.d.ts',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('src/lib/helix-setup.ts exports initHelix function', async () => {
    const o = opts('sk-libsetup');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/lib/helix-setup.ts');
    expect(content).toContain("import('@helixui/library')");
    expect(content).toContain('export async function initHelix');
    expect(content).toContain('typeof window');
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('sk-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
  });

  it('src/helix.d.ts declares svelteHTML IntrinsicElements for hx-* components', async () => {
    const o = opts('sk-dts');
    await scaffoldProject(o);
    const dts = await readText(o.directory, 'src/helix.d.ts');
    expect(dts).toContain('svelteHTML');
    expect(dts).toContain('IntrinsicElements');
    expect(dts).toContain("'hx-button'");
    expect(dts).toContain("'hx-card'");
    expect(dts).toContain("'hx-text-input'");
    expect(dts).toContain("'hx-badge'");
    expect(dts).toContain("'hx-alert'");
  });

  it('+layout.svelte imports helix-setup and loads HELiX in onMount', async () => {
    const o = opts('sk-layout');
    await scaffoldProject(o);
    const layout = await readText(o.directory, 'src/routes/+layout.svelte');
    expect(layout).toContain('onMount');
    expect(layout).toContain('initHelix');
    expect(layout).toContain('$lib/helix-setup');
    expect(layout).toContain('navbar');
    expect(layout).toContain('footer');
  });

  it('+layout.svelte imports helix-tokens.css when designTokens is true', async () => {
    const o = opts('sk-layout-tokens');
    await scaffoldProject(o);
    const layout = await readText(o.directory, 'src/routes/+layout.svelte');
    expect(layout).toContain('helix-tokens.css');
  });

  it('+layout.svelte does NOT import helix-tokens.css when designTokens is false', async () => {
    const o = opts('sk-layout-no-tokens', { designTokens: false });
    await scaffoldProject(o);
    const layout = await readText(o.directory, 'src/routes/+layout.svelte');
    expect(layout).not.toContain('helix-tokens.css');
  });

  it('+page.svelte is a production landing page with hero and component showcase', async () => {
    const o = opts('sk-page');
    await scaffoldProject(o);
    const page = await readText(o.directory, 'src/routes/+page.svelte');
    // Hero section
    expect(page).toContain('hero');
    expect(page).toContain('HELiX');
    expect(page).toContain('SvelteKit');
    // HELiX components
    expect(page).toContain('hx-button');
    expect(page).toContain('hx-card');
    expect(page).toContain('hx-badge');
    expect(page).toContain('hx-text-input');
    expect(page).toContain('hx-alert');
    expect(page).toContain('hx-divider');
    // Svelte 5 runes
    expect(page).toContain('$state');
    // Event handling
    expect(page).toContain('on:hx-click');
    expect(page).toContain('on:hx-input');
    // Sections
    expect(page).toContain('id="components"');
    expect(page).toContain('id="ecosystem"');
  });

  it('+page.svelte includes interactive demo with submit handler', async () => {
    const o = opts('sk-page-demo');
    await scaffoldProject(o);
    const page = await readText(o.directory, 'src/routes/+page.svelte');
    expect(page).toContain('handleGreet');
    expect(page).toContain('handleInput');
    expect(page).toContain('{#if greeted}');
    expect(page).toContain('hx-alert');
  });

  it('+page.svelte uses Svelte 5 $state rune (not let x = 0)', async () => {
    const o = opts('sk-svelte5');
    await scaffoldProject(o);
    const page = await readText(o.directory, 'src/routes/+page.svelte');
    expect(page).toContain('$state(');
    // Should NOT use writable stores
    expect(page).not.toContain("from 'svelte/store'");
  });

  it('svelte.config.js uses @sveltejs/adapter-auto and vitePreprocess', async () => {
    const o = opts('sk-adapter');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'svelte.config.js');
    expect(config).toContain('@sveltejs/adapter-auto');
    expect(config).toContain('vitePreprocess');
  });

  it('vite.config.ts uses sveltekit plugin', async () => {
    const o = opts('sk-vite');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'vite.config.ts');
    expect(config).toContain('@sveltejs/kit/vite');
    expect(config).toContain('sveltekit()');
  });

  it('app.html includes sveltekit placeholders', async () => {
    const o = opts('sk-apphtml');
    await scaffoldProject(o);
    const html = await readText(o.directory, 'src/app.html');
    expect(html).toContain('%sveltekit.head%');
    expect(html).toContain('%sveltekit.body%');
  });

  it('src/app.css imports HELiX tokens and provides global styles', async () => {
    const o = opts('sk-appcss');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'src/app.css');
    expect(css).toContain("@import '@helixui/tokens/tokens.css'");
    expect(css).toContain('--hx-font-family');
    expect(css).toContain('.navbar');
    expect(css).toContain('.container');
    expect(css).toContain('.footer');
  });

  it('package.json has correct sveltekit dependencies', async () => {
    const o = opts('sk-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['@sveltejs/kit']).toBeDefined();
    expect(pkg.dependencies['svelte']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
  });

  it('package.json has sveltekit scripts', async () => {
    const o = opts('sk-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('vite dev');
    expect(pkg.scripts['build']).toBe('vite build');
    expect(pkg.scripts['preview']).toBe('vite preview');
  });

  it('tsconfig.json has strict mode', async () => {
    const o = opts('sk-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{ compilerOptions: { strict: boolean } }>(
      o.directory,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('typescript: false omits tsconfig.json', async () => {
    const o = opts('sk-no-ts', { typescript: false });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'tsconfig.json'))).rejects.toThrow();
  });

  it('generates eslint.config.js and .prettierrc when eslint is true', async () => {
    const o = opts('sk-eslint', { eslint: true });
    await scaffoldProject(o);
    await assertFilesExist(o.directory, ['eslint.config.js', '.prettierrc']);
  });

  it('generates helix-tokens.css with design token overrides', async () => {
    const o = opts('sk-tokens');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('@import');
    expect(css).toContain('--hx-color-primary');
  });

  it('helix-tokens.css includes dark mode overrides when darkMode is true', async () => {
    const o = opts('sk-dark', { darkMode: true });
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('prefers-color-scheme: dark');
  });

  it('dry-run mode produces no files', async () => {
    const o = opts('sk-dry', { dryRun: true });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'package.json'))).rejects.toThrow();
  });
});
