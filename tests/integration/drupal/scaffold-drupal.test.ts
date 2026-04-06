import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { getPreset, isValidPreset, PRESETS } from '../../../src/presets/loader.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText } from '../setup.js';
import type { DrupalPreset } from '../../../src/types.js';

const ROOT = makeTmpRoot('drupal-scaffold-all');

afterAll(async () => {
  await removeTempDir(ROOT);
});

/* -------------------------------------------------------------------------- */
/*  Cross-preset scaffold tests                                               */
/* -------------------------------------------------------------------------- */

const ALL_PRESETS: DrupalPreset[] = ['standard', 'blog', 'healthcare', 'intranet', 'ecommerce'];

describe('drupal theme scaffolding — all presets', () => {
  describe.each(ALL_PRESETS)('preset: %s', (presetId) => {
    const preset = getPreset(presetId);

    it('produces expected root theme files', async () => {
      const dir = path.join(ROOT, `${presetId}-root`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}`,
        directory: dir,
        preset: presetId,
      });
      await assertFilesExist(dir, [
        `test_${presetId}.info.yml`,
        `test_${presetId}.libraries.yml`,
        `test_${presetId}.theme`,
        'package.json',
        'composer.json',
        'css/style.css',
        'js/behaviors.js',
        'docker/docker-compose.yml',
      ]);
    });

    it('info.yml declares type theme, Drupal 10/11 compat, and SDC path', async () => {
      const dir = path.join(ROOT, `${presetId}-info`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_info`,
        directory: dir,
        preset: presetId,
      });
      const info = await readText(dir, `test_${presetId}_info.info.yml`);
      expect(info).toContain('type: theme');
      expect(info).toContain('core_version_requirement: ^10 || ^11');
      expect(info).toContain(presetId);
      expect(info).toContain('components:');
      expect(info).toContain("path: 'components'");
    });

    it('libraries.yml has global and helix-overrides CSS entries', async () => {
      const dir = path.join(ROOT, `${presetId}-themelib`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_lib`,
        directory: dir,
        preset: presetId,
      });
      const libs = await readText(dir, `test_${presetId}_lib.libraries.yml`);
      expect(libs).toContain('global:');
      expect(libs).toContain('css/style.css');
      expect(libs).toContain('helix-overrides:');
    });

    it('all SDCs exist at components/{group}/{name}/ path', async () => {
      const dir = path.join(ROOT, `${presetId}-sdcdirs`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_sdc`,
        directory: dir,
        preset: presetId,
      });
      for (const sdc of preset.sdcList) {
        const ymlPath = path.join(
          dir,
          'components',
          sdc.group,
          sdc.name,
          `${sdc.name}.component.yml`,
        );
        expect(fs.existsSync(ymlPath), `Missing: components/${sdc.group}/${sdc.name}/`).toBe(true);
      }
    });

    it('every SDC directory contains .component.yml, .twig, and .css', async () => {
      const dir = path.join(ROOT, `${presetId}-sdcfiles`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_sdcf`,
        directory: dir,
        preset: presetId,
      });
      for (const sdc of preset.sdcList) {
        await assertFilesExist(dir, [
          `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
          `components/${sdc.group}/${sdc.name}/${sdc.name}.twig`,
          `components/${sdc.group}/${sdc.name}/${sdc.name}.css`,
        ]);
      }
    });

    it('component.yml files have SDC schema, status, and group', async () => {
      const dir = path.join(ROOT, `${presetId}-ymlref`);
      const themeName = `ref_${presetId}`;
      await scaffoldDrupalTheme({ themeName, directory: dir, preset: presetId });
      const firstSdc = preset.sdcList[0];
      const yml = await readText(
        dir,
        `components/${firstSdc.group}/${firstSdc.name}/${firstSdc.name}.component.yml`,
      );
      expect(yml).toContain('$schema:');
      expect(yml).toContain('status: experimental');
      expect(yml).toContain('group:');
    });

    it('composer.json has type drupal-theme', async () => {
      const dir = path.join(ROOT, `${presetId}-composer`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_comp`,
        directory: dir,
        preset: presetId,
      });
      const composer = await readText(dir, 'composer.json');
      expect(composer).toContain('"type": "drupal-theme"');
    });

    it('package.json lists preset dependencies', async () => {
      const dir = path.join(ROOT, `${presetId}-pkg`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_pkg`,
        directory: dir,
        preset: presetId,
      });
      const pkg = await readText(dir, 'package.json');
      for (const dep of Object.keys(preset.dependencies)) {
        expect(pkg).toContain(dep);
      }
    });

    it('behaviors file uses once() pattern and Drupal.behaviors', async () => {
      const dir = path.join(ROOT, `${presetId}-beh`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_beh`,
        directory: dir,
        preset: presetId,
      });
      const behaviors = await readText(dir, 'js/behaviors.js');
      expect(behaviors).toContain("once('");
      expect(behaviors).toContain('Drupal.behaviors');
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Preset hierarchy tests                                                    */
/* -------------------------------------------------------------------------- */

describe('drupal preset SDC hierarchy', () => {
  const standardNames = getPreset('standard').sdcList.map((s) => s.name);
  const blogNames = getPreset('blog').sdcList.map((s) => s.name);

  it('blog preset includes all standard SDCs', () => {
    for (const name of standardNames) {
      expect(blogNames).toContain(name);
    }
  });

  it('healthcare preset includes all blog SDCs', () => {
    const healthcareNames = getPreset('healthcare').sdcList.map((s) => s.name);
    for (const name of blogNames) {
      expect(healthcareNames).toContain(name);
    }
  });

  it('intranet preset includes all standard SDCs but not blog-specific ones', () => {
    const intranetNames = getPreset('intranet').sdcList.map((s) => s.name);
    for (const name of standardNames) {
      expect(intranetNames).toContain(name);
    }
    // blog-specific SDCs should NOT be in intranet
    const blogOnly = blogNames.filter((n) => !standardNames.includes(n));
    for (const name of blogOnly) {
      expect(intranetNames).not.toContain(name);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Edge cases                                                                */
/* -------------------------------------------------------------------------- */

describe('drupal scaffolding edge cases', () => {
  it('getPreset throws for an invalid preset name', () => {
    expect(() => getPreset('nonexistent' as DrupalPreset)).toThrow(/Unknown preset/);
  });

  it('isValidPreset rejects invalid names', () => {
    expect(isValidPreset('nonexistent')).toBe(false);
    expect(isValidPreset('')).toBe(false);
    expect(isValidPreset('STANDARD')).toBe(false);
  });

  it('isValidPreset accepts all five valid presets', () => {
    for (const presetId of ALL_PRESETS) {
      expect(isValidPreset(presetId)).toBe(true);
    }
  });

  it('PRESETS array contains exactly 5 entries', () => {
    expect(PRESETS).toHaveLength(5);
  });

  it('theme name with underscores scaffolds correctly', async () => {
    const dir = path.join(ROOT, 'edge-underscore');
    await scaffoldDrupalTheme({
      themeName: 'my_custom_theme',
      directory: dir,
      preset: 'standard',
    });
    await assertFilesExist(dir, ['my_custom_theme.info.yml', 'my_custom_theme.libraries.yml']);
    const info = await readText(dir, 'my_custom_theme.info.yml');
    expect(info).toContain("name: 'My Custom Theme'");
  });

  it('theme name with digits scaffolds correctly', async () => {
    const dir = path.join(ROOT, 'edge-digits');
    await scaffoldDrupalTheme({
      themeName: 'theme2024',
      directory: dir,
      preset: 'standard',
    });
    await assertFilesExist(dir, ['theme2024.info.yml']);
  });

  it('scaffoldDrupalTheme rejects paths with traversal sequences', async () => {
    await expect(
      scaffoldDrupalTheme({
        themeName: 'test_traversal',
        directory: 'foo/../../etc/evil',
        preset: 'standard',
      }),
    ).rejects.toThrow(/traversal/i);
  });
});
