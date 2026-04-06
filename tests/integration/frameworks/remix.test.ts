import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('remix');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'remix',
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

describe('remix integration', () => {
  it('generates all required files', async () => {
    const o = opts('remix-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'vite.config.ts',
      'react-router.config.ts',
      'tsconfig.json',
      'app/root.tsx',
      'app/routes/_index.tsx',
      'app/styles/globals.css',
      'app/components/helix/wrappers.tsx',
      'app/components/helix/provider.tsx',
      'app/helix.d.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('vite.config.ts uses the react-router vite plugin', async () => {
    const o = opts('remix-vite');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'vite.config.ts');
    expect(config).toContain("from '@react-router/dev/vite'");
    expect(config).toContain('reactRouter()');
  });

  it('react-router.config.ts enables SSR', async () => {
    const o = opts('remix-rr-config');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'react-router.config.ts');
    expect(config).toContain('ssr: true');
  });

  it('app/root.tsx imports from react-router', async () => {
    const o = opts('remix-root');
    await scaffoldProject(o);
    const root = await readText(o.directory, 'app/root.tsx');
    expect(root).toContain("from 'react-router'");
    expect(root).toContain('Outlet');
    expect(root).toContain('Links');
    expect(root).toContain('Scripts');
  });

  it('app/routes/_index.tsx imports from react-router', async () => {
    const o = opts('remix-index');
    await scaffoldProject(o);
    const index = await readText(o.directory, 'app/routes/_index.tsx');
    expect(index).toContain("from 'react-router'");
    expect(index).toContain('MetaFunction');
  });

  it('app/components/helix/provider.tsx exports HelixProvider', async () => {
    const o = opts('remix-provider');
    await scaffoldProject(o);
    const provider = await readText(o.directory, 'app/components/helix/provider.tsx');
    expect(provider).toContain('HelixProvider');
    expect(provider).toContain("from 'react'");
    expect(provider).toContain('useEffect');
  });

  it('app/helix.d.ts declares hx-* JSX intrinsic elements', async () => {
    const o = opts('remix-helix-dts');
    await scaffoldProject(o);
    const dts = await readText(o.directory, 'app/helix.d.ts');
    expect(dts).toContain('IntrinsicElements');
    expect(dts).toContain('hx-button');
    expect(dts).toContain('hx-card');
  });

  it('app/routes/_index.tsx uses HelixProvider', async () => {
    const o = opts('remix-index-provider');
    await scaffoldProject(o);
    const index = await readText(o.directory, 'app/routes/_index.tsx');
    expect(index).toContain('HelixProvider');
    expect(index).toContain('HxButton');
    expect(index).toContain('HxCard');
  });

  it('package.json has correct react-router dependencies', async () => {
    const o = opts('remix-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['react-router']).toBeDefined();
    expect(pkg.dependencies['react']).toBeDefined();
    expect(pkg.dependencies['react-dom']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies['@lit/react']).toBeDefined();
    expect(pkg.devDependencies['@react-router/dev']).toBeDefined();
    expect(pkg.devDependencies['@react-router/serve']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
  });

  it('package.json has correct react-router scripts', async () => {
    const o = opts('remix-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('react-router dev');
    expect(pkg.scripts['build']).toBe('react-router build');
    expect(pkg.scripts['start']).toBe('react-router-serve ./build/server/index.js');
  });

  it('tsconfig.json has strict mode enabled', async () => {
    const o = opts('remix-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{ compilerOptions: { strict: boolean } }>(
      o.directory,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('generates eslint.config.js and .prettierrc when eslint is true', async () => {
    const o = opts('remix-eslint', { eslint: true });
    await scaffoldProject(o);
    await assertFilesExist(o.directory, ['eslint.config.js', '.prettierrc']);
  });

  it('skips eslint files when eslint is false', async () => {
    const o = opts('remix-no-eslint', { eslint: false });
    await scaffoldProject(o);
    const eslintExists = await fs.pathExists(path.join(o.directory, 'eslint.config.js'));
    expect(eslintExists).toBe(false);
  });

  it('generates helix-tokens.css when designTokens is true', async () => {
    const o = opts('remix-tokens', { designTokens: true });
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('@import');
    expect(css).toContain('--hx-color-primary');
  });

  it('dry-run mode produces no files', async () => {
    const o = opts('remix-dry-run', { dryRun: true });
    await scaffoldProject(o);
    const dirExists = await fs.pathExists(o.directory);
    expect(dirExists).toBe(false);
  });
});
