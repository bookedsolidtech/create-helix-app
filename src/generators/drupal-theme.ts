import fs from 'fs-extra';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { DrupalOptions, PresetConfig, SDCDefinition } from '../types.js';
import { getPreset } from '../presets/loader.js';
import { generateThemeLibraries } from './libraries.js';
import { HelixError, ErrorCode } from '../errors.js';

// Module-local require for resolving sibling dependencies via Node module
// resolution — walks up node_modules trees from this file's location, which
// correctly handles npm/pnpm/yarn workspace + hoisted installs of create-helix.
const localRequire = createRequire(import.meta.url);

/**
 * Read the upstream @helixui/tokens CSS at scaffold time.
 *
 * Two-tier strategy:
 *
 *   1. PRIMARY (production): read the bundled copy from
 *      `dist/assets/helix-tokens.css`, written by `scripts/add-shebang.mjs`
 *      at create-helix's build time. This is what's shipped in the published
 *      tarball and what users get from `npm create helix`. It is FIXED per
 *      create-helix release — the same create-helix version always emits the
 *      same scaffold bytes, no matter how the installer's npm/pnpm/yarn
 *      resolves transitive deps.
 *
 *   2. FALLBACK (dev/test): if the bundled file isn't present (typical when
 *      running from source, e.g. vitest tests against `src/`), resolve
 *      through the installed @helixui/tokens via Node module resolution.
 *      Resolves through the package's EXPORTED CSS subpaths — NOT
 *      `./package.json`, which @helixui/tokens@3.x's exports map does NOT
 *      publish (resolving it throws ERR_PACKAGE_PATH_NOT_EXPORTED).
 *
 * Returns null only when BOTH paths fail, in which case scaffoldDrupalTheme
 * falls back to the generateHelixTokensStub() placeholder.
 *
 * The reason scaffold-time vendoring matters: Drupal theme users typically
 * don't run `npm install` inside their theme directory — the documented
 * setup is `cp -r theme/` + `drush theme:enable`. If we relied on the
 * postinstall hook alone, the wiring would never activate.
 */
function readUpstreamHelixTokensCss(): string | null {
  // PRIMARY: bundled copy in create-helix's own dist/assets/. After
  // compilation, this file lives at dist/generators/drupal-theme.js, so
  // ../assets/helix-tokens.css resolves to dist/assets/helix-tokens.css.
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const bundled = path.resolve(here, '..', 'assets', 'helix-tokens.css');
    return fs.readFileSync(bundled, 'utf-8');
  } catch {
    /* not present — fall through to dev-path resolution */
  }
  // FALLBACK: resolve through transitive @helixui/tokens install. Used by
  // vitest tests against src/, where dist/ artifacts don't exist yet.
  const subpaths = ['@helixui/tokens/dist/tokens.css', '@helixui/tokens/tokens.css'];
  for (const subpath of subpaths) {
    try {
      const cssPath = localRequire.resolve(subpath);
      return fs.readFileSync(cssPath, 'utf-8');
    } catch {
      /* try next subpath */
    }
  }
  return null;
}

/**
 * SECURITY: Path traversal guard.
 *
 * Validates that `targetPath` does not contain directory traversal sequences
 * (e.g. "../" or "..\\" that normalize to ".."). Throws if any path segment
 * is "..".
 */
function assertNoPathTraversal(targetPath: string): void {
  const normalized = path.normalize(targetPath);
  const segments = normalized.split(path.sep);
  if (segments.includes('..')) {
    throw new HelixError(
      ErrorCode.PATH_TRAVERSAL,
      `Security: path "${targetPath}" contains directory traversal sequences. ` +
        `Aborting to prevent unauthorized file system access.`,
    );
  }
}

export function toTitleCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function sdcGroupLabel(group: string): string {
  const labels: Record<string, string> = {
    block: 'Block',
    node: 'Node Display',
    views: 'Views',
    paragraph: 'Paragraph',
    navigation: 'Navigation',
    form: 'Form',
    dashboard: 'Dashboard',
  };
  return labels[group] ?? 'Component';
}

// ---------------------------------------------------------------------------
// Root theme file generators
// ---------------------------------------------------------------------------

export function generateThemeInfoYml(themeName: string, preset: PresetConfig): string {
  const displayName = toTitleCase(themeName);
  return `name: '${displayName}'
type: theme
description: 'Drupal theme scaffolded with HELiX preset: ${preset.id}'
core_version_requirement: ^10 || ^11
base theme: false
libraries:
  - ${themeName}/global
components:
  path: 'components'
`;
}

export function generateComposerJson(themeName: string): string {
  return JSON.stringify(
    {
      name: `helixui/${themeName}`,
      description: 'Drupal theme with HELiX components',
      type: 'drupal-theme',
      require: {
        'drupal/core': '^11',
        'helixui/helixui': '^0.1.0',
      },
    },
    null,
    2,
  );
}

