import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('stencil');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'stencil',
    componentBundles: ['core'],
    typescript: true,
    eslint: true,
    designTokens: true,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('stencil integration', () => {
  it('generates all required files', async () => {
    const o = opts('stencil-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'stencil.config.ts',
      'src/index.ts',
      'src/components/my-component/my-component.tsx',
      '.gitignore',
      'README.md',
    ]);
  });

  it('src/components/ directory is created', async () => {
    const o = opts('stencil-components-dir');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'src/components/my-component/my-component.tsx',
      'src/components/my-component/my-component.css',
    ]);
  });

  it('package.json has correct stencil dependencies', async () => {
    const o = opts('stencil-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{ dependencies: Record<string, string> }>(
      o.directory,
      'package.json',
    );
    expect(pkg.dependencies['@stencil/core']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
  });

  it('package.json has correct stencil scripts', async () => {
    const o = opts('stencil-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['start']).toBe('stencil build --dev --watch --serve');
    expect(pkg.scripts['build']).toBe('stencil build');
    expect(pkg.scripts['test']).toBe('stencil test --spec');
    expect(pkg.scripts['generate']).toBe('stencil generate');
  });

  it('stencil.config.ts references @stencil/core and project namespace', async () => {
    const o = opts('stencil-config');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'stencil.config.ts');
    expect(config).toContain("from '@stencil/core'");
    expect(config).toContain('namespace');
  });

  it('src/index.ts imports @helixui/library', async () => {
    const o = opts('stencil-index', { designTokens: false });
    await scaffoldProject(o);
    const index = await readText(o.directory, 'src/index.ts');
    expect(index).toContain("import '@helixui/library'");
  });
});
