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

  it('config exports HelixStorybookConfig type with the 3 runtime knob keys', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-config-shape' });
    await scaffoldProject(opts);
    const cfg = await fs.readFile(path.join(opts.directory, 'helix.storybook.config.ts'), 'utf-8');
    expect(cfg).toContain('export interface HelixStorybookConfig');
    expect(cfg).toContain('export type BrandKey');
    // The 3 top-level keys that have actual runtime consumers. `docs` and
    // `narrative` were removed in the rea-review fix because they were
    // scaffold-time-only knobs without a runtime path — leaving them in
    // the config shipped a broken public API where consumer edits had no
    // effect on the generated Storybook.
    for (const key of ['components', 'brand', 'aaa']) {
      expect(cfg).toContain(`${key}:`);
    }
    // Removed knobs MUST NOT appear in the emitted config.
    expect(cfg).not.toContain('export type DocsPageId');
    expect(cfg).not.toContain('export type NarrativePageId');
  });

  it('default config is "everything visible" (bundles=all → include: all)', async () => {
    const opts = makeWcStorybookOptions({
      name: 'phase2-config-default',
      componentBundles: ['all'],
    });
    await scaffoldProject(opts);
    const cfg = await fs.readFile(path.join(opts.directory, 'helix.storybook.config.ts'), 'utf-8');
    expect(cfg).toMatch(/components:\s*{\s*include:\s*'all',\s*exclude:\s*\[\]\s*}/);
    expect(cfg).toMatch(/brand:\s*{\s*include:\s*'all',\s*exclude:\s*\[\]\s*}/);
    expect(cfg).toMatch(/aaa:\s*{\s*enabled:\s*true\s*}/);
  });

  it('narrowed bundles seed components.include as an explicit array', async () => {
    // When the consumer picked anything narrower than `--bundles all`,
    // the catalog generator must filter to that subset — otherwise the
    // bundle prompt is a no-op for wc-storybook and the consumer sees
    // every hx-* tag even when they explicitly opted out of most of
    // them. (Codex round-10 P2.)
    const opts = makeWcStorybookOptions({
      name: 'phase2-config-bundles',
      componentBundles: ['core', 'forms'],
    });
    await scaffoldProject(opts);
    const cfg = await fs.readFile(path.join(opts.directory, 'helix.storybook.config.ts'), 'utf-8');
    // Anchor on the config declaration so this assertion is robust to
    // docstring examples elsewhere in the emitted file (which mention
    // `include: 'all'` as the override syntax).
    expect(cfg).toMatch(/const config: HelixStorybookConfig = {\s*components:\s*{\s*include:\s*\[/);
    // JSON.stringify emits double-quoted strings inside the array literal.
    expect(cfg).toMatch(/"hx-button"/);
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

  it('HIPAA-adjacency regex covers healthcare-vertical component names', async () => {
    // Earlier the regex only matched PHI/PII privacy markers, so HELiX-
    // upstream healthcare tags like hx-patient-banner / hx-clinical-status
    // slipped past the filter and shipped in the default scaffold catalog.
    // Anchoring on the vertical names plugs that leak.
    const opts = makeWcStorybookOptions({ name: 'phase2-catalog-hipaa-broad' });
    await scaffoldProject(opts);
    const helpers = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', '_catalog-helpers.ts'),
      'utf-8',
    );
    expect(helpers).toContain('phi|pii|protected|sensitive');
    expect(helpers).toContain('patient|clinic|clinical|medical');
    expect(helpers).toContain('prescription|medication|consent|intake');
    expect(helpers).toContain('diagnosis|treatment|symptom');
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

  it('emits InlineAuditPanel.tsx as an opt-in no-op stub (Phase 1 lift)', async () => {
    // Phase 1 of the shimmying-roaming-kernighan plan replaced the prior
    // live-port InlineAuditPanel (which read AAA-AUDIT.md via Vite's `?raw`
    // from a monorepo-internal path) with an opt-in stub. The component
    // still ships under the same import path so existing MDX imports keep
    // working, but renders nothing unless the consumer passes their own
    // `markdown` prop.
    const opts = makeWcStorybookOptions({ name: 'phase3a-inline-audit' });
    await scaffoldProject(opts);
    const file = path.join(opts.directory, 'src', 'stories', '_components', 'InlineAuditPanel.tsx');
    expect(await fs.pathExists(file)).toBe(true);
    const src = await fs.readFile(file, 'utf-8');
    expect(src).toContain('export interface InlineAuditPanelProps');
    expect(src).toContain('export function InlineAuditPanel(');
    // Stub contract: opt-in markdown prop; renders null when omitted.
    expect(src).toContain('markdown?:');
    expect(src).toContain('opt-in stub');
    // CEM coupling never belonged here — keep the negative assertion.
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
    // Phase 1 stub: the surviving template-literal interpolation is the
    // aria-label `Inline AAA audit for ${tag}`. Assert it reaches the
    // consumer un-mangled (no \${...} escape artifact). The previous
    // `${githubBlobBase}${path}` URL-construction expression was removed
    // when the github "View on GitHub" footer left with the live impl.
    expect(audit).toContain('`Inline AAA audit for ${tag}`');
    expect(audit).not.toContain('\\${tag}');
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
    // Both A11yStatusCard and APGPatternCard now look up tags in BOTH
    // the consumer's local CEM (../../../custom-elements.json) AND
    // upstream Helix's CEM. Local takes precedence so locally-extended
    // tags like ${ds}-button resolve to the consumer's declarations
    // first, with Helix as the fallback for catalog (HELiX/*) pages.
    expect(src).toContain("import localCustomElements from '../../../custom-elements.json'");
    expect(src).toContain(
      "import helixCustomElements from '@helixui/library/custom-elements.json'",
    );
    expect(src).toContain('keyboardContract');
    expect(src).toContain('ariaPattern');
    // Defensive null return when no helixMeta is found — guard against
    // consumer-extended components that have not authored ARIA tags.
    expect(src).toContain('if (!decl) return null');
  });

  it('emits A11yStatusCard.tsx under src/stories/_components/ (Phase 5 fix — Vite resolution)', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3b-a11y-status' });
    await scaffoldProject(opts);
    // Phase 5 — moved out of `.storybook/docs/` because Vite's
    // import-analysis can't resolve into `.storybook/` from src/ MDX.
    // See test 'aurora-button.mdx imports A11yStatusCard via _components/'.
    const file = path.join(opts.directory, 'src', 'stories', '_components', 'A11yStatusCard.tsx');
    expect(await fs.pathExists(file)).toBe(true);
    const src = await fs.readFile(file, 'utf-8');
    expect(src).toContain('export interface A11yStatusCardProps');
    // Both A11yStatusCard and APGPatternCard now look up tags in BOTH
    // the consumer's local CEM (../../../custom-elements.json) AND
    // upstream Helix's CEM. Local takes precedence so locally-extended
    // tags like ${ds}-button resolve to the consumer's declarations
    // first, with Helix as the fallback for catalog (HELiX/*) pages.
    expect(src).toContain("import localCustomElements from '../../../custom-elements.json'");
    expect(src).toContain(
      "import helixCustomElements from '@helixui/library/custom-elements.json'",
    );
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
    // Phase 5 fix: import points across to src/stories/_components/ since
    // A11yStatusCard moved out of .storybook/.
    expect(src).toContain("from '../../src/stories/_components/A11yStatusCard'");
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
      path.join(opts.directory, 'src', 'stories', '_components', 'A11yStatusCard.tsx'),
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

  it('darkMode:true emits all three theme modes (light, dark, high-contrast)', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-darkmode-on', darkMode: true });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, '.storybook', 'manager-theme.ts'),
      'utf-8',
    );
    expect(src).toContain("HELIX_THEME_MODES = ['light', 'dark', 'high-contrast']");
  });

  it('darkMode:false collapses the theme array to light only', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3c-darkmode-off', darkMode: false });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, '.storybook', 'manager-theme.ts'),
      'utf-8',
    );
    // Honors the consumer's --no-dark-mode flag — dark + high-contrast
    // are dropped from the emitted theme table. Prior behavior shipped
    // all three regardless of the flag.
    expect(src).toContain("HELIX_THEME_MODES = ['light']");
    expect(src).not.toContain("HELIX_THEME_MODES = ['light', 'dark', 'high-contrast']");
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
    // Phase 5 fix — A11yStatusCard moved to _components/ for Vite resolution.
    expect(src).toContain("from '../_components/A11yStatusCard'");
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

// ---------------------------------------------------------------------------
// Phase 4 — Cover + Overview + foundations + patterns narrative IA
// ---------------------------------------------------------------------------

describe('wc-storybook Phase 4 — narrative MDX emitters', () => {
  it('emits Cover.mdx with the correct Meta title', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-cover' });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'Cover.mdx'),
      'utf-8',
    );
    expect(src).toContain('<Meta title="Welcome/Cover" />');
    // Cover renders the dsTitle as the hero eyebrow ("Aurora Design
    // System") inside the .hx-cover-hero block. The previous bare
    // `# Aurora` H1 was replaced when the hero block became the
    // canonical title treatment.
    expect(src).toContain('Aurora Design System');
    expect(src).toContain('hx-cover-hero-eyebrow');
  });

  it('Cover.mdx surfaces brandTagline inside the cover hero block', async () => {
    const opts = makeWcStorybookOptions({
      name: 'phase4-cover-tagline',
      brandTagline: 'Calm finance for everyone.',
    });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'Cover.mdx'),
      'utf-8',
    );
    // The tagline now renders as the .hx-cover-hero-tagline display
    // copy inside the gradient hero block, replacing the previous bare
    // `> _Calm finance for everyone._` blockquote (which had no visual
    // hierarchy / brand color and read as a quoted citation).
    expect(src).toContain('hx-cover-hero-tagline');
    expect(src).toContain('Calm finance for everyone.');
  });

  it('Cover.mdx renders brandVerticals as chip row when provided', async () => {
    const opts = makeWcStorybookOptions({
      name: 'phase4-cover-verticals',
      brandVerticals: ['fintech', 'wellness'],
    });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'Cover.mdx'),
      'utf-8',
    );
    expect(src).toContain('>fintech<');
    expect(src).toContain('>wellness<');
  });

  it('Cover.mdx omits the chip row when brandVerticals is empty (single-brand mode)', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-cover-single' });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'Cover.mdx'),
      'utf-8',
    );
    // No padding-chip span pattern when verticals is empty/undefined.
    expect(src).not.toContain("borderRadius: '999px'");
  });

  it('emits Overview.mdx explaining the three-tier cascade', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-overview' });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'Overview.mdx'),
      'utf-8',
    );
    expect(src).toContain('<Meta title="Welcome/Overview" />');
    // The 3 tiers: primitive, semantic, component.
    expect(src).toContain('Primitive ramps');
    expect(src).toContain('Semantic aliases');
    expect(src).toContain('Component overrides');
  });

  it('emits all 7 foundations MDX pages with correct titles', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-foundations' });
    await scaffoldProject(opts);
    const expected: Array<[string, string]> = [
      ['Tokens.mdx', 'Foundations/Tokens'],
      ['Color.mdx', 'Foundations/Color'],
      ['Typography.mdx', 'Foundations/Typography'],
      ['Spacing.mdx', 'Foundations/Spacing'],
      ['Layout.mdx', 'Foundations/Layout'],
      ['Brand.mdx', 'Foundations/Brand'],
      ['Accessibility.mdx', 'Foundations/Accessibility'],
    ];
    for (const [file, title] of expected) {
      const fp = path.join(opts.directory, 'src', 'stories', 'foundations', file);
      expect(await fs.pathExists(fp)).toBe(true);
      const src = await fs.readFile(fp, 'utf-8');
      expect(src).toContain(`<Meta title="${title}" />`);
    }
  });

  it('Brand.mdx surfaces the consumer tokenPrefix in override examples', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-brand-prefix' });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'foundations', 'Brand.mdx'),
      'utf-8',
    );
    // tokenPrefix='--ar' should appear in the CSS override example.
    expect(src).toContain('--ar-color-primary');
  });

  it('Tokens.mdx surfaces the consumer tokenPrefix in the cascade explainer', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-tokens-prefix' });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'foundations', 'Tokens.mdx'),
      'utf-8',
    );
    expect(src).toContain('--ar-color-primary');
    // Cascade still references --hx-* primitives + semantics
    expect(src).toContain('--hx-color-primary-600');
    expect(src).toContain('--hx-color-action-primary-bg');
  });

  it('emits patterns/Index.mdx with the dsName-aware suggestions', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-patterns' });
    await scaffoldProject(opts);
    const src = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'patterns', 'Index.mdx'),
      'utf-8',
    );
    expect(src).toContain('<Meta title="Welcome/Patterns" />');
    // dsName='aurora' should surface in the Forms suggestion.
    expect(src).toContain('aurora-button');
  });

  it('Cover + Overview + 7 foundations + patterns/Index = 10 narrative MDX files', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-count' });
    await scaffoldProject(opts);
    const stories = path.join(opts.directory, 'src', 'stories');
    const allMdx = [
      path.join(stories, 'Cover.mdx'),
      path.join(stories, 'Overview.mdx'),
      path.join(stories, 'foundations', 'Tokens.mdx'),
      path.join(stories, 'foundations', 'Color.mdx'),
      path.join(stories, 'foundations', 'Typography.mdx'),
      path.join(stories, 'foundations', 'Spacing.mdx'),
      path.join(stories, 'foundations', 'Layout.mdx'),
      path.join(stories, 'foundations', 'Brand.mdx'),
      path.join(stories, 'foundations', 'Accessibility.mdx'),
      path.join(stories, 'patterns', 'Index.mdx'),
    ];
    for (const fp of allMdx) {
      expect(await fs.pathExists(fp)).toBe(true);
    }
  });

  it('narrative MDX binds tokens via hx-narrative-* classes (Phase 5 v2 — CSS classes, not inline styles)', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-live-tokens' });
    await scaffoldProject(opts);
    // Phase 5 v2 — narrative MDX uses className="hx-narrative-*" rather
    // than inline style={{...}} with var() expressions. The token binding
    // happens in the bundled helix-narrative.css; assert the className
    // contract holds across Cover, Overview, and the foundation pages.
    const cover = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'Cover.mdx'),
      'utf-8',
    );
    expect(cover).toContain('hx-narrative-grid');
    expect(cover).toContain('hx-narrative-card');

    const overview = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'Overview.mdx'),
      'utf-8',
    );
    expect(overview).toContain('hx-narrative-card-title');

    // Brand.mdx STILL surfaces the consumer tokenPrefix — it appears in
    // the CSS override-pattern code block, not in inline JSX styles.
    const brand = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'foundations', 'Brand.mdx'),
      'utf-8',
    );
    expect(brand).toContain('--ar-color-primary');
  });

  it('helix-narrative.css ships in the consumer scaffold', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase5-narrative-css' });
    await scaffoldProject(opts);
    const cssFile = path.join(opts.directory, '.storybook', 'docs', 'helix-narrative.css');
    expect(await fs.pathExists(cssFile)).toBe(true);
    const css = await fs.readFile(cssFile, 'utf-8');
    // The class library must define each of the classes Phase 4 MDX uses.
    for (const cls of [
      '.hx-narrative-grid',
      '.hx-narrative-card',
      '.hx-narrative-card-title',
      '.hx-narrative-card-body',
      '.hx-narrative-chip',
      '.hx-narrative-table',
    ]) {
      expect(css).toContain(cls);
    }
    // Every color-binding rule must use var() so the consumer's tokens.css
    // (and brand override layer) drive the visual.
    expect(css).toContain('var(--hx-color-text-primary');
    expect(css).toContain('var(--hx-color-surface-default');
    expect(css).toContain('var(--hx-color-border-subtle');
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — shimmying-roaming-kernighan plan
//
// Port of 7 helix React helpers (TokenSwatchGrid, ContrastMatrix, RatioCard,
// CodeBlock, CodeTabs, useResolvedToken, contrast) plus TokenRef (transitive
// dependency of ContrastMatrix) into a new emitter module at
// src/scaffold/wc-storybook/helpers.ts. InlineAuditPanel emission is
// replaced with an opt-in no-op stub.
// ---------------------------------------------------------------------------

import {
  contrastSrc as helperContrastSrc,
  useResolvedTokenSrc as helperUseResolvedTokenSrc,
  tokenSwatchGridSrc as helperTokenSwatchGridSrc,
  contrastMatrixSrc as helperContrastMatrixSrc,
} from '../scaffold/wc-storybook/helpers.js';
import { inlineAuditPanelStubSrc } from '../scaffold/wc-storybook/audit-stub.js';
import { getTemplate } from '../templates.js';

describe('wc-storybook Phase 1 — ported React helpers', () => {
  it('emits all 8 helper files into src/stories/_components/ with non-empty content', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase1-helpers' });
    await scaffoldProject(opts);
    const docs = path.join(opts.directory, 'src', 'stories', '_components');
    const files = [
      'contrast.ts',
      'useResolvedToken.ts',
      'RatioCard.tsx',
      'TokenSwatchGrid.tsx',
      'TokenRef.tsx',
      'CodeBlock.tsx',
      'CodeTabs.tsx',
      'ContrastMatrix.tsx',
    ];
    for (const fname of files) {
      const fp = path.join(docs, fname);
      expect(await fs.pathExists(fp), `${fname} should exist`).toBe(true);
      const src = await fs.readFile(fp, 'utf-8');
      // Sanity: every helper has meaningful content (not a 0-byte stub).
      expect(src.length, `${fname} should be non-empty`).toBeGreaterThan(200);
    }
  });

  it('stub InlineAuditPanel.tsx renders nothing by default and has no monorepo-path imports', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase1-stub' });
    await scaffoldProject(opts);
    const fp = path.join(opts.directory, 'src', 'stories', '_components', 'InlineAuditPanel.tsx');
    expect(await fs.pathExists(fp)).toBe(true);
    const src = await fs.readFile(fp, 'utf-8');
    // Stub contract markers from audit-stub.ts.
    expect(src).toContain('opt-in stub');
    expect(src).toContain('renders nothing by default');
    // Critical: no Vite ?raw monorepo imports and no packages/hx-library
    // path references survive the port.
    expect(src).not.toContain('?raw');
    expect(src).not.toContain('packages/hx-library');
    // The body MUST early-return null when markdown is absent.
    expect(src).toContain('if (!markdown) return null;');
  });

  it('Shiki ships as a wc-storybook devDependency', () => {
    const template = getTemplate('wc-storybook');
    expect(template).toBeDefined();
    const devDeps = (template?.devDependencies ?? {}) as Record<string, string>;
    expect(devDeps.shiki).toBeDefined();
    // Pinned at the same major as helix/apps/storybook (^4.0.2) so the
    // grammar / theme exports the CodeBlock helper consumes stay aligned.
    expect(devDeps.shiki).toMatch(/^\^?4\./);
  });
});

