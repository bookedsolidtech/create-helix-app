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
import { readHelixRc } from '../plugins/config-loader.js';
import type { HelixRcConfig, HelixRcHookEntry } from '../plugins/config-loader.js';

// Note: loadHelixRcHooks uses the lifecycle-based schema (fs-extra) and is
// tested separately in tests/plugins/config-loader.test.ts

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

// loadHelixRcHooks uses the lifecycle-based schema and fs-extra, tested in
// tests/plugins/config-loader.test.ts. The HelixRcHookEntry type is exported
// for use in readHelixRc-based tooling.
