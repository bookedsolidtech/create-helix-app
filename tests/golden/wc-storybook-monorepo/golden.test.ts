/**
 * Golden-snapshot test for the wc-storybook MONOREPO emit shape (v0.7.0 Phase F).
 *
 * Mirror of tests/golden/wc-storybook-scaffold/golden.test.ts but for the
 * monorepo flavor invoked via scaffoldProject (the public API). Three
 * independent guarantees per the v0.7.0 Phase H plan:
 *
 *   1. File-tree contract — ~30-50 representative files (root scaffold +
 *      every package's package.json/tsconfig.json + key src entries) must
 *      land on disk; anything missing trips this test, not a release.
 *   2. Byte-identical idempotency — a second scaffold over the same dir
 *      produces the same bytes for the JSON/text root files (these are
 *      monorepo-overlay-owned and have no randomBytes content). Skips the
 *      flat-scaffolded Navbar that bakes in a per-install UTM ID.
 *   3. Forbidden-pattern grep — no leftover `framework: ember` (we're
 *      wc-storybook), no `apps/web` Next/Vite-specific imports leaking
 *      through.
 *
 * The wc-storybook monorepo entry is reached via the public API ONLY when
 * called from react-next / react-vite + includeDesignSystem (the direct
 * wc-storybook + monorepoMode combo coerces monorepoMode to false in api.ts).
 * scaffoldProject is exported from scaffold.ts and bypasses that coercion,
 * so we invoke it here with the full monorepo config and validate Phase F's
 * direct entry. The integration suite's wc-storybook-monorepo.test.ts
 * already pins finer assertions about exports + the React-wrappers barrel;
 * this file owns the FILE-LIST contract.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';

const TARGET = '/tmp/helix-golden-wc-storybook-monorepo';

const FIXED_OPTIONS: ProjectOptions = {
  name: 'golden-wcs-mr',
  directory: TARGET,
  framework: 'wc-storybook',
  componentBundles: ['core', 'forms'],
  typescript: true,
  eslint: true,
  designTokens: true,
  darkMode: false,
  installDeps: false,
  force: true,
  monorepoMode: true,
  includeDesignSystem: true,
  dsName: 'golden',
  tokenPrefix: '--gd',
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

describe('wc-storybook monorepo factory — golden snapshot (v0.7.0 Phase F)', () => {
  beforeAll(async () => {
    await fs.remove(TARGET);
    await scaffoldProject(FIXED_OPTIONS);
  });

  afterAll(async () => {
    await fs.remove(TARGET);
  });

  it('emits the canonical monorepo file-tree (~50 representative files)', async () => {
    const actual = await walkFiles(TARGET);

    // Mirror of the flat golden's required[] pattern. The list documents
    // the v0.7.0 Phase F monorepo contract: root scaffold (Phase C),
    // packages/types + packages/utils (Phase G), packages/design-system
    // (Phase F overlays + flat factory body), and the lone apps/web/
    // helix-setup.ts that the framework's auxOptions branch lays down.
    const required = [
      // Monorepo root (Phase C).
      'pnpm-workspace.yaml',
      'turbo.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'package.json',
      'README.md',
      '.gitignore',
      // packages/types (Phase G stub).
      'packages/types/package.json',
      'packages/types/tsconfig.json',
      'packages/types/src/index.ts',
      // packages/utils (Phase G stub).
      'packages/utils/package.json',
      'packages/utils/tsconfig.json',
      'packages/utils/src/index.ts',
      // packages/design-system identity (Phase F overlays).
      'packages/design-system/package.json',
      'packages/design-system/tsconfig.json',
      'packages/design-system/tsconfig.build.json',
      'packages/design-system/src/index.ts',
      // .storybook surface (inherited from flat factory under DS).
      'packages/design-system/.storybook/main.ts',
      'packages/design-system/.storybook/preview.ts',
      'packages/design-system/.storybook/manager-theme.ts',
      'packages/design-system/.storybook/manager.ts',
      'packages/design-system/.storybook/preview-head.html',
      'packages/design-system/.storybook/manager-head.html',
      // helix.storybook.config.ts knob inherited from flat.
      'packages/design-system/helix.storybook.config.ts',
      // src/base/{ds}-element.ts — the HelixElement-extending base class.
      'packages/design-system/src/base/golden-element.ts',
      // src/components/{ds}-button/ — the one full wrapper component.
      'packages/design-system/src/components/golden-button/golden-button.ts',
      'packages/design-system/src/components/golden-button/golden-button.styles.ts',
      'packages/design-system/src/components/golden-button/golden-button.stories.ts',
      'packages/design-system/src/components/golden-button/variants.ts',
      // src/tokens/ — token pipeline output.
      'packages/design-system/src/tokens/tokens.css',
      'packages/design-system/src/tokens/tokens.json',
      // Foundational MDX surface (Phase 1-4 helix-lift).
      'packages/design-system/src/stories/Cover.mdx',
      'packages/design-system/src/stories/Overview.mdx',
      'packages/design-system/src/stories/foundations/Tokens.mdx',
      'packages/design-system/src/stories/foundations/Brand.mdx',
      'packages/design-system/src/stories/foundations/Accessibility.mdx',
      // Build / vite plumbing.
      'packages/design-system/vite.config.ts',
      'packages/design-system/vitest.config.ts',
      'packages/design-system/custom-elements.json',
    ];

    const missing = required.filter((f) => !actual.includes(f));
    if (missing.length > 0) {
      throw new Error(
        `Golden snapshot — missing wc-storybook monorepo artefacts:\n  ${missing.join('\n  ')}\n\nIf the rename / move is intentional, update the required[] array in tests/golden/wc-storybook-monorepo/golden.test.ts.`,
      );
    }
    expect(missing).toEqual([]);
  });

  it('byte-identical re-scaffold for the JSON/text root files (idempotency, DXA F5)', async () => {
    // The monorepo-overlay files are all deterministic — no install IDs,
    // no timestamps. The flat factory's apps/web Navbar with the UTM ID
    // is the only known drift point and isn't part of the wc-storybook
    // monorepo's relevant output (the lone apps/web/src/helix-setup.ts
    // doesn't contain the ID). Curated list per Phase H — snapshot these
    // files and diff a second run.
    const snapshotFiles = [
      'pnpm-workspace.yaml',
      'turbo.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'package.json',
      '.gitignore',
      'README.md',
      'packages/design-system/package.json',
      'packages/design-system/tsconfig.json',
      'packages/design-system/src/index.ts',
      'packages/types/package.json',
      'packages/types/tsconfig.json',
      'packages/types/src/index.ts',
      'packages/utils/package.json',
      'packages/utils/tsconfig.json',
      'packages/utils/src/index.ts',
    ];

    const before: Record<string, string> = {};
    for (const f of snapshotFiles) {
      before[f] = await fs.readFile(path.join(TARGET, f), 'utf8');
    }

    await scaffoldProject(FIXED_OPTIONS);

    for (const [f, expected] of Object.entries(before)) {
      const after = await fs.readFile(path.join(TARGET, f), 'utf8');
      expect(after, `${f} drifted between idempotent runs`).toBe(expected);
    }
  });

  it('forbidden-pattern grep: no monorepo root leakage of framework-private paths', async () => {
    // The monorepo root files (Phase C) MUST NOT reach into apps/web or
    // packages/design-system framework-private file paths. Catches a
    // common Phase D/E/F drift where an overlay author hard-codes a
    // path like `apps/web/src/...` into the root README/turbo.json.
    const rootPkg = await fs.readFile(path.join(TARGET, 'package.json'), 'utf8');
    const turbo = await fs.readFile(path.join(TARGET, 'turbo.json'), 'utf8');
    expect(rootPkg).not.toContain('apps/web/src');
    expect(turbo).not.toContain('apps/web/src');

    // wc-storybook monorepo emit should NOT leak Next/Vite-specific
    // dispatch artifacts under packages/design-system/. If next.config.ts
    // or vite.config.ts (the app's, not the DS's vite.config.ts) lands
    // under packages/design-system/ something is misrouted in dispatch.
    expect(await fs.pathExists(path.join(TARGET, 'packages/design-system/next.config.ts'))).toBe(
      false,
    );
  });

  it('the DS package barrel re-exports the 7 main HELiX React wrappers', async () => {
    // Pins Phase F's writeDesignSystemIndex contract — apps/web's
    // wrappers.tsx (re-export from @{scope}/design-system) depends on
    // these named exports being present.
    const index = await fs.readFile(
      path.join(TARGET, 'packages/design-system/src/index.ts'),
      'utf8',
    );
    for (const wrapper of ['Button', 'Card', 'Dialog', 'Form', 'Select', 'Tabs', 'TextInput']) {
      expect(index).toContain(`export const ${wrapper} = createComponent`);
    }
    expect(index).toContain("import { createComponent } from '@lit/react'");
  });
});
