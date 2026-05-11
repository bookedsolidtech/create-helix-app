/**
 * v0.7.0 Phase D — Next.js monorepo emit (apps/web).
 *
 * Pins the contract documented on scaffold/react-next/monorepo.ts:
 *
 *   - apps/web is a complete Next.js 16 + App Router scaffold, not the
 *     monorepo root.
 *   - apps/web/package.json depends on @{scope}/design-system,
 *     @{scope}/types, and @{scope}/utils at workspace:*.
 *   - apps/web/next.config.ts has transpilePackages + experimental.externalDir
 *     so workspace TypeScript sources resolve at build time.
 *   - apps/web/tsconfig.json extends ../../tsconfig.base.json (not the
 *     project-references root tsconfig.json — TypeScript treats files +
 *     references and compilerOptions + extends as mutually exclusive).
 *   - apps/web/src/components/helix/wrappers.tsx re-exports from the
 *     workspace DS package when includeDesignSystem is true; falls back to
 *     direct @helixui/library imports when it isn't.
 *   - includeDesignSystem:false drops the @{scope}/design-system dep AND
 *     drops it from transpilePackages — keeping the latter would crash
 *     `next build` at module-graph time on a phantom workspace package.
 *   - A second run over the same dir produces byte-identical output
 *     (idempotency — no timestamps, no install-IDs in
 *     monorepo-controlled files, no version drift).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scaffold } from '../api.js';

const TEST_ROOT = path.join(tmpdir(), `create-helix-phase-d-${process.pid}`);

beforeEach(async () => {
  await fs.ensureDir(TEST_ROOT);
});

afterEach(async () => {
  await fs.remove(TEST_ROOT);
});

async function scaffoldRn(args: {
  dir: string;
  name?: string;
  includeDesignSystem?: boolean;
}): Promise<void> {
  const result = await scaffold({
    name: args.name ?? 'phase-d-rn',
    directory: args.dir,
    framework: 'react-next',
    monorepoMode: true,
    includeDesignSystem: args.includeDesignSystem ?? true,
    force: true,
    installDeps: false,
  });
  expect(result.success).toBe(true);
}

describe('v0.7.0 Phase D — react-next monorepo emits the full apps/web tree', () => {
  it('produces every expected file under apps/web/', async () => {
    const dir = path.join(TEST_ROOT, 'tree');
    await scaffoldRn({ dir });

    // Top-level apps/web files.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'next.config.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'tsconfig.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'helix-tokens.css'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'helix-responsive.css'))).toBe(true);

    // App Router structure.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'app', 'page.tsx'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'app', 'layout.tsx'))).toBe(
      true,
    );
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'app', 'globals.css'))).toBe(
      true,
    );

    // Component layer.
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'components', 'navbar.tsx')),
    ).toBe(true);
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'components', 'footer.tsx')),
    ).toBe(true);
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'components', 'theme-toggle.tsx')),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(dir, 'apps', 'web', 'src', 'components', 'helix', 'provider.tsx'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(dir, 'apps', 'web', 'src', 'components', 'helix', 'wrappers.tsx'),
      ),
    ).toBe(true);

    // JSX type declarations + helix-setup integration helper.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'helix.d.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'helix-setup.ts'))).toBe(true);

    // Examples that the landing page links to.
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'app', 'examples', 'forms')),
    ).toBe(true);
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'app', 'examples', 'dashboard')),
    ).toBe(true);

    // Brand asset copy (the OG images the navbar/footer reference).
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'public', 'og'))).toBe(true);

    // Nothing leaked back to the monorepo root.
    expect(await fs.pathExists(path.join(dir, 'src', 'helix-setup.ts'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'helix-tokens.css'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'next.config.ts'))).toBe(false);
  });

  it('apps/web/package.json names the package @{scope}/web with workspace:* deps', async () => {
    const dir = path.join(TEST_ROOT, 'pkg');
    await scaffoldRn({ dir, name: 'aurora-app' });

    const pkg = await fs.readJson(path.join(dir, 'apps', 'web', 'package.json'));
    expect(pkg.name).toBe('@aurora-app/web');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');

    // workspace:* refs.
    expect(pkg.dependencies['@aurora-app/design-system']).toBe('workspace:*');
    expect(pkg.dependencies['@aurora-app/types']).toBe('workspace:*');
    expect(pkg.dependencies['@aurora-app/utils']).toBe('workspace:*');

    // Next + React versions match the flat template.
    expect(pkg.dependencies.next).toMatch(/^\^16\./);
    expect(pkg.dependencies.react).toMatch(/^\^19\./);
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies['@lit/react']).toBeDefined();

    // App-side scripts (Turbo calls these from the root).
    expect(pkg.scripts.dev).toBe('next dev');
    expect(pkg.scripts.build).toBe('next build');
  });

  it('apps/web/next.config.ts transpiles every workspace package + opts in to externalDir', async () => {
    const dir = path.join(TEST_ROOT, 'nextcfg');
    await scaffoldRn({ dir, name: 'aurora-app' });

    const config = await fs.readFile(path.join(dir, 'apps', 'web', 'next.config.ts'), 'utf8');
    expect(config).toContain('transpilePackages');
    expect(config).toContain("'@aurora-app/design-system'");
    expect(config).toContain("'@aurora-app/types'");
    expect(config).toContain("'@aurora-app/utils'");
    expect(config).toMatch(/externalDir:\s*true/);
  });

  it('apps/web/tsconfig.json extends the monorepo tsconfig.base.json', async () => {
    const dir = path.join(TEST_ROOT, 'tsconfig');
    await scaffoldRn({ dir });

    const tsconfig = await fs.readJson(path.join(dir, 'apps', 'web', 'tsconfig.json'));
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
    expect(tsconfig.compilerOptions.jsx).toBe('preserve');
    expect(tsconfig.compilerOptions.noEmit).toBe(true);
    expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['./src/*']);

    // The base file itself exists at the monorepo root and carries the
    // shared compilerOptions (per Phase D's contract — the root
    // tsconfig.json is a project-references file and cannot also host
    // compilerOptions for `extends` to inherit).
    const base = await fs.readJson(path.join(dir, 'tsconfig.base.json'));
    expect(base.compilerOptions.strict).toBe(true);
    expect(base.compilerOptions.moduleResolution).toBe('bundler');
  });

  it('wrappers.tsx re-exports from @{scope}/design-system when DS is opted in', async () => {
    const dir = path.join(TEST_ROOT, 'wrappers');
    await scaffoldRn({ dir, name: 'aurora-app' });

    const wrappers = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'components', 'helix', 'wrappers.tsx'),
      'utf8',
    );
    expect(wrappers).toContain("export * from '@aurora-app/design-system'");
    // The flat path's direct @helixui/library imports MUST be absent —
    // wrappers.tsx is fully replaced by the DS re-export.
    expect(wrappers).not.toContain('createComponent');
    expect(wrappers).not.toContain("'@helixui/library/components/hx-button'");
  });
});

describe('v0.7.0 Phase D — includeDesignSystem:false falls back to direct @helixui/library', () => {
  it('drops the DS dep from package.json + transpilePackages', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds');
    await scaffoldRn({ dir, name: 'plain-app', includeDesignSystem: false });

    const pkg = await fs.readJson(path.join(dir, 'apps', 'web', 'package.json'));
    expect(pkg.dependencies['@plain-app/design-system']).toBeUndefined();
    expect(pkg.dependencies['@plain-app/types']).toBe('workspace:*');
    expect(pkg.dependencies['@plain-app/utils']).toBe('workspace:*');

    const config = await fs.readFile(path.join(dir, 'apps', 'web', 'next.config.ts'), 'utf8');
    expect(config).not.toContain('design-system');
    expect(config).toContain('@plain-app/types');
  });

  it('wrappers.tsx keeps the flat path direct @helixui/library imports', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds-wrappers');
    await scaffoldRn({ dir, includeDesignSystem: false });

    const wrappers = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'components', 'helix', 'wrappers.tsx'),
      'utf8',
    );
    expect(wrappers).toContain('createComponent');
    expect(wrappers).toContain("'@helixui/library/components/hx-button'");
    expect(wrappers).toContain('HxButton');
  });

  it('packages/design-system is NOT created when DS is opted out', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds-dir');
    await scaffoldRn({ dir, includeDesignSystem: false });
    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'packages', 'types'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'utils'))).toBe(true);
  });
});

describe('v0.7.0 Phase D — idempotency', () => {
  // Note: navbar.tsx is deliberately excluded from the byte-identical
  // snapshot. The flat scaffolder bakes a per-install randomBytes UTM
  // ID into the UTM URL for the Booked Solid header logo — that's a
  // pre-existing flat behavior, not a Phase D regression. Everything
  // the monorepo overlay owns (package.json, next.config.ts,
  // tsconfig.json, wrappers.tsx, tsconfig.base.json, pnpm-workspace.yaml)
  // IS byte-stable and that's what this test pins.
  it('running the monorepo scaffolder twice produces byte-identical monorepo-owned files', async () => {
    const dir = path.join(TEST_ROOT, 'idem');
    await scaffoldRn({ dir });

    const snapshotFiles = [
      'apps/web/package.json',
      'apps/web/next.config.ts',
      'apps/web/tsconfig.json',
      'apps/web/src/app/layout.tsx',
      'apps/web/src/app/globals.css',
      'apps/web/src/components/helix/wrappers.tsx',
      'tsconfig.base.json',
      'pnpm-workspace.yaml',
      'turbo.json',
      'package.json',
    ];

    const before: Record<string, string> = {};
    for (const f of snapshotFiles) {
      before[f] = await fs.readFile(path.join(dir, f), 'utf8');
    }

    await scaffoldRn({ dir });

    for (const [f, expected] of Object.entries(before)) {
      const after = await fs.readFile(path.join(dir, f), 'utf8');
      expect(after, `${f} drifted between idempotent runs`).toBe(expected);
    }
  });
});

describe('v0.7.0 Phase D — apps/web/src/app/layout.tsx wires up the existing token surface', () => {
  it('imports ../../helix-tokens.css (which resolves under apps/web/, not the monorepo root)', async () => {
    const dir = path.join(TEST_ROOT, 'layout');
    await scaffoldRn({ dir });

    const layout = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'app', 'layout.tsx'),
      'utf8',
    );
    // The relative path from src/app/layout.tsx → apps/web/helix-tokens.css
    // is "../../helix-tokens.css" — confirms the token file lives where
    // the layout expects it (apps/web/ root, not the monorepo root).
    expect(layout).toContain("import '../../helix-tokens.css'");

    // The referenced file actually exists at that target.
    const resolved = path.resolve(
      path.dirname(path.join(dir, 'apps', 'web', 'src', 'app', 'layout.tsx')),
      '../../helix-tokens.css',
    );
    expect(await fs.pathExists(resolved)).toBe(true);
  });
});