export function generatePackageJson(themeName: string, preset: PresetConfig): string {
  return JSON.stringify(
    {
      name: themeName,
      version: '1.0.0',
      private: true,
      description: `Drupal theme with HELiX ${preset.id} preset`,
      scripts: {
        // postinstall — vendor @helixui/tokens CSS into css/vendor/ so the
        // Drupal library system can load it. Without this the @helixui/tokens
        // dep is declared but never consumed at runtime, leaving every
        // var(--hx-*, fallback) reference resolving to its inline fallback.
        postinstall: 'node scripts/copy-helix-tokens.mjs',
      },
      dependencies: { ...preset.dependencies },
    },
    null,
    2,
  );
}

/**
 * Generates `css/vendor/helix-tokens.css` — a STUB written at scaffold time.
 *
 * Without this stub, a fresh Drupal scaffold would ship with a broken
 * `@import url("vendor/helix-tokens.css")` reference in `css/style.css`:
 * the postinstall script doesn't run until the user invokes
 * `npm install` / `pnpm install` inside the theme dir, so on first open
 * (e.g. inspecting the scaffold output in an editor) the import 404s.
 *
 * The stub makes the import resolve immediately to an empty `:root` block.
 * The theme renders correctly (every `var(--hx-*, fallback)` resolves to
 * its inline fallback) — just without HELiX brand tokens until install
 * completes and `scripts/copy-helix-tokens.mjs` overwrites this file with
 * the real upstream `@helixui/tokens/dist/tokens.css` content.
 */
export function generateHelixTokensStub(): string {
  return `/**
 * @file
 * vendor/helix-tokens.css — placeholder, replaced by postinstall.
 *
 * This file is OVERWRITTEN by \`scripts/copy-helix-tokens.mjs\` when you run
 * \`npm install\` (or \`pnpm install\` / \`yarn install\`) in this theme
 * directory. Until that happens, every \`var(--hx-*, fallback)\` reference
 * in the theme falls back to its inline default — the theme renders fine
 * but without HELiX brand tokens.
 *
 * Do not edit by hand; edit \`css/helix-overrides.css\` instead.
 */
:root {
  /* Stub — replaced on \`npm install\` from @helixui/tokens/tokens.css. */
}
`;
}

/**
 * Generates `scripts/copy-helix-tokens.mjs` — the postinstall script that
 * vendors `@helixui/tokens/dist/tokens.css` into `css/vendor/helix-tokens.css`
 * so the Drupal library system can load it via the theme's standard CSS
 * pipeline. The theme's `{theme}.libraries.yml` declares
 * `css/vendor/helix-tokens.css` as part of the `helix-tokens` library, and
 * `global` depends on `helix-tokens` so it always loads first in the cascade.
 *
 * Without this script the `@helixui/tokens` dependency would be declared in
 * package.json but never actually consumed — every `var(--hx-*, fallback)`
 * reference would resolve to its inline fallback rather than the brand
 * token value, making the upstream theming layer effectively dead.
 *
 * Idempotent: copies on every install, overwriting prior output.
 */
export function generateCopyHelixTokensScript(): string {
  return `#!/usr/bin/env node
/**
 * @file
 * Postinstall hook: REFRESHES css/vendor/helix-tokens.css from whatever
 * @helixui/tokens version is installed in this theme's resolution scope.
 *
 * The scaffold ALREADY vendors helix-tokens.css at scaffold time using
 * create-helix's own @helixui/tokens dep, so the theme works without an
 * \`npm install\` step. This script is the refresh path: if a developer DOES
 * run \`npm install\` (or \`pnpm\` / \`yarn\`) in the theme directory and gets
 * a newer @helixui/tokens, the vendored copy is kept in sync.
 *
 * Resolved via Node module resolution (createRequire) so this works in
 * hoisted / workspace installs where @helixui/tokens lives in an ancestor
 * node_modules rather than the theme's own.
 */
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const themeRoot = dirname(here);
const require = createRequire(import.meta.url);

// Resolve through @helixui/tokens's EXPORTED subpaths — NOT package.json,
// which the package's exports map does not publish (resolving './package.json'
// throws ERR_PACKAGE_PATH_NOT_EXPORTED on a real install).
let src;
const subpaths = ['@helixui/tokens/dist/tokens.css', '@helixui/tokens/tokens.css'];
for (const subpath of subpaths) {
  try {
    src = require.resolve(subpath);
    break;
  } catch {
    /* try next subpath */
  }
}

if (!src) {
  console.error('[copy-helix-tokens] @helixui/tokens not found — has \`npm install\` completed?');
  process.exit(1);
}

const destDir = join(themeRoot, 'css', 'vendor');
const dest = join(destDir, 'helix-tokens.css');
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('[copy-helix-tokens] vendored ' + src + ' -> ' + dest);
`;
}

