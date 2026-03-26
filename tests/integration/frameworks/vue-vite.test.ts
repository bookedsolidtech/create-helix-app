import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('vue-vite');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'vue-vite',
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

describe('vue-vite integration', () => {
  it('generates all required files', async () => {
    const o = opts('vv-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'vite.config.ts',
      'index.html',
      'src/main.ts',
      'src/App.vue',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('vv-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
  });

  it('vite.config.ts configures custom element detection for hx-*', async () => {
    const o = opts('vv-vite');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'vite.config.ts');
    expect(config).toContain('isCustomElement');
    expect(config).toContain('hx-');
  });

  it('main.ts imports @helixui/library', async () => {
    const o = opts('vv-main');
    await scaffoldProject(o);
    const main = await readText(o.directory, 'src/main.ts');
    expect(main).toContain('@helixui/library');
  });

  it('package.json has correct vue-vite dependencies', async () => {
    const o = opts('vv-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['vue']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
    expect(pkg.devDependencies['@vitejs/plugin-vue']).toBeDefined();
  });

  it('package.json has vite scripts', async () => {
    const o = opts('vv-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('vite');
    expect(pkg.scripts['build']).toBe('vite build');
  });

  it('tsconfig.json has strict mode', async () => {
    const o = opts('vv-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{ compilerOptions: { strict: boolean } }>(
      o.directory,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });
});
