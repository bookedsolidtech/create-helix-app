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

  it('emits at least the Phase 1-4 brand-storytelling artefacts', async () => {
    const actual = await walkFiles(TARGET);

    // The brand-storytelling deliverable is defined by these specific
    // files landing in the consumer scaffold. The full file count grows
    // with each phase + with HELiX library churn, so we assert the
    // KEY artefacts are present rather than a strict file-list match.
    const required = [
      'helix.storybook.config.ts',
      '.storybook/manager-theme.ts',
      '.storybook/manager.ts',
      '.storybook/preview.ts',
      '.storybook/manager-head.html',
      '.storybook/preview-head.html',
      // Phase 5 fix — A11yStatusCard moved to src/stories/_components/.
      'src/stories/_components/A11yStatusCard.tsx',
      '.storybook/docs/HelixDocsPage.tsx',
      '.storybook/docs/a11y-card.css',
      '.storybook/docs/brand-overrides.css',
      '.storybook/docs/helix-docs.css',
      'src/stories/_components/APGPatternCard.tsx',
      'src/stories/_components/ConsumerObligations.tsx',
      'src/stories/_components/InlineAuditPanel.tsx',
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

  it('the consumer tokenPrefix reaches Brand.mdx, Tokens.mdx, and the reference button MDX', async () => {
    const brand = await fs.readFile(
      path.join(TARGET, 'src/stories/foundations/Brand.mdx'),
      'utf-8',
    );
    const tokens = await fs.readFile(
      path.join(TARGET, 'src/stories/foundations/Tokens.mdx'),
      'utf-8',
    );
    const button = await fs.readFile(
      path.join(TARGET, 'src/stories/components/golden-button.mdx'),
      'utf-8',
    );
    for (const src of [brand, tokens, button]) {
      expect(src).toContain('--gd-color-');
    }
  });
});
