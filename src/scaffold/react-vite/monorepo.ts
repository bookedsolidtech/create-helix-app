/**
 * react-vite monorepo scaffolder — emits a pnpm-workspace + Turborepo
 * monorepo with the Vite SPA under apps/web/ and (optionally) the
 * design-system package wired in via `workspace:*`.
 *
 * v0.7.0 Phase E — replaces the Phase A "not yet implemented" stub.
 * Mirror of Phase D's Next.js pattern. The emit pipeline is:
 *
 *   1. scaffoldMonorepoRoot(...)   — pnpm-workspace.yaml, turbo.json,
 *                                    root package.json + tsconfig.json +
 *                                    tsconfig.base.json, README.md,
 *                                    .gitignore, and the four empty
 *                                    workspace package dirs.
 *   2. scaffoldReactViteFlat(...)  — the exact flat scaffolder body,
 *                                    invoked with options.directory
 *                                    redirected at <root>/apps/web. Every
 *                                    file the flat path normally writes
 *                                    (vite.config.ts, tsconfig.json,
 *                                    index.html, src/main.tsx, src/App.tsx,
 *                                    src/index.css, src/helix.d.ts,
 *                                    src/components/Navbar.tsx,
 *                                    src/components/helix/wrappers.tsx,
 *                                    public/og/*) lands under apps/web/.
 *   3. apps/web overrides          — apps/web/package.json (workspace:*
 *                                    deps), apps/web/vite.config.ts
 *                                    (optimizeDeps.exclude + server.fs.allow),
 *                                    apps/web/tsconfig.json (extends
 *                                    ../../tsconfig.base.json), and
 *                                    apps/web/src/components/helix/
 *                                    wrappers.tsx (re-export from the
 *                                    workspace DS package, gated on
 *                                    includeDesignSystem).
 *
 * Per PE P1 (fork-don't-branch): the flat and monorepo paths share the
 * same flat content emit. They differ ONLY in (a) where the root is
 * and (b) which monorepo-specific overlay files get written on top.
 * Threading a `baseDir` param through scaffoldReactVite would have meant
 * touching every heredoc — the redirect-via-options.directory approach
 * keeps the change surface narrow and the flat path's golden snapshot
 * byte-identical.
 *
 * Vite-specific note vs Phase D: Vite's monorepo dep resolution is more
 * finicky than Next's. Next has a single `transpilePackages` knob;
 * Vite needs TWO pieces (optimizeDeps.exclude + server.fs.allow), both
 * baked into writeAppsWebViteConfig. The flat path's bare
 * `defineConfig({ plugins: [react()] })` would silently fail at dev-server
 * boot under workspace symlinks — replacing it is non-optional in
 * monorepo mode.
 */
import type { ProjectOptions } from '../../types.js';
import { deriveScope, scaffoldMonorepoRoot } from '../monorepo.js';
import {
  cloneOptionsForAppsWeb,
  writeAppsWebPackageJson,
  writeAppsWebTsConfig,
  writeAppsWebViteConfig,
  writeAppsWebWrappersOverride,
} from './_shared.js';
import { scaffoldReactViteFlat } from './flat.js';
import { scaffoldWcStorybookMonorepo } from '../wc-storybook/monorepo.js';

export async function scaffoldReactViteMonorepo(options: ProjectOptions): Promise<void> {
  // 1. Emit the monorepo root scaffold (pnpm-workspace.yaml, turbo.json,
  //    tsconfig.base.json, root package.json, etc.). After this returns
  //    the empty apps/web/ + packages/*/ dirs exist on disk.
  await scaffoldMonorepoRoot({ options });

  // 2. Drive the flat Vite scaffolder against the apps/web subdir.
  //    Cloning options is the key trick — every safeWriteFile path
  //    composed from `options.directory` lands under apps/web/ without
  //    any change to the flat body.
  const appsWebOptions = cloneOptionsForAppsWeb(options);
  await scaffoldReactViteFlat(appsWebOptions);

  // 3. Lay the monorepo-specific overrides on top. Phase C's
  //    scaffoldMonorepoRoot derives the scope from options.name the
  //    same way; reusing the exported helper here keeps the names
  //    aligned with the root package.json's --filter=@{scope}/...
  //    scripts.
  const scope = deriveScope(options.name);
  const includeDesignSystem = options.includeDesignSystem ?? false;

  await writeAppsWebPackageJson({
    rootDir: options.directory,
    scope,
    includeDesignSystem,
  });
  await writeAppsWebViteConfig({
    rootDir: options.directory,
    scope,
    includeDesignSystem,
  });
  await writeAppsWebTsConfig({ rootDir: options.directory });

  // wrappers.tsx — only override when the DS package exists in the
  // workspace. When it doesn't, the flat path's @helixui/library imports
  // remain valid and the app stays useful.
  if (includeDesignSystem) {
    await writeAppsWebWrappersOverride({
      rootDir: options.directory,
      scope,
    });

    // v0.7.0 Phase F — emit the packages/design-system workspace package
    // alongside apps/web. The wc-storybook factory runs unchanged via the
    // cloneOptionsForDesignSystem redirect; the post-flat overrides
    // (writeDesignSystemPackageJson / Index / TsConfig) rewrite the
    // identity + barrel surface for workspace consumption.
    //
    // emitRootScaffold:false because scaffoldMonorepoRoot already ran
    // above — invoking it a second time would be idempotent but
    // wasteful.
    await scaffoldWcStorybookMonorepo(options, { emitRootScaffold: false });
  }
}
