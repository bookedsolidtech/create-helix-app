/**
 * Shared emit helpers for the SvelteKit monorepo scaffolder — the
 * apps/web overlay applied AFTER scaffoldMonorepoRoot lays down the
 * workspace skeleton.
 *
 * v0.9.0 Phase B — populates the placeholder stub. SvelteKit consumes
 * the design-system as NATIVE web components: <hx-button> directly in
 * .svelte files, zero React-wrapper indirection. Svelte handles custom
 * elements first-class — the compiler treats unknown lowercase-with-dash
 * tags as DOM elements (no `isCustomElement` config required, unlike
 * Vue).
 *
 * Per PE P1 (fork-don't-branch): the flat SvelteKit scaffolder body in
 * src/scaffold.ts is being deprecated (per user direction 2026-05-12)
 * and the monorepo path becomes the supported shipping target on this
 * same release. Phase B does NOT reuse the flat body via
 * cloneOptionsForAppsWeb — we emit fresh files sized for the SERIOUS
 * landing-page contract.
 *
 * The helpers below mirror the shape of astro/_shared.ts (v0.8.0):
 *
 *   - writeAppsWebPackageJson  — @{scope}/web with workspace:* deps,
 *                                svelte/sveltekit scripts, direct
 *                                @helixui/library pin so the runtime
 *                                loader resolves outside the DS package.
 *   - writeAppsWebSvelteConfig — adapter-static + vitePreprocess + the
 *                                $lib alias plus a $tokens alias for the
 *                                workspace tokens import.
 *   - writeAppsWebViteConfig   — sveltekit() plugin + optimizeDeps.exclude
 *                                on workspace deps + server.fs.allow for
 *                                cross-package source resolution.
 *   - writeAppsWebTsConfig     — extends .svelte-kit/tsconfig.json (Kit
 *                                generates that at first dev/build) AND
 *                                ../../tsconfig.base.json for workspace
 *                                inherited settings.
 *   - writeAppsWebAppDts       — App namespace types ({Locals, PageData}
 *                                stubs) — every SvelteKit project ships
 *                                one even when empty.
 *   - writeAppsWebAppHtml      — app.html shell with skip-link target +
 *                                FOUC-prevention boot script + tokens
 *                                stylesheet hook.
 *   - writeAppsWebLayout       — the critical +layout.svelte with the
 *                                onMount-gated HELiX runtime loader,
 *                                view-transition onNavigate hook, and
 *                                site chrome.
 *   - writeAppsWebIndexPage    — the SERIOUS landing page (hero +
 *                                features + showcase, hand-written
 *                                cross-domain-neutral copy).
 *   - writeAppsWebComponentsPage — second route demonstrating view
 *                                transitions + real component usage.
 *   - writeAppsWebThemeToggle  — light/dark switcher persisting to
 *                                localStorage; flips <html data-theme>.
 *   - writeAppsWebFavicon      — default SVG favicon (mark-only, no
 *                                wordmark).
 */
import path from 'node:path';
import { safeWriteFile, safeWriteJson } from '../../scaffold.js';
import {
  HELIX_LIBRARY_VERSION,
  HELIX_TOKENS_VERSION,
  HELIX_ICONS_VERSION,
} from '../../helix-versions.js';
import { APPS_WEB_REL } from '../_shared/monorepo-redirect.js';
import {
  HELIX_ICONS_POSTINSTALL_CMD,
  helixIconsGitignoreEntry,
  helixIconsSetBasePathDynamic,
} from '../_shared/helix-icons-setup.js';

// Re-export so monorepo.ts mirrors the Phase D Next / Phase E Vite /
// Astro Phase C import shapes.
export { APPS_WEB_REL };
export { cloneOptionsForAppsWeb } from '../_shared/monorepo-redirect.js';

/**
 * Pinned versions for the apps/web manifest. Svelte 5 is the runes-based
 * generation (released 2024); SvelteKit 2 is its supported framework
 * pairing. adapter-static produces full static-site output, mirroring
 * v0.8.0 Astro's `output: 'static'` baseline.
 *
 * @sveltejs/vite-plugin-svelte 4.x is the Svelte-5-aware plugin (the 3.x
 * line is Svelte 4 only). svelte-check 4.x is the type-checker we run as
 * part of `pnpm build`.
 */
const SVELTE_VERSION = '^5.0.0';
const SVELTEKIT_VERSION = '^2.0.0';
const ADAPTER_STATIC_VERSION = '^3.0.0';
// vite-plugin-svelte v6 is the line that supports Vite 7 + Svelte 5.
// v4/v5 peers Vite 5/6; v7 jumps to Vite 8 beta. v6.x is the right
// match for the repo's Vite 7.3.x pin.
const VITE_PLUGIN_SVELTE_VERSION = '^6.0.0';
const SVELTE_CHECK_VERSION = '^4.0.0';
const VITE_VERSION = '^7.0.0';
// HELIX_LIBRARY_VERSION / HELIX_TOKENS_VERSION come from the centralized
// helix-versions.ts (single source of truth — see import above).
const TYPESCRIPT_VERSION = '^5.7.0';
// @types/node — required by the SvelteKit-generated .svelte-kit/tsconfig.json,
// which compiles with `types: ["node"]`. Without this devDep, `svelte-check`
// emits a "Cannot find type definition file for 'node'" warning on every
// type-check / build pass. v0.9.1 cross-kit audit fix.
const TYPES_NODE_VERSION = '^22.0.0';

