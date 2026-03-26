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
} from '../generators/drupal-theme.js';
import { getPreset } from '../presets/loader.js';

const standardPreset = getPreset('standard');
const healthcarePreset = getPreset('healthcare');

describe('toTitleCase', () => {
  it('converts underscore-separated words to title case', () => {
    expect(toTitleCase('my_theme')).toBe('My Theme');
  });

  it('converts hyphen-separated words to title case', () => {
    expect(toTitleCase('node-teaser')).toBe('Node Teaser');
  });

  it('handles single word', () => {
    expect(toTitleCase('theme')).toBe('Theme');
  });

  it('handles mixed underscores and hyphens', () => {
    expect(toTitleCase('my_node-teaser')).toBe('My Node Teaser');
  });
});

describe('generateThemeInfoYml', () => {
  it('contains correct name for standard theme', () => {
    const yml = generateThemeInfoYml('my_theme', standardPreset);
    expect(yml).toContain("name: 'My Theme'");
  });

  it('contains type: theme', () => {
    const yml = generateThemeInfoYml('my_theme', standardPreset);
    expect(yml).toContain('type: theme');
  });

  it('contains preset id in description', () => {
    const yml = generateThemeInfoYml('my_theme', standardPreset);
    expect(yml).toContain('standard');
  });

  it('contains core_version_requirement', () => {
    const yml = generateThemeInfoYml('my_theme', standardPreset);
    expect(yml).toContain('core_version_requirement: ^10 || ^11');
  });

  it('references the global library', () => {
    const yml = generateThemeInfoYml('my_theme', standardPreset);
    expect(yml).toContain('- my_theme/global');
  });

  it('works with healthcare preset', () => {
    const yml = generateThemeInfoYml('hospital_site', healthcarePreset);
    expect(yml).toContain("name: 'Hospital Site'");
    expect(yml).toContain('healthcare');
  });
});

describe('generateThemeLibrariesYml', () => {
  it('contains global library entry', () => {
    const yml = generateThemeLibrariesYml('my_theme');
    expect(yml).toContain('global:');
  });

  it('contains css/style.css', () => {
    const yml = generateThemeLibrariesYml('my_theme');
    expect(yml).toContain('css/style.css: {}');
  });

  it('contains VERSION placeholder', () => {
    const yml = generateThemeLibrariesYml('my_theme');
    expect(yml).toContain('version: VERSION');
  });

  it('is valid YAML structure (key: value pairs)', () => {
    const yml = generateThemeLibrariesYml('another_theme');
    expect(yml).toMatch(/^\w+:/m);
    expect(yml).toContain('theme:');
  });
});