describe('wc-storybook Phase 1 — helpers.ts emitter module', () => {
  it('tokenSwatchGridSrc() imports cssColorToHex from ./contrast and useResolvedTokens from ./useResolvedToken', () => {
    const src = helperTokenSwatchGridSrc();
    expect(src).toContain("import { cssColorToHex } from './contrast'");
    expect(src).toContain("import { useResolvedTokens } from './useResolvedToken'");
    // Hardcoded --hx-color- prefix is intentional — upstream HelixUI
    // namespace, not the consumer's brand prefix.
    expect(src).toContain('--hx-color-');
  });

  it('contrastSrc() exports the contrast utility surface (cssColorToHex, contrastRatio, gradeRatio)', () => {
    const src = helperContrastSrc();
    expect(src).toContain('export function cssColorToHex');
    expect(src).toContain('export function contrastRatio');
    expect(src).toContain('export function gradeRatio');
  });

  it('useResolvedTokenSrc() exports useResolvedToken + useResolvedTokens + readResolvedToken hooks', () => {
    const src = helperUseResolvedTokenSrc();
    expect(src).toContain('export function useResolvedToken');
    expect(src).toContain('export function useResolvedTokens');
    expect(src).toContain('export function readResolvedToken');
  });

  it('contrastMatrixSrc() imports the published @helixui/tokens/contrast-data subpath (not a monorepo path)', () => {
    const src = helperContrastMatrixSrc();
    expect(src).toContain("import { contrastReport } from '@helixui/tokens/contrast-data';");
    // Never via Vite ?raw or a packages/* monorepo path.
    expect(src).not.toContain('?raw');
    expect(src).not.toContain('packages/');
    // Transitive deps wired correctly.
    expect(src).toContain("import { TokenRef } from './TokenRef';");
    expect(src).toContain("import { contrastRatio, cssColorToHex } from './contrast';");
  });

  it('inlineAuditPanelStubSrc() emits the React no-op stub contract', () => {
    const src = inlineAuditPanelStubSrc();
    expect(src).toContain('opt-in stub');
    expect(src).toContain('export function InlineAuditPanel');
    // The stub MUST early-return null when markdown is absent.
    expect(src).toContain('if (!markdown) return null;');
    expect(src).not.toContain('?raw');
    expect(src).not.toContain('packages/hx-library');
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — 7 component conformance MDXes
//
// Validates the new src/scaffold/wc-storybook/mdx-components.ts module:
// emits one MDX per ported helix component with tag-name + class-name
// substitution, no ?raw / monorepo paths leak through, and the title
// taxonomy matches Components/{DsClass}*/Conformance per the existing
// button MDX pattern.
// ---------------------------------------------------------------------------

const PHASE2_COMPONENTS = [
  'card',
  'checkbox',
  'dialog',
  'form',
  'select',
  'tabs',
  'text-input',
] as const;

const PHASE2_PASCAL_BY_TAG: Record<(typeof PHASE2_COMPONENTS)[number], string> = {
  card: 'Card',
  checkbox: 'Checkbox',
  dialog: 'Dialog',
  form: 'Form',
  select: 'Select',
  tabs: 'Tabs',
  'text-input': 'TextInput',
};

describe('wc-storybook Phase 2 — 7 component conformance MDXes', () => {
  for (const component of PHASE2_COMPONENTS) {
    it(`emits src/stories/components/aurora-${component}.mdx`, async () => {
      const opts = makeWcStorybookOptions({ name: `phase2-${component}-emits` });
      await scaffoldProject(opts);
      const fp = path.join(
        opts.directory,
        'src',
        'stories',
        'components',
        `aurora-${component}.mdx`,
      );
      expect(await fs.pathExists(fp), `aurora-${component}.mdx should exist`).toBe(true);
      const src = await fs.readFile(fp, 'utf-8');
      // Sanity: meaningful content, not a 0-byte stub.
      expect(src.length, `aurora-${component}.mdx should be non-empty`).toBeGreaterThan(500);
    });
  }

  for (const component of PHASE2_COMPONENTS) {
    it(`aurora-${component}.mdx renders <hx-${component}> live demos (round-7 revert)`, async () => {
      // Round-7 codex-review correction: Phase 2 originally substituted
      // every live tag to <${ds}-${component}>, but the scaffolder only
      // emits ONE wrapper (${ds}-button). The other six MDX pages
      // (card, checkbox, dialog, form, select, tabs, text-input) would
      // render undefined custom elements at runtime. The fix:
      //
      //  - Live HTML/JSX tags in code blocks → revert to upstream hx-*
      //    literals (which @helixui/library registers on import).
      //  - APGPatternCard tag={"..."} → revert to hx-* (it reads CEM by
      //    tag name).
      //  - File names (aurora-${component}.mdx) and conceptual class-
      //    name references (AuroraCard, AuroraDialog) stay parameterized
      //    because those describe the consumer's eventual wrapper, not
      //    the live demo.
      const opts = makeWcStorybookOptions({ name: `phase2-${component}-tag` });
      await scaffoldProject(opts);
      const fp = path.join(
        opts.directory,
        'src',
        'stories',
        'components',
        `aurora-${component}.mdx`,
      );
      const src = await fs.readFile(fp, 'utf-8');
      // Positive: the live demo MUST use the upstream hx-* tag, since the
      // scaffold registers the upstream library elements but not a
      // matching aurora-* wrapper for components other than button.
      expect(src).toMatch(new RegExp(`<hx-${component}\\b`));
      // Negative: a stray live aurora-${component} tag would render an
      // undefined custom element in the consumer's Storybook. The
      // scaffolded MDX must not emit one.
      expect(src).not.toMatch(new RegExp(`<aurora-${component}\\b`));
    });
  }

  it('all 7 emitted MDXes contain zero forbidden monorepo / Vite ?raw / dropped-component references', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-forbidden-strings' });
    await scaffoldProject(opts);
    const dir = path.join(opts.directory, 'src', 'stories', 'components');
    const forbidden = [
      '?raw',
      'packages/hx-library',
      'apps/storybook/scripts',
      'AAAConformanceCard',
    ];
    for (const component of PHASE2_COMPONENTS) {
      const fp = path.join(dir, `aurora-${component}.mdx`);
      const src = await fs.readFile(fp, 'utf-8');
      for (const needle of forbidden) {
        expect(
          src.includes(needle),
          `aurora-${component}.mdx must not contain forbidden string "${needle}"`,
        ).toBe(false);
      }
    }
  });

  it('all 7 emitted MDX titles are namespaced under Components/{DsClass}*/Conformance', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-titles' });
    await scaffoldProject(opts);
    const dir = path.join(opts.directory, 'src', 'stories', 'components');
    for (const component of PHASE2_COMPONENTS) {
      const fp = path.join(dir, `aurora-${component}.mdx`);
      const src = await fs.readFile(fp, 'utf-8');
      const expectedPascal = PHASE2_PASCAL_BY_TAG[component];
      expect(
        src,
        `aurora-${component}.mdx should declare a Components/Aurora${expectedPascal} title`,
      ).toContain(`<Meta title="Components/Aurora${expectedPascal}/Conformance" />`);
    }
  });

  it('class-name substitution: dsName=aurora produces AuroraCard (not HxCard) in card MDX', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase2-class-sub' });
    await scaffoldProject(opts);
    const fp = path.join(opts.directory, 'src', 'stories', 'components', 'aurora-card.mdx');
    const src = await fs.readFile(fp, 'utf-8');
    // Positive: scaffolded class form appears (heading + variant-gallery reference).
    expect(src).toContain('AuroraCard');
    // Negative: literal helix class form did NOT leak.
    expect(src).not.toContain('HxCard');
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — 8 accessibility narrative MDXes + _snippets.ts
//
// Validates the new src/scaffold/wc-storybook/mdx-accessibility/ split:
// emits the 8 narrative pages plus the _snippets.ts module under
// src/stories/accessibility/, all titled `Accessibility/*`, no monorepo
// links or healthcare keywords leak through, and the storySort emission
// in .storybook/preview.ts surfaces the new top-level Accessibility
// namespace between Foundations and Components.
// ---------------------------------------------------------------------------

const PHASE3_PAGES = [
  'AAAStoryTemplate',
  'ConsumerObligations',
  'ContrastDeepDive',
  'Dashboard',
  'FocusManagement',
  'ForcedColors',
  'KeyboardContracts',
  'SuccessCriteria',
] as const;

const PHASE3_TITLE_BY_PAGE: Record<(typeof PHASE3_PAGES)[number], string> = {
  AAAStoryTemplate: 'Accessibility/AAA Story Template',
  ConsumerObligations: 'Accessibility/Consumer Obligations',
  ContrastDeepDive: 'Accessibility/Contrast Deep-Dive',
  Dashboard: 'Accessibility/Dashboard',
  FocusManagement: 'Accessibility/Focus Management',
  ForcedColors: 'Accessibility/Forced Colors',
  KeyboardContracts: 'Accessibility/Keyboard Contracts',
  SuccessCriteria: 'Accessibility/Success Criteria',
};

describe('wc-storybook Phase 3 — 8 accessibility narrative MDXes', () => {
  for (const page of PHASE3_PAGES) {
    it(`emits src/stories/accessibility/${page}.mdx`, async () => {
      const opts = makeWcStorybookOptions({ name: `phase3-${page.toLowerCase()}-emits` });
      await scaffoldProject(opts);
      const fp = path.join(opts.directory, 'src', 'stories', 'accessibility', `${page}.mdx`);
      expect(await fs.pathExists(fp), `${page}.mdx should exist`).toBe(true);
      const src = await fs.readFile(fp, 'utf-8');
      // Sanity: meaningful content, not a 0-byte stub.
      expect(src.length, `${page}.mdx should be non-empty`).toBeGreaterThan(500);
    });
  }

  it('emits _snippets.ts alongside the 8 MDXes', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3-snippets-emits' });
    await scaffoldProject(opts);
    const fp = path.join(opts.directory, 'src', 'stories', 'accessibility', '_snippets.ts');
    expect(await fs.pathExists(fp), '_snippets.ts should exist').toBe(true);
    const src = await fs.readFile(fp, 'utf-8');
    // Sanity: the eight named code-string constants the MDXes import.
    for (const named of [
      'FORCED_COLORS_BUTTON_CSS',
      'FORCED_COLORS_DONT_CSS',
      'FORCED_COLORS_DO_CSS',
      'FOCUS_RING_CSS',
      'DIALOG_HTML',
      'DIALOG_TS',
      'ROVING_TABINDEX_TS',
      'TABS_KEYDOWN_TS',
      'CONTRAST_RATIO_TS',
      'REGENERATE_CONTRAST_BASH',
    ]) {
      expect(src).toContain(`export const ${named}`);
    }
  });

  it('all 8 emitted MDXes contain zero forbidden monorepo paths or healthcare keywords', async () => {
    // Per shimmying-roaming-kernighan plan, Phase 3 hold condition: broken
    // monorepo links shipped to consumers > missing pages. Healthcare-vertical
    // copy is forbidden per `feedback_realistic_sample_data`.
    const opts = makeWcStorybookOptions({ name: 'phase3-forbidden-strings' });
    await scaffoldProject(opts);
    const dir = path.join(opts.directory, 'src', 'stories', 'accessibility');
    const forbidden = [
      '?raw',
      'packages/hx-library',
      'apps/storybook/scripts',
      'aaa-standards.json',
      // Healthcare keywords — none of these may appear in emitted body content.
      // Match whole words: `provider` excluded (allowed if it appears in a
      // generic SaaS sense like "service provider"); the upstream uses are
      // healthcare-specific ("provider-dashboard"), so we check the more
      // domain-locked terms: patient, MRN, clinic, intake.
      'patient',
      'MRN',
      'clinic',
      'intake',
    ];
    const allFiles = [...PHASE3_PAGES.map((p) => `${p}.mdx`), '_snippets.ts'];
    for (const fileName of allFiles) {
      const fp = path.join(dir, fileName);
      const src = await fs.readFile(fp, 'utf-8');
      for (const needle of forbidden) {
        expect(
          src.includes(needle),
          `${fileName} must not contain forbidden string "${needle}"`,
        ).toBe(false);
      }
    }
  });

  it('all 8 page titles are namespaced under Accessibility/*', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3-titles' });
    await scaffoldProject(opts);
    const dir = path.join(opts.directory, 'src', 'stories', 'accessibility');
    for (const page of PHASE3_PAGES) {
      const fp = path.join(dir, `${page}.mdx`);
      const src = await fs.readFile(fp, 'utf-8');
      const expectedTitle = PHASE3_TITLE_BY_PAGE[page];
      expect(src, `${page}.mdx should declare title="${expectedTitle}"`).toContain(
        `title="${expectedTitle}"`,
      );
    }
  });

  it('Accessibility/Consumer Obligations PAGE coexists with the ConsumerObligations TSX COMPONENT', async () => {
    // Disambiguation test — the upstream collision the plan flagged. The
    // PAGE lives under accessibility/ConsumerObligations.mdx with title
    // 'Accessibility/Consumer Obligations' (note the SPACE). The COMPONENT
    // lives under _components/ConsumerObligations.tsx and is imported by
    // every Phase 2 component MDX. Both must be present and unambiguous.
    const opts = makeWcStorybookOptions({ name: 'phase3-collision' });
    await scaffoldProject(opts);
    const pageFp = path.join(
      opts.directory,
      'src',
      'stories',
      'accessibility',
      'ConsumerObligations.mdx',
    );
    const componentFp = path.join(
      opts.directory,
      'src',
      'stories',
      '_components',
      'ConsumerObligations.tsx',
    );
    expect(await fs.pathExists(pageFp), 'page .mdx must exist').toBe(true);
    expect(await fs.pathExists(componentFp), 'component .tsx must exist').toBe(true);

    const pageSrc = await fs.readFile(pageFp, 'utf-8');
    expect(pageSrc).toContain('title="Accessibility/Consumer Obligations"');

    // Phase 2 component MDXes import the TSX as `<ConsumerObligations>` —
    // verify the import path still resolves alongside the new namespaced page.
    const cardMdxFp = path.join(opts.directory, 'src', 'stories', 'components', 'aurora-card.mdx');
    const cardSrc = await fs.readFile(cardMdxFp, 'utf-8');
    expect(cardSrc).toMatch(
      /import\s+\{\s*ConsumerObligations\s*\}\s+from\s+'\.\.\/_components\/ConsumerObligations'/,
    );
  });

  it('storySort in .storybook/preview.ts surfaces a top-level Accessibility namespace', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase3-storysort' });
    await scaffoldProject(opts);
    const previewFp = path.join(opts.directory, '.storybook', 'preview.ts');
    expect(await fs.pathExists(previewFp), 'preview.ts must exist').toBe(true);
    const src = await fs.readFile(previewFp, 'utf-8');

    // The storySort `order:` array literal is the only meaningful token-order
    // surface; ad-hoc string searches in the surrounding code (comments,
    // import blocks) hit false-positives. Carve out just the order-array
    // literal and assert positions inside it. The order array contains
    // nested sub-arrays, so a non-greedy match would stop at the first
    // `]`. We grab from `order: [` up to `\n      },` (the storySort
    // object close) instead.
    const orderHead = src.indexOf('order: [');
    expect(orderHead, 'storySort.order must be declared').toBeGreaterThanOrEqual(0);
    const orderTail = src.indexOf('\n      },', orderHead);
    expect(orderTail, 'storySort object close must follow order:').toBeGreaterThan(orderHead);
    const orderBody = src.slice(orderHead, orderTail);

    // Top-level Accessibility entry — sits between Foundations (and its
    // nested sub-array) and Components in the order list. Strip out any
    // commentary lines starting with '//' so quoted token references in
    // explanatory comments do not mask the real entry positions.
    const stripped = orderBody
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    expect(stripped).toContain("'Accessibility'");

    const foundationsIdx = stripped.indexOf("'Foundations'");
    const componentsIdx = stripped.indexOf("'Components'");
    const accessibilityIdx = stripped.indexOf("'Accessibility'");

    expect(foundationsIdx, "'Foundations' must be in the order array").toBeGreaterThanOrEqual(0);
    expect(componentsIdx, "'Components' must be in the order array").toBeGreaterThanOrEqual(0);

    // Accessibility must sit AFTER Foundations and BEFORE Components.
    expect(accessibilityIdx, "'Accessibility' must appear after Foundations").toBeGreaterThan(
      foundationsIdx,
    );
    expect(accessibilityIdx, "'Accessibility' must appear before Components").toBeLessThan(
      componentsIdx,
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — Token deep-dives + cross-domain-neutral scene stories
//
// Asserts the 2 token MDXes (Borders, Shadows) emit under Foundations/Tokens/*
// and the 4 scene stories (account-setup, team-dashboard, settings,
// Tokens.stories.tsx playground) emit with their tag substitutions clean.
// Forbidden healthcare strings are explicitly grepped — must be zero matches
// across all Phase 4 emissions.
// ---------------------------------------------------------------------------

describe('wc-storybook Phase 4 — token deep-dive MDXes', () => {
  it('emits Borders.mdx at foundations/tokens/Borders.mdx with the nested Meta title', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-borders' });
    await scaffoldProject(opts);

    const bordersPath = path.join(
      opts.directory,
      'src',
      'stories',
      'foundations',
      'tokens',
      'Borders.mdx',
    );
    expect(await fs.pathExists(bordersPath)).toBe(true);

    const src = await fs.readFile(bordersPath, 'utf8');
    expect(src).toContain('title="Foundations/Tokens/Borders"');
    // Iterates over upstream `@helixui/tokens` tokensByCategory['border']
    expect(src).toContain("tokensByCategory['border']");
    expect(src).toContain('getTokensByPrefix');
  });

  it('emits Shadows.mdx at foundations/tokens/Shadows.mdx with the nested Meta title', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-shadows' });
    await scaffoldProject(opts);

    const shadowsPath = path.join(
      opts.directory,
      'src',
      'stories',
      'foundations',
      'tokens',
      'Shadows.mdx',
    );
    expect(await fs.pathExists(shadowsPath)).toBe(true);

    const src = await fs.readFile(shadowsPath, 'utf8');
    expect(src).toContain('title="Foundations/Tokens/Shadows"');
    expect(src).toContain("tokensByCategory['shadow']");
    // Domain-neutral demo card content (NOT "Patient Summary").
    expect(src).toContain('Project handoff');
  });
});

describe('wc-storybook Phase 4 — cross-domain-neutral scene stories', () => {
  it('emits account-setup.stories.ts under patterns/scenes/', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-account' });
    await scaffoldProject(opts);

    const filePath = path.join(
      opts.directory,
      'src',
      'stories',
      'patterns',
      'scenes',
      'account-setup.stories.ts',
    );
    expect(await fs.pathExists(filePath)).toBe(true);
    const src = await fs.readFile(filePath, 'utf8');
    expect(src).toContain("title: 'Patterns/Scenes/Account Setup'");
    // Real sign-up flow shape:
    expect(src).toContain('Create your account');
    expect(src).toContain('terms of service');
  });

  it('emits team-dashboard.stories.ts under patterns/scenes/', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-team' });
    await scaffoldProject(opts);

    const filePath = path.join(
      opts.directory,
      'src',
      'stories',
      'patterns',
      'scenes',
      'team-dashboard.stories.ts',
    );
    expect(await fs.pathExists(filePath)).toBe(true);
    const src = await fs.readFile(filePath, 'utf8');
    expect(src).toContain("title: 'Patterns/Scenes/Team Dashboard'");
    // Generic team admin overview shape:
    expect(src).toContain('Active members');
    expect(src).toContain('Pending invites');
  });

  it('emits settings.stories.ts under patterns/scenes/', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-settings' });
    await scaffoldProject(opts);

    const filePath = path.join(
      opts.directory,
      'src',
      'stories',
      'patterns',
      'scenes',
      'settings.stories.ts',
    );
    expect(await fs.pathExists(filePath)).toBe(true);
    const src = await fs.readFile(filePath, 'utf8');
    expect(src).toContain("title: 'Patterns/Scenes/Settings'");
    // Healthcare-tinted labels neutralized:
    expect(src).toContain('Workspace invites');
    expect(src).toContain('Mentions & comments');
    // Tabs still wired (general / notifications / accessibility):
    expect(src).toContain('tab-general');
    expect(src).toContain('tab-notifications');
    expect(src).toContain('tab-accessibility');
  });

  it('emits Tokens.stories.tsx playground under foundations/tokens/', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-playground' });
    await scaffoldProject(opts);

    const filePath = path.join(
      opts.directory,
      'src',
      'stories',
      'foundations',
      'tokens',
      'Tokens.stories.tsx',
    );
    expect(await fs.pathExists(filePath)).toBe(true);
    const src = await fs.readFile(filePath, 'utf8');
    expect(src).toContain("title: 'Foundations/Tokens/Playground'");
    // The 4 control-rail brands still emit (cascade-contract demo):
    expect(src).toContain('BrandMeridian');
    expect(src).toContain('BrandLumen');
    expect(src).toContain('SharpDense');
    expect(src).toContain('SoftSpacious');
  });
});

describe('wc-storybook Phase 4 — substitution + neutrality guarantees', () => {
  it('scenes keep hx-* literals for tags the scaffolder does NOT wrap; ${ds}-button is the only exception (dsName=aurora)', async () => {
    // Codex P1 (round 16) — Phase 4 wholesale-substituted every literal
    // hx-* tag in the scenes to ${ds}-*. That was correct for the MDXes
    // (reverted in round 7), but the same revert was missed for scenes.
    // Only `${ds}-button` is actually wrapped by the scaffolder; every
    // other tag (`${ds}-card`, `${ds}-form`, `${ds}-text-input`, etc.)
    // is undefined at runtime. Assert the post-revert shape:
    //   - hx-card / hx-form / hx-text-input / etc. appear as literals
    //     in scene bodies (registered via @helixui/library/components/*).
    //   - aurora-button still appears (the one consumer wrapper).
    //   - No NON-button aurora-* tag appears in scene HTML — the only
    //     non-button "aurora-" mentions allowed are in prose / comments
    //     ("aurora-* components").
    const opts = makeWcStorybookOptions({ name: 'phase4-sub' });
    await scaffoldProject(opts);

    const sceneFiles = [
      'src/stories/patterns/scenes/account-setup.stories.ts',
      'src/stories/patterns/scenes/team-dashboard.stories.ts',
      'src/stories/patterns/scenes/settings.stories.ts',
      'src/stories/foundations/tokens/Tokens.stories.tsx',
    ];

    for (const rel of sceneFiles) {
      const src = await fs.readFile(path.join(opts.directory, rel), 'utf8');

      // aurora-button (the wrapped consumer component) must appear in
      // at least the 3 scenes that exercise buttons.
      if (rel !== 'src/stories/patterns/scenes/settings.stories.ts') {
        // settings.stories.ts also has buttons, so all 4 actually do
      }
      expect(src, `${rel} must reference the consumer's aurora-button wrapper`).toMatch(
        /aurora-button/,
      );

      // No NON-button aurora-* HTML tag (`<aurora-card>`, `<aurora-form>`,
      // etc.) — the wrapper doesn't exist for anything but button.
      const nonButtonAuroraTag = src.match(/<aurora-(?!button[\s>/])[a-z-]+/);
      expect(
        nonButtonAuroraTag,
        `${rel} must NOT contain non-button aurora-* HTML tags (found: ${nonButtonAuroraTag?.[0] ?? 'none'})`,
      ).toBeNull();
    }
  });

  it('scenes contain hx-card / hx-form / hx-text-input literals (revert of Phase 4 over-substitution)', async () => {
    // Per-scene targeted assertions: each scene must reference the
    // upstream literal hx-* tag for the components it composes. The
    // @helixui/library/components/hx-* side-effect imports register
    // them with the browser; the templates render them as <hx-*>.
    const opts = makeWcStorybookOptions({ name: 'phase4-revert' });
    await scaffoldProject(opts);

    const checks: Array<{ rel: string; mustContain: string[] }> = [
      {
        rel: 'src/stories/patterns/scenes/account-setup.stories.ts',
        mustContain: [
          '<hx-form',
          '<hx-card',
          '<hx-text-input',
          '<hx-select',
          '<hx-radio-group',
          '<hx-checkbox',
        ],
      },
      {
        rel: 'src/stories/patterns/scenes/team-dashboard.stories.ts',
        mustContain: ['<hx-card', '<hx-stat', '<hx-data-table'],
      },
      {
        rel: 'src/stories/patterns/scenes/settings.stories.ts',
        mustContain: [
          '<hx-tabs',
          '<hx-tab',
          '<hx-card',
          '<hx-switch',
          '<hx-select',
          '<hx-text-input',
        ],
      },
      {
        rel: 'src/stories/foundations/tokens/Tokens.stories.tsx',
        mustContain: ['<hx-card', '<hx-text-input', '<hx-tag', '<hx-alert'],
      },
    ];

    for (const { rel, mustContain } of checks) {
      const src = await fs.readFile(path.join(opts.directory, rel), 'utf8');
      for (const tag of mustContain) {
        expect(src, `${rel} must contain literal ${tag} tag`).toContain(tag);
      }
    }
  });

  it('.storybook/preview.ts imports the consumer button wrapper class so ${ds}-button.mdx renders', async () => {
    // Codex P1 (round 16) — preview.ts side-effect imports every
    // @helixui/library/components/hx-* tag the MDXes reference, but
    // it was missing an import of the consumer's own scaffolded
    // `${ds}-button` class. Without it the existing
    // `${ds}-button.mdx` reference page renders an undefined custom
    // element. Assert the import line lands at scaffold-emit time.
    const opts = makeWcStorybookOptions({ name: 'preview-consumer-import' });
    await scaffoldProject(opts);

    const previewSrc = await fs.readFile(
      path.join(opts.directory, '.storybook', 'preview.ts'),
      'utf8',
    );

    // dsName='aurora' (from makeWcStorybookOptions default). The
    // import path must use the wrapped consumer class location.
    expect(previewSrc, 'preview.ts must import the consumer aurora-button class').toContain(
      "import '../src/components/aurora-button/aurora-button.js'",
    );
  });

  it('forbidden healthcare strings: zero matches across all Phase 4 emissions', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-forbidden' });
    await scaffoldProject(opts);

    const phase4Dirs = [
      path.join(opts.directory, 'src', 'stories', 'patterns', 'scenes'),
      path.join(opts.directory, 'src', 'stories', 'foundations', 'tokens'),
    ];

    const forbidden = [
      'patient',
      'MRN',
      'clinic',
      'intake',
      'provider',
      'chart',
      'appointment',
      'prescription',
      'medication',
      'consent form',
    ];

    for (const dir of phase4Dirs) {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;
        const content = await fs.readFile(filePath, 'utf8');
        for (const term of forbidden) {
          const re = new RegExp(`\\b${term}\\b`, 'gi');
          expect(
            content.match(re),
            `${file} must contain zero matches of forbidden term "${term}"`,
          ).toBeNull();
        }
      }
    }
  });

  it('all 4 scenes import expect + userEvent + within from storybook/test (NOT @storybook/jest)', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-imports' });
    await scaffoldProject(opts);

    const sceneFiles = [
      'src/stories/patterns/scenes/account-setup.stories.ts',
      'src/stories/patterns/scenes/team-dashboard.stories.ts',
      'src/stories/patterns/scenes/settings.stories.ts',
    ];

    for (const rel of sceneFiles) {
      const src = await fs.readFile(path.join(opts.directory, rel), 'utf8');
      expect(src, `${rel} must import from storybook/test`).toMatch(
        /from\s+['"]storybook\/test['"]/,
      );
      expect(src, `${rel} must NOT import from @storybook/jest (deprecated)`).not.toMatch(
        /@storybook\/jest/,
      );
    }
  });

  it('Phase 4 scenes use Lit html`` template render functions', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-lit' });
    await scaffoldProject(opts);

    const sceneFiles = [
      'src/stories/patterns/scenes/account-setup.stories.ts',
      'src/stories/patterns/scenes/team-dashboard.stories.ts',
      'src/stories/patterns/scenes/settings.stories.ts',
      'src/stories/foundations/tokens/Tokens.stories.tsx',
    ];

    for (const rel of sceneFiles) {
      const src = await fs.readFile(path.join(opts.directory, rel), 'utf8');
      // `html\`` (template-tagged literal) must appear in render functions.
      expect(src, `${rel} must use Lit html\`\` render templates`).toMatch(/html`/);
      // `import { html } from 'lit'` import must be present.
      expect(src, `${rel} must import html from 'lit'`).toMatch(/from\s+['"]lit['"]/);
    }
  });

  it('preview.ts storySort accommodates Foundations/Tokens/* nesting + Patterns/Scenes/*', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-sort' });
    await scaffoldProject(opts);

    const previewPath = path.join(opts.directory, '.storybook', 'preview.ts');
    const src = await fs.readFile(previewPath, 'utf8');

    // Tokens subtree explicit ordering:
    expect(src).toContain("'Borders'");
    expect(src).toContain("'Shadows'");
    expect(src).toContain("'Playground'");

    // Patterns subtree explicit ordering with Scenes pinned first:
    const orderHead = src.indexOf('order: [');
    expect(orderHead).toBeGreaterThanOrEqual(0);
    const orderTail = src.indexOf('\n      },', orderHead);
    const orderBody = src.slice(orderHead, orderTail);
    const stripped = orderBody
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    // 'Patterns' must appear as a top-level entry with a nested sub-array
    // starting with 'Scenes'.
    expect(stripped).toContain("'Patterns'");
    expect(stripped).toContain("'Scenes'");
    const patternsIdx = stripped.indexOf("'Patterns'");
    const scenesIdx = stripped.indexOf("'Scenes'", patternsIdx);
    expect(scenesIdx, "'Scenes' must follow 'Patterns'").toBeGreaterThan(patternsIdx);
  });

  it('existing _snippets.ts and prior accessibility pages still emit (no regression)', async () => {
    const opts = makeWcStorybookOptions({ name: 'phase4-noregress' });
    await scaffoldProject(opts);

    // Phase 3 outputs must still ship:
    expect(
      await fs.pathExists(
        path.join(opts.directory, 'src', 'stories', 'accessibility', '_snippets.ts'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(opts.directory, 'src', 'stories', 'accessibility', 'Dashboard.mdx'),
      ),
    ).toBe(true);
    // Existing Tokens.mdx index page (one directory UP from the new
    // Tokens subtree) must still emit:
    expect(
      await fs.pathExists(path.join(opts.directory, 'src', 'stories', 'foundations', 'Tokens.mdx')),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// v0.6.0 Phase B — Iconography port + @helixui/icons wire-up
//
// Ports helix/apps/storybook/stories/foundations/Iconography.mdx (603 LOC)
// into a new emitter at src/scaffold/wc-storybook/mdx-iconography.ts,
// and wires the @helixui/icons registry into the emitted Storybook:
//   - preview.ts: `import { setBasePath } from '@helixui/icons'; setBasePath('/icons');`
//   - main.ts: `staticDirs: ['../node_modules/@helixui/icons/dist']`
// ---------------------------------------------------------------------------

describe('wc-storybook v0.6.0 Phase B — Iconography MDX', () => {
  it('emits Iconography.mdx at src/stories/foundations/Iconography.mdx with the Foundations title', async () => {
    const opts = makeWcStorybookOptions({ name: 'phaseB-iconography' });
    await scaffoldProject(opts);

    const iconographyPath = path.join(
      opts.directory,
      'src',
      'stories',
      'foundations',
      'Iconography.mdx',
    );
    expect(await fs.pathExists(iconographyPath)).toBe(true);

    const src = await fs.readFile(iconographyPath, 'utf8');
    expect(src).toContain('title="Foundations/Iconography"');
    // Section head text drawn from the upstream foundation page.
    expect(src).toContain('Iconography');
  });

  it('contains the helix-glyph grid markers (representative names: check, close, plus, error, success)', async () => {
    const opts = makeWcStorybookOptions({ name: 'phaseB-helix-glyphs' });
    await scaffoldProject(opts);

    const iconographyPath = path.join(
      opts.directory,
      'src',
      'stories',
      'foundations',
      'Iconography.mdx',
    );
    const src = await fs.readFile(iconographyPath, 'utf8');

    // The helix grid is the 32-name HELIX_GLYPHS array; assert ≥5
    // representative names so a future copy-edit can shuffle order
    // without re-snapshotting.
    expect(src).toContain('HELIX_GLYPHS');
    for (const glyph of ['check', 'close', 'plus', 'error', 'success']) {
      expect(src, `helix glyph "${glyph}" must appear in Iconography.mdx`).toContain(`'${glyph}'`);
    }
  });

  it('contains the fa-free sample markers (representative names: house, user, gear)', async () => {
    const opts = makeWcStorybookOptions({ name: 'phaseB-fa-free' });
    await scaffoldProject(opts);

    const iconographyPath = path.join(
      opts.directory,
      'src',
      'stories',
      'foundations',
      'Iconography.mdx',
    );
    const src = await fs.readFile(iconographyPath, 'utf8');

    expect(src).toContain('FA_FREE_SAMPLE');
    for (const name of ['house', 'user', 'gear']) {
      expect(src, `fa-free sample "${name}" must appear in Iconography.mdx`).toContain(`'${name}'`);
    }
  });

  it('contains live <hx-icon library="helix"> registry usage', async () => {
    const opts = makeWcStorybookOptions({ name: 'phaseB-live-icon' });
    await scaffoldProject(opts);

    const iconographyPath = path.join(
      opts.directory,
      'src',
      'stories',
      'foundations',
      'Iconography.mdx',
    );
    const src = await fs.readFile(iconographyPath, 'utf8');

    // The two live grids (helix + fa-free) both render through
    // <hx-icon library="…" name={name}>. Assert the helix variant is
    // present — it's the page's signature live example.
    expect(src).toContain('<hx-icon library="helix"');
  });

  it('wires setBasePath into emitted .storybook/preview.ts', async () => {
    const opts = makeWcStorybookOptions({ name: 'phaseB-preview-setbasepath' });
    await scaffoldProject(opts);

    const previewPath = path.join(opts.directory, '.storybook', 'preview.ts');
    const src = await fs.readFile(previewPath, 'utf8');

    // Both the import and the runtime call must land — the import
    // alone wouldn't configure the registry; the call alone wouldn't
    // type-check.
    expect(src).toMatch(/import\s+\{\s*setBasePath\s*\}\s+from\s+['"]@helixui\/icons['"]/);
    expect(src).toContain("setBasePath('/icons')");
  });

  it('wires @helixui/icons/dist into .storybook/main.ts staticDirs', async () => {
    const opts = makeWcStorybookOptions({ name: 'phaseB-main-staticdirs' });
    await scaffoldProject(opts);

    const mainPath = path.join(opts.directory, '.storybook', 'main.ts');
    const src = await fs.readFile(mainPath, 'utf8');

    // staticDirs must list the @helixui/icons sprite-asset directory so
    // /icons/helix.svg + /icons/fa-free-solid.svg resolve from
    // node_modules at runtime.
    expect(src).toContain('staticDirs');
    expect(src).toContain('@helixui/icons/dist');
  });

  it('declares @helixui/icons in package.json peerDependencies and devDependencies', async () => {
    const opts = makeWcStorybookOptions({ name: 'phaseB-package-json' });
    await scaffoldProject(opts);

    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    // The package is the dep that backs both wires (setBasePath in
    // preview.ts + staticDirs in main.ts). Missing the dep would
    // surface as a runtime resolution error, not a build failure.
    expect(pkg.peerDependencies?.['@helixui/icons']).toBeTruthy();
    expect(pkg.devDependencies?.['@helixui/icons']).toBeTruthy();
  });
});
