import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('lit-vite');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'lit-vite',
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

describe('lit-vite integration', () => {
  it('generates all required files', async () => {
    const o = opts('lv-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'vite.config.ts',
      'index.html',
      'src/my-element.ts',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('vite.config.ts has es2022 build target', async () => {
    const o = opts('lv-vite');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'vite.config.ts');
    expect(config).toContain('defineConfig');
    expect(config).toContain('es2022');
  });

  it('index.html references my-element', async () => {
    const o = opts('lv-html');
    await scaffoldProject(o);
    const html = await readText(o.directory, 'index.html');
    expect(html).toContain('<my-element>');
    expect(html).toContain('src/my-element.ts');
  });

  it('my-element.ts uses Lit decorators and LitElement', async () => {
    const o = opts('lv-element');
    await scaffoldProject(o);
    const el = await readText(o.directory, 'src/my-element.ts');
    expect(el).toContain("from 'lit'");
    expect(el).toContain('LitElement');
    expect(el).toContain('@customElement');
    expect(el).toContain('@property');
  });

  it('my-element.ts imports helix-setup when designTokens is true', async () => {
    const o = opts('lv-tokens', { designTokens: true });
    await scaffoldProject(o);
    const el = await readText(o.directory, 'src/my-element.ts');
    expect(el).toContain("import './helix-setup'");
  });

  it('my-element.ts imports @helixui/library when designTokens is false', async () => {
    const o = opts('lv-no-tokens', { designTokens: false });
    await scaffoldProject(o);
    const el = await readText(o.directory, 'src/my-element.ts');
    expect(el).toContain("import '@helixui/library'");
  });

  it('package.json has correct lit-vite dependencies', async () => {
    const o = opts('lv-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['lit']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
  });

  it('package.json has vite scripts', async () => {
    const o = opts('lv-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('vite');
    expect(pkg.scripts['build']).toBe('vite build');
    expect(pkg.scripts['preview']).toBe('vite preview');
  });

  it('dry-run mode produces no files', async () => {
    const o = opts('lv-dry', { dryRun: true });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'package.json'))).rejects.toThrow();
  });
});
