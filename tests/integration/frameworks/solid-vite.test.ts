import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('solid-vite');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'solid-vite',
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

describe('solid-vite integration', () => {
  it('generates all required files', async () => {
    const o = opts('sv-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'vite.config.ts',
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('vite.config.ts uses vite-plugin-solid', async () => {
    const o = opts('sv-vite');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'vite.config.ts');
    expect(config).toContain('vite-plugin-solid');
    expect(config).toContain('solidPlugin');
  });

  it('main.tsx imports solid-js/web render', async () => {
    const o = opts('sv-main');
    await scaffoldProject(o);
    const main = await readText(o.directory, 'src/main.tsx');
    expect(main).toContain("from 'solid-js/web'");
    expect(main).toContain('render');
  });

  it('App.tsx uses solid-js signals', async () => {
    const o = opts('sv-app');
    await scaffoldProject(o);
    const app = await readText(o.directory, 'src/App.tsx');
    expect(app).toContain("from 'solid-js'");
    expect(app).toContain('createSignal');
  });

  it('package.json has correct solid-vite dependencies', async () => {
    const o = opts('sv-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['solid-js']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
    expect(pkg.devDependencies['vite-plugin-solid']).toBeDefined();
  });

  it('package.json has vite scripts', async () => {
    const o = opts('sv-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('vite');
    expect(pkg.scripts['build']).toBe('vite build');
    expect(pkg.scripts['preview']).toBe('vite preview');
  });

  it('tsconfig.json has solid-js jsx settings', async () => {
    const o = opts('sv-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{
      compilerOptions: { strict: boolean; jsx: string; jsxImportSource: string };
    }>(o.directory, 'tsconfig.json');
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.jsx).toBe('preserve');
    expect(tsconfig.compilerOptions.jsxImportSource).toBe('solid-js');
  });

  it('dry-run mode produces no files', async () => {
    const o = opts('sv-dry', { dryRun: true });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'package.json'))).rejects.toThrow();
  });
});
