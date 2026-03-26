import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import {
  makeTmpRoot,
  removeTempDir,
  assertFilesExist,
  readJson,
  readText,
} from '../setup.js';

const ROOT = makeTmpRoot('astro');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'astro',
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

describe('astro integration', () => {
  it('generates all required files', async () => {
    const o = opts('astro-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'astro.config.mjs',
      'src/pages/index.astro',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('astro-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
  });

  it('index.astro imports @helixui/library', async () => {
    const o = opts('astro-page');
    await scaffoldProject(o);
    const page = await readText(o.directory, 'src/pages/index.astro');
    expect(page).toContain('@helixui/library');
  });

  it('package.json has correct astro dependencies', async () => {
    const o = opts('astro-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{ dependencies: Record<string, string> }>(
      o.directory,
      'package.json',
    );
    expect(pkg.dependencies['astro']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
  });

  it('package.json has astro scripts', async () => {
    const o = opts('astro-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('astro dev');
    expect(pkg.scripts['build']).toBe('astro build');
    expect(pkg.scripts['preview']).toBe('astro preview');
  });

  it('tsconfig.json has strict mode', async () => {
    const o = opts('astro-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{ compilerOptions: { strict: boolean } }>(
      o.directory,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });
});
