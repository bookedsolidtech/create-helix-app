// @design-system-approved: CLI-001 Terminal colors (picocolors), not CSS values
import pc from 'picocolors';
import type {
  TemplateConfig,
  ComponentBundleConfig,
  AnyTemplateConfig,
  CustomTemplateConfig,
} from './types.js';

// Centralized Helix version pins. The wc-storybook template tracks current
// Helix (3.3.1 — the version that emits the cascade tokens this scaffold
// expects: action.* semantic tier, on-{role}-strong text tokens, on-dark-*
// border tokens). The other framework templates intentionally target older
// Helix versions and keep their own literal pins until each is individually
// upgraded.
const HELIX_LIBRARY_VERSION = '^3.3.1';
const HELIX_TOKENS_VERSION = '^3.3.1';

export const TEMPLATES: TemplateConfig[] = [
  {
    id: 'react-next',
    name: 'React + Next.js 16',
    description: 'App Router, SSR-ready, full HELiX integration',
    hint: 'recommended for new projects',
    color: pc.cyan,
    dependencies: {
      next: '^16.0.0',
      react: '^19.1.0',
      'react-dom': '^19.1.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
      '@lit/react': '^1.0.0',
    },
    devDependencies: {
      '@types/node': '^22.0.0',
      '@types/react': '^19.1.0',
      '@types/react-dom': '^19.1.0',
      typescript: '^5.7.0',
      eslint: '^9.0.0',
      '@eslint/js': '^9.0.0',
      'typescript-eslint': '^8.0.0',
    },
    features: ['ssr', 'app-router', 'react-wrappers', 'form-integration'],
  },
  {
    id: 'react-vite',
    name: 'React + Vite',
    description: 'Lightning fast dev, SPA-first, HELiX with @lit/react',
    hint: 'beta — template under review',
    color: pc.magenta,
    dependencies: {
      react: '^19.1.0',
      'react-dom': '^19.1.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
      '@lit/react': '^1.0.0',
    },
    devDependencies: {
      '@types/react': '^19.1.0',
      '@types/react-dom': '^19.1.0',
      '@vitejs/plugin-react': '^4.5.0',
      vite: '^6.4.0',
      typescript: '^5.7.0',
    },
    features: ['hot-reload', 'react-wrappers', 'form-integration'],
  },
  {
    id: 'remix',
    name: 'React Router (Remix)',
    description: 'Full-stack React with SSR, nested routes, and HELiX integration',
    hint: 'beta — template under review',
    color: pc.blue,
    dependencies: {
      'react-router': '^7.5.0',
      '@react-router/node': '^7.5.0',
      isbot: '^5.1.0',
      react: '^19.1.0',
      'react-dom': '^19.1.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
      '@lit/react': '^1.0.0',
    },
    devDependencies: {
      '@react-router/dev': '^7.5.0',
      '@react-router/fs-routes': '^7.5.0',
      '@react-router/serve': '^7.5.0',
      '@types/react': '^19.1.0',
      '@types/react-dom': '^19.1.0',
      vite: '^6.4.0',
      typescript: '^5.7.0',
    },
    features: ['ssr', 'nested-routes', 'react-wrappers', 'form-integration'],
  },
  {
    id: 'vue-nuxt',
    name: 'Vue + Nuxt 4',
    description: 'Full-stack Vue with SSR, native WC support',
    hint: 'beta — template under review',
    color: pc.green,
    dependencies: {
      nuxt: '^4.0.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
    },
    devDependencies: {
      typescript: '^5.7.0',
    },
    features: ['ssr', 'native-wc-support', 'auto-imports'],
  },
  {
    id: 'vue-vite',
    name: 'Vue + Vite',
    description: 'Lightweight Vue 3 SPA with native WC binding',
    hint: 'beta — template under review',
    color: pc.green,
    dependencies: {
      vue: '^3.5.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
    },
    devDependencies: {
      '@vitejs/plugin-vue': '^5.2.0',
      vite: '^6.4.0',
      typescript: '^5.7.0',
    },
    features: ['hot-reload', 'native-wc-support'],
  },
  {
    id: 'solid-vite',
    name: 'Solid.js + Vite',
    description: 'Fine-grained reactive SPA with native web component support',
    hint: 'beta — template under review',
    color: pc.blue,
    dependencies: {
      'solid-js': '^1.9.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
    },
    devDependencies: {
      'vite-plugin-solid': '^2.11.0',
      vite: '^6.4.0',
      typescript: '^5.7.0',
    },
    features: ['hot-reload', 'fine-grained-reactivity', 'native-wc-support'],
  },
  {
    id: 'qwik-vite',
    name: 'Qwik + Vite',
    description: 'Resumable framework with zero hydration and native web component support',
    hint: 'beta — template under review',
    color: pc.magenta,
    dependencies: {
      '@builder.io/qwik': '^1.14.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
    },
    devDependencies: {
      vite: '^6.4.0',
      typescript: '^5.7.0',
    },
    features: ['resumability', 'zero-hydration', 'native-wc-support'],
  },
  {
    id: 'svelte-kit',
    name: 'SvelteKit',
    description: 'Svelte 5 + SvelteKit, native custom element support',
    hint: 'beta — template under review',
    color: pc.red,
    dependencies: {
      '@sveltejs/kit': '^2.20.0',
      svelte: '^5.28.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
    },
    devDependencies: {
      '@sveltejs/adapter-auto': '^6.0.0',
      '@sveltejs/vite-plugin-svelte': '^5.0.0',
      vite: '^6.4.0',
      typescript: '^5.7.0',
    },
    features: ['ssr', 'native-wc-support', 'runes'],
  },
  {
    id: 'angular',
    name: 'Angular 18',
    description: 'Enterprise Angular with CUSTOM_ELEMENTS_SCHEMA',
    hint: 'beta — template under review',
    color: pc.red,
    dependencies: {
      '@angular/core': '^18.0.0',
      '@angular/compiler': '^18.0.0',
      '@angular/platform-browser': '^18.0.0',
      '@angular/platform-browser-dynamic': '^18.0.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
      rxjs: '^7.8.0',
      'zone.js': '^0.15.0',
    },
    devDependencies: {
      '@angular/cli': '^18.0.0',
      '@angular/build': '^18.0.0',
      typescript: '~5.5.0',
    },
    features: ['signals', 'standalone-components', 'custom-elements-schema'],
  },
  {
    id: 'astro',
    name: 'Astro',
    description: 'Content-first with islands architecture, zero JS by default',
    hint: 'beta — template under review',
    color: pc.yellow,
    dependencies: {
      astro: '^5.7.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
    },
    devDependencies: {
      typescript: '^5.7.0',
    },
    features: ['islands', 'zero-js-default', 'content-collections'],
  },
  {
    id: 'vanilla',
    name: 'Vanilla (HTML + CDN)',
    description: 'No framework, no build step, just HTML and HELiX via CDN',
    hint: 'beta — template under review',
    color: pc.white,
    dependencies: {},
    devDependencies: {},
    features: ['zero-config', 'cdn', 'no-build-step'],
  },
  {
    id: 'lit-vite',
    name: 'Lit + Vite',
    description: 'Lightweight web components with Google Lit and Vite build tooling',
    hint: 'beta — template under review',
    color: pc.blue,
    dependencies: {
      lit: '^3.2.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
    },
    devDependencies: {
      vite: '^6.4.0',
      typescript: '^5.7.0',
    },
    features: ['web-components', 'reactive-properties', 'decorators', 'shadow-dom'],
  },
  {
    id: 'wc-storybook',
    name: 'Design System + Storybook 10',
    description:
      'Lit 3 component library factory — custom token prefix, HelixElement base class, full Storybook 10 dev environment with Playwright story tests',
    hint: 'beta — design system factory',
    color: pc.magenta,
    dependencies: {
      // lit is the only runtime dep — Helix packages are externalised by
      // vite.config.ts and live as peerDependencies. Keeping
      // @helixui/library or @helixui/tokens here would let downstream
      // installers pull a second copy of the Helix runtime alongside
      // their own host install, tripping duplicate
      // customElements.define() registrations and breaking element
      // identity (e.g. `<hx-button>` already defined).
      lit: '^3.2.0',
    },
    // peerDeps document the cascade-token contract version the consumer host
    // MUST satisfy. The wc-storybook factory ships components that bridge
    // --{prefix}-* tokens into Helix's --hx-* names — that bridge ASSUMES
    // the action.* semantic tier, on-{role}-strong text tokens, and the
    // on-dark-* border family that Helix 3.3.1 introduced. Pinning these as
    // peerDeps surfaces the version contract in `npm ls` output and trips
    // pnpm's strict-peer-deps check if a downstream installs an
    // older Helix that doesn't export the cascade.
    peerDependencies: {
      '@helixui/library': HELIX_LIBRARY_VERSION,
      '@helixui/tokens': HELIX_TOKENS_VERSION,
    },
    devDependencies: {
      // Helix packages also live as devDependencies so the scaffold's own
      // dev/test/build pipeline (Storybook, vitest, smoke probe) resolves
      // them without forcing the consumer's host to be installed yet.
      // peerDependencies declares the version CONTRACT; devDependencies
      // satisfies the LOCAL install. They share a version pin to keep
      // the contract honest.
      '@helixui/library': HELIX_LIBRARY_VERSION,
      '@helixui/tokens': HELIX_TOKENS_VERSION,
      storybook: '^10.2.8',
      '@storybook/web-components': '^10.2.8',
      '@storybook/web-components-vite': '^10.2.8',
      '@storybook/addon-a11y': '^10.2.8',
      '@storybook/addon-docs': '^10.2.8',
      '@storybook/addon-themes': '^10.2.8',
      '@storybook/addon-vitest': '^10.2.8',
      // 2026-05-09 Phase 2 — addon parity with upstream Helix storybook.
      // Versions sourced from helix/apps/storybook/package.json. Chromatic
      // addon version intentionally tracks the @chromatic-com major (not
      // Storybook's), per their release cadence.
      '@chromatic-com/storybook': '^5.1.2',
      '@storybook/addon-designs': '^11.1.3',
      '@storybook/addon-links': '^10.2.8',
      'storybook-addon-pseudo-states': '^10.2.8',
      '@custom-elements-manifest/analyzer': '^0.10.0',
      concurrently: '^9.1.0',
      dotenv: '^16.4.5',
      tsx: '^4.19.0',
      vitest: '^3.0.0',
      '@vitest/browser': '^3.0.0',
      // @vitest/ui is required by `pnpm test:ui` (vitest --ui). Without it
      // the script fails immediately on a fresh scaffold with vitest's
      // missing-package error. Pinned at the same major as vitest.
      '@vitest/ui': '^3.0.0',
      // playwright is required by @vitest/browser when browser.provider is
      // 'playwright' (vitest.config.ts ships with that setting). Pinning here
      // avoids a fail-on-first-run when consumers boot vitest right after
      // scaffold + install.
      playwright: '^1.50.0',
      vite: '^6.4.0',
      typescript: '^5.7.0',
      // React is required because the scaffold emits .tsx docs helpers
      // (HelixDocsPage, A11yStatusCard, ConsumerObligations, etc.) that
      // import from 'react' and '@storybook/addon-docs/blocks'. Storybook
      // 10's web-components-vite renderer ships with React under the hood
      // for autodocs — declaring it explicitly here so `pnpm install`
      // resolves the import without relying on hoisting.
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
    },
    features: [
      'web-components',
      'storybook',
      'autodocs',
      'cem',
      'shadow-dom',
      'helix-tokens',
      'theme-switching',
      'a11y',
      'playwright-story-tests',
      'token-generator',
      'figma-token-sync',
    ],
  },
  {
    id: 'preact-vite',
    name: 'Preact + Vite',
    description:
      'Fast 3kB React alternative with the same modern API and native web component support',
    hint: 'beta — template under review',
    color: pc.magenta,
    dependencies: {
      preact: '^10.26.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
    },
    devDependencies: {
      '@preact/preset-vite': '^2.9.0',
      vite: '^6.4.0',
      typescript: '^5.7.0',
    },
    features: ['hot-reload', 'react-compatible-api', 'hooks', 'native-wc-support'],
  },
  {
    id: 'stencil',
    name: 'Stencil',
    description:
      'Compiler for building standards-based web components with lazy-loading and zero-dependency output',
    hint: 'beta — template under review',
    color: pc.cyan,
    dependencies: {
      '@stencil/core': '^4.22.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
    },
    devDependencies: {
      typescript: '^5.7.0',
    },
    features: ['web-components', 'shadow-dom', 'lazy-loading', 'decorators'],
  },
  {
    id: 'ember',
    name: 'Ember.js',
    description: 'Convention-driven full-stack framework with native web component support',
    hint: 'beta — template under review',
    color: pc.red,
    dependencies: {
      'ember-source': '^6.0.0',
      '@helixui/library': '^1.0.0',
      '@helixui/tokens': '^0.3.0',
    },
    devDependencies: {
      'ember-cli': '^6.0.0',
      '@ember/test-helpers': '^4.0.0',
      typescript: '^5.7.0',
    },
    features: ['classic-routing', 'conventions', 'native-wc-support', 'octane'],
  },
];