/**
 * apps/web/package.json — the SvelteKit workspace app's manifest.
 *
 * Distinguishing traits vs a flat SvelteKit package.json:
 *   1. Name is `@{scope}/web` (scoped to the workspace).
 *   2. Dependencies include `workspace:*` refs to sibling packages
 *      (design-system when opted in, types + utils always).
 *   3. @helixui/library is a DIRECT dep, not just transitive via the
 *      design-system. The SvelteKit runtime loader (+layout.svelte's
 *      onMount → dynamic import) imports the package directly to trigger
 *      customElements.define(); without an explicit dep, pnpm
 *      strict-mode resolution would refuse the import even when the
 *      design-system pulls it as a peer.
 *   4. When includeDesignSystem === false, the @{scope}/design-system
 *      dep is omitted and apps/web reads tokens from @helixui/tokens
 *      directly.
 *
 * Scripts use the SvelteKit CLI directly. `svelte-kit sync` runs first
 * to generate the .svelte-kit/ tsconfig (without it, the app's
 * tsconfig.json extends a non-existent file and `tsc` fails on cold
 * checkout). `build` runs svelte-check before vite build so type errors
 * surface before the static-site emit.
 */
export async function writeAppsWebPackageJson(args: {
  rootDir: string;
  scope: string;
  includeDesignSystem: boolean;
}): Promise<void> {
  const { rootDir, scope, includeDesignSystem } = args;

  const dependencies: Record<string, string> = {
    // Direct @helixui/library — the runtime loader bundles this into
    // the page so customElements.define() runs on hydration. Pinned to
    // the same range the design-system declares to avoid double-install.
    '@helixui/library': HELIX_LIBRARY_VERSION,
    // @helixui/library@3.x peer-requires @helixui/icons (the <hx-icon>
    // registry) — declare it so a fresh install has no unmet peer and
    // the emitted <hx-icon library="..."> examples resolve.
    '@helixui/icons': HELIX_ICONS_VERSION,
    [`@${scope}/types`]: 'workspace:*',
    [`@${scope}/utils`]: 'workspace:*',
  };

  if (includeDesignSystem) {
    dependencies[`@${scope}/design-system`] = 'workspace:*';
  } else {
    // No DS package — fall back to upstream @helixui/tokens directly so
    // the +layout.svelte tokens import still resolves.
    dependencies['@helixui/tokens'] = HELIX_TOKENS_VERSION;
  }

  const pkg = {
    name: `@${scope}/web`,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite dev',
      build: 'svelte-kit sync && svelte-check && vite build',
      preview: 'vite preview',
      'type-check': 'svelte-kit sync && svelte-check',
      prepare: 'svelte-kit sync',
      // Copy @helixui/icons sprite SVGs into static/icons/ so <hx-icon>
      // resolves them same-origin (see scripts/copy-helix-icons.mjs,
      // emitted by writeHelixIconsCopyScript).
      postinstall: HELIX_ICONS_POSTINSTALL_CMD,
    },
    dependencies,
    devDependencies: {
      '@sveltejs/adapter-static': ADAPTER_STATIC_VERSION,
      '@sveltejs/kit': SVELTEKIT_VERSION,
      '@sveltejs/vite-plugin-svelte': VITE_PLUGIN_SVELTE_VERSION,
      '@types/node': TYPES_NODE_VERSION,
      svelte: SVELTE_VERSION,
      'svelte-check': SVELTE_CHECK_VERSION,
      typescript: TYPESCRIPT_VERSION,
      vite: VITE_VERSION,
    },
  };

  await safeWriteJson(path.join(rootDir, APPS_WEB_REL, 'package.json'), pkg, { spaces: 2 });
}

/**
 * apps/web/svelte.config.js — SvelteKit framework config.
 *
 * adapter-static produces a fully static site (HTML + bundled JS + CSS)
 * matching v0.8.0 Astro's `output: 'static'` choice. Consumers can swap
 * in adapter-node, adapter-vercel, etc. later — the only adapter-specific
 * behavior here is the prerender hint in src/routes/+layout.ts (which
 * we don't emit until consumers opt in).
 *
 * vitePreprocess gives us TypeScript + PostCSS in .svelte files out of
 * the box. No need for a separate svelte.config.js preprocess array
 * config until the consumer adds SCSS or similar.
 *
 * fallback: 'index.html' lets SvelteKit's static adapter handle SPA-mode
 * fallback for unknown routes — without it, deep links 404 on
 * non-prerendered paths.
 */
