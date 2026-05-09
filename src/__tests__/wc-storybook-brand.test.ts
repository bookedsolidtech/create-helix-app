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
    const main = await fs.readFile(path.join(opts.directory, '.storybook', 'main.ts'), 'utf-8');
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
    expect(await fs.pathExists(path.join(opts.directory, 'helix.storybook.config.ts'))).toBe(true);
  });

  it('config exports HelixStorybookConfig type with all 5 knob keys', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-config-shape' });
    await scaffoldProject(opts);
    const cfg = await fs.readFile(path.join(opts.directory, 'helix.storybook.config.ts'), 'utf-8');
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
    const cfg = await fs.readFile(path.join(opts.directory, 'helix.storybook.config.ts'), 'utf-8');
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
    const cfg = await fs.readFile(path.join(opts.directory, 'helix.storybook.config.ts'), 'utf-8');
    for (const id of ["'cover'", "'overview'", "'patterns'"]) {
      expect(cfg).toContain(id);
    }
  });

  it('default config is "everything visible" (include: all, exclude: [])', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-config-default' });
    await scaffoldProject(opts);
    const cfg = await fs.readFile(path.join(opts.directory, 'helix.storybook.config.ts'), 'utf-8');
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
    const configCallIdx = script.indexOf('shouldIncludeTag(d.tagName!, helixConfig.components)');
    expect(hipaaCallIdx).toBeGreaterThan(0);
    expect(configCallIdx).toBeGreaterThan(hipaaCallIdx);
  });
});

// ---------------------------------------------------------------------------
// Phase 3a — Docs-surface React components (CEM-free subset)
// ---------------------------------------------------------------------------

describe('wc-storybook Phase 3a — docs React components', () => {
  it('emits ConsumerObligations.tsx with the documented prop shape', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3a-consumer-oblig' });
    await scaffoldProject(opts);
    const file = path.join(
      opts.directory,
      'src',
      'stories',
      '_components',
      'ConsumerObligations.tsx',
    );
    expect(await fs.pathExists(file)).toBe(true);
    const src = await fs.readFile(file, 'utf-8');
    expect(src).toContain('export interface ConsumerObligationsProps');
    expect(src).toContain('export function ConsumerObligations(');
    expect(src).toContain('obligations: ReadonlyArray<string | React.ReactNode>');
    // Reads from props, not from CEM — must NOT import customElements json.
    expect(src).not.toContain('@helixui/library/custom-elements.json');
    // Sanity: no unescaped backtick-content broke into the emitted source.
    expect(src).toContain("import * as React from 'react';");
  });

  it('emits InlineAuditPanel.tsx with consumer-overridable github base URL', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3a-inline-audit' });
    await scaffoldProject(opts);
    const file = path.join(opts.directory, 'src', 'stories', '_components', 'InlineAuditPanel.tsx');
    expect(await fs.pathExists(file)).toBe(true);
    const src = await fs.readFile(file, 'utf-8');
    expect(src).toContain('export interface InlineAuditPanelProps');
    expect(src).toContain('export function InlineAuditPanel(');
    // The githubBlobBase prop lets a consumer point at THEIR repo instead
    // of bookedsolidtech/helix — critical for downstream design systems.
    expect(src).toContain('githubBlobBase?:');
    // Default still points at upstream Helix (consumer can override).
    expect(src).toContain(
      'https://github.com/bookedsolidtech/helix/blob/main/packages/hx-library/',
    );
    expect(src).not.toContain('@helixui/library/custom-elements.json');
  });

  it('both Phase 3a emitters land in src/stories/_components/ together', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3a-both' });
    await scaffoldProject(opts);
    const componentsDir = path.join(opts.directory, 'src', 'stories', '_components');
    const entries = await fs.readdir(componentsDir);
    expect(entries).toContain('ConsumerObligations.tsx');
    expect(entries).toContain('InlineAuditPanel.tsx');
  });

  it('emitted source preserves backticks + ${} interpolation in the .tsx output', async () => {
    // The emitter uses template literals with manually escaped \${} and
    // \\\` sequences. Regression guard: the EMITTED file must contain
    // working `${...}` template-literal expressions in its JSX, not
    // double-escaped or stripped `\${...}` artifacts. Without this guard,
    // an editor pass that "fixes" the escaping in scaffold.ts could ship
    // a broken .tsx file that compiles in our scaffolder but fails in
    // the consumer's TypeScript build.
    const opts = makeWcStorybookOptions({ name: 'phase3a-escaping' });
    await scaffoldProject(opts);
    const consumerOblig = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', '_components', 'ConsumerObligations.tsx'),
      'utf-8',
    );
    // Should contain a valid ${tag} interpolation, NOT a literal \${tag}
    expect(consumerOblig).toContain('`Consumer obligations for ${tag}`');
    expect(consumerOblig).not.toContain('\\${tag}');

    const audit = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', '_components', 'InlineAuditPanel.tsx'),
      'utf-8',
    );
    // Two-segment ${} interpolation must reach the consumer un-mangled.
    expect(audit).toContain('`${githubBlobBase}${path}`');
    expect(audit).not.toContain('\\${githubBlobBase}');
  });
});

