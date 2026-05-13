/**
 * SvelteKit monorepo scaffolder — emits a pnpm-workspace + Turborepo
 * monorepo with the SvelteKit app under apps/web/ and (optionally) the
 * design-system package wired in via `workspace:*`.
 *
 * v0.9.0 Phase C — fills the Phase A "not yet implemented" stub. Mirror
 * of v0.8.0 Phase C's astro monorepo emit, with one structural difference
 * from Astro: SvelteKit's static-asset dir is `static/` (not `public/`)
 * and routes live in `src/routes/` (not `src/pages/`).
 *
 *   DS CONSUMPTION = NATIVE WEB COMPONENTS
 *
 * SvelteKit apps consume the design-system as <hx-*> tags directly in
 * .svelte files — NO React wrappers, NO Svelte component wrappers. The
 * Svelte 5 compiler treats unknown lowercase-with-dash tags as DOM
 * elements automatically (no `compilerOptions.isCustomElement` config
 * needed, unlike Vue 3). The design-system package's React wrappers
 * (from v0.7.0) stay available for Next.js / Vite consumers; the
 * SvelteKit scaffold's only point of contact with the DS package is
 * the tokens CSS export.
 *
 * The emit pipeline is:
 *
 *   1. scaffoldMonorepoRoot(...)            — pnpm-workspace.yaml,
 *                                             turbo.json, root package.json
 *                                             + tsconfig.json +
 *                                             tsconfig.base.json, README.md,
 *                                             .gitignore, the empty
 *                                             workspace package dirs, and
 *                                             packages/types + /utils
 *                                             stub packages.
 *   2. scaffoldWcStorybookMonorepo(...)     — only when includeDesignSystem
 *      with emitRootScaffold:false            is true. Lays the DS package
 *                                             under packages/design-system/
 *                                             using the unchanged
 *                                             wc-storybook factory body.
 *   3. apps/web emit                        — package.json (workspace:*
 *                                             deps + direct @helixui/library),
 *                                             svelte.config.js
 *                                             (adapter-static), vite.config.ts
 *                                             (optimizeDeps.exclude +
 *                                             fs.allow), tsconfig.json
 *                                             (extends .svelte-kit + base),
 *                                             app.d.ts, app.html, +layout.svelte
 *                                             (runtime loader + view
 *                                             transitions + tokens import),
 *                                             +layout.ts (prerender flag),
 *                                             +page.svelte (serious landing),
 *                                             components/+page.svelte (second
 *                                             route), ThemeToggle.svelte,
 *                                             favicon.svg, .gitignore, .npmrc.
 *
 * Per PE P1 (fork-don't-branch): the flat SvelteKit scaffolder body in
 * src/scaffold.ts is being deprecated and the monorepo path becomes the
 * supported shipping target. Phase C does NOT reuse the flat body via
 * the cloneOptionsForAppsWeb redirect pattern — it emits fresh files
 * sized for the SERIOUS landing-page contract.
 */
import path from 'node:path';
import type { ProjectOptions } from '../../types.js';
import { safeEnsureDir } from '../../scaffold.js';
import { deriveScope, scaffoldMonorepoRoot } from '../monorepo.js';
import { scaffoldWcStorybookMonorepo } from '../wc-storybook/monorepo.js';
import { unscopeName } from '../../validation.js';
import {
  APPS_WEB_REL,
  writeAppsWebAppDts,
  writeAppsWebAppHtml,
  writeAppsWebComponentsPage,
  writeAppsWebFavicon,
  writeAppsWebGitignore,
  writeAppsWebIndexPage,
  writeAppsWebLayout,
  writeAppsWebLayoutTs,
  writeAppsWebNpmrc,
  writeAppsWebPackageJson,
  writeAppsWebSvelteConfig,
  writeAppsWebThemeToggle,
  writeAppsWebTsConfig,
  writeAppsWebViteConfig,
} from './_shared.js';