export function generateStyleCss(): string {
  return `/**
 * @file
 * Global theme stylesheet.
 * Component-scoped styles live in components/{group}/{name}/{name}.css
 */
/* Cascade & load notes:
 *   - vendor/helix-tokens.css (upstream HELiX CSS variables) loads via the
 *     {theme}/helix-tokens library that global depends on — at weight -200,
 *     BEFORE this stylesheet — so token references resolve to upstream
 *     values, not inline fallbacks. Do NOT also @import it here; doing
 *     both would load + parse the same stylesheet twice on every page.
 *   - helix-responsive.css ships responsive token defaults; helix-overrides.css
 *     is where consumers reshape them. Load responsive FIRST so override
 *     values win the cascade — the reverse order silently reset overrides
 *     back to the scaffold defaults on every page render. */
@import url("helix-responsive.css");
@import url("helix-overrides.css");

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  /* @helixui/tokens@3.x semantic body tokens — these resolve through the
   * vendored helix-tokens.css. Pre-3.x names (--hx-font-family-base,
   * --hx-color-background, --hx-line-height-base) are NOT exported in
   * 3.x; switching to --hx-body-* lets the brand layer actually apply. */
  font-family: var(--hx-body-font-family, system-ui, -apple-system, sans-serif);
  color: var(--hx-body-color, #111827);
  background-color: var(--hx-body-bg, #ffffff);
  line-height: var(--hx-body-line-height, 1.5);
}

img {
  max-width: 100%;
  height: auto;
}
`;
}

export function generateHelixOverridesCss(): string {
  return `/**
 * @file
 * HELiX CSS custom property overrides.
 * Uncomment and modify to match client brand identity. All variable names
 * below match @helixui/tokens@3.x's semantic-token exports — overrides set
 * here take effect because the upstream value is what these names resolve
 * to in vendor/helix-tokens.css.
 */
:root {
  /* Brand colors (numeric scale — 50 lightest, 950 darkest) */
  /* --hx-color-primary-500: #0052cc; */
  /* --hx-color-primary-700: #003d99; */
  /* --hx-color-primary-300: #4c9aff; */

  /* Semantic text + surface tokens */
  /* --hx-color-text-primary: #111827; */
  /* --hx-color-text-secondary: #6b7280; */
  /* --hx-body-bg: #ffffff; */
  /* --hx-color-surface-default: #ffffff; */
  /* --hx-color-surface-raised: #f9fafb; */
  /* --hx-color-border-default: #e5e7eb; */

  /* Body typography (semantic — these flow through to body styles) */
  /* --hx-body-font-family: 'Inter', system-ui, sans-serif; */
  /* --hx-body-font-size: 1rem; */
  /* --hx-body-line-height: 1.5; */

  /* Border radius (semantic sizes) */
  /* --hx-border-radius-sm: 0.25rem; */
  /* --hx-border-radius-md: 0.375rem; */
  /* --hx-border-radius-lg: 0.5rem; */
}
`;
}

/**
 * Generates css/helix-responsive.css — the starter responsive semantic mode.
 *
 * Per Charles Attisano (Helix design lead, _brainstorm canvas 329:1199 in
 * wITXImaAPUCpBs2nRPv17k): every consumer of helix-tokens must declare its
 * own responsive mode. helix-tokens upstream ships theme/contrast modes
 * (default / dark / hc) but cannot ship breakpoints — every Drupal site
 * has different breakpoint needs, so the consumer-side scaffolder owns
 * the responsive defaults.
 *
 * Three token paths seeded today (mobile-first):
 *   --hx-responsive-grid-columns       4 / 8 / 12
 *   --hx-responsive-stack-gap          8px / 16px / 24px
 *   --hx-responsive-font-size-scale    0.875 / 1 / 1
 *
 * Override by editing this file or re-declaring inside your own media
 * queries. If your design system uses different breakpoints, rewrite the
 * thresholds here (768px, 1280px) to match.
 */
