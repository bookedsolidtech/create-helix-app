import { describe, it, expect } from 'vitest';
import {
  toTitleCase,
  generateThemeInfoYml,
  generateComposerJson,
  generatePackageJson,
  generateBehaviorsJs,
  generateComponentYml,
  generateComponentTwig,
  generateComponentCss,
  generateTemplateOverride,
  generateStyleCss,
  generateHelixOverridesCss,
  generateDockerCompose,
  generateThemePhp,
  scaffoldDrupalTheme,
} from '../../src/generators/drupal-theme.js';
import { generateThemeLibraries } from '../../src/generators/libraries.js';
import { getPreset, VALID_PRESETS, PRESETS } from '../../src/presets/loader.js';
import type { DrupalPreset, PresetConfig, SDCDefinition } from '../../src/types.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const ROOT = path.join(os.tmpdir(), `helix-unit-drupal-theme-${Date.now()}`);

const nodeTeaserSdc: SDCDefinition = {
  name: 'node-teaser',
  group: 'node',
  helixComponents: ['hx-card', 'hx-badge', 'hx-text'],
};

const heroBannerSdc: SDCDefinition = {
  name: 'hero-banner',
  group: 'block',
  helixComponents: ['hx-hero', 'hx-text', 'hx-button'],
};

const contentGridSdc: SDCDefinition = {
  name: 'content-grid',
  group: 'views',
  helixComponents: ['hx-card'],
  templateOverride: 'views/views-view--content.html.twig',
};

