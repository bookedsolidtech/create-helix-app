import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { discoverPlugins } from '../../src/plugins/plugin-discovery.js';

const TEST_DIR = '/tmp/helix-test-plugin-discovery';

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(TEST_DIR);
});

afterAll(async () => {
  await fs.remove(TEST_DIR);
});

async function createPlugin(pluginName: string, content: string, pkgMain?: string): Promise<void> {
  const pluginDir = path.join(TEST_DIR, 'node_modules', pluginName);
  await fs.ensureDir(pluginDir);
  const mainFile = pkgMain ?? 'index.mjs';
  await fs.writeFile(path.join(pluginDir, mainFile), content);
  await fs.writeJson(path.join(pluginDir, 'package.json'), {
    name: pluginName,
    version: '1.0.0',
    main: mainFile,
  });
}

describe('discoverPlugins — no node_modules', () => {
  it('returns empty array when no node_modules directory', async () => {
    const plugins = await discoverPlugins(TEST_DIR);
    expect(plugins).toEqual([]);
  });
});

describe('discoverPlugins — plugin scanning', () => {
  it('ignores packages that do not start with create-helix-plugin-', async () => {
    await fs.ensureDir(path.join(TEST_DIR, 'node_modules', 'some-other-package'));
    const plugins = await discoverPlugins(TEST_DIR);
    expect(plugins).toEqual([]);
  });

  it('discovers a valid plugin with post-scaffold hook', async () => {
    await createPlugin(
      'create-helix-plugin-logger',
      `export default { hooks: { 'post-scaffold': function(ctx) { return ctx; } } };\n`,
    );
    const plugins = await discoverPlugins(TEST_DIR);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('create-helix-plugin-logger');
    expect(plugins[0].lifecycle).toBe('post-scaffold');
    expect(typeof plugins[0].hook).toBe('function');
  });

  it('discovers multiple hooks from one plugin', async () => {
    await createPlugin(
      'create-helix-plugin-multi',
      `export default { hooks: { 'pre-scaffold': (ctx) => ctx, 'post-scaffold': (ctx) => ctx } };\n`,
    );
    const plugins = await discoverPlugins(TEST_DIR);
    expect(plugins).toHaveLength(2);
    expect(plugins.map((p) => p.lifecycle)).toContain('pre-scaffold');
    expect(plugins.map((p) => p.lifecycle)).toContain('post-scaffold');
  });

  it('discovers plugins from multiple packages', async () => {
    await createPlugin(
      'create-helix-plugin-alpha',
      `export default { hooks: { 'pre-scaffold': (ctx) => ctx } };\n`,
    );
    await createPlugin(
      'create-helix-plugin-beta',
      `export default { hooks: { 'post-scaffold': (ctx) => ctx } };\n`,
    );
    const plugins = await discoverPlugins(TEST_DIR);
    expect(plugins).toHaveLength(2);
  });
});

describe('discoverPlugins — invalid plugins', () => {
  it('logs warning and continues when plugin has no hooks', async () => {
    await createPlugin('create-helix-plugin-empty', `export default { name: 'empty-plugin' };\n`);
    const plugins = await discoverPlugins(TEST_DIR);
    expect(plugins).toEqual([]);
  });

  it('logs warning and continues when plugin hook is not a function', async () => {
    await createPlugin(
      'create-helix-plugin-bad-hook',
      `export default { hooks: { 'post-scaffold': 'not-a-function' } };\n`,
    );
    const plugins = await discoverPlugins(TEST_DIR);
    expect(plugins).toEqual([]);
  });

  it('logs warning and continues when plugin fails to load', async () => {
    // Create a package directory without a valid entry point
    const pluginDir = path.join(TEST_DIR, 'node_modules', 'create-helix-plugin-broken');
    await fs.ensureDir(pluginDir);
    await fs.writeJson(path.join(pluginDir, 'package.json'), {
      name: 'create-helix-plugin-broken',
      version: '1.0.0',
      main: 'nonexistent.js',
    });
    // Should not throw — just warns and skips
    const plugins = await discoverPlugins(TEST_DIR);
    expect(plugins).toEqual([]);
  });

  it('ignores unknown lifecycle names', async () => {
    await createPlugin(
      'create-helix-plugin-unknown-lifecycle',
      `export default { hooks: { 'unknown-event': (ctx) => ctx } };\n`,
    );
    const plugins = await discoverPlugins(TEST_DIR);
    expect(plugins).toEqual([]);
  });

  it('continues discovering valid plugins after encountering invalid one', async () => {
    // Invalid plugin first
    const badDir = path.join(TEST_DIR, 'node_modules', 'create-helix-plugin-bad');
    await fs.ensureDir(badDir);
    await fs.writeJson(path.join(badDir, 'package.json'), {
      name: 'create-helix-plugin-bad',
      version: '1.0.0',
      main: 'nonexistent.js',
    });

    // Valid plugin second
    await createPlugin(
      'create-helix-plugin-good',
      `export default { hooks: { 'post-scaffold': (ctx) => ctx } };\n`,
    );

    const plugins = await discoverPlugins(TEST_DIR);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('create-helix-plugin-good');
  });
});
