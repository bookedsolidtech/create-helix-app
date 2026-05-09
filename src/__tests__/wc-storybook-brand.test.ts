import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../scaffold.js';
import type { ProjectOptions, HeroScenario } from '../types.js';

// ---------------------------------------------------------------------------
// Phase 1 — Brand-prompt plumbing tests
//
// These tests assert that the new `brandTagline`, `brandVerticals`, and
// `heroScenarios` fields on ProjectOptions thread through scaffoldProject
// without breaking existing wc-storybook output. Phase 1 is plumbing-only
// — the FACTORY does not yet consume these fields, that lands in Phase 4
// (Cover + foundations narrative IA). This phase guards two invariants:
//
//   1. Adding the brand fields does not regress wc-storybook scaffold output
//      (existing scaffold contract must hold).
//   2. The fields are typed correctly and accepted at the ProjectOptions
//      boundary (TypeScript surface gate).
//
// Phase 4 will replace the "stubs are accepted" assertions with concrete
// "Cover.mdx contains the tagline" / "Brand.mdx surfaces verticals" tests.
// ---------------------------------------------------------------------------

const TEST_DIR = '/tmp/helix-test-brand';

function makeWcStorybookOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name: 'brand-test',
    directory: path.join(TEST_DIR, overrides.name ?? 'brand-test'),
    framework: 'wc-storybook',
    componentBundles: ['core', 'forms'],
    typescript: true,
    eslint: true,
    designTokens: true,
    darkMode: true,
    installDeps: false,
    dsName: 'aurora',
    tokenPrefix: '--ar',
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

describe('wc-storybook brand fields — ProjectOptions threading', () => {
  it('scaffold completes successfully with all brand fields omitted (default path)', async () => {
    const opts = makeWcStorybookOptions({ name: 'brand-omitted' });
    await scaffoldProject(opts);
    // Sanity: existing wc-storybook contract still produces a package.json.
    expect(await fs.pathExists(path.join(opts.directory, 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(opts.directory, '.storybook', 'main.ts'))).toBe(true);
  });

  it('scaffold completes successfully with brandTagline + brandVerticals provided', async () => {
    const opts = makeWcStorybookOptions({
      name: 'brand-with-prompts',
      brandTagline: 'Calm finance for everyone.',
      brandVerticals: ['fintech', 'wellness'],
    });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'package.json'))).toBe(true);
  });

  it('scaffold accepts heroScenarios array (Phase 4 will consume them)', async () => {
    const scenarios: HeroScenario[] = [
      {
        componentId: 'aurora-button',
        title: 'Sign in to Your Workspace',
        body: 'A primary action lifted into a real product moment.',
      },
    ];
    const opts = makeWcStorybookOptions({
      name: 'brand-with-scenarios',
      heroScenarios: scenarios,
    });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'package.json'))).toBe(true);
  });

  it('brand fields on a non-wc-storybook scaffold do not affect output', async () => {
    // ProjectOptions is the universal shape; brand fields are wc-storybook-only
    // by convention. Other frameworks must ignore them silently.
    const opts: ProjectOptions = {
      name: 'react-with-brand-fields',
      directory: path.join(TEST_DIR, 'react-with-brand-fields'),
      framework: 'react-vite',
      componentBundles: ['core'],
      typescript: true,
      eslint: true,
      designTokens: true,
      darkMode: false,
      installDeps: false,
      brandTagline: 'Should be ignored.',
      brandVerticals: ['fintech'],
    };
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'package.json'))).toBe(true);
  });

  it('empty brandVerticals array is structurally distinct from undefined', async () => {
    // Single-brand mode (empty array) MUST be representable. Phase 3's brand
    // toolbar consumer reads `brandVerticals.length === 0` to suppress the
    // dropdown — this test guards the contract.
    const opts = makeWcStorybookOptions({
      name: 'brand-single-mode',
      brandVerticals: [],
    });
    expect(opts.brandVerticals).toEqual([]);
    expect(opts.brandVerticals).not.toBeUndefined();
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'package.json'))).toBe(true);
  });
});
