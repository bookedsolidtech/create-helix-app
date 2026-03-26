import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText, listSubdirs } from '../setup.js';

const ROOT = makeTmpRoot('drupal-standard');

// standard preset: 7 SDCs
const STANDARD_SDCS = [
  'node-teaser',
  'views-grid',
  'hero-banner',
  'site-header',
  'site-footer',
  'breadcrumb',
  'search-form',
];

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('drupal standard preset integration', () => {
  it('generates all required theme files', async () => {
    const dir = path.join(ROOT, 'std-files');
    await scaffoldDrupalTheme({ themeName: 'test_standard', directory: dir, preset: 'standard' });
    await assertFilesExist(dir, [
      'test_standard.info.yml',
      'test_standard.libraries.yml',
      'helixui.libraries.yml',
      'package.json',
      'composer.json',
      'src/behaviors/standard-behaviors.js',
    ]);
  });

  it('theme info YAML is valid Drupal 10/11 format', async () => {
    const dir = path.join(ROOT, 'std-info');
    await scaffoldDrupalTheme({ themeName: 'test_std_info', directory: dir, preset: 'standard' });
    const info = await readText(dir, 'test_std_info.info.yml');
    expect(info).toContain('core_version_requirement: ^10 || ^11');
    expect(info).toContain('type: theme');
    expect(info).toContain('standard');
  });

  it('helixui.libraries.yml has CDN provider entries', async () => {
    const dir = path.join(ROOT, 'std-libs');
    await scaffoldDrupalTheme({ themeName: 'test_std_libs', directory: dir, preset: 'standard' });
    const libs = await readText(dir, 'helixui.libraries.yml');
    expect(libs).toContain('provider: cdn');
    expect(libs).toContain('helixui.base:');
  });

  it('helixui.libraries.yml contains all standard SDC entries', async () => {
    const dir = path.join(ROOT, 'std-sdc-libs');
    await scaffoldDrupalTheme({
      themeName: 'test_std_sdc_libs',
      directory: dir,
      preset: 'standard',
    });
    const libs = await readText(dir, 'helixui.libraries.yml');
    for (const sdc of STANDARD_SDCS) {
      expect(libs).toContain(`helixui.${sdc}:`);
    }
  });

  it('creates exactly 7 SDC component directories', async () => {
    const dir = path.join(ROOT, 'std-count');
    await scaffoldDrupalTheme({ themeName: 'test_std_count', directory: dir, preset: 'standard' });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    expect(sdcDirs).toHaveLength(7);
  });

  it('all 7 standard SDC directories are present', async () => {
    const dir = path.join(ROOT, 'std-sdcs');
    await scaffoldDrupalTheme({ themeName: 'test_std_sdcs', directory: dir, preset: 'standard' });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    for (const sdc of STANDARD_SDCS) {
      expect(sdcDirs).toContain(sdc);
    }
  });

  it('each SDC directory contains .component.yml and .twig files', async () => {
    const dir = path.join(ROOT, 'std-sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_std_sdc_files',
      directory: dir,
      preset: 'standard',
    });
    for (const sdc of STANDARD_SDCS) {
      await assertFilesExist(dir, [
        `src/components/${sdc}/${sdc}.component.yml`,
        `src/components/${sdc}/${sdc}.twig`,
      ]);
    }
  });

  it('component.yml references the theme library', async () => {
    const dir = path.join(ROOT, 'std-yml-ref');
    await scaffoldDrupalTheme({ themeName: 'my_theme', directory: dir, preset: 'standard' });
    const yml = await readText(dir, 'src/components/node-teaser/node-teaser.component.yml');
    expect(yml).toContain('my_theme/helixui.node-teaser');
  });

  it('composer.json has type drupal-theme', async () => {
    const dir = path.join(ROOT, 'std-composer');
    await scaffoldDrupalTheme({
      themeName: 'test_std_composer',
      directory: dir,
      preset: 'standard',
    });
    const composer = await readText(dir, 'composer.json');
    expect(composer).toContain('"type": "drupal-theme"');
  });

  it('behaviors file uses once() pattern', async () => {
    const dir = path.join(ROOT, 'std-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_std_behaviors',
      directory: dir,
      preset: 'standard',
    });
    const behaviors = await readText(dir, 'src/behaviors/standard-behaviors.js');
    expect(behaviors).toContain("once('");
  });
});
