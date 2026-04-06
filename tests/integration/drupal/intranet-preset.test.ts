import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText } from '../setup.js';

const ROOT = makeTmpRoot('drupal-intranet');

// intranet preset: standard (7) + intranet-specific (4) = 11 SDCs
const STANDARD_SDCS = [
  { name: 'node-teaser', group: 'node' },
  { name: 'content-grid', group: 'views' },
  { name: 'site-header', group: 'block' },
  { name: 'site-footer', group: 'block' },
  { name: 'breadcrumb', group: 'block' },
  { name: 'search-form', group: 'block' },
  { name: 'hero-banner', group: 'block' },
] as const;

const INTRANET_SPECIFIC_SDCS = [
  { name: 'dashboard-card', group: 'block' },
  { name: 'notification-banner', group: 'block' },
  { name: 'data-table-view', group: 'views' },
  { name: 'user-profile', group: 'block' },
] as const;

const ALL_INTRANET_SDCS = [...STANDARD_SDCS, ...INTRANET_SPECIFIC_SDCS];

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('drupal intranet preset integration', () => {
  it('generates all required theme files', async () => {
    const dir = path.join(ROOT, 'int-files');
    await scaffoldDrupalTheme({
      themeName: 'test_intranet',
      directory: dir,
      preset: 'intranet',
    });
    await assertFilesExist(dir, [
      'test_intranet.info.yml',
      'test_intranet.libraries.yml',
      'test_intranet.theme',
      'package.json',
      'composer.json',
      'css/style.css',
      'js/behaviors.js',
      'docker/docker-compose.yml',
    ]);
  });

  it('theme info YAML contains intranet preset reference', async () => {
    const dir = path.join(ROOT, 'int-info');
    await scaffoldDrupalTheme({
      themeName: 'test_int_info',
      directory: dir,
      preset: 'intranet',
    });
    const info = await readText(dir, 'test_int_info.info.yml');
    expect(info).toContain('intranet');
    expect(info).toContain('core_version_requirement: ^10 || ^11');
    expect(info).toContain("path: 'components'");
  });

  it('creates all 11 SDC component directories across correct groups', async () => {
    const dir = path.join(ROOT, 'int-count');
    await scaffoldDrupalTheme({
      themeName: 'test_int_count',
      directory: dir,
      preset: 'intranet',
    });
    for (const sdc of ALL_INTRANET_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('all intranet-specific SDC directories are present', async () => {
    const dir = path.join(ROOT, 'int-specific');
    await scaffoldDrupalTheme({
      themeName: 'test_int_specific',
      directory: dir,
      preset: 'intranet',
    });
    for (const sdc of INTRANET_SPECIFIC_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('inherits all standard SDC directories', async () => {
    const dir = path.join(ROOT, 'int-standard');
    await scaffoldDrupalTheme({
      themeName: 'test_int_standard',
      directory: dir,
      preset: 'intranet',
    });
    for (const sdc of STANDARD_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('does NOT include blog-specific SDCs', async () => {
    const dir = path.join(ROOT, 'int-no-blog');
    await scaffoldDrupalTheme({
      themeName: 'test_int_no_blog',
      directory: dir,
      preset: 'intranet',
    });
    expect(fs.existsSync(path.join(dir, 'components/node/article-full'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'components/node/author-byline'))).toBe(false);
  });

  it('each SDC directory contains .component.yml, .twig, and .css files', async () => {
    const dir = path.join(ROOT, 'int-sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_int_sdc_files',
      directory: dir,
      preset: 'intranet',
    });
    for (const sdc of ALL_INTRANET_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
        `components/${sdc.group}/${sdc.name}/${sdc.name}.twig`,
        `components/${sdc.group}/${sdc.name}/${sdc.name}.css`,
      ]);
    }
  });

  it('behaviors file uses once() pattern', async () => {
    const dir = path.join(ROOT, 'int-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_int_behaviors',
      directory: dir,
      preset: 'intranet',
    });
    const behaviors = await readText(dir, 'js/behaviors.js');
    expect(behaviors).toContain("once('");
    expect(behaviors).toContain('Drupal.behaviors');
  });

  it('package.json has @helixui/drupal-starter and @helixui/tokens', async () => {
    const dir = path.join(ROOT, 'int-pkg');
    await scaffoldDrupalTheme({
      themeName: 'test_int_pkg',
      directory: dir,
      preset: 'intranet',
    });
    const pkg = await readText(dir, 'package.json');
    expect(pkg).toContain('@helixui/drupal-starter');
    expect(pkg).toContain('@helixui/tokens');
  });
});
