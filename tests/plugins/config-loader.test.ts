import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { loadHelixRcHooks } from '../../src/plugins/config-loader.js';

const TEST_DIR = '/tmp/helix-test-config-loader';

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(TEST_DIR);
});

afterAll(async () => {
  await fs.remove(TEST_DIR);
});

describe('loadHelixRcHooks — no config', () => {
  it('returns empty array when .helixrc.json does not exist', async () => {
    const hooks = await loadHelixRcHooks(TEST_DIR);
    expect(hooks).toEqual([]);
  });
});

describe('loadHelixRcHooks — parsing', () => {
  it('returns empty array when .helixrc.json has no hooks key', async () => {
    await fs.writeJson(path.join(TEST_DIR, '.helixrc.json'), { other: 'stuff' });
    const hooks = await loadHelixRcHooks(TEST_DIR);
    expect(hooks).toEqual([]);
  });

  it('returns empty array when hooks object is empty', async () => {
    await fs.writeJson(path.join(TEST_DIR, '.helixrc.json'), { hooks: {} });
    const hooks = await loadHelixRcHooks(TEST_DIR);
    expect(hooks).toEqual([]);
  });

  it('throws on invalid JSON', async () => {
    await fs.writeFile(path.join(TEST_DIR, '.helixrc.json'), 'not valid json');
    await expect(loadHelixRcHooks(TEST_DIR)).rejects.toThrow('Failed to parse .helixrc.json');
  });

  it('throws when .helixrc.json is not an object', async () => {
    await fs.writeFile(path.join(TEST_DIR, '.helixrc.json'), '"just a string"');
    await expect(loadHelixRcHooks(TEST_DIR)).rejects.toThrow('.helixrc.json must be a JSON object');
  });
});

describe('loadHelixRcHooks — hook file resolution', () => {
  it('throws when hook file path cannot be resolved', async () => {
    await fs.writeJson(path.join(TEST_DIR, '.helixrc.json'), {
      hooks: { 'post-scaffold': './scripts/missing.js' },
    });
    await expect(loadHelixRcHooks(TEST_DIR)).rejects.toThrow('Hook file not found');
    await expect(loadHelixRcHooks(TEST_DIR)).rejects.toThrow('missing.js');
    await expect(loadHelixRcHooks(TEST_DIR)).rejects.toThrow(TEST_DIR);
  });

  it('loads a valid hook file and returns its function', async () => {
    const scriptDir = path.join(TEST_DIR, 'scripts');
    await fs.ensureDir(scriptDir);
    await fs.writeFile(
      path.join(scriptDir, 'hook.mjs'),
      `export default function hook(ctx) { return ctx; }\n`,
    );
    await fs.writeJson(path.join(TEST_DIR, '.helixrc.json'), {
      hooks: { 'post-scaffold': './scripts/hook.mjs' },
    });
    const hooks = await loadHelixRcHooks(TEST_DIR);
    expect(hooks).toHaveLength(1);
    expect(hooks[0].lifecycle).toBe('post-scaffold');
    expect(typeof hooks[0].hook).toBe('function');
  });

  it('loads hooks for all four lifecycle events', async () => {
    const scriptDir = path.join(TEST_DIR, 'scripts');
    await fs.ensureDir(scriptDir);
    for (const name of ['pre-scaffold', 'post-scaffold', 'pre-write', 'post-write']) {
      await fs.writeFile(
        path.join(scriptDir, `${name}.mjs`),
        `export default function hook(ctx) { return ctx; }\n`,
      );
    }
    await fs.writeJson(path.join(TEST_DIR, '.helixrc.json'), {
      hooks: {
        'pre-scaffold': './scripts/pre-scaffold.mjs',
        'post-scaffold': './scripts/post-scaffold.mjs',
        'pre-write': './scripts/pre-write.mjs',
        'post-write': './scripts/post-write.mjs',
      },
    });
    const hooks = await loadHelixRcHooks(TEST_DIR);
    expect(hooks).toHaveLength(4);
    const lifecycles = hooks.map((h) => h.lifecycle);
    expect(lifecycles).toContain('pre-scaffold');
    expect(lifecycles).toContain('post-scaffold');
    expect(lifecycles).toContain('pre-write');
    expect(lifecycles).toContain('post-write');
  });

  it('throws when hook file does not export a default function', async () => {
    const scriptDir = path.join(TEST_DIR, 'scripts');
    await fs.ensureDir(scriptDir);
    await fs.writeFile(
      path.join(scriptDir, 'bad.mjs'),
      `export const notAFunction = 'oops';\n`,
    );
    await fs.writeJson(path.join(TEST_DIR, '.helixrc.json'), {
      hooks: { 'pre-scaffold': './scripts/bad.mjs' },
    });
    await expect(loadHelixRcHooks(TEST_DIR)).rejects.toThrow(
      'must export a default function',
    );
  });
});
