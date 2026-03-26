import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('react-next');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'react-next',
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

describe('react-next integration', () => {
  it('generates all required files', async () => {
    const o = opts('rn-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'next.config.ts',
      'tsconfig.json',
      'src/app/page.tsx',
      'src/app/layout.tsx',
      'src/app/globals.css',
      'src/components/helix/wrappers.tsx',
      'src/components/helix/provider.tsx',
      'src/helix.d.ts',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('rn-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
    expect(content).toContain('Selected bundles: core');
  });

  it('package.json has correct react-next dependencies', async () => {
    const o = opts('rn-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{ dependencies: Record<string, string> }>(
      o.directory,
      'package.json',
    );
    expect(pkg.dependencies['next']).toBeDefined();
    expect(pkg.dependencies['react']).toBeDefined();
    expect(pkg.dependencies['react-dom']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies['@lit/react']).toBeDefined();
    expect(pkg.dependencies['@helixui/tokens']).toBeDefined();
  });

  it('package.json has correct next scripts', async () => {
    const o = opts('rn-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('next dev');
    expect(pkg.scripts['build']).toBe('next build');
    expect(pkg.scripts['start']).toBe('next start');
  });

  it('tsconfig.json uses Next.js plugin and strict mode', async () => {
    const o = opts('rn-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{
      compilerOptions: { strict: boolean; plugins: Array<{ name: string }> };
    }>(o.directory, 'tsconfig.json');
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.plugins[0]?.name).toBe('next');
  });

  it('generates eslint.config.js and .prettierrc when eslint is true', async () => {
    const o = opts('rn-eslint');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, ['eslint.config.js', '.prettierrc']);
  });

  it('generates helix-tokens.css with design token overrides', async () => {
    const o = opts('rn-tokens');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('@import');
    expect(css).toContain('--hx-color-primary');
  });
});