// ---------------------------------------------------------------------------
// Phase 3b — CEM-coupled docs cards + FOUC sync scripts
// ---------------------------------------------------------------------------

describe('wc-storybook Phase 3b — CEM-coupled docs cards', () => {
  it('emits APGPatternCard.tsx with helixMeta CEM lookup', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3b-apg' });
    await scaffoldProject(opts);
    const file = path.join(opts.directory, 'src', 'stories', '_components', 'APGPatternCard.tsx');
    expect(await fs.pathExists(file)).toBe(true);
    const src = await fs.readFile(file, 'utf-8');
    expect(src).toContain('export interface APGPatternCardProps');
    expect(src).toContain("import customElements from '@helixui/library/custom-elements.json'");
    expect(src).toContain('keyboardContract');
    expect(src).toContain('ariaPattern');
    // Defensive null return when no helixMeta is found — guard against
    // consumer-extended components that have not authored ARIA tags.
    expect(src).toContain('if (!decl) return null');
  });

  it('emits A11yStatusCard.tsx under .storybook/docs/', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3b-a11y-status' });
    await scaffoldProject(opts);
    const file = path.join(opts.directory, '.storybook', 'docs', 'A11yStatusCard.tsx');
    expect(await fs.pathExists(file)).toBe(true);
    const src = await fs.readFile(file, 'utf-8');
    expect(src).toContain('export interface A11yStatusCardProps');
    expect(src).toContain("import customElements from '@helixui/library/custom-elements.json'");
    // The 9 capability badges must all emit, even if their helixMeta
    // fields are unset (the badges themselves return null when truthy=false).
    for (const cap of [
      'Forced colors',
      'Form-associated',
      'Theme-aware',
      'Brand-aware',
      'Drupal SDC',
      'React wrapper',
      'Stability',
      'Since',
    ]) {
      expect(src).toContain(`label="${cap}"`);
    }
    // Tier tooltips (P0/P1/P2/Exempt) must all be present.
    for (const tier of ['P0', 'P1', 'P2', 'Exempt']) {
      expect(src).toContain(`${tier}:`);
    }
  });

  it('emits HelixDocsPage.tsx under .storybook/docs/ that references A11yStatusCard', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3b-docs-page' });
    await scaffoldProject(opts);
    const file = path.join(opts.directory, '.storybook', 'docs', 'HelixDocsPage.tsx');
    expect(await fs.pathExists(file)).toBe(true);
    const src = await fs.readFile(file, 'utf-8');
    expect(src).toContain('export function HelixDocsPage');
    expect(src).toContain("from './A11yStatusCard'");
    expect(src).toContain('<A11yStatusCard');
    // Tag regex must match consumer-extended components, not just hx-*.
    expect(src).toContain('/^[a-z][a-z0-9]*-[a-z0-9-]+$/');
    // Pulls from useOf('meta') — official addon-docs blocks API.
    expect(src).toContain("useOf('meta', ['meta'])");
  });

  it('all 3 Phase 3b docs cards survive the ${} round-trip escape test', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3b-escape-roundtrip' });
    await scaffoldProject(opts);

    const apg = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', '_components', 'APGPatternCard.tsx'),
      'utf-8',
    );
    expect(apg).toContain('`ARIA pattern walkthrough for ${tag}`');
    expect(apg).not.toContain('\\${tag}');

    const a11y = await fs.readFile(
      path.join(opts.directory, '.storybook', 'docs', 'A11yStatusCard.tsx'),
      'utf-8',
    );
    expect(a11y).toContain('`${REPO_BLOB_BASE}${aaa.auditUrl}`');
    expect(a11y).toContain("`${kc.activate.join(' / ')} activates`");
    expect(a11y).not.toContain('\\${REPO_BLOB_BASE}');
  });
});

