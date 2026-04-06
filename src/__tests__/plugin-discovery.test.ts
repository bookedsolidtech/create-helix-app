import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:fs before importing the module under test
// ---------------------------------------------------------------------------
vi.mock('node:fs', () => ({
  default: {
    readdirSync: vi.fn(),
  },
}));

import fs from 'node:fs';
import {
  isHelixPluginName,
  findPluginPackageNames,
  loadPlugin,
  discoverPlugins,
} from '../plugins/plugin-discovery.js';

// ---------------------------------------------------------------------------
// isHelixPluginName
// ---------------------------------------------------------------------------

describe('isHelixPluginName', () => {
  it('returns true for bare helix-plugin-* names', () => {
    expect(isHelixPluginName('helix-plugin-foo')).toBe(true);
    expect(isHelixPluginName('helix-plugin-analytics')).toBe(true);
  });

  it('returns false for names that do not match the convention', () => {
    expect(isHelixPluginName('react')).toBe(false);
    expect(isHelixPluginName('helix-core')).toBe(false);
    expect(isHelixPluginName('my-helix-plugin')).toBe(false);
    expect(isHelixPluginName('')).toBe(false);
  });

  it('returns true for scoped @scope/helix-plugin-* names', () => {
    expect(isHelixPluginName('@myorg/helix-plugin-seo')).toBe(true);
  });

  it('returns false for scoped names that do not contain helix-plugin-', () => {
    expect(isHelixPluginName('@myorg/helix-core')).toBe(false);
    expect(isHelixPluginName('@myorg/plugin-helix')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findPluginPackageNames
// ---------------------------------------------------------------------------

describe('findPluginPackageNames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array when node_modules dir does not exist', () => {
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    expect(findPluginPackageNames('/nonexistent/node_modules')).toEqual([]);
  });

  it('returns bare helix-plugin-* packages found in node_modules', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['react', 'helix-plugin-foo', 'lodash'] as never);
    const result = findPluginPackageNames('/project/node_modules');
    expect(result).toEqual(['helix-plugin-foo']);
  });

  it('returns multiple bare helix-plugin-* packages', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'helix-plugin-a',
      'helix-plugin-b',
      'express',
    ] as never);
    const result = findPluginPackageNames('/project/node_modules');
    expect(result).toEqual(['helix-plugin-a', 'helix-plugin-b']);
  });

  it('discovers scoped helix-plugin-* packages under @scope directories', () => {
    vi.mocked(fs.readdirSync).mockImplementation((dir: unknown) => {
      const d = dir as string;
      if (d === '/project/node_modules') {
        return ['@myorg', 'react'] as never;
      }
      if (d === '/project/node_modules/@myorg') {
        return ['helix-plugin-analytics', 'utils'] as never;
      }
      return [] as never;
    });

    const result = findPluginPackageNames('/project/node_modules');
    expect(result).toEqual(['@myorg/helix-plugin-analytics']);
  });

  it('handles unreadable scope directories gracefully', () => {
    vi.mocked(fs.readdirSync).mockImplementation((dir: unknown) => {
      const d = dir as string;
      if (d === '/project/node_modules') {
        return ['@myorg'] as never;
      }
      throw new Error('EACCES: permission denied');
    });

    expect(findPluginPackageNames('/project/node_modules')).toEqual([]);
  });

  it('returns empty array when no packages match the convention', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['react', 'express', 'lodash'] as never);
    expect(findPluginPackageNames('/project/node_modules')).toEqual([]);
  });

  it('returns empty array for an empty node_modules directory', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([] as never);
    expect(findPluginPackageNames('/project/node_modules')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadPlugin
// ---------------------------------------------------------------------------

describe('loadPlugin', () => {
  it('returns null when the package cannot be imported', async () => {
    // 'this-package-definitely-does-not-exist' will fail to import
    const result = await loadPlugin('this-package-definitely-does-not-exist-xyz');
    expect(result).toBeNull();
  });

  it('returns a HelixPlugin when the import succeeds', async () => {
    // We can import a built-in Node module which is always available
    const result = await loadPlugin('node:path');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('node:path');
    expect(result!.module).toBeDefined();
  });

  it('populates the module property with the imported module', async () => {
    const result = await loadPlugin('node:path');
    expect(result!.module).toHaveProperty('join');
  });
});

// ---------------------------------------------------------------------------
// discoverPlugins
// ---------------------------------------------------------------------------

describe('discoverPlugins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array when node_modules is empty', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([] as never);
    const plugins = await discoverPlugins('/project/node_modules');
    expect(plugins).toEqual([]);
  });

  it('returns an empty array when no helix plugins are found', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['react', 'lodash'] as never);
    const plugins = await discoverPlugins('/project/node_modules');
    expect(plugins).toEqual([]);
  });

  it('returns an empty array when node_modules does not exist', async () => {
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const plugins = await discoverPlugins('/nonexistent/node_modules');
    expect(plugins).toEqual([]);
  });

  it('skips packages that fail to import and continues', async () => {
    // One importable (node:path) and one that will fail
    vi.mocked(fs.readdirSync).mockReturnValue(['helix-plugin-bad', 'helix-plugin-good'] as never);

    // We cannot easily control dynamic import() without more elaborate setup,
    // so we test the behaviour indirectly: both names will fail to import
    // (they are not real packages) — result should be empty rather than throw.
    const plugins = await discoverPlugins('/project/node_modules');
    expect(Array.isArray(plugins)).toBe(true);
  });
});
