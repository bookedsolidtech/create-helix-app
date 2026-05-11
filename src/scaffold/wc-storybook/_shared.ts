/**
 * Shared emit helpers for the wc-storybook scaffolder — monorepo-specific
 * overlays applied AFTER the flat factory runs against the redirected
 * packages/design-system/ root.
 *
 * v0.7.0 Phase F — replaces the placeholder stub. The flat factory body
 * (scaffold.ts:scaffoldWcStorybook, ~5366 LOC) is driven via the
 * cloneOptionsForDesignSystem redirect; it emits a fully-functional
 * Storybook factory under packages/design-system/. These helpers then
 * lay the workspace-specific overrides on top:
 *
 *   - writeDesignSystemPackageJson — overwrites the factory's standalone
 *     package.json with the scoped @{scope}/design-system + private:true +
 *     exports field shape the workspace expects. apps/web's
 *     `workspace:*` ref resolves against THIS package.
 *   - writeDesignSystemTsConfig — adjusts tsconfig.json to extend
 *     ../../tsconfig.base.json + composite:true so `tsc -b` from the
 *     monorepo root picks up the package's declaration build.
 *   - writeDesignSystemIndex — overrides src/index.ts with the React-
 *     wrappers barrel. The flat factory emitted a Lit-only barrel
 *     (the wc-storybook standalone consumer drops bare <hx-*> tags into
 *     framework-agnostic templates); the monorepo's apps/web is a React
 *     app that needs React-flavored components, so we re-export
 *     @lit/react-wrapped versions of the 7 main HELiX components.
 *
 * Per PE P1 (fork-don't-branch): the wc-storybook factory body is
 * unchanged. Only the OUTPUT-ROOT + a handful of post-flat overrides
 * differ between flat and monorepo paths. Threading a `baseDir` param
 * through 5366 LOC of heredoc-emitting code would be a future-bug
 * magnet — the redirect-via-options.directory approach keeps the change
 * surface narrow and the flat path's golden snapshot byte-identical.
 */
import path from 'node:path';
import { safeWriteFile, safeWriteJson } from '../../scaffold.js';
import { getTemplate } from '../../templates.js';
import { DS_PACKAGE_REL, cloneOptionsForDesignSystem } from '../_shared/monorepo-redirect.js';

// Re-export so monorepo.ts mirrors the Phase D Next / Phase E Vite
// import shapes.
export { DS_PACKAGE_REL, cloneOptionsForDesignSystem };

/**
 * Scripts the wc-storybook DS package ships in monorepo mode. Mirror of
 * the flat scaffolder's getScripts('wc-storybook') case in src/scaffold.ts
 * — duplicated here rather than reaching into a private helper because
 * the flat path is the source-of-truth for the standalone surface and
 * we don't want a tight coupling that breaks when either side moves.
 *
 * Turborepo invokes `storybook` / `build-storybook` / `dev` / `build`
 * from the monorepo root via `turbo run <task> --filter=@{scope}/design-system`;
 * the literal commands resolve against the package's own
 * devDependencies (pnpm-installed under packages/design-system/node_modules/
 * or hoisted to the root, both work).
 */
function wcStorybookScripts(): Record<string, string> {
  return {
    dev: 'tsx scripts/build-tokens.ts && cem analyze --globs "src/**/*.ts" && tsx scripts/generate-catalog.ts && concurrently -n tokens,sb -c blue,magenta "tsx scripts/build-tokens.ts --watch" "storybook dev -p 6006"',
    storybook:
      'tsx scripts/build-tokens.ts && cem analyze --globs "src/**/*.ts" && tsx scripts/generate-catalog.ts && concurrently -n tokens,sb -c blue,magenta "tsx scripts/build-tokens.ts --watch" "storybook dev -p 6006"',
    'build-storybook':
      'tsx scripts/build-tokens.ts && cem analyze --globs "src/**/*.ts" && tsx scripts/generate-catalog.ts && storybook build',
    build:
      "tsx scripts/build-tokens.ts && cem analyze --globs \"src/**/*.ts\" && vite build && tsc --project tsconfig.build.json && node -e \"const fs=require('fs');fs.copyFileSync('src/tokens/tokens.css','dist/tokens.css');fs.copyFileSync('custom-elements.json','dist/custom-elements.json')\"",
    test: 'vitest run',
    'test:ui': 'vitest --ui',
    'type-check': 'tsc --noEmit',
    'cem:analyze': 'cem analyze --globs "src/**/*.ts"',
    'cem:catalog': 'tsx scripts/generate-catalog.ts',
    'build:tokens': 'tsx scripts/build-tokens.ts',
    'watch:tokens': 'tsx scripts/build-tokens.ts --watch',
    'tokens:sync': 'tsx scripts/sync-tokens.ts && tsx scripts/build-tokens.ts',
    'tokens:refresh-platform': 'tsx scripts/refresh-tokens.ts && tsx scripts/build-tokens.ts',
  };
}

