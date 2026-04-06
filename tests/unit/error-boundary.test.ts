import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../../src/scaffold.js';
import type { ProjectOptions } from '../../src/types.js';

const TEST_DIR = '/tmp/helix-test-error-boundary';

function makeOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name: 'test-app',
    directory: path.join(TEST_DIR, overrides.name ?? 'test-app'),
    framework: 'react-vite',
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

describe('error boundary — React frameworks', () => {
  it('scaffolds ErrorBoundary.tsx for react-vite', async () => {
    const opts = makeOptions({ name: 'react-vite-eb', framework: 'react-vite' });
    await scaffoldProject(opts);
    const ebPath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.tsx');
    expect(await fs.pathExists(ebPath)).toBe(true);
  });

  it('ErrorBoundary.tsx contains componentDidCatch for react-vite', async () => {
    const opts = makeOptions({ name: 'react-vite-eb-cdc', framework: 'react-vite' });
    await scaffoldProject(opts);
    const ebPath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.tsx');
    const content = await fs.readFile(ebPath, 'utf-8');
    expect(content).toContain('componentDidCatch');
  });

  it('ErrorBoundary.tsx contains getDerivedStateFromError for react-vite', async () => {
    const opts = makeOptions({ name: 'react-vite-eb-dse', framework: 'react-vite' });
    await scaffoldProject(opts);
    const ebPath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.tsx');
    const content = await fs.readFile(ebPath, 'utf-8');
    expect(content).toContain('getDerivedStateFromError');
  });

  it('scaffolds ErrorBoundary.tsx for react-next', async () => {
    const opts = makeOptions({ name: 'react-next-eb', framework: 'react-next' });
    await scaffoldProject(opts);
    const ebPath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.tsx');
    expect(await fs.pathExists(ebPath)).toBe(true);
  });

  it('scaffolds ErrorBoundary.tsx for remix', async () => {
    const opts = makeOptions({ name: 'remix-eb', framework: 'remix' });
    await scaffoldProject(opts);
    const ebPath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.tsx');
    expect(await fs.pathExists(ebPath)).toBe(true);
  });

  it('scaffolds ErrorBoundary.tsx for preact-vite', async () => {
    const opts = makeOptions({ name: 'preact-vite-eb', framework: 'preact-vite' });
    await scaffoldProject(opts);
    const ebPath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.tsx');
    expect(await fs.pathExists(ebPath)).toBe(true);
  });
});

describe('error boundary — Vue frameworks', () => {
  it('scaffolds ErrorBoundary.vue for vue-vite', async () => {
    const opts = makeOptions({ name: 'vue-vite-eb', framework: 'vue-vite' });
    await scaffoldProject(opts);
    const ebPath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.vue');
    expect(await fs.pathExists(ebPath)).toBe(true);
  });

  it('ErrorBoundary.vue contains onErrorCaptured for vue-vite', async () => {
    const opts = makeOptions({ name: 'vue-vite-eb-oec', framework: 'vue-vite' });
    await scaffoldProject(opts);
    const ebPath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.vue');
    const content = await fs.readFile(ebPath, 'utf-8');
    expect(content).toContain('onErrorCaptured');
  });

  it('scaffolds ErrorBoundary.vue for vue-nuxt', async () => {
    const opts = makeOptions({ name: 'vue-nuxt-eb', framework: 'vue-nuxt' });
    await scaffoldProject(opts);
    // vue-nuxt uses Nuxt 4 app/ directory convention
    const ebPath = path.join(opts.directory, 'app', 'components', 'ErrorBoundary.vue');
    expect(await fs.pathExists(ebPath)).toBe(true);
  });

  it('ErrorBoundary.vue contains onErrorCaptured for vue-nuxt', async () => {
    const opts = makeOptions({ name: 'vue-nuxt-eb-oec', framework: 'vue-nuxt' });
    await scaffoldProject(opts);
    // vue-nuxt uses Nuxt 4 app/ directory convention
    const ebPath = path.join(opts.directory, 'app', 'components', 'ErrorBoundary.vue');
    const content = await fs.readFile(ebPath, 'utf-8');
    expect(content).toContain('onErrorCaptured');
  });
});

describe('error boundary — non-React/Vue frameworks (no error boundary)', () => {
  it('does NOT create ErrorBoundary.tsx for angular', async () => {
    const opts = makeOptions({ name: 'angular-no-eb', framework: 'angular' });
    await scaffoldProject(opts);
    const tsxPath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.tsx');
    const vuePath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.vue');
    expect(await fs.pathExists(tsxPath)).toBe(false);
    expect(await fs.pathExists(vuePath)).toBe(false);
  });

  it('does NOT create any ErrorBoundary file for vanilla', async () => {
    const opts = makeOptions({ name: 'vanilla-no-eb', framework: 'vanilla' });
    await scaffoldProject(opts);
    const tsxPath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.tsx');
    const vuePath = path.join(opts.directory, 'src', 'components', 'ErrorBoundary.vue');
    expect(await fs.pathExists(tsxPath)).toBe(false);
    expect(await fs.pathExists(vuePath)).toBe(false);
  });
});
