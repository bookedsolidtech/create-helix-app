import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildUpgradePlan,
  detectHelixProject,
  getInstalledVersions,
  fetchLatestVersions,
  clearVersionCache,
  type UpgradePlan,
} from '../commands/upgrade.js';

// ---------------------------------------------------------------------------
// buildUpgradePlan
// ---------------------------------------------------------------------------

describe('buildUpgradePlan', () => {
  it('marks packages as changed when latest differs from installed', () => {
    const installed: Record<string, string> = {
      '@helix/core': '1.0.0',
      '@helix/ui': '^2.0.0',
    };
    const latest: Record<string, string> = {
      '@helix/core': '1.1.0',
      '@helix/ui': '2.0.0',
    };

    const plan = buildUpgradePlan(installed, latest);

    expect(plan).toHaveLength(2);
    const core = plan.find((p) => p.name === '@helix/core')!;
    expect(core.current).toBe('1.0.0');
    expect(core.latest).toBe('1.1.0');
    expect(core.changed).toBe(true);

    const ui = plan.find((p) => p.name === '@helix/ui')!;
    expect(ui.current).toBe('^2.0.0');
    expect(ui.latest).toBe('2.0.0');
    expect(ui.changed).toBe(false);
  });

  it('marks packages as unchanged when latest equals installed (after stripping prefix)', () => {
    const installed: Record<string, string> = {
      '@helix/core': '^1.2.3',
    };
    const latest: Record<string, string> = {
      '@helix/core': '1.2.3',
    };

    const plan = buildUpgradePlan(installed, latest);

    expect(plan[0].changed).toBe(false);
  });

  it('uses current version when package is absent from latestVersions', () => {
    const installed: Record<string, string> = {
      '@helix/core': '1.0.0',
    };
    const latest: Record<string, string> = {};

    const plan = buildUpgradePlan(installed, latest);

    expect(plan[0].latest).toBe('1.0.0');
    expect(plan[0].changed).toBe(false);
  });

  it('returns an empty array when installed is empty', () => {
    const plan = buildUpgradePlan({}, {});
    expect(plan).toHaveLength(0);
  });

  it('handles tilde prefix in installed version', () => {
    const installed: Record<string, string> = { '@helix/core': '~1.5.0' };
    const latest: Record<string, string> = { '@helix/core': '1.6.0' };

    const plan = buildUpgradePlan(installed, latest);

    expect(plan[0].changed).toBe(true);
    expect(plan[0].latest).toBe('1.6.0');
  });

  it('includes name, current, and latest fields on every entry', () => {
    const installed: Record<string, string> = { '@helixui/button': '3.0.0' };
    const latest: Record<string, string> = { '@helixui/button': '3.1.0' };

    const plan = buildUpgradePlan(installed, latest);

    expect(plan[0]).toMatchObject<UpgradePlan>({
      name: '@helixui/button',
      current: '3.0.0',
      latest: '3.1.0',
      changed: true,
    });
  });

  it('handles multiple packages with mixed upgrade states', () => {
    const installed: Record<string, string> = {
      '@helix/core': '^1.0.0',
      '@helix/theme': '^2.0.0',
      '@helixui/button': '^3.0.0',
    };
    const latest: Record<string, string> = {
      '@helix/core': '1.1.0',
      '@helix/theme': '2.0.0',
      '@helixui/button': '3.2.0',
    };

    const plan = buildUpgradePlan(installed, latest);

    expect(plan).toHaveLength(3);
    expect(plan.find((p) => p.name === '@helix/core')?.changed).toBe(true);
    expect(plan.find((p) => p.name === '@helix/theme')?.changed).toBe(false);
    expect(plan.find((p) => p.name === '@helixui/button')?.changed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchLatestVersions
// ---------------------------------------------------------------------------

describe('fetchLatestVersions', () => {
  beforeEach(() => {
    clearVersionCache();
    vi.restoreAllMocks();
  });

  it('returns a record of package name to version for successful fetches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.2.3' }),
      }),
    );

    const result = await fetchLatestVersions(['@helix/core']);

    expect(result).toEqual({ '@helix/core': '1.2.3' });
  });

  it('omits packages whose fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      }),
    );

    const result = await fetchLatestVersions(['@helix/nonexistent']);

    expect(result).toEqual({});
  });

  it('returns an empty record for an empty input array', async () => {
    const result = await fetchLatestVersions([]);
    expect(result).toEqual({});
  });

  it('encodes scoped package names correctly in the registry URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '4.0.0' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetchLatestVersions(['@helix/core']);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('%2F');
  });

  it('resolves multiple packages in parallel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '5.0.0' }),
      }),
    );

    const result = await fetchLatestVersions(['@helix/core', '@helix/theme']);

    expect(Object.keys(result)).toHaveLength(2);
  });

  it('uses the in-memory cache to avoid duplicate network calls', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '2.0.0' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await fetchLatestVersions(['@helix/core']);
    await fetchLatestVersions(['@helix/core']);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