export async function writeAppsWebSvelteConfig(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;

  const content = `import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * SvelteKit configuration for the workspace app.
 *
 * adapter-static — full static-site output (HTML + bundled JS/CSS).
 * Consumer can swap in adapter-node / adapter-vercel / adapter-netlify
 * later as deployment needs evolve.
 *
 * vitePreprocess — first-party TS + PostCSS preprocessor. Drop in if
 * you need SCSS/Sass/Less by extending the preprocess array.
 */
/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // SPA-mode fallback for non-prerendered paths. Without this, deep
      // links to client-side-only routes 404 on cold load.
      fallback: 'index.html',
      pages: 'build',
      assets: 'build',
      strict: true,
    }),
    alias: {
      // \`$lib\` is built-in. \`$tokens\` is our convenience alias for
      // importing the workspace design-system's tokens.css from
      // .svelte files (and falling back to @helixui/tokens when the
      // DS package isn't present).
    },
  },
};

export default config;
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'svelte.config.js'), content);
}

/**
 * apps/web/vite.config.ts — monorepo-aware Vite config.
 *
 * Two monorepo-specific concerns (same as v0.8.0 Astro's astro.config.mjs):
 *   1. optimizeDeps.exclude — workspace packages ship TypeScript sources
 *      (not pre-built dist/). Vite's dep-pre-bundling would otherwise
 *      produce stale chunks when DS source updates mid-`vite dev`
 *      session; excluding lets HMR see source changes live.
 *   2. server.fs.allow — Vite's dev server enforces a strict FS-access
 *      boundary by default (apps/web/ only). Workspace deps live up the
 *      tree under packages/*, so we whitelist '..' (apps/) and '../..'
 *      (the monorepo root). Without this Vite would 403 on imports
 *      resolving through symlinked workspace packages.
 *
 * sveltekit() plugin must be in the plugins array — it wires the Kit
 * compiler into Vite's transform pipeline.
 */
export async function writeAppsWebViteConfig(args: {
  rootDir: string;
  scope: string;
  includeDesignSystem: boolean;
}): Promise<void> {
  const { rootDir, scope, includeDesignSystem } = args;

  const excludeList: string[] = [];
  if (includeDesignSystem) {
    excludeList.push(`@${scope}/design-system`);
  }
  excludeList.push(`@${scope}/types`, `@${scope}/utils`);
  const excludeLiteral = excludeList.map((pkg) => `      '${pkg}',`).join('\n');

  const content = `import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * Vite config for the @${scope}/web SvelteKit app.
 *
 * HELiX custom elements are native browser APIs — no special framework
 * integration required. They work with SvelteKit's hydration model: the
 * runtime loader in +layout.svelte's onMount upgrades all <hx-*> tags
 * on the page after the Svelte hydration pass completes.
 */
export default defineConfig({
  plugins: [sveltekit()],

  // Monorepo deps live in packages/* (TypeScript sources, not pre-built).
  // optimizeDeps.exclude prevents Vite from pre-bundling them, which
  // would otherwise produce stale chunks when source updates mid-dev.
  optimizeDeps: {
    exclude: [
${excludeLiteral}
    ],
  },

  server: {
    // Allow Vite to serve files from outside the apps/web/ root.
    // Workspace deps live up the tree at <root>/packages/*; without
    // this, dev-server resolution 403s on symlinked package sources.
    fs: {
      allow: ['..', '../..'],
    },
  },
});
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'vite.config.ts'), content);
}

/**
 * apps/web/tsconfig.json — workspace-aware SvelteKit tsconfig.
 *
 * Extends BOTH `.svelte-kit/tsconfig.json` (Kit generates that on first
 * dev/build/sync — it carries the SvelteKit-specific path aliases like
 * $app/* and $lib/*) AND `../../tsconfig.base.json` (the shared
 * workspace settings). SvelteKit's official template extends only its
 * generated tsconfig; we layer the workspace base on top via a manual
 * merge of its compilerOptions in the `compilerOptions` block here.
 *
 * Note the prepare script in package.json runs `svelte-kit sync` so the
 * extends target exists before tsc/svelte-check runs. Without that the
 * cold-checkout type-check fails with `Cannot find file '.svelte-kit/tsconfig.json'`.
 */
export async function writeAppsWebTsConfig(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const tsconfig = {
    extends: './.svelte-kit/tsconfig.json',
    compilerOptions: {
      allowJs: true,
      checkJs: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      sourceMap: true,
      strict: true,
      moduleResolution: 'bundler',
      target: 'ES2022',
    },
    // The .svelte-kit/tsconfig.json carries include/exclude/paths; this
    // tsconfig.json overrides only what the workspace cares about. Kit's
    // generated tsconfig adds the .svelte file globs automatically.
  };
  await safeWriteJson(path.join(rootDir, APPS_WEB_REL, 'tsconfig.json'), tsconfig, { spaces: 2 });
}

/**
 * apps/web/src/app.d.ts — SvelteKit ambient types.
 *
 * The `App` namespace is where consumers extend Kit's typed Locals,
 * PageData, etc. Every SvelteKit project ships one of these even when
 * the namespaces are empty — it's how Kit's framework types stay
 * project-aware.
 */
export async function writeAppsWebAppDts(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const content = `// See https://svelte.dev/docs/kit/types#app
// for information about these types.
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'src', 'app.d.ts'), content);
}

/**
 * apps/web/src/app.html — SvelteKit HTML shell.
 *
 * This is the template every page renders into. SvelteKit replaces the
 * %sveltekit.head%, %sveltekit.body%, and %sveltekit.assets%
 * placeholders at build/render time.
 *
 * The FOUC-prevention boot script runs INLINE before the body paints
 * to restore the user's saved theme — without it, a user who saved dark
 * mode on their last visit sees a flash of white on cold load.
 */
export async function writeAppsWebAppHtml(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const content = `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.svg" type="image/svg+xml" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
    <script>
      // FOUC prevention — runs before paint to restore saved theme.
      // Mirrors the inline boot block in v0.8.0 Astro's Layout.astro.
      //
      // v0.9.1 cross-kit audit:
      //  - storage key is 'helix-theme' (matches react-next + react-vite
      //    + astro)
      //  - storage failure (privacy mode / sandbox) still honors
      //    prefers-color-scheme — the try wraps the read ONLY,
      //    matchMedia + setAttribute always run
      (function () {
        var t = null;
        try {
          t = localStorage.getItem('helix-theme');
        } catch (e) {
          /* storage disabled — fall through to prefers-color-scheme */
        }
        if (t === 'dark' || t === 'light') {
          document.documentElement.setAttribute('data-theme', t);
        } else if (
          window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
        ) {
          document.documentElement.setAttribute('data-theme', 'dark');
        } else {
          document.documentElement.setAttribute('data-theme', 'light');
        }
      })();
    </script>
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'src', 'app.html'), content);
}