export function generateHelixResponsiveCss(): string {
  return `/**
 * @file
 * HELiX Responsive Semantic Mode — Starter Defaults.
 *
 * Per Charles Attisano (Helix design lead): every consumer of helix-tokens
 * must declare a responsive semantic mode. helix-tokens upstream ships
 * theme/contrast modes but cannot ship breakpoints — every consumer site
 * has different breakpoint needs.
 *
 * Tokens defined here:
 *   --hx-responsive-grid-columns       grid system column count
 *   --hx-responsive-stack-gap          default vertical rhythm gap (px)
 *   --hx-responsive-font-size-scale    multiplier on the type ramp
 */

:root {
  /* mobile (default — applied below the first breakpoint) */
  --hx-responsive-grid-columns: 4;
  --hx-responsive-stack-gap: 8px;
  --hx-responsive-font-size-scale: 0.875;
}

@media (min-width: 768px) {
  :root {
    /* tablet */
    --hx-responsive-grid-columns: 8;
    --hx-responsive-stack-gap: 16px;
    --hx-responsive-font-size-scale: 1;
  }
}

@media (min-width: 1280px) {
  :root {
    /* desktop */
    --hx-responsive-grid-columns: 12;
    --hx-responsive-stack-gap: 24px;
    --hx-responsive-font-size-scale: 1;
  }
}
`;
}

export function generateBehaviorsJs(themeName: string, preset: PresetConfig): string {
  const allComponents = new Set(preset.sdcList.flatMap((sdc) => sdc.helixComponents));
  const hxSelectors = [...allComponents].join(', ');

  return `/**
 * @file
 * HELiX UI Drupal behaviors — ${preset.name} preset.
 *
 * Initializes HELiX web components: ${[...allComponents].join(', ')}
 *
 * @see https://www.drupal.org/docs/drupal-apis/javascript-api/javascript-api-overview
 */
(function (Drupal, once) {
  'use strict';

  /**
   * Initialize HELiX web components on attach.
   *
   * @type {Drupal~behavior}
   */
  Drupal.behaviors.${themeName}Init = {
    attach(context, settings) {
      once('${themeName}:helix-init', '${hxSelectors}', context).forEach((el) => {
        el.setAttribute('data-drupal-initialized', 'true');
      });

      once('${themeName}:alert-dismiss', 'hx-alert[dismissible]', context).forEach((alert) => {
        alert.addEventListener('hx-dismiss', () => {
          alert.setAttribute('hidden', '');
        });
      });
    },

    detach(context, settings, trigger) {
      if (trigger === 'unload') {
        // Cleanup on page unload
      }
    },
  };

}(Drupal, once));
`;
}

export function generateThemePhp(themeName: string, sdcs: SDCDefinition[]): string {
  const overrideSdcs = sdcs.filter((s) => s.templateOverride);

  const entityTypes = new Set<string>();
  for (const sdc of overrideSdcs) {
    const tp = sdc.templateOverride ?? '';
    if (tp.startsWith('node/')) entityTypes.add('node');
    if (tp.startsWith('block/')) entityTypes.add('block');
    if (tp.startsWith('views/')) entityTypes.add('views_view');
  }

  const hooks = [...entityTypes]
    .map((type) => {
      const matching = overrideSdcs.filter((s) => {
        const tp = s.templateOverride ?? '';
        if (type === 'node') return tp.startsWith('node/');
        if (type === 'block') return tp.startsWith('block/');
        if (type === 'views_view') return tp.startsWith('views/');
        return false;
      });
      const varDocs = matching.map((s) => ` *   - ${s.name}: ${s.templateOverride}`).join('\n');
      return `/**
 * Implements hook_preprocess_${type}().
 *
 * Prepares variables for SDC template overrides:
${varDocs}
 */
function ${themeName}_preprocess_${type}(array &$variables): void {
  // Variables are forwarded to SDC components via templates/ overrides.
}`;
    })
    .join('\n\n');

  return `<?php

/**
 * @file
 * Preprocess hooks for ${toTitleCase(themeName)}.
 *
 * Template rendering is delegated to SDC components in components/.
 */

${hooks}
`;
}

// ---------------------------------------------------------------------------
// SDC component generators
// ---------------------------------------------------------------------------

export function generateComponentYml(sdc: SDCDefinition): string {
  const displayName = toTitleCase(sdc.name);
  const groupLabel = sdcGroupLabel(sdc.group);
  const helixList = sdc.helixComponents.join(', ');

  let propsYml = '';
  if (sdc.group === 'node') {
    propsYml = `  properties:
    title:
      type: string
      title: Title
      description: 'Node title or label'
    url:
      type: string
      title: URL
      description: 'Link target for the node'
    body:
      type: string
      title: Body
      description: 'Summary or excerpt text'
    image_url:
      type: string
      title: 'Image URL'
      description: 'URL for the featured image'
    image_alt:
      type: string
      title: 'Image Alt'
      description: 'Alt text for the featured image'
    author_name:
      type: string
      title: 'Author Name'
      description: 'Display name of the content author'
    date:
      type: string
      title: Date
      description: 'Publication date string'
    category:
      type: string
      title: Category
      description: 'Primary taxonomy term or category'`;
  } else if (sdc.group === 'views') {
    propsYml = `  properties:
    title:
      type: string
      title: Title
      description: 'View title'
    exposed_filters:
      type: string
      title: 'Exposed Filters'
      description: 'Rendered exposed filter form'`;
  } else {
    propsYml = `  properties:
    title:
      type: string
      title: Title
      description: 'Block title or label'`;
  }

  const slotsYml =
    sdc.group === 'node'
      ? `slots:
  actions:
    title: Actions
    description: 'Optional action buttons or links'`
      : `slots:
  content:
    title: Content
    description: 'Primary content area'`;

  return `$schema: 'https://git.drupalcode.org/project/drupal/-/raw/HEAD/core/assets/schemas/v1/metadata.schema.json'
name: '${displayName}'
description: '${displayName} component. Composes: ${helixList}.'
status: experimental
group: '${groupLabel}'
props:
  type: object
${propsYml}
${slotsYml}
`;
}

