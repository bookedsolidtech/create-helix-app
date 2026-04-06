import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText } from '../setup.js';

const ROOT = makeTmpRoot('drupal-blog');

// blog preset: standard (7) + blog-specific (5) = 12 SDCs
const STANDARD_SDCS = [
  { name: 'node-teaser', group: 'node' },
  { name: 'content-grid', group: 'views' },
  { name: 'site-header', group: 'block' },
  { name: 'site-footer', group: 'block' },
  { name: 'breadcrumb', group: 'block' },
  { name: 'search-form', group: 'block' },
  { name: 'hero-banner', group: 'block' },
] as const;

const BLOG_SPECIFIC_SDCS = [
  { name: 'article-full', group: 'node' },
  { name: 'author-byline', group: 'node' },
  { name: 'related-articles', group: 'views' },
  { name: 'tag-cloud', group: 'block' },
  { name: 'newsletter-signup', group: 'block' },
] as const;

const ALL_BLOG_SDCS = [...STANDARD_SDCS, ...BLOG_SPECIFIC_SDCS];

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('drupal blog preset integration', () => {
  it('generates all required theme files', async () => {
    const dir = path.join(ROOT, 'blog-files');
    await scaffoldDrupalTheme({ themeName: 'test_blog', directory: dir, preset: 'blog' });
    await assertFilesExist(dir, [
      'test_blog.info.yml',
      'test_blog.libraries.yml',
      'test_blog.theme',
      'package.json',
      'composer.json',
      'css/style.css',
      'js/behaviors.js',
      'docker/docker-compose.yml',
    ]);
  });

  it('theme info YAML contains blog preset reference', async () => {
    const dir = path.join(ROOT, 'blog-info');
    await scaffoldDrupalTheme({ themeName: 'test_blog_info', directory: dir, preset: 'blog' });
    const info = await readText(dir, 'test_blog_info.info.yml');
    expect(info).toContain('blog');
    expect(info).toContain('core_version_requirement: ^10 || ^11');
    expect(info).toContain("path: 'components'");
  });

  it('creates all 12 SDC component directories across correct groups', async () => {
    const dir = path.join(ROOT, 'blog-count');
    await scaffoldDrupalTheme({ themeName: 'test_blog_count', directory: dir, preset: 'blog' });
    for (const sdc of ALL_BLOG_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('all blog-specific SDC directories are present', async () => {
    const dir = path.join(ROOT, 'blog-specific');
    await scaffoldDrupalTheme({ themeName: 'test_blog_sdcs', directory: dir, preset: 'blog' });
    for (const sdc of BLOG_SPECIFIC_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('inherits all standard SDC directories', async () => {
    const dir = path.join(ROOT, 'blog-inherited');
    await scaffoldDrupalTheme({
      themeName: 'test_blog_inherited',
      directory: dir,
      preset: 'blog',
    });
    for (const sdc of STANDARD_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
      ]);
    }
  });

  it('each SDC directory contains .component.yml, .twig, and .css files', async () => {
    const dir = path.join(ROOT, 'blog-sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_blog_sdc_files',
      directory: dir,
      preset: 'blog',
    });
    for (const sdc of ALL_BLOG_SDCS) {
      await assertFilesExist(dir, [
        `components/${sdc.group}/${sdc.name}/${sdc.name}.component.yml`,
        `components/${sdc.group}/${sdc.name}/${sdc.name}.twig`,
        `components/${sdc.group}/${sdc.name}/${sdc.name}.css`,
      ]);
    }
  });

  it('generates template override for article-full', async () => {
    const dir = path.join(ROOT, 'blog-templates');
    await scaffoldDrupalTheme({ themeName: 'test_blog_tmpl', directory: dir, preset: 'blog' });
    await assertFilesExist(dir, ['templates/node/node--article--full.html.twig']);
  });

  it('package.json has @helixui/drupal-starter and @helixui/tokens', async () => {
    const dir = path.join(ROOT, 'blog-pkg');
    await scaffoldDrupalTheme({ themeName: 'test_blog_pkg', directory: dir, preset: 'blog' });
    const pkg = await readText(dir, 'package.json');
    expect(pkg).toContain('@helixui/drupal-starter');
    expect(pkg).toContain('@helixui/tokens');
  });

  it('behaviors file uses once() pattern', async () => {
    const dir = path.join(ROOT, 'blog-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_blog_behaviors',
      directory: dir,
      preset: 'blog',
    });
    const behaviors = await readText(dir, 'js/behaviors.js');
    expect(behaviors).toContain("once('");
    expect(behaviors).toContain('Drupal.behaviors');
  });
});