/**
 * Derive a human-readable display name for the design-system surface,
 * used in +layout.svelte's <title>, the landing-page brand mark, and
 * the components route title.
 *
 *   'aurora'      → 'Aurora'
 *   'my-ds'       → 'My Ds'
 *   '@acme/foo'   → 'Foo' (via deriveScope's unscope path)
 *
 * Falls through to the project name when dsName isn't provided. Same
 * fallback chain wc-storybook/monorepo.ts uses — keeps the brand naming
 * consistent across SvelteKit + Storybook-package emit.
 */
function deriveDsTitle(options: ProjectOptions): string {
  const dsName = options.dsName ?? unscopeName(options.name);
  return dsName
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export async function scaffoldSvelteKitMonorepo(options: ProjectOptions): Promise<void> {
  // 1. Emit the monorepo root scaffold (pnpm-workspace.yaml, turbo.json,
  //    tsconfig.base.json, root package.json, stub packages/types and
  //    /utils, etc.). After this returns the empty apps/web/ +
  //    packages/*/ dirs exist on disk.
  await scaffoldMonorepoRoot({ options });

  // 2. Emit the workspace design-system package when opted in. The
  //    wc-storybook factory body runs unchanged via the
  //    cloneOptionsForDesignSystem redirect; the post-flat overrides
  //    rewrite the identity + barrel surface for workspace consumption.
  //
  //    emitRootScaffold:false because scaffoldMonorepoRoot already ran
  //    above — invoking it a second time would be idempotent but wasteful.
  const includeDesignSystem = options.includeDesignSystem ?? false;
  if (includeDesignSystem) {
    await scaffoldWcStorybookMonorepo(options, { emitRootScaffold: false });
  }

  // 3. Derive the workspace scope + DS title for the apps/web overlay.
  const scope = deriveScope(options.name);
  const dsTitle = deriveDsTitle(options);

  // 4. Pre-create the nested apps/web/ subdirectories. safeWriteFile
  //    uses fs.writeFile (NOT fs.outputFile), which does not auto-create
  //    parent dirs. Pre-ensuring is the same pattern Astro's Phase C uses.
  //
  //    Note the SvelteKit structure: routes/ for pages (not pages/),
  //    static/ for assets (not public/), lib/ for shared components.
  const appsWeb = path.join(options.directory, APPS_WEB_REL);
  await safeEnsureDir(path.join(appsWeb, 'src'));
  await safeEnsureDir(path.join(appsWeb, 'src', 'routes'));
  await safeEnsureDir(path.join(appsWeb, 'src', 'routes', 'components'));
  await safeEnsureDir(path.join(appsWeb, 'src', 'lib'));
  await safeEnsureDir(path.join(appsWeb, 'src', 'lib', 'components'));
  await safeEnsureDir(path.join(appsWeb, 'static'));

  // 5. Emit apps/web/ content. Order is incidental — every writer
  //    targets a distinct path under apps/web/.
  await writeAppsWebPackageJson({
    rootDir: options.directory,
    scope,
    includeDesignSystem,
  });
  await writeAppsWebSvelteConfig({ rootDir: options.directory });
  await writeAppsWebViteConfig({
    rootDir: options.directory,
    scope,
    includeDesignSystem,
  });
  await writeAppsWebTsConfig({ rootDir: options.directory });
  await writeAppsWebAppDts({ rootDir: options.directory });
  await writeAppsWebAppHtml({ rootDir: options.directory });
  await writeAppsWebLayout({
    rootDir: options.directory,
    scope,
    dsTitle,
    includeDesignSystem,
  });
  await writeAppsWebLayoutTs({ rootDir: options.directory });
  await writeAppsWebIndexPage({
    rootDir: options.directory,
    scope,
    dsTitle,
  });
  await writeAppsWebComponentsPage({
    rootDir: options.directory,
    dsTitle,
  });
  await writeAppsWebThemeToggle({ rootDir: options.directory });
  await writeAppsWebFavicon({ rootDir: options.directory });
  await writeAppsWebGitignore({ rootDir: options.directory });
  await writeAppsWebNpmrc({ rootDir: options.directory });
}
