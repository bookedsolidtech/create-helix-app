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
      expect(await fs.pathExists(path.join(dir, `${themeName}.theme`))).toBe(true);
      expect(await fs.pathExists(path.join(dir, 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(dir, 'composer.json'))).toBe(true);
      expect(await fs.pathExists(path.join(dir, 'js', 'behaviors.js'))).toBe(true);
      expect(await fs.pathExists(path.join(dir, 'css', 'style.css'))).toBe(true);
      expect(await fs.pathExists(path.join(dir, 'docker', 'docker-compose.yml'))).toBe(true);
    }, 120_000);

    it('creates all expected SDC component directories', async () => {
      for (const sdc of preset.sdcList) {
        const sdcDir = path.join(dir, 'components', sdc.group, sdc.name);
        expect(await fs.pathExists(sdcDir)).toBe(true);
      }
    }, 120_000);

    it('every SDC directory contains .component.yml, .twig, and .css files', async () => {
      for (const sdc of preset.sdcList) {
        const base = path.join(dir, 'components', sdc.group, sdc.name);
        expect(await fs.pathExists(path.join(base, `${sdc.name}.component.yml`))).toBe(true);
        expect(await fs.pathExists(path.join(base, `${sdc.name}.twig`))).toBe(true);
        expect(await fs.pathExists(path.join(base, `${sdc.name}.css`))).toBe(true);
      }
    }, 120_000);

    it('package.json contains all preset-specific dependencies', async () => {
      const pkgRaw = await fs.readFile(path.join(dir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { dependencies: Record<string, string> };

      for (const dep of Object.keys(preset.dependencies)) {
        expect(pkg.dependencies).toHaveProperty(dep);
      }
    }, 120_000);

    it('{themeName}.libraries.yml has global and helix-overrides entries', async () => {
      const libs = await fs.readFile(path.join(dir, `${themeName}.libraries.yml`), 'utf-8');
      expect(libs).toContain('global:');
      expect(libs).toContain('css/style.css');
      expect(libs).toContain('helix-overrides:');
      expect(libs).toContain('css/helix-overrides.css');
    }, 120_000);

    it('info.yml declares correct Drupal metadata', async () => {
      const info = await fs.readFile(path.join(dir, `${themeName}.info.yml`), 'utf-8');
      expect(info).toContain('type: theme');
      expect(info).toContain('core_version_requirement: ^10 || ^11');
      expect(info).toContain(presetId);
      expect(info).toContain('components:');
      expect(info).toContain("path: 'components'");
    }, 120_000);

    it('composer.json declares drupal-theme type', async () => {
      const composer = await fs.readFile(path.join(dir, 'composer.json'), 'utf-8');
      expect(composer).toContain('"type": "drupal-theme"');
    }, 120_000);

    it('behaviors file uses Drupal.behaviors and once() pattern', async () => {
      const behaviors = await fs.readFile(path.join(dir, 'js', 'behaviors.js'), 'utf-8');
      expect(behaviors).toContain('Drupal.behaviors');
      expect(behaviors).toContain("once('");
    }, 120_000);

    it('component.yml files have SDC schema and status: experimental', async () => {
      // Check first SDC as representative sample
      const firstSdc = preset.sdcList[0];
      const yml = await fs.readFile(
        path.join(
          dir,
          'components',
          firstSdc.group,
          firstSdc.name,
          `${firstSdc.name}.component.yml`,
        ),
        'utf-8',
      );
      expect(yml).toContain('$schema:');
      expect(yml).toContain('status: experimental');
      expect(yml).toContain('group:');
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