describe('wc-storybook Phase 3b — FOUC sync scripts', () => {
  it('emits manager-head.html with URL → localStorage → light fallback chain', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3b-manager-fouc' });
    await scaffoldProject(opts);
    const file = path.join(opts.directory, '.storybook', 'manager-head.html');
    expect(await fs.pathExists(file)).toBe(true);
    const html = await fs.readFile(file, 'utf-8');
    expect(html).toContain("url.searchParams.has('globals')");
    expect(html).toContain("'helix:storybook:globals'");
    expect(html).toContain("if (!theme) theme = 'light'");
    expect(html).toContain("html.setAttribute('data-theme', theme)");
    expect(html).toContain('color-scheme: light dark');
  });

  it('emits preview-head.html with the same FOUC chain + per-mode pre-paint', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3b-preview-fouc' });
    await scaffoldProject(opts);
    const file = path.join(opts.directory, '.storybook', 'preview-head.html');
    expect(await fs.pathExists(file)).toBe(true);
    const html = await fs.readFile(file, 'utf-8');
    expect(html).toContain("url.searchParams.has('globals')");
    // Per-mode pre-paint background — the table-stakes anti-flash defense.
    expect(html).toContain('var(--hx-color-surface-default, #ffffff)');
    expect(html).toContain('var(--hx-color-surface-default, #0d1825)');
    expect(html).toContain('var(--hx-color-surface-default, #000000)');
  });

  it('manager + preview FOUC scripts share the same localStorage key', async () => {
    // Critical contract: manager-head.html and preview-head.html MUST
    // read from the same localStorage key (`helix:storybook:globals`),
    // otherwise the manager chrome and preview canvas drift on reload.
    const opts = makeWcStorybookOptions({ name: 'phase3b-fouc-storage-key' });
    await scaffoldProject(opts);
    const mgr = await fs.readFile(
      path.join(opts.directory, '.storybook', 'manager-head.html'),
      'utf-8',
    );
    const pv = await fs.readFile(
      path.join(opts.directory, '.storybook', 'preview-head.html'),
      'utf-8',
    );
    const KEY = "'helix:storybook:globals'";
    expect(mgr).toContain(KEY);
    expect(pv).toContain(KEY);
  });
});

// ---------------------------------------------------------------------------
// Phase 3c — manager.ts + manager-theme.ts + preview.ts rewrite + 3 CSS + ref MDX
// ---------------------------------------------------------------------------

