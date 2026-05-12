/**
 * v0.8.0 Phase C — Astro monorepo emit (apps/web with native web components).
 *
 * Pins the contract documented on scaffold/astro/monorepo.ts:
 *
 *   - apps/web is a complete Astro 5 scaffold with a serious landing
 *     page, not the monorepo root.
 *   - apps/web/package.json names the package @{scope}/web with
 *     workspace:* deps on types + utils (and design-system when opted
 *     in) AND a direct @helixui/library dep so the runtime loader
 *     resolves outside the design-system package surface.
 *   - apps/web/astro.config.mjs has vite.optimizeDeps.exclude on every
 *     workspace dep + server.fs.allow on '..' + '../..' for cross-package
 *     source resolution.
 *   - apps/web/tsconfig.json extends ../../tsconfig.base.json with jsx:
 *     preserve and .astro in include.
 *   - apps/web/src/layouts/Layout.astro contains the inline
 *     `<script>import '@helixui/library'</script>` runtime loader,
 *     the <ClientRouter /> view-transitions component (Astro 5's
 *     rename of <ViewTransitions />), and the tokens import.
 *   - apps/web/src/pages/index.astro is the serious landing page —
 *     uses <hx-button>, <hx-card>, <hx-icon>, <hx-text-input>,
 *     <hx-checkbox>, <hx-tabs> natively.
 *   - apps/web/src/pages/components.astro is the second route that
 *     demonstrates view transitions.
 *   - apps/web/src/components/ThemeToggle.astro flips <html data-theme>
 *     between 'light' and 'dark' and persists to localStorage.
 *   - includeDesignSystem:false drops the @{scope}/design-system dep
 *     and routes the tokens import to @helixui/tokens directly.
 *   - A second run over the same dir produces byte-identical output
 *     (idempotency — no timestamps, no install-IDs, no version drift).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scaffold } from '../api.js';

const TEST_ROOT = path.join(tmpdir(), `create-helix-phase-c-astro-${process.pid}`);

beforeEach(async () => {
  await fs.ensureDir(TEST_ROOT);
});

afterEach(async () => {
  await fs.remove(TEST_ROOT);
});

async function scaffoldAstroMr(args: {
  dir: string;
  name?: string;
  includeDesignSystem?: boolean;
}): Promise<void> {
  const result = await scaffold({
    name: args.name ?? 'phase-c-astro',
    directory: args.dir,
    framework: 'astro',
    monorepoMode: true,
    includeDesignSystem: args.includeDesignSystem ?? true,
    force: true,
    installDeps: false,
  });
  expect(result.success).toBe(true);
}

describe('v0.8.0 Phase C — astro monorepo emits the full apps/web tree', () => {
  it('produces every expected file under apps/web/', async () => {
    const dir = path.join(TEST_ROOT, 'tree');
    await scaffoldAstroMr({ dir });

    // Top-level apps/web files.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'astro.config.mjs'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'tsconfig.json'))).toBe(true);

    // src/ structure.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'env.d.ts'))).toBe(true);
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'layouts', 'Layout.astro')),
    ).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'pages', 'index.astro'))).toBe(
      true,
    );
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'pages', 'components.astro')),
    ).toBe(true);
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'components', 'ThemeToggle.astro')),
    ).toBe(true);

    // Public assets.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'public', 'favicon.svg'))).toBe(true);

    // Monorepo root structure (Phase C calls scaffoldMonorepoRoot first).
    expect(await fs.pathExists(path.join(dir, 'pnpm-workspace.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'turbo.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'tsconfig.base.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'types'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'utils'))).toBe(true);

    // Workspace DS package present when includeDesignSystem is true (default).
    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(true);

    // Nothing leaked back to the monorepo root.
    expect(await fs.pathExists(path.join(dir, 'astro.config.mjs'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'src', 'layouts', 'Layout.astro'))).toBe(false);
  });

  it('apps/web/package.json names the package @{scope}/web with workspace:* deps', async () => {
    const dir = path.join(TEST_ROOT, 'pkg');
    await scaffoldAstroMr({ dir, name: 'aurora-app' });

    const pkg = await fs.readJson(path.join(dir, 'apps', 'web', 'package.json'));
    expect(pkg.name).toBe('@aurora-app/web');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');

    // workspace:* refs to types + utils + design-system (DS included by default).
    expect(pkg.dependencies['@aurora-app/design-system']).toBe('workspace:*');
    expect(pkg.dependencies['@aurora-app/types']).toBe('workspace:*');
    expect(pkg.dependencies['@aurora-app/utils']).toBe('workspace:*');

    // Astro + the direct @helixui/library dep for the runtime loader.
    expect(pkg.dependencies.astro).toMatch(/^\^5\./);
    expect(pkg.dependencies['@helixui/library']).toBeDefined();

    // Astro-specific scripts.
    expect(pkg.scripts.dev).toBe('astro dev');
    expect(pkg.scripts.build).toBe('astro check && astro build');
    expect(pkg.scripts.preview).toBe('astro preview');
    expect(pkg.scripts['type-check']).toBe('astro check');

    // devDependencies include @astrojs/check for the type-checker.
    expect(pkg.devDependencies['@astrojs/check']).toBeDefined();
  });

  it('apps/web/astro.config.mjs has optimizeDeps.exclude + server.fs.allow', async () => {
    const dir = path.join(TEST_ROOT, 'astrocfg');
    await scaffoldAstroMr({ dir, name: 'aurora-app' });

    const config = await fs.readFile(path.join(dir, 'apps', 'web', 'astro.config.mjs'), 'utf8');
    expect(config).toContain('defineConfig');
    expect(config).toContain('optimizeDeps');
    expect(config).toContain("'@aurora-app/design-system'");
    expect(config).toContain("'@aurora-app/types'");
    expect(config).toContain("'@aurora-app/utils'");
    expect(config).toContain('fs:');
    expect(config).toContain("'..'");
    expect(config).toContain("'../..'");
    expect(config).toContain("output: 'static'");
  });

  it('apps/web/tsconfig.json extends the monorepo tsconfig.base.json', async () => {
    const dir = path.join(TEST_ROOT, 'tsconfig');
    await scaffoldAstroMr({ dir });

    const tsconfig = await fs.readJson(path.join(dir, 'apps', 'web', 'tsconfig.json'));
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
    expect(tsconfig.compilerOptions.jsx).toBe('preserve');
    expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['./src/*']);
    expect(tsconfig.include).toContain('src/**/*.astro');
    expect(tsconfig.exclude).toContain('.astro');

    // tsconfig.base.json carries the shared compilerOptions.
    const base = await fs.readJson(path.join(dir, 'tsconfig.base.json'));
    expect(base.compilerOptions.strict).toBe(true);
    expect(base.compilerOptions.moduleResolution).toBe('bundler');
  });

  it('Layout.astro wires the HELiX runtime loader + view transitions + tokens', async () => {
    const dir = path.join(TEST_ROOT, 'layout');
    await scaffoldAstroMr({ dir, name: 'aurora-app' });

    const layout = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'layouts', 'Layout.astro'),
      'utf8',
    );

    // The runtime loader — Astro processes <script> + Vite bundles the
    // import; runs in the browser; calls customElements.define() once.
    expect(layout).toContain("import '@helixui/library'");
    expect(layout).toMatch(/<script>\s*\n\s*import '@helixui\/library';\s*\n\s*<\/script>/);

    // View transitions — Astro 5's ClientRouter (renamed from
    // <ViewTransitions /> in v4).
    expect(layout).toContain('ClientRouter');
    expect(layout).toContain("import { ClientRouter } from 'astro:transitions'");

    // Tokens import targets the DS package's './tokens' export entry.
    expect(layout).toContain("import '@aurora-app/design-system/tokens'");

    // Theme-restore boot script (is:inline so it fires before paint).
    expect(layout).toContain('is:inline');
    expect(layout).toContain("localStorage.getItem('theme')");

    // Reduced-motion respect.
    expect(layout).toContain('prefers-reduced-motion');

    // Skip-link for keyboard accessibility.
    expect(layout).toContain('skip-link');
  });

  it('index.astro uses native web components (hx-button, hx-card, hx-icon, etc.)', async () => {
    const dir = path.join(TEST_ROOT, 'index');
    await scaffoldAstroMr({ dir });

    const index = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'pages', 'index.astro'),
      'utf8',
    );

    // Native web components — no React wrappers, no client: directives.
    expect(index).toContain('<hx-button');
    expect(index).toContain('<hx-card');
    expect(index).toContain('<hx-icon');
    expect(index).toContain('<hx-text-input');
    expect(index).toContain('<hx-checkbox');
    expect(index).toContain('<hx-tabs');

    // No React wrapper imports.
    expect(index).not.toContain('createComponent');
    expect(index).not.toContain('@lit/react');
    expect(index).not.toContain('client:visible');
    expect(index).not.toContain('client:load');

    // Uses the Layout + ThemeToggle.
    expect(index).toContain("import Layout from '../layouts/Layout.astro'");
    expect(index).toContain("import ThemeToggle from '../components/ThemeToggle.astro'");

    // Accessibility — semantic landmark + skip-link target.
    expect(index).toContain('<main id="main">');
    expect(index).toContain('aria-labelledby');

    // No Lorem.
    expect(index.toLowerCase()).not.toContain('lorem ipsum');
  });

  it('index.astro feature cards use the FA-free icon names that actually exist (Phase D follow-up)', async () => {
    // Phase D first emitted `library="helix" name="shield-check"` /
    // similar — the names DON'T exist in the helix icon set, so the
    // browser rendered zero-size SVGs in the feature grid. The fix
    // swapped them to FA-free names. This test pins the FA-free names
    // so a future copy edit can't silently revert the regression
    // (Playwright catches it visually too, but unit-level pin trips
    // first + with a clearer message).
    const dir = path.join(TEST_ROOT, 'icons');
    await scaffoldAstroMr({ dir });

    const index = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'pages', 'index.astro'),
      'utf8',
    );

    // Positive — the three feature-card icons are FA-free.
    expect(index).toMatch(/library="fa-free"\s+name="shield-halved"/);
    expect(index).toMatch(/library="fa-free"\s+name="palette"/);
    expect(index).toMatch(/library="fa-free"\s+name="rocket"/);

    // Negative — none of the stale helix-library names slip back in.
    expect(index).not.toMatch(/library="helix"\s+name="shield-check"/);
    expect(index).not.toMatch(/library="helix"\s+name="palette"/);
    expect(index).not.toMatch(/library="helix"\s+name="rocket"/);
  });

  it('components.astro renders the second route with real component examples', async () => {
    const dir = path.join(TEST_ROOT, 'components');
    await scaffoldAstroMr({ dir });

    const page = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'pages', 'components.astro'),
      'utf8',
    );

    // Real component usage.
    expect(page).toContain('<hx-button');
    expect(page).toContain('<hx-text-input');
    expect(page).toContain('<hx-card');
    expect(page).toContain('<hx-badge');
    expect(page).toContain('<hx-alert');

    // Reuses the shared layout.
    expect(page).toContain("import Layout from '../layouts/Layout.astro'");

    // Back-to-home link makes the nav symmetric across the two routes.
    expect(page).toContain('href="/"');
  });

  it('ThemeToggle.astro flips html[data-theme] and persists to localStorage', async () => {
    const dir = path.join(TEST_ROOT, 'theme');
    await scaffoldAstroMr({ dir });

    const toggle = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'components', 'ThemeToggle.astro'),
      'utf8',
    );

    expect(toggle).toContain("setAttribute('data-theme'");
    expect(toggle).toContain("localStorage.setItem('theme'");
    expect(toggle).toContain('aria-label="Toggle color theme"');

    // Re-binds on view-transition navigation.
    expect(toggle).toContain('astro:after-swap');
  });
});