describe('generateComposerJson', () => {
  it('produces valid JSON', () => {
    const json = generateComposerJson('my_theme');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('has type drupal-theme', () => {
    const parsed = JSON.parse(generateComposerJson('my_theme')) as { type: string };
    expect(parsed.type).toBe('drupal-theme');
  });

  it('has correct name with helixui prefix', () => {
    const parsed = JSON.parse(generateComposerJson('my_theme')) as { name: string };
    expect(parsed.name).toBe('helixui/my_theme');
  });

  it('requires drupal/core', () => {
    const parsed = JSON.parse(generateComposerJson('my_theme')) as {
      require: Record<string, string>;
    };
    expect(parsed.require).toHaveProperty('drupal/core');
  });

  it('works with different theme name', () => {
    const parsed = JSON.parse(generateComposerJson('hospital_theme')) as { name: string };
    expect(parsed.name).toBe('helixui/hospital_theme');
  });
});

describe('generatePackageJson', () => {
  it('produces valid JSON', () => {
    const json = generatePackageJson('my_theme', standardPreset);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('has correct name', () => {
    const parsed = JSON.parse(generatePackageJson('my_theme', standardPreset)) as { name: string };
    expect(parsed.name).toBe('my_theme');
  });

  it('includes preset dependencies', () => {
    const parsed = JSON.parse(generatePackageJson('my_theme', standardPreset)) as {
      dependencies: Record<string, string>;
    };
    expect(parsed.dependencies).toHaveProperty('@helixui/drupal-starter');
    expect(parsed.dependencies).toHaveProperty('@helixui/tokens');
  });

  it('mentions preset in description', () => {
    const parsed = JSON.parse(generatePackageJson('my_theme', standardPreset)) as {
      description: string;
    };
    expect(parsed.description).toContain('standard');
  });

  it('has private: true', () => {
    const parsed = JSON.parse(generatePackageJson('my_theme', standardPreset)) as {
      private: boolean;
    };
    expect(parsed.private).toBe(true);
  });

  it('works with healthcare preset', () => {
    const parsed = JSON.parse(generatePackageJson('hospital_theme', healthcarePreset)) as {
      description: string;
    };
    expect(parsed.description).toContain('healthcare');
  });
});

describe('generateBehaviorsJs', () => {
  it('contains Drupal.behaviors definition', () => {
    const js = generateBehaviorsJs(standardPreset);
    expect(js).toContain('Drupal.behaviors.helixuiInit');
  });

  it('uses once() pattern', () => {
    const js = generateBehaviorsJs(standardPreset);
    expect(js).toContain("once('");
  });

  it('has attach function', () => {
    const js = generateBehaviorsJs(standardPreset);
    expect(js).toContain('attach: function');
  });

  it('has detach function', () => {
    const js = generateBehaviorsJs(standardPreset);
    expect(js).toContain('detach: function');
  });

  it('references preset id in file comment', () => {
    const js = generateBehaviorsJs(healthcarePreset);
    expect(js).toContain('healthcare');
  });

  it('wraps code in IIFE with Drupal and once params', () => {
    const js = generateBehaviorsJs(standardPreset);
    expect(js).toContain('(function (Drupal, once)');
    expect(js).toContain('}(Drupal, once))');
  });
});

describe('generateComponentYml', () => {
  it('contains SDC schema reference', () => {
    const yml = generateComponentYml('node-teaser', 'my_theme');
    expect(yml).toContain('$schema:');
    expect(yml).toContain('drupalcode.org');
  });

  it('contains display name in title case', () => {
    const yml = generateComponentYml('node-teaser', 'my_theme');
    expect(yml).toContain("name: 'Node Teaser'");
  });

  it('references theme library in libraryOverrides', () => {
    const yml = generateComponentYml('node-teaser', 'my_theme');
    expect(yml).toContain('my_theme/helixui.node-teaser');
  });

  it('has props section with title and url', () => {
    const yml = generateComponentYml('node-teaser', 'my_theme');
    expect(yml).toContain('props:');
    expect(yml).toContain('title:');
    expect(yml).toContain('url:');
  });

  it('has slots section with content slot', () => {
    const yml = generateComponentYml('node-teaser', 'my_theme');
    expect(yml).toContain('slots:');
    expect(yml).toContain('content:');
  });

  it('works with different sdc and theme names', () => {
    const yml = generateComponentYml('hero-banner', 'hospital_theme');
    expect(yml).toContain("name: 'Hero Banner'");
    expect(yml).toContain('hospital_theme/helixui.hero-banner');
  });
});

describe('generateComponentTwig', () => {
  it('uses sdcName as CSS class', () => {
    const twig = generateComponentTwig('node-teaser');
    expect(twig).toContain('class="node-teaser"');
  });

  it('renders title slot with link', () => {
    const twig = generateComponentTwig('node-teaser');
    expect(twig).toContain('{{ title }}');
    expect(twig).toContain('{{ url }}');
  });

  it('has content block for slot', () => {
    const twig = generateComponentTwig('node-teaser');
    expect(twig).toContain('{% block content %}');
  });

  it('includes file docblock comment', () => {
    const twig = generateComponentTwig('node-teaser');
    expect(twig).toContain('@file');
    expect(twig).toContain('node-teaser');
  });

  it('uses article element as wrapper', () => {
    const twig = generateComponentTwig('node-teaser');
    expect(twig).toContain('<article');
    expect(twig).toContain('</article>');
  });

  it('works with different component name', () => {
    const twig = generateComponentTwig('hero-banner');
    expect(twig).toContain('class="hero-banner"');
    expect(twig).toContain('Hero Banner');
  });
});
