import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { scaffoldProject } from '../../src/scaffold.js';
import { TEMPLATES } from '../../src/templates.js';
import type { Framework, ProjectOptions } from '../../src/types.js';
import { makeTmpRoot, removeTempDir, readJson, readText } from '../integration/setup.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const ROOT = makeTmpRoot('config-syntax');

afterAll(async () => {
  await removeTempDir(ROOT);
});

function makeOptions(framework: Framework): ProjectOptions {
  const name = `test-${framework}`;
  return {
    name,
    directory: path.join(ROOT, name),
    framework,
    componentBundles: ['all'],
    typescript: true,
    eslint: false,
    designTokens: false,
    darkMode: false,
    installDeps: false,
  };
}

// ---------------------------------------------------------------------------
// Scaffold once per framework, reuse the output directory across assertions
// ---------------------------------------------------------------------------

const frameworks = TEMPLATES.map((t) => t.id);

/** Cache of scaffolded directories keyed by framework id. */
const scaffolded = new Map<Framework, string>();

async function ensureScaffolded(fw: Framework): Promise<string> {
  const cached = scaffolded.get(fw);
  if (cached) return cached;

  const opts = makeOptions(fw);
  await scaffoldProject(opts);
  scaffolded.set(fw, opts.directory);
  return opts.directory;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(dir: string, rel: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, rel));
}

// ---------------------------------------------------------------------------
// Tests — iterate over every framework
// ---------------------------------------------------------------------------

describe.each(frameworks)('config syntax validation: %s', (framework) => {
  // ── package.json ──────────────────────────────────────────────────────────

  it('package.json is valid JSON with name, version, and scripts', async () => {
    const dir = await ensureScaffolded(framework);
    const pkg = await readJson<{
      name: string;
      version: string;
      scripts: Record<string, string>;
    }>(dir, 'package.json');

    expect(pkg.name).toBeTruthy();
    expect(pkg.version).toBeTruthy();
    expect(pkg.scripts).toBeDefined();
    expect(typeof pkg.scripts).toBe('object');
  });

  // ── .prettierrc ───────────────────────────────────────────────────────────

  it('.prettierrc is valid JSON', async () => {
    const dir = await ensureScaffolded(framework);
    const config = await readJson(dir, '.prettierrc');
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  // ── .editorconfig ─────────────────────────────────────────────────────────

  it('.editorconfig contains [*] section', async () => {
    const dir = await ensureScaffolded(framework);
    const content = await readText(dir, '.editorconfig');
    expect(content).toContain('[*]');
  });

  // ── tsconfig.json (when present) ──────────────────────────────────────────

  it('tsconfig.json is valid JSON with compilerOptions (when present)', async () => {
    const dir = await ensureScaffolded(framework);
    const exists = await fileExists(dir, 'tsconfig.json');
    if (!exists) return;

    const tsconfig = await readJson<{
      compilerOptions: Record<string, unknown>;
    }>(dir, 'tsconfig.json');

    expect(tsconfig.compilerOptions).toBeDefined();
    expect(typeof tsconfig.compilerOptions).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// Framework-specific tsconfig validations
// ---------------------------------------------------------------------------

describe('framework-specific tsconfig settings', () => {
  it('react-next: tsconfig references "next" plugin or has jsx config', async () => {
    const dir = await ensureScaffolded('react-next');
    const tsconfig = await readJson<{
      compilerOptions: { plugins?: Array<{ name: string }>; jsx?: string };
    }>(dir, 'tsconfig.json');

    const hasNextPlugin = tsconfig.compilerOptions.plugins?.some((p) => p.name === 'next');
    const hasJsx = typeof tsconfig.compilerOptions.jsx === 'string';
    expect(hasNextPlugin || hasJsx).toBe(true);
  });

  it('react-vite: tsconfig jsx should be "react-jsx"', async () => {
    const dir = await ensureScaffolded('react-vite');
    const tsconfig = await readJson<{ compilerOptions: { jsx?: string } }>(dir, 'tsconfig.json');
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
  });

  it('remix: tsconfig jsx should be "react-jsx"', async () => {
    const dir = await ensureScaffolded('remix');
    const tsconfig = await readJson<{ compilerOptions: { jsx?: string } }>(dir, 'tsconfig.json');
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
  });

  it('solid-vite: tsconfig jsxImportSource should be "solid-js"', async () => {
    const dir = await ensureScaffolded('solid-vite');
    const tsconfig = await readJson<{ compilerOptions: { jsxImportSource?: string } }>(
      dir,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.jsxImportSource).toBe('solid-js');
  });

  it('stencil: tsconfig experimentalDecorators should be true', async () => {
    const dir = await ensureScaffolded('stencil');
    const tsconfig = await readJson<{ compilerOptions: { experimentalDecorators?: boolean } }>(
      dir,
      'tsconfig.json',
    );
    expect(tsconfig.compilerOptions.experimentalDecorators).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Framework-specific vite.config.ts validations
// ---------------------------------------------------------------------------

describe('vite.config.ts plugin imports', () => {
  const viteFrameworks: Array<{ framework: Framework; pluginImport: string }> = [
    { framework: 'react-vite', pluginImport: '@vitejs/plugin-react' },
    { framework: 'vue-vite', pluginImport: '@vitejs/plugin-vue' },
    { framework: 'solid-vite', pluginImport: 'vite-plugin-solid' },
    { framework: 'preact-vite', pluginImport: '@preact/preset-vite' },
    { framework: 'qwik-vite', pluginImport: '@builder.io/qwik' },
  ];

  it.each(viteFrameworks)(
    '$framework: vite.config.ts contains $pluginImport',
    async ({ framework, pluginImport }) => {
      const dir = await ensureScaffolded(framework);
      const content = await readText(dir, 'vite.config.ts');
      expect(content).toContain(pluginImport);
    },
  );
});

// ---------------------------------------------------------------------------
// Framework-specific config file validations
// ---------------------------------------------------------------------------

describe('framework-specific config files', () => {
  it('angular: angular.json is valid JSON with projects key', async () => {
    const dir = await ensureScaffolded('angular');
    const config = await readJson<{ projects: Record<string, unknown> }>(dir, 'angular.json');
    expect(config.projects).toBeDefined();
    expect(typeof config.projects).toBe('object');
  });

  it('react-next: next.config.ts contains reactStrictMode', async () => {
    const dir = await ensureScaffolded('react-next');
    const content = await readText(dir, 'next.config.ts');
    expect(content).toContain('reactStrictMode');
  });

  it('svelte-kit: svelte.config.js contains @sveltejs/adapter', async () => {
    const dir = await ensureScaffolded('svelte-kit');
    const content = await readText(dir, 'svelte.config.js');
    expect(content).toContain('@sveltejs/adapter');
  });

  it('stencil: stencil.config.ts contains namespace', async () => {
    const dir = await ensureScaffolded('stencil');
    const content = await readText(dir, 'stencil.config.ts');
    expect(content).toContain('namespace');
  });

  it('astro: astro.config.mjs contains defineConfig', async () => {
    const dir = await ensureScaffolded('astro');
    const content = await readText(dir, 'astro.config.mjs');
    expect(content).toContain('defineConfig');
  });
});