describe('wc-storybook Phase 3c — manager-theme.ts + manager.ts', () => {
  it('emits manager-theme.ts wired to @helixui/tokens cascade', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-manager-theme' });
    await scaffoldProject(opts);
    const file = path.join(opts.directory, '.storybook', 'manager-theme.ts');
    expect(await fs.pathExists(file)).toBe(true);
    const src = await fs.readFile(file, 'utf-8');
    // The 4 exports manager.ts depends on must all be present.
    expect(src).toContain(
      "import { tokenEntries, darkTokenEntries, highContrastTokenEntries } from '@helixui/tokens'",
    );
    expect(src).toContain("import { resolveTokenRef } from '@helixui/tokens/utils'");
    expect(src).toContain('export const HELIX_THEME_MODES');
    expect(src).toContain('export type HelixThemeMode');
    expect(src).toContain('export function helixBackgroundsForMode');
    expect(src).toContain('export const helixChromeThemes');
    expect(src).toContain('export function coerceThemeMode');
    // Brand title interpolates the consumer's dsName.
    expect(src).toContain("brandTitle: 'Aurora Design System'");
  });

  it('emits manager.ts with boot-theme + GLOBALS_UPDATED listener', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-manager' });
    await scaffoldProject(opts);
    const file = path.join(opts.directory, '.storybook', 'manager.ts');
    expect(await fs.pathExists(file)).toBe(true);
    const src = await fs.readFile(file, 'utf-8');
    expect(src).toContain('resolveBootThemeMode');
    expect(src).toContain('GLOBALS_UPDATED');
    expect(src).toContain("from './manager-theme'");
    expect(src).toContain("addons.register('helix/manager-theme-sync'");
    // Sidebar engineering roots collapsed by default.
    expect(src).toContain('collapsedRoots');
  });

  it('manager-theme + manager FOUC scripts share the same localStorage key as preview', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-key-contract' });
    await scaffoldProject(opts);
    const mgrTs = await fs.readFile(path.join(opts.directory, '.storybook', 'manager.ts'), 'utf-8');
    const previewTs = await fs.readFile(
      path.join(opts.directory, '.storybook', 'preview.ts'),
      'utf-8',
    );
    const KEY = "'helix:storybook:globals'";
    expect(mgrTs).toContain(KEY);
    expect(previewTs).toContain(KEY);
  });
});

describe('wc-storybook Phase 3c — 3 CSS files copied from create-helix assets', () => {
  it('emits all 3 CSS files into .storybook/docs/', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-css' });
    await scaffoldProject(opts);
    const docs = path.join(opts.directory, '.storybook', 'docs');
    for (const f of ['a11y-card.css', 'brand-overrides.css', 'helix-docs.css']) {
      expect(await fs.pathExists(path.join(docs, f))).toBe(true);
    }
  });

  it('CSS files are real upstream content, not stub placeholders', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-css-real' });
    await scaffoldProject(opts);
    // helix-docs.css is the largest at 1319 LOC. A stub would be a single
    // line; if the bundled assets/wc-storybook/storybook-docs/ are intact
    // the real content lands.
    const helixDocs = await fs.readFile(
      path.join(opts.directory, '.storybook', 'docs', 'helix-docs.css'),
      'utf-8',
    );
    expect(helixDocs.length).toBeGreaterThan(5000);
    expect(helixDocs).not.toContain('Placeholder');
  });
});

