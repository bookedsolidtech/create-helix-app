import fs from 'fs-extra';
import path from 'node:path';
import type { DrupalOptions, PresetConfig, SDCDefinition } from '../types.js';
import { getPreset } from '../presets/loader.js';
import { generateThemeLibraries } from './libraries.js';
import { HelixError, ErrorCode } from '../errors.js';

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
      dependencies: { ...preset.dependencies },
    },
    null,
    2,
  );
}

export function generateStyleCss(): string {
  return `/**
 * @file
 * Global theme stylesheet.
 * Component-scoped styles live in components/{group}/{name}/{name}.css
 */
@import url("helix-overrides.css");

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--hx-font-family-base, system-ui, -apple-system, sans-serif);
  color: var(--hx-color-text-primary, #111827);
  background-color: var(--hx-color-background, #ffffff);
  line-height: var(--hx-line-height-base, 1.5);
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
 * Uncomment and modify to match client brand identity.
 */
:root {
  /* Brand colors */
  /* --hx-color-primary: #0052cc; */
  /* --hx-color-primary-dark: #003d99; */
  /* --hx-color-primary-light: #4c9aff; */

  /* Neutral colors */
  /* --hx-color-text-primary: #111827; */
  /* --hx-color-text-secondary: #6b7280; */
  /* --hx-color-background: #ffffff; */
  /* --hx-color-surface: #f9fafb; */
  /* --hx-color-border: #e5e7eb; */

  /* Typography */
  /* --hx-font-family-base: 'Inter', system-ui, sans-serif; */
  /* --hx-font-size-base: 1rem; */
  /* --hx-line-height-base: 1.5; */

  /* Spacing scale */
  /* --hx-space-1: 0.25rem; */
  /* --hx-space-2: 0.5rem; */
  /* --hx-space-4: 1rem; */
  /* --hx-space-8: 2rem; */

  /* Border radius */
  /* --hx-radius-sm: 0.25rem; */
  /* --hx-radius-md: 0.375rem; */
  /* --hx-radius-lg: 0.5rem; */
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

    <div slot="header" class="node-teaser__header">
      {% if category %}
        <hx-badge variant="neutral" size="sm">{{ category }}</hx-badge>
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
        <hx-avatar size="sm" label="{{ author_name }}"></hx-avatar>
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
│   └── helix-overrides.css
├── js/                  ← Drupal behaviors (once() pattern)
├── templates/           ← Template overrides — delegate to SDCs
└── docker/              ← Standalone test stack (not for production)
\`\`\`

## Components (${preset.name} preset)

${preset.sdcList.map((s) => `- **${toTitleCase(s.name)}** (\`${s.group}\`) — ${s.helixComponents.join(', ')}`).join('\n')}

## Customization

Override HELiX CSS custom properties in \`css/helix-overrides.css\`:

\`\`\`css
:root {
  --hx-color-primary: #your-brand-color;
  --hx-font-family-base: 'Your Font', sans-serif;
}
\`\`\`

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

  await fs.writeFile(path.join(dir, 'README.md'), generateReadme(themeName, preset), 'utf-8');

  // css/
  await fs.ensureDir(path.join(dir, 'css'));
  await fs.writeFile(path.join(dir, 'css', 'style.css'), generateStyleCss(), 'utf-8');
  await fs.writeFile(
    path.join(dir, 'css', 'helix-overrides.css'),
    generateHelixOverridesCss(),
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
