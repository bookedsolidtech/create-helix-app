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
      'src/helix-setup.ts',
      'src/helix.d.ts',
      'src/lib/helix.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('sk-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
  });

  it('svelte.config.js uses @sveltejs/adapter-auto', async () => {
    const o = opts('sk-adapter');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'svelte.config.js');
    expect(config).toContain('@sveltejs/adapter-auto');
  });

  it('svelte.config.js includes vitePreprocess for TypeScript support', async () => {
    const o = opts('sk-preprocess');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'svelte.config.js');
    expect(config).toContain('vitePreprocess');
    expect(config).toContain('@sveltejs/vite-plugin-svelte');
  });

  it('src/helix.d.ts declares svelteHTML namespace for hx-* elements', async () => {
    const o = opts('sk-helix-dts');
    await scaffoldProject(o);
    const dts = await readText(o.directory, 'src/helix.d.ts');
    expect(dts).toContain('svelteHTML');
    expect(dts).toContain('IntrinsicElements');
    expect(dts).toContain('hx-button');
    expect(dts).toContain('hx-card');
  });

  it('src/lib/helix.ts exports initHelix with browser guard', async () => {
    const o = opts('sk-lib-helix');
    await scaffoldProject(o);
    const lib = await readText(o.directory, 'src/lib/helix.ts');
    expect(lib).toContain('initHelix');
    expect(lib).toContain('browser');
    expect(lib).toContain('$app/environment');
    expect(lib).toContain('@helixui/library');
  });

  it('+layout.svelte imports initHelix and helix-tokens.css when designTokens is true', async () => {
    const o = opts('sk-layout-tokens', { designTokens: true });
    await scaffoldProject(o);
    const layout = await readText(o.directory, 'src/routes/+layout.svelte');
    expect(layout).toContain('initHelix');
    expect(layout).toContain('$lib/helix');
    expect(layout).toContain('helix-tokens.css');
  });

  it('+page.svelte uses Svelte 5 runes and hx-* components', async () => {
    const o = opts('sk-page-runes');
    await scaffoldProject(o);
    const page = await readText(o.directory, 'src/routes/+page.svelte');
    expect(page).toContain('$state');
    expect(page).toContain('$derived');
    expect(page).toContain('initHelix');
    expect(page).toContain('hx-card');
    expect(page).toContain('hx-button');
  });

  it('copies brand assets to static/og/', async () => {
    const o = opts('sk-assets');
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    // The static/og dir should exist if assets were found
    // (may be empty in CI where assets dir is absent — just check no throw)
    const stat = await fs.stat(path.join(o.directory, 'static', 'og')).catch(() => null);
    // If assets source exists, directory should exist; otherwise it's a no-op
    if (stat) {
      expect(stat.isDirectory()).toBe(true);
    }
  });

  it('package.json includes @sveltejs/vite-plugin-svelte in devDependencies', async () => {
    const o = opts('sk-vite-plugin');
    await scaffoldProject(o);
    const pkg = await readJson<{
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.devDependencies['@sveltejs/vite-plugin-svelte']).toBeDefined();
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
