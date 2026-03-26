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
});
