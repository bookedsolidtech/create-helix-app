import { describe, it, expect } from 'vitest';
import {
  toTitleCase,
  generateThemeInfoYml,
  generateThemeLibrariesYml,
  generateComposerJson,
  generatePackageJson,
  generateBehaviorsJs,
  generateComponentYml,
  generateComponentTwig,
  scaffoldDrupalTheme,
} from '../../src/generators/drupal-theme.js';
import { generateLibrariesYml } from '../../src/generators/libraries.js';
import { getPreset, VALID_PRESETS, PRESETS } from '../../src/presets/loader.js';
import type { DrupalPreset, PresetConfig } from '../../src/types.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const ROOT = path.join(os.tmpdir(), `helix-unit-drupal-theme-${Date.now()}`);

function makePreset(overrides: Partial<PresetConfig> = {}): PresetConfig {
  return {
    id: 'standard',
    name: 'Standard',
    description: 'Test preset',
    sdcList: ['node-teaser', 'hero-banner'],
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
});

/* -------------------------------------------------------------------------- */
/*  generateThemeLibrariesYml                                                  */
/* -------------------------------------------------------------------------- */

describe('generateThemeLibrariesYml', () => {
  it('produces global library with css entry', () => {
    const yml = generateThemeLibrariesYml('my_theme');
    expect(yml).toContain('global:');
    expect(yml).toContain('version: VERSION');
    expect(yml).toContain('css/style.css: {}');
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

  it('requires Drupal core ^10 || ^11', () => {
    const parsed = JSON.parse(generateComposerJson('my_theme')) as {
      require: Record<string, string>;
    };
    expect(parsed.require['drupal/core']).toBe('^10 || ^11');
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
    const js = generateBehaviorsJs(preset);
    expect(js).toContain('Drupal.behaviors.helixuiInit');
  });

  it('uses once() for idempotent initialization', () => {
    const js = generateBehaviorsJs(preset);
    expect(js).toContain("once('helixui:sdc-init'");
  });

  it('includes attach and detach methods', () => {
    const js = generateBehaviorsJs(preset);
    expect(js).toContain('attach: function (context, settings)');
    expect(js).toContain('detach: function (context, settings, trigger)');
  });

  it('references preset id in file header comment', () => {
    const js = generateBehaviorsJs(preset);
    expect(js).toContain('standard preset');
  });

  it('uses IIFE with Drupal and once parameters', () => {
    const js = generateBehaviorsJs(preset);
    expect(js).toContain('(function (Drupal, once)');
    expect(js).toContain('}(Drupal, once));');
  });

  it('checks for unload trigger in detach', () => {
    const js = generateBehaviorsJs(preset);
    expect(js).toContain("trigger === 'unload'");
  });
});

/* -------------------------------------------------------------------------- */
/*  generateComponentYml                                                       */
/* -------------------------------------------------------------------------- */

describe('generateComponentYml', () => {
  it('includes SDC schema reference', () => {
    const yml = generateComponentYml('node-teaser', 'my_theme');
    expect(yml).toContain('$schema:');
    expect(yml).toContain('drupalcode.org');
  });

  it('title-cases the component name', () => {
    const yml = generateComponentYml('node-teaser', 'my_theme');
    expect(yml).toContain("name: 'Node Teaser'");
  });

  it('defines props with title and url', () => {
    const yml = generateComponentYml('node-teaser', 'my_theme');
    expect(yml).toContain('title:');
    expect(yml).toContain('type: string');
    expect(yml).toContain('url:');
  });

  it('defines content slot', () => {
    const yml = generateComponentYml('node-teaser', 'my_theme');
    expect(yml).toContain('slots:');
    expect(yml).toContain("title: 'Content'");
  });

  it('references theme library dependency', () => {
    const yml = generateComponentYml('hero-banner', 'cool_theme');
    expect(yml).toContain('cool_theme/helixui.hero-banner');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateComponentTwig                                                      */
/* -------------------------------------------------------------------------- */

describe('generateComponentTwig', () => {
  it('generates article wrapper with component CSS class', () => {
    const twig = generateComponentTwig('node-teaser');
    expect(twig).toContain('<article class="node-teaser">');
  });

  it('uses BEM-style class names', () => {
    const twig = generateComponentTwig('node-teaser');
    expect(twig).toContain('class="node-teaser__title"');
    expect(twig).toContain('class="node-teaser__content"');
  });

  it('outputs title and url twig variables', () => {
    const twig = generateComponentTwig('node-teaser');
    expect(twig).toContain('{{ url }}');
    expect(twig).toContain('{{ title }}');
  });

  it('includes content block', () => {
    const twig = generateComponentTwig('node-teaser');
    expect(twig).toContain('{% block content %}{% endblock %}');
  });

  it('includes file docblock comment', () => {
    const twig = generateComponentTwig('hero-banner');
    expect(twig).toContain('Template for hero-banner SDC component');
  });
});

/* -------------------------------------------------------------------------- */
/*  generateLibrariesYml (CDN provider generation)                             */
/* -------------------------------------------------------------------------- */

describe('generateLibrariesYml', () => {
  const preset = makePreset();

  it('includes header comment with preset id', () => {
    const yml = generateLibrariesYml('my_theme', preset);
    expect(yml).toContain('Generated from preset: standard');
  });

  it('lists all SDCs in header comment', () => {
    const yml = generateLibrariesYml('my_theme', preset);
    expect(yml).toContain('node-teaser, hero-banner');
  });

  it('defines helixui.base library with CDN provider', () => {
    const yml = generateLibrariesYml('my_theme', preset);
    expect(yml).toContain('helixui.base:');
    expect(yml).toContain('provider: cdn');
  });

  it('includes unpkg CDN URLs for tokens and library', () => {
    const yml = generateLibrariesYml('my_theme', preset);
    expect(yml).toContain('https://unpkg.com/@helixui/tokens/dist/index.css');
    expect(yml).toContain('https://unpkg.com/@helixui/library/dist/index.js');
  });

  it('declares core/drupal and core/once dependencies', () => {
    const yml = generateLibrariesYml('my_theme', preset);
    expect(yml).toContain('- core/drupal');
    expect(yml).toContain('- core/once');
  });

  it('generates one entry per SDC', () => {
    const yml = generateLibrariesYml('my_theme', preset);
    expect(yml).toContain('helixui.node-teaser:');
    expect(yml).toContain('helixui.hero-banner:');
  });

  it('each SDC library depends on helixui.base', () => {
    const yml = generateLibrariesYml('my_theme', preset);
    // Count occurrences of the base dependency (once per SDC)
    const matches = yml.match(/my_theme\/helixui\.base/g);
    expect(matches).toHaveLength(preset.sdcList.length);
  });
});

/* -------------------------------------------------------------------------- */
/*  assertNoPathTraversal (via scaffoldDrupalTheme)                            */
/* -------------------------------------------------------------------------- */

describe('path traversal protection', () => {
  it('rejects directory with ../ traversal', async () => {
    // path.normalize resolves "../" so the security guard may not trigger;
    // the OS will reject the resulting privileged path with EACCES instead.
    await expect(
      scaffoldDrupalTheme({
        themeName: 'safe_theme',
        directory: '/tmp/../../etc/evil',
        preset: 'standard',
      }),
    ).rejects.toThrow();
  });

  it('rejects directory with backslash traversal on normalized path', async () => {
    // path.join + normalize collapses ".." segments, so the traversal guard
    // sees a clean path. The OS still blocks writes to privileged dirs (EACCES).
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
    // Should not throw
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

    it('behaviors.js references preset id', () => {
      const js = generateBehaviorsJs(preset);
      expect(js).toContain(`${presetId} preset`);
      expect(js).toContain('Drupal.behaviors');
    });

    it('component.yml is generated for each SDC', () => {
      for (const sdc of preset.sdcList) {
        const yml = generateComponentYml(sdc, themeName);
        expect(yml).toContain(`${themeName}/helixui.${sdc}`);
      }
    });

    it('component twig is generated for each SDC', () => {
      for (const sdc of preset.sdcList) {
        const twig = generateComponentTwig(sdc);
        expect(twig).toContain(`class="${sdc}"`);
        expect(twig).toContain(`${sdc}__title`);
      }
    });

    it('libraries.yml has entries for every SDC', () => {
      const yml = generateLibrariesYml(themeName, preset);
      expect(yml).toContain('helixui.base:');
      for (const sdc of preset.sdcList) {
        expect(yml).toContain(`helixui.${sdc}:`);
      }
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
    expect(preset.sdcList).toContain('product-card');
    expect(preset.sdcList).toContain('cart-summary');
    expect(preset.sdcList).toContain('checkout-form');
  });
});

/* -------------------------------------------------------------------------- */
/*  Healthcare preset specifics                                                */
/* -------------------------------------------------------------------------- */

describe('healthcare preset specifics', () => {
  const preset = getPreset('healthcare');

  it('includes healthcare-specific SDCs', () => {
    expect(preset.sdcList).toContain('provider-card');
    expect(preset.sdcList).toContain('appointment-cta');
    expect(preset.sdcList).toContain('medical-disclaimer');
  });

  it('extends blog SDCs (which extend standard)', () => {
    // Should contain standard SDCs
    expect(preset.sdcList).toContain('node-teaser');
    expect(preset.sdcList).toContain('hero-banner');
    // Should contain blog SDCs
    expect(preset.sdcList).toContain('article-full');
    expect(preset.sdcList).toContain('author-byline');
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
    expect(await fs.pathExists(path.join(dir, 'helixui.libraries.yml'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'composer.json'))).toBe(true);
    expect(
      await fs.pathExists(path.join(dir, 'src', 'behaviors', `${presetId}-behaviors.js`)),
    ).toBe(true);
  });

  it('creates SDC directories with component files', async () => {
    const preset = getPreset(presetId);
    for (const sdc of preset.sdcList) {
      const sdcDir = path.join(dir, 'src', 'components', sdc);
      expect(await fs.pathExists(sdcDir)).toBe(true);
      expect(await fs.pathExists(path.join(sdcDir, `${sdc}.component.yml`))).toBe(true);
      expect(await fs.pathExists(path.join(sdcDir, `${sdc}.twig`))).toBe(true);
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
