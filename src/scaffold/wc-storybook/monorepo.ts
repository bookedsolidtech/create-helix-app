/**
 * wc-storybook monorepo scaffolder — emits the design-system package
 * under packages/design-system/ inside a pnpm-workspace + Turborepo
 * monorepo, with package.json `name: @{scope}/design-system` and
 * `"private": true` (workspace-internal, NOT publishable in v0.7.0
 * per DXA Q4).
 *
 * v0.7.0 Phase F — replaces the Phase C stub. Mirror of Phase D / E's
 * pattern. The emit pipeline is:
 *
 *   1. scaffoldMonorepoRoot(...)            — pnpm-workspace.yaml,
 *                                             turbo.json, root package.json
 *                                             + tsconfig.json +
 *                                             tsconfig.base.json, README.md,
 *                                             .gitignore, and the empty
 *                                             workspace package dirs.
 *   2. scaffoldWcStorybookFlat(...)         — the exact wc-storybook factory
 *                                             body, invoked with
 *                                             options.directory redirected
 *                                             at <root>/packages/design-system.
 *                                             Every file the flat path
 *                                             normally writes (.storybook/*,
 *                                             src/base/*, src/components/{ds}-button/*,
 *                                             src/tokens/*, src/stories/*,
 *                                             tsconfig.json, tsconfig.build.json,
 *                                             vite.config.ts, custom-elements.json,
 *                                             etc.) lands under
 *                                             packages/design-system/.
 *   3. packages/design-system overrides     — package.json (scoped name +
 *                                             private:true + exports field),
 *                                             tsconfig.json (extends
 *                                             ../../tsconfig.base.json +
 *                                             composite:true), and
 *                                             src/index.ts (React wrappers
 *                                             barrel for the 7 main HELiX
 *                                             components).
 *
 * Dispatch coherence: the public API (src/api.ts) coerces monorepoMode →
 * false for `framework === 'wc-storybook'`, so this entry point is NOT
 * reached from `scaffold({ framework: 'wc-storybook' })`. It IS reached
 * from Phase D's scaffoldReactNextMonorepo and Phase E's
 * scaffoldReactViteMonorepo when `includeDesignSystem === true` —
 * those framework paths invoke this function AFTER their own apps/web
 * emit to lay down the workspace DS package alongside.
 *
 * Per PE P1 (fork-don't-branch): the wc-storybook factory body is
 * unchanged. Only the OUTPUT-ROOT + a handful of post-flat overrides
 * differ between flat and monorepo paths. Threading a `baseDir` param
 * through 5366 LOC of heredoc-emitting code would be a future-bug
 * magnet — the redirect-via-options.directory approach keeps the
 * change surface narrow and the flat path's golden snapshot
 * byte-identical.
 */
import type { ProjectOptions } from '../../types.js';
import { deriveScope, scaffoldMonorepoRoot } from '../monorepo.js';
import {
  cloneOptionsForDesignSystem,
  writeDesignSystemIndex,
  writeDesignSystemPackageJson,
  writeDesignSystemTsConfig,
} from './_shared.js';
import { scaffoldWcStorybookFlat } from './flat.js';
import { unscopeName, validateDsName } from '../../validation.js';

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function toTitle(str: string): string {
  return str
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

/**
 * `scaffoldWcStorybookMonorepo` was originally intended as the entry point
 * called from src/scaffold.ts's dispatch for `framework === 'wc-storybook' &&
 * monorepoMode === true`. Per Phase B that combination is coerced to flat
 * before it reaches dispatch, so this function exists primarily to be
 * invoked by Phase D's react-next and Phase E's react-vite monorepo
 * scaffolders when they need the workspace DS package alongside their
 * apps/web emit.
 *
 * When called from those paths, `scaffoldMonorepoRoot` has ALREADY run
 * (the calling react-next / react-vite monorepo did it first). Calling
 * it a second time is idempotent — same inputs produce byte-identical
 * outputs — so we don't try to detect-and-skip; the redundant write is
 * cheaper than the branching logic to avoid it.
 *
 * `emitRootScaffold` opts the caller out of the redundant
 * scaffoldMonorepoRoot run. Phases D + E set it to false because they
 * own the root; tests / future direct callers leave it default-true so
 * the function self-contains end-to-end.
 */
export async function scaffoldWcStorybookMonorepo(
  options: ProjectOptions,
  config: { emitRootScaffold?: boolean } = {},
): Promise<void> {
  const emitRootScaffold = config.emitRootScaffold ?? true;

  // 1. Emit the monorepo root scaffold when this scaffolder is the
  //    primary entry point (direct API call, future symmetric dispatch).
  //    When called from Phase D / E, the caller already ran this and
  //    we skip the redundant write.
  if (emitRootScaffold) {
    await scaffoldMonorepoRoot({ options });
  }

  // 1b. includeDesignSystem === false short-circuit. The whole point of
  //     scaffoldWcStorybookMonorepo is to emit the workspace DS package,
  //     so when DS is opted out there's nothing left to do. The
  //     orchestrator already dropped the packages/design-system dir
  //     (Phase C contract: includeDesignSystem:false → no DS dir, no
  //     tsconfig reference, no storybook scripts). Trying to scaffold
  //     against a non-existent dir would fail at the first safeWriteFile.
  if (options.includeDesignSystem === false) {
    return;
  }

  // 2. Drive the flat wc-storybook factory against the
  //    packages/design-system subdir. Cloning options is the key trick —
  //    every safeWriteFile path composed from `options.directory` lands
  //    under packages/design-system/ without any change to the 5366-LOC
  //    factory body.
  const dsOptions = cloneOptionsForDesignSystem(options);
  await scaffoldWcStorybookFlat(dsOptions);

  // 3. Lay the monorepo-specific overrides on top. Phase C's
  //    scaffoldMonorepoRoot derives the scope from options.name the
  //    same way; reusing the exported helper here keeps the package
  //    name aligned with the root package.json's
  //    `--filter=@{scope}/design-system` scripts.
  const scope = deriveScope(options.name);

  // Re-derive ds + class + title here so writeDesignSystemIndex emits
  // a barrel that re-exports the Lit class the factory actually wrote.
  // The fallback chain (options.dsName ?? unscoped name ?? 'my-ds')
  // mirrors scaffoldWcStorybook so the barrel always lines up with
  // src/components/{ds}-button/{ds}-button.ts on disk.
  const unscopedName = options.name ? unscopeName(options.name) : null;
  const projectAsDsName =
    unscopedName && validateDsName(unscopedName) === undefined ? unscopedName : null;
  const ds = options.dsName ?? projectAsDsName ?? 'my-ds';
  const className = toPascalCase(ds);
  const baseClass = `${className}Element`;
  const dsTitle = toTitle(ds);

  await writeDesignSystemPackageJson({
    rootDir: options.directory,
    scope,
  });
  await writeDesignSystemTsConfig({ rootDir: options.directory });
  await writeDesignSystemIndex({
    rootDir: options.directory,
    ds,
    className,
    baseClass,
    dsTitle,
  });
}
