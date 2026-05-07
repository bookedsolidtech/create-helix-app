import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../scaffold.js';
import type { ProjectOptions } from '../types.js';

const TEST_DIR = '/tmp/helix-test-wc-storybook-docs';

function makeOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name: 'wcsb-docs',
    directory: path.join(TEST_DIR, overrides.name ?? 'wcsb-docs'),
    framework: 'wc-storybook',
    componentBundles: ['all'],
    typescript: true,
    eslint: true,
    designTokens: true,
    darkMode: false,
    installDeps: false,
    dsName: 'acme-ds',
    tokenPrefix: '--acme',
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(TEST_DIR);
});

afterAll(async () => {
  await fs.remove(TEST_DIR);
});

describe('scaffoldProject — wc-storybook docs defaults', () => {
  // ── Deliverable A: documentation MDX pages ─────────────────────────────────

  it('seeds all six Documentation MDX pages under src/stories/docs/', async () => {
    const opts = makeOptions({ name: 'docs-seed' });
    await scaffoldProject(opts);

    const docsDir = path.join(opts.directory, 'src', 'stories', 'docs');
    const expected = [
      'Overview.mdx',
      'Accessibility.mdx',
      'Color.mdx',
      'Typography.mdx',
      'Spacing.mdx',
      'Brand.mdx',
      'Layout.mdx',
    ];
    for (const file of expected) {
      const filePath = path.join(docsDir, file);
      expect(await fs.pathExists(filePath), `missing ${file}`).toBe(true);
    }
  });

  it('declares <Meta title="Documentation/..."> in every docs MDX page', async () => {
    const opts = makeOptions({ name: 'docs-meta' });
    await scaffoldProject(opts);

    const docsDir = path.join(opts.directory, 'src', 'stories', 'docs');
    const titles: Record<string, string> = {
      'Overview.mdx': 'Documentation/Overview',
      'Accessibility.mdx': 'Documentation/Accessibility',
      'Color.mdx': 'Documentation/Color',
      'Typography.mdx': 'Documentation/Typography',
      'Spacing.mdx': 'Documentation/Spacing',
      'Brand.mdx': 'Documentation/Brand',
      'Layout.mdx': 'Documentation/Layout',
    };
    for (const [file, title] of Object.entries(titles)) {
      const content = await fs.readFile(path.join(docsDir, file), 'utf8');
      expect(content).toContain(`<Meta title="${title}" />`);
      expect(content).toContain(`from '@storybook/addon-docs/blocks'`);
    }
  });

  it('emits proper markdown code spans (not escaped backticks) in MDX', async () => {
    const opts = makeOptions({ name: 'docs-codespans' });
    await scaffoldProject(opts);

    const docsDir = path.join(opts.directory, 'src', 'stories', 'docs');
    for (const file of await fs.readdir(docsDir)) {
      const content = await fs.readFile(path.join(docsDir, file), 'utf8');
      // The MDX must have plain `code` spans, never \`code\` (which would
      // render as a literal backslash-backtick pair in markdown).
      expect(content, `${file} contained an escaped backtick (\\\`)`).not.toMatch(/\\`/);
    }
  });

  it('Brand.mdx surfaces the consumer tokenPrefix in override examples', async () => {
    const opts = makeOptions({
      name: 'docs-brand-prefix',
      dsName: 'beacon',
      tokenPrefix: '--beacon',
    });
    await scaffoldProject(opts);

    const brand = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'docs', 'Brand.mdx'),
      'utf8',
    );
    expect(brand).toContain('--beacon-color-primary-500');
    expect(brand).toContain('--beacon-*');
  });

  it('Overview.mdx surfaces the consumer dsName in the title', async () => {
    const opts = makeOptions({
      name: 'docs-overview-dsname',
      dsName: 'beacon',
      tokenPrefix: '--beacon',
    });
    await scaffoldProject(opts);

    const overview = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'docs', 'Overview.mdx'),
      'utf8',
    );
    expect(overview).toMatch(/^# Beacon — Overview$/m);
  });

  // ── Deliverable C: helix.storybook.config.ts knob ─────────────────────────

  it('seeds helix.storybook.config.ts with components + docs include/exclude shape', async () => {
    const opts = makeOptions({ name: 'config-knob' });
    await scaffoldProject(opts);

    const cfgPath = path.join(opts.directory, 'helix.storybook.config.ts');
    expect(await fs.pathExists(cfgPath)).toBe(true);

    const cfg = await fs.readFile(cfgPath, 'utf8');
    expect(cfg).toContain('export interface HelixStorybookConfig');
    expect(cfg).toContain('components:');
    expect(cfg).toContain('docs:');
    expect(cfg).toContain("include: 'all'");
    expect(cfg).toContain('exclude: []');
    expect(cfg).toContain('export default config');
    expect(cfg).toContain('export type DocsPageId');
  });

  // ── Deliverable B: CEM-driven catalog reads the config knob ──────────────

  it('catalog generator imports HelixStorybookConfig type and applies include/exclude', async () => {
    const opts = makeOptions({ name: 'catalog-config' });
    await scaffoldProject(opts);

    const gen = await fs.readFile(
      path.join(opts.directory, 'scripts', 'generate-catalog.ts'),
      'utf8',
    );
    expect(gen).toContain('import type { HelixStorybookConfig }');
    expect(gen).toContain('helix.storybook.config.ts');
    expect(gen).toContain('shouldInclude');
    expect(gen).toContain('config.components');
    // HIPAA filter still runs unconditionally before the consumer config.
    expect(gen).toContain('isHipaaAdjacent');
  });

  // ── Storybook integration: storySort + main.ts pickup ─────────────────────

  it('preview.ts orders Documentation immediately after Welcome', async () => {
    const opts = makeOptions({ name: 'preview-sort' });
    await scaffoldProject(opts);

    const preview = await fs.readFile(
      path.join(opts.directory, '.storybook', 'preview.ts'),
      'utf8',
    );
    // The order array should list Documentation right after Welcome.
    expect(preview).toMatch(/'Welcome',\s*\n\s*'Documentation',/);
    // And explicit page order under Documentation matching the seeded files.
    expect(preview).toContain("'Overview', 'Accessibility', 'Color'");
  });

  it('main.ts globs include the docs MDX files', async () => {
    const opts = makeOptions({ name: 'main-glob' });
    await scaffoldProject(opts);

    const main = await fs.readFile(path.join(opts.directory, '.storybook', 'main.ts'), 'utf8');
    // The MDX glob already covers ../src/**/*.mdx — confirm it's there.
    expect(main).toContain("'../src/**/*.mdx'");
  });

  // ── A11y MDX content sanity ────────────────────────────────────────────────

  it('Accessibility.mdx covers focus rings, contrast pairings, and WCAG SC list', async () => {
    const opts = makeOptions({ name: 'a11y-content' });
    await scaffoldProject(opts);

    const a11y = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'docs', 'Accessibility.mdx'),
      'utf8',
    );
    expect(a11y).toContain('Focus indicators');
    expect(a11y).toContain('Contrast');
    expect(a11y).toContain('Never color alone');
    expect(a11y).toMatch(/WCAG 2\.1/);
    expect(a11y).toContain('44px');
    expect(a11y).toContain('Keyboard contracts');
    expect(a11y).toContain('1.4.1');
    expect(a11y).toContain('1.4.3');
    expect(a11y).toContain('2.5.5');
  });

  it('Spacing.mdx covers density modes and the 4px scale', async () => {
    const opts = makeOptions({ name: 'spacing-content' });
    await scaffoldProject(opts);

    const spacing = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'docs', 'Spacing.mdx'),
      'utf8',
    );
    expect(spacing).toContain('Density modes');
    expect(spacing).toContain('Compact');
    expect(spacing).toContain('Touch');
    expect(spacing).toContain('space-4');
    expect(spacing).toContain('space-8');
  });

  it('Layout.mdx documents the responsive mobile/tablet/desktop modes', async () => {
    const opts = makeOptions({ name: 'layout-content' });
    await scaffoldProject(opts);

    const layout = await fs.readFile(
      path.join(opts.directory, 'src', 'stories', 'docs', 'Layout.mdx'),
      'utf8',
    );
    expect(layout).toMatch(/mobile.*tablet.*desktop/i);
    expect(layout).toContain('prefers-reduced-motion');
    expect(layout).toContain('44');
  });
});