/**
 * apps/web/src/routes/+layout.svelte — THE critical file.
 *
 * Web components need `customElements.define()` to run in the browser.
 * SvelteKit hydrates client-side after the static HTML is served, so the
 * runtime loader sits inside an `onMount()` callback — that callback
 * runs once on initial hydration, after the DOM exists.
 *
 * Dynamic `import('@helixui/library')` (rather than a static top-level
 * import) keeps the SSR / prerender bundle from trying to evaluate the
 * library in Node (which has no `customElements` and would crash). The
 * library's customElements.define() calls happen once on first load;
 * subsequent client-side navigations preserve the registry.
 *
 * The onNavigate hook is SvelteKit 2's canonical wiring for browser-native
 * View Transitions (the same primitive Astro 5's ClientRouter wraps).
 * Falls back to a no-op when document.startViewTransition isn't
 * available (Firefox <127, older Safari).
 *
 * Tokens are loaded via the top-level `import` (resolved at build by
 * Vite into the bundled CSS). When includeDesignSystem is true the
 * import targets `@{scope}/design-system/tokens` (the package's
 * exports field maps `./tokens` to its tokens.css); otherwise it falls
 * back to `@helixui/tokens/tokens.css` directly.
 */
export async function writeAppsWebLayout(args: {
  rootDir: string;
  scope: string;
  dsTitle: string;
  includeDesignSystem: boolean;
}): Promise<void> {
  const { rootDir, scope, dsTitle, includeDesignSystem } = args;

  const tokensImport = includeDesignSystem
    ? `'@${scope}/design-system/tokens';`
    : `'@helixui/tokens/tokens.css';`;
  const tokensComment = includeDesignSystem
    ? `  // Brand tokens from the workspace design-system package. The
  // exports field maps './tokens' → src/tokens/tokens.css, so this
  // import side-effect-loads the CSS into the page bundle.`
    : `  // Upstream HELiX tokens (no workspace design-system layer in
  // this scaffold). Opt in to a workspace DS package later by adding
  // an @${scope}/design-system sibling package — the runtime loader
  // below stays the same.`;

  const content = `<script lang="ts">
  import { onMount } from 'svelte';
  import { onNavigate } from '$app/navigation';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';

${tokensComment}
  import ${tokensImport}

  let { children } = $props();

  /**
   * HELiX runtime loader.
   *
   * Dynamic import inside onMount keeps the SSR/prerender bundle from
   * evaluating @helixui/library in Node. Once mounted in the browser,
   * the import resolves, the library calls customElements.define() for
   * every hx-* tag, and any <hx-*> already in the DOM upgrades on the
   * spot.
   *
   * setBasePath() points the @helixui/icons registry at the same-origin
   * /icons/ path the postinstall sprite-copy populates — it runs before
   * @helixui/library loads, or <hx-icon> resolves sprites against the
   * blocked cross-origin jsdelivr CDN default.
   *
   * Runs ONCE per app boot — client-side navigations (the onNavigate
   * hook below) preserve the registered custom elements.
   */
  onMount(async () => {
${helixIconsSetBasePathDynamic('    ')}
    await import('@helixui/library');
  });

  /**
   * Browser-native View Transitions API integration.
   *
   * SvelteKit 2's canonical pattern (from the official docs). Wraps the
   * pending navigation in a startViewTransition call so the
   * old-to-new-page morph is GPU-accelerated. Falls back silently when
   * the API isn't available (Firefox <127, older Safari).
   */
  onNavigate((navigation) => {
    if (typeof document === 'undefined' || !document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<svelte:head>
  <title>${dsTitle} — built with create-helix</title>
  <meta
    name="description"
    content="A HELiX-powered SvelteKit site, scaffolded with create-helix."
  />
</svelte:head>

<a class="skip-link" href="#main">Skip to main content</a>

<div class="theme-toggle-fixed" aria-hidden="false">
  <ThemeToggle />
</div>

{@render children()}

<style>
  .theme-toggle-fixed {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 100;
  }

  :global(*),
  :global(*::before),
  :global(*::after) {
    box-sizing: border-box;
  }

  :global(html) {
    scroll-behavior: smooth;
  }

  :global(body) {
    margin: 0;
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      Roboto,
      Oxygen,
      Ubuntu,
      sans-serif;
    line-height: 1.5;
    background: var(--hx-color-surface-default, #ffffff);
    color: var(--hx-color-text-primary, #0d1825);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :global(html[data-theme='dark']) :global(body) {
    background: var(--hx-color-surface-default, #0d1825);
    color: var(--hx-color-text-primary, #f7f9fb);
  }

  /* Skip-link — anchored off-screen until focused. Standard a11y
     pattern for keyboard users navigating past the header. */
  .skip-link {
    position: absolute;
    left: -10000px;
    top: auto;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  .skip-link:focus {
    position: static;
    width: auto;
    height: auto;
    padding: 0.5rem 1rem;
    background: var(--hx-color-surface-emphasized, #0d1825);
    color: var(--hx-color-text-on-emphasized, #ffffff);
    text-decoration: none;
    border-radius: 0.25rem;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(html) {
      scroll-behavior: auto;
    }
    :global(*),
    :global(*::before),
    :global(*::after) {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'src', 'routes', '+layout.svelte'), content);
}

/**
 * apps/web/src/routes/+layout.ts — prerender flag.
 *
 * Tells SvelteKit's static adapter to prerender every route under this
 * layout. With adapter-static this is what produces actual HTML files
 * in build/. Without it, the adapter falls back to SPA-only mode and
 * deep-links work only after JS hydrates.
 */
export async function writeAppsWebLayoutTs(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const content = `// Prerender every route — adapter-static produces HTML for each at
// build time. Pages with dynamic data should opt out by setting
// \`export const prerender = false\` in their own +page.ts.
export const prerender = true;
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'src', 'routes', '+layout.ts'), content);
}

