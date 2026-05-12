/**
 * Golden-snapshot test for the astro MONOREPO emit shape (v0.8.0 Phase E).
 *
 * Mirror of tests/golden/{react-next,react-vite,wc-storybook}-monorepo/
 * golden.test.ts for the Astro flavor. Three independent guarantees:
 *
 *   1. File-tree contract — ~40 representative files (root scaffold +
 *      apps/web tree + packages/{design-system,types,utils} key entries)
 *      must land on disk; anything missing trips this test, not a release.
 *   2. Byte-identical idempotency — a second scaffold over the same dir
 *      produces the same bytes for curated JSON / text files. Phase C
 *      did NOT introduce randomBytes content like the Next.js navbar's
 *      UTM ID, so the Astro overlay is straightforwardly deterministic
 *      and the snapshot includes the apps/web pages + Layout.astro.
 *   3. Forbidden-pattern grep — no `?raw` imports under apps/web,
 *      no Lorem placeholder copy, no healthcare-locked sample text per
 *      `feedback_realistic_sample_data` memory rule, and (regression
 *      pin) no stale `library="helix" name="shield-check"` icon
 *      references from the Phase D follow-up FA-free fix.
 *
 * The Astro monorepo entry routes through scaffold/astro/monorepo.ts
 * via the framework dispatch (Phase A) and produces apps/web with
 * native web component usage (Phase C). The integration suite at
 * tests/integration/frameworks/astro-monorepo.test.ts pins finer
 * assertions about DS opt-out + per-file content; this file owns the
 * FILE-LIST contract.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';

const TARGET = '/tmp/helix-golden-astro-monorepo';

const FIXED_OPTIONS: ProjectOptions = {
  name: 'golden-astro',
  directory: TARGET,
  framework: 'astro',
  componentBundles: ['core'],
  typescript: true,
  eslint: true,
  designTokens: true,
  darkMode: false,
  installDeps: false,
  force: true,
  monorepoMode: true,
  includeDesignSystem: true,
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

describe('astro monorepo factory — golden snapshot (v0.8.0 Phase E)', () => {
  beforeAll(async () => {
    await fs.remove(TARGET);
    await scaffoldProject(FIXED_OPTIONS);
  });

  afterAll(async () => {
    await fs.remove(TARGET);
  });

  it('emits the canonical monorepo file-tree (~40 representative files)', async () => {
    const actual = await walkFiles(TARGET);

    const required = [
      // Monorepo root (Phase C — scaffoldMonorepoRoot).
      'pnpm-workspace.yaml',
      'turbo.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'package.json',
      'README.md',
      '.gitignore',
      // apps/web identity + config (Phase C overlays).
      'apps/web/package.json',
      'apps/web/astro.config.mjs',
      'apps/web/tsconfig.json',
      // apps/web src structure.
      'apps/web/src/env.d.ts',
      'apps/web/src/layouts/Layout.astro',
      'apps/web/src/pages/index.astro',
      'apps/web/src/pages/components.astro',
      'apps/web/src/components/ThemeToggle.astro',
      // apps/web public assets.
      'apps/web/public/favicon.svg',
      // packages/design-system (Phase F secondary invocation — wc-storybook
      // factory body lands under packages/design-system/ when DS opted in).
      'packages/design-system/package.json',
      'packages/design-system/tsconfig.json',
      'packages/design-system/tsconfig.build.json',
      'packages/design-system/src/index.ts',
      'packages/design-system/.storybook/main.ts',
      'packages/design-system/.storybook/preview.ts',
      // Foundational MDX surface inherited from wc-storybook flat factory.
      'packages/design-system/src/stories/Cover.mdx',
      'packages/design-system/src/stories/foundations/Iconography.mdx',
      'packages/design-system/src/stories/foundations/Tokens.mdx',
      // Token pipeline output.
      'packages/design-system/src/tokens/tokens.css',
      'packages/design-system/src/tokens/tokens.json',
      // packages/types (Phase G stub).
      'packages/types/package.json',
      'packages/types/tsconfig.json',
      'packages/types/src/index.ts',
      // packages/utils (Phase G stub).
      'packages/utils/package.json',
      'packages/utils/tsconfig.json',
      'packages/utils/src/index.ts',
    ];

    const missing = required.filter((f) => !actual.includes(f));
    if (missing.length > 0) {
      throw new Error(
        `Golden snapshot — missing astro monorepo artefacts:\n  ${missing.join('\n  ')}\n\nIf the rename / move is intentional, update the required[] array in tests/golden/astro-monorepo/golden.test.ts.`,
      );
    }
    expect(missing).toEqual([]);
  });

  it('byte-identical re-scaffold for the JSON/text overlay files (idempotency, DXA F5)', async () => {
    // Astro monorepo overlay has NO randomBytes / UTM IDs (unlike
    // Next.js's navbar.tsx). Every file the Phase C overlay owns is
    // byte-stable across runs; the wc-storybook DS factory body
    // re-emitted under packages/design-system/ is likewise deterministic.
    const snapshotFiles = [
      // Monorepo root.
      'pnpm-workspace.yaml',
      'turbo.json',
      'tsconfig.json',
      'tsconfig.base.json',
      'package.json',
      '.gitignore',
      'README.md',
      // apps/web — full Astro overlay surface, all deterministic.
      'apps/web/package.json',
      'apps/web/astro.config.mjs',
      'apps/web/tsconfig.json',
      'apps/web/src/env.d.ts',
      'apps/web/src/layouts/Layout.astro',
      'apps/web/src/pages/index.astro',
      'apps/web/src/pages/components.astro',
      'apps/web/src/components/ThemeToggle.astro',
      // Workspace package overlays.
      'packages/design-system/package.json',
      'packages/design-system/tsconfig.json',
      'packages/design-system/src/index.ts',
      'packages/types/package.json',
      'packages/types/src/index.ts',
      'packages/utils/package.json',
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

  it('forbidden-pattern grep: no monorepo root leakage of apps/web artifacts', async () => {
    // The reverse — apps/web's astro.config / Layout / pages should NOT
    // shadow the monorepo root. If anything below exists, dispatch is
    // misrouted (the flat scaffold leaked through past the overlay).
    const forbiddenAtRoot = [
      'astro.config.mjs',
      'src/layouts/Layout.astro',
      'src/pages/index.astro',
      'src/components/ThemeToggle.astro',
      // Cross-framework leakage canaries.
      'next.config.ts',
      'vite.config.ts',
      'index.html',
    ];
    for (const rel of forbiddenAtRoot) {
      const exists = await fs.pathExists(path.join(TARGET, rel));
      expect(exists, `unexpected flat/cross-framework leakage at monorepo root: ${rel}`).toBe(
        false,
      );
    }
  });

  it('forbidden-pattern grep: apps/web has no ?raw imports, Lorem, or healthcare copy', async () => {
    // ?raw imports of monorepo-internal paths would defeat workspace:* +
    // optimizeDeps wiring. Lorem placeholder copy violates the
    // feedback_realistic_sample_data rule. Healthcare-locked copy
    // violates the generic-cross-domain rule from the same memory.
    const appsWebFiles = [
      'apps/web/src/layouts/Layout.astro',
      'apps/web/src/pages/index.astro',
      'apps/web/src/pages/components.astro',
      'apps/web/src/components/ThemeToggle.astro',
    ];

    for (const rel of appsWebFiles) {
      const content = await fs.readFile(path.join(TARGET, rel), 'utf8');
      const lower = content.toLowerCase();

      // No ?raw imports referencing workspace-internal paths.
      expect(content, `${rel} contains a ?raw import`).not.toMatch(/import\s+.*\?raw/);

      // No Lorem placeholder copy.
      expect(lower, `${rel} contains Lorem placeholder`).not.toContain('lorem ipsum');

      // No healthcare-domain-locked sample copy (per
      // feedback_realistic_sample_data — sample content must be
      // generic-cross-domain, not vertical-locked).
      for (const term of ['patient', 'clinic', 'hipaa', 'medical record', 'pharmacy']) {
        expect(lower, `${rel} contains healthcare-locked copy: ${term}`).not.toContain(term);
      }
    }
  });

  it('forbidden-pattern grep: no stale `library="helix" name="shield-check"` icon refs', async () => {
    // Phase D follow-up regression pin — the index page initially used
    // helix-library icons that don't exist (rendered zero-size SVGs).
    // The fix swapped them to fa-free icons. If a future copy edit
    // accidentally reverts to the helix library names, this test trips
    // BEFORE the next visual regression run catches it.
    const index = await fs.readFile(path.join(TARGET, 'apps/web/src/pages/index.astro'), 'utf8');
    expect(index, 'stale library="helix" name="shield-check" reference re-introduced').not.toMatch(
      /library="helix"\s+name="shield-check"/,
    );
    // And the converse — confirm the FA-free names landed.
    expect(index).toMatch(/library="fa-free"\s+name="shield-halved"/);
    expect(index).toMatch(/library="fa-free"\s+name="palette"/);
    expect(index).toMatch(/library="fa-free"\s+name="rocket"/);
  });

  it('apps/web/package.json names the workspace + lists workspace:* deps', async () => {
    // Cross-check that the file-tree contract is paired with the right
    // package identity (the package.json under apps/web/ is the @scope/web
    // entry, not the monorepo root package.json).
    const pkg = await fs.readJson(path.join(TARGET, 'apps/web/package.json'));
    expect(pkg.name).toBe('@golden-astro/web');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies['@golden-astro/design-system']).toBe('workspace:*');
    expect(pkg.dependencies['@golden-astro/types']).toBe('workspace:*');
    expect(pkg.dependencies['@golden-astro/utils']).toBe('workspace:*');
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies.astro).toMatch(/^\^5\./);
  });
});
