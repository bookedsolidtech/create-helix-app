import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText } from '../setup.js';

const ROOT = makeTmpRoot('drupal-healthcare');

// healthcare preset: standard (7) + blog (5) + healthcare (4) = 16 SDCs
const STANDARD_SDCS = [
  { name: 'node-teaser', group: 'node' },
  { name: 'content-grid', group: 'views' },
  { name: 'site-header', group: 'block' },
  { name: 'site-footer', group: 'block' },
  { name: 'breadcrumb', group: 'block' },
  { name: 'search-form', group: 'block' },
  { name: 'hero-banner', group: 'block' },
] as const;

const BLOG_SDCS = [
  { name: 'article-full', group: 'node' },
  { name: 'author-byline', group: 'node' },
  { name: 'related-articles', group: 'views' },
  { name: 'tag-cloud', group: 'block' },
  { name: 'newsletter-signup', group: 'block' },
] as const;

const HEALTHCARE_SPECIFIC_SDCS = [
  { name: 'provider-card', group: 'node' },
  { name: 'appointment-cta', group: 'block' },
  { name: 'condition-tag', group: 'block' },
  { name: 'medical-disclaimer', group: 'block' },
] as const;

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
      'test_healthcare.theme',
      'package.json',
      'composer.json',
      'css/style.css',
      'js/behaviors.js',
      'docker/docker-compose.yml',
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
    expect(info).toContain("path: 'components'");
  });

  it('creates all 16 SDC component directories across correct groups', async () => {
    const dir = path.join(ROOT, 'hc-count');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_count',
      directory: dir,
      preset: 'healthcare',
    });
    for (const sdc of ALL_HEALTHCARE_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('all healthcare-specific SDC directories are present', async () => {
    const dir = path.join(ROOT, 'hc-specific');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_specific',
      directory: dir,
      preset: 'healthcare',
    });
    for (const sdc of HEALTHCARE_SPECIFIC_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('inherits all blog SDC directories', async () => {
    const dir = path.join(ROOT, 'hc-blog');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_blog',
      directory: dir,
      preset: 'healthcare',
    });
    for (const sdc of BLOG_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('inherits all standard SDC directories', async () => {
    const dir = path.join(ROOT, 'hc-standard');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_standard',
      directory: dir,
      preset: 'healthcare',
    });
    for (const sdc of STANDARD_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('each SDC directory contains .component.yml, .twig, and .css files', async () => {
    const dir = path.join(ROOT, 'hc-sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_sdc_files',
      directory: dir,
      preset: 'healthcare',
    });
    for (const sdc of ALL_HEALTHCARE_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
        `components/${sdc.group}/${sdc.name}/${sdc.name}.twig`,
        `components/${sdc.group}/${sdc.name}/${sdc.name}.css`,
      ]);
    }
  });

  it('generates template override for provider-card', async () => {
    const dir = path.join(ROOT, 'hc-templates');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_tmpl',
      directory: dir,
      preset: 'healthcare',
    });
    await assertFilesExist(dir, ['templates/node/node--provider--teaser.html.twig']);
  });

  it('behaviors file uses once() pattern', async () => {
    const dir = path.join(ROOT, 'hc-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_behaviors',
      directory: dir,
      preset: 'healthcare',
    });
    const behaviors = await readText(dir, 'js/behaviors.js');
    expect(behaviors).toContain("once('");
    expect(behaviors).toContain('Drupal.behaviors');
  });
});
