/**
 * Shared emit helpers for the Astro monorepo scaffolder — the apps/web
 * overlay applied AFTER scaffoldMonorepoRoot lays down the workspace
 * skeleton.
 *
 * v0.8.0 Phase C — populates the placeholder stub. Astro consumes the
 * design-system as NATIVE web components: <hx-button> directly in
 * .astro files, zero React-wrapper indirection. The design-system
 * package's React wrappers (from v0.7.0 Phase F) stay available for
 * Next.js / Vite consumers; Astro just doesn't use them.
 *
 * Per PE P1 (fork-don't-branch): the flat Astro scaffolder body in
 * src/scaffold.ts is being deprecated (per user direction 2026-05-11)
 * and the monorepo path becomes the supported shipping target. Phase C
 * does NOT reuse the flat body via the cloneOptionsForAppsWeb redirect
 * pattern that react-next/react-vite use — instead we emit fresh files
 * here, sized for the SERIOUS landing-page contract.
 *
 * The helpers below mirror the shape of react-next/_shared.ts:
 *
 *   - writeAppsWebPackageJson — @{scope}/web with workspace:* deps,
 *                               astro scripts, and a direct @helixui/library
 *                               pin so the runtime loader's `import
 *                               '@helixui/library'` resolves outside the
 *                               design-system package surface.
 *   - writeAppsWebAstroConfig — vite.optimizeDeps.exclude on workspace
 *                               deps + server.fs.allow for cross-package
 *                               source resolution.
 *   - writeAppsWebTsConfig    — tsconfig.json extends ../../tsconfig.base.json
 *                               + Astro's compilerOptions (jsx: preserve,
 *                               .astro in include).
 *   - writeAppsWebEnvDts      — astro/client triple-slash reference for
 *                               Astro.props + import.meta.env types.
 *   - writeAppsWebLayout      — the critical Layout.astro with the
 *                               HELiX runtime loader (<script>import
 *                               '@helixui/library'</script>), view
 *                               transitions, and the tokens.css import.
 *   - writeAppsWebIndexPage   — the landing page (hero + features + live
 *                               component showcase, hand-written real
 *                               cross-domain-neutral copy).
 *   - writeAppsWebComponentsPage — second route demonstrating view
 *                               transitions + showcasing real component
 *                               usage.
 *   - writeAppsWebThemeToggle — theme switcher button persisting to
 *                               localStorage; flips <html data-theme>.
 *   - writeAppsWebFavicon     — the default SVG favicon (mark-only, no
 *                               wordmark — matches the brand-neutral
 *                               scaffold tone).
 */
import path from 'node:path';
import { safeWriteFile, safeWriteJson } from '../../scaffold.js';
import { APPS_WEB_REL } from '../_shared/monorepo-redirect.js';

// Re-export so monorepo.ts mirrors the Phase D Next / Phase E Vite
// import shapes.
export { APPS_WEB_REL };
export { cloneOptionsForAppsWeb } from '../_shared/monorepo-redirect.js';

/**
 * Pinned versions for the apps/web manifest. Same set the design-system
 * package declares (Phase F: @helixui/library ^1.0.0), so a fresh pnpm
 * install yields a single, hoisted copy of the runtime library at the
 * workspace root.
 *
 * Astro 5.7.0 is the version templates.ts pins for the standalone flat
 * scaffold; reusing it here keeps Storybook-MDX-aware Astro features
 * (ClientRouter, the dev-overlay, and the v5 image service) on a
 * known-good baseline.
 */
const ASTRO_VERSION = '^5.7.0';
const ASTRO_CHECK_VERSION = '^0.9.0';
const HELIX_LIBRARY_VERSION = '^1.0.0';
const HELIX_TOKENS_VERSION = '^0.3.0';
const TYPESCRIPT_VERSION = '^5.7.0';