/**
 * packages/design-system/package.json — the workspace DS package manifest.
 *
 * Distinguishing traits vs the flat wc-storybook package.json:
 *   1. Name is `@{scope}/design-system` (scoped to the workspace), not
 *      the raw consumer-chosen project name. apps/web's `workspace:*`
 *      ref resolves against THIS name.
 *   2. `private: true` — workspace-internal, NOT publishable in v0.7.0
 *      (per DXA Q4). The flat library path emits a publishable package
 *      with main / module / exports / types / files; here we keep the
 *      exports field so types resolve across workspace boundaries but
 *      mark the package private so a misfire of `pnpm publish` from
 *      the monorepo root no-ops on this package.
 *   3. `exports` field exposes the dist barrel + the tokens + styles
 *      side-effect imports apps/web pulls in via `@{scope}/design-system`
 *      and `@{scope}/design-system/tokens` / `/styles`.
 *
 * Scripts are unchanged from the flat factory — Turborepo invokes them
 * via `turbo run storybook --filter=@{scope}/design-system` from the
 * monorepo root, and the package's own scripts continue to work
 * directly when invoked inside packages/design-system/.
 *
 * Dependencies + devDependencies are inherited from the flat factory's
 * existing emit (Storybook 10 + Lit 3 + @helixui/* peerDeps); we only
 * touch identity fields here.
 */
export async function writeDesignSystemPackageJson(args: {
  rootDir: string;
  scope: string;
}): Promise<void> {
  const { rootDir, scope } = args;
  const template = getTemplate('wc-storybook');
  if (!template) {
    throw new Error(
      'wc-storybook template not found in templates.ts — writeDesignSystemPackageJson cannot synthesize the DS package.json without it.',
    );
  }
  const pkgPath = path.join(rootDir, DS_PACKAGE_REL, 'package.json');
  // The wc-storybook flat factory does NOT write its own package.json —
  // src/scaffold.ts's parent dispatch normally handles that via
  // writePackageJson(options, template). In Phase F we're past that
  // dispatch (called from Phase D / E's monorepo emit, OR from a future
  // direct-wc-storybook-monorepo invocation that bypassed dispatch), so
  // there's nothing to read back. We synthesize the manifest fresh from
  // the wc-storybook TEMPLATE config and the wcStorybookScripts() table
  // — same source of truth the flat path uses, minus the publishable-
  // library identity surface (main / module / types / files / customElements
  // / sideEffects) which would be misleading on a private workspace
  // package.
  //
  // Dependencies + peerDependencies + devDependencies are copied through
  // unchanged so a fresh `pnpm install` resolves the same Storybook 10 /
  // Lit 3 / Vitest 3 surface the flat path ships.
  // v0.7.0 Phase H follow-up — the monorepo emit's src/index.ts is the
  // React-wrappers barrel (writeDesignSystemIndex below). It imports
  // `@lit/react` for createComponent + relies on `react` / `react-dom`
  // resolving for the React renderer types. The flat wc-storybook
  // template does NOT ship these because the standalone wc-storybook
  // factory emits a Lit-only barrel (bare <hx-*> in framework-agnostic
  // templates). In monorepo mode we MUST add them or `pnpm type-check`
  // fails on a missing `@lit/react` module declaration.
  //
  // Versions are pinned to match what apps/web declares (Phase D's
  // writeAppsWebPackageJson and Phase E's writeAppsWebPackageJson) so a
  // fresh `pnpm install` doesn't surface a multi-version React in the
  // workspace. peerDependencies (rather than dependencies) for react +
  // react-dom because the consumer app already ships its own React;
  // packages/design-system just needs to type-check against it without
  // pulling a second copy under packages/design-system/node_modules/.
  const dsExtraDeps: Record<string, string> = {
    ...(template.dependencies ?? {}),
    '@lit/react': '^1.0.0',
  };
  const dsExtraPeerDeps: Record<string, string> = {
    ...(template.peerDependencies ?? {}),
    react: '^19.1.0',
    'react-dom': '^19.1.0',
  };

  const pkg: Record<string, unknown> = {
    name: `@${scope}/design-system`,
    version: '0.0.0',
    private: true,
    type: 'module',
    // exports — the contract apps/web depends on. './' resolves the
    // React-wrappers barrel built into dist/index.js (compiled from
    // src/index.ts via tsconfig.build.json); './tokens' streams the
    // raw CSS file (apps import this once at root to define
    // --{prefix}-* + --hx-* variables); './styles' is the optional
    // compiled stylesheet bucket the build chain copies to dist/.
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
      './tokens': './src/tokens/tokens.css',
      './styles': './dist/styles.css',
    },
    scripts: wcStorybookScripts(),
    dependencies: dsExtraDeps,
    devDependencies: {
      ...(template.devDependencies ?? {}),
    },
    peerDependencies: dsExtraPeerDeps,
  };

  await safeWriteJson(pkgPath, pkg, { spaces: 2 });
}