describe('wc-storybook Phase 3c — preview.ts rewrite', () => {
  it('imports the 3 CSS files + manager-theme + HelixDocsPage', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-preview-imports' });
    await scaffoldProject(opts);
    const src = await fs.readFile(path.join(opts.directory, '.storybook', 'preview.ts'), 'utf-8');
    expect(src).toContain("import './docs/helix-docs.css'");
    expect(src).toContain("import './docs/brand-overrides.css'");
    expect(src).toContain("import './docs/a11y-card.css'");
    expect(src).toContain("from './manager-theme'");
    expect(src).toContain("from './docs/HelixDocsPage'");
  });

  it('wires HelixDocsPage as parameters.docs.page (auto-injection)', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-docs-page' });
    await scaffoldProject(opts);
    const src = await fs.readFile(path.join(opts.directory, '.storybook', 'preview.ts'), 'utf-8');
    // The single-line wire: `page: HelixDocsPage,` inside parameters.docs
    expect(src).toMatch(/docs:\s*\{[\s\S]*page:\s*HelixDocsPage/);
  });

  it('storySort lists Cover → Overview → Foundations editorial-first', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-storysort' });
    await scaffoldProject(opts);
    const src = await fs.readFile(path.join(opts.directory, '.storybook', 'preview.ts'), 'utf-8');
    // Cover MUST come before Components in the storySort order array.
    const coverIdx = src.indexOf("'Cover'");
    const componentsIdx = src.indexOf("'Components'");
    expect(coverIdx).toBeGreaterThan(0);
    expect(componentsIdx).toBeGreaterThan(coverIdx);
  });

  it('initialGlobals hydrates from localStorage with URL-globals-as-authoritative', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-globals' });
    await scaffoldProject(opts);
    const src = await fs.readFile(path.join(opts.directory, '.storybook', 'preview.ts'), 'utf-8');
    // The URL precedence is the load-bearing contract — without it, deep
    // links like ?globals=theme:dark silently resurrect stored brand.
    expect(src).toContain("searchParams.has('globals')");
    expect(src).toContain('if (!urlHasGlobals)');
  });

  it('brand persistence decorator writes to helix:storybook:globals', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-brand-persist' });
    await scaffoldProject(opts);
    const src = await fs.readFile(path.join(opts.directory, '.storybook', 'preview.ts'), 'utf-8');
    expect(src).toContain('localStorage.setItem');
    expect(src).toContain('helix:storybook:globals');
    expect(src).toContain("setAttribute('data-brand', brand)");
  });
});

describe('wc-storybook Phase 3c — reference {ds}-button.mdx', () => {
  it('emits aurora-button.mdx with the configured dsName', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-ref-mdx' });
    await scaffoldProject(opts);
    const file = path.join(opts.directory, 'src', 'stories', 'components', 'aurora-button.mdx');
    expect(await fs.pathExists(file)).toBe(true);
  });

  it('reference MDX imports the React docs cards from the right paths', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-ref-mdx-imports' });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'components', 'aurora-button.mdx'),
      'utf-8',
    );
    expect(src).toContain("from '../_components/APGPatternCard'");
    expect(src).toContain("from '../_components/ConsumerObligations'");
    expect(src).toContain("from '../../.storybook/docs/A11yStatusCard'");
    expect(src).toContain('<A11yStatusCard tag="aurora-button" />');
    expect(src).toContain('<APGPatternCard tag="aurora-button" />');
  });

  it('reference MDX uses brandTagline when provided', async () => {
    const opts = makeWcStorybookOptions({
      name: 'phase3c-ref-mdx-tagline',
      brandTagline: 'Calm finance for everyone.',
    });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'components', 'aurora-button.mdx'),
      'utf-8',
    );
    expect(src).toContain('> Calm finance for everyone.');
  });

  it('reference MDX uses heroScenarios[0] when matched by componentId', async () => {
    const opts = makeWcStorybookOptions({
      name: 'phase3c-ref-mdx-hero',
      heroScenarios: [
        {
          componentId: 'aurora-button',
          title: 'Confirm withdrawal',
          body: 'A destructive action requires confirmation; the primary button reads as a real product moment.',
        },
      ],
    });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'components', 'aurora-button.mdx'),
      'utf-8',
    );
    expect(src).toContain('## Hero scene — Confirm withdrawal');
    expect(src).toContain('A destructive action requires confirmation');
  });

  it('reference MDX falls back to neutral default when no heroScenarios', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-ref-mdx-default' });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'components', 'aurora-button.mdx'),
      'utf-8',
    );
    // Neutral default is the 'Sign in to your workspace' scene.
    expect(src).toContain('Sign in to your workspace');
  });
});
