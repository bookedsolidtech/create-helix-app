import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:fs before importing the module under test
// ---------------------------------------------------------------------------
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
}));

import fs from 'node:fs';
import { readHelixRc, loadHelixRcHooks } from '../plugins/config-loader.js';
import type { HelixRcConfig, HelixRcHookEntry } from '../plugins/config-loader.js';

// ---------------------------------------------------------------------------
// readHelixRc
// ---------------------------------------------------------------------------

describe('readHelixRc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    });

    expect(readHelixRc('/project')).toBeNull();
  });

  it('throws a SyntaxError when the file contains invalid JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{ not valid json' as never);

    expect(() => readHelixRc('/project')).toThrow(SyntaxError);
  });

  it('returns the parsed config when the file contains valid JSON', () => {
    const config: HelixRcConfig = { hooks: [{ name: 'beforeScaffold', handler: './my-hook.js' }] };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config) as never);

    const result = readHelixRc('/project');
    expect(result).toEqual(config);
  });

  it('returns an empty config object when the file is an empty JSON object', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never);

    expect(readHelixRc('/project')).toEqual({});
  });

  it('reads from the correct path: <projectRoot>/.helixrc.json', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never);
    readHelixRc('/my-project');

    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('.helixrc.json'),
      'utf8',
    );
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('my-project'),
      'utf8',
    );
  });

  it('returns a config with arbitrary extra top-level properties', () => {
    const raw = JSON.stringify({ someKey: 'someValue', anotherKey: 42 });
    vi.mocked(fs.readFileSync).mockReturnValue(raw as never);

    const result = readHelixRc('/project');
    expect(result?.someKey).toBe('someValue');
    expect(result?.anotherKey).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// loadHelixRcHooks
// ---------------------------------------------------------------------------

describe('loadHelixRcHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array when .helixrc.json does not exist', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const hooks = await loadHelixRcHooks('/project');
    expect(hooks).toEqual([]);
  });

  it('returns an empty array when config has no hooks array', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never);

    const hooks = await loadHelixRcHooks('/project');
    expect(hooks).toEqual([]);
  });

  it('returns an empty array when config.hooks is an empty array', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ hooks: [] }) as never);

    const hooks = await loadHelixRcHooks('/project');
    expect(hooks).toEqual([]);
  });

  it('skips entries that are missing name or handler', async () => {
    const config = {
      hooks: [
        { name: '', handler: './handler.js' },
        { name: 'beforeScaffold', handler: '' },
      ],
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config) as never);

    const hooks = await loadHelixRcHooks('/project');
    expect(hooks).toEqual([]);
  });

  it('calls onError when a handler module cannot be imported', async () => {
    const config = {
      hooks: [{ name: 'beforeScaffold', handler: './nonexistent-handler.js' }],
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config) as never);

    const onError = vi.fn();
    const hooks = await loadHelixRcHooks('/project', onError);

    expect(hooks).toEqual([]);
    expect(onError).toHaveBeenCalledOnce();

    const [entry, err] = onError.mock.calls[0] as [HelixRcHookEntry, unknown];
    expect(entry.name).toBe('beforeScaffold');
    expect(err).toBeInstanceOf(Error);
  });

  it('continues loading remaining hooks after one fails', async () => {
    const config = {
      hooks: [
        { name: 'bad', handler: './nonexistent.js' },
        { name: 'also-bad', handler: './also-nonexistent.js' },
      ],
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config) as never);

    const errors: HelixRcHookEntry[] = [];
    await loadHelixRcHooks('/project', (entry) => {
      errors.push(entry);
    });

    expect(errors).toHaveLength(2);
    expect(errors[0].name).toBe('bad');
    expect(errors[1].name).toBe('also-bad');
  });

  it('does not call onError when onError is not provided and a handler fails', async () => {
    const config = {
      hooks: [{ name: 'failing', handler: './no-such-module.js' }],
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config) as never);

    // Should not throw
    await expect(loadHelixRcHooks('/project')).resolves.toEqual([]);
  });

  it('throws a SyntaxError upward when .helixrc.json contains invalid JSON', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{ bad json' as never);

    await expect(loadHelixRcHooks('/project')).rejects.toThrow(SyntaxError);
  });
});