export const COMPONENT_BUNDLES: ComponentBundleConfig[] = [
  {
    id: 'all',
    name: 'All Components',
    description: '98 components — the full HELiX library',
    components: ['*'],
  },
  {
    id: 'core',
    name: 'Core UI',
    description: 'button, card, badge, text, icon, avatar, divider, chip',
    components: [
      'hx-button',
      'hx-icon-button',
      'hx-button-group',
      'hx-split-button',
      'hx-card',
      'hx-badge',
      'hx-text',
      'hx-icon',
      'hx-avatar',
      'hx-divider',
      'hx-chip',
      'hx-tag',
      'hx-tooltip',
      'hx-popover',
    ],
  },
  {
    id: 'forms',
    name: 'Form Components',
    description: 'text-input, select, checkbox, radio, switch, textarea, field',
    components: [
      'hx-text-input',
      'hx-select',
      'hx-checkbox',
      'hx-checkbox-group',
      'hx-radio-group',
      'hx-switch',
      'hx-textarea',
      'hx-field',
      'hx-field-label',
      'hx-field-help-text',
      'hx-combobox',
      'hx-slider',
      'hx-range-slider',
      'hx-color-picker',
      'hx-date-picker',
      'hx-time-picker',
      'hx-file-upload',
    ],
  },
  {
    id: 'navigation',
    name: 'Navigation',
    description: 'nav, sidebar, tabs, breadcrumb, pagination, menu',
    components: [
      'hx-nav',
      'hx-side-nav',
      'hx-tabs',
      'hx-tab',
      'hx-tab-panel',
      'hx-breadcrumb',
      'hx-pagination',
      'hx-menu',
      'hx-menu-item',
      'hx-overflow-menu',
      'hx-tree-view',
      'hx-tree-item',
    ],
  },
  {
    id: 'data-display',
    name: 'Data Display',
    description: 'data-table, stat, progress, meter, counter, structured-list',
    components: [
      'hx-data-table',
      'hx-stat',
      'hx-counter',
      'hx-progress-bar',
      'hx-progress-ring',
      'hx-meter',
      'hx-structured-list',
      'hx-rating',
      'hx-code-snippet',
      'hx-status-indicator',
    ],
  },
  {
    id: 'feedback',
    name: 'Feedback & Overlays',
    description: 'alert, toast, dialog, drawer, banner, skeleton',
    components: [
      'hx-alert',
      'hx-toast',
      'hx-dialog',
      'hx-drawer',
      'hx-banner',
      'hx-skeleton',
      'hx-spinner',
      'hx-loading-bar',
    ],
  },
  {
    id: 'layout',
    name: 'Layout',
    description: 'grid, stack, split-panel, accordion, carousel',
    components: [
      'hx-grid',
      'hx-stack',
      'hx-split-panel',
      'hx-accordion',
      'hx-accordion-item',
      'hx-carousel',
      'hx-carousel-item',
      'hx-container',
      'hx-visually-hidden',
      'hx-resize-observer',
      'hx-scroll-area',
    ],
  },
];

