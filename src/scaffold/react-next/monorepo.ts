/**
 * react-next monorepo scaffolder — emits a pnpm-workspace + Turborepo
 * monorepo with the Next.js app under apps/web/ and (optionally) the
 * design-system package wired in via `workspace:*`.
 *
 * v0.7.0 Phase D — replaces the Phase A "not yet implemented" stub. The
 * emit pipeline is:
 *
 *   1. scaffoldMonorepoRoot(...)   — pnpm-workspace.yaml, turbo.json,
 *                                    root package.json + tsconfig.json +
 *                                    tsconfig.base.json, README.md,
 *                                    .gitignore, and the four empty
 *                                    workspace package dirs.
 *   2. scaffoldReactNextFlat(...)  — the exact flat scaffolder body,
 *                                    invoked with options.directory
 *                                    redirected at <root>/apps/web. Every
 *                                    file the flat path normally writes
 *                                    (src/app/page.tsx, layout.tsx,
 *                                    globals.css, navbar.tsx, footer.tsx,
 *                                    theme-toggle.tsx, provider.tsx,
 *                                    wrappers.tsx, helix.d.ts, examples/*,
 *                                    docs/*, components/*, error boundary,
 *                                    next.config.ts, tsconfig.json, the
 *                                    public/og brand asset copy) lands
 *                                    under apps/web/.
 *   3. apps/web overrides          — apps/web/package.json (workspace:*
 *                                    deps), apps/web/next.config.ts
 *                                    (transpilePackages + externalDir),
 *                                    apps/web/tsconfig.json (extends
 *                                    ../../tsconfig.base.json), and
 *                                    apps/web/src/components/helix/
 *                                    wrappers.tsx (re-export from the
 *                                    workspace DS package, gated on
 *                                    includeDesignSystem).
 *
 * Per PE P1 (fork-don't-branch): the flat and monorepo paths share the
 * same 1900-LOC content emit. They differ ONLY in (a) where the root is
 * and (b) which monorepo-specific overlay files get written on top.
 * Threading a `baseDir` param through scaffoldReactNext would have meant
 * touching every heredoc — the redirect-via-options.directory approach
 * keeps the change surface narrow and the flat path's golden snapshot
 * byte-identical.
 */
import type { ProjectOptions } from '../../types.js';
import { deriveScope, scaffoldMonorepoRoot } from '../monorepo.js';
import {
  cloneOptionsForAppsWeb,
  writeAppsWebNextConfig,
  writeAppsWebPackageJson,
  writeAppsWebTsConfig,
  writeAppsWebWrappersOverride,
} from './_shared.js';
import { scaffoldReactNextFlat } from './flat.js';

export async function scaffoldReactNextMonorepo(options: ProjectOptions): Promise<void> {
  // 1. Emit the monorepo root scaffold (pnpm-workspace.yaml, turbo.json,
  //    tsconfig.base.json, root package.json, etc.). After this returns
  //    the empty apps/web/ + packages/*/ dirs exist on disk.
  await scaffoldMonorepoRoot({ options });

  // 2. Drive the flat Next.js scaffolder against the apps/web subdir.
  //    Cloning options is the key trick — every safeWriteFile path
  //    composed from `options.directory` lands under apps/web/ without
  //    any change to the flat body.
  const appsWebOptions = cloneOptionsForAppsWeb(options);
  await scaffoldReactNextFlat(appsWebOptions);

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
  await writeAppsWebNextConfig({
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
  }
}
