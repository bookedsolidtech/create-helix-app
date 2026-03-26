import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('vue-nuxt');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'vue-nuxt',
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

describe('vue-nuxt integration', () => {
  it('generates all required files', async () => {
    const o = opts('vn-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'nuxt.config.ts',
      'plugins/helix.client.ts',
      'app/app.vue',
      'app/pages/index.vue',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('vn-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
  });

  it('nuxt.config.ts configures custom element detection for hx-*', async () => {
    const o = opts('vn-config');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'nuxt.config.ts');
    expect(config).toContain('isCustomElement');
    expect(config).toContain('hx-');
  });

  it('helix plugin imports @helixui/library', async () => {
    const o = opts('vn-plugin');
    await scaffoldProject(o);
    const plugin = await readText(o.directory, 'plugins/helix.client.ts');
    expect(plugin).toContain('@helixui/library');
  });

  it('package.json has correct nuxt dependencies', async () => {
    const o = opts('vn-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{ dependencies: Record<string, string> }>(
      o.directory,
      'package.json',
    );
    expect(pkg.dependencies['nuxt']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
  });

  it('package.json has nuxt scripts', async () => {
    const o = opts('vn-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('nuxt dev');
    expect(pkg.scripts['build']).toBe('nuxt build');
    expect(pkg.scripts['preview']).toBe('nuxt preview');
  });
});
