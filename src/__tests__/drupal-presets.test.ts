import { describe, it, expect, afterAll } from 'vitest';
import { scaffoldDrupalTheme } from '../generators/drupal-theme.js';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

const TMP = path.join(os.tmpdir(), 'helix-drupal-test-' + Date.now());

afterAll(async () => {
  await fs.remove(TMP);
});

describe('drupal theme scaffolding', () => {
  it('scaffolds healthcare preset with correct structure', async () => {
    const dir = path.join(TMP, 'healthcare-theme');
    await scaffoldDrupalTheme({
      themeName: 'test_healthcare',
      directory: dir,
      preset: 'healthcare',
    });

    expect(fs.existsSync(path.join(dir, 'test_healthcare.info.yml'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'test_healthcare.libraries.yml'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'components'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true);
  });

  it('libraries.yml has global CSS entry', async () => {
    const dir = path.join(TMP, 'standard-theme');
    await scaffoldDrupalTheme({
      themeName: 'test_standard',
      directory: dir,
      preset: 'standard',
    });

    const librariesYml = fs.readFileSync(path.join(dir, 'test_standard.libraries.yml'), 'utf-8');
    expect(librariesYml).toContain('global:');
    expect(librariesYml).toContain('css/style.css');
  });

  it('libraries.yml has helix-overrides entry', async () => {
    const dir = path.join(TMP, 'standard-sdc-check');
    await scaffoldDrupalTheme({
      themeName: 'test_sdc_entries',
      directory: dir,
      preset: 'standard',
    });

    const librariesYml = fs.readFileSync(path.join(dir, 'test_sdc_entries.libraries.yml'), 'utf-8');
    expect(librariesYml).toContain('helix-overrides:');
    expect(librariesYml).toContain('css/helix-overrides.css');
  });

  it('behaviors use once() pattern', async () => {
    const dir = path.join(TMP, 'blog-theme');
    await scaffoldDrupalTheme({
      themeName: 'test_blog',
      directory: dir,
      preset: 'blog',
    });

    const behaviorContent = fs.readFileSync(path.join(dir, 'js', 'behaviors.js'), 'utf-8');
    expect(behaviorContent).toContain("once('");
    expect(behaviorContent).toContain('Drupal.behaviors');
  });

  it('behavior file is at js/behaviors.js', async () => {
    const dir = path.join(TMP, 'intranet-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_intranet_behaviors',
      directory: dir,
      preset: 'intranet',
    });

    expect(fs.existsSync(path.join(dir, 'js', 'behaviors.js'))).toBe(true);
  });

  it('package.json contains @helixui/drupal-starter', async () => {
    const dir = path.join(TMP, 'intranet-theme');
    await scaffoldDrupalTheme({
      themeName: 'test_intranet',
      directory: dir,
      preset: 'intranet',
    });

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toHaveProperty('@helixui/drupal-starter');
  });

  it('package.json contains @helixui/tokens', async () => {
    const dir = path.join(TMP, 'tokens-check');
    await scaffoldDrupalTheme({
      themeName: 'test_tokens',
      directory: dir,
      preset: 'standard',
    });

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toHaveProperty('@helixui/tokens');
  });

  it('each preset SDC has a component directory in the correct group', async () => {
    const dir = path.join(TMP, 'sdc-check');
    await scaffoldDrupalTheme({
      themeName: 'test_sdc',
      directory: dir,
      preset: 'standard',
    });

    // node group
    expect(fs.existsSync(path.join(dir, 'components', 'node', 'node-teaser'))).toBe(true);
    // views group
    expect(fs.existsSync(path.join(dir, 'components', 'views', 'content-grid'))).toBe(true);
    // block group
    expect(fs.existsSync(path.join(dir, 'components', 'block', 'site-header'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'components', 'block', 'site-footer'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'components', 'block', 'breadcrumb'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'components', 'block', 'search-form'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'components', 'block', 'hero-banner'))).toBe(true);
  });

  it('each SDC directory contains .component.yml, .twig, and .css files', async () => {
    const dir = path.join(TMP, 'sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_sdc_files',
      directory: dir,
      preset: 'standard',
    });

    const sdcDir = path.join(dir, 'components', 'node', 'node-teaser');
    expect(fs.existsSync(path.join(sdcDir, 'node-teaser.component.yml'))).toBe(true);
    expect(fs.existsSync(path.join(sdcDir, 'node-teaser.twig'))).toBe(true);
    expect(fs.existsSync(path.join(sdcDir, 'node-teaser.css'))).toBe(true);
  });

  it('component.yml has schema and status: experimental', async () => {
    const dir = path.join(TMP, 'sdc-yml');
    await scaffoldDrupalTheme({
      themeName: 'my_theme',
      directory: dir,
      preset: 'standard',
    });

    const yml = fs.readFileSync(
      path.join(dir, 'components', 'node', 'node-teaser', 'node-teaser.component.yml'),
      'utf-8',
    );
    expect(yml).toContain('$schema:');
    expect(yml).toContain('status: experimental');
    expect(yml).toContain('group:');
  });

  it('composer.json has type drupal-theme', async () => {
    const dir = path.join(TMP, 'composer-check');
    await scaffoldDrupalTheme({
      themeName: 'test_composer',
      directory: dir,
      preset: 'standard',
    });

    const composer = JSON.parse(fs.readFileSync(path.join(dir, 'composer.json'), 'utf-8')) as {
      type: string;
    };
    expect(composer.type).toBe('drupal-theme');
  });

  it('info.yml contains preset name in description', async () => {
    const dir = path.join(TMP, 'info-yml');
    await scaffoldDrupalTheme({
      themeName: 'test_info',
      directory: dir,
      preset: 'healthcare',
    });

    const infoYml = fs.readFileSync(path.join(dir, 'test_info.info.yml'), 'utf-8');
    expect(infoYml).toContain('healthcare');
    expect(infoYml).toContain('core_version_requirement: ^10 || ^11');
    expect(infoYml).toContain("path: 'components'");
  });

  it('healthcare preset SDCs are all present as component directories', async () => {
    const dir = path.join(TMP, 'healthcare-sdcs');
    await scaffoldDrupalTheme({
      themeName: 'test_hc_sdcs',
      directory: dir,
      preset: 'healthcare',
    });

    expect(fs.existsSync(path.join(dir, 'components', 'node', 'provider-card'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'components', 'block', 'appointment-cta'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'components', 'block', 'condition-tag'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'components', 'block', 'medical-disclaimer'))).toBe(true);
    // Also includes blog and standard SDCs
    expect(fs.existsSync(path.join(dir, 'components', 'node', 'article-full'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'components', 'node', 'node-teaser'))).toBe(true);
  });
});
