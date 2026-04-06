import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText } from '../setup.js';

const ROOT = makeTmpRoot('drupal-standard');

// standard preset: 7 SDCs with groups
const STANDARD_SDCS = [
  { name: 'node-teaser', group: 'node' },
  { name: 'content-grid', group: 'views' },
  { name: 'site-header', group: 'block' },
  { name: 'site-footer', group: 'block' },
  { name: 'breadcrumb', group: 'block' },
  { name: 'search-form', group: 'block' },
  { name: 'hero-banner', group: 'block' },
] as const;

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
      'test_standard.theme',
      'package.json',
      'composer.json',
      'css/style.css',
      'js/behaviors.js',
      'docker/docker-compose.yml',
    ]);
  });

  it('theme info YAML is valid Drupal 11 format with SDC path declaration', async () => {
    const dir = path.join(ROOT, 'std-info');
    await scaffoldDrupalTheme({ themeName: 'test_std_info', directory: dir, preset: 'standard' });
    const info = await readText(dir, 'test_std_info.info.yml');
    expect(info).toContain('core_version_requirement: ^10 || ^11');
    expect(info).toContain('type: theme');
    expect(info).toContain('standard');
    expect(info).toContain('components:');
    expect(info).toContain("path: 'components'");
  });

  it('{themeName}.libraries.yml has global and helix-overrides entries', async () => {
    const dir = path.join(ROOT, 'std-libs');
    await scaffoldDrupalTheme({ themeName: 'test_std_libs', directory: dir, preset: 'standard' });
    const libs = await readText(dir, 'test_std_libs.libraries.yml');
    expect(libs).toContain('global:');
    expect(libs).toContain('css/style.css');
    expect(libs).toContain('helix-overrides:');
  });

  it('creates all 7 standard SDC component directories in correct groups', async () => {
    const dir = path.join(ROOT, 'std-count');
    await scaffoldDrupalTheme({ themeName: 'test_std_count', directory: dir, preset: 'standard' });
    for (const sdc of STANDARD_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('each SDC directory contains .component.yml, .twig, and .css files', async () => {
    const dir = path.join(ROOT, 'std-sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_std_sdc_files',
      directory: dir,
      preset: 'standard',
    });
    for (const sdc of STANDARD_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
        `components/${sdc.group}/${sdc.name}/${sdc.name}.twig`,
        `components/${sdc.group}/${sdc.name}/${sdc.name}.css`,
      ]);
    }
  });

  it('component.yml has SDC schema, status experimental, and group field', async () => {
    const dir = path.join(ROOT, 'std-yml');
    await scaffoldDrupalTheme({ themeName: 'my_theme', directory: dir, preset: 'standard' });
    const yml = await readText(dir, 'components/node/node-teaser/node-teaser.component.yml');
    expect(yml).toContain('$schema:');
    expect(yml).toContain('status: experimental');
    expect(yml).toContain('group:');
    expect(yml).toContain('Node Display');
  });

  it('node-teaser twig uses attach_library and hx-card', async () => {
    const dir = path.join(ROOT, 'std-twig');
    await scaffoldDrupalTheme({ themeName: 'test_twig', directory: dir, preset: 'standard' });
    const twig = await readText(dir, 'components/node/node-teaser/node-teaser.twig');
    expect(twig).toContain("attach_library('helixui/hx-card')");
    expect(twig).toContain('<hx-card');
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

  it('behaviors file uses once() pattern and Drupal.behaviors', async () => {
    const dir = path.join(ROOT, 'std-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_std_behaviors',
      directory: dir,
      preset: 'standard',
    });
    const behaviors = await readText(dir, 'js/behaviors.js');
    expect(behaviors).toContain("once('");
    expect(behaviors).toContain('Drupal.behaviors');
  });

  it('generates template overrides for SDCs with templateOverride', async () => {
    const dir = path.join(ROOT, 'std-templates');
    await scaffoldDrupalTheme({ themeName: 'test_tmpl', directory: dir, preset: 'standard' });
    await assertFilesExist(dir, [
      'templates/node/node--article--teaser.html.twig',
      'templates/block/block--system-branding-block.html.twig',
      'templates/views/views-view--content.html.twig',
    ]);
  });

  it('template override includes the SDC', async () => {
    const dir = path.join(ROOT, 'std-tmpl-content');
    await scaffoldDrupalTheme({ themeName: 'my_theme', directory: dir, preset: 'standard' });
    const tpl = await readText(dir, 'templates/node/node--article--teaser.html.twig');
    expect(tpl).toContain("include('my_theme:node-teaser')");
  });

  it('docker-compose.yml references drupal:11-apache and the theme', async () => {
    const dir = path.join(ROOT, 'std-docker');
    await scaffoldDrupalTheme({ themeName: 'my_std_theme', directory: dir, preset: 'standard' });
    const compose = await readText(dir, 'docker/docker-compose.yml');
    expect(compose).toContain('drupal:11-apache');
    expect(compose).toContain('my_std_theme');
  });

  it('{themeName}.theme contains PHP preprocess stubs', async () => {
    const dir = path.join(ROOT, 'std-theme-php');
    await scaffoldDrupalTheme({ themeName: 'test_theme', directory: dir, preset: 'standard' });
    const php = await readText(dir, 'test_theme.theme');
    expect(php).toContain('<?php');
    expect(php).toContain('function test_theme_preprocess_');
  });
});
