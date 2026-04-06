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
      'src/helix.d.ts',
      'src/helix-setup.ts',
      'src/lib/helix-setup.ts',
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

  it('src/helix.d.ts exists and contains svelteHTML.IntrinsicElements', async () => {
    const o = opts('sk-helix-dts');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix.d.ts');
    expect(content).toContain('svelteHTML');
    expect(content).toContain('IntrinsicElements');
    expect(content).toContain('hx-button');
    expect(content).toContain('hx-card');
    expect(content).toContain('hx-badge');
  });

  it('src/lib/helix-setup.ts exists and contains initHelix with singleton guard', async () => {
    const o = opts('sk-lib-setup');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/lib/helix-setup.ts');
    expect(content).toContain('initHelix');
    expect(content).toContain('_initialized');
    expect(content).toContain("import('@helixui/library')");
    expect(content).toContain("typeof window === 'undefined'");
  });

  it('src/app.css exists and references HELiX tokens', async () => {
    const o = opts('sk-app-css');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/app.css');
    expect(content).toContain('@helixui/tokens/tokens.css');
    expect(content).toContain('--hx-');
  });

  it('src/routes/+layout.svelte uses onMount and calls initHelix', async () => {
    const o = opts('sk-layout');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/routes/+layout.svelte');
    expect(content).toContain('onMount');
    expect(content).toContain('initHelix');
    expect(content).toContain('$lib/helix-setup');
    expect(content).toContain('app.css');
  });

  it('src/routes/+page.svelte uses Svelte 5 runes ($state and $derived)', async () => {
    const o = opts('sk-page-runes');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/routes/+page.svelte');
    expect(content).toContain('$state');
    expect(content).toContain('$derived');
  });

  it('svelte.config.js uses @sveltejs/adapter-auto', async () => {
    const o = opts('sk-adapter');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'svelte.config.js');
    expect(config).toContain('@sveltejs/adapter-auto');
  });

  it('svelte.config.js includes vitePreprocess', async () => {
    const o = opts('sk-preprocess');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'svelte.config.js');
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
