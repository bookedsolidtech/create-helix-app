import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { scaffoldDrupalTheme } from '../../src/generators/drupal-theme.js';
import { getPreset, VALID_PRESETS } from '../../src/presets/loader.js';
import type { DrupalPreset, PresetConfig } from '../../src/types.js';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const ROOT = path.join(os.tmpdir(), `helix-e2e-preset-scaffold-${Date.now()}`);

afterAll(async () => {
  await fs.remove(ROOT);
});

/* -------------------------------------------------------------------------- */
/*  E2E preset scaffold verification for all Drupal presets                    */
/* -------------------------------------------------------------------------- */

describe('E2E: drupal preset scaffold verification', () => {
  describe.each(VALID_PRESETS)('preset: %s', (presetId: DrupalPreset) => {
    const preset: PresetConfig = getPreset(presetId);
    const themeName = `e2e_${presetId}`;
    const dir = path.join(ROOT, presetId);

    // Scaffold once per preset, all assertions share the result
    it('scaffolds successfully and produces a valid project structure', async () => {
      await scaffoldDrupalTheme({
        themeName,
        directory: dir,
        preset: presetId,
      });

      // Root-level theme files
      expect(await fs.pathExists(path.join(dir, `${themeName}.info.yml`))).toBe(true);
      expect(await fs.pathExists(path.join(dir, `${themeName}.libraries.yml`))).toBe(true);
      expect(await fs.pathExists(path.join(dir, 'helixui.libraries.yml'))).toBe(true);
      expect(await fs.pathExists(path.join(dir, 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(dir, 'composer.json'))).toBe(true);
      expect(
        await fs.pathExists(path.join(dir, 'src', 'behaviors', `${presetId}-behaviors.js`)),
      ).toBe(true);
    }, 120_000);

    it('creates all expected SDC component directories', async () => {
      const componentsDir = path.join(dir, 'src', 'components');
      const entries = await fs.readdir(componentsDir, { withFileTypes: true });
      const sdcDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      expect(sdcDirs.sort()).toEqual([...preset.sdcList].sort());
    }, 120_000);

    it('every SDC directory contains .component.yml and .twig files', async () => {
      for (const sdc of preset.sdcList) {
        const ymlPath = path.join(dir, 'src', 'components', sdc, `${sdc}.component.yml`);
        const twigPath = path.join(dir, 'src', 'components', sdc, `${sdc}.twig`);
        expect(await fs.pathExists(ymlPath)).toBe(true);
        expect(await fs.pathExists(twigPath)).toBe(true);
      }
    }, 120_000);

    it('package.json contains all preset-specific dependencies', async () => {
      const pkgRaw = await fs.readFile(path.join(dir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { dependencies: Record<string, string> };

      for (const dep of Object.keys(preset.dependencies)) {
        expect(pkg.dependencies).toHaveProperty(dep);
      }
    }, 120_000);

    it('helixui.libraries.yml contains entries for every SDC', async () => {
      const libs = await fs.readFile(path.join(dir, 'helixui.libraries.yml'), 'utf-8');
      expect(libs).toContain('provider: cdn');
      expect(libs).toContain('helixui.base:');
      for (const sdc of preset.sdcList) {
        expect(libs).toContain(`helixui.${sdc}:`);
      }
    }, 120_000);

    it('info.yml declares correct Drupal metadata', async () => {
      const info = await fs.readFile(path.join(dir, `${themeName}.info.yml`), 'utf-8');
      expect(info).toContain('type: theme');
      expect(info).toContain('core_version_requirement: ^10 || ^11');
      expect(info).toContain(presetId);
    }, 120_000);

    it('composer.json declares drupal-theme type', async () => {
      const composer = await fs.readFile(path.join(dir, 'composer.json'), 'utf-8');
      expect(composer).toContain('"type": "drupal-theme"');
    }, 120_000);

    it('behaviors file uses Drupal.behaviors and once() pattern', async () => {
      const behaviors = await fs.readFile(
        path.join(dir, 'src', 'behaviors', `${presetId}-behaviors.js`),
        'utf-8',
      );
      expect(behaviors).toContain('Drupal.behaviors');
      expect(behaviors).toContain("once('");
    }, 120_000);

    it('component.yml files reference the theme library correctly', async () => {
      // Check first SDC as representative sample
      const firstSdc = preset.sdcList[0];
      const yml = await fs.readFile(
        path.join(dir, 'src', 'components', firstSdc, `${firstSdc}.component.yml`),
        'utf-8',
      );
      expect(yml).toContain(`${themeName}/helixui.${firstSdc}`);
    }, 120_000);
  });
});

/* -------------------------------------------------------------------------- */
/*  Ecommerce-specific: extra dependency and template vars                     */
/* -------------------------------------------------------------------------- */

describe('E2E: ecommerce preset has additional dependencies', () => {
  it('package.json includes @helixui/commerce', async () => {
    const dir = path.join(ROOT, 'ecommerce');
    const pkgRaw = await fs.readFile(path.join(dir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toHaveProperty('@helixui/commerce');
  }, 120_000);
});
