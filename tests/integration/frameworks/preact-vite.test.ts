import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('preact-vite');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'preact-vite',
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

describe('preact-vite integration', () => {
  it('generates all required files', async () => {
    const o = opts('pv-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'vite.config.ts',
      'index.html',
      'src/app.tsx',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('vite.config.ts uses @preact/preset-vite plugin', async () => {
    const o = opts('pv-vite');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'vite.config.ts');
    expect(config).toContain('@preact/preset-vite');
    expect(config).toContain('preact()');
  });

  it('src/app.tsx uses preact/hooks', async () => {
    const o = opts('pv-app');
    await scaffoldProject(o);
    const app = await readText(o.directory, 'src/app.tsx');
    expect(app).toContain("from 'preact/hooks'");
    expect(app).toContain('useState');
  });

  it('index.html references src/index.tsx entry point', async () => {
    const o = opts('pv-html');
    await scaffoldProject(o);
    const html = await readText(o.directory, 'index.html');
    expect(html).toContain('src/index.tsx');
  });

  it('package.json has correct preact-vite dependencies', async () => {
    const o = opts('pv-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['preact']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
    expect(pkg.devDependencies['@preact/preset-vite']).toBeDefined();
  });

  it('package.json has vite scripts', async () => {
    const o = opts('pv-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('vite');
    expect(pkg.scripts['build']).toBe('vite build');
    expect(pkg.scripts['preview']).toBe('vite preview');
  });

  it('tsconfig.json uses preact jsx settings', async () => {
    const o = opts('pv-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{
      compilerOptions: { strict: boolean; jsx: string; jsxImportSource: string };
    }>(o.directory, 'tsconfig.json');
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    expect(tsconfig.compilerOptions.jsxImportSource).toBe('preact');
  });

  it('typescript: false skips tsconfig generation', async () => {
    const o = opts('pv-no-ts', { typescript: false });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'tsconfig.json'))).rejects.toThrow();
  });

  it('eslint: true generates eslint config', async () => {
    const o = opts('pv-eslint', { eslint: true });
    await scaffoldProject(o);
    await assertFilesExist(o.directory, ['eslint.config.js']);
  });

  it('designTokens: true includes @helixui/tokens dependency', async () => {
    const o = opts('pv-tokens', { designTokens: true });
    await scaffoldProject(o);
    const pkg = await readJson<{ dependencies: Record<string, string> }>(
      o.directory,
      'package.json',
    );
    expect(pkg.dependencies['@helixui/tokens']).toBeDefined();
  });

  it('designTokens: false omits helix-tokens import in entry', async () => {
    const o = opts('pv-no-tokens', { designTokens: false });
    await scaffoldProject(o);
    const entry = await readText(o.directory, 'src/index.tsx');
    expect(entry).not.toContain('helix-setup');
    expect(entry).toContain('@helixui/library');
  });

  it('dry-run mode produces no files', async () => {
    const o = opts('pv-dry', { dryRun: true });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'package.json'))).rejects.toThrow();
  });
});
