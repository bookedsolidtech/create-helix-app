/**
 * E2E scaffold verification for all Drupal presets.
 *
 * Scaffolds a complete Drupal theme for each preset and validates:
 * - All expected files are generated
 * - Preset-specific SDC directories and files exist
 * - package.json contains preset-specific dependencies
 * - Config files (info.yml, libraries.yml, composer.json) are structurally valid
 * - Preset hierarchy is reflected in the output
 */

import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { scaffoldDrupalTheme } from '../../src/generators/drupal-theme.js';
import { getPreset, PRESETS } from '../../src/presets/loader.js';
import type { DrupalPreset, PresetConfig } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const ROOT = path.join(os.tmpdir(), `helix-e2e-presets-${Date.now()}`);

afterAll(async () => {
  await fs.remove(ROOT);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function scaffoldPreset(presetId: DrupalPreset, suffix: string): Promise<string> {
  const dir = path.join(ROOT, `${presetId}-${suffix}`);
  await scaffoldDrupalTheme({
    themeName: `e2e_${presetId}`,
    directory: dir,
    preset: presetId,
  });
  return dir;
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  return fs.readJson(filePath) as Promise<Record<string, unknown>>;
}

async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

async function listDirs(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

// ---------------------------------------------------------------------------
// Preset definitions for test expectations
// ---------------------------------------------------------------------------

interface PresetExpectation {
  id: DrupalPreset;
  config: PresetConfig;
  uniqueSdcs: string[]; // SDCs unique to this preset (not inherited)
}

const ALL_PRESETS: DrupalPreset[] = ['standard', 'blog', 'healthcare', 'intranet', 'ecommerce'];

const standardSdcs = getPreset('standard').sdcList;
const blogSdcs = getPreset('blog').sdcList;

const PRESET_EXPECTATIONS: PresetExpectation[] = [
  {
    id: 'standard',
    config: getPreset('standard'),
    uniqueSdcs: ['node-teaser', 'views-grid', 'hero-banner', 'site-header', 'site-footer'],
  },
  {
    id: 'blog',
    config: getPreset('blog'),
    uniqueSdcs: ['article-full', 'author-byline', 'related-articles', 'tag-cloud'],
  },
  {
    id: 'healthcare',
    config: getPreset('healthcare'),
    uniqueSdcs: ['provider-card', 'appointment-cta', 'condition-tag', 'medical-disclaimer'],
  },
  {
    id: 'intranet',
    config: getPreset('intranet'),
    uniqueSdcs: ['dashboard-card', 'notification-banner', 'data-table-view', 'user-profile'],
  },
  {
    id: 'ecommerce',
    config: getPreset('ecommerce'),
    uniqueSdcs: ['product-card', 'product-grid', 'price-display', 'cart-summary', 'checkout-form'],
  },
];

// ---------------------------------------------------------------------------
// E2E Tests: Full scaffold verification per preset
// ---------------------------------------------------------------------------

describe.each(PRESET_EXPECTATIONS)('E2E preset scaffold: $id', ({ id, config, uniqueSdcs }) => {
  it('scaffolds all root theme files', async () => {
    const dir = await scaffoldPreset(id, 'root');
    const expectedFiles = [
      `e2e_${id}.info.yml`,
      `e2e_${id}.libraries.yml`,
      'helixui.libraries.yml',
      'package.json',
      'composer.json',
      `src/behaviors/${id}-behaviors.js`,
    ];
    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(dir, file)), `expected ${file} to exist`).toBe(true);
    }
  }, 120_000);

  it('creates all preset SDC directories with required files', async () => {
    const dir = await scaffoldPreset(id, 'sdcs');
    const sdcDirs = await listDirs(path.join(dir, 'src', 'components'));

    // Exact match on SDC count
    expect(sdcDirs).toHaveLength(config.sdcList.length);

    // Every expected SDC directory exists
    for (const sdc of config.sdcList) {
      expect(sdcDirs).toContain(sdc);
    }

    // Each SDC has .component.yml and .twig
    for (const sdc of config.sdcList) {
      const ymlPath = path.join(dir, 'src', 'components', sdc, `${sdc}.component.yml`);
      const twigPath = path.join(dir, 'src', 'components', sdc, `${sdc}.twig`);
      expect(await fs.pathExists(ymlPath), `${sdc}.component.yml missing`).toBe(true);
      expect(await fs.pathExists(twigPath), `${sdc}.twig missing`).toBe(true);
    }
  }, 120_000);

  it('includes preset-unique SDC components', async () => {
    const dir = await scaffoldPreset(id, 'unique');
    const sdcDirs = await listDirs(path.join(dir, 'src', 'components'));
    for (const sdc of uniqueSdcs) {
      expect(sdcDirs, `expected unique SDC "${sdc}" for preset ${id}`).toContain(sdc);
    }
  }, 120_000);

  it('package.json contains all preset dependencies', async () => {
    const dir = await scaffoldPreset(id, 'deps');
    const pkg = await readJsonFile(path.join(dir, 'package.json'));
    const deps = pkg['dependencies'] as Record<string, string> | undefined;
    expect(deps).toBeDefined();

    for (const [depName, depVersion] of Object.entries(config.dependencies)) {
      expect(deps?.[depName], `expected dependency "${depName}" in package.json`).toBe(depVersion);
    }
  }, 120_000);

  it('info.yml is valid Drupal theme config', async () => {
    const dir = await scaffoldPreset(id, 'info');
    const info = await readTextFile(path.join(dir, `e2e_${id}.info.yml`));

    // Must declare as a theme
    expect(info).toContain('type: theme');
    // Must support Drupal 10 or 11
    expect(info).toContain('core_version_requirement: ^10 || ^11');
    // Must reference the preset
    expect(info).toContain(id);
    // Must have a name field
    expect(info).toMatch(/^name:/m);
  }, 120_000);

  it('helixui.libraries.yml has CDN provider and entries for all SDCs', async () => {
    const dir = await scaffoldPreset(id, 'libs');
    const libs = await readTextFile(path.join(dir, 'helixui.libraries.yml'));

    expect(libs).toContain('provider: cdn');
    expect(libs).toContain('helixui.base:');

    for (const sdc of config.sdcList) {
      expect(libs, `expected helixui.${sdc} library entry`).toContain(`helixui.${sdc}:`);
    }
  }, 120_000);

  it('theme libraries.yml has global styling entry', async () => {
    const dir = await scaffoldPreset(id, 'themelib');
    const libs = await readTextFile(path.join(dir, `e2e_${id}.libraries.yml`));
    expect(libs).toContain('global:');
    expect(libs).toContain('css/style.css');
  }, 120_000);

  it('composer.json declares drupal-theme type', async () => {
    const dir = await scaffoldPreset(id, 'composer');
    const composer = await readTextFile(path.join(dir, 'composer.json'));
    expect(composer).toContain('"type": "drupal-theme"');
  }, 120_000);

  it('component.yml files reference correct theme library', async () => {
    const dir = await scaffoldPreset(id, 'ymlref');
    // Verify all SDC component.yml files link to the correct theme library
    for (const sdc of config.sdcList) {
      const yml = await readTextFile(
        path.join(dir, 'src', 'components', sdc, `${sdc}.component.yml`),
      );
      expect(yml).toContain(`e2e_${id}/helixui.${sdc}`);
    }
  }, 120_000);

  it('behaviors file uses Drupal.behaviors with once() pattern', async () => {
    const dir = await scaffoldPreset(id, 'behaviors');
    const behaviors = await readTextFile(path.join(dir, `src/behaviors/${id}-behaviors.js`));
    expect(behaviors).toContain('Drupal.behaviors');
    expect(behaviors).toContain("once('");
  }, 120_000);
});

