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

// ---------------------------------------------------------------------------
// Phase 2 — Storybook config knob + addon sync
// ---------------------------------------------------------------------------

describe('wc-storybook Phase 2 — addon sync', () => {
  it('main.ts wires all 4 new addons to match upstream Helix storybook', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-addons' });
    await scaffoldProject(opts);
    const main = await fs.readFile(
      path.join(opts.directory, '.storybook', 'main.ts'),
      'utf-8',
    );
    expect(main).toContain("getAbsolutePath('@storybook/addon-links')");
    expect(main).toContain("getAbsolutePath('@storybook/addon-designs')");
    expect(main).toContain("getAbsolutePath('storybook-addon-pseudo-states')");
    expect(main).toContain("getAbsolutePath('@chromatic-com/storybook')");
    // And keeps the existing four
    expect(main).toContain("getAbsolutePath('@storybook/addon-a11y')");
    expect(main).toContain("getAbsolutePath('@storybook/addon-docs')");
    expect(main).toContain("getAbsolutePath('@storybook/addon-vitest')");
    expect(main).toContain("getAbsolutePath('@storybook/addon-themes')");
  });

  it('package.json declares all 4 new addons in devDependencies', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-deps' });
    await scaffoldProject(opts);
    const pkg = JSON.parse(
      await fs.readFile(path.join(opts.directory, 'package.json'), 'utf-8'),
    ) as { devDependencies?: Record<string, string> };
    const dev = pkg.devDependencies ?? {};
    expect(dev['@chromatic-com/storybook']).toBeDefined();
    expect(dev['@storybook/addon-designs']).toBeDefined();
    expect(dev['@storybook/addon-links']).toBeDefined();
    expect(dev['storybook-addon-pseudo-states']).toBeDefined();
  });
});

describe('wc-storybook Phase 2 — helix.storybook.config.ts knob', () => {
  it('emits helix.storybook.config.ts at consumer root', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-config-emit' });
    await scaffoldProject(opts);
    expect(
      await fs.pathExists(path.join(opts.directory, 'helix.storybook.config.ts')),
    ).toBe(true);
  });

  it('config exports HelixStorybookConfig type with all 5 knob keys', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-config-shape' });
    await scaffoldProject(opts);
    const cfg = await fs.readFile(
      path.join(opts.directory, 'helix.storybook.config.ts'),
      'utf-8',
    );
    expect(cfg).toContain('export interface HelixStorybookConfig');
    expect(cfg).toContain('export type DocsPageId');
    expect(cfg).toContain('export type BrandKey');
    expect(cfg).toContain('export type NarrativePageId');
    // The 5 top-level keys, in expected order
    for (const key of ['components', 'docs', 'brand', 'aaa', 'narrative']) {
      expect(cfg).toContain(`${key}:`);
    }
  });

  it('config DocsPageId union covers all 7 foundations pages', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-config-docs' });
    await scaffoldProject(opts);
    const cfg = await fs.readFile(
      path.join(opts.directory, 'helix.storybook.config.ts'),
      'utf-8',
    );
    for (const id of [
      "'tokens'",
      "'color'",
      "'typography'",
      "'spacing'",
      "'layout'",
      "'brand'",
      "'accessibility'",
    ]) {
      expect(cfg).toContain(id);
    }
  });

  it('config NarrativePageId union covers cover/overview/patterns', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-config-narrative' });
    await scaffoldProject(opts);
    const cfg = await fs.readFile(
      path.join(opts.directory, 'helix.storybook.config.ts'),
      'utf-8',
    );
    for (const id of ["'cover'", "'overview'", "'patterns'"]) {
      expect(cfg).toContain(id);
    }
  });

  it('default config is "everything visible" (include: all, exclude: [])', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-config-default' });
    await scaffoldProject(opts);
    const cfg = await fs.readFile(
      path.join(opts.directory, 'helix.storybook.config.ts'),
      'utf-8',
    );
    // The default config object has `include: 'all'` for every knob that
    // takes an array, and `enabled: true` for AAA. Sanity check via raw
    // string match — the config is generated, not parsed.
    expect(cfg).toMatch(/components:\s*{\s*include:\s*'all',\s*exclude:\s*\[\]\s*}/);
    expect(cfg).toMatch(/docs:\s*{\s*include:\s*'all',\s*exclude:\s*\[\]\s*}/);
    expect(cfg).toMatch(/brand:\s*{\s*include:\s*'all',\s*exclude:\s*\[\]\s*}/);
    expect(cfg).toMatch(/aaa:\s*{\s*enabled:\s*true\s*}/);
    expect(cfg).toMatch(/narrative:\s*{\s*include:\s*'all',\s*exclude:\s*\[\]\s*}/);
  });
});

describe('wc-storybook Phase 2 — generate-catalog respects config', () => {
  it('catalog script imports the consumer helix.storybook.config.ts', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-catalog-import' });
    await scaffoldProject(opts);
    const script = await fs.readFile(
      path.join(opts.directory, 'scripts', 'generate-catalog.ts'),
      'utf-8',
    );
    expect(script).toContain(
      "import helixConfig, { type HelixStorybookConfig } from '../helix.storybook.config.ts'",
    );
  });

  it('catalog script applies shouldIncludeTag against config.components', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-catalog-filter' });
    await scaffoldProject(opts);
    const script = await fs.readFile(
      path.join(opts.directory, 'scripts', 'generate-catalog.ts'),
      'utf-8',
    );
    expect(script).toContain('function shouldIncludeTag');
    expect(script).toContain('shouldIncludeTag(d.tagName!, helixConfig.components)');
  });

  it('HIPAA filter still runs unconditionally before config filter', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-catalog-hipaa' });
    await scaffoldProject(opts);
    const script = await fs.readFile(
      path.join(opts.directory, 'scripts', 'generate-catalog.ts'),
      'utf-8',
    );
    // HIPAA filter is applied via .filter() chain BEFORE the config filter
    // at the actual CALL site. Order matters — Helix-team policy is non-
    // overridable. Match on the call expression (not the function defn,
    // which appears earlier).
    const hipaaCallIdx = script.indexOf('!isHipaaAdjacent(d.tagName)');
    const configCallIdx = script.indexOf(
      'shouldIncludeTag(d.tagName!, helixConfig.components)',
    );
    expect(hipaaCallIdx).toBeGreaterThan(0);
    expect(configCallIdx).toBeGreaterThan(hipaaCallIdx);
  });
});
