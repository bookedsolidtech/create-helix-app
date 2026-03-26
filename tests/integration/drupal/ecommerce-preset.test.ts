import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText, listSubdirs } from '../setup.js';

const ROOT = makeTmpRoot('drupal-ecommerce');

// ecommerce preset: standard (7) + ecommerce-specific (8) = 15 SDCs
const STANDARD_SDCS = [
  'node-teaser',
  'views-grid',
  'hero-banner',
  'site-header',
  'site-footer',
  'breadcrumb',
  'search-form',
];
const ECOMMERCE_SPECIFIC_SDCS = [
  'product-card',
  'product-grid',
  'price-display',
  'cart-summary',
  'checkout-form',
  'category-nav',
  'search-filters',
  'review-stars',
];
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
      'helixui.libraries.yml',
      'package.json',
      'composer.json',
      'src/behaviors/ecommerce-behaviors.js',
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
  });

  it('creates exactly 15 SDC component directories', async () => {
    const dir = path.join(ROOT, 'ecommerce-count');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_count',
      directory: dir,
      preset: 'ecommerce',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    expect(sdcDirs).toHaveLength(15);
  });

  it('all ecommerce-specific SDC directories are present', async () => {
    const dir = path.join(ROOT, 'ecommerce-specific');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_sdcs',
      directory: dir,
      preset: 'ecommerce',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    for (const sdc of ECOMMERCE_SPECIFIC_SDCS) {
      expect(sdcDirs).toContain(sdc);
    }
  });

  it('inherits all standard SDC directories', async () => {
    const dir = path.join(ROOT, 'ecommerce-inherited');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_inherited',
      directory: dir,
      preset: 'ecommerce',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    for (const sdc of STANDARD_SDCS) {
      expect(sdcDirs).toContain(sdc);
    }
  });

  it('each SDC directory contains .component.yml and .twig files', async () => {
    const dir = path.join(ROOT, 'ecommerce-sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_sdc_files',
      directory: dir,
      preset: 'ecommerce',
    });
    for (const sdc of ALL_ECOMMERCE_SDCS) {
      await assertFilesExist(dir, [
        `src/components/${sdc}/${sdc}.component.yml`,
        `src/components/${sdc}/${sdc}.twig`,
      ]);
    }
  });

  it('helixui.libraries.yml contains ecommerce-specific SDC entries', async () => {
    const dir = path.join(ROOT, 'ecommerce-libs');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_libs',
      directory: dir,
      preset: 'ecommerce',
    });
    const libs = await readText(dir, 'helixui.libraries.yml');
    expect(libs).toContain('provider: cdn');
    for (const sdc of ECOMMERCE_SPECIFIC_SDCS) {
      expect(libs).toContain(`helixui.${sdc}:`);
    }
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

  it('behaviors file uses once() pattern and is named ecommerce-behaviors.js', async () => {
    const dir = path.join(ROOT, 'ecommerce-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_ecommerce_behaviors',
      directory: dir,
      preset: 'ecommerce',
    });
    const behaviors = await readText(dir, 'src/behaviors/ecommerce-behaviors.js');
    expect(behaviors).toContain("once('");
  });
});
