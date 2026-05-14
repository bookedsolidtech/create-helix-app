/**
 * Shared emit helpers for the react-next scaffolder that don't care about
 * output root (flat single-app vs monorepo apps/web).
 *
 * v0.7.0 Phase D — the helpers here are the monorepo-specific OVERLAYS that
 * the flat scaffolder doesn't emit:
 *
 *   - writeAppsWebPackageJson  — apps/web/package.json with workspace:* deps
 *   - writeAppsWebNextConfig   — next.config.ts with transpilePackages
 *   - writeAppsWebTsConfig     — tsconfig.json extending ../../tsconfig.base.json
 *   - writeAppsWebWrappers     — wrappers.tsx re-exporting from the DS package
 *   - cloneOptionsForAppsWeb   — redirect helper that points options.directory
 *                                at apps/web/ so we can reuse the existing
 *                                scaffoldReactNextFlat body without touching
 *                                its 1900-LOC content emit.
 *
 * Per PE P1 (fork-don't-branch): only OUTPUT-ROOT logic forks. The page,
 * layout, navbar, footer, examples, JSX-type, theme-toggle, error-boundary,
 * and helix-provider emitters all stay in scaffold.ts under
 * scaffoldReactNext and produce byte-identical output whether they're
 * writing into the flat root or into apps/web/. We achieve that here by
 * giving them a redirected options.directory rather than by threading a
 * `baseDir` param down through 1900 lines of heredoc-emitting code.
 *
 * The monorepo OVERRIDES (next.config.ts, tsconfig.json, wrappers.tsx) are
 * written AFTER scaffoldReactNextFlat returns; they replace files the
 * flat path wrote with monorepo-aware variants. Where the override is
 * gated on includeDesignSystem we keep the design-system arm small —
 * `includeDesignSystem: false` falls back to the flat path's
 * `@helixui/library` direct import so the app remains useful even
 * without the workspace DS package.
 */
import path from 'node:path';
import { safeWriteFile, safeWriteJson } from '../../scaffold.js';
import {
  HELIX_LIBRARY_VERSION,
  HELIX_TOKENS_VERSION,
  HELIX_ICONS_VERSION,
} from '../../helix-versions.js';
// v0.7.0 Phase E: APPS_WEB_REL + cloneOptionsForAppsWeb live in the
// cross-framework shared module now. Re-exported here so existing
// react-next imports continue to resolve without churn.
import { APPS_WEB_REL, cloneOptionsForAppsWeb } from '../_shared/monorepo-redirect.js';
import { HELIX_ICONS_POSTINSTALL_CMD } from '../_shared/helix-icons-setup.js';
export { APPS_WEB_REL, cloneOptionsForAppsWeb };

/**
 * apps/web/package.json — the workspace app's manifest.
 *
 * Three things distinguish it from a flat react-next package.json:
 *   1. Name is `@{scope}/web` (scoped to the workspace), not the raw
 *      project name.
 *   2. Dependencies include `workspace:*` refs to the sibling packages
 *      (design-system when opted in, types + utils always).
 *   3. Scripts use plain `next dev` etc. — Turborepo invokes them from
 *      the root via `turbo run dev --filter=@{scope}/web` and there's
 *      no second package.json above this one in pnpm's resolution chain.
 *
 * NOTE: when includeDesignSystem === false, the @{scope}/design-system
 * dep is omitted; the wrappers.tsx file (still emitted by the flat
 * scaffolder) falls back to `@helixui/library` direct imports.
 */
export async function writeAppsWebPackageJson(args: {
  rootDir: string;
  scope: string;
  includeDesignSystem: boolean;
}): Promise<void> {
  const { rootDir, scope, includeDesignSystem } = args;
  const dependencies: Record<string, string> = {
    next: '^16.0.0',
    react: '^19.1.0',
    'react-dom': '^19.1.0',
    '@helixui/library': HELIX_LIBRARY_VERSION,
    '@helixui/tokens': HELIX_TOKENS_VERSION,
    // @helixui/library@3.x peer-requires @helixui/icons (the <hx-icon>
    // registry) — declare it so a fresh install has no unmet peer.
    '@helixui/icons': HELIX_ICONS_VERSION,
    '@lit/react': '^1.0.0',
    [`@${scope}/types`]: 'workspace:*',
    [`@${scope}/utils`]: 'workspace:*',
  };
  if (includeDesignSystem) {
    dependencies[`@${scope}/design-system`] = 'workspace:*';
  }

  const pkg = {
    name: `@${scope}/web`,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
      'type-check': 'tsc --noEmit',
      // Copy @helixui/icons sprite SVGs into public/icons/ so <hx-icon>
      // resolves them same-origin (see scripts/copy-helix-icons.mjs,
      // emitted by writeHelixIconsCopyScript).
      postinstall: HELIX_ICONS_POSTINSTALL_CMD,
    },
    dependencies,
    devDependencies: {
      '@types/node': '^22.0.0',
      '@types/react': '^19.1.0',
      '@types/react-dom': '^19.1.0',
      typescript: '^5.7.0',
      eslint: '^9.0.0',
      '@eslint/js': '^9.0.0',
      'typescript-eslint': '^8.0.0',
    },
  };

  await safeWriteJson(path.join(rootDir, APPS_WEB_REL, 'package.json'), pkg, { spaces: 2 });
}