function makePreset(overrides: Partial<PresetConfig> = {}): PresetConfig {
  return {
    id: 'standard',
    name: 'Standard',
    description: 'Test preset',
    sdcList: [nodeTeaserSdc, heroBannerSdc],
    dependencies: { '@helixui/drupal-starter': '^0.1.0', '@helixui/tokens': '^0.2.0' },
    templateVars: {},
    architectureNotes: 'Test notes',
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  toTitleCase                                                                */
/* -------------------------------------------------------------------------- */

describe('toTitleCase', () => {
  it('converts hyphenated strings', () => {
    expect(toTitleCase('node-teaser')).toBe('Node Teaser');
  });

  it('converts underscored strings', () => {
    expect(toTitleCase('my_custom_theme')).toBe('My Custom Theme');
  });

  it('handles single word', () => {
    expect(toTitleCase('standard')).toBe('Standard');
  });

  it('handles mixed separators', () => {
    expect(toTitleCase('my-custom_theme')).toBe('My Custom Theme');
  });

  it('handles empty string', () => {
    expect(toTitleCase('')).toBe('');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateThemeInfoYml                                                       */
/* -------------------------------------------------------------------------- */

describe('generateThemeInfoYml', () => {
  const preset = makePreset();

  it('produces valid YAML structure', () => {
    const yml = generateThemeInfoYml('my_theme', preset);
    expect(yml).toContain("name: 'My Theme'");
    expect(yml).toContain('type: theme');
    expect(yml).toContain('core_version_requirement: ^10 || ^11');
    expect(yml).toContain('base theme: false');
  });

  it('includes theme library reference', () => {
    const yml = generateThemeInfoYml('my_theme', preset);
    expect(yml).toContain('- my_theme/global');
  });

  it('references preset id in description', () => {
    const yml = generateThemeInfoYml('my_theme', preset);
    expect(yml).toContain('HELiX preset: standard');
  });

  it('title-cases the theme name for display', () => {
    const yml = generateThemeInfoYml('cool_drupal_theme', preset);
    expect(yml).toContain("name: 'Cool Drupal Theme'");
  });

  it('declares SDC component path', () => {
    const yml = generateThemeInfoYml('my_theme', preset);
    expect(yml).toContain('components:');
    expect(yml).toContain("path: 'components'");
  });
});

/* -------------------------------------------------------------------------- */
/*  generateThemeLibraries                                                     */
/* -------------------------------------------------------------------------- */

describe('generateThemeLibraries', () => {
  it('produces global library with css entry', () => {
    const yml = generateThemeLibraries('my_theme', makePreset());
    expect(yml).toContain('global:');
    expect(yml).toContain('version: VERSION');
    expect(yml).toContain('css/style.css: {}');
  });

  it('produces helix-overrides library', () => {
    const yml = generateThemeLibraries('my_theme', makePreset());
    expect(yml).toContain('helix-overrides:');
    expect(yml).toContain('css/helix-overrides.css: {}');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateComposerJson                                                       */
/* -------------------------------------------------------------------------- */

describe('generateComposerJson', () => {
  it('produces valid JSON', () => {
    const raw = generateComposerJson('my_theme');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed).toBeDefined();
  });

  it('sets drupal-theme type', () => {
    const parsed = JSON.parse(generateComposerJson('my_theme')) as Record<string, unknown>;
    expect(parsed.type).toBe('drupal-theme');
  });

  it('sets correct package name', () => {
    const parsed = JSON.parse(generateComposerJson('cool_theme')) as Record<string, unknown>;
    expect(parsed.name).toBe('helixui/cool_theme');
  });

  it('requires drupal/core', () => {
    const parsed = JSON.parse(generateComposerJson('my_theme')) as {
      require: Record<string, string>;
    };
    expect(parsed.require).toHaveProperty('drupal/core');
  });
});

/* -------------------------------------------------------------------------- */
/*  generatePackageJson                                                        */
/* -------------------------------------------------------------------------- */

describe('generatePackageJson', () => {
  const preset = makePreset();

  it('produces valid JSON', () => {
    const raw = generatePackageJson('my_theme', preset);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed).toBeDefined();
  });

  it('sets package name from theme name', () => {
    const parsed = JSON.parse(generatePackageJson('my_theme', preset)) as Record<string, unknown>;
    expect(parsed.name).toBe('my_theme');
  });

  it('marks package as private', () => {
    const parsed = JSON.parse(generatePackageJson('my_theme', preset)) as Record<string, unknown>;
    expect(parsed.private).toBe(true);
  });

  it('includes preset dependencies', () => {
    const parsed = JSON.parse(generatePackageJson('my_theme', preset)) as {
      dependencies: Record<string, string>;
    };
    expect(parsed.dependencies['@helixui/drupal-starter']).toBe('^0.1.0');
    expect(parsed.dependencies['@helixui/tokens']).toBe('^0.2.0');
  });

  it('includes preset id in description', () => {
    const parsed = JSON.parse(generatePackageJson('my_theme', preset)) as Record<string, unknown>;
    expect(parsed.description).toContain('standard');
  });

  it('includes extra dependencies for ecommerce preset', () => {
    const ecomPreset = getPreset('ecommerce');
    const parsed = JSON.parse(generatePackageJson('shop_theme', ecomPreset)) as {
      dependencies: Record<string, string>;
    };
    expect(parsed.dependencies['@helixui/commerce']).toBe('^0.1.0');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateBehaviorsJs                                                        */
/* -------------------------------------------------------------------------- */

describe('generateBehaviorsJs', () => {
  const preset = makePreset();

  it('uses Drupal.behaviors pattern', () => {
    const js = generateBehaviorsJs('my_theme', preset);
    expect(js).toContain('Drupal.behaviors.my_themeInit');
  });

  it('uses once() for idempotent initialization', () => {
    const js = generateBehaviorsJs('my_theme', preset);
    expect(js).toContain("once('");
  });

  it('includes attach and detach methods', () => {
    const js = generateBehaviorsJs('my_theme', preset);
    expect(js).toContain('attach(');
    expect(js).toContain('detach(');
  });

  it('references preset name in file header comment', () => {
    const js = generateBehaviorsJs('my_theme', preset);
    expect(js).toContain('Standard');
  });

  it('uses IIFE with Drupal and once parameters', () => {
    const js = generateBehaviorsJs('my_theme', preset);
    expect(js).toContain('(function (Drupal, once)');
    expect(js).toContain('}(Drupal, once))');
  });

  it('references hx-* components from preset', () => {
    const js = generateBehaviorsJs('my_theme', preset);
    expect(js).toContain('hx-card');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateComponentYml                                                       */
/* -------------------------------------------------------------------------- */

describe('generateComponentYml', () => {
  it('includes SDC schema reference', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain('$schema:');
    expect(yml).toContain('drupalcode.org');
  });

  it('title-cases the component name', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain("name: 'Node Teaser'");
  });

  it('has status: experimental', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain('status: experimental');
  });

  it('has group field', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain('group:');
    expect(yml).toContain('Node Display');
  });

  it('defines props with title', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain('props:');
    expect(yml).toContain('title:');
  });

  it('defines slots section', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain('slots:');
  });

  it('works with block SDC', () => {
    const yml = generateComponentYml(heroBannerSdc);
    expect(yml).toContain("name: 'Hero Banner'");
    expect(yml).toContain("group: 'Block'");
  });
});

/* -------------------------------------------------------------------------- */
/*  generateComponentTwig                                                      */
/* -------------------------------------------------------------------------- */

describe('generateComponentTwig', () => {
  it('attaches helix component libraries', () => {
    const twig = generateComponentTwig(nodeTeaserSdc);
    expect(twig).toContain("attach_library('helixui/hx-card')");
  });

  it('uses hx-* elements', () => {
    const twig = generateComponentTwig(nodeTeaserSdc);
    expect(twig).toContain('<hx-card');
  });

  it('outputs title twig variable', () => {
    const twig = generateComponentTwig(nodeTeaserSdc);
    expect(twig).toContain('{{ title }}');
  });

  it('includes file docblock comment', () => {
    const twig = generateComponentTwig(nodeTeaserSdc);
    expect(twig).toContain('@file');
  });

  it('works with block SDC', () => {
    const twig = generateComponentTwig(heroBannerSdc);
    expect(twig).toContain("attach_library('helixui/hx-hero')");
    expect(twig).toContain('hero-banner');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateComponentCss                                                       */
/* -------------------------------------------------------------------------- */

describe('generateComponentCss', () => {
  it('generates BEM-scoped CSS', () => {
    const css = generateComponentCss(nodeTeaserSdc);
    expect(css).toContain('.node-teaser {');
  });

  it('uses HELiX CSS custom properties', () => {
    const css = generateComponentCss(nodeTeaserSdc);
    expect(css).toContain('var(--hx-');
  });

  it('works with block SDC', () => {
    const css = generateComponentCss(heroBannerSdc);
    expect(css).toContain('.hero-banner {');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateTemplateOverride                                                   */
/* -------------------------------------------------------------------------- */

describe('generateTemplateOverride', () => {
  const sdcWithOverride: SDCDefinition = {
    name: 'node-teaser',
    group: 'node',
    helixComponents: ['hx-card'],
    templateOverride: 'node/node--article--teaser.html.twig',
  };

  it('generates include call for the SDC', () => {
    const twig = generateTemplateOverride(sdcWithOverride, 'my_theme');
    expect(twig).toContain("include('my_theme:node-teaser')");
  });

  it('passes node variables for node template overrides', () => {
    const twig = generateTemplateOverride(sdcWithOverride, 'my_theme');
    expect(twig).toContain('node.label');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateStyleCss / generateHelixOverridesCss                              */
/* -------------------------------------------------------------------------- */

describe('generateStyleCss', () => {
  it('imports helix-overrides.css', () => {
    const css = generateStyleCss();
    expect(css).toContain('@import url("helix-overrides.css")');
  });

  it('has body reset styles', () => {
    const css = generateStyleCss();
    expect(css).toContain('body {');
    expect(css).toContain('margin: 0');
  });
});

describe('generateHelixOverridesCss', () => {
  it('has :root block with HELiX custom property overrides', () => {
    const css = generateHelixOverridesCss();
    expect(css).toContain(':root {');
    expect(css).toContain('--hx-color-primary');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateDockerCompose                                                      */
/* -------------------------------------------------------------------------- */

describe('generateDockerCompose', () => {
  it('uses drupal:11-apache image', () => {
    const compose = generateDockerCompose('my_theme');
    expect(compose).toContain('drupal:11-apache');
  });

  it('references the theme directory', () => {
    const compose = generateDockerCompose('my_theme');
    expect(compose).toContain('my_theme');
  });

  it('exposes port 8080', () => {
    const compose = generateDockerCompose('my_theme');
    expect(compose).toContain('8080:80');
  });

  it('uses mariadb:11 for the database', () => {
    const compose = generateDockerCompose('my_theme');
    expect(compose).toContain('mariadb:11');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateThemePhp                                                           */
/* -------------------------------------------------------------------------- */

describe('generateThemePhp', () => {
  it('starts with PHP opening tag', () => {
    const sdcs = getPreset('standard').sdcList;
    const php = generateThemePhp('my_theme', sdcs);
    expect(php).toContain('<?php');
  });

  it('generates preprocess hooks for SDCs with templateOverride', () => {
    const sdcs = getPreset('standard').sdcList;
    const php = generateThemePhp('my_theme', sdcs);
    expect(php).toContain('function my_theme_preprocess_node');
  });
});

/* -------------------------------------------------------------------------- */
/*  assertNoPathTraversal (via scaffoldDrupalTheme)                            */
/* -------------------------------------------------------------------------- */

describe('path traversal protection', () => {
  it('rejects directory with ../ traversal', async () => {
    await expect(
      scaffoldDrupalTheme({
        themeName: 'safe_theme',
        directory: '/tmp/../../etc/evil',
        preset: 'standard',
      }),
    ).rejects.toThrow();
  });

  it('rejects directory with backslash traversal on normalized path', async () => {
    await expect(
      scaffoldDrupalTheme({
        themeName: 'safe_theme',
        directory: path.join('/tmp', '..', '..', 'etc', 'evil'),
        preset: 'standard',
      }),
    ).rejects.toThrow();
  });

  it('accepts a safe absolute path', async () => {
    const dir = path.join(ROOT, 'traversal-safe');
    await scaffoldDrupalTheme({
      themeName: 'safe_theme',
      directory: dir,
      preset: 'standard',
    });
    expect(await fs.pathExists(dir)).toBe(true);
    await fs.remove(dir);
  });
});

/* -------------------------------------------------------------------------- */
/*  Error handling: invalid/missing presets                                     */
/* -------------------------------------------------------------------------- */

describe('error handling for invalid presets', () => {
  it('getPreset throws for unknown preset id', () => {
    expect(() => getPreset('nonexistent' as DrupalPreset)).toThrow('Unknown preset');
  });

  it('error message lists valid presets', () => {
    try {
      getPreset('bad_preset' as DrupalPreset);
    } catch (e) {
      const msg = (e as Error).message;
      for (const p of VALID_PRESETS) {
        expect(msg).toContain(p);
      }
    }
  });

  it('scaffoldDrupalTheme rejects with invalid preset', async () => {
    await expect(
      scaffoldDrupalTheme({
        themeName: 'test_theme',
        directory: path.join(ROOT, 'bad-preset'),
        preset: 'nonexistent' as DrupalPreset,
      }),
    ).rejects.toThrow('Unknown preset');
  });
});

/* -------------------------------------------------------------------------- */
/*  Theme name sanitization via toTitleCase in generators                       */
/* -------------------------------------------------------------------------- */

describe('theme name sanitization', () => {
  it('underscored theme names are title-cased in info.yml', () => {
    const yml = generateThemeInfoYml('my_cool_theme', makePreset());
    expect(yml).toContain("name: 'My Cool Theme'");
  });

  it('single-word theme names capitalize first letter', () => {
    const yml = generateThemeInfoYml('starter', makePreset());
    expect(yml).toContain("name: 'Starter'");
  });

  it('theme name is used as-is in machine-readable contexts', () => {
    const composerJson = JSON.parse(generateComposerJson('my_theme_123')) as Record<
      string,
      unknown
    >;
    expect(composerJson.name).toBe('helixui/my_theme_123');
  });
});

/* -------------------------------------------------------------------------- */
/*  All 5 presets produce correct output (pure function tests)                 */
/* -------------------------------------------------------------------------- */

describe('all presets produce correct generator output', () => {
  describe.each(VALID_PRESETS)('preset: %s', (presetId: DrupalPreset) => {
    const preset = getPreset(presetId);
    const themeName = `unit_${presetId}`;

    it('info.yml references the preset', () => {
      const yml = generateThemeInfoYml(themeName, preset);
      expect(yml).toContain(`HELiX preset: ${presetId}`);
      expect(yml).toContain('type: theme');
      expect(yml).toContain(`- ${themeName}/global`);
    });

    it('package.json includes all preset dependencies', () => {
      const parsed = JSON.parse(generatePackageJson(themeName, preset)) as {
        dependencies: Record<string, string>;
      };
      for (const [dep, ver] of Object.entries(preset.dependencies)) {
        expect(parsed.dependencies[dep]).toBe(ver);
      }
    });

    it('behaviors.js references preset name', () => {
      const js = generateBehaviorsJs(themeName, preset);
      expect(js).toContain(preset.name);
      expect(js).toContain('Drupal.behaviors');
    });

    it('component.yml is generated for each SDC', () => {
      for (const sdc of preset.sdcList) {
        const yml = generateComponentYml(sdc);
        expect(yml).toContain('$schema:');
        expect(yml).toContain('status: experimental');
      }
    });

    it('component twig is generated for each SDC', () => {
      for (const sdc of preset.sdcList) {
        const twig = generateComponentTwig(sdc);
        expect(twig).toContain('@file');
      }
    });

    it('libraries.yml has global and helix-overrides entries', () => {
      const yml = generateThemeLibraries(themeName, preset);
      expect(yml).toContain('global:');
      expect(yml).toContain('helix-overrides:');
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Ecommerce preset specifics                                                 */
/* -------------------------------------------------------------------------- */

describe('ecommerce preset specifics', () => {
  const preset = getPreset('ecommerce');

  it('includes @helixui/commerce dependency', () => {
    expect(preset.dependencies['@helixui/commerce']).toBe('^0.1.0');
  });

  it('has templateVars for commerce provider and currency', () => {
    expect(preset.templateVars['commerceProvider']).toBe('drupal_commerce');
    expect(preset.templateVars['currencyFormat']).toBe('USD');
  });

  it('includes commerce-specific SDCs', () => {
    const sdcNames = preset.sdcList.map((s) => s.name);
    expect(sdcNames).toContain('product-card');
    expect(sdcNames).toContain('cart-summary');
    expect(sdcNames).toContain('checkout-form');
  });
});

/* -------------------------------------------------------------------------- */
/*  Healthcare preset specifics                                                */
/* -------------------------------------------------------------------------- */

describe('healthcare preset specifics', () => {
  const preset = getPreset('healthcare');

  it('includes healthcare-specific SDCs', () => {
    const sdcNames = preset.sdcList.map((s) => s.name);
    expect(sdcNames).toContain('provider-card');
    expect(sdcNames).toContain('appointment-cta');
    expect(sdcNames).toContain('medical-disclaimer');
  });

  it('extends blog SDCs (which extend standard)', () => {
    const sdcNames = preset.sdcList.map((s) => s.name);
    expect(sdcNames).toContain('node-teaser');
    expect(sdcNames).toContain('hero-banner');
    expect(sdcNames).toContain('article-full');
    expect(sdcNames).toContain('author-byline');
  });
});

/* -------------------------------------------------------------------------- */
/*  scaffoldDrupalTheme integration (writes to tmp)                            */
/* -------------------------------------------------------------------------- */

describe('scaffoldDrupalTheme file output', () => {
  const dir = path.join(ROOT, 'scaffold-output');
  const themeName = 'test_scaffold';
  const presetId: DrupalPreset = 'blog';

  it('creates all expected files', async () => {
    await scaffoldDrupalTheme({ themeName, directory: dir, preset: presetId });

    expect(await fs.pathExists(path.join(dir, `${themeName}.info.yml`))).toBe(true);
    expect(await fs.pathExists(path.join(dir, `${themeName}.libraries.yml`))).toBe(true);
    expect(await fs.pathExists(path.join(dir, `${themeName}.theme`))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'composer.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'js', 'behaviors.js'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'css', 'style.css'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'docker', 'docker-compose.yml'))).toBe(true);
  });

  it('creates SDC directories with component files', async () => {
    const preset = getPreset(presetId);
    for (const sdc of preset.sdcList) {
      const base = path.join(dir, 'components', sdc.group, sdc.name);
      expect(await fs.pathExists(base)).toBe(true);
      expect(await fs.pathExists(path.join(base, `${sdc.name}.component.yml`))).toBe(true);
      expect(await fs.pathExists(path.join(base, `${sdc.name}.twig`))).toBe(true);
      expect(await fs.pathExists(path.join(base, `${sdc.name}.css`))).toBe(true);
    }
  });

  it('written files contain expected content', async () => {
    const infoYml = await fs.readFile(path.join(dir, `${themeName}.info.yml`), 'utf-8');
    expect(infoYml).toContain('type: theme');

    const pkgJson = await fs.readFile(path.join(dir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgJson) as { name: string };
    expect(pkg.name).toBe(themeName);

    const composerJson = await fs.readFile(path.join(dir, 'composer.json'), 'utf-8');
    const composer = JSON.parse(composerJson) as { type: string };
    expect(composer.type).toBe('drupal-theme');
  });

  // Cleanup
  it('cleanup temp directory', async () => {
    await fs.remove(ROOT);
  });
});

/* -------------------------------------------------------------------------- */
/*  PRESETS array shape validation                                             */
/* -------------------------------------------------------------------------- */

describe('all PRESETS have correct shape', () => {
  it.each(PRESETS)('$id preset SDCDefinitions have name, group, and helixComponents', (preset) => {
    for (const sdc of preset.sdcList) {
      expect(typeof sdc.name).toBe('string');
      expect(sdc.name.length).toBeGreaterThan(0);
      expect(typeof sdc.group).toBe('string');
      expect(Array.isArray(sdc.helixComponents)).toBe(true);
    }
  });
});
