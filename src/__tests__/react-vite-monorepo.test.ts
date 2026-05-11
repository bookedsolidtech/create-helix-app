/**
 * v0.7.0 Phase E — react-vite monorepo emit (apps/web).
 *
 * Pins the contract documented on scaffold/react-vite/monorepo.ts:
 *
 *   - apps/web is a complete React + Vite SPA scaffold, not the
 *     monorepo root.
 *   - apps/web/package.json depends on @{scope}/design-system,
 *     @{scope}/types, and @{scope}/utils at workspace:*.
 *   - apps/web/vite.config.ts has optimizeDeps.exclude with the
 *     workspace deps AND server.fs.allow so workspace TypeScript
 *     sources resolve in dev.
 *   - apps/web/tsconfig.json extends ../../tsconfig.base.json (not the
 *     project-references root tsconfig.json — TypeScript treats files +
 *     references and compilerOptions + extends as mutually exclusive).
 *   - apps/web/src/components/helix/wrappers.tsx re-exports from the
 *     workspace DS package when includeDesignSystem is true; falls back
 *     to direct @helixui/library imports when it isn't.
 *   - includeDesignSystem:false drops the @{scope}/design-system dep AND
 *     drops it from optimizeDeps.exclude — keeping the latter would
 *     surface as a confusing import resolve error on `vite dev`.
 *   - A second run over the same dir produces byte-identical output
 *     for monorepo-controlled files (idempotency — no timestamps, no
 *     install-IDs, no version drift).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scaffold } from '../api.js';

const TEST_ROOT = path.join(tmpdir(), `create-helix-phase-e-${process.pid}`);

beforeEach(async () => {
  await fs.ensureDir(TEST_ROOT);
});

afterEach(async () => {
  await fs.remove(TEST_ROOT);
});

async function scaffoldRv(args: {
  dir: string;
  name?: string;
  includeDesignSystem?: boolean;
}): Promise<void> {
  const result = await scaffold({
    name: args.name ?? 'phase-e-rv',
    directory: args.dir,
    framework: 'react-vite',
    monorepoMode: true,
    includeDesignSystem: args.includeDesignSystem ?? true,
    force: true,
    installDeps: false,
  });
  expect(result.success).toBe(true);
}

describe('v0.7.0 Phase E — react-vite monorepo emits the full apps/web tree', () => {
  it('produces every expected file under apps/web/', async () => {
    const dir = path.join(TEST_ROOT, 'tree');
    await scaffoldRv({ dir });

    // Top-level apps/web files.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'vite.config.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'tsconfig.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'index.html'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'helix-tokens.css'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'helix-responsive.css'))).toBe(true);

    // src/ structure.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'main.tsx'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'App.tsx'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'index.css'))).toBe(true);

    // Component layer.
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'components', 'Navbar.tsx')),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(dir, 'apps', 'web', 'src', 'components', 'helix', 'wrappers.tsx'),
      ),
    ).toBe(true);

    // JSX type declarations + helix-setup integration helper.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'helix.d.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'helix-setup.ts'))).toBe(true);

    // Brand asset copy (the OG images the navbar/index.html reference).
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'public', 'og'))).toBe(true);

    // Nothing leaked back to the monorepo root.
    expect(await fs.pathExists(path.join(dir, 'src', 'helix-setup.ts'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'helix-tokens.css'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'vite.config.ts'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'index.html'))).toBe(false);
  });

  it('apps/web/package.json names the package @{scope}/web with workspace:* deps', async () => {
    const dir = path.join(TEST_ROOT, 'pkg');
    await scaffoldRv({ dir, name: 'aurora-app' });

    const pkg = await fs.readJson(path.join(dir, 'apps', 'web', 'package.json'));
    expect(pkg.name).toBe('@aurora-app/web');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');

    // workspace:* refs.
    expect(pkg.dependencies['@aurora-app/design-system']).toBe('workspace:*');
    expect(pkg.dependencies['@aurora-app/types']).toBe('workspace:*');
    expect(pkg.dependencies['@aurora-app/utils']).toBe('workspace:*');

    // Vite + React versions match the flat template.
    expect(pkg.dependencies.react).toMatch(/^\^19\./);
    expect(pkg.dependencies['react-dom']).toMatch(/^\^19\./);
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies['@lit/react']).toBeDefined();
    expect(pkg.devDependencies.vite).toMatch(/^\^6\./);
    expect(pkg.devDependencies['@vitejs/plugin-react']).toBeDefined();

    // App-side scripts (Turbo calls these from the root).
    expect(pkg.scripts.dev).toBe('vite');
    expect(pkg.scripts.build).toBe('tsc -b && vite build');
    expect(pkg.scripts.preview).toBe('vite preview');
    expect(pkg.scripts['type-check']).toBe('tsc --noEmit');
  });

  it('apps/web/vite.config.ts excludes every workspace package + opts in to server.fs.allow', async () => {
    const dir = path.join(TEST_ROOT, 'vitecfg');
    await scaffoldRv({ dir, name: 'aurora-app' });

    const config = await fs.readFile(path.join(dir, 'apps', 'web', 'vite.config.ts'), 'utf8');
    expect(config).toContain('optimizeDeps');
    expect(config).toContain('exclude');
    expect(config).toContain("'@aurora-app/design-system'");
    expect(config).toContain("'@aurora-app/types'");
    expect(config).toContain("'@aurora-app/utils'");

    // server.fs.allow lets Vite serve files from the workspace tree above
    // apps/web/. Without this, dev-server requests for ../../packages/*
    // fail the "Serving allowed files" guard.
    expect(config).toContain('fs:');
    expect(config).toContain("'..'");
    expect(config).toContain("'../..'");
  });

  it('apps/web/tsconfig.json extends the monorepo tsconfig.base.json', async () => {
    const dir = path.join(TEST_ROOT, 'tsconfig');
    await scaffoldRv({ dir });

    const tsconfig = await fs.readJson(path.join(dir, 'apps', 'web', 'tsconfig.json'));
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    expect(tsconfig.compilerOptions.noEmit).toBe(true);
    expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['./src/*']);

    // The base file itself exists at the monorepo root and carries the
    // shared compilerOptions (per Phase C's contract — the root
    // tsconfig.json is a project-references file and cannot also host
    // compilerOptions for `extends` to inherit).
    const base = await fs.readJson(path.join(dir, 'tsconfig.base.json'));
    expect(base.compilerOptions.strict).toBe(true);
    expect(base.compilerOptions.moduleResolution).toBe('bundler');
  });

  it('wrappers.tsx re-exports from @{scope}/design-system when DS is opted in', async () => {
    const dir = path.join(TEST_ROOT, 'wrappers');
    await scaffoldRv({ dir, name: 'aurora-app' });

    const wrappers = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'components', 'helix', 'wrappers.tsx'),
      'utf8',
    );
    expect(wrappers).toContain("export * from '@aurora-app/design-system'");
    // The flat path's direct @helixui/library imports MUST be absent —
    // wrappers.tsx is fully replaced by the DS re-export.
    expect(wrappers).not.toContain('createComponent');
    expect(wrappers).not.toContain("'@helixui/library/components/hx-button'");
    // Vite is CSR-only, so the 'use client' directive (Next-specific)
    // should NOT appear here.
    expect(wrappers).not.toContain("'use client'");
  });
});

describe('v0.7.0 Phase E — includeDesignSystem:false falls back to direct @helixui/library', () => {
  it('drops the DS dep from package.json + optimizeDeps.exclude', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds');
    await scaffoldRv({ dir, name: 'plain-app', includeDesignSystem: false });

    const pkg = await fs.readJson(path.join(dir, 'apps', 'web', 'package.json'));
    expect(pkg.dependencies['@plain-app/design-system']).toBeUndefined();
    expect(pkg.dependencies['@plain-app/types']).toBe('workspace:*');
    expect(pkg.dependencies['@plain-app/utils']).toBe('workspace:*');

    const config = await fs.readFile(path.join(dir, 'apps', 'web', 'vite.config.ts'), 'utf8');
    // The exclude list MUST omit @{scope}/design-system. The comment
    // narrating optimizeDeps purpose mentions "design-system source
    // updates" — that comment is fine; what matters is the package
    // identifier doesn't appear in the exclude array.
    expect(config).not.toContain('@plain-app/design-system');
    expect(config).toContain('@plain-app/types');
    expect(config).toContain('@plain-app/utils');
  });

  it('wrappers.tsx keeps the flat path direct @helixui/library imports', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds-wrappers');
    await scaffoldRv({ dir, includeDesignSystem: false });

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
    await scaffoldRv({ dir, includeDesignSystem: false });
    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'packages', 'types'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'utils'))).toBe(true);
  });
});

describe('v0.7.0 Phase E — idempotency', () => {
  // Note: Navbar.tsx is deliberately excluded from the byte-identical
  // snapshot. The flat scaffolder bakes a per-install randomBytes UTM
  // ID into the UTM URL for the Booked Solid header logo — that's a
  // pre-existing flat behavior, not a Phase E regression. Everything
  // the monorepo overlay owns (package.json, vite.config.ts,
  // tsconfig.json, wrappers.tsx, tsconfig.base.json, pnpm-workspace.yaml)
  // IS byte-stable and that's what this test pins.
  it('running the monorepo scaffolder twice produces byte-identical monorepo-owned files', async () => {
    const dir = path.join(TEST_ROOT, 'idem');
    await scaffoldRv({ dir });

    const snapshotFiles = [
      'apps/web/package.json',
      'apps/web/vite.config.ts',
      'apps/web/tsconfig.json',
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

    await scaffoldRv({ dir });

    for (const [f, expected] of Object.entries(before)) {
      const after = await fs.readFile(path.join(dir, f), 'utf8');
      expect(after, `${f} drifted between idempotent runs`).toBe(expected);
    }
  });
});