/**
 * apps/web/src/routes/+page.svelte — the SERIOUS landing page.
 *
 * Production-quality demo of the design-system's web components.
 * Uses real, cross-domain-neutral copy (no Lorem, no
 * healthcare/finance/specific-vertical language). Tone matches the
 * enterprise-grade positioning of the HELiX library.
 *
 * Sections:
 *   1. Header with theme toggle + nav to /components.
 *   2. Hero with two <hx-button> CTAs (primary + ghost).
 *   3. Features grid — 3 <hx-card> with <hx-icon> + heading + body.
 *   4. Components showcase — live interactive examples.
 *   5. Footer with the create-helix scaffold credit.
 *
 * All <hx-*> tags are NATIVE web components — no React wrappers, no
 * Svelte component wrappers. They upgrade via the +layout.svelte
 * onMount runtime loader on first paint.
 */
export async function writeAppsWebIndexPage(args: {
  rootDir: string;
  scope: string;
  dsTitle: string;
}): Promise<void> {
  const { rootDir, scope, dsTitle } = args;

  const githubLink = 'https://github.com/bookedsolidtech/helix';

  const content = `<script lang="ts">
  /**
   * Landing page — the marketing surface for @${scope}/web.
   *
   * Every <hx-*> tag below is a native browser custom element. SvelteKit
   * pre-renders the HTML statically; the +layout.svelte runtime loader
   * upgrades the elements on first hydration. Zero React. Zero Svelte
   * component wrappers around web components.
   *
   * Replace the copy + adjust the component selection to match your
   * product. The scaffold ships with intentionally generic,
   * cross-domain-neutral text — usable for any vertical without
   * embarrassing leftover Lorem.
   */
</script>

<header class="site-header">
  <nav class="site-nav" aria-label="Primary">
    <a class="brand" href="/">
      <strong>${dsTitle}</strong>
    </a>
    <div class="nav-links">
      <a href="/">Home</a>
      <a href="/components">Components</a>
    </div>
  </nav>
</header>

<main id="main">
  <!-- Hero -->
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-inner">
      <p class="eyebrow">Design system, ready to ship</p>
      <h1 id="hero-title">Build interfaces on web standards.</h1>
      <p class="lede">
        ${dsTitle} ships native web components — themed via design tokens, accessible out of the
        box, framework-agnostic by construction. Drop them anywhere HTML runs.
      </p>
      <div class="hero-ctas">
        <!-- v0.9.1 cross-kit audit: hero CTAs are styled <a>
             elements (NOT <hx-button>). The .button-* classes match
             hx-button's visual language via shared design tokens,
             but the underlying element is a real <a> — works in the
             SvelteKit SSR window, with JS disabled, and before HELiX
             upgrades. Use <hx-button> for interactive controls; use
             styled <a> for navigation. -->
        <a href="/components" class="button button--primary button--lg">
          Browse components
        </a>
        <a
          href="${githubLink}"
          target="_blank"
          rel="noopener"
          class="button button--outline button--lg"
        >
          View on GitHub
        </a>
      </div>
    </div>
  </section>

  <!-- Features grid -->
  <section class="features" aria-labelledby="features-title">
    <h2 id="features-title">Why teams choose ${dsTitle}</h2>
    <div class="features-grid">
      <hx-card>
        <div slot="heading" class="card-header">
          <hx-icon library="fa-free" name="shield-halved" aria-hidden="true"></hx-icon>
          <h3>Accessible by default</h3>
        </div>
        <p>
          Every component ships with keyboard navigation, ARIA semantics, and focus management.
          Pass WCAG audits without retrofitting.
        </p>
      </hx-card>

      <hx-card>
        <div slot="heading" class="card-header">
          <hx-icon library="fa-free" name="palette" aria-hidden="true"></hx-icon>
          <h3>Theme everything</h3>
        </div>
        <p>
          CSS custom properties drive color, spacing, type, and motion. Re-brand the entire surface
          by swapping a single token layer.
        </p>
      </hx-card>

      <hx-card>
        <div slot="heading" class="card-header">
          <hx-icon library="fa-free" name="rocket" aria-hidden="true"></hx-icon>
          <h3>Framework agnostic</h3>
        </div>
        <p>
          Web components run anywhere HTML runs — SvelteKit, Astro, Next.js, vanilla. One library,
          every frontend stack.
        </p>
      </hx-card>
    </div>
  </section>

  <!-- Live components showcase -->
  <section class="showcase" aria-labelledby="showcase-title">
    <h2 id="showcase-title">Interactive preview</h2>
    <p class="showcase-lede">
      Every element below is live — interact with them right here. These are the same components
      you'd import into any page.
    </p>

    <div class="showcase-grid">
      <div class="showcase-item">
        <h3>Buttons</h3>
        <div class="showcase-row">
          <hx-button variant="primary">Primary</hx-button>
          <hx-button variant="secondary">Secondary</hx-button>
          <hx-button variant="ghost">Ghost</hx-button>
        </div>
      </div>

      <div class="showcase-item">
        <h3>Text input</h3>
        <hx-text-input label="Email address" type="email" placeholder="you@example.com"
        ></hx-text-input>
      </div>

      <div class="showcase-item">
        <h3>Checkbox</h3>
        <hx-checkbox>Subscribe to release notes</hx-checkbox>
      </div>

      <div class="showcase-item showcase-item--wide">
        <h3>Tabs</h3>
        <hx-tabs>
          <hx-tab slot="nav" panel="overview">Overview</hx-tab>
          <hx-tab slot="nav" panel="usage">Usage</hx-tab>
          <hx-tab slot="nav" panel="api">API</hx-tab>
          <hx-tab-panel name="overview">
            <p>
              Tabs organize related content into navigable sections without forcing a page
              transition.
            </p>
          </hx-tab-panel>
          <hx-tab-panel name="usage">
            <p>Drop &lt;hx-tabs&gt; anywhere — Svelte page, MDX article, or vanilla HTML.</p>
          </hx-tab-panel>
          <hx-tab-panel name="api">
            <p>Slots: <code>nav</code>, named panels. Events: <code>hx-tab-change</code>.</p>
          </hx-tab-panel>
        </hx-tabs>
      </div>
    </div>
  </section>
</main>

<footer class="site-footer">
  <p>
    Scaffolded with
    <a href="https://www.npmjs.com/package/create-helix" target="_blank" rel="noopener"
      >create-helix</a
    >. Built on
    <a href="https://svelte.dev" target="_blank" rel="noopener">SvelteKit</a> +
    <a href="${githubLink}" target="_blank" rel="noopener">HELiX</a>.
  </p>
</footer>

<style>
  .site-header {
    border-bottom: 1px solid var(--hx-color-border-subtle, #e6eaef);
    padding: 1rem 2rem;
  }

  .site-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 1200px;
    margin: 0 auto;
  }

  .brand {
    color: inherit;
    text-decoration: none;
    font-size: 1.125rem;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .nav-links a {
    color: inherit;
    text-decoration: none;
    font-weight: 500;
  }

  .nav-links a:hover {
    text-decoration: underline;
  }

  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
  }

  /* Hero */
  .hero {
    padding: 5rem 0 4rem;
    text-align: center;
  }

  .hero-inner {
    max-width: 720px;
    margin: 0 auto;
  }

  .eyebrow {
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    color: var(--hx-color-text-secondary, #4a5566);
    margin: 0 0 1rem;
  }

  h1 {
    font-size: clamp(2rem, 5vw, 3.5rem);
    line-height: 1.1;
    margin: 0 0 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .lede {
    font-size: 1.25rem;
    line-height: 1.6;
    color: var(--hx-color-text-secondary, #4a5566);
    margin: 0 0 2.5rem;
  }

  .hero-ctas {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  /* v0.9.1: button-styled <a> classes for hero CTAs. Mirrors
     hx-button's visual language via shared design tokens but the
     underlying element is a real <a> — works before HELiX upgrades
     and survives the SvelteKit SSR window without JS. */
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    font: inherit;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }
  .button:focus-visible {
    outline: 2px solid var(--hx-color-focus-ring, #2563eb);
    outline-offset: 2px;
  }
  .button--lg {
    padding: 0.85rem 1.6rem;
    font-size: 1.05rem;
  }
  .button--primary {
    background: var(--hx-color-action-primary, #2563eb);
    color: var(--hx-color-text-on-primary, #ffffff);
  }
  .button--primary:hover {
    background: var(--hx-color-action-primary-hover, #1d4ed8);
  }
  .button--outline {
    background: transparent;
    color: var(--hx-color-text, #0f172a);
    border-color: var(--hx-page-border, #cbd5e1);
  }
  .button--outline:hover {
    background: var(--hx-color-surface, transparent);
  }

  /* Features */
  .features {
    padding: 4rem 0;
  }

  .features h2 {
    font-size: 2rem;
    text-align: center;
    margin: 0 0 3rem;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .card-header h3 {
    margin: 0;
    font-size: 1.25rem;
  }

  /* Showcase */
  .showcase {
    padding: 4rem 0 6rem;
  }

  .showcase h2 {
    font-size: 2rem;
    margin: 0 0 0.5rem;
  }

  .showcase-lede {
    color: var(--hx-color-text-secondary, #4a5566);
    margin: 0 0 2.5rem;
  }

  .showcase-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2rem;
  }

  .showcase-item h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--hx-color-text-secondary, #4a5566);
  }

  .showcase-item--wide {
    grid-column: 1 / -1;
  }

  .showcase-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  /* Footer */
  .site-footer {
    border-top: 1px solid var(--hx-color-border-subtle, #e6eaef);
    padding: 2rem;
    text-align: center;
    color: var(--hx-color-text-secondary, #4a5566);
    font-size: 0.875rem;
  }

  .site-footer a {
    color: inherit;
  }
</style>
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'src', 'routes', '+page.svelte'), content);
}

/**
 * apps/web/src/routes/components/+page.svelte — the second route.
 *
 * Demonstrates SvelteKit view transitions across pages (the morph between
 * '/' and '/components' is smooth, NOT a full reload) and shows real
 * component usage with hand-written examples. Includes a back-to-home
 * link so the nav is symmetric.
 */
export async function writeAppsWebComponentsPage(args: {
  rootDir: string;
  dsTitle: string;
}): Promise<void> {
  const { rootDir, dsTitle } = args;

  const content = `<script lang="ts">
  /**
   * Components catalog — second route demonstrating view transitions.
   *
   * Navigating from '/' to here morphs the layout instead of full-reloading.
   * The HELiX runtime loader (+layout.svelte onMount) only runs once on
   * cold load; the customElements registry survives the transition so
   * every <hx-*> tag on this page upgrades immediately.
   */
</script>

<svelte:head>
  <title>Components — ${dsTitle}</title>
  <meta name="description" content="Live examples of every shipped ${dsTitle} component." />
</svelte:head>

<header class="site-header">
  <nav class="site-nav" aria-label="Primary">
    <a class="brand" href="/">
      <strong>${dsTitle}</strong>
    </a>
    <div class="nav-links">
      <a href="/">Home</a>
      <a href="/components" aria-current="page">Components</a>
    </div>
  </nav>
</header>

<main id="main">
  <section class="page-intro">
    <h1>Components</h1>
    <p>
      A live catalog of the most common ${dsTitle} surfaces. Every component below is fully
      interactive — try them out, then drop them into your own pages.
    </p>
  </section>

  <section class="component-block" aria-labelledby="buttons-title">
    <h2 id="buttons-title">Buttons</h2>
    <p>
      Primary actions, supporting actions, and quiet utilities. Pair with <code>&lt;hx-icon&gt;</code> for
      icon buttons.
    </p>
    <div class="example-row">
      <hx-button variant="primary">Primary</hx-button>
      <hx-button variant="secondary">Secondary</hx-button>
      <hx-button variant="ghost">Ghost</hx-button>
      <hx-button variant="primary" disabled>Disabled</hx-button>
    </div>
  </section>

  <section class="component-block" aria-labelledby="inputs-title">
    <h2 id="inputs-title">Form inputs</h2>
    <p>
      Validated text input, multi-line textarea, and checkbox. All emit native <code>change</code>
      events plus richer <code>hx-*</code> events.
    </p>
    <div class="example-stack">
      <hx-text-input label="Full name" placeholder="Ada Lovelace"></hx-text-input>
      <hx-textarea label="Project description" rows="3"></hx-textarea>
      <hx-checkbox>Email me product updates</hx-checkbox>
    </div>
  </section>

  <section class="component-block" aria-labelledby="card-title">
    <h2 id="card-title">Cards</h2>
    <p>Container surface for grouping related content.</p>
    <div class="example-grid">
      <hx-card>
        <h3 slot="heading">Standard card</h3>
        <p>Cards group related content into a visually distinct container.</p>
      </hx-card>
      <hx-card>
        <h3 slot="heading">With actions</h3>
        <p>Add buttons or links in the footer slot for card-level actions.</p>
        <div slot="footer">
          <hx-button variant="primary" hx-size="sm">Action</hx-button>
        </div>
      </hx-card>
    </div>
  </section>

  <section class="component-block" aria-labelledby="badge-title">
    <h2 id="badge-title">Badges</h2>
    <p>Compact status indicators for inline metadata.</p>
    <div class="example-row">
      <hx-badge variant="primary">New</hx-badge>
      <hx-badge variant="success">Active</hx-badge>
      <hx-badge variant="warning">Pending</hx-badge>
      <hx-badge variant="danger">Blocked</hx-badge>
    </div>
  </section>

  <section class="component-block" aria-labelledby="alert-title">
    <h2 id="alert-title">Alert</h2>
    <p>Inline notification for important messages.</p>
    <hx-alert variant="info">
      <strong>Heads up.</strong> Alerts call attention to important state changes.
    </hx-alert>
  </section>

  <p class="back-link">
    <a href="/">&larr; Back to home</a>
  </p>
</main>

<style>
  .site-header {
    border-bottom: 1px solid var(--hx-color-border-subtle, #e6eaef);
    padding: 1rem 2rem;
  }

  .site-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 1200px;
    margin: 0 auto;
  }

  .brand {
    color: inherit;
    text-decoration: none;
    font-size: 1.125rem;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .nav-links a {
    color: inherit;
    text-decoration: none;
    font-weight: 500;
  }

  .nav-links a[aria-current='page'] {
    text-decoration: underline;
  }

  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem;
  }

  .page-intro {
    margin-bottom: 3rem;
  }

  .page-intro h1 {
    font-size: 2.5rem;
    margin: 0 0 0.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .page-intro p {
    font-size: 1.125rem;
    color: var(--hx-color-text-secondary, #4a5566);
    margin: 0;
  }

  .component-block {
    margin-bottom: 3rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--hx-color-border-subtle, #e6eaef);
  }

  .component-block:last-of-type {
    border-bottom: none;
  }

  .component-block h2 {
    font-size: 1.5rem;
    margin: 0 0 0.5rem;
  }

  .component-block p {
    color: var(--hx-color-text-secondary, #4a5566);
    margin: 0 0 1.5rem;
  }

  .example-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .example-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 480px;
  }

  .example-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
  }

  .back-link {
    margin-top: 3rem;
  }

  .back-link a {
    color: inherit;
    text-decoration: none;
    font-weight: 500;
  }

  .back-link a:hover {
    text-decoration: underline;
  }
</style>
`;
  await safeWriteFile(
    path.join(rootDir, APPS_WEB_REL, 'src', 'routes', 'components', '+page.svelte'),
    content,
  );
}

/**
 * apps/web/src/lib/components/ThemeToggle.svelte — light/dark switcher.
 *
 * Sits in $lib/ following the SvelteKit convention (components shared
 * across routes live there). Flips <html data-theme> between 'light'
 * and 'dark' and persists the choice to localStorage. The app.html boot
 * script reads the same key on cold load so the toggle round-trips
 * across sessions without a dark-mode flash.
 *
 * Renders an <hx-button variant="ghost"> — re-using the design-system
 * primitive instead of a hand-rolled button matches the v0.8.0 Astro
 * pattern + tells consumers how to wire callbacks into <hx-*> tags
 * from .svelte.
 */
export async function writeAppsWebThemeToggle(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const content = `<script lang="ts">
  /**
   * Light/dark theme toggle.
   *
   * Reads + writes <html data-theme>. Persists the user choice to
   * localStorage so the boot script in app.html can restore it before
   * paint on the next visit (no flash-of-incorrect-theme).
   */
  let theme = $state<'light' | 'dark'>('light');

  $effect(() => {
    // Mirror the current DOM attribute into local state on mount, and
    // keep it in sync whenever the user clicks.
    if (typeof document === 'undefined') return;
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark') theme = 'dark';
  });

  function toggle(): void {
    const next = theme === 'dark' ? 'light' : 'dark';
    theme = next;
    document.documentElement.setAttribute('data-theme', next);
    try {
      // v0.9.1 cross-kit audit: storage key is 'helix-theme' (matches
      // react-next + react-vite + astro).
      localStorage.setItem('helix-theme', next);
    } catch {
      // localStorage can throw in sandboxed contexts. Swallow — the
      // <html> attribute still flips for the current session.
    }
  }
</script>

<button type="button" class="theme-toggle" aria-label="Toggle color theme" onclick={toggle}>
  {#if theme === 'light'}
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
  {:else}
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
  {/if}
</button>

<style>
  .theme-toggle {
    background: transparent;
    border: 1px solid var(--hx-color-border-subtle, #e6eaef);
    color: inherit;
    padding: 0.5rem;
    border-radius: 0.375rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background-color 150ms ease;
    line-height: 0;
  }

  .theme-toggle:hover {
    background: var(--hx-color-surface-subtle, #f7f9fb);
  }

  .theme-toggle:focus-visible {
    outline: 2px solid var(--hx-color-focus, #2563eb);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .theme-toggle {
      transition: none;
    }
  }
</style>
`;
  await safeWriteFile(
    path.join(rootDir, APPS_WEB_REL, 'src', 'lib', 'components', 'ThemeToggle.svelte'),
    content,
  );
}

/**
 * apps/web/static/favicon.svg — brand-neutral mark.
 *
 * SvelteKit's static-asset dir is `static/` (not `public/` like Astro
 * or Vite-React). Served from the site root (e.g. /favicon.svg) at
 * both dev + build time.
 *
 * Simple geometric mark — readable at 16x16, scales without
 * rasterization, no wordmark, no vertical association.
 */
export async function writeAppsWebFavicon(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0d1825" />
  <path
    d="M9 9h2.5v6h9V9H23v14h-2.5v-6h-9v6H9z"
    fill="#ffffff"
  />
</svg>
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'static', 'favicon.svg'), content);
}

/**
 * apps/web/.gitignore — SvelteKit-specific ignores.
 *
 * Workspace root .gitignore covers node_modules, .DS_Store, etc.
 * This per-app ignore adds the SvelteKit-specific build artifacts:
 *   - .svelte-kit/ — Kit's generated tsconfig + types + manifest
 *   - build/ — adapter-static output dir
 *   - .env.* — runtime env files
 */
export async function writeAppsWebGitignore(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const content = `node_modules
.DS_Store

# SvelteKit
.svelte-kit
build

# HELiX — postinstall-generated @helixui/icons sprite SVGs
${helixIconsGitignoreEntry('static')}

# Env
.env
.env.*
!.env.example

# Editor
.vscode
.idea
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, '.gitignore'), content);
}

/**
 * apps/web/.npmrc — pnpm hoist hint for Svelte.
 *
 * Svelte's vite plugin needs to find Svelte's compiler at the closest
 * node_modules level; pnpm's strict hoisting can hide it. Setting
 * shamefully-hoist for svelte-* keeps the plugin resolution happy
 * without exposing every transitive workspace dep.
 *
 * Limited to svelte-related packages; broader hoist isn't needed.
 */
export async function writeAppsWebNpmrc(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const content = `public-hoist-pattern[]=*svelte*
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, '.npmrc'), content);
}