export function generateComponentTwig(sdc: SDCDefinition): string {
  if (sdc.name === 'node-teaser') return generateNodeTeaserTwig();
  if (sdc.name === 'site-header') return generateSiteHeaderTwig();

  const cssClass = sdc.name;
  const displayName = toTitleCase(sdc.name);
  const libraryAttaches = sdc.helixComponents
    .map((c) => `{{ attach_library('helixui/${c}') }}`)
    .join('\n');

  if (sdc.group === 'node') {
    const primaryComponent = sdc.helixComponents[0] ?? 'hx-card';
    return `{#
/**
 * @file
 * ${displayName} SDC component.
 * Composes: ${sdc.helixComponents.join(', ')}
 */
#}
${libraryAttaches}

<div{{ attributes.addClass('${cssClass}') }}>
  <${primaryComponent} variant="default" elevation="raised">
    <div class="${cssClass}__body">
      <hx-text variant="heading-sm">
        {% if url %}
          <hx-link href="{{ url }}">{{ title }}</hx-link>
        {% else %}
          {{ title }}
        {% endif %}
      </hx-text>
      {% if body %}
        <hx-text variant="body-sm">{{ body }}</hx-text>
      {% endif %}
    </div>
    {% if actions %}
      <div slot="footer" class="${cssClass}__actions">{{ actions }}</div>
    {% endif %}
  </${primaryComponent}>
</div>
`;
  }

  if (sdc.group === 'views') {
    return `{#
/**
 * @file
 * ${displayName} SDC component.
 * Composes: ${sdc.helixComponents.join(', ')}
 */
#}
${libraryAttaches}

<div{{ attributes.addClass('${cssClass}') }}>
  {% if title %}
    <hx-text variant="heading-md" class="${cssClass}__title">{{ title }}</hx-text>
  {% endif %}
  <div class="${cssClass}__rows">
    {% if rows %}{{ rows }}{% else %}{{ content }}{% endif %}
  </div>
</div>
`;
  }

  // block group
  return `{#
/**
 * @file
 * ${displayName} SDC component.
 * Composes: ${sdc.helixComponents.join(', ')}
 */
#}
${libraryAttaches}

<div{{ attributes.addClass('${cssClass}') }}>
  {% if title %}
    <hx-text variant="heading-sm" class="${cssClass}__title">{{ title }}</hx-text>
  {% endif %}
  <div class="${cssClass}__content">
    {{ content }}
  </div>
</div>
`;
}

function generateNodeTeaserTwig(): string {
  return `{#
/**
 * @file
 * Node Teaser SDC. Composes: hx-card, hx-badge, hx-text, hx-avatar, hx-link
 *
 * Available props: title, url, body, image_url, image_alt,
 *                  author_name, date, category
 */
#}
{{ attach_library('helixui/hx-card') }}
{{ attach_library('helixui/hx-badge') }}
{{ attach_library('helixui/hx-text') }}
{{ attach_library('helixui/hx-avatar') }}
{{ attach_library('helixui/hx-link') }}

<div{{ attributes.addClass('node-teaser') }}>
  <hx-card variant="default" elevation="raised">
    {% if image_url %}
      <img slot="image" src="{{ image_url }}" alt="{{ image_alt|default('') }}" loading="lazy">
    {% endif %}

    <div slot="heading" class="node-teaser__header">
      {% if category %}
        <hx-badge variant="neutral" hx-size="sm">{{ category }}</hx-badge>
      {% endif %}
    </div>

    <div class="node-teaser__body">
      <hx-text variant="heading-sm">
        {% if url %}
          <hx-link href="{{ url }}">{{ title }}</hx-link>
        {% else %}
          {{ title }}
        {% endif %}
      </hx-text>
      {% if body %}
        <hx-text variant="body-sm" class="node-teaser__excerpt">{{ body }}</hx-text>
      {% endif %}
    </div>

    <div slot="footer" class="node-teaser__meta">
      {% if author_name %}
        <hx-avatar hx-size="sm" label="{{ author_name }}"></hx-avatar>
        <hx-text variant="body-xs">{{ author_name }}</hx-text>
      {% endif %}
      {% if date %}
        <hx-text variant="body-xs"><time>{{ date }}</time></hx-text>
      {% endif %}
    </div>
  </hx-card>
</div>
`;
}

