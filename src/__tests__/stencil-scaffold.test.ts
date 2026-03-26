import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../scaffold.js';
import type { ProjectOptions } from '../types.js';

const TEST_DIR = '/tmp/helix-test-stencil';

function makeOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name: 'test-stencil-app',
    directory: path.join(TEST_DIR, overrides.name ?? 'test-stencil-app'),
    framework: 'stencil',
    componentBundles: ['core'],
    typescript: true,
    eslint: false,
    designTokens: false,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(TEST_DIR);
});

afterAll(async () => {
  await fs.remove(TEST_DIR);
});

// ─── Stencil scaffold ─────────────────────────────────────────────────────────

describe('scaffoldProject — stencil', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'stencil-files' });
    await scaffoldProject(opts);

    expect(await fs.pathExists(path.join(opts.directory, 'stencil.config.ts'))).toBe(true);
    expect(
      await fs.pathExists(
        path.join(opts.directory, 'src', 'components', 'my-component', 'my-component.tsx'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(opts.directory, 'src', 'components', 'my-component', 'my-component.css'),
      ),
    ).toBe(true);
    expect(await fs.pathExists(path.join(opts.directory, 'src', 'index.ts'))).toBe(true);
  });

  it('stencil.config.ts references the project namespace', async () => {
    const opts = makeOptions({ name: 'stencil-config' });
    await scaffoldProject(opts);
    const config = await fs.readFile(path.join(opts.directory, 'stencil.config.ts'), 'utf-8');
    expect(config).toContain("from '@stencil/core'");
    expect(config).toContain('namespace');
    expect(config).toContain('stencil-config');
  });

  it('stencil.config.ts includes www and dist output targets', async () => {
    const opts = makeOptions({ name: 'stencil-targets' });
    await scaffoldProject(opts);
    const config = await fs.readFile(path.join(opts.directory, 'stencil.config.ts'), 'utf-8');
    expect(config).toContain("type: 'www'");
    expect(config).toContain("type: 'dist'");
  });

  it('my-component.tsx uses Stencil @Component decorator', async () => {
    const opts = makeOptions({ name: 'stencil-component' });
    await scaffoldProject(opts);
    const component = await fs.readFile(
      path.join(opts.directory, 'src', 'components', 'my-component', 'my-component.tsx'),
      'utf-8',
    );
    expect(component).toContain("from '@stencil/core'");
    expect(component).toContain('@Component(');
    expect(component).toContain('@Prop()');
    expect(component).toContain("tag: 'my-component'");
    expect(component).toContain('shadow: true');
  });

  it('package.json has stencil scripts', async () => {
    const opts = makeOptions({ name: 'stencil-scripts' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.start).toBe('stencil build --dev --watch --serve');
    expect(pkg.scripts.build).toBe('stencil build');
    expect(pkg.scripts.test).toBe('stencil test --spec');
    expect(pkg.scripts.generate).toBe('stencil generate');
  });

  it('package.json includes @stencil/core dependency', async () => {
    const opts = makeOptions({ name: 'stencil-deps' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.dependencies['@stencil/core']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
  });

  it('tsconfig.json has experimentalDecorators and stencil jsx settings when typescript is true', async () => {
    const opts = makeOptions({ name: 'stencil-tsconfig' });
    await scaffoldProject(opts);
    const tsconfig = await fs.readJson(path.join(opts.directory, 'tsconfig.json'));
    expect(tsconfig.compilerOptions.experimentalDecorators).toBe(true);
    expect(tsconfig.compilerOptions.jsx).toBe('react');
    expect(tsconfig.compilerOptions.jsxFactory).toBe('h');
  });

  it('src/index.ts imports @helixui/library when designTokens is false', async () => {
    const opts = makeOptions({ name: 'stencil-index-lib' });
    await scaffoldProject(opts);
    const index = await fs.readFile(path.join(opts.directory, 'src', 'index.ts'), 'utf-8');
    expect(index).toContain("import '@helixui/library'");
  });

  it('src/index.ts imports helix-tokens.css when designTokens is true', async () => {
    const opts = makeOptions({ name: 'stencil-index-tokens', designTokens: true });
    await scaffoldProject(opts);
    const index = await fs.readFile(path.join(opts.directory, 'src', 'index.ts'), 'utf-8');
    expect(index).toContain("import '../helix-tokens.css'");
  });

  it('generates standard files: package.json, README.md, .gitignore', async () => {
    const opts = makeOptions({ name: 'stencil-standard' });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(opts.directory, 'README.md'))).toBe(true);
    expect(await fs.pathExists(path.join(opts.directory, '.gitignore'))).toBe(true);
  });
});