export function getTemplate(id: string): TemplateConfig | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * Merges built-in templates with custom templates loaded from a templateDir.
 *
 * Rules:
 * - If a custom template has the same ID as a built-in, the custom version wins.
 * - New custom templates (no matching built-in ID) are appended after all built-ins.
 *
 * @param customs - Custom template definitions loaded from templateDir.
 * @returns Merged array with built-ins first (minus overrides), then new customs.
 */
export function mergeWithCustomTemplates(customs: CustomTemplateConfig[]): AnyTemplateConfig[] {
  const result: AnyTemplateConfig[] = [...TEMPLATES];

  for (const custom of customs) {
    const existingIndex = result.findIndex((t) => t.id === custom.id);
    if (existingIndex >= 0) {
      // Custom template overrides built-in with same ID
      result[existingIndex] = custom;
    } else {
      // New custom template — append after built-ins
      result.push(custom);
    }
  }

  return result;
}

export function getComponentsForBundles(bundles: string[]): string[] {
  if (bundles.includes('all')) return ['*'];
  const components = new Set<string>();
  for (const bundleId of bundles) {
    const bundle = COMPONENT_BUNDLES.find((b) => b.id === bundleId);
    if (bundle) {
      for (const component of bundle.components) {
        components.add(component);
      }
    }
  }
  return [...components];
}
