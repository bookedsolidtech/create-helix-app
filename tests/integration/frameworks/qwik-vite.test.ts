import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('qwik-vite');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'qwik-vite',
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

describe('qwik-vite integration', () => {
  it('generates all required files', async () => {
    const o = opts('qv-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'vite.config.ts',
      'index.html',
      'src/root.tsx',
      'src/entry.dev.tsx',
      'src/routes/layout.tsx',
      'src/routes/index.tsx',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('vite.config.ts uses qwikVite plugin', async () => {
    const o = opts('qv-vite');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'vite.config.ts');
    expect(config).toContain('qwikVite');
    expect(config).toContain('@builder.io/qwik/optimizer');
  });

  it('src/root.tsx imports from @builder.io/qwik and @builder.io/qwik-city', async () => {
    const o = opts('qv-root');
    await scaffoldProject(o);
    const root = await readText(o.directory, 'src/root.tsx');
    expect(root).toContain('@builder.io/qwik');
    expect(root).toContain('@builder.io/qwik-city');
    expect(root).toContain('QwikCityProvider');
    expect(root).toContain('RouterOutlet');
  });

  it('src/root.tsx imports helix-setup when designTokens is true', async () => {
    const o = opts('qv-root-tokens', { designTokens: true });
    await scaffoldProject(o);
    const root = await readText(o.directory, 'src/root.tsx');
    expect(root).toContain("import './helix-setup'");
  });

  it('src/root.tsx imports @helixui/library when designTokens is false', async () => {
    const o = opts('qv-root-no-tokens', { designTokens: false });
    await scaffoldProject(o);
    const root = await readText(o.directory, 'src/root.tsx');
    expect(root).toContain("import '@helixui/library'");
  });

  it('package.json has correct qwik-vite dependencies', async () => {
    const o = opts('qv-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['@builder.io/qwik']).toBeDefined();
    expect(pkg.dependencies['@builder.io/qwik-city']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
  });

  it('package.json has vite scripts', async () => {
    const o = opts('qv-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('vite');
    expect(pkg.scripts['build']).toBe('vite build');
    expect(pkg.scripts['preview']).toBe('vite preview');
  });

  it('tsconfig.json has strict mode', async () => {
    const o = opts('qv-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{ compilerOptions: { strict: boolean } }>(
      o.directory,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('typescript: false skips tsconfig.json', async () => {
    const o = opts('qv-no-ts', { typescript: false });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'tsconfig.json'))).rejects.toThrow();
  });

  it('eslint: true generates eslint config', async () => {
    const o = opts('qv-eslint', { eslint: true });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    const entries = await fs.readdir(o.directory);
    const hasEslint = entries.some((f) => f.includes('eslint'));
    expect(hasEslint).toBe(true);
  });

  it('dry-run mode produces no files', async () => {
    const o = opts('qv-dry', { dryRun: true });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'package.json'))).rejects.toThrow();
  });
});
