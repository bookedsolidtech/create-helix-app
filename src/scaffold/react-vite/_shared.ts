/**
 * Shared emit helpers for the react-vite scaffolder that don't care about
 * output root (flat single-app vs monorepo apps/web).
 *
 * v0.7.0 Phase E — the helpers here are the monorepo-specific OVERLAYS that
 * the flat scaffolder doesn't emit:
 *
 *   - writeAppsWebPackageJson  — apps/web/package.json with workspace:* deps
 *   - writeAppsWebViteConfig   — vite.config.ts with optimizeDeps.exclude
 *                                + server.fs.allow for cross-package resolve
 *   - writeAppsWebTsConfig     — tsconfig.json extending ../../tsconfig.base.json
 *   - writeAppsWebWrappers     — wrappers.tsx re-exporting from the DS package
 *
 * The cross-framework redirect helper (cloneOptionsForAppsWeb) lives in
 * ../_shared/monorepo-redirect.ts and is re-exported here so monorepo.ts
 * imports stay symmetric with the Phase D Next.js fork.
 *
 * Per PE P1 (fork-don't-branch): only OUTPUT-ROOT logic forks. The vite.config.ts,
 * package.json, tsconfig.json, and wrappers.tsx emitters in the flat path
 * still write their content first; this module REPLACES those outputs with
 * monorepo-aware variants that point at workspace packages instead of the
 * bare @helixui/library + npm versions the flat path uses.
 *
 * The monorepo OVERRIDES (vite.config.ts, tsconfig.json, package.json,
 * wrappers.tsx) are written AFTER scaffoldReactViteFlat returns; they
 * replace files the flat path wrote with monorepo-aware variants. Where
 * the override is gated on includeDesignSystem we keep the design-system
 * arm small — `includeDesignSystem: false` falls back to the flat path's
 * `@helixui/library` direct import so the app remains useful even
 * without the workspace DS package.
 *
 * Vite-specific note: unlike Next's `transpilePackages`, Vite needs TWO
 * pieces of monorepo plumbing — optimizeDeps.exclude (so the pre-bundler
 * doesn't fold workspace TS sources into stale chunks) AND
 * server.fs.allow (so the dev server is allowed to serve files whose
 * realpath sits above the apps/web/ root). Both are documented inline.
 */
import path from 'node:path';
import { safeWriteFile, safeWriteJson } from '../../scaffold.js';
import { APPS_WEB_REL, cloneOptionsForAppsWeb } from '../_shared/monorepo-redirect.js';

// Re-export so monorepo.ts mirrors the Phase D Next import shape.
export { APPS_WEB_REL, cloneOptionsForAppsWeb };

