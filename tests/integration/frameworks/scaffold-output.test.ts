import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { Framework, ProjectOptions } from '../../../src/types.js';
import { TEMPLATES } from '../../../src/templates.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readJson, readText } from '../setup.js';

// Framework-specific config file (the primary framework config, not generic tsconfig/eslint)
const FRAMEWORK_CONFIG_FILES: Record<Framework, string> = {
  'react-next': 'next.config.ts',
  'react-vite': 'vite.config.ts',
  remix: 'vite.config.ts',
  'vue-nuxt': 'nuxt.config.ts',
  'vue-vite': 'vite.config.ts',
  'solid-vite': 'vite.config.ts',
  'qwik-vite': 'vite.config.ts',
  'svelte-kit': 'svelte.config.js',
  angular: 'angular.json',
  astro: 'astro.config.mjs',
  vanilla: 'index.html',
  'lit-vite': 'vite.config.ts',
  'preact-vite': 'vite.config.ts',
  stencil: 'stencil.config.ts',
};

const ALL_FRAMEWORKS: Framework[] = [
  'react-next',
  'react-vite',
  'remix',
  'vue-nuxt',
  'vue-vite',
  'solid-vite',
  'qwik-vite',
  'svelte-kit',
  'angular',
  'astro',
  'vanilla',
  'lit-vite',
  'preact-vite',
  'stencil',
];

const ROOT = makeTmpRoot('scaffold-output');

afterAll(async () => {
  await removeTempDir(ROOT);
});

function makeOpts(
  framework: Framework,
  suffix: string,
  overrides: Partial<ProjectOptions> = {},
): ProjectOptions {
  return {
    name: `${framework}-${suffix}`,
    directory: path.join(ROOT, framework, suffix),
    framework,
    componentBundles: ['core'],
    typescript: framework !== 'vanilla',
    eslint: true,
    designTokens: true,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

describe.each(ALL_FRAMEWORKS)('scaffold output: %s', (framework) => {
  it('generates package.json with correct project name', async () => {
    const o = makeOpts(framework, 'pkg');
    await scaffoldProject(o);
    const pkg = await readJson<{ name: string }>(o.directory, 'package.json');
    expect(pkg.name).toBe(o.name);
  });

  it('package.json dependencies match template config', async () => {
    const o = makeOpts(framework, 'deps');
    await scaffoldProject(o);
    const pkg = await readJson<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>(o.directory, 'package.json');

    const template = TEMPLATES.find((t) => t.id === framework)!;
    for (const dep of Object.keys(template.dependencies)) {
      expect(pkg.dependencies[dep], `expected dependency: ${dep}`).toBeDefined();
    }
    for (const dep of Object.keys(template.devDependencies)) {
      expect(pkg.devDependencies[dep], `expected devDependency: ${dep}`).toBeDefined();
    }
  });

  it('generates framework-specific config file', async () => {
    const o = makeOpts(framework, 'config');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, [FRAMEWORK_CONFIG_FILES[framework]]);
  });

  it('generates tsconfig.json with strict mode when typescript=true', async () => {
    if (framework === 'vanilla') return;
    const o = makeOpts(framework, 'tsconfig');
    await scaffoldProject(o);
    const tsconfig = await readJson<{ compilerOptions: { strict: boolean } }>(
      o.directory,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('generates eslint.config.js when eslint=true', async () => {
    const o = makeOpts(framework, 'eslint');
    await scaffoldProject(o);
    await assertFilesExist(o.directory, ['eslint.config.js']);
  });

  it('src/helix-setup references @helixui/library', async () => {
    const o = makeOpts(framework, 'helix-import');
    await scaffoldProject(o);
    const ext = o.typescript ? 'ts' : 'js';
    const content = await readText(o.directory, `src/helix-setup.${ext}`);
    expect(content).toContain('@helixui/library');
  });

  it('dry-run mode produces no files', async () => {
    const o = makeOpts(framework, 'dryrun', { dryRun: true });
    await scaffoldProject(o);
    const dirExists = await fs.pathExists(o.directory);
    expect(dirExists).toBe(false);
  });
});
