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
} from '../generators/drupal-theme.js';
import { generateThemeLibraries } from '../generators/libraries.js';
import { getPreset } from '../presets/loader.js';
import type { SDCDefinition } from '../types.js';

const standardPreset = getPreset('standard');
const healthcarePreset = getPreset('healthcare');

// Representative SDC definitions for unit tests
const nodeTeaserSdc: SDCDefinition = {
  name: 'node-teaser',
  group: 'node',
  helixComponents: ['hx-card', 'hx-badge', 'hx-text', 'hx-avatar'],
  templateOverride: 'node/node--article--teaser.html.twig',
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

  it('converts hyphenated strings', () => {
    expect(toTitleCase('hero-banner')).toBe('Hero Banner');
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

  it('declares SDC component path', () => {
    const yml = generateThemeInfoYml('my_theme', standardPreset);
    expect(yml).toContain('components:');
    expect(yml).toContain("path: 'components'");
  });

  it('works with healthcare preset', () => {
    const yml = generateThemeInfoYml('hospital_site', healthcarePreset);
    expect(yml).toContain("name: 'Hospital Site'");
    expect(yml).toContain('healthcare');
  });
});

describe('generateThemeLibraries', () => {
  it('contains global library entry', () => {
    const yml = generateThemeLibraries('my_theme', standardPreset);
    expect(yml).toContain('global:');
  });

  it('contains css/style.css', () => {
    const yml = generateThemeLibraries('my_theme', standardPreset);
    expect(yml).toContain('css/style.css: {}');
  });

  it('contains VERSION placeholder', () => {
    const yml = generateThemeLibraries('my_theme', standardPreset);
    expect(yml).toContain('version: VERSION');
  });

  it('contains helix-overrides entry', () => {
    const yml = generateThemeLibraries('my_theme', standardPreset);
    expect(yml).toContain('helix-overrides:');
    expect(yml).toContain('css/helix-overrides.css: {}');
  });

  it('is valid YAML structure (key: value pairs)', () => {
    const yml = generateThemeLibraries('another_theme', standardPreset);
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
    const js = generateBehaviorsJs('my_theme', standardPreset);
    expect(js).toContain('Drupal.behaviors.my_themeInit');
  });

  it('uses once() pattern', () => {
    const js = generateBehaviorsJs('my_theme', standardPreset);
    expect(js).toContain("once('");
  });

  it('has attach function', () => {
    const js = generateBehaviorsJs('my_theme', standardPreset);
    expect(js).toContain('attach(');
  });

  it('has detach function', () => {
    const js = generateBehaviorsJs('my_theme', standardPreset);
    expect(js).toContain('detach(');
  });

  it('references preset name in file comment', () => {
    const js = generateBehaviorsJs('my_theme', healthcarePreset);
    expect(js).toContain('Healthcare');
  });

  it('wraps code in IIFE with Drupal and once params', () => {
    const js = generateBehaviorsJs('my_theme', standardPreset);
    expect(js).toContain('(function (Drupal, once)');
    expect(js).toContain('}(Drupal, once))');
  });

  it('references hx-* components from preset', () => {
    const js = generateBehaviorsJs('my_theme', standardPreset);
    expect(js).toContain('hx-card');
  });
});

describe('generateComponentYml', () => {
  it('contains SDC schema reference', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain('$schema:');
    expect(yml).toContain('drupalcode.org');
  });

  it('contains display name in title case', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain("name: 'Node Teaser'");
  });

  it('has status: experimental', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain('status: experimental');
  });

  it('has group field matching SDC group', () => {
    const nodeYml = generateComponentYml(nodeTeaserSdc);
    expect(nodeYml).toContain("group: 'Node Display'");

    const blockYml = generateComponentYml(heroBannerSdc);
    expect(blockYml).toContain("group: 'Block'");

    const viewsYml = generateComponentYml(contentGridSdc);
    expect(viewsYml).toContain("group: 'Views'");
  });

  it('has props section with title', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain('props:');
    expect(yml).toContain('title:');
  });

  it('node SDC has url and body props', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain('url:');
    expect(yml).toContain('body:');
  });

  it('has slots section', () => {
    const yml = generateComponentYml(nodeTeaserSdc);
    expect(yml).toContain('slots:');
  });

  it('works with hero-banner block SDC', () => {
    const yml = generateComponentYml(heroBannerSdc);
    expect(yml).toContain("name: 'Hero Banner'");
    expect(yml).toContain("group: 'Block'");
  });
});