/**
 * packages/design-system/tsconfig.json — workspace-aware DS tsconfig.
 *
 * Extends ../../tsconfig.base.json (the shared compilerOptions block
 * written by scaffoldMonorepoRoot — the root tsconfig.json itself is a
 * project-references file and cannot host compilerOptions).
 *
 * `composite: true` is required because the root tsconfig uses project
 * references; without it `tsc -b` would error out
 * `referenced project '/.../packages/design-system' must have setting
 * "composite": true`.
 *
 * `declaration: true` + `declarationMap: true` so dependent packages
 * (apps/web) can resolve types from the dist/ output. The flat factory's
 * tsconfig.build.json drives the actual declaration emit; this file is
 * the editor / dev-time tsconfig.
 *
 * `jsx: react-jsx` matches the flat factory — Storybook 10's preview
 * imports a few .tsx helpers from src/stories/_components/ that need
 * the modern transform.
 *
 * Storybook-10 caveat: the flat factory ships tsconfig.build.json with
 * a narrow include (src/index.ts + base + components + tokens). That
 * remains unchanged — it's the declaration-only build that produces
 * dist/index.d.ts. This file is the project-references entry that
 * Storybook + `pnpm dev` actually use.
 */
export async function writeDesignSystemTsConfig(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  // v0.7.0 Phase H follow-up — `rootDir: './src'` was too narrow:
  //   1. src/stories/*.mdx imports `helix.storybook.config.ts` (at the
  //      package root, NOT under src/) → TS6307.
  //   2. src/stories/Tokens.mdx imports `src/tokens/tokens.json` → TS6059
  //      because the glob `src/**/*.ts(x)` excludes .json.
  // Drop `rootDir` (tsc infers it from `include` patterns when not set)
  // and widen `include` to cover the root-level Storybook config knob +
  // JSON token files. The exclude list keeps Storybook config (.storybook/
  // has its own type setup under Storybook 10 + Vite) and tsx-runnable
  // build scripts out of the editor type-check pass.
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
      // Lit decorator runtime requires both flags — without
      // experimentalDecorators OR with useDefineForClassFields:true,
      // components register but render nothing (silent failure).
      experimentalDecorators: true,
      useDefineForClassFields: false,
      declaration: true,
      declarationMap: true,
      outDir: './dist',
      composite: true,
    },
    include: [
      'src/**/*.ts',
      'src/**/*.tsx',
      'src/**/*.json',
      'helix.storybook.config.ts',
      // src/stories/_components/{A11yStatusCard,APGPatternCard}.tsx import
      // `../../../custom-elements.json` (the CEM artifact emitted at the
      // package root by `cem analyze`). Without this entry tsc 6307s with
      // "File '<root>/custom-elements.json' is not listed within the file
      // list of project". Same root-level file family as the
      // helix.storybook.config.ts entry above.
      'custom-elements.json',
    ],
    exclude: ['node_modules', 'dist', 'storybook-static', '.storybook', 'scripts'],
  };
  await safeWriteJson(path.join(rootDir, DS_PACKAGE_REL, 'tsconfig.json'), tsconfig, { spaces: 2 });
}