// ---------------------------------------------------------------------------
// E2E Tests: Cross-preset structural verification
// ---------------------------------------------------------------------------

describe('E2E preset scaffold: cross-preset validation', () => {
  it('all 5 presets are defined', () => {
    expect(PRESETS).toHaveLength(5);
    const ids = PRESETS.map((p) => p.id);
    for (const presetId of ALL_PRESETS) {
      expect(ids).toContain(presetId);
    }
  });

  it('blog inherits all standard SDCs', () => {
    for (const sdc of standardSdcs) {
      expect(blogSdcs).toContain(sdc);
    }
  });

  it('healthcare inherits all blog SDCs', () => {
    const healthcareSdcs = getPreset('healthcare').sdcList;
    for (const sdc of blogSdcs) {
      expect(healthcareSdcs).toContain(sdc);
    }
  });

  it('intranet inherits standard but not blog-specific SDCs', () => {
    const intranetSdcs = getPreset('intranet').sdcList;
    for (const sdc of standardSdcs) {
      expect(intranetSdcs).toContain(sdc);
    }
    const blogOnly = blogSdcs.filter((s) => !standardSdcs.includes(s));
    for (const sdc of blogOnly) {
      expect(intranetSdcs).not.toContain(sdc);
    }
  });

  it('ecommerce inherits standard SDCs and adds commerce dependency', () => {
    const ecommerceConfig = getPreset('ecommerce');
    for (const sdc of standardSdcs) {
      expect(ecommerceConfig.sdcList).toContain(sdc);
    }
    expect(ecommerceConfig.dependencies).toHaveProperty('@helixui/commerce');
  });

  it('ecommerce is the only preset with extra dependencies beyond shared', () => {
    const sharedDeps = ['@helixui/drupal-starter', '@helixui/tokens'];
    for (const preset of PRESETS) {
      const depNames = Object.keys(preset.dependencies);
      if (preset.id === 'ecommerce') {
        expect(depNames.length).toBeGreaterThan(sharedDeps.length);
        expect(depNames).toContain('@helixui/commerce');
      } else {
        expect(depNames.sort()).toEqual(sharedDeps.sort());
      }
    }
  });

  it('ecommerce preset has templateVars for commerce configuration', () => {
    const ecommerceConfig = getPreset('ecommerce');
    expect(ecommerceConfig.templateVars).toHaveProperty('commerceProvider');
    expect(ecommerceConfig.templateVars).toHaveProperty('currencyFormat');
  });

  it('each preset SDC list has no duplicates', () => {
    for (const preset of PRESETS) {
      const unique = [...new Set(preset.sdcList)];
      expect(unique).toHaveLength(preset.sdcList.length);
    }
  });
});
