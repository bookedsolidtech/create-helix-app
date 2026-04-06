import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:fs before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

// Mock @clack/prompts to prevent TUI side effects in tests
vi.mock('@clack/prompts', () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
}));

// Mock network module to avoid real disk I/O in tests
vi.mock('../network.js', () => ({
  readRegistryCache: vi.fn(() => null),
  writeRegistryCache: vi.fn(),
}));

// Mock validation to keep runUpgrade testable without real path checks
vi.mock('../validation.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../validation.js')>();
  return { ...original };
});

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import fs from 'node:fs';
import {
  detectHelixProject,
  getInstalledVersions,
  runUpgrade,
  clearVersionCache,
} from '../commands/upgrade.js';

// ---------------------------------------------------------------------------
// detectHelixProject
// ---------------------------------------------------------------------------

describe('detectHelixProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when package.json has a @helix/ dependency', () => {
    const pkg = JSON.stringify({
      dependencies: { '@helix/core': '^1.0.0' },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    expect(detectHelixProject('/project')).toBe(true);
  });

  it('returns true when package.json has a @helixui/ dependency', () => {
    const pkg = JSON.stringify({
      dependencies: { '@helixui/button': '^1.0.0' },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    expect(detectHelixProject('/project')).toBe(true);
  });

  it('returns true when helix dependency is in devDependencies', () => {
    const pkg = JSON.stringify({
      devDependencies: { '@helix/tokens': '^0.3.0' },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    expect(detectHelixProject('/project')).toBe(true);
  });

  it('returns false when package.json has no helix dependencies', () => {
    const pkg = JSON.stringify({
      dependencies: { react: '^18.0.0', lodash: '^4.0.0' },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    expect(detectHelixProject('/project')).toBe(false);
  });

  it('returns false when package.json does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
    });

    expect(detectHelixProject('/no-project')).toBe(false);
  });

  it('returns false when package.json has no dependencies at all', () => {
    const pkg = JSON.stringify({ name: 'my-app', version: '1.0.0' });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    expect(detectHelixProject('/project')).toBe(false);
  });

  it('returns false when package.json contains invalid JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{ bad json' as never);

    expect(detectHelixProject('/project')).toBe(false);
  });

  it('returns true when helix packages are mixed across dependencies and devDependencies', () => {
    const pkg = JSON.stringify({
      dependencies: { '@helix/core': '^1.0.0', react: '^18.0.0' },
      devDependencies: { '@helixui/tokens': '^0.3.0' },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    expect(detectHelixProject('/project')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getInstalledVersions
// ---------------------------------------------------------------------------

describe('getInstalledVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only @helix/* and @helixui/* packages', () => {
    const pkg = JSON.stringify({
      dependencies: {
        '@helix/core': '^1.0.0',
        react: '^19.0.0',
        '@helixui/button': '^2.0.0',
      },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    const result = getInstalledVersions('/project');

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['@helix/core']).toBe('^1.0.0');
    expect(result['@helixui/button']).toBe('^2.0.0');
    expect(result['react']).toBeUndefined();
  });

  it('returns packages from both dependencies and devDependencies', () => {
    const pkg = JSON.stringify({
      dependencies: { '@helix/core': '^1.0.0' },
      devDependencies: { '@helix/tokens': '^0.3.0' },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    const result = getInstalledVersions('/project');

    expect(result['@helix/core']).toBe('^1.0.0');
    expect(result['@helix/tokens']).toBe('^0.3.0');
  });

  it('returns an empty object when package.json does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
    });

    expect(getInstalledVersions('/no-project')).toEqual({});
  });

  it('returns an empty object when no helix packages are installed', () => {
    const pkg = JSON.stringify({ dependencies: { react: '^18.0.0' } });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    expect(getInstalledVersions('/project')).toEqual({});
  });

  it('returns an empty object when package.json has no dependencies sections', () => {
    const pkg = JSON.stringify({ name: 'my-app' });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    expect(getInstalledVersions('/project')).toEqual({});
  });

  it('preserves version strings exactly as written in package.json', () => {
    const pkg = JSON.stringify({
      dependencies: { '@helix/core': '~1.2.3' },
    });
    vi.mocked(fs.readFileSync).mockReturnValue(pkg as never);

    const result = getInstalledVersions('/project');
    expect(result['@helix/core']).toBe('~1.2.3');
  });
});

// ---------------------------------------------------------------------------
// runUpgrade — orchestration (error paths and early exits)
// ---------------------------------------------------------------------------

describe('runUpgrade — invalid directory', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    clearVersionCache();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls process.exit(1) when the directory contains a path traversal', async () => {
    await expect(runUpgrade('../../../etc')).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) when the directory contains null bytes', async () => {
    await expect(runUpgrade('/project\0evil')).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('runUpgrade — no helix project detected', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    clearVersionCache();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
    // Simulate a non-helix project
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ dependencies: { react: '^18.0.0' } }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls process.exit(1) when no HELiX packages are detected', async () => {
    await expect(runUpgrade('/project')).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('runUpgrade — offline mode with no cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVersionCache();
    vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
    // Simulate a helix project with no upgrades needed
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ dependencies: { '@helix/core': '^1.0.0' } }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('completes without error in offline mode when no cache is available', async () => {
    // readRegistryCache returns null (no cache) — set up in vi.mock above
    await expect(runUpgrade('/project', { offline: true })).resolves.not.toThrow();
  });
});

describe('runUpgrade — dry run mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVersionCache();
    vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
    // Stub fetch so fetchLatestVersions succeeds
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '2.0.0' }),
      }),
    );
    // Simulate a helix project with an upgradeable package
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ dependencies: { '@helix/core': '^1.0.0' } }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not write package.json in dry-run mode', async () => {
    await runUpgrade('/project', { dryRun: true });
    expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
  });
});

describe('runUpgrade — all packages up to date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVersionCache();
    vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
    // Stub fetch to return same version as installed
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.0.0' }),
      }),
    );
    // Simulate a helix project (version matches what fetch returns)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ dependencies: { '@helix/core': '^1.0.0' } }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not write package.json when all packages are already up to date', async () => {
    await runUpgrade('/project');
    expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
  });
});

describe('runUpgrade — network failure (all fetches fail)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVersionCache();
    vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
    // Stub fetch to always fail
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    // Simulate a helix project
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ dependencies: { '@helix/core': '^1.0.0' } }) as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('completes without throwing when all registry fetches fail', async () => {
    // When all fetches fail, buildUpgradePlan uses installed versions → no changes → no write
    await expect(runUpgrade('/project')).resolves.not.toThrow();
    expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
  });
});
