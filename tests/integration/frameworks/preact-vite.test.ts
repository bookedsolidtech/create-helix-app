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
      'src/index.tsx',
      'src/app.tsx',
      'src/index.css',
      'src/helix.d.ts',
      'src/helix-setup.ts',
      'src/components/navbar.tsx',
      'src/components/footer.tsx',
      'src/components/ErrorBoundary.tsx',
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

  it('src/app.tsx uses preact/hooks and has production landing page', async () => {
    const o = opts('pv-app');
    await scaffoldProject(o);
    const app = await readText(o.directory, 'src/app.tsx');
    expect(app).toContain("from 'preact/hooks'");
    expect(app).toContain('useState');
    // Production landing page — hero, hx-* components, interactive demo
    expect(app).toContain('hx-card');
    expect(app).toContain('hx-button');
    expect(app).toContain('hx-badge');
    expect(app).toContain('hx-theme');
    expect(app).toContain('hx-text-input');
    expect(app).toContain('hx-alert');
    expect(app).toContain('hx-tag');
    // Preact uses class not className
    expect(app).toContain('class="hero"');
    // Navbar and Footer imported
    expect(app).toContain("from './components/navbar'");
    expect(app).toContain("from './components/footer'");
  });

  it('src/helix.d.ts declares hx-* elements in preact JSX namespace', async () => {
    const o = opts('pv-helix-d-ts');
    await scaffoldProject(o);
    const dts = await readText(o.directory, 'src/helix.d.ts');
    expect(dts).toContain("'hx-button'");
    expect(dts).toContain("'hx-card'");
    expect(dts).toContain("'hx-badge'");
    expect(dts).toContain("'hx-text-input'");
    expect(dts).toContain("'hx-alert'");
    // Preact namespace (not React)
    expect(dts).toContain('preact');
    expect(dts).toContain('IntrinsicElements');
  });

  it('src/helix-setup.ts imports @helixui/library', async () => {
    const o = opts('pv-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
    expect(content).toContain('Selected bundles: core');
  });

  it('src/index.tsx renders with preact render()', async () => {
    const o = opts('pv-entry');
    await scaffoldProject(o);
    const entry = await readText(o.directory, 'src/index.tsx');
    expect(entry).toContain("from 'preact'");
    expect(entry).toContain('render(');
    expect(entry).toContain("import './helix-setup'");
  });

  it('index.html references src/index.tsx entry point and has OG meta tags', async () => {
    const o = opts('pv-html');
    await scaffoldProject(o);
    const html = await readText(o.directory, 'index.html');
    expect(html).toContain('src/index.tsx');
    expect(html).toContain('<div id="app">');
    expect(html).toContain('og:image');
  });

  it('src/index.css has dark mode CSS custom properties', async () => {
    const o = opts('pv-css');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'src/index.css');
    expect(css).toContain("@import '@helixui/tokens/tokens.css'");
    expect(css).toContain('--hx-page-bg');
    expect(css).toContain('--hx-page-text');
    expect(css).toContain('.hero');
    expect(css).toContain('.grid-auto');
    expect(css).toContain('.promo-card');
  });

  it('src/components/navbar.tsx uses preact/hooks for dark mode toggle', async () => {
    const o = opts('pv-navbar');
    await scaffoldProject(o);
    const navbar = await readText(o.directory, 'src/components/navbar.tsx');
    expect(navbar).toContain("from 'preact/hooks'");
    expect(navbar).toContain('hx-top-nav');
    expect(navbar).toContain('hx-switch');
    expect(navbar).toContain('applyTheme');
  });

  it('src/components/ErrorBoundary.tsx uses Preact Component (not React)', async () => {
    const o = opts('pv-error-boundary');
    await scaffoldProject(o);
    const eb = await readText(o.directory, 'src/components/ErrorBoundary.tsx');
    expect(eb).toContain("from 'preact'");
    expect(eb).toContain('Component');
    expect(eb).toContain('getDerivedStateFromError');
    expect(eb).toContain('ComponentChildren');
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

  it('designTokens: false omits helix-setup import in entry', async () => {
    const o = opts('pv-no-tokens', { designTokens: false });
    await scaffoldProject(o);
    const entry = await readText(o.directory, 'src/index.tsx');
    expect(entry).not.toContain('helix-setup');
    expect(entry).toContain('@helixui/library');
  });

  it('helix-tokens.css has design token overrides when designTokens is true', async () => {
    const o = opts('pv-helix-tokens');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('@import');
    expect(css).toContain('--hx-color-primary');
  });

  it('dry-run mode produces no files', async () => {
    const o = opts('pv-dry', { dryRun: true });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'package.json'))).rejects.toThrow();
  });
});
