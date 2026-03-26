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
      'tsconfig.json',
      'app/root.tsx',
      'app/routes/_index.tsx',
      'app/styles/globals.css',
      'app/components/helix/wrappers.tsx',
      '.gitignore',
      'README.md',
    ]);
  });

  it('vite.config.ts uses the remix vite plugin', async () => {
    const o = opts('remix-vite');
    await scaffoldProject(o);
    const config = await readText(o.directory, 'vite.config.ts');
    expect(config).toContain("from '@remix-run/dev'");
    expect(config).toContain('remix()');
  });

  it('app/root.tsx imports from @remix-run/react', async () => {
    const o = opts('remix-root');
    await scaffoldProject(o);
    const root = await readText(o.directory, 'app/root.tsx');
    expect(root).toContain("from '@remix-run/react'");
    expect(root).toContain('Outlet');
    expect(root).toContain('Links');
    expect(root).toContain('Scripts');
  });

  it('app/routes/_index.tsx imports from @remix-run/node', async () => {
    const o = opts('remix-index');
    await scaffoldProject(o);
    const index = await readText(o.directory, 'app/routes/_index.tsx');
    expect(index).toContain("from '@remix-run/node'");
    expect(index).toContain('MetaFunction');
  });

  it('package.json has correct remix dependencies', async () => {
    const o = opts('remix-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['@remix-run/react']).toBeDefined();
    expect(pkg.dependencies['@remix-run/node']).toBeDefined();
    expect(pkg.dependencies['@remix-run/serve']).toBeDefined();
    expect(pkg.dependencies['react']).toBeDefined();
    expect(pkg.dependencies['react-dom']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies['@lit/react']).toBeDefined();
    expect(pkg.devDependencies['@remix-run/dev']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
  });

  it('package.json has correct remix scripts', async () => {
    const o = opts('remix-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('vite');
    expect(pkg.scripts['build']).toBe('vite build');
    expect(pkg.scripts['start']).toBe('remix-serve ./build/server/index.js');
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