describe('generateComponentTwig', () => {
  it('node-teaser uses attach_library for hx-card', () => {
    const twig = generateComponentTwig(nodeTeaserSdc);
    expect(twig).toContain("attach_library('helixui/hx-card')");
  });

  it('node-teaser uses hx-card element', () => {
    const twig = generateComponentTwig(nodeTeaserSdc);
    expect(twig).toContain('<hx-card');
  });

  it('node-teaser renders title and url props', () => {
    const twig = generateComponentTwig(nodeTeaserSdc);
    expect(twig).toContain('{{ title }}');
    expect(twig).toContain('{{ url }}');
  });

  it('includes @file docblock comment', () => {
    const twig = generateComponentTwig(nodeTeaserSdc);
    expect(twig).toContain('@file');
  });

  it('block SDC uses attach_library for its components', () => {
    const twig = generateComponentTwig(heroBannerSdc);
    expect(twig).toContain("attach_library('helixui/hx-hero')");
  });

  it('block SDC has the correct CSS class', () => {
    const twig = generateComponentTwig(heroBannerSdc);
    expect(twig).toContain('hero-banner');
  });

  it('site-header twig uses hx-container and slot pattern', () => {
    const siteHeader: SDCDefinition = {
      name: 'site-header',
      group: 'block',
      helixComponents: ['hx-container'],
    };
    const twig = generateComponentTwig(siteHeader);
    expect(twig).toContain('hx-container');
    expect(twig).toContain('site-header__logo');
  });
});

describe('generateComponentCss', () => {
  it('generates BEM-scoped CSS for the component', () => {
    const css = generateComponentCss(nodeTeaserSdc);
    expect(css).toContain('.node-teaser {');
    expect(css).toContain('.node-teaser__body {');
  });

  it('uses HELiX CSS custom properties', () => {
    const css = generateComponentCss(nodeTeaserSdc);
    expect(css).toContain('var(--hx-');
  });

  it('works with block SDCs', () => {
    const css = generateComponentCss(heroBannerSdc);
    expect(css).toContain('.hero-banner {');
  });
});

describe('generateTemplateOverride', () => {
  it('generates an include call for the SDC', () => {
    const twig = generateTemplateOverride(nodeTeaserSdc, 'my_theme');
    expect(twig).toContain("include('my_theme:node-teaser')");
  });

  it('passes node variables for node template overrides', () => {
    const twig = generateTemplateOverride(nodeTeaserSdc, 'my_theme');
    expect(twig).toContain('node.label');
  });

  it('passes block variables for block template overrides', () => {
    const blockSdc: SDCDefinition = {
      name: 'site-header',
      group: 'block',
      helixComponents: ['hx-container'],
      templateOverride: 'block/block--system-branding-block.html.twig',
    };
    const twig = generateTemplateOverride(blockSdc, 'my_theme');
    expect(twig).toContain('block.label');
  });

  it('passes views variables for views template overrides', () => {
    const twig = generateTemplateOverride(contentGridSdc, 'my_theme');
    expect(twig).toContain('rows');
  });
});

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
  it('has :root block with commented out overrides', () => {
    const css = generateHelixOverridesCss();
    expect(css).toContain(':root {');
    expect(css).toContain('--hx-color-primary');
  });
});

describe('generateDockerCompose', () => {
  it('uses drupal:11-apache image', () => {
    const compose = generateDockerCompose('my_theme');
    expect(compose).toContain('drupal:11-apache');
  });

  it('references the theme directory in volume mount', () => {
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

describe('generateThemePhp', () => {
  it('starts with PHP opening tag', () => {
    const php = generateThemePhp('my_theme', standardPreset.sdcList);
    expect(php).toContain('<?php');
  });

  it('generates preprocess hooks for SDCs with templateOverride', () => {
    const php = generateThemePhp('my_theme', standardPreset.sdcList);
    // node-teaser has node templateOverride
    expect(php).toContain('function my_theme_preprocess_node');
  });

  it('generates block preprocess hook for block template overrides', () => {
    const php = generateThemePhp('my_theme', standardPreset.sdcList);
    // site-header has block templateOverride
    expect(php).toContain('function my_theme_preprocess_block');
  });
});
