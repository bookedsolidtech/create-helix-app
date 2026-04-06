import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText } from '../setup.js';

const ROOT = makeTmpRoot('drupal-ecommerce');

// ecommerce preset: standard (7) + ecommerce-specific (8) = 15 SDCs
const STANDARD_SDCS = [
  { name: 'node-teaser', group: 'node' },
  { name: 'content-grid', group: 'views' },
  { name: 'site-header', group: 'block' },
  { name: 'site-footer', group: 'block' },
  { name: 'breadcrumb', group: 'block' },
  { name: 'search-form', group: 'block' },
  { name: 'hero-banner', group: 'block' },
] as const;

const ECOMMERCE_SPECIFIC_SDCS = [
  { name: 'product-card', group: 'node' },
  { name: 'product-grid', group: 'views' },
  { name: 'price-display', group: 'block' },
  { name: 'cart-summary', group: 'block' },
  { name: 'checkout-form', group: 'block' },
  { name: 'category-nav', group: 'block' },
  { name: 'search-filters', group: 'block' },
  { name: 'review-stars', group: 'block' },
] as const;

const ALL_ECOMMERCE_SDCS = [...STANDARD_SDCS, ...ECOMMERCE_SPECIFIC_SDCS];

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('drupal ecommerce preset integration', () => {
  it('generates all required theme files', async () => {
    const dir = path.join(ROOT, 'ecommerce-files');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce',
      directory: dir,
      preset: 'ecommerce',
    });
    await assertFilesExist(dir, [
      'test_ecommerce.info.yml',
      'test_ecommerce.libraries.yml',
      'test_ecommerce.theme',
      'package.json',
      'composer.json',
      'css/style.css',
      'js/behaviors.js',
      'docker/docker-compose.yml',
    ]);
  });

  it('theme info YAML contains ecommerce preset reference', async () => {
    const dir = path.join(ROOT, 'ecommerce-info');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_info',
      directory: dir,
      preset: 'ecommerce',
    });
    const info = await readText(dir, 'test_ecommerce_info.info.yml');
    expect(info).toContain('ecommerce');
    expect(info).toContain('core_version_requirement: ^10 || ^11');
    expect(info).toContain("path: 'components'");
  });

  it('creates all 15 SDC component directories across correct groups', async () => {
    const dir = path.join(ROOT, 'ecommerce-count');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_count',
      directory: dir,
      preset: 'ecommerce',
    });
    for (const sdc of ALL_ECOMMERCE_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('all ecommerce-specific SDC directories are present', async () => {
    const dir = path.join(ROOT, 'ecommerce-specific');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_sdcs',
      directory: dir,
      preset: 'ecommerce',
    });
    for (const sdc of ECOMMERCE_SPECIFIC_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('inherits all standard SDC directories', async () => {
    const dir = path.join(ROOT, 'ecommerce-inherited');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_inherited',
      directory: dir,
      preset: 'ecommerce',
    });
    for (const sdc of STANDARD_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('each SDC directory contains .component.yml, .twig, and .css files', async () => {
    const dir = path.join(ROOT, 'ecommerce-sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_sdc_files',
      directory: dir,
      preset: 'ecommerce',
    });
    for (const sdc of ALL_ECOMMERCE_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
        `components/${sdc.group}/${sdc.name}/${sdc.name}.twig`,
        `components/${sdc.group}/${sdc.name}/${sdc.name}.css`,
      ]);
    }
  });

  it('generates template overrides for product-card and product-grid', async () => {
    const dir = path.join(ROOT, 'ecommerce-templates');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_tmpl',
      directory: dir,
      preset: 'ecommerce',
    });
    await assertFilesExist(dir, [
      'templates/node/node--product--teaser.html.twig',
      'templates/views/views-view--products.html.twig',
    ]);
  });

  it('package.json has @helixui/drupal-starter, @helixui/tokens, and @helixui/commerce', async () => {
    const dir = path.join(ROOT, 'ecommerce-pkg');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_pkg',
      directory: dir,
      preset: 'ecommerce',
    });
    const pkg = await readText(dir, 'package.json');
    expect(pkg).toContain('@helixui/drupal-starter');
    expect(pkg).toContain('@helixui/tokens');
    expect(pkg).toContain('@helixui/commerce');
  });

  it('behaviors file uses once() pattern', async () => {
    const dir = path.join(ROOT, 'ecommerce-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_behaviors',
      directory: dir,
      preset: 'ecommerce',
    });
    const behaviors = await readText(dir, 'js/behaviors.js');
    expect(behaviors).toContain("once('");
    expect(behaviors).toContain('Drupal.behaviors');
  });
});
