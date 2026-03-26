import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('vanilla');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'vanilla',
    componentBundles: ['core'],
    typescript: false,
    eslint: false,
    designTokens: false,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('vanilla integration', () => {
  it('generates index.html with CDN links', async () => {
    const o = opts('van-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, ['package.json', 'index.html', '.gitignore', 'README.md']);
    const html = await readText(o.directory, 'index.html');
    expect(html).toContain('cdn.jsdelivr.net');
    expect(html).toContain('@helixui/library');
    expect(html).toContain('@helixui/tokens');
  });

  it('generates helix-setup.js (not .ts) when typescript is false', async () => {
    const o = opts('van-js');
    await scaffoldProject(o);
    const jsExists = await fs.pathExists(path.join(o.directory, 'src', 'helix-setup.js'));
    const tsExists = await fs.pathExists(path.join(o.directory, 'src', 'helix-setup.ts'));
    expect(jsExists).toBe(true);
    expect(tsExists).toBe(false);
  });

  it('helix-setup.js imports @helixui/library', async () => {
    const o = opts('van-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.js');
    expect(content).toContain("import '@helixui/library'");
  });

  it('package.json has http-server dev script', async () => {
    const o = opts('van-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toContain('http-server');
  });

  it('vanilla with no optional features has no framework dependencies', async () => {
    const o = opts('van-minimal', { eslint: false, typescript: false, designTokens: false });
    await scaffoldProject(o);
    const pkg = await readJson<{ dependencies: Record<string, string> }>(
      o.directory,
      'package.json',
    );
    expect(Object.keys(pkg.dependencies)).toHaveLength(0);
  });

  it('does not generate tsconfig.json when typescript is false', async () => {
    const o = opts('van-no-ts');
    await scaffoldProject(o);
    const exists = await fs.pathExists(path.join(o.directory, 'tsconfig.json'));
    expect(exists).toBe(false);
  });
});