function generateSiteHeaderTwig(): string {
  return `{#
/**
 * @file
 * Site Header SDC — composes hx-container.
 *
 * Props: title (site name), sticky (default: true)
 * Slots: logo, navigation, actions
 */
#}
{{ attach_library('helixui/hx-container') }}

<header class="site-header{% if sticky is not same as(false) %} site-header--sticky{% endif %}" role="banner">
  <hx-container>
    <div class="site-header__inner">
      {% if logo %}
        <div class="site-header__logo">{{ logo }}</div>
      {% endif %}
      {% if navigation %}
        <div class="site-header__navigation">{{ navigation }}</div>
      {% endif %}
      {% if actions %}
        <div class="site-header__actions">{{ actions }}</div>
      {% endif %}
    </div>
  </hx-container>
</header>
`;
}

export function generateComponentCss(sdc: SDCDefinition): string {
  const cssClass = sdc.name;
  const displayName = toTitleCase(sdc.name);
  return `.${cssClass} {
  /* ${displayName} layout */
  display: block;
}

.${cssClass}__body {
  padding: var(--hx-space-4, 1rem);
}

.${cssClass}__title {
  margin: 0 0 var(--hx-space-2, 0.5rem);
}

.${cssClass}__content {
  display: flex;
  flex-direction: column;
  gap: var(--hx-space-2, 0.5rem);
}

.${cssClass}__meta {
  display: flex;
  align-items: center;
  gap: var(--hx-space-2, 0.5rem);
  color: var(--hx-color-text-secondary, #6b7280);
}
`;
}

// ---------------------------------------------------------------------------
// Template override generator
// ---------------------------------------------------------------------------

export function generateTemplateOverride(sdc: SDCDefinition, themeName: string): string {
  const templatePath = sdc.templateOverride ?? '';
  let variableMap = '';

  if (templatePath.startsWith('node/')) {
    variableMap = `    title: node.label,
    url: url,
    body: content.body|render|striptags|trim,
    image_url: node.field_image.entity ? file_url(node.field_image.entity.uri.value) : null,
    image_alt: node.field_image.alt|default(''),
    author_name: node.uid.entity.displayname,
    date: node.createdtime|format_date('medium'),
    category: node.field_tags[0].entity.label|default(null),`;
  } else if (templatePath.startsWith('block/')) {
    variableMap = `    title: block.label,
    content: content,`;
  } else if (templatePath.startsWith('views/')) {
    variableMap = `    title: title,
    rows: rows,
    exposed_filters: exposed|render,`;
  } else {
    variableMap = `    title: title,
    content: content,`;
  }

  return `{#
/**
 * @file
 * Template override — delegates to ${themeName}:${sdc.name} SDC.
 *
 * @see components/${sdc.group}/${sdc.name}/${sdc.name}.twig
 */
#}
{%
  include('${themeName}:${sdc.name}') with {
${variableMap}
  } only
%}
`;
}

// ---------------------------------------------------------------------------
// Docker generators
// ---------------------------------------------------------------------------

export function generateDockerCompose(themeName: string): string {
  return `# docker/docker-compose.yml
# Drupal 11 + MariaDB local development stack.
# Usage:
#   docker compose up -d
#   docker compose exec drupal bash /opt/drupal/web/themes/custom/${themeName}/docker/scripts/setup-drupal.sh

services:
  drupal:
    image: drupal:11-apache
    volumes:
      - ../:/opt/drupal/web/themes/custom/${themeName}
      - drupal_modules:/opt/drupal/web/modules
    ports:
      - "8080:80"
    environment:
      SIMPLETEST_DB: mysql://drupal:drupal@db/drupal
    depends_on:
      db:
        condition: service_healthy

  db:
    image: mariadb:11
    environment:
      MARIADB_DATABASE: drupal
      MARIADB_USER: drupal
      MARIADB_PASSWORD: drupal
      MARIADB_ROOT_PASSWORD: rootpassword
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  drupal_modules:
`;
}

export function generateSetupDrupalSh(themeName: string): string {
  return `#!/usr/bin/env bash
# docker/scripts/setup-drupal.sh
# Installs Drupal 11 and enables the ${themeName} theme.
# Run inside the drupal container:
#   docker compose exec drupal bash /opt/drupal/web/themes/custom/${themeName}/docker/scripts/setup-drupal.sh

set -euo pipefail

THEME="${themeName}"
DB_URL="mysql://drupal:drupal@db/drupal"

echo "Installing Drupal..."
drush site-install minimal \\
  --db-url="$DB_URL" \\
  --account-name=admin \\
  --account-pass=admin \\
  --site-name="${toTitleCase(themeName)}" \\
  -y

echo "Enabling theme: $THEME"
drush theme:enable "$THEME" -y
drush config:set system.theme default "$THEME" -y
drush cache:rebuild

echo "Done! Drupal is running at http://localhost:8080"
`;
}

