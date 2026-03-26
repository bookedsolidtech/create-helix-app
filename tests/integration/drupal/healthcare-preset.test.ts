import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText, listSubdirs } from '../setup.js';

const ROOT = makeTmpRoot('drupal-healthcare');

// healthcare preset: standard (7) + blog (5) + healthcare (4) = 16 SDCs
const STANDARD_SDCS = [
  'node-teaser',
  'views-grid',
  'hero-banner',
  'site-header',
  'site-footer',
  'breadcrumb',
  'search-form',
];
const BLOG_SDCS = [
  'article-full',
  'author-byline',
  'related-articles',
  'tag-cloud',
  'newsletter-signup',
];
const HEALTHCARE_SPECIFIC_SDCS = [
  'provider-card',
  'appointment-cta',
  'condition-tag',
  'medical-disclaimer',
];
const ALL_HEALTHCARE_SDCS = [...STANDARD_SDCS, ...BLOG_SDCS, ...HEALTHCARE_SPECIFIC_SDCS];

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('drupal healthcare preset integration', () => {
  it('generates all required theme files', async () => {
    const dir = path.join(ROOT, 'hc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_healthcare',
      directory: dir,
      preset: 'healthcare',
    });
    await assertFilesExist(dir, [
      'test_healthcare.info.yml',
      'test_healthcare.libraries.yml',
      'helixui.libraries.yml',
      'package.json',
      'composer.json',
      'src/behaviors/healthcare-behaviors.js',
    ]);
  });

  it('theme info YAML contains healthcare preset reference', async () => {
    const dir = path.join(ROOT, 'hc-info');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_info',
      directory: dir,
      preset: 'healthcare',
    });
    const info = await readText(dir, 'test_hc_info.info.yml');
    expect(info).toContain('healthcare');
    expect(info).toContain('core_version_requirement: ^10 || ^11');
  });

  it('creates exactly 16 SDC component directories', async () => {
    const dir = path.join(ROOT, 'hc-count');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_count',
      directory: dir,
      preset: 'healthcare',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    expect(sdcDirs).toHaveLength(16);
  });

  it('all healthcare-specific SDC directories are present', async () => {
    const dir = path.join(ROOT, 'hc-specific');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_specific',
      directory: dir,
      preset: 'healthcare',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    for (const sdc of HEALTHCARE_SPECIFIC_SDCS) {
      expect(sdcDirs).toContain(sdc);
    }
  });

  it('inherits all blog SDC directories', async () => {
    const dir = path.join(ROOT, 'hc-blog');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_blog',
      directory: dir,
      preset: 'healthcare',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    for (const sdc of BLOG_SDCS) {
      expect(sdcDirs).toContain(sdc);
    }
  });

  it('inherits all standard SDC directories', async () => {
    const dir = path.join(ROOT, 'hc-standard');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_standard',
      directory: dir,
      preset: 'healthcare',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    for (const sdc of STANDARD_SDCS) {
      expect(sdcDirs).toContain(sdc);
    }
  });

  it('each SDC directory contains .component.yml and .twig files', async () => {
    const dir = path.join(ROOT, 'hc-sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_sdc_files',
      directory: dir,
      preset: 'healthcare',
    });
    for (const sdc of ALL_HEALTHCARE_SDCS) {
      await assertFilesExist(dir, [
        `src/components/${sdc}/${sdc}.component.yml`,
        `src/components/${sdc}/${sdc}.twig`,
      ]);
    }
  });

  it('helixui.libraries.yml contains healthcare-specific SDC entries', async () => {
    const dir = path.join(ROOT, 'hc-libs');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_libs',
      directory: dir,
      preset: 'healthcare',
    });
    const libs = await readText(dir, 'helixui.libraries.yml');
    expect(libs).toContain('provider: cdn');
    for (const sdc of HEALTHCARE_SPECIFIC_SDCS) {
      expect(libs).toContain(`helixui.${sdc}:`);
    }
  });

  it('behaviors file uses once() pattern', async () => {
    const dir = path.join(ROOT, 'hc-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_behaviors',
      directory: dir,
      preset: 'healthcare',
    });
    const behaviors = await readText(dir, 'src/behaviors/healthcare-behaviors.js');
    expect(behaviors).toContain("once('");
  });
});