/**
 * apps/web/next.config.ts — monorepo-aware Next.js config.
 *
 * `transpilePackages` is the modern (Next 13+) replacement for the legacy
 * `next-transpile-modules` plugin. Required because the workspace packages
 * ship TypeScript sources directly; Next would otherwise refuse to
 * transpile node_modules-like paths even when those paths are symlinked
 * pnpm workspace packages.
 *
 * `experimental.externalDir` tells Next that imports MAY resolve outside
 * apps/web/ — required for symlinked workspace packages whose realpath
 * sits at <root>/packages/* rather than under apps/web/node_modules/.
 *
 * When includeDesignSystem === false, the design-system entry is dropped
 * from transpilePackages — listing a non-existent workspace package
 * would crash `next build` at module-graph time.
 */
export async function writeAppsWebNextConfig(args: {
  rootDir: string;
  scope: string;
  includeDesignSystem: boolean;
}): Promise<void> {
  const { rootDir, scope, includeDesignSystem } = args;
  const transpileList: string[] = [`@${scope}/types`, `@${scope}/utils`];
  if (includeDesignSystem) {
    transpileList.unshift(`@${scope}/design-system`);
  }
  const transpileLiteral = transpileList.map((pkg) => `    '${pkg}',`).join('\n');

  const content = `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pnpm workspace packages ship TypeScript sources; let Next transpile
  // them at build time rather than expecting pre-built dist/ output.
  transpilePackages: [
${transpileLiteral}
  ],
  experimental: {
    // Symlinked workspace packages live OUTSIDE apps/web/. Without this,
    // Next refuses imports whose realpath is above the app root.
    externalDir: true,
  },
};

export default nextConfig;
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'next.config.ts'), content);
}

/**
 * apps/web/tsconfig.json — workspace-aware tsconfig.
 *
 * Extends ../../tsconfig.base.json (the shared compilerOptions block
 * written by scaffoldMonorepoRoot — the root tsconfig.json itself is a
 * project-references file and cannot host compilerOptions). Adds
 * Next-specific options (jsx: preserve, the next plugin, the App
 * Router include patterns) on top of the base.
 *
 * Composite/declaration are off — apps/web is the END app, not a library
 * other workspace packages consume. `paths` keeps the `@/*` alias the
 * scaffolded source files import through.
 */
export async function writeAppsWebTsConfig(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const tsconfig = {
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      jsx: 'preserve',
      allowJs: true,
      noEmit: true,
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: {
        '@/*': ['./src/*'],
      },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  };
  await safeWriteJson(path.join(rootDir, APPS_WEB_REL, 'tsconfig.json'), tsconfig, { spaces: 2 });
}

/**
 * apps/web/src/components/helix/wrappers.tsx — the design-system bridge.
 *
 * When the workspace has a design-system package, wrappers.tsx becomes
 * a thin re-export from `@{scope}/design-system`. The DS package is
 * expected (per Phase F) to ship the @lit/react wrappers baked in —
 * apps/web shouldn't reach past it into @helixui/library directly.
 *
 * When includeDesignSystem === false, this override is SKIPPED — the
 * file written by the flat scaffolder (which imports @helixui/library
 * directly) is left in place. That keeps the no-DS scaffold useful
 * out of the box.
 *
 * Phase F note: until packages/design-system/ ships real exports, the
 * imports here will be unresolved on `pnpm install`. That's the
 * expected v0.7.0 sequencing — Phase H's E2E test runs `pnpm install`
 * end-to-end once Phase F lands.
 */
export async function writeAppsWebWrappersOverride(args: {
  rootDir: string;
  scope: string;
}): Promise<void> {
  const { rootDir, scope } = args;
  const content = `'use client';

/**
 * React wrappers for the @${scope}/design-system component library.
 *
 * The design-system package ships pre-baked @lit/react wrappers around the
 * HELiX-derived hx-* components plus any brand-specific extensions. Consumer
 * apps import them as ordinary React components — no @lit/react setup needed
 * at this layer.
 *
 * Edit this file ONLY to add re-exports of newly added design-system
 * components. Direct @helixui/library imports here would bypass the brand
 * layer and skip any design-system-specific overrides.
 */
export * from '@${scope}/design-system';
`;
  await safeWriteFile(
    path.join(rootDir, APPS_WEB_REL, 'src', 'components', 'helix', 'wrappers.tsx'),
    content,
  );
}