export function generateReadme(themeName: string, preset: PresetConfig): string {
  const displayName = toTitleCase(themeName);
  return `# ${displayName}

Drupal 11 theme scaffolded with [HELiX](https://helixui.com) — **${preset.name} preset**.

## Adding to your project

Copy this directory into your Drupal project's custom themes folder:

\`\`\`bash
cp -r ${themeName}/ web/themes/custom/
\`\`\`

Then enable it using whichever local dev platform your team uses:

### DDEV

\`\`\`bash
ddev drush theme:enable ${themeName}
ddev drush config:set system.theme default ${themeName}
ddev drush cr
\`\`\`

### Lando

\`\`\`bash
lando drush theme:enable ${themeName}
lando drush config:set system.theme default ${themeName}
lando drush cr
\`\`\`

### Direct drush (Pantheon, Tugboat, other)

\`\`\`bash
drush theme:enable ${themeName}
drush config:set system.theme default ${themeName}
drush cr
\`\`\`

---

## Standalone testing (no existing Drupal install)

A Docker Compose stack is included for standalone validation. This is intended for
quick theme checks and CI — it will be superseded by your team's dev platform
(DDEV, Lando, etc.) on real projects.

\`\`\`bash
cd docker
docker compose up -d
docker compose exec drupal bash /opt/drupal/web/themes/custom/${themeName}/docker/scripts/setup-drupal.sh
# Open http://localhost:8080
docker compose down -v  # tear down when done
\`\`\`

---

## Structure

\`\`\`
${themeName}/
├── components/          ← SDC components (Drupal 11 standard)
│   ├── block/
│   ├── node/
│   └── views/
├── css/                 ← Global stylesheets
│   ├── style.css
│   ├── helix-overrides.css
│   ├── helix-responsive.css
│   └── vendor/
│       └── helix-tokens.css   ← vendored from @helixui/tokens by postinstall
├── js/                  ← Drupal behaviors (once() pattern)
├── scripts/
│   └── copy-helix-tokens.mjs  ← postinstall: vendors @helixui/tokens CSS
├── templates/           ← Template overrides — delegate to SDCs
└── docker/              ← Standalone test stack (not for production)
\`\`\`

## Components (${preset.name} preset)

${preset.sdcList.map((s) => `- **${toTitleCase(s.name)}** (\`${s.group}\`) — ${s.helixComponents.join(', ')}`).join('\n')}

## Customization

Override HELiX CSS custom properties in \`css/helix-overrides.css\`:

\`\`\`css
:root {
  /* Brand colors use @helixui/tokens@3.x's numeric scale —
   * 500 is the primary brand color; 700 is dark; 300 is light. */
  --hx-color-primary-500: #your-brand-color;
  /* Body typography flows through the semantic --hx-body-* tokens. */
  --hx-body-font-family: 'Your Font', sans-serif;
}
\`\`\`

## Responsive mode

Every \`create-helix\` Drupal scaffold ships with a starter responsive
semantic mode in \`css/helix-responsive.css\` (mobile / tablet / desktop).
\`helix-tokens\` (upstream) ships theme/contrast modes but cannot ship
breakpoints — every consumer site has different breakpoint needs, so the
scaffolder seeds the responsive defaults consumer-side.

Token paths seeded today:

- \`--hx-responsive-grid-columns\` — grid system column count
- \`--hx-responsive-stack-gap\` — default vertical rhythm gap
- \`--hx-responsive-font-size-scale\` — multiplier on the type ramp

Override the values or rewrite the breakpoint thresholds in
\`css/helix-responsive.css\` to match your design system. Example:

\`\`\`css
@media (min-width: 1024px) {
  :root {
    --hx-responsive-grid-columns: 16;
    --hx-responsive-stack-gap: 32px;
  }
}
\`\`\`

(Source: per Charles Attisano, Helix design lead — every starter must include
a responsive semantic mode.)

## Architecture

${preset.architectureNotes}
`;
}

// ---------------------------------------------------------------------------
// Main scaffold function
// ---------------------------------------------------------------------------

