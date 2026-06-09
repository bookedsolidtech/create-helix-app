/**
 * v0.9.0 Phase E — SvelteKit monorepo emit (apps/web with native web components).
 *
 * Pins the contract documented on scaffold/sveltekit/monorepo.ts:
 *
 *   - apps/web is a complete SvelteKit 2 scaffold (adapter-static)
 *     under apps/web/, not the monorepo root.
 *   - apps/web/package.json names the package @{scope}/web with
 *     workspace:* deps on types + utils (and design-system when opted
 *     in) AND a direct @helixui/library dep so the runtime loader
 *     resolves outside the design-system package surface.
 *   - apps/web/vite.config.ts has optimizeDeps.exclude on every
 *     workspace dep + server.fs.allow on '..' + '../..' for
 *     cross-package source resolution.
 *   - apps/web/svelte.config.js uses adapter-static + vitePreprocess.
 *   - apps/web/tsconfig.json extends ../../tsconfig.base.json AND the
 *     SvelteKit-generated .svelte-kit/tsconfig.json.
 *   - apps/web/src/routes/+layout.svelte contains the onMount-gated
 *     `import('@helixui/library')` runtime loader, the onNavigate
 *     hook + browser-native View Transitions API, the tokens import,
 *     and a fixed-position <ThemeToggle /> render.
 *   - apps/web/src/routes/+page.svelte is the serious landing page —
 *     uses <hx-button>, <hx-card>, <hx-icon>, <hx-text-input>,
 *     <hx-checkbox>, <hx-tabs> natively (Svelte 5's compiler treats
 *     unknown lowercase-with-dash tags as DOM elements; no
 *     isCustomElement config required).
 *   - apps/web/src/routes/components/+page.svelte is the second
 *     route demonstrating view transitions across routes.
 *   - apps/web/src/lib/components/ThemeToggle.svelte flips
 *     <html data-theme> between 'light' and 'dark' and persists to
 *     localStorage.
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

const TEST_ROOT = path.join(tmpdir(), `create-helix-phase-e-sveltekit-${process.pid}`);

beforeEach(async () => {
  await fs.ensureDir(TEST_ROOT);
});

afterEach(async () => {
  await fs.remove(TEST_ROOT);
});

async function scaffoldSvelteKitMr(args: {
  dir: string;
  name?: string;
  includeDesignSystem?: boolean;
}): Promise<void> {
  const result = await scaffold({
    name: args.name ?? 'phase-e-sveltekit',
    directory: args.dir,
    framework: 'svelte-kit',
    monorepoMode: true,
    includeDesignSystem: args.includeDesignSystem ?? true,
    force: true,
    installDeps: false,
  });
  expect(result.success).toBe(true);
}

describe('v0.9.0 Phase E — sveltekit monorepo emits the full apps/web tree', () => {
  it('produces every expected file under apps/web/', async () => {
    const dir = path.join(TEST_ROOT, 'tree');
    await scaffoldSvelteKitMr({ dir });

    // Top-level apps/web files.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'svelte.config.js'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'vite.config.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'tsconfig.json'))).toBe(true);

    // src/ structure.
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'app.d.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'app.html'))).toBe(true);
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'routes', '+layout.svelte')),
    ).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'routes', '+layout.ts'))).toBe(
      true,
    );
    expect(
      await fs.pathExists(path.join(dir, 'apps', 'web', 'src', 'routes', '+page.svelte')),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(dir, 'apps', 'web', 'src', 'routes', 'components', '+page.svelte'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(dir, 'apps', 'web', 'src', 'lib', 'components', 'ThemeToggle.svelte'),
      ),
    ).toBe(true);

    // Public assets — SvelteKit uses static/ (not public/).
    expect(await fs.pathExists(path.join(dir, 'apps', 'web', 'static', 'favicon.svg'))).toBe(true);

    // Monorepo root structure.
    expect(await fs.pathExists(path.join(dir, 'pnpm-workspace.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'turbo.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'tsconfig.base.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'types'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'utils'))).toBe(true);

    // Workspace DS package present when includeDesignSystem is true (default).
    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(true);

    // Nothing leaked back to the monorepo root.
    expect(await fs.pathExists(path.join(dir, 'svelte.config.js'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'src', 'routes', '+layout.svelte'))).toBe(false);
  });

  it('apps/web/package.json names the package @{scope}/web with workspace:* deps', async () => {
    const dir = path.join(TEST_ROOT, 'pkg');
    await scaffoldSvelteKitMr({ dir, name: 'aurora-app' });

    const pkg = await fs.readJson(path.join(dir, 'apps', 'web', 'package.json'));
    expect(pkg.name).toBe('@aurora-app/web');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');

    // workspace:* refs to types + utils + design-system (DS included by default).
    expect(pkg.dependencies['@aurora-app/design-system']).toBe('workspace:*');
    expect(pkg.dependencies['@aurora-app/types']).toBe('workspace:*');
    expect(pkg.dependencies['@aurora-app/utils']).toBe('workspace:*');

    // Direct @helixui/library dep for the onMount-gated runtime loader.
    expect(pkg.dependencies['@helixui/library']).toBeDefined();

    // SvelteKit-specific scripts.
    expect(pkg.scripts.dev).toBe('vite dev');
    // `build` syncs the SvelteKit-generated tsconfig + runs svelte-check
    // before vite build — matches the strictness the rest of the
    // monorepos already require (TS errors fail fast in CI).
    expect(pkg.scripts.build).toContain('vite build');
    expect(pkg.scripts.build).toContain('svelte-check');
    expect(pkg.scripts.preview).toBe('vite preview');
    expect(pkg.scripts['type-check']).toContain('svelte-check');

    // devDependencies include the SvelteKit toolchain.
    expect(pkg.devDependencies['@sveltejs/kit']).toBeDefined();
    expect(pkg.devDependencies['@sveltejs/adapter-static']).toBeDefined();
    expect(pkg.devDependencies['@sveltejs/vite-plugin-svelte']).toBeDefined();
    expect(pkg.devDependencies['svelte']).toBeDefined();
    expect(pkg.devDependencies['svelte-check']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();

    // Critical version pin — vite-plugin-svelte v6 is the line that
    // supports Vite 7 + Svelte 5 together. v4 peer-requires Vite 5;
    // letting it stay would re-introduce the install warning and a
    // silent dependency cliff in consumer apps.
    expect(pkg.devDependencies['@sveltejs/vite-plugin-svelte']).toMatch(/^\^6\./);
  });

  it('apps/web/vite.config.ts has optimizeDeps.exclude + server.fs.allow', async () => {
    const dir = path.join(TEST_ROOT, 'vitecfg');
    await scaffoldSvelteKitMr({ dir, name: 'aurora-app' });

    const config = await fs.readFile(path.join(dir, 'apps', 'web', 'vite.config.ts'), 'utf8');
    expect(config).toContain('defineConfig');
    expect(config).toContain('@sveltejs/kit/vite');
    expect(config).toContain('optimizeDeps');
    expect(config).toContain("'@aurora-app/design-system'");
    expect(config).toContain("'@aurora-app/types'");
    expect(config).toContain("'@aurora-app/utils'");
    expect(config).toContain('fs:');
    expect(config).toContain("'..'");
    expect(config).toContain("'../..'");
  });

  it('apps/web/svelte.config.js uses adapter-static + vitePreprocess', async () => {
    const dir = path.join(TEST_ROOT, 'svcfg');
    await scaffoldSvelteKitMr({ dir });

    const config = await fs.readFile(path.join(dir, 'apps', 'web', 'svelte.config.js'), 'utf8');
    expect(config).toContain("import adapter from '@sveltejs/adapter-static'");
    expect(config).toContain("import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'");
    // adapter is invoked with the static-output config block.
    expect(config).toContain('adapter:');
    expect(config).toMatch(/adapter\(\s*\{/);
    expect(config).toContain('vitePreprocess()');
  });

  it('apps/web/tsconfig.json extends both .svelte-kit and the monorepo base', async () => {
    const dir = path.join(TEST_ROOT, 'tsconfig');
    await scaffoldSvelteKitMr({ dir });

    const tsconfig = await fs.readJson(path.join(dir, 'apps', 'web', 'tsconfig.json'));
    // SvelteKit generates .svelte-kit/tsconfig.json on `svelte-kit sync`;
    // apps/web/tsconfig.json must extend it so JSDoc types + alias paths
    // (e.g. $lib, $app) resolve.
    expect(tsconfig.extends).toContain('.svelte-kit/tsconfig.json');

    // tsconfig.base.json carries the shared monorepo compilerOptions.
    const base = await fs.readJson(path.join(dir, 'tsconfig.base.json'));
    expect(base.compilerOptions.strict).toBe(true);
    expect(base.compilerOptions.moduleResolution).toBe('bundler');
  });

  it('+layout.svelte wires the HELiX runtime loader + view transitions + tokens', async () => {
    const dir = path.join(TEST_ROOT, 'layout');
    await scaffoldSvelteKitMr({ dir, name: 'aurora-app' });

    const layout = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'routes', '+layout.svelte'),
      'utf8',
    );

    // onMount-gated dynamic import — keeps the SSR bundle from
    // evaluating @helixui/library in Node; runs in the browser; calls
    // customElements.define() once on first paint.
    expect(layout).toContain("import('@helixui/library')");
    expect(layout).toContain('onMount');

    // Browser-native View Transitions API via SvelteKit's onNavigate.
    expect(layout).toContain('onNavigate');
    expect(layout).toContain('startViewTransition');
    expect(layout).toContain("import { onNavigate } from '$app/navigation'");

    // Tokens import targets the DS package's tokens export.
    expect(layout).toContain('@aurora-app/design-system');

    // ThemeToggle is rendered in the layout (fixed-position chrome) so
    // both /  and /components get the toggle without per-route duplication.
    expect(layout).toContain('<ThemeToggle');
    expect(layout).toContain("import ThemeToggle from '$lib/components/ThemeToggle.svelte'");

    // Skip-link for keyboard accessibility.
    expect(layout).toContain('skip-link');
  });

  it('apps/web wires the @helixui/icons local-sprite setup', async () => {
    const dir = path.join(TEST_ROOT, 'icons-setup');
    await scaffoldSvelteKitMr({ dir });

    // +layout.svelte's onMount-gated loader points the @helixui/icons
    // registry at /icons/ BEFORE loading @helixui/library — otherwise
    // <hx-icon> sprites resolve to the blocked cross-origin jsdelivr CDN
    // default.
    const layout = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'routes', '+layout.svelte'),
      'utf8',
    );
    expect(layout).toContain("import('@helixui/icons')");
    expect(layout).toContain("setBasePath('/icons')");
    expect(layout.indexOf("setBasePath('/icons')")).toBeLessThan(
      layout.indexOf("import('@helixui/library')"),
    );

    // scripts/copy-helix-icons.mjs lands inside apps/web (not at the
    // monorepo root) — the script resolves @helixui/icons up the dep
    // tree, which works for pnpm's hoisted workspace layout. SvelteKit
    // copies into static/icons/ (its static-asset dir, not public/).
    const copyScript = await fs.readFile(
      path.join(dir, 'apps', 'web', 'scripts', 'copy-helix-icons.mjs'),
      'utf8',
    );
    expect(copyScript).toContain('@helixui/icons/dist/helix.svg');
    expect(copyScript).toContain('@helixui/icons/dist/fa-free-solid.svg');
    expect(copyScript).toContain('createRequire(import.meta.url)');
    expect(copyScript).toContain("join(process.cwd(), 'static', 'icons')");

    // apps/web/package.json postinstall runs the copy script.
    const pkg = await fs.readJson(path.join(dir, 'apps', 'web', 'package.json'));
    expect(pkg.scripts.postinstall).toBe('node scripts/copy-helix-icons.mjs');

    // apps/web/.gitignore excludes the postinstall-generated sprite dir
    // (SvelteKit emits a per-app .gitignore on top of the workspace root).
    const appGitignore = await fs.readFile(path.join(dir, 'apps', 'web', '.gitignore'), 'utf8');
    expect(appGitignore).toContain('static/icons/');

    // The workspace-root .gitignore also excludes the apps/web sprite dir.
    const rootGitignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(rootGitignore).toContain('apps/web/static/icons/');
  });

  it('+page.svelte uses native web components (hx-button, hx-card, hx-icon, etc.)', async () => {
    const dir = path.join(TEST_ROOT, 'index');
    await scaffoldSvelteKitMr({ dir });

    const index = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'routes', '+page.svelte'),
      'utf8',
    );

    // Native web components — no React wrappers, no Svelte wrappers,
    // no createComponent calls.
    expect(index).toContain('<hx-button');
    expect(index).toContain('<hx-card');
    expect(index).toContain('<hx-icon');
    expect(index).toContain('<hx-text-input');
    expect(index).toContain('<hx-checkbox');
    expect(index).toContain('<hx-tabs');

    // No React wrapper imports — these are .svelte files, but a
    // wrapper could still leak in from a copy-paste accident.
    expect(index).not.toContain('createComponent');
    expect(index).not.toContain('@lit/react');

    // Accessibility — semantic landmark + skip-link target.
    expect(index).toContain('aria-labelledby');

    // No Lorem.
    expect(index.toLowerCase()).not.toContain('lorem ipsum');
  });

  it('+page.svelte feature cards use FA-free icon names (pin against helix-library stale names)', async () => {
    // The same regression that bit Astro Phase D — `library="helix"`
    // names that don't exist in the helix icon set render zero-size
    // SVGs. Pin the FA-free names so a copy edit can't silently revert.
    const dir = path.join(TEST_ROOT, 'icons');
    await scaffoldSvelteKitMr({ dir });

    const index = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'routes', '+page.svelte'),
      'utf8',
    );

    // Positive — the three feature-card icons are FA-free.
    expect(index).toMatch(/library="fa-free"\s+name="shield-halved"/);
    expect(index).toMatch(/library="fa-free"\s+name="palette"/);
    expect(index).toMatch(/library="fa-free"\s+name="rocket"/);

    // Negative — no stale helix-library names slip back in.
    expect(index).not.toMatch(/library="helix"\s+name="shield-check"/);
  });

  it('components/+page.svelte renders the second route with real component examples', async () => {
    const dir = path.join(TEST_ROOT, 'components');
    await scaffoldSvelteKitMr({ dir });

    const page = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'routes', 'components', '+page.svelte'),
      'utf8',
    );

    // Real component usage.
    expect(page).toContain('<hx-button');
    expect(page).toContain('<hx-text-input');
    expect(page).toContain('<hx-card');
    expect(page).toContain('<hx-badge');
    expect(page).toContain('<hx-alert');

    // Back-to-home link makes the nav symmetric across the two routes.
    expect(page).toContain('href="/"');
  });

  it('ThemeToggle.svelte flips html[data-theme] and persists to localStorage', async () => {
    const dir = path.join(TEST_ROOT, 'theme');
    await scaffoldSvelteKitMr({ dir });

    const toggle = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'lib', 'components', 'ThemeToggle.svelte'),
      'utf8',
    );

    expect(toggle).toContain("setAttribute('data-theme'");
    // v0.9.1 cross-kit audit: storage key is 'helix-theme' (was 'theme';
    // standardized across all 4 kits).
    expect(toggle).toContain("localStorage.setItem('helix-theme'");
    expect(toggle).toContain('aria-label="Toggle color theme"');

    // Marked with the class the Phase D E2E gate clicks.
    expect(toggle).toContain('class="theme-toggle"');
  });

  it('app.html boots data-theme="light" + restores from localStorage pre-paint', async () => {
    const dir = path.join(TEST_ROOT, 'apphtml');
    await scaffoldSvelteKitMr({ dir });

    const appHtml = await fs.readFile(path.join(dir, 'apps', 'web', 'src', 'app.html'), 'utf8');

    // Default theme baked into the <html> tag — avoids
    // flash-of-incorrect-theme before the boot script runs.
    expect(appHtml).toContain('data-theme="light"');

    // Inline boot script restores user choice from localStorage
    // before paint (sync, head, no module).
    // v0.9.1 cross-kit audit: storage key is 'helix-theme'.
    expect(appHtml).toContain("localStorage.getItem('helix-theme')");
  });
});

describe('v0.9.0 Phase E — includeDesignSystem:false falls back to upstream tokens', () => {
  it('drops the DS dep from package.json + swaps tokens to @helixui/tokens', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds');
    await scaffoldSvelteKitMr({ dir, name: 'plain-app', includeDesignSystem: false });

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

  it('vite.config.ts drops the DS entry from optimizeDeps.exclude', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds-cfg');
    await scaffoldSvelteKitMr({ dir, name: 'plain-app', includeDesignSystem: false });

    const config = await fs.readFile(path.join(dir, 'apps', 'web', 'vite.config.ts'), 'utf8');
    expect(config).not.toContain('@plain-app/design-system');
    expect(config).toContain("'@plain-app/types'");
    expect(config).toContain("'@plain-app/utils'");
  });

  it('+layout.svelte tokens import targets @helixui/tokens directly', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds-layout');
    await scaffoldSvelteKitMr({ dir, name: 'plain-app', includeDesignSystem: false });

    const layout = await fs.readFile(
      path.join(dir, 'apps', 'web', 'src', 'routes', '+layout.svelte'),
      'utf8',
    );
    expect(layout).toContain("import '@helixui/tokens/tokens.css'");
    expect(layout).not.toContain("'@plain-app/design-system");

    // Runtime loader still resolves @helixui/library directly.
    expect(layout).toContain("import('@helixui/library')");
  });

  it('packages/design-system is NOT created when DS is opted out', async () => {
    const dir = path.join(TEST_ROOT, 'no-ds-dir');
    await scaffoldSvelteKitMr({ dir, includeDesignSystem: false });
    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(false);
    expect(await fs.pathExists(path.join(dir, 'packages', 'types'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'utils'))).toBe(true);
  });
});

describe('v0.9.0 Phase E — idempotency', () => {
  // Every file Phase E's apps/web overlay owns is byte-stable across
  // re-runs. Matches the discipline applied to react-next/react-vite/
  // astro monorepos.
  it('running the monorepo scaffolder twice produces byte-identical apps/web files', async () => {
    const dir = path.join(TEST_ROOT, 'idem');
    await scaffoldSvelteKitMr({ dir });

    const snapshotFiles = [
      'apps/web/package.json',
      'apps/web/svelte.config.js',
      'apps/web/vite.config.ts',
      'apps/web/tsconfig.json',
      'apps/web/src/app.d.ts',
      'apps/web/src/app.html',
      'apps/web/src/routes/+layout.svelte',
      'apps/web/src/routes/+layout.ts',
      'apps/web/src/routes/+page.svelte',
      'apps/web/src/routes/components/+page.svelte',
      'apps/web/src/lib/components/ThemeToggle.svelte',
      'apps/web/static/favicon.svg',
      'tsconfig.base.json',
      'pnpm-workspace.yaml',
      'turbo.json',
    ];

    const before: Record<string, string> = {};
    for (const f of snapshotFiles) {
      before[f] = await fs.readFile(path.join(dir, f), 'utf8');
    }

    await scaffoldSvelteKitMr({ dir });

    for (const [f, expected] of Object.entries(before)) {
      const after = await fs.readFile(path.join(dir, f), 'utf8');
      expect(after, `${f} drifted between idempotent runs`).toBe(expected);
    }
  });
});