/**
 * apps/web/package.json — the Astro workspace app's manifest.
 *
 * Distinguishing traits vs a flat Astro package.json:
 *   1. Name is `@{scope}/web` (scoped to the workspace).
 *   2. Dependencies include `workspace:*` refs to the sibling packages
 *      (design-system when opted in, types + utils always).
 *   3. @helixui/library is a DIRECT dep, not just transitive via the
 *      design-system. The Astro runtime loader (Layout.astro's
 *      <script>import '@helixui/library'</script>) imports the package
 *      directly to trigger customElements.define(); without an explicit
 *      dep, pnpm strict-mode resolution would refuse the import even
 *      when the design-system pulls it as a peer.
 *   4. When includeDesignSystem === false, the @{scope}/design-system
 *      dep is omitted and apps/web reads tokens from @helixui/tokens
 *      directly (no DS-package CSS layer to inherit).
 *
 * Scripts use Astro CLI directly — Turborepo invokes them from the
 * monorepo root via `turbo run dev --filter=@{scope}/web` and there's
 * no second package.json above this one in pnpm's resolution chain.
 *
 * `astro check` is the official type-checker for .astro files; we wire
 * it into the build script so `pnpm build` surfaces type errors before
 * the static-site generator runs. The duplicate `type-check` script
 * lets Turbo's `type-check` pipeline (defined in turbo.json) run
 * independently of `build`.
 */
export async function writeAppsWebPackageJson(args: {
  rootDir: string;
  scope: string;
  includeDesignSystem: boolean;
}): Promise<void> {
  const { rootDir, scope, includeDesignSystem } = args;

  const dependencies: Record<string, string> = {
    astro: ASTRO_VERSION,
    // Direct @helixui/library — the runtime loader bundles this into
    // the page so customElements.define() runs on hydration. Pinned to
    // the same range the design-system declares to avoid double-install
    // (pnpm hoists a single matching copy under the workspace root).
    '@helixui/library': HELIX_LIBRARY_VERSION,
    [`@${scope}/types`]: 'workspace:*',
    [`@${scope}/utils`]: 'workspace:*',
  };

  if (includeDesignSystem) {
    dependencies[`@${scope}/design-system`] = 'workspace:*';
  } else {
    // No DS package — fall back to upstream @helixui/tokens directly so
    // the Layout.astro tokens import still resolves.
    dependencies['@helixui/tokens'] = HELIX_TOKENS_VERSION;
  }

  const pkg = {
    name: `@${scope}/web`,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'astro dev',
      build: 'astro check && astro build',
      preview: 'astro preview',
      astro: 'astro',
      'type-check': 'astro check',
    },
    dependencies,
    devDependencies: {
      '@astrojs/check': ASTRO_CHECK_VERSION,
      typescript: TYPESCRIPT_VERSION,
    },
  };

  await safeWriteJson(path.join(rootDir, APPS_WEB_REL, 'package.json'), pkg, { spaces: 2 });
}

/**
 * apps/web/astro.config.mjs — monorepo-aware Astro config.
 *
 * Two monorepo-specific concerns:
 *   1. vite.optimizeDeps.exclude — the workspace packages ship TypeScript
 *      sources (not pre-built dist/). Vite's dep-pre-bundling step would
 *      otherwise produce stale chunks when design-system source updates
 *      mid-`astro dev` session; excluding lets HMR see source changes
 *      live.
 *   2. server.fs.allow — Astro's dev server enforces a strict FS-access
 *      boundary by default (apps/web/ only). Workspace deps live up the
 *      tree under packages/*, so we whitelist '..' (apps/) and '../..'
 *      (the monorepo root). Without this Vite would 403 on imports
 *      resolving through symlinked workspace packages.
 *
 * output: 'static' is the v5 default (full SSG) and the most
 * Astro-idiomatic starting point — consumers can swap in an adapter
 * (Netlify, Vercel, Node) later. Declaring it explicitly is documentation,
 * not behavior change.
 */