export async function scaffoldDrupalTheme(options: DrupalOptions): Promise<void> {
  const preset = getPreset(options.preset);
  const dir = options.directory;
  const themeName = options.themeName;

  // SECURITY: Validate the output directory path before writing any files.
  assertNoPathTraversal(dir);

  await fs.ensureDir(dir);

  // Root theme files
  await fs.writeFile(
    path.join(dir, `${themeName}.info.yml`),
    generateThemeInfoYml(themeName, preset),
    'utf-8',
  );

  await fs.writeFile(
    path.join(dir, `${themeName}.libraries.yml`),
    generateThemeLibraries(themeName, preset),
    'utf-8',
  );

  await fs.writeFile(
    path.join(dir, `${themeName}.theme`),
    generateThemePhp(themeName, preset.sdcList),
    'utf-8',
  );

  await fs.writeFile(path.join(dir, 'composer.json'), generateComposerJson(themeName), 'utf-8');

  await fs.writeFile(
    path.join(dir, 'package.json'),
    generatePackageJson(themeName, preset),
    'utf-8',
  );

  // scripts/ — postinstall vendoring for @helixui/tokens (see
  // generateCopyHelixTokensScript). Paired with a stub at
  // css/vendor/helix-tokens.css below so the @import resolves immediately
  // (no 404 in a fresh scaffold opened before `npm install`).
  await fs.ensureDir(path.join(dir, 'scripts'));
  await fs.writeFile(
    path.join(dir, 'scripts', 'copy-helix-tokens.mjs'),
    generateCopyHelixTokensScript(),
    'utf-8',
  );

  // css/vendor/helix-tokens.css — vendor the upstream HELiX tokens CSS at
  // scaffold time, reading from create-helix's own @helixui/tokens dep.
  // This activates the tokens layer immediately, without requiring the user
  // to run `npm install` inside the theme — Drupal's documented theme setup
  // is `cp -r` + `drush theme:enable`, neither of which triggers a Node
  // install, so a postinstall-only approach would leave the wiring dormant.
  // The postinstall script (copy-helix-tokens.mjs) still runs IF the user
  // does `npm install`, refreshing the file from whatever version their
  // install resolved. Falls back to a stub only if create-helix's @helixui/
  // tokens dep is somehow unreachable (defensive — it's a declared runtime
  // dependency, so this branch is rare).
  await fs.ensureDir(path.join(dir, 'css', 'vendor'));
  const upstreamTokensCss = readUpstreamHelixTokensCss();
  await fs.writeFile(
    path.join(dir, 'css', 'vendor', 'helix-tokens.css'),
    upstreamTokensCss ?? generateHelixTokensStub(),
    'utf-8',
  );

  await fs.writeFile(path.join(dir, 'README.md'), generateReadme(themeName, preset), 'utf-8');

  // css/
  await fs.ensureDir(path.join(dir, 'css'));
  await fs.writeFile(path.join(dir, 'css', 'style.css'), generateStyleCss(), 'utf-8');
  await fs.writeFile(
    path.join(dir, 'css', 'helix-overrides.css'),
    generateHelixOverridesCss(),
    'utf-8',
  );
  await fs.writeFile(
    path.join(dir, 'css', 'helix-responsive.css'),
    generateHelixResponsiveCss(),
    'utf-8',
  );

  // js/
  await fs.ensureDir(path.join(dir, 'js'));
  await fs.writeFile(
    path.join(dir, 'js', 'behaviors.js'),
    generateBehaviorsJs(themeName, preset),
    'utf-8',
  );

  // components/{group}/{name}/
  for (const sdc of preset.sdcList) {
    const sdcDir = path.join(dir, 'components', sdc.group, sdc.name);
    await fs.ensureDir(sdcDir);

    await fs.writeFile(
      path.join(sdcDir, `${sdc.name}.component.yml`),
      generateComponentYml(sdc),
      'utf-8',
    );

    await fs.writeFile(path.join(sdcDir, `${sdc.name}.twig`), generateComponentTwig(sdc), 'utf-8');

    await fs.writeFile(path.join(sdcDir, `${sdc.name}.css`), generateComponentCss(sdc), 'utf-8');
  }

  // templates/ — overrides for SDCs that declare templateOverride
  for (const sdc of preset.sdcList) {
    if (!sdc.templateOverride) continue;
    const templateFilePath = path.join(dir, 'templates', sdc.templateOverride);
    await fs.ensureDir(path.dirname(templateFilePath));
    await fs.writeFile(templateFilePath, generateTemplateOverride(sdc, themeName), 'utf-8');
  }

  // docker/
  await fs.ensureDir(path.join(dir, 'docker', 'scripts'));
  await fs.writeFile(
    path.join(dir, 'docker', 'docker-compose.yml'),
    generateDockerCompose(themeName),
    'utf-8',
  );
  await fs.writeFile(
    path.join(dir, 'docker', 'scripts', 'setup-drupal.sh'),
    generateSetupDrupalSh(themeName),
    'utf-8',
  );
}