describe('v0.8.0 Phase C — includeDesignSystem:false falls back to upstream tokens', () => {
  it('drops the DS dep from package.json + swaps tokens to @helixui/tokens', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds');
    await scaffoldAstroMr({ dir, name: 'plain-app', includeDesignSystem: false });

    const pkg = await fs.readJson(path.join(dir, 'apps', 'web', 'package.json'));
    expect(pkg.dependencies['@plain-app/design-system']).toBeUndefined();
    expect(pkg.dependencies['@plain-app/types']).toBe('workspace:*');
    expect(pkg.dependencies['@plain-app/utils']).toBe('workspace:*');

    // @helixui/library still present (runtime loader needs it).
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    // @helixui/tokens now a direct dep since the DS-package CSS layer
    // isn't there to inherit.
    expect(pkg.dependencies['@helixui/tokens']).toBeDefined();
  });

  it('astro.config.mjs drops the DS entry from optimizeDeps.exclude', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds-cfg');
    await scaffoldAstroMr({ dir, name: 'plain-app', includeDesignSystem: false });

    const config = await fs.readFile(path.join(dir, 'apps', 'web', 'astro.config.mjs'), 'utf8');
    expect(config).not.toContain('@plain-app/design-system');
    expect(config).toContain("'@plain-app/types'");
    expect(config).toContain("'@plain-app/utils'");
  });

  it('Layout.astro tokens import targets @helixui/tokens directly', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds-layout');
    await scaffoldAstroMr({ dir, name: 'plain-app', includeDesignSystem: false });

    const layout = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'layouts', 'Layout.astro'),
      'utf8',
    );
    expect(layout).toContain("import '@helixui/tokens/tokens.css'");
    expect(layout).not.toContain("'@plain-app/design-system/tokens'");

    // Runtime loader still resolves @helixui/library directly.
    expect(layout).toContain("import '@helixui/library'");
  });

  it('packages/design-system is NOT created when DS is opted out', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds-dir');
    await scaffoldAstroMr({ dir, includeDesignSystem: false });
    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'packages', 'types'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'utils'))).toBe(true);
  });
});