export async function writeAppsWebAstroConfig(args: {
  rootDir: string;
  scope: string;
  includeDesignSystem: boolean;
}): Promise<void> {
  const { rootDir, scope, includeDesignSystem } = args;

  // Build the exclude list. Always includes types + utils; the DS
  // package is only listed when actually present in the workspace —
  // referencing a non-existent workspace package wouldn't crash
  // optimizeDeps (Vite no-ops on unresolved entries) but it would
  // be misleading.
  const excludeList: string[] = [];
  if (includeDesignSystem) {
    excludeList.push(`@${scope}/design-system`);
  }
  excludeList.push(`@${scope}/types`, `@${scope}/utils`);
  const excludeLiteral = excludeList.map((pkg) => `        '${pkg}',`).join('\n');

  const content = `import { defineConfig } from 'astro/config';

/**
 * Astro configuration for the @${scope}/web monorepo app.
 *
 * HELiX custom elements are native browser APIs — no Astro integration
 * required. They work perfectly with Astro's zero-JS-by-default model:
 * the runtime loader in Layout.astro is the only JS this site needs to
 * upgrade <hx-*> tags on the page.
 */
export default defineConfig({
  // Astro defaults: static site generation. Consumer can swap in an
  // adapter (Netlify, Vercel, Node) later as needs grow. Default is the
  // most Astro-idiomatic starting point.
  output: 'static',

  vite: {
    // Monorepo deps live in packages/* (TypeScript sources, not
    // pre-built). optimizeDeps.exclude prevents Vite from pre-bundling
    // them, which would otherwise produce stale chunks when source
    // updates mid-dev-session.
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
  },
});
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'astro.config.mjs'), content);
}

/**
 * apps/web/tsconfig.json — workspace-aware Astro tsconfig.
 *
 * Extends ../../tsconfig.base.json (the shared compilerOptions block
 * written by scaffoldMonorepoRoot — the root tsconfig.json itself is a
 * project-references file and cannot host compilerOptions). Adds
 * Astro-specific options on top:
 *   - jsx: preserve — Astro's compiler does its own JSX transform.
 *   - paths: { '@/*': ['./src/*'] } — matches the path alias other
 *     framework scaffolds emit (react-next, react-vite).
 *   - include: '.astro' + .d.ts so Astro's editor tooling picks up
 *     ambient types and component frontmatter.
 *
 * Composite/declaration are off — apps/web is the END app, not a
 * library other workspace packages consume.
 */
export async function writeAppsWebTsConfig(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const tsconfig = {
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      jsx: 'preserve',
      paths: {
        '@/*': ['./src/*'],
      },
    },
    include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.astro', 'src/**/*.d.ts'],
    exclude: ['node_modules', 'dist', '.astro'],
  };
  await safeWriteJson(path.join(rootDir, APPS_WEB_REL, 'tsconfig.json'), tsconfig, { spaces: 2 });
}

/**
 * apps/web/src/env.d.ts — Astro client types reference.
 *
 * Astro's CLI generates `.astro/types.d.ts` at build/dev time; the
 * `astro/client` triple-slash reference here pulls in Astro.props,
 * import.meta.env, and the IntrinsicElements augmentation that lets
 * editors lint .astro files before the generated types exist.
 */
export async function writeAppsWebEnvDts(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const content = `/// <reference types="astro/client" />
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'src', 'env.d.ts'), content);
}

/**
 * apps/web/src/layouts/Layout.astro — THE critical file.
 *
 * Web components need `customElements.define()` to run in the browser.
 * Astro processes `<script>` tags inside .astro files and bundles them
 * via Vite — so the bare-import `import '@helixui/library'` resolves at
 * runtime, the library calls customElements.define() once when loaded,
 * and every <hx-*> element on the page upgrades.
 *
 * The script runs ONCE per page navigation. With `<ClientRouter />`
 * enabled (Astro 5's view-transitions component, renamed from
 * `<ViewTransitions />` in v4), client-side route changes preserve the
 * already-registered custom elements and the script is NOT re-evaluated.
 * Without ClientRouter, full page navigations re-evaluate the script
 * which is a no-op (customElements.define throws on re-define, but
 * the library guards internally).
 *
 * Tokens are loaded via the frontmatter `import` (resolved at build by
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
    ? `'@${scope}/design-system/tokens'`
    : `'@helixui/tokens/tokens.css'`;
  const tokensComment = includeDesignSystem
    ? `// Brand tokens from the workspace design-system package. The
// exports field maps './tokens' → src/tokens/tokens.css, so this
// import side-effect-loads the CSS into the page bundle.`
    : `// Upstream HELiX tokens (no workspace design-system layer in this
// scaffold). Opt in to a workspace DS package later by adding
// @${scope} sibling packages — the runtime loader below stays
// the same.`;

  const content = `---
/**
 * Root layout for the @${scope}/web Astro app.
 *
 * Frontmatter runs at BUILD time only — don't try to import
 * @helixui/library here (it would try to register custom elements in
 * a Node context with no \`window\`). The runtime loader lives in the
 * \`script\` block below the slot; Astro / Vite handles the bundling
 * so the import resolves in the browser.
 */
