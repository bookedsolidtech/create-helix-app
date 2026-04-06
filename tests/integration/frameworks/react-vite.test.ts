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
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/index.css',
      'src/helix-setup.ts',
      'src/helix.d.ts',
      'src/components/helix/wrappers.tsx',
      'src/components/helix/provider.tsx',
      'helix-tokens.css',
      '.gitignore',
      'README.md',
    ]);
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('rv-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
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

  it('wrappers.tsx uses @lit/react createComponent', async () => {
    const o = opts('rv-wrappers');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/components/helix/wrappers.tsx');
    expect(content).toContain('@lit/react');
    expect(content).toContain('createComponent');
    expect(content).toContain('hx-button');
    expect(content).toContain('hx-card');
    expect(content).toContain('hx-badge');
  });

  it('provider.tsx exports HelixProvider', async () => {
    const o = opts('rv-provider');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/components/helix/provider.tsx');
    expect(content).toContain('HelixProvider');
    expect(content).toContain('@helixui/library');
  });

  it('helix-tokens.css contains design token overrides', async () => {
    const o = opts('rv-tokens');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('@import');
    expect(css).toContain('--hx-color-primary');
  });

  it('src/helix.d.ts has hx-* element declarations', async () => {
    const o = opts('rv-helix-dts');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix.d.ts');
    expect(content).toContain('hx-button');
    expect(content).toContain('hx-card');
    expect(content).toContain('IntrinsicElements');
  });
});