describe('v0.8.0 Phase C — idempotency', () => {
  // Every file Phase C's apps/web overlay owns is byte-stable across
  // re-runs (no timestamps, no random IDs). The monorepo-root snapshot
  // is covered by Phase C's react-next-monorepo / react-vite-monorepo
  // idempotency tests; we focus on the Astro-owned files here.
  it('running the monorepo scaffolder twice produces byte-identical apps/web files', async () => {
    const dir = path.join(TEST_ROOT, 'idem');
    await scaffoldAstroMr({ dir });

    const snapshotFiles = [
      'apps/web/package.json',
      'apps/web/astro.config.mjs',
      'apps/web/tsconfig.json',
      'apps/web/src/env.d.ts',
      'apps/web/src/layouts/Layout.astro',
      'apps/web/src/pages/index.astro',
      'apps/web/src/pages/components.astro',
      'apps/web/src/components/ThemeToggle.astro',
      'apps/web/public/favicon.svg',
      'tsconfig.base.json',
      'pnpm-workspace.yaml',
      'turbo.json',
    ];

    const before: Record<string, string> = {};
    for (const f of snapshotFiles) {
      before[f] = await fs.readFile(path.join(dir, f), 'utf8');
    }

    await scaffoldAstroMr({ dir });

    for (const [f, expected] of Object.entries(before)) {
      const after = await fs.readFile(path.join(dir, f), 'utf8');
      expect(after, `${f} drifted between idempotent runs`).toBe(expected);
    }
  });
});
