import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import {
  makeTmpRoot,
  removeTempDir,
  assertFilesExist,
  readText,
  listSubdirs,
} from '../setup.js';

const ROOT = makeTmpRoot('drupal-intranet');

// intranet preset: standard (7) + intranet-specific (4) = 11 SDCs
const STANDARD_SDCS = ['node-teaser', 'views-grid', 'hero-banner', 'site-header', 'site-footer', 'breadcrumb', 'search-form'];
const INTRANET_SPECIFIC_SDCS = ['dashboard-card', 'notification-banner', 'data-table-view', 'user-profile'];
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
      'helixui.libraries.yml',
      'package.json',
      'composer.json',
      'src/behaviors/intranet-behaviors.js',
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
  });

  it('creates exactly 11 SDC component directories', async () => {
    const dir = path.join(ROOT, 'int-count');
    await scaffoldDrupalTheme({
      themeName: 'test_int_count',
      directory: dir,
      preset: 'intranet',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    expect(sdcDirs).toHaveLength(11);
  });

  it('all intranet-specific SDC directories are present', async () => {
    const dir = path.join(ROOT, 'int-specific');
    await scaffoldDrupalTheme({
      themeName: 'test_int_specific',
      directory: dir,
      preset: 'intranet',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    for (const sdc of INTRANET_SPECIFIC_SDCS) {
      expect(sdcDirs).toContain(sdc);
    }
  });

  it('inherits all standard SDC directories', async () => {
    const dir = path.join(ROOT, 'int-standard');
    await scaffoldDrupalTheme({
      themeName: 'test_int_standard',
      directory: dir,
      preset: 'intranet',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    for (const sdc of STANDARD_SDCS) {
      expect(sdcDirs).toContain(sdc);
    }
  });

  it('does NOT include blog-specific SDCs', async () => {
    const dir = path.join(ROOT, 'int-no-blog');
    await scaffoldDrupalTheme({
      themeName: 'test_int_no_blog',
      directory: dir,
      preset: 'intranet',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    expect(sdcDirs).not.toContain('article-full');
    expect(sdcDirs).not.toContain('author-byline');
  });

  it('each SDC directory contains .component.yml and .twig files', async () => {
    const dir = path.join(ROOT, 'int-sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_int_sdc_files',
      directory: dir,
      preset: 'intranet',
    });
    for (const sdc of ALL_INTRANET_SDCS) {
      await assertFilesExist(dir, [
        `src/components/${sdc}/${sdc}.component.yml`,
        `src/components/${sdc}/${sdc}.twig`,
      ]);
    }
  });

  it('helixui.libraries.yml contains intranet-specific SDC entries with CDN provider', async () => {
    const dir = path.join(ROOT, 'int-libs');
    await scaffoldDrupalTheme({
      themeName: 'test_int_libs',
      directory: dir,
      preset: 'intranet',
    });
    const libs = await readText(dir, 'helixui.libraries.yml');
    expect(libs).toContain('provider: cdn');
    for (const sdc of INTRANET_SPECIFIC_SDCS) {
      expect(libs).toContain(`helixui.${sdc}:`);
    }
  });

  it('behaviors file uses once() pattern and is named intranet-behaviors.js', async () => {
    const dir = path.join(ROOT, 'int-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_int_behaviors',
      directory: dir,
      preset: 'intranet',
    });
    const behaviors = await readText(dir, 'src/behaviors/intranet-behaviors.js');
    expect(behaviors).toContain("once('");
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
