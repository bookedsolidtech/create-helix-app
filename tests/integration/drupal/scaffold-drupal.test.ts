import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { getPreset, isValidPreset, PRESETS } from '../../../src/presets/loader.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText, listSubdirs } from '../setup.js';
import type { DrupalPreset } from '../../../src/types.js';

const ROOT = makeTmpRoot('drupal-scaffold-all');

afterAll(async () => {
  await removeTempDir(ROOT);
});

/* -------------------------------------------------------------------------- */
/*  Cross-preset scaffold tests                                               */
/* -------------------------------------------------------------------------- */

const ALL_PRESETS: DrupalPreset[] = ['standard', 'blog', 'healthcare', 'intranet'];

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
        'helixui.libraries.yml',
        'package.json',
        'composer.json',
        `src/behaviors/${presetId}-behaviors.js`,
      ]);
    });

    it('info.yml declares type theme and Drupal 10/11 compatibility', async () => {
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
    });

    it('libraries.yml references the theme global library', async () => {
      const dir = path.join(ROOT, `${presetId}-themelib`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_lib`,
        directory: dir,
        preset: presetId,
      });
      const libs = await readText(dir, `test_${presetId}_lib.libraries.yml`);
      expect(libs).toContain('global:');
      expect(libs).toContain('css/style.css');
    });

    it('SDC directories exactly match the preset sdcList', async () => {
      const dir = path.join(ROOT, `${presetId}-sdcdirs`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_sdc`,
        directory: dir,
        preset: presetId,
      });
      const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
      expect(sdcDirs.sort()).toEqual([...preset.sdcList].sort());
    });

    it('every SDC directory contains .component.yml and .twig', async () => {
      const dir = path.join(ROOT, `${presetId}-sdcfiles`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_sdcf`,
        directory: dir,
        preset: presetId,
      });
      for (const sdc of preset.sdcList) {
        await assertFilesExist(dir, [
          `src/components/${sdc}/${sdc}.component.yml`,
          `src/components/${sdc}/${sdc}.twig`,
        ]);
      }
    });

    it('helixui.libraries.yml has CDN provider and entry per SDC', async () => {
      const dir = path.join(ROOT, `${presetId}-helixlibs`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_hl`,
        directory: dir,
        preset: presetId,
      });
      const libs = await readText(dir, 'helixui.libraries.yml');
      expect(libs).toContain('provider: cdn');
      expect(libs).toContain('helixui.base:');
      for (const sdc of preset.sdcList) {
        expect(libs).toContain(`helixui.${sdc}:`);
      }
    });

    it('component.yml files reference the correct theme library', async () => {
      const dir = path.join(ROOT, `${presetId}-ymlref`);
      const themeName = `ref_${presetId}`;
      await scaffoldDrupalTheme({ themeName, directory: dir, preset: presetId });
      // Check first SDC as representative
      const firstSdc = preset.sdcList[0];
      const yml = await readText(dir, `src/components/${firstSdc}/${firstSdc}.component.yml`);
      expect(yml).toContain(`${themeName}/helixui.${firstSdc}`);
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

    it('behaviors file uses once() pattern', async () => {
      const dir = path.join(ROOT, `${presetId}-beh`);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}_beh`,
        directory: dir,
        preset: presetId,
      });
      const behaviors = await readText(dir, `src/behaviors/${presetId}-behaviors.js`);
      expect(behaviors).toContain("once('");
      expect(behaviors).toContain('Drupal.behaviors');
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Preset hierarchy tests                                                    */
/* -------------------------------------------------------------------------- */

describe('drupal preset SDC hierarchy', () => {
  const standardSdcs = getPreset('standard').sdcList;
  const blogSdcs = getPreset('blog').sdcList;

  it('blog preset includes all standard SDCs', () => {
    for (const sdc of standardSdcs) {
      expect(blogSdcs).toContain(sdc);
    }
  });

  it('healthcare preset includes all blog SDCs', () => {
    const healthcareSdcs = getPreset('healthcare').sdcList;
    for (const sdc of blogSdcs) {
      expect(healthcareSdcs).toContain(sdc);
    }
  });

  it('intranet preset includes all standard SDCs but not blog-specific ones', () => {
    const intranetSdcs = getPreset('intranet').sdcList;
    for (const sdc of standardSdcs) {
      expect(intranetSdcs).toContain(sdc);
    }
    // blog-specific SDCs should NOT be in intranet
    const blogOnly = blogSdcs.filter((s) => !standardSdcs.includes(s));
    for (const sdc of blogOnly) {
      expect(intranetSdcs).not.toContain(sdc);
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

  it('isValidPreset accepts all four valid presets', () => {
    for (const presetId of ALL_PRESETS) {
      expect(isValidPreset(presetId)).toBe(true);
    }
  });

  it('PRESETS array contains exactly 4 entries', () => {
    expect(PRESETS).toHaveLength(4);
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
