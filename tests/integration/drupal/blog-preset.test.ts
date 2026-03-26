import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldDrupalTheme } from '../../../src/generators/drupal-theme.js';
import { makeTmpRoot, removeTempDir, assertFilesExist, readText, listSubdirs } from '../setup.js';

const ROOT = makeTmpRoot('drupal-blog');

// blog preset: standard (7) + blog-specific (5) = 12 SDCs
const STANDARD_SDCS = [
  'node-teaser',
  'views-grid',
  'hero-banner',
  'site-header',
  'site-footer',
  'breadcrumb',
  'search-form',
];
const BLOG_SPECIFIC_SDCS = [
  'article-full',
  'author-byline',
  'related-articles',
  'tag-cloud',
  'newsletter-signup',
];
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
      'helixui.libraries.yml',
      'package.json',
      'composer.json',
      'src/behaviors/blog-behaviors.js',
    ]);
  });

  it('theme info YAML contains blog preset reference', async () => {
    const dir = path.join(ROOT, 'blog-info');
    await scaffoldDrupalTheme({ themeName: 'test_blog_info', directory: dir, preset: 'blog' });
    const info = await readText(dir, 'test_blog_info.info.yml');
    expect(info).toContain('blog');
    expect(info).toContain('core_version_requirement: ^10 || ^11');
  });

  it('creates exactly 12 SDC component directories', async () => {
    const dir = path.join(ROOT, 'blog-count');
    await scaffoldDrupalTheme({ themeName: 'test_blog_count', directory: dir, preset: 'blog' });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    expect(sdcDirs).toHaveLength(12);
  });

  it('all blog-specific SDC directories are present', async () => {
    const dir = path.join(ROOT, 'blog-specific');
    await scaffoldDrupalTheme({ themeName: 'test_blog_sdcs', directory: dir, preset: 'blog' });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    for (const sdc of BLOG_SPECIFIC_SDCS) {
      expect(sdcDirs).toContain(sdc);
    }
  });

  it('inherits all standard SDC directories', async () => {
    const dir = path.join(ROOT, 'blog-inherited');
    await scaffoldDrupalTheme({
      themeName: 'test_blog_inherited',
      directory: dir,
      preset: 'blog',
    });
    const sdcDirs = await listSubdirs(path.join(dir, 'src', 'components'));
    for (const sdc of STANDARD_SDCS) {
      expect(sdcDirs).toContain(sdc);
    }
  });

  it('each SDC directory contains .component.yml and .twig files', async () => {
    const dir = path.join(ROOT, 'blog-sdc-files');
    await scaffoldDrupalTheme({
      themeName: 'test_blog_sdc_files',
      directory: dir,
      preset: 'blog',
    });
    for (const sdc of ALL_BLOG_SDCS) {
      await assertFilesExist(dir, [
        `src/components/${sdc}/${sdc}.component.yml`,
        `src/components/${sdc}/${sdc}.twig`,
      ]);
    }
  });

  it('helixui.libraries.yml contains blog-specific SDC entries', async () => {
    const dir = path.join(ROOT, 'blog-libs');
    await scaffoldDrupalTheme({ themeName: 'test_blog_libs', directory: dir, preset: 'blog' });
    const libs = await readText(dir, 'helixui.libraries.yml');
    expect(libs).toContain('provider: cdn');
    for (const sdc of BLOG_SPECIFIC_SDCS) {
      expect(libs).toContain(`helixui.${sdc}:`);
    }
  });

  it('package.json has @helixui/drupal-starter and @helixui/tokens', async () => {
    const dir = path.join(ROOT, 'blog-pkg');
    await scaffoldDrupalTheme({ themeName: 'test_blog_pkg', directory: dir, preset: 'blog' });
    const pkg = await readText(dir, 'package.json');
    expect(pkg).toContain('@helixui/drupal-starter');
    expect(pkg).toContain('@helixui/tokens');
  });

  it('behaviors file uses once() pattern and is named blog-behaviors.js', async () => {
    const dir = path.join(ROOT, 'blog-behaviors');
    await scaffoldDrupalTheme({
      themeName: 'test_blog_behaviors',
      directory: dir,
      preset: 'blog',
    });
    const behaviors = await readText(dir, 'src/behaviors/blog-behaviors.js');
    expect(behaviors).toContain("once('");
  });
});
