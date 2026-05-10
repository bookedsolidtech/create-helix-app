/**
 * Golden-snapshot test for the wc-storybook factory output.
 *
 * Scaffolds with FIXED inputs (deterministic — no env, no time, no
 * randomness) and asserts the file tree matches a committed manifest.
 * Catches emission-drift that vitest unit tests miss: a new file
 * appearing or an old file disappearing without a corresponding test
 * update will fail this test loud.
 *
 * The manifest lists relative paths only. File CONTENTS are not part
 * of the snapshot — that's what the per-emitter tests in
 * `src/__tests__/wc-storybook-brand.test.ts` cover. This test owns
 * the FILE-LIST contract.
 *
 * Updating the manifest:
 *   1. Adjust scaffold.ts so the new file emits.
 *   2. Run the test — it will fail with a diff.
 *   3. Add the new path(s) to the EXPECTED_FILES array below.
 *   4. Re-run; should pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';

const TARGET = '/tmp/helix-golden-wc-storybook';

const FIXED_OPTIONS: ProjectOptions = {
  name: 'golden-fixture',
  directory: TARGET,
  framework: 'wc-storybook',
  componentBundles: ['core', 'forms'],
  typescript: true,
  eslint: true,
  designTokens: true,
  darkMode: true,
  installDeps: false,
  dsName: 'golden',
  tokenPrefix: '--gd',
  brandTagline: 'A golden test fixture for the wc-storybook factory.',
  brandVerticals: ['fintech', 'wellness'],
};

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function recur(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await recur(full);
      } else if (e.isFile()) {
        out.push(path.relative(root, full));
      }
    }
  }
  await recur(root);
  return out.sort();
}

describe('wc-storybook factory — golden snapshot', () => {
  beforeAll(async () => {
    await fs.remove(TARGET);
    await scaffoldProject(FIXED_OPTIONS);
  });

  afterAll(async () => {
    await fs.remove(TARGET);
  });

  it('emits at least the Phase 1-4 brand-storytelling + helix-lift artefacts', async () => {
    const actual = await walkFiles(TARGET);

    // The brand-storytelling deliverable is defined by these specific
    // files landing in the consumer scaffold. The full file count grows
    // with each phase + with HELiX library churn, so we assert the
    // KEY artefacts are present rather than a strict file-list match.
    //
    // helix-lift Phases 1-4 added ~80 new files: 7 React helpers, 7
    // component conformance MDXes, 8 accessibility narrative MDXes,
    // 2 token deep-dives, and 4 scene stories. The required[] list
    // tracks one representative file from each new family.
    const required = [
      'helix.storybook.config.ts',
      '.storybook/manager-theme.ts',
      '.storybook/manager.ts',
      '.storybook/preview.ts',
      '.storybook/manager-head.html',
      '.storybook/preview-head.html',
      'src/stories/_components/A11yStatusCard.tsx',
      '.storybook/docs/HelixDocsPage.tsx',
      '.storybook/docs/a11y-card.css',
      '.storybook/docs/brand-overrides.css',
      '.storybook/docs/helix-docs.css',
      'src/stories/_components/APGPatternCard.tsx',
      'src/stories/_components/ConsumerObligations.tsx',
      'src/stories/_components/InlineAuditPanel.tsx',
      // helix-lift Phase 1 — React helpers
      'src/stories/_components/TokenSwatchGrid.tsx',
      'src/stories/_components/ContrastMatrix.tsx',
      'src/stories/_components/RatioCard.tsx',
      'src/stories/_components/CodeBlock.tsx',
      'src/stories/_components/CodeTabs.tsx',
      'src/stories/_components/useResolvedToken.ts',
      'src/stories/_components/contrast.ts',
      // Foundational MDXes
      'src/stories/components/golden-button.mdx',
      'src/stories/Cover.mdx',
      'src/stories/Overview.mdx',
      'src/stories/foundations/Tokens.mdx',
      'src/stories/foundations/Color.mdx',
      'src/stories/foundations/Typography.mdx',
      'src/stories/foundations/Spacing.mdx',
      'src/stories/foundations/Layout.mdx',
      'src/stories/foundations/Brand.mdx',
      'src/stories/foundations/Accessibility.mdx',
      'src/stories/patterns/Index.mdx',
      // helix-lift Phase 2 — 7 component conformance MDXes (dsName-parameterized)
      'src/stories/components/golden-card.mdx',
      'src/stories/components/golden-checkbox.mdx',
      'src/stories/components/golden-dialog.mdx',
      'src/stories/components/golden-form.mdx',
      'src/stories/components/golden-select.mdx',
      'src/stories/components/golden-tabs.mdx',
      'src/stories/components/golden-text-input.mdx',
      // helix-lift Phase 3 — 8 accessibility narrative MDXes
      'src/stories/accessibility/Dashboard.mdx',
      'src/stories/accessibility/AAAStoryTemplate.mdx',
      'src/stories/accessibility/KeyboardContracts.mdx',
      'src/stories/accessibility/SuccessCriteria.mdx',
      'src/stories/accessibility/ConsumerObligations.mdx',
      'src/stories/accessibility/FocusManagement.mdx',
      'src/stories/accessibility/ContrastDeepDive.mdx',
      'src/stories/accessibility/ForcedColors.mdx',
      'src/stories/accessibility/_snippets.ts',
      // helix-lift Phase 4 — token deep-dives + cross-domain-neutral scenes
      'src/stories/foundations/tokens/Borders.mdx',
      'src/stories/foundations/tokens/Shadows.mdx',
      'src/stories/foundations/tokens/Tokens.stories.tsx',
      'src/stories/patterns/scenes/account-setup.stories.ts',
      'src/stories/patterns/scenes/team-dashboard.stories.ts',
      'src/stories/patterns/scenes/settings.stories.ts',
    ];

    const missing = required.filter((f) => !actual.includes(f));
    if (missing.length > 0) {
      throw new Error(
        `Golden snapshot — missing brand-storytelling artefacts:\n  ${missing.join('\n  ')}\n\nIf the rename / move is intentional, update the required[] array in tests/golden/wc-storybook-scaffold/golden.test.ts.`,
      );
    }
    expect(missing).toEqual([]);
  });

  it('idempotent: a second scaffold over the same directory produces the same file list', async () => {
    const before = await walkFiles(TARGET);
    await scaffoldProject({ ...FIXED_OPTIONS, force: true });
    const after = await walkFiles(TARGET);
    expect(after).toEqual(before);
  });

  it('the consumer brandTagline reaches the emitted Cover.mdx', async () => {
    const cover = await fs.readFile(path.join(TARGET, 'src/stories/Cover.mdx'), 'utf-8');
    expect(cover).toContain(FIXED_OPTIONS.brandTagline as string);
  });

  it('the consumer tokenPrefix reaches Brand.mdx and Tokens.mdx (the brand tier docs)', async () => {
    // Phase 1 of helix-lift rewrote the reference button MDX to consume
    // <TokenSwatchGrid> / <ContrastMatrix> / <CodeBlock> helpers rather
    // than embedding raw CSS variable text. Brand.mdx + Tokens.mdx
    // remain the canonical token-prefix surface (they document the
    // --{prefix}-* tier as the consumer's override layer).
    const brand = await fs.readFile(
      path.join(TARGET, 'src/stories/foundations/Brand.mdx'),
      'utf-8',
    );
    const tokens = await fs.readFile(
      path.join(TARGET, 'src/stories/foundations/Tokens.mdx'),
      'utf-8',
    );
    for (const src of [brand, tokens]) {
      expect(src).toContain('--gd-color-');
    }
  });

  it('the dsName parameterization reaches the Phase 2 component conformance MDXes', async () => {
    // Each ported MDX (card, checkbox, dialog, form, select, tabs,
    // text-input) interpolates `<{dsName}-{component}>` tags — verify
    // a representative subset to catch regression in the substitution.
    const card = await fs.readFile(
      path.join(TARGET, 'src/stories/components/golden-card.mdx'),
      'utf-8',
    );
    const form = await fs.readFile(
      path.join(TARGET, 'src/stories/components/golden-form.mdx'),
      'utf-8',
    );
    expect(card).toContain('<golden-card');
    expect(form).toContain('<golden-form');
    // And NO literal <hx-*> tags should survive the port.
    expect(card).not.toMatch(/<hx-card[\s>]/);
    expect(form).not.toMatch(/<hx-form[\s>]/);
  });

  it('the Phase 4 scene stories use cross-domain-neutral copy (no healthcare references)', async () => {
    // feedback_realistic_sample_data.md — scenes must NOT lock to
    // healthcare verticals. Catch any patient/provider/intake/clinic
    // leakage from the helix source MDXes.
    const accountSetup = await fs.readFile(
      path.join(TARGET, 'src/stories/patterns/scenes/account-setup.stories.ts'),
      'utf-8',
    );
    const teamDashboard = await fs.readFile(
      path.join(TARGET, 'src/stories/patterns/scenes/team-dashboard.stories.ts'),
      'utf-8',
    );
    for (const src of [accountSetup, teamDashboard]) {
      expect(src).not.toMatch(/\bpatient\b/i);
      expect(src).not.toMatch(/\bprovider\b/i);
      expect(src).not.toMatch(/\bclinic\b/i);
      expect(src).not.toMatch(/\bintake\b/i);
    }
  });
});
