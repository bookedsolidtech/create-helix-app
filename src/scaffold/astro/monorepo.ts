/**
 * Astro monorepo scaffolder — emits a pnpm-workspace + Turborepo monorepo
 * with the Astro app under apps/web/ and (optionally) the design-system
 * package wired in via `workspace:*`.
 *
 * v0.8.0 Phase C — fills the Phase A "not yet implemented" stub. Mirror
 * of v0.7.0 Phase D's react-next and Phase E's react-vite emit, with
 * one critical difference per user direction (2026-05-11):
 *
 *   DS CONSUMPTION = NATIVE WEB COMPONENTS
 *
 * Astro apps consume the design-system as <hx-*> tags directly in
 * .astro files — NO React wrappers, NO hydration islands, NO client:*
 * directives. The design-system package's React wrappers (from v0.7.0
 * Phase F) stay available for Next.js / Vite consumers; the Astro
 * scaffold's only point of contact with the DS package is the tokens
 * CSS (loaded via the './tokens' export entry).
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
 *                                             astro.config.mjs
 *                                             (optimizeDeps.exclude +
 *                                             fs.allow), tsconfig.json
 *                                             (extends tsconfig.base.json),
 *                                             env.d.ts, Layout.astro
 *                                             (runtime loader + view
 *                                             transitions + tokens
 *                                             import), index.astro
 *                                             (serious landing page),
 *                                             components.astro (second
 *                                             route), ThemeToggle.astro,
 *                                             favicon.svg.
 *
 * Per PE P1 (fork-don't-branch): the flat Astro scaffolder body in
 * src/scaffold.ts is being deprecated and the monorepo path becomes
 * the supported shipping target. Phase C does NOT reuse the flat body
 * via the cloneOptionsForAppsWeb redirect pattern — it emits fresh
 * files sized for the SERIOUS landing-page contract. The 1058 LOC flat
 * body lives on for back-compat through Phase F's deprecation cycle
 * but its emit shape doesn't match what apps/web wants here.
 */
import path from 'node:path';
import type { ProjectOptions } from '../../types.js';
import { safeEnsureDir } from '../../scaffold.js';
import { deriveScope, scaffoldMonorepoRoot } from '../monorepo.js';
import { scaffoldWcStorybookMonorepo } from '../wc-storybook/monorepo.js';
import { unscopeName } from '../../validation.js';
import {
  APPS_WEB_REL,
  writeAppsWebAstroConfig,
  writeAppsWebComponentsPage,
  writeAppsWebEnvDts,
  writeAppsWebFavicon,
  writeAppsWebIndexPage,
  writeAppsWebLayout,
  writeAppsWebPackageJson,
  writeAppsWebThemeToggle,
  writeAppsWebTsConfig,
} from './_shared.js';

/**
 * Derive a human-readable display name for the design-system surface,
 * used in Layout.astro's <title> and the landing-page brand mark.
 *
 *   'aurora'      → 'Aurora'
 *   'my-ds'       → 'My Ds'
 *   '@acme/foo'   → 'Foo' (via deriveScope's unscope path)
 *
 * Falls through to the project name when dsName isn't provided. The
 * exact same fallback chain wc-storybook/monorepo.ts uses to derive
 * dsTitle for its index.ts barrel — keeps the brand naming consistent
 * across Astro + Storybook-package emit.
 */
function deriveDsTitle(options: ProjectOptions): string {
  // Same fallback chain wc-storybook/monorepo.ts uses: dsName wins
  // when explicit; otherwise the project name is unscoped and reused
  // as the brand surface. unscopeName always returns a string so the
  // chain terminates without a 'my-ds' default — kept symmetrical
  // with the wc-storybook path which uses 'my-ds' only when the name
  // fails dsName validation.
  const dsName = options.dsName ?? unscopeName(options.name);
  return dsName
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export async function scaffoldAstroMonorepo(options: ProjectOptions): Promise<void> {
  // 1. Emit the monorepo root scaffold (pnpm-workspace.yaml, turbo.json,
  //    tsconfig.base.json, root package.json, stub packages/types and
  //    /utils, etc.). After this returns the empty apps/web/ +
  //    packages/*/ dirs exist on disk.
  await scaffoldMonorepoRoot({ options });

  // 2. Emit the workspace design-system package when opted in. The
  //    wc-storybook factory body runs unchanged via the
  //    cloneOptionsForDesignSystem redirect; the post-flat overrides
  //    (writeDesignSystemPackageJson / Index / TsConfig) rewrite the
  //    identity + barrel surface for workspace consumption.
  //
  //    emitRootScaffold:false because scaffoldMonorepoRoot already ran
  //    above — invoking it a second time would be idempotent but
  //    wasteful.
  const includeDesignSystem = options.includeDesignSystem ?? false;
  if (includeDesignSystem) {
    await scaffoldWcStorybookMonorepo(options, { emitRootScaffold: false });
  }

  // 3. Derive the workspace scope + DS title for the apps/web overlay.
  //    Same derivation Phase C's scaffoldMonorepoRoot uses so the
  //    `--filter=@{scope}/web` scripts in the root package.json line
  //    up with the @{scope}/web name we write here.
  const scope = deriveScope(options.name);
  const dsTitle = deriveDsTitle(options);

  // 4. Pre-create the nested apps/web/ subdirectories. safeWriteFile
  //    uses fs.writeFile under the hood (NOT fs.outputFile), which
  //    does not auto-create parent dirs. Pre-ensuring is the same
  //    pattern the flat scaffolder in src/scaffold.ts uses (see
  //    scaffoldAstro line 4613 — it calls safeEnsureDir on src/pages,
  //    src/layouts, src/styles before any safeWriteFile).
  const appsWeb = path.join(options.directory, APPS_WEB_REL);
  await safeEnsureDir(path.join(appsWeb, 'src'));
  await safeEnsureDir(path.join(appsWeb, 'src', 'layouts'));
  await safeEnsureDir(path.join(appsWeb, 'src', 'pages'));
  await safeEnsureDir(path.join(appsWeb, 'src', 'components'));
  await safeEnsureDir(path.join(appsWeb, 'public'));

  // 5. Emit apps/web/ content. Order is incidental — every writer
  //    targets a distinct path under apps/web/.
  await writeAppsWebPackageJson({
    rootDir: options.directory,
    scope,
    includeDesignSystem,
  });
  await writeAppsWebAstroConfig({
    rootDir: options.directory,
    scope,
    includeDesignSystem,
  });
  await writeAppsWebTsConfig({ rootDir: options.directory });
  await writeAppsWebEnvDts({ rootDir: options.directory });
  await writeAppsWebLayout({
    rootDir: options.directory,
    scope,
    dsTitle,
    includeDesignSystem,
  });
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
}