/**
 * packages/design-system/src/index.ts — React-wrappers barrel.
 *
 * v0.7.0 Phase F — overrides the wc-storybook flat factory's Lit-only
 * barrel ("export { AuroraButton } from './components/aurora-button/...'")
 * with a React-flavored barrel that apps consuming this workspace
 * package (apps/web/src/components/helix/wrappers.tsx) re-export from.
 *
 * The 7 components covered here mirror the 7 main HELiX surfaces Phase D's
 * apps/web/wrappers.tsx wrapped directly via @helixui/library imports.
 * Each createComponent call wires the Lit-defined custom element into
 * React's renderer with proper event-name → onHandler mapping (so
 * onClick / onHxClick land as functions, not no-op string attributes).
 *
 * customElements.get() is used here (matching the flat path's wrappers)
 * rather than direct class imports — keeps the wrapper module portable
 * across @helixui/library version bumps that rename internal classes.
 * The per-component side-effect imports immediately above each block
 * register the elements before customElements.get returns a real class.
 *
 * The Lit-side barrel exports (the DS-specific {ClassName}Button class
 * + ButtonVariant type the flat factory emits) are preserved at the
 * bottom — Storybook stories under src/stories/ still import them, and
 * dropping them would break `pnpm storybook` in the DS package itself.
 */
export async function writeDesignSystemIndex(args: {
  rootDir: string;
  ds: string;
  className: string;
  baseClass: string;
  dsTitle: string;
}): Promise<void> {
  const { rootDir, ds, className, baseClass, dsTitle } = args;
  const content = `// ${dsTitle} Design System — workspace package entry point.
//
// React wrappers for @helixui/library web components, generated via
// @lit/react createComponent. Apps consuming the design-system package
// (apps/web/src/components/helix/wrappers.tsx) import React-flavored
// versions of HELiX components from here instead of dropping bare
// <hx-*> elements into their JSX.
//
// The DS-specific Lit class (${className}Button) + variant types from
// the wc-storybook factory are re-exported at the bottom for Storybook
// + any consumer that wants the underlying Lit element.

import { createComponent } from '@lit/react';
import React from 'react';

// Side-effect imports register the custom elements before
// customElements.get() can resolve them. Each '@helixui/library/components/<tag>'
// subpath is documented in @helixui/library's exports field as a
// stable, tree-shakeable entry.
import '@helixui/library/components/hx-button';
import '@helixui/library/components/hx-card';
import '@helixui/library/components/hx-dialog';
import '@helixui/library/components/hx-form';
import '@helixui/library/components/hx-select';
import '@helixui/library/components/hx-tabs';
import '@helixui/library/components/hx-text-input';

/**
 * React-wrapped <hx-button>.
 *
 * @example
 *   import { Button } from '@{scope}/design-system';
 *   <Button variant="primary" onHxClick={() => save()}>Save</Button>
 */
export const Button = createComponent({
  tagName: 'hx-button',
  elementClass: customElements.get('hx-button') as CustomElementConstructor,
  react: React,
  events: {
    onHxClick: 'hx-click',
    onHxFocus: 'hx-focus',
    onHxBlur: 'hx-blur',
  },
});

export const Card = createComponent({
  tagName: 'hx-card',
  elementClass: customElements.get('hx-card') as CustomElementConstructor,
  react: React,
});

export const Dialog = createComponent({
  tagName: 'hx-dialog',
  elementClass: customElements.get('hx-dialog') as CustomElementConstructor,
  react: React,
  events: {
    onHxOpen: 'hx-open',
    onHxClose: 'hx-close',
  },
});

export const Form = createComponent({
  tagName: 'hx-form',
  elementClass: customElements.get('hx-form') as CustomElementConstructor,
  react: React,
  events: {
    onHxSubmit: 'hx-submit',
  },
});

export const Select = createComponent({
  tagName: 'hx-select',
  elementClass: customElements.get('hx-select') as CustomElementConstructor,
  react: React,
  events: {
    onHxChange: 'hx-change',
  },
});

export const Tabs = createComponent({
  tagName: 'hx-tabs',
  elementClass: customElements.get('hx-tabs') as CustomElementConstructor,
  react: React,
  events: {
    onHxTabChange: 'hx-tab-change',
  },
});

export const TextInput = createComponent({
  tagName: 'hx-text-input',
  elementClass: customElements.get('hx-text-input') as CustomElementConstructor,
  react: React,
  events: {
    onHxInput: 'hx-input',
    onHxChange: 'hx-change',
  },
});

// DS-specific Lit class + variant types — preserved from the flat
// factory's barrel so Storybook stories + Lit-direct consumers still
// resolve them through the package root.
export { ${baseClass} } from './base/${ds}-element.js';
export { ${className}Button } from './components/${ds}-button/${ds}-button.js';
export { ${className}ButtonStyles } from './components/${ds}-button/${ds}-button.styles.js';
export type { ButtonVariant } from './components/${ds}-button/${ds}-button.styles.js';
`;
  await safeWriteFile(path.join(rootDir, DS_PACKAGE_REL, 'src', 'index.ts'), content);
}