/**
 * apps/web/package.json — the workspace app's manifest (Vite variant).
 *
 * Three things distinguish it from a flat react-vite package.json:
 *   1. Name is `@{scope}/web` (scoped to the workspace), not the raw
 *      project name.
 *   2. Dependencies include `workspace:*` refs to the sibling packages
 *      (design-system when opted in, types + utils always).
 *   3. Scripts use plain `vite` / `vite build` — Turborepo invokes them
 *      from the root via `turbo run dev --filter=@{scope}/web` and
 *      there's no second package.json above this one in pnpm's
 *      resolution chain.
 *
 * Versions are pinned to match what the flat react-vite template
 * already uses (templates.ts react-vite entry); diverging here would
 * surface as two different Vite/React versions inside the same
 * workspace.
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
    react: '^19.1.0',
    'react-dom': '^19.1.0',
    '@helixui/library': '^1.0.0',
    '@helixui/tokens': '^0.3.0',
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
      dev: 'vite',
      build: 'tsc -b && vite build',
      preview: 'vite preview',
      lint: 'eslint .',
      'type-check': 'tsc --noEmit',
      test: 'vitest run',
    },
    dependencies,
    devDependencies: {
      '@types/react': '^19.1.0',
      '@types/react-dom': '^19.1.0',
      '@vitejs/plugin-react': '^4.5.0',
      vite: '^6.4.0',
      typescript: '^5.7.0',
      eslint: '^9.0.0',
      '@eslint/js': '^9.0.0',
      'typescript-eslint': '^8.0.0',
    },
  };

  await safeWriteJson(path.join(rootDir, APPS_WEB_REL, 'package.json'), pkg, { spaces: 2 });
}

/**
 * apps/web/vite.config.ts — monorepo-aware Vite config.
 *
 * Two monorepo-specific knobs that the flat config doesn't need:
 *
 *   1. `optimizeDeps.exclude` — Vite's dev-mode dep pre-bundler eagerly
 *      processes anything in node_modules and (with esbuild) emits
 *      cached chunks under .vite/. Workspace packages live in
 *      node_modules/ via pnpm symlinks but ship TypeScript SOURCE, not
 *      pre-built dist/ output — pre-bundling them produces stale chunks
 *      every time the design-system source changes. Excluding them
 *      keeps each request a fresh transform.
 *
 *   2. `server.fs.allow: ['..', '../..']` — Vite's dev server refuses
 *      to serve files outside its root by default (the "Serving allowed
 *      files" guard). With apps/web/ as the root, workspace packages
 *      sit one or two directories up. The two-level allowlist covers
 *      both the apps/ sibling and the packages/ sibling.
 *
 * When includeDesignSystem === false, the design-system entry is dropped
 * from optimizeDeps.exclude — referencing a non-existent workspace
 * package would surface as a confusing import resolve error in dev.
 */
export async function writeAppsWebViteConfig(args: {
  rootDir: string;
  scope: string;
  includeDesignSystem: boolean;
}): Promise<void> {
  const { rootDir, scope, includeDesignSystem } = args;
  const excludeList: string[] = [`@${scope}/types`, `@${scope}/utils`];
  if (includeDesignSystem) {
    excludeList.unshift(`@${scope}/design-system`);
  }
  const excludeLiteral = excludeList.map((pkg) => `      '${pkg}',`).join('\n');

  const content = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Monorepo deps live in packages/* (TypeScript sources, not pre-built).
  // optimizeDeps.exclude prevents Vite from pre-bundling them, which would
  // otherwise produce stale chunks when the design-system source updates.
  optimizeDeps: {
    exclude: [
${excludeLiteral}
    ],
  },
  server: {
    // Allow Vite to serve files from outside the apps/web/ root (the
    // workspace deps live up the tree).
    fs: {
      allow: ['..', '../..'],
    },
  },
});
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'vite.config.ts'), content);
}

/**
 * apps/web/tsconfig.json — workspace-aware Vite tsconfig.
 *
 * Extends ../../tsconfig.base.json (the shared compilerOptions block
 * written by scaffoldMonorepoRoot — the root tsconfig.json itself is a
 * project-references file and cannot host compilerOptions). Adds
 * Vite-specific options on top of the base:
 *
 *   - jsx: 'react-jsx' (Vite's react plugin expects the modern transform,
 *     not Next's 'preserve' — wrong value here surfaces as
 *     "Cannot find name 'JSX'" or unrendered components).
 *   - lib: includes 'ES2023' / 'DOM.Iterable' for the Vite tooling layer.
 *   - paths alias for "@/*" matching what the flat src/ tree imports.
 *
 * Composite/declaration are off — apps/web is the END app, not a library
 * other workspace packages consume.
 */
export async function writeAppsWebTsConfig(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const tsconfig = {
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      paths: {
        '@/*': ['./src/*'],
      },
    },
    include: ['src/**/*.ts', 'src/**/*.tsx'],
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
 * directly via createComponent) is left in place. That keeps the no-DS
 * scaffold useful out of the box.
 *
 * Vite difference from Next.js wrappers.tsx: NO `'use client'` directive.
 * Vite is a pure CSR runtime — there's no Server/Client component split,
 * so the directive would just produce dead-code noise the parser drops.
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
  const content = `/**
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
