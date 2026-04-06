import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('react-vite');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'react-vite',
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

describe('react-vite integration', () => {
  it('generates all required files', async () => {
    const o = opts('rv-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/index.css',
      'src/helix.d.ts',
      'src/helix-setup.ts',
      'src/components/helix/wrappers.tsx',
      'src/components/helix/provider.tsx',
      '.gitignore',
      'README.md',
    ]);
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('rv-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
    expect(content).toContain('Selected bundles: core');
  });

  it('main.tsx imports helix-setup', async () => {
    const o = opts('rv-main');
    await scaffoldProject(o);
    const main = await readText(o.directory, 'src/main.tsx');
    expect(main).toContain('helix-setup');
  });

  it('package.json has correct react-vite dependencies', async () => {
    const o = opts('rv-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['react']).toBeDefined();
    expect(pkg.dependencies['react-dom']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies['@lit/react']).toBeDefined();
    expect(pkg.dependencies['@helixui/tokens']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
    expect(pkg.devDependencies['@vitejs/plugin-react']).toBeDefined();
  });

  it('package.json has vite scripts', async () => {
    const o = opts('rv-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('vite');
    expect(pkg.scripts['build']).toBe('vite build');
    expect(pkg.scripts['preview']).toBe('vite preview');
  });

  it('tsconfig.json has strict mode when typescript is true', async () => {
    const o = opts('rv-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{ compilerOptions: { strict: boolean } }>(
      o.directory,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('generates eslint.config.js and .prettierrc when eslint is true', async () => {
    const o = opts('rv-eslint');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, ['eslint.config.js', '.prettierrc']);
  });

  it('generates helix-tokens.css with design token overrides', async () => {
    const o = opts('rv-tokens');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('@import');
    expect(css).toContain('--hx-color-primary');
  });

  it('helix.d.ts declares hx-* custom elements', async () => {
    const o = opts('rv-helix-dts');
    await scaffoldProject(o);
    const dts = await readText(o.directory, 'src/helix.d.ts');
    expect(dts).toContain("'hx-button'");
    expect(dts).toContain("'hx-card'");
  });

  it('wrappers.tsx imports @lit/react and @helixui/library components', async () => {
    const o = opts('rv-wrappers');
    await scaffoldProject(o);
    const wrappers = await readText(o.directory, 'src/components/helix/wrappers.tsx');
    expect(wrappers).toContain("from '@lit/react'");
    expect(wrappers).toContain("'@helixui/library/components/hx-button'");
    expect(wrappers).toContain('HxButton');
    expect(wrappers).toContain('HxCard');
  });

  it('provider.tsx exports HelixProvider', async () => {
    const o = opts('rv-provider');
    await scaffoldProject(o);
    const provider = await readText(o.directory, 'src/components/helix/provider.tsx');
    expect(provider).toContain('HelixProvider');
  });

  it('App.tsx uses hx-* HELiX components', async () => {
    const o = opts('rv-app');
    await scaffoldProject(o);
    const app = await readText(o.directory, 'src/App.tsx');
    expect(app).toContain('hx-button');
    expect(app).toContain('hx-card');
    expect(app).toContain('hx-badge');
  });
});
