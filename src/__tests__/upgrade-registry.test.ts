import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchLatestVersion,
  fetchLatestVersions,
  buildUpgradePlan,
  clearVersionCache,
} from '../commands/upgrade.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  clearVersionCache();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── fetchLatestVersion ─────────────────────────────────────────────────────

describe('fetchLatestVersion', () => {
  it('returns the version from the npm registry', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: '2.3.4' }),
    });

    const result = await fetchLatestVersion('@helix/core');
    expect(result).toBe('2.3.4');
    expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/%40helix%2Fcore/latest');
  });

  it('returns cached result on subsequent calls', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: '1.0.0' }),
    });

    await fetchLatestVersion('@helix/tokens');
    const result = await fetchLatestVersion('@helix/tokens');

    expect(result).toBe('1.0.0');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null for a 404 (unpublished package)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await fetchLatestVersion('@helix/nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for non-OK responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await fetchLatestVersion('@helix/core');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await fetchLatestVersion('@helix/core');
    expect(result).toBeNull();
  });

  it('returns null when response has no version field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ name: '@helix/core' }),
    });

    const result = await fetchLatestVersion('@helix/core');
    expect(result).toBeNull();
  });

  it('returns null when version is empty string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: '' }),
    });

    const result = await fetchLatestVersion('@helix/core');
    expect(result).toBeNull();
  });
});

// ─── fetchLatestVersions ────────────────────────────────────────────────────

describe('fetchLatestVersions', () => {
  it('fetches multiple packages in parallel', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ version: '2.0.0' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ version: '3.0.0' }),
      });

    const result = await fetchLatestVersions(['@helix/core', '@helix/tokens']);
    expect(result.get('@helix/core')).toBe('2.0.0');
    expect(result.get('@helix/tokens')).toBe('3.0.0');
    expect(result.size).toBe(2);
  });

  it('omits packages that failed to resolve', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ version: '2.0.0' }),
      })
      .mockRejectedValueOnce(new Error('network error'));

    const result = await fetchLatestVersions(['@helix/core', '@helix/tokens']);
    expect(result.size).toBe(1);
    expect(result.get('@helix/core')).toBe('2.0.0');
    expect(result.has('@helix/tokens')).toBe(false);
  });
});

// ─── buildUpgradePlan (async with registry) ─────────────────────────────────

describe('buildUpgradePlan', () => {
  it('marks packages as changed when registry has newer version', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: '2.0.0' }),
    });

    const plan = await buildUpgradePlan({
      '@helix/core': '^1.0.0',
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      name: '@helix/core',
      current: '^1.0.0',
      latest: '2.0.0',
      changed: true,
    });
  });

  it('marks packages as unchanged when already at latest', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: '1.0.0' }),
    });

    const plan = await buildUpgradePlan({
      '@helix/core': '^1.0.0',
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      name: '@helix/core',
      changed: false,
      latest: '1.0.0',
    });
  });

  it('falls back gracefully when registry is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    const plan = await buildUpgradePlan({
      '@helix/core': '^1.5.0',
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      name: '@helix/core',
      current: '^1.5.0',
      latest: '1.5.0',
      changed: false,
    });
  });

  it('handles mix of resolvable and unresolvable packages', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ version: '3.0.0' }),
      })
      .mockRejectedValueOnce(new Error('timeout'));

    const plan = await buildUpgradePlan({
      '@helix/core': '^1.0.0',
      '@helix/tokens': '^2.0.0',
    });

    expect(plan).toHaveLength(2);

    const corePlan = plan.find((entry) => entry.name === '@helix/core');
    const tokensPlan = plan.find((entry) => entry.name === '@helix/tokens');

    expect(corePlan).toMatchObject({ latest: '3.0.0', changed: true });
    expect(tokensPlan).toMatchObject({ latest: '2.0.0', changed: false });
  });
});