import { ClientRouter } from 'astro:transitions';

${tokensComment}
import ${tokensImport};

interface Props {
  title?: string;
  description?: string;
}

const {
  title = '${dsTitle} — built with create-helix',
  description = 'A HELiX-powered Astro site, scaffolded with create-helix.',
} = Astro.props;
---

<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="generator" content={Astro.generator} />
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{title}</title>
    {/* Astro view transitions — fluid client-side route changes.
        Renamed from <ViewTransitions /> in Astro 5; the v4 component
        re-exports for back-compat but ClientRouter is the canonical
        name going forward. */}
    <ClientRouter />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to main content</a>
    <slot />

    {/* HELiX runtime loader.
        Astro processes script tags inside .astro files and bundles
        them via Vite. The bare-import resolves at runtime; the library
        calls customElements.define() once when loaded; all hx-* tags
        on the page upgrade.

        Runs once per full page load. With ClientRouter enabled
        (view-transitions), client-side route changes do NOT re-evaluate
        this script — the already-registered custom elements survive the
        morph. */}
    <script>
      import '@helixui/library';
    </script>

    {/* Theme persistence — runs inline (is:inline) so it fires BEFORE
        the body paints, avoiding the dark-mode flash on cold load.
        The ThemeToggle button below later flips this same attribute. */}
    <script is:inline>
      const stored = localStorage.getItem('theme');
      if (stored === 'dark' || stored === 'light') {
        document.documentElement.setAttribute('data-theme', stored);
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    </script>
  </body>
</html>

<style is:global>
  /*
   * Tokens are loaded via the frontmatter import above. This block
   * holds the reset + layout primitives that every page inherits.
   *
   * Reduced-motion: view transitions and any future CSS animations
   * respect prefers-reduced-motion via the @media block at the bottom.
   */
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html {
    /* Smooth scroll between in-page anchors; disabled under
       prefers-reduced-motion. */
    scroll-behavior: smooth;
  }

  body {
    margin: 0;
    font-family:
      system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    line-height: 1.5;
    background: var(--hx-color-surface-default, #ffffff);
    color: var(--hx-color-text-primary, #0d1825);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  html[data-theme='dark'] body {
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
    html {
      scroll-behavior: auto;
    }
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
`;
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'src', 'layouts', 'Layout.astro'), content);
}

/**
 * apps/web/src/pages/index.astro — the SERIOUS landing page.
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
 *   4. Components showcase — live interactive examples (input,
 *      checkbox, tabs).
 *   5. Footer with the create-helix scaffold credit.
 *
 * All <hx-*> tags are NATIVE web components — no React wrappers,
 * no client directives, no Astro hydration islands. They upgrade
 * via the Layout.astro runtime loader on first paint.
 */
export async function writeAppsWebIndexPage(args: {
  rootDir: string;
  scope: string;
  dsTitle: string;
}): Promise<void> {
  const { rootDir, scope, dsTitle } = args;

  const content = `---
/**
 * Landing page — the marketing surface for @${scope}/web.
 *
 * Every <hx-*> tag below is a native browser custom element. Astro
 * emits the HTML statically; the Layout.astro runtime loader
 * upgrades the elements on first paint. Zero React. Zero hydration
 * islands. Zero \`client:\` directives.
 *
 * Replace the copy + adjust the component selection to match your
 * product. The scaffold ships with intentionally generic,
 * cross-domain-neutral text — usable for any vertical without
 * embarrassing leftover Lorem.
 */
import Layout from '../layouts/Layout.astro';
import ThemeToggle from '../components/ThemeToggle.astro';
---

<Layout
  title="${dsTitle} — built on web standards"
  description="Production-ready design system components, themed via design tokens, accessible by default."
>
  <header class="site-header">
    <nav class="site-nav" aria-label="Primary">
      <a class="brand" href="/">
        <strong>${dsTitle}</strong>
      </a>
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/components">Components</a>
        <ThemeToggle />
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
          ${dsTitle} ships native web components — themed via design tokens,
          accessible out of the box, framework-agnostic by construction.
          Drop them anywhere HTML runs.
        </p>
        <div class="hero-ctas">
          <hx-button variant="primary" size="lg">
            <a href="/components" style="color: inherit; text-decoration: none;"
              >Browse components</a
            >
          </hx-button>
          <hx-button variant="ghost" size="lg">
            <a
              href="https://github.com/booked-solid-tech/helix"
              target="_blank"
              rel="noopener"
              style="color: inherit; text-decoration: none;">View on GitHub</a
            >
          </hx-button>
        </div>
      </div>
    </section>

    <!-- Features grid -->
    <section class="features" aria-labelledby="features-title">
      <h2 id="features-title">Why teams choose ${dsTitle}</h2>
      <div class="features-grid">
        <hx-card>
          <div slot="header" class="card-header">
            <hx-icon library="helix" name="shield-check" aria-hidden="true"></hx-icon>
            <h3>Accessible by default</h3>
          </div>
          <p>
            Every component ships with keyboard navigation, ARIA semantics,
            and focus management. Pass WCAG audits without retrofitting.
          </p>
        </hx-card>

        <hx-card>
          <div slot="header" class="card-header">
            <hx-icon library="helix" name="palette" aria-hidden="true"></hx-icon>
            <h3>Theme everything</h3>
          </div>
          <p>
            CSS custom properties drive color, spacing, type, and motion.
            Re-brand the entire surface by swapping a single token layer.
          </p>
        </hx-card>

        <hx-card>
          <div slot="header" class="card-header">
            <hx-icon library="helix" name="rocket" aria-hidden="true"></hx-icon>
            <h3>Framework agnostic</h3>
          </div>
          <p>
            Web components run anywhere HTML runs — Astro, Next.js, Vue,
            vanilla. One library, every frontend stack.
          </p>
        </hx-card>
      </div>
    </section>

    <!-- Live components showcase -->
    <section class="showcase" aria-labelledby="showcase-title">
      <h2 id="showcase-title">Interactive preview</h2>
      <p class="showcase-lede">
        Every element below is live — interact with them right here.
        These are the same components you'd import into any page.
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
          <hx-text-input label="Email address" type="email" placeholder="you@example.com">
          </hx-text-input>
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
                Tabs organize related content into navigable sections without
                forcing a page transition.
              </p>
            </hx-tab-panel>
            <hx-tab-panel name="usage">
              <p>Drop &lt;hx-tabs&gt; anywhere — Astro page, MDX article, or vanilla HTML.</p>
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
      <a href="https://astro.build" target="_blank" rel="noopener">Astro</a> +
      <a href="https://github.com/booked-solid-tech/helix" target="_blank" rel="noopener"
        >HELiX</a
      >.
    </p>
  </footer>
</Layout>

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
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'src', 'pages', 'index.astro'), content);
}

/**
 * apps/web/src/pages/components.astro — the second route.
 *
 * Demonstrates Astro view transitions across pages (the morph between
 * '/' and '/components' is smooth, NOT a full reload) and shows real
 * component usage with hand-written examples. Includes a back-to-home
 * link so the nav is symmetric.
 */
export async function writeAppsWebComponentsPage(args: {
  rootDir: string;
  dsTitle: string;
}): Promise<void> {
  const { rootDir, dsTitle } = args;

  const content = `---
/**
 * Components catalog — second route demonstrating view transitions.
 *
 * Navigating from '/' to here morphs the layout instead of full-reloading.
 * The HELiX runtime loader (Layout.astro <script>) only runs once on
 * cold load; the customElements registry survives the transition so
 * every <hx-*> tag on this page upgrades immediately.
 */
import Layout from '../layouts/Layout.astro';
import ThemeToggle from '../components/ThemeToggle.astro';
---

<Layout
  title="Components — ${dsTitle}"
  description="Live examples of every shipped ${dsTitle} component."
>
  <header class="site-header">
    <nav class="site-nav" aria-label="Primary">
      <a class="brand" href="/">
        <strong>${dsTitle}</strong>
      </a>
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/components" aria-current="page">Components</a>
        <ThemeToggle />
      </div>
    </nav>
  </header>

  <main id="main">
    <section class="page-intro">
      <h1>Components</h1>
      <p>
        A live catalog of the most common ${dsTitle} surfaces. Every
        component below is fully interactive — try them out, then drop
        them into your own pages.
      </p>
    </section>

    <section class="component-block" aria-labelledby="buttons-title">
      <h2 id="buttons-title">Buttons</h2>
      <p>
        Primary actions, supporting actions, and quiet utilities. Pair
        with <code>&lt;hx-icon&gt;</code> for icon buttons.
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
        Validated text input, multi-line textarea, and checkbox. All
        emit native <code>change</code> events plus richer
        <code>hx-*</code> events.
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
          <h3 slot="header">Standard card</h3>
          <p>Cards group related content into a visually distinct container.</p>
        </hx-card>
        <hx-card>
          <h3 slot="header">With actions</h3>
          <p>Add buttons or links in the footer slot for card-level actions.</p>
          <div slot="footer">
            <hx-button variant="primary" size="sm">Action</hx-button>
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
</Layout>

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
    path.join(rootDir, APPS_WEB_REL, 'src', 'pages', 'components.astro'),
    content,
  );
}

/**
 * apps/web/src/components/ThemeToggle.astro — light/dark switcher.
 *
 * Wraps an <hx-button variant="ghost"> with an inline script that
 * flips <html data-theme> between 'light' and 'dark' and persists
 * the choice to localStorage. Layout.astro's `is:inline` boot script
 * reads the same key on cold load so the toggle round-trips
 * across sessions without a dark-mode flash.
 */
export async function writeAppsWebThemeToggle(args: { rootDir: string }): Promise<void> {
  const { rootDir } = args;
  const content = `---
/**
 * Light/dark theme toggle.
 *
 * Reads + writes <html data-theme>. Persists the user choice to
 * localStorage so the boot script in Layout.astro can restore it
 * before paint on the next visit (no flash-of-incorrect-theme).
 */
---

<button
  type="button"
  class="theme-toggle"
  aria-label="Toggle color theme"
  data-theme-toggle
>
  <span class="theme-toggle__icon theme-toggle__icon--light" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
  </span>
  <span class="theme-toggle__icon theme-toggle__icon--dark" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
  </span>
</button>

<script>
  /* eslint-disable @typescript-eslint/no-non-null-assertion */
  // Astro processes this script via Vite — runs in the browser at
  // load time. Re-runs on view-transition navigation (Astro re-binds
  // the listener since the button is re-mounted on each route).
  function bindToggle(): void {
    const btn = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') ?? 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }

  bindToggle();
  document.addEventListener('astro:after-swap', bindToggle);
</script>

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
  }

  .theme-toggle:hover {
    background: var(--hx-color-surface-subtle, #f7f9fb);
  }

  .theme-toggle:focus-visible {
    outline: 2px solid var(--hx-color-focus, #2563eb);
    outline-offset: 2px;
  }

  .theme-toggle__icon {
    display: none;
    line-height: 0;
  }

  :global(html[data-theme='light']) .theme-toggle__icon--light {
    display: inline-flex;
  }

  :global(html[data-theme='dark']) .theme-toggle__icon--dark {
    display: inline-flex;
  }

  /* Default state when no theme attribute set yet — show light icon. */
  :global(html:not([data-theme='dark'])) .theme-toggle__icon--light {
    display: inline-flex;
  }

  @media (prefers-reduced-motion: reduce) {
    .theme-toggle {
      transition: none;
    }
  }
</style>
`;
  await safeWriteFile(
    path.join(rootDir, APPS_WEB_REL, 'src', 'components', 'ThemeToggle.astro'),
    content,
  );
}

/**
 * apps/web/public/favicon.svg — brand-neutral mark.
 *
 * A simple geometric mark — readable at 16x16 favicon size, scales to
 * any larger size without rasterization. No wordmark, no specific
 * vertical association. Consumers replace this with their own brand
 * mark.
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
  await safeWriteFile(path.join(rootDir, APPS_WEB_REL, 'public', 'favicon.svg'), content);
}
