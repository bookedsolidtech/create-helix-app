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
      'src/components/Navbar.tsx',
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

  it('main.tsx always imports helix-setup', async () => {
    const o = opts('rv-main');
    await scaffoldProject(o);
    const main = await readText(o.directory, 'src/main.tsx');
    expect(main).toContain("import './helix-setup'");
  });

  it('helix.d.ts declares React JSX namespace for hx-* elements', async () => {
    const o = opts('rv-helix-dts');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix.d.ts');
    expect(content).toContain('hx-button');
    expect(content).toContain('hx-card');
    expect(content).toContain('hx-text-input');
    expect(content).toContain('React.JSX');
  });

  it('wrappers.tsx uses @lit/react createComponent', async () => {
    const o = opts('rv-wrappers');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/components/helix/wrappers.tsx');
    expect(content).toContain('@lit/react');
    expect(content).toContain('createComponent');
    expect(content).toContain('HxButton');
    expect(content).toContain('HxCard');
  });

  it('App.tsx has production landing page with HELiX components', async () => {
    const o = opts('rv-app');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/App.tsx');
    expect(content).toContain('hx-theme');
    expect(content).toContain('hx-button');
    expect(content).toContain('hx-card');
    expect(content).toContain('hx-badge');
    expect(content).toContain('toggleTheme');
  });

  it('Navbar.tsx has dark mode toggle', async () => {
    const o = opts('rv-navbar');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/components/Navbar.tsx');
    expect(content).toContain('hx-icon-button');
    expect(content).toContain('onToggleTheme');
    expect(content).toContain('hx-click');
  });

  it('index.html has OG meta tags', async () => {
    const o = opts('rv-html');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'index.html');
    expect(content).toContain('og:title');
    expect(content).toContain('og:image');
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
});
