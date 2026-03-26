import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

const ROOT = makeTmpRoot('angular');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'angular',
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

describe('angular integration', () => {
  it('generates all required files', async () => {
    const o = opts('ng-files');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [
      'package.json',
      'angular.json',
      'tsconfig.json',
      'src/index.html',
      'src/main.ts',
      'src/styles.css',
      'src/app/app.component.ts',
      'src/helix-setup.ts',
      '.gitignore',
      'README.md',
    ]);
  });

  it('helix-setup.ts imports @helixui/library', async () => {
    const o = opts('ng-imports');
    await scaffoldProject(o);
    const content = await readText(o.directory, 'src/helix-setup.ts');
    expect(content).toContain("import '@helixui/library'");
  });

  it('angular.json references the project name', async () => {
    const o = opts('ng-json');
    await scaffoldProject(o);
    const angularJson = await readJson<{ projects: Record<string, { projectType: string }> }>(
      o.directory,
      'angular.json',
    );
    expect(angularJson.projects['ng-json']).toBeDefined();
    expect(angularJson.projects['ng-json']?.projectType).toBe('application');
  });

  it('app.component.ts uses CUSTOM_ELEMENTS_SCHEMA', async () => {
    const o = opts('ng-schema');
    await scaffoldProject(o);
    const component = await readText(o.directory, 'src/app/app.component.ts');
    expect(component).toContain('CUSTOM_ELEMENTS_SCHEMA');
  });

  it('tsconfig.json has strict mode enabled', async () => {
    const o = opts('ng-tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{ compilerOptions: { strict: boolean } }>(
      o.directory,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('package.json has correct angular dependencies', async () => {
    const o = opts('ng-deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');
    expect(pkg.dependencies['@angular/core']).toBeDefined();
    expect(pkg.dependencies['@angular/platform-browser']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.devDependencies['@angular/cli']).toBeDefined();
    expect(pkg.devDependencies['@angular/build']).toBeDefined();
  });

  it('package.json has angular scripts', async () => {
    const o = opts('ng-scripts');
    await scaffoldProject(o);
    const pkg = await readJson<{ scripts: Record<string, string> }>(o.directory, 'package.json');
    expect(pkg.scripts['dev']).toBe('ng serve');
    expect(pkg.scripts['build']).toBe('ng build');
  });

  it('generates eslint.config.js and .prettierrc when eslint is true', async () => {
    const o = opts('ng-eslint', { eslint: true });
    await scaffoldProject(o);
    await assertFilesExist(o.directory, ['eslint.config.js', '.prettierrc']);
  });

  it('generates helix-tokens.css with design token overrides', async () => {
    const o = opts('ng-tokens');
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('@import');
    expect(css).toContain('--hx-color-primary');
  });

  it('helix-tokens.css includes dark mode block when darkMode is true', async () => {
    const o = opts('ng-darkmode', { darkMode: true });
    await scaffoldProject(o);
    const css = await readText(o.directory, 'helix-tokens.css');
    expect(css).toContain('prefers-color-scheme: dark');
  });

  it('dry-run mode produces no files', async () => {
    const o = opts('ng-dry', { dryRun: true });
    await scaffoldProject(o);
    const fs = await import('node:fs/promises');
    await expect(fs.access(path.join(o.directory, 'package.json'))).rejects.toThrow();
  });
});
