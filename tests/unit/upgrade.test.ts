import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// Mock the network layer so runUpgrade is deterministic in unit tests —
// detectOffline() must not make a real HTTPS probe, and readRegistryCache()
// must not touch the real ~/.helix cache. Tests override these per-case via
// vi.mocked(...) to drive the offline / cached-data paths.
vi.mock('../../src/network.js', () => ({
  detectOffline: vi.fn(async () => false),
  readRegistryCache: vi.fn(() => null),
  writeRegistryCache: vi.fn(),
}));

import {
  detectHelixProject,
  getInstalledVersions,
  buildUpgradePlan,
  compareSemver,
  fetchLatestVersions,
  clearVersionCache,
  resolveHelixDir,
  runUpgrade,
} from '../../src/commands/upgrade.js';
import { detectOffline, readRegistryCache } from '../../src/network.js';
import { HELIX_ICONS_VERSION } from '../../src/helix-versions.js';

/** Helper: create a temp directory with a package.json. */
function makeTmpProject(pkgJson: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-upgrade-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf-8');
  return dir;
}

/** Helper: create a temp directory without a package.json. */
function makeTmpDirOnly(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'helix-upgrade-'));
}

/**
 * Stub versions used in buildUpgradePlan tests to mirror what the registry
 * would return for known HELiX packages (so tests don't depend on real network).
 */
const STUB_LATEST: Record<string, string> = {
  '@helix/core': '1.0.0',
  '@helix/tokens': '1.0.0',
  '@helix/components': '1.0.0',
  '@helix/icons': '1.0.0',
  '@helix/utils': '1.0.0',
  '@helixui/react': '1.0.0',
  '@helixui/vue': '1.0.0',
  '@helixui/angular': '1.0.0',
  '@helixui/svelte': '1.0.0',
  '@helixui/lit': '1.0.0',
  '@helixui/solid': '1.0.0',
  '@helixui/qwik': '1.0.0',
  '@helixui/preact': '1.0.0',
  '@helixui/stencil': '1.0.0',
};

describe('upgrade command', () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    // Reset the network-layer mocks to their online/no-cache defaults so a
    // per-test override (mockResolvedValueOnce / mockReturnValueOnce) never
    // leaks into the next test.
    vi.mocked(detectOffline).mockResolvedValue(false);
    vi.mocked(readRegistryCache).mockReturnValue(null);
  });

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearVersionCache();
  });

  // ─── detectHelixProject ──────────────────────────────────────────────────

  describe('detectHelixProject', () => {
    it('returns true for a project with @helix/* deps', () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^0.5.0', react: '^18.0.0' },
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(true);
    });

    it('returns true for a project with @helixui/* deps', () => {
      const dir = makeTmpProject({
        name: 'test-project',
        devDependencies: { '@helixui/react': '^0.3.0' },
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(true);
    });

    it('returns true when HELiX packages are only in devDependencies', () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { react: '^18.0.0' },
        devDependencies: { '@helix/tokens': '^0.2.0' },
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(true);
    });

    it('returns true when HELiX packages are in both deps and devDeps', () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^0.5.0' },
        devDependencies: { '@helixui/react': '^0.3.0' },
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(true);
    });

    it('returns false for a non-helix project', () => {
      const dir = makeTmpProject({
        name: 'generic-project',
        dependencies: { react: '^18.0.0', lodash: '^4.0.0' },
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(false);
    });

    it('returns false when no package.json exists', () => {
      const dir = makeTmpDirOnly();
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(false);
    });

    it('returns false when package.json has empty dependencies', () => {
      const dir = makeTmpProject({
        name: 'empty-deps',
        dependencies: {},
        devDependencies: {},
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(false);
    });

    it('returns false when package.json has no dependency fields', () => {
      const dir = makeTmpProject({
        name: 'bare-project',
        version: '1.0.0',
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(false);
    });

    it('returns false for packages with similar-but-wrong prefixes', () => {
      const dir = makeTmpProject({
        name: 'tricky-project',
        dependencies: {
          '@helixdata/client': '^1.0.0',
          'helix-core': '^2.0.0',
          '@helixthing/utils': '^1.0.0',
        },
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(false);
    });

    it('returns false for a nonexistent directory', () => {
      expect(detectHelixProject('/tmp/nonexistent-helix-dir-' + Date.now())).toBe(false);
    });
  });

  // ─── getInstalledVersions ────────────────────────────────────────────────

  describe('getInstalledVersions', () => {
    it('returns only helix packages from both deps and devDeps', () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^0.5.0', react: '^18.0.0' },
        devDependencies: { '@helixui/react': '^0.3.0', vitest: '^1.0.0' },
      });
      tmpDirs.push(dir);

      const versions = getInstalledVersions(dir);

      expect(versions).toEqual({
        '@helix/core': '^0.5.0',
        '@helixui/react': '^0.3.0',
      });
    });

    it('ignores all non-HELiX packages', () => {
      const dir = makeTmpProject({
        name: 'mixed-project',
        dependencies: {
          react: '^18.0.0',
          lodash: '^4.17.21',
          '@helix/core': '^0.5.0',
          typescript: '^5.0.0',
        },
      });
      tmpDirs.push(dir);

      const versions = getInstalledVersions(dir);
      expect(Object.keys(versions)).toHaveLength(1);
      expect(versions['@helix/core']).toBe('^0.5.0');
    });

    it('returns empty object for non-helix project', () => {
      const dir = makeTmpProject({
        name: 'generic',
        dependencies: { react: '^18.0.0' },
      });
      tmpDirs.push(dir);

      expect(getInstalledVersions(dir)).toEqual({});
    });

    it('returns empty object when no package.json', () => {
      const dir = makeTmpDirOnly();
      tmpDirs.push(dir);

      expect(getInstalledVersions(dir)).toEqual({});
    });

    it('returns empty object when dependencies fields are empty', () => {
      const dir = makeTmpProject({
        name: 'empty-deps',
        dependencies: {},
        devDependencies: {},
      });
      tmpDirs.push(dir);

      expect(getInstalledVersions(dir)).toEqual({});
    });

    it('returns empty object when no dependency fields exist', () => {
      const dir = makeTmpProject({
        name: 'bare-project',
        version: '1.0.0',
      });
      tmpDirs.push(dir);

      expect(getInstalledVersions(dir)).toEqual({});
    });

    it('extracts multiple HELiX packages from mixed dependencies', () => {
      const dir = makeTmpProject({
        name: 'full-project',
        dependencies: {
          '@helix/core': '^0.5.0',
          '@helix/tokens': '~0.4.0',
          '@helix/components': '0.3.0',
          react: '^18.0.0',
        },
        devDependencies: {
          '@helixui/react': '^0.3.0',
          '@helixui/vue': '^0.2.0',
          vitest: '^1.0.0',
        },
      });
      tmpDirs.push(dir);

      const versions = getInstalledVersions(dir);

      expect(versions).toEqual({
        '@helix/core': '^0.5.0',
        '@helix/tokens': '~0.4.0',
        '@helix/components': '0.3.0',
        '@helixui/react': '^0.3.0',
        '@helixui/vue': '^0.2.0',
      });
    });

    it('preserves version string prefixes as-is', () => {
      const dir = makeTmpProject({
        name: 'prefix-project',
        dependencies: {
          '@helix/core': '^1.0.0',
          '@helix/tokens': '~0.5.0',
          '@helix/icons': '0.3.0',
        },
      });
      tmpDirs.push(dir);

      const versions = getInstalledVersions(dir);

      expect(versions['@helix/core']).toBe('^1.0.0');
      expect(versions['@helix/tokens']).toBe('~0.5.0');
      expect(versions['@helix/icons']).toBe('0.3.0');
    });

    it('returns empty object for a nonexistent directory', () => {
      expect(getInstalledVersions('/tmp/nonexistent-helix-dir-' + Date.now())).toEqual({});
    });

    it('surfaces the STALEST range when a package is in multiple buckets', () => {
      // wc-storybook-style: @helixui/library in peerDeps (current) AND
      // devDeps (stale). Collapsing to the current one would hide the stale
      // bucket from buildUpgradePlan; the stalest must win so it gets flagged.
      const dir = makeTmpProject({
        name: 'mixed-bucket',
        devDependencies: { '@helixui/library': '^1.0.0' },
        peerDependencies: { '@helixui/library': '^3.9.1' },
      });
      tmpDirs.push(dir);

      expect(getInstalledVersions(dir)['@helixui/library']).toBe('^1.0.0');
    });
  });

  // ─── buildUpgradePlan ────────────────────────────────────────────────────

  describe('buildUpgradePlan', () => {
    it('marks packages as changed when versions differ', () => {
      const plan = buildUpgradePlan({ '@helix/core': '^0.5.0' }, STUB_LATEST);
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(true);
      expect(core!.current).toBe('^0.5.0');
      expect(core!.latest).toBe('1.0.0');
    });

    it('marks packages as not changed when versions match', () => {
      const plan = buildUpgradePlan({ '@helix/core': '1.0.0' }, STUB_LATEST);
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(false);
    });

    it('marks packages with caret prefix as not changed when base version matches', () => {
      const plan = buildUpgradePlan({ '@helix/core': '^1.0.0' }, STUB_LATEST);
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(false);
      expect(core!.current).toBe('^1.0.0');
      expect(core!.latest).toBe('1.0.0');
    });

    it('marks packages with tilde prefix as not changed when base version matches', () => {
      const plan = buildUpgradePlan({ '@helix/core': '~1.0.0' }, STUB_LATEST);
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(false);
    });

    it('strips caret prefix before comparing versions', () => {
      const plan = buildUpgradePlan({ '@helix/core': '^0.9.0' }, STUB_LATEST);
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(true);
      expect(core!.latest).toBe('1.0.0');
    });

    it('strips tilde prefix before comparing versions', () => {
      const plan = buildUpgradePlan({ '@helix/core': '~0.9.0' }, STUB_LATEST);
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(true);
      expect(core!.latest).toBe('1.0.0');
    });

    it('handles unknown packages by keeping current version (normalized)', () => {
      const plan = buildUpgradePlan({ '@helix/unknown-pkg': '^2.0.0' }, STUB_LATEST);
      const pkg = plan.find((e) => e.name === '@helix/unknown-pkg');

      expect(pkg).toBeDefined();
      expect(pkg!.latest).toBe('2.0.0');
      expect(pkg!.changed).toBe(false);
    });

    it('handles unknown packages without version prefix', () => {
      const plan = buildUpgradePlan({ '@helix/custom': '3.2.1' }, STUB_LATEST);
      const pkg = plan.find((e) => e.name === '@helix/custom');

      expect(pkg).toBeDefined();
      expect(pkg!.latest).toBe('3.2.1');
      expect(pkg!.changed).toBe(false);
    });

    it('returns an empty plan for empty input', () => {
      const plan = buildUpgradePlan({}, STUB_LATEST);

      expect(plan).toEqual([]);
    });

    it('creates a plan entry for every installed package', () => {
      const installed = {
        '@helix/core': '^0.5.0',
        '@helix/tokens': '~0.4.0',
        '@helixui/react': '^0.3.0',
        '@helixui/vue': '1.0.0',
      };

      const plan = buildUpgradePlan(installed, STUB_LATEST);

      expect(plan).toHaveLength(4);
      const names = plan.map((e) => e.name);
      expect(names).toContain('@helix/core');
      expect(names).toContain('@helix/tokens');
      expect(names).toContain('@helixui/react');
      expect(names).toContain('@helixui/vue');
    });

    it('correctly distinguishes changed from unchanged in a mixed plan', () => {
      const installed = {
        '@helix/core': '^0.5.0',
        '@helix/tokens': '^1.0.0',
        '@helixui/react': '1.0.0',
        '@helixui/vue': '~0.2.0',
      };

      const plan = buildUpgradePlan(installed, STUB_LATEST);
      const changed = plan.filter((e) => e.changed);
      const unchanged = plan.filter((e) => !e.changed);

      expect(changed).toHaveLength(2);
      expect(unchanged).toHaveLength(2);
      expect(changed.map((e) => e.name).sort()).toEqual(['@helix/core', '@helixui/vue']);
      expect(unchanged.map((e) => e.name).sort()).toEqual(['@helix/tokens', '@helixui/react']);
    });

    it('preserves the original current version string in the plan', () => {
      const plan = buildUpgradePlan(
        {
          '@helix/core': '^0.5.0',
          '@helix/tokens': '~0.4.0',
          '@helix/icons': '0.3.0',
        },
        STUB_LATEST,
      );

      const core = plan.find((e) => e.name === '@helix/core');
      const tokens = plan.find((e) => e.name === '@helix/tokens');
      const icons = plan.find((e) => e.name === '@helix/icons');

      expect(core!.current).toBe('^0.5.0');
      expect(tokens!.current).toBe('~0.4.0');
      expect(icons!.current).toBe('0.3.0');
    });

    it('handles all known packages at once', () => {
      const allKnown: Record<string, string> = {
        '@helix/core': '^0.5.0',
        '@helix/tokens': '^0.5.0',
        '@helix/components': '^0.5.0',
        '@helix/icons': '^0.5.0',
        '@helix/utils': '^0.5.0',
        '@helixui/react': '^0.5.0',
        '@helixui/vue': '^0.5.0',
        '@helixui/angular': '^0.5.0',
        '@helixui/svelte': '^0.5.0',
        '@helixui/lit': '^0.5.0',
        '@helixui/solid': '^0.5.0',
        '@helixui/qwik': '^0.5.0',
        '@helixui/preact': '^0.5.0',
        '@helixui/stencil': '^0.5.0',
      };

      const plan = buildUpgradePlan(allKnown, STUB_LATEST);

      expect(plan).toHaveLength(14);
      for (const entry of plan) {
        expect(entry.changed).toBe(true);
        expect(entry.latest).toBe('1.0.0');
      }
    });

    it('handles mix of known and unknown packages', () => {
      const installed = {
        '@helix/core': '^0.5.0',
        '@helix/custom-plugin': '^2.0.0',
      };

      const plan = buildUpgradePlan(installed, STUB_LATEST);

      const core = plan.find((e) => e.name === '@helix/core');
      const custom = plan.find((e) => e.name === '@helix/custom-plugin');

      expect(core!.changed).toBe(true);
      expect(core!.latest).toBe('1.0.0');
      expect(custom!.changed).toBe(false);
      expect(custom!.latest).toBe('2.0.0');
    });

    it('uses current version when latestVersions is empty (offline scenario)', () => {
      const plan = buildUpgradePlan({ '@helix/core': '^0.5.0' }, {});
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.latest).toBe('0.5.0');
      expect(core!.changed).toBe(false);
    });
  });

  // ─── fetchLatestVersions ─────────────────────────────────────────────────

  describe('fetchLatestVersions', () => {
    it('returns versions for packages that resolve successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '2.3.4' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchLatestVersions(['@helix/core', '@helix/tokens']);

      expect(result['@helix/core']).toBe('2.3.4');
      expect(result['@helix/tokens']).toBe('2.3.4');
    });

    it('omits packages when fetch returns non-ok response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchLatestVersions(['@helix/core']);

      expect(result).toEqual({});
    });

    it('omits packages when fetch throws (offline scenario)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchLatestVersions(['@helix/core', '@helix/tokens']);

      expect(result).toEqual({});
    });

    it('returns empty object for empty package list', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchLatestVersions([]);

      expect(result).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses %2F encoding for scoped packages', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '1.5.0' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await fetchLatestVersions(['@helix/core']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('@helix%2Fcore'),
        expect.any(Object),
      );
    });

    it('handles partial success when some packages resolve and others fail', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes('core')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ version: '2.0.0' }),
          });
        }
        return Promise.reject(new Error('Not found'));
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchLatestVersions(['@helix/core', '@helix/tokens']);

      expect(result['@helix/core']).toBe('2.0.0');
      expect(result['@helix/tokens']).toBeUndefined();
    });
  });

  // ─── runUpgrade with --dry-run ───────────────────────────────────────────

  describe('runUpgrade with --dry-run', () => {
    let mockExit: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      // Mock fetch to return '1.0.0' for all packages by default
      vi.stubGlobal('fetch', () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '1.0.0' }),
        }),
      );
    });

    afterEach(() => {
      mockExit.mockRestore();
    });

    it('does not modify package.json in dry-run mode', async () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^0.5.0' },
      });
      tmpDirs.push(dir);

      const originalContent = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');

      await runUpgrade(dir, { dryRun: true });

      const afterContent = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
      expect(afterContent).toBe(originalContent);
    });

    it('exits with error for non-helix projects', async () => {
      const dir = makeTmpProject({
        name: 'generic',
        dependencies: { react: '^18.0.0' },
      });
      tmpDirs.push(dir);

      await expect(runUpgrade(dir, { dryRun: true })).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits with error when directory has no package.json', async () => {
      const dir = makeTmpDirOnly();
      tmpDirs.push(dir);

      await expect(runUpgrade(dir, { dryRun: true })).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // ─── runUpgrade writes changes ───────────────────────────────────────────

  describe('runUpgrade writes changes', () => {
    beforeEach(() => {
      // Mock fetch to return '1.0.0' for all packages
      vi.stubGlobal('fetch', () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '1.0.0' }),
        }),
      );
    });

    it('updates package.json when not dry-run', async () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^0.5.0', react: '^18.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helix/core']).toBe('^1.0.0');
      expect(updated.dependencies['react']).toBe('^18.0.0');
    });

    it('updates devDependencies when not dry-run', async () => {
      const dir = makeTmpProject({
        name: 'test-project',
        devDependencies: { '@helixui/react': '^0.3.0', vitest: '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        devDependencies: Record<string, string>;
      };
      expect(updated.devDependencies['@helixui/react']).toBe('^1.0.0');
      expect(updated.devDependencies['vitest']).toBe('^1.0.0');
    });

    it('updates packages in both deps and devDeps simultaneously', async () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^0.5.0' },
        devDependencies: { '@helixui/react': '^0.3.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helix/core']).toBe('^1.0.0');
      expect(updated.devDependencies['@helixui/react']).toBe('^1.0.0');
    });

    it('does not modify already-up-to-date packages', async () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^1.0.0', '@helix/tokens': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const raw = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
      const updated = JSON.parse(raw) as { dependencies: Record<string, string> };
      expect(updated.dependencies['@helix/core']).toBe('^1.0.0');
      expect(updated.dependencies['@helix/tokens']).toBe('^1.0.0');
    });

    it('shows offline warning when fetch fails for all packages', async () => {
      vi.stubGlobal('fetch', () => Promise.reject(new Error('Network error')));

      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^0.5.0' },
      });
      tmpDirs.push(dir);

      // Should not throw — offline is handled gracefully
      await expect(runUpgrade(dir, { dryRun: true })).resolves.toBeUndefined();
    });
  });

  // ─── Drupal scaffolds: @helixui/tokens skipped until v0.9.4 migrates the
  // theme wiring files (libraries.yml, style.css, scripts/copy-helix-tokens.mjs).
  describe('runUpgrade — Drupal token exemption (deferred to v0.9.4)', () => {
    beforeEach(() => {
      // Registry says every package's latest is 1.0.0.
      vi.stubGlobal('fetch', () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '1.0.0' }),
        }),
      );
    });

    it('does not bump @helixui/tokens for a project that declares @helixui/drupal-starter', async () => {
      // v0.9.3 wired FRESH Drupal scaffolds to load @helixui/tokens at
      // runtime, but `runUpgrade` cannot yet rewrite a pre-v0.9.3 theme's
      // libraries.yml / style.css / scripts/ — only package.json. Bumping
      // the pin without the wiring would leave tokens still unused, so the
      // tokens-bump is skipped until v0.9.4 makes upgrade theme-aware.
      const dir = makeTmpProject({
        name: 'acme-theme',
        dependencies: {
          '@helixui/drupal-starter': '^0.1.0',
          '@helixui/tokens': '^0.2.0',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      // tokens untouched...
      expect(updated.dependencies['@helixui/tokens']).toBe('^0.2.0');
      // ...but the exemption is scoped to tokens — drupal-starter still upgrades.
      expect(updated.dependencies['@helixui/drupal-starter']).toBe('^1.0.0');
    });

    it('still bumps @helixui/tokens for a non-Drupal project', async () => {
      // The exemption fires ONLY when @helixui/drupal-starter is present.
      const dir = makeTmpProject({
        name: 'astro-app',
        dependencies: { '@helixui/tokens': '^0.2.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/tokens']).toBe('^1.0.0');
    });

    it('also skips @helixui/tokens for a v0.9.3+ Drupal theme (blanket exemption)', async () => {
      // The skip is blanket — the runtime token layer for any Drupal theme
      // is `css/vendor/helix-tokens.css`, not the declared range. Bumping
      // the pin alone (without refreshing that vendored CSS) would advance
      // the declaration while the theme keeps serving stale token bytes.
      // v0.9.4 adds the upgrade-time vendored-CSS refresh.
      const dir = makeTmpProject({
        name: 'acme-theme',
        dependencies: {
          '@helixui/drupal-starter': '^0.1.0',
          '@helixui/tokens': '^0.2.0',
        },
      });
      tmpDirs.push(dir);
      fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'scripts', 'copy-helix-tokens.mjs'),
        '// v0.9.3+ wiring\n',
        'utf-8',
      );

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      // tokens untouched (blanket exemption)…
      expect(updated.dependencies['@helixui/tokens']).toBe('^0.2.0');
      // …but the exemption is scoped to tokens — drupal-starter still upgrades.
      expect(updated.dependencies['@helixui/drupal-starter']).toBe('^1.0.0');
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('detectHelixProject handles package.json with only a name field', () => {
      const dir = makeTmpProject({ name: 'minimal' });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(false);
    });

    it('getInstalledVersions handles package.json with only dependencies (no devDeps)', () => {
      const dir = makeTmpProject({
        name: 'only-deps',
        dependencies: { '@helix/core': '^0.5.0' },
      });
      tmpDirs.push(dir);

      expect(getInstalledVersions(dir)).toEqual({ '@helix/core': '^0.5.0' });
    });

    it('getInstalledVersions handles package.json with only devDependencies (no deps)', () => {
      const dir = makeTmpProject({
        name: 'only-dev-deps',
        devDependencies: { '@helixui/react': '^0.3.0' },
      });
      tmpDirs.push(dir);

      expect(getInstalledVersions(dir)).toEqual({ '@helixui/react': '^0.3.0' });
    });

    it('buildUpgradePlan returns empty array when given empty object', () => {
      const plan = buildUpgradePlan({}, STUB_LATEST);
      expect(plan).toHaveLength(0);
      expect(plan).toEqual([]);
    });

    it('mixed deps: HELiX in deps, non-HELiX in devDeps', () => {
      const dir = makeTmpProject({
        name: 'mixed',
        dependencies: { '@helix/core': '^0.5.0' },
        devDependencies: { vitest: '^1.0.0', eslint: '^9.0.0' },
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(true);
      const versions = getInstalledVersions(dir);
      expect(Object.keys(versions)).toHaveLength(1);
      expect(versions['@helix/core']).toBe('^0.5.0');
    });

    it('mixed deps: non-HELiX in deps, HELiX in devDeps', () => {
      const dir = makeTmpProject({
        name: 'mixed-reverse',
        dependencies: { react: '^18.0.0' },
        devDependencies: { '@helixui/react': '^0.3.0' },
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(true);
      const versions = getInstalledVersions(dir);
      expect(Object.keys(versions)).toHaveLength(1);
      expect(versions['@helixui/react']).toBe('^0.3.0');
    });
  });

  // ─── compareSemver ───────────────────────────────────────────────────────

  describe('compareSemver', () => {
    it('returns -1 when the first version is older', () => {
      expect(compareSemver('1.0.0', '3.9.1')).toBe(-1);
      expect(compareSemver('3.9.0', '3.9.1')).toBe(-1);
      expect(compareSemver('2.9.9', '3.0.0')).toBe(-1);
    });

    it('returns 1 when the first version is newer (would-be downgrade)', () => {
      expect(compareSemver('3.10.0', '3.9.1')).toBe(1);
      expect(compareSemver('4.0.0', '3.9.1')).toBe(1);
    });

    it('returns 0 when versions are equal', () => {
      expect(compareSemver('3.9.1', '3.9.1')).toBe(0);
    });

    it('ignores range prefixes and prerelease/build metadata', () => {
      expect(compareSemver('^3.9.1', '3.9.1')).toBe(0);
      expect(compareSemver('~3.9.0', '3.9.1')).toBe(-1);
      expect(compareSemver('3.9.1-next.156', '3.9.1')).toBe(0);
    });

    it('returns null when either side is unparseable', () => {
      expect(compareSemver('not-a-version', '3.9.1')).toBeNull();
      expect(compareSemver('3.9.1', 'latest')).toBeNull();
    });
  });

  // ─── v0.9.2: buildUpgradePlan never proposes a downgrade ──────────────────

  describe('buildUpgradePlan — no downgrades', () => {
    it('does not mark a package as changed when installed is newer than latest', () => {
      // Installed 3.10.0, registry "latest" 3.9.1 — a naive string compare
      // would flag this as changed and downgrade the consumer.
      const plan = buildUpgradePlan(
        { '@helixui/library': '^3.10.0' },
        { '@helixui/library': '3.9.1' },
      );
      const entry = plan.find((e) => e.name === '@helixui/library');
      expect(entry).toBeDefined();
      expect(entry!.changed).toBe(false);
    });

    it('marks a genuinely-stale package as changed', () => {
      const plan = buildUpgradePlan(
        { '@helixui/library': '^1.0.0' },
        { '@helixui/library': '3.9.1' },
      );
      const entry = plan.find((e) => e.name === '@helixui/library');
      expect(entry!.changed).toBe(true);
      expect(entry!.latest).toBe('3.9.1');
    });

    it('leaves an unparseable range unchanged rather than risk a downgrade', () => {
      // `4.x`, `*`, npm aliases, disjunctive ranges etc. don't parse to a
      // single semver tuple. The old string-inequality fallback would flag
      // `4.x` !== `3.9.1` as changed and rewrite the project DOWN to ^3.9.1;
      // `^1.0.0 || ^4.0.0` would get narrowed. Unparseable → leave it alone.
      for (const range of ['4.x', '1.0', '*', 'npm:@helixui/library@4.0.0', '^1.0.0 || ^4.0.0']) {
        const plan = buildUpgradePlan(
          { '@helixui/library': range },
          { '@helixui/library': '3.9.1' },
        );
        const entry = plan.find((e) => e.name === '@helixui/library');
        expect(entry, `range ${range}`).toBeDefined();
        expect(entry!.changed, `range ${range} must not be rewritten`).toBe(false);
      }
    });
  });

  // ─── v0.9.2: peerDependencies are first-class ────────────────────────────

  describe('peerDependencies support', () => {
    it('detectHelixProject sees HELiX packages declared only in peerDependencies', () => {
      const dir = makeTmpProject({
        name: 'wc-storybook-style',
        peerDependencies: { '@helixui/library': '^1.0.0' },
      });
      tmpDirs.push(dir);
      expect(detectHelixProject(dir)).toBe(true);
    });

    it('getInstalledVersions reads peerDependencies', () => {
      const dir = makeTmpProject({
        name: 'wc-storybook-style',
        devDependencies: { '@helixui/library': '^1.0.0' },
        peerDependencies: { '@helixui/library': '^1.0.0', '@helixui/tokens': '^0.3.0' },
      });
      tmpDirs.push(dir);
      const versions = getInstalledVersions(dir);
      expect(versions['@helixui/library']).toBeDefined();
      expect(versions['@helixui/tokens']).toBe('^0.3.0');
    });

    it('runUpgrade writes the new version back to peerDependencies AND devDependencies', async () => {
      vi.stubGlobal('fetch', () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '3.9.1' }) }),
      );
      const dir = makeTmpProject({
        name: 'wc-storybook-style',
        devDependencies: { '@helixui/library': '^1.0.0' },
        peerDependencies: { '@helixui/library': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        devDependencies: Record<string, string>;
        peerDependencies: Record<string, string>;
      };
      expect(updated.devDependencies['@helixui/library']).toBe('^3.9.1');
      expect(updated.peerDependencies['@helixui/library']).toBe('^3.9.1');
    });
  });

  // ─── v0.9.2: HELiX 3.x icon-peer migration ───────────────────────────────

  describe('runUpgrade — HELiX 3.x icon-peer migration', () => {
    it('adds @helixui/icons when it bumps @helixui/library into the 3.x range', async () => {
      // @helixui/library@3.x peer-requires @helixui/icons. An old scaffold
      // upgrading library 1.x → 3.x has no @helixui/icons — upgrade must add
      // it or the upgraded project has an unmet peer.
      vi.stubGlobal('fetch', () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '3.9.1' }) }),
      );
      const dir = makeTmpProject({
        name: 'old-astro-scaffold',
        dependencies: { '@helixui/library': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/library']).toBe('^3.9.1');
      expect(updated.dependencies['@helixui/icons']).toBeDefined();
    });

    it('does not add @helixui/icons when the project already declares it', async () => {
      vi.stubGlobal('fetch', () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '3.9.1' }) }),
      );
      const dir = makeTmpProject({
        name: 'already-has-icons',
        dependencies: { '@helixui/library': '^1.0.0' },
        devDependencies: { '@helixui/icons': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      // Bumped in place where it already lived — not duplicated into deps.
      expect(updated.devDependencies['@helixui/icons']).toBe('^3.9.1');
      expect(updated.dependencies?.['@helixui/icons']).toBeUndefined();
    });

    it('does not add @helixui/icons when @helixui/library stays below 3.x', async () => {
      // Registry latest is still 2.x — no 3.x peer requirement triggered.
      vi.stubGlobal('fetch', () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '2.5.0' }) }),
      );
      const dir = makeTmpProject({
        name: 'pre-3x-bump',
        dependencies: { '@helixui/library': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/library']).toBe('^2.5.0');
      expect(updated.dependencies['@helixui/icons']).toBeUndefined();
    });

    it('adds @helixui/icons when @helixui/library is ALREADY 3.x and nothing else needs a bump', async () => {
      // The exact state `doctor` flags and points at `create-helix upgrade`:
      // library already on 3.x, just missing the icons peer. Registry returns
      // the same version that's installed, so there's no version bump — but
      // upgrade must still add the peer, not no-op.
      vi.stubGlobal('fetch', () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '3.9.1' }) }),
      );
      const dir = makeTmpProject({
        name: 'already-on-3x',
        dependencies: { '@helixui/library': '^3.9.1' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBeDefined();
    });

    it('adds @helixui/icons to the same bucket @helixui/library lives in (peer/dev, not deps)', async () => {
      // Library-shaped projects (the wc-storybook scaffold) keep HELiX
      // packages in peerDependencies/devDependencies on purpose. The added
      // icons peer must follow that contract — not land in `dependencies`.
      vi.stubGlobal('fetch', () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '3.9.1' }) }),
      );
      const dir = makeTmpProject({
        name: 'library-shaped',
        devDependencies: { '@helixui/library': '^1.0.0' },
        peerDependencies: { '@helixui/library': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies: Record<string, string>;
        peerDependencies: Record<string, string>;
      };
      expect(updated.devDependencies['@helixui/icons']).toBe(
        updated.peerDependencies['@helixui/icons'],
      );
      expect(updated.peerDependencies['@helixui/icons']).toBeDefined();
      expect(updated.dependencies?.['@helixui/icons']).toBeUndefined();
    });

    it('seeds devDependencies for a peer-only project so @helixui/icons is installable', async () => {
      // @helixui/library declared ONLY in peerDependencies. Mirroring buckets
      // exactly would put @helixui/icons in peerDependencies alone — but pnpm
      // doesn't install peerDependencies into the package's own node_modules,
      // so `create-helix doctor` (and the runtime) couldn't resolve it. The
      // peer placement keeps the contract; devDependencies makes it install.
      vi.stubGlobal('fetch', () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '3.9.1' }) }),
      );
      const dir = makeTmpProject({
        name: 'peer-only',
        peerDependencies: { '@helixui/library': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies: Record<string, string>;
      };
      expect(updated.peerDependencies['@helixui/icons']).toBeDefined();
      // devDependencies was seeded so the package actually installs.
      expect(updated.devDependencies?.['@helixui/icons']).toBeDefined();
    });

    it('adds @helixui/icons when @helixui/library RESOLVES to 3.x from a broad declared range', async () => {
      // The declared range `>=1.0.0` reads as major 1 via leadingMajor, and
      // offline there is no registry entry to upgrade from — but node_modules
      // resolves @helixui/library at 3.9.1, which already has the unmet icons
      // peer. upgrade must read the resolved install, not just the range text.
      const dir = makeTmpProject({
        name: 'broad-range-scaffold',
        dependencies: { '@helixui/library': '>=1.0.0' },
      });
      tmpDirs.push(dir);
      const libPkgDir = path.join(dir, 'node_modules', '@helixui', 'library');
      fs.mkdirSync(libPkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(libPkgDir, 'package.json'),
        JSON.stringify({ name: '@helixui/library', version: '3.9.1' }),
        'utf-8',
      );

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBeDefined();
    });

    it('seeds @helixui/icons at the create-helix floor when the peer-only range is a union', async () => {
      // @helixui/icons declared ONLY in peerDependencies, as a `||` union
      // (`^1.0.0 || ^2.0.0`). A union can't be cleanly copied as a single
      // installable devDependency pin, so the seeded copy falls back to the
      // known-good floor; the peer entry itself is left untouched.
      const dir = makeTmpProject({
        name: 'unparseable-peer-icons',
        dependencies: { '@helixui/library': '^3.9.1' },
        peerDependencies: { '@helixui/icons': '^1.0.0 || ^2.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        devDependencies: Record<string, string>;
        peerDependencies: Record<string, string>;
      };
      // The unparseable peer entry is left as the project declared it...
      expect(updated.peerDependencies['@helixui/icons']).toBe('^1.0.0 || ^2.0.0');
      // ...but the installable devDependencies copy falls back to the floor.
      expect(updated.devDependencies['@helixui/icons']).toBe(HELIX_ICONS_VERSION);
    });

    it('keeps a peer-only @helixui/icons range that already meets the floor', async () => {
      // Peer at ^1.2.0 — already above the ^1.0.4 floor. The seeded copy must
      // honour the project's newer pin, not flatten it down to the floor.
      const dir = makeTmpProject({
        name: 'newer-peer-icons',
        dependencies: { '@helixui/library': '^3.9.1' },
        peerDependencies: { '@helixui/icons': '^1.2.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        devDependencies: Record<string, string>;
      };
      expect(updated.devDependencies['@helixui/icons']).toBe('^1.2.0');
    });

    it('seeds a peer-only @helixui/icons ^1.0.1 verbatim on a 3.9.x library — does NOT raise to the floor', async () => {
      // THE devDep-seed P2 (closed): the 1.0.4 floor is a 3.10+ requirement. On
      // a library still at 3.9.x, a peer-only icons ^1.0.1 (a clean, below-floor
      // range that is perfectly valid for 3.9.x) must be seeded VERBATIM, not
      // raised to ^1.0.4. The seed only raises when the library is provably
      // >= 3.10.0.
      const dir = makeTmpProject({
        name: 'peer-only-icons-39x-not-raised',
        dependencies: { '@helixui/library': '^3.9.1' },
        peerDependencies: { '@helixui/icons': '^1.0.1' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        devDependencies: Record<string, string>;
        peerDependencies: Record<string, string>;
      };
      expect(updated.devDependencies['@helixui/icons']).toBe('^1.0.1');
      expect(updated.peerDependencies['@helixui/icons']).toBe('^1.0.1');
    });

    it('raises a peer-only @helixui/icons ^1.0.1 to the floor when the library IS 3.10+', async () => {
      // Counterpart: on a library provably >= 3.10.0, a below-floor peer-only
      // icons ^1.0.1 IS raised to ^1.0.4 so the seeded devDep satisfies the
      // tightened <hx-icon> peer.
      const dir = makeTmpProject({
        name: 'peer-only-icons-310-raised',
        dependencies: { '@helixui/library': '^3.10.0' },
        peerDependencies: { '@helixui/icons': '^1.0.1' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        devDependencies: Record<string, string>;
      };
      expect(updated.devDependencies['@helixui/icons']).toBe(HELIX_ICONS_VERSION);
    });

    it('raises a stale but installed @helixui/icons range to the create-helix floor when offline (library 3.10+)', async () => {
      // @helixui/icons already in `dependencies` at ^1.0.0 — below the ^1.0.4
      // floor library@3.10+ requires. Offline (no registry, no cache) the plan
      // has no "latest" for it and would no-op, leaving doctor failing right
      // after it pointed the user at `create-helix upgrade`. create-helix's own
      // pinned floor stands in as the registry-independent minimum — but ONLY
      // because the library is on 3.10+ here.
      const dir = makeTmpProject({
        name: 'stale-installed-icons',
        dependencies: {
          '@helixui/library': '^3.10.0',
          '@helixui/icons': '^1.0.0',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBe(HELIX_ICONS_VERSION);
    });

    it('leaves an @helixui/icons range already at or above the floor untouched when offline', async () => {
      // ^1.2.0 is above the ^1.0.4 floor — the floor is a minimum, not a
      // target; it must never drag a newer pin backward.
      const dir = makeTmpProject({
        name: 'newer-installed-icons',
        dependencies: {
          '@helixui/library': '^3.10.0',
          '@helixui/icons': '^1.2.0',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBe('^1.2.0');
    });

    it('does NOT raise a stale icons range when @helixui/library is 3.9.x (floor is 3.10+ only)', async () => {
      // The 1.0.4 floor was tightened in library@3.10.0; the earlier 3.9.x pins
      // paired with icons 1.0.1. An un-upgraded 3.9.x scaffold with icons
      // ^1.0.1 must be left alone offline — synthesizing a 1.0.4 "latest" here
      // would rewrite a perfectly valid pre-3.10 pin (codex re-review). This is
      // the minor-aware boundary the major-only gate missed.
      const dir = makeTmpProject({
        name: 'library-39x-icons-untouched',
        dependencies: {
          '@helixui/library': '^3.9.1',
          '@helixui/icons': '^1.0.1',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBe('^1.0.1');
    });

    it('does NOT raise a stale icons range when @helixui/library is 2.x (floor is 3.10+ only)', async () => {
      // The 1.0.4 floor is a 3.10+ requirement. A project still on library 2.x
      // with icons ^1.0.1 must be left alone offline — synthesizing a 1.0.4
      // "latest" here would rewrite a perfectly valid pre-3.x pin.
      const dir = makeTmpProject({
        name: 'library-2x-icons-untouched',
        dependencies: {
          '@helixui/library': '^2.5.0',
          '@helixui/icons': '^1.0.1',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBe('^1.0.1');
    });

    it('does NOT raise icons when @helixui/library is workspace:* even if the registry latest is 3.10', async () => {
      // Monorepo scaffolds pin the workspace library as `workspace:*` — an
      // unparseable spec buildUpgradePlan leaves untouched (compareSemver →
      // null), so the library is NOT actually moving to 3.10. The registry
      // reporting 3.10 as "latest" must NOT, on its own, prove the floor and
      // rewrite a valid icons ^1.0.1 pin (codex final pass, Finding 1).
      vi.mocked(readRegistryCache).mockReturnValue({
        updatedAt: Date.now(),
        packages: { '@helixui/library': '3.10.0' },
      });
      const dir = makeTmpProject({
        name: 'workspace-library-icons-untouched',
        dependencies: {
          '@helixui/library': 'workspace:*',
          '@helixui/icons': '^1.0.1',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBe('^1.0.1');
    });

    it('does NOT raise icons when @helixui/library is a catalog: spec even if the registry latest is 3.10', async () => {
      // Same as workspace:* — a `catalog:` spec is unparseable, so the plan
      // leaves the library alone and icons must not be synthesized to 1.0.4.
      vi.mocked(readRegistryCache).mockReturnValue({
        updatedAt: Date.now(),
        packages: { '@helixui/library': '3.10.0' },
      });
      const dir = makeTmpProject({
        name: 'catalog-library-icons-untouched',
        dependencies: {
          '@helixui/library': 'catalog:',
          '@helixui/icons': '^1.0.1',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBe('^1.0.1');
    });

    it('DOES raise icons when @helixui/library is a parseable ^3.9.1 the plan moves to 3.10', async () => {
      // Counterpart to the workspace:* case: when the declared spec parses AND
      // is below the registry latest (3.10), buildUpgradePlan genuinely moves
      // the library to 3.10, so the icons floor SHOULD apply. This proves the
      // gate still fires on a real, provable upgrade — it's the registry-latest
      // path, now correctly conditioned on a movable declared spec.
      vi.mocked(readRegistryCache).mockReturnValue({
        updatedAt: Date.now(),
        packages: { '@helixui/library': '3.10.0' },
      });
      const dir = makeTmpProject({
        name: 'movable-library-icons-raised',
        dependencies: {
          '@helixui/library': '^3.9.1',
          '@helixui/icons': '^1.0.1',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBe(HELIX_ICONS_VERSION);
    });

    it('does NOT raise icons when @helixui/library is an upper-bound <3.10.0 range even if registry latest is 3.10', async () => {
      // REGRESSION GUARD: an upper-bound spec must never be misread as ">=3.10".
      // Even with the registry reporting 3.10 as latest, `<3.10.0` is not a
      // provable >=3.10 lower bound, so icons must stay at ^1.0.1.
      vi.mocked(readRegistryCache).mockReturnValue({
        updatedAt: Date.now(),
        packages: { '@helixui/library': '3.10.0' },
      });
      const dir = makeTmpProject({
        name: 'upper-bound-lt-310-icons-untouched',
        dependencies: {
          '@helixui/library': '<3.10.0',
          '@helixui/icons': '^1.0.1',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBe('^1.0.1');
    });

    it('does NOT raise icons when @helixui/library is a bare upper-bound <4.0.0 range even if registry latest is 3.10', async () => {
      // `<4.0.0` permits 1.x/2.x/3.9.x too — no lower bound, so not proof of
      // >=3.10. Fail open: icons untouched.
      vi.mocked(readRegistryCache).mockReturnValue({
        updatedAt: Date.now(),
        packages: { '@helixui/library': '3.10.0' },
      });
      const dir = makeTmpProject({
        name: 'upper-bound-lt-400-icons-untouched',
        dependencies: {
          '@helixui/library': '<4.0.0',
          '@helixui/icons': '^1.0.1',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBe('^1.0.1');
    });

    it('does NOT raise icons when @helixui/library is a 3.10.0-next prerelease (ambiguous, fail open)', async () => {
      // A 3.10.0 prerelease may predate the tightened <hx-icon> peer — ambiguous
      // → fail open. Even installed at the prerelease, icons must stay ^1.0.1.
      vi.mocked(readRegistryCache).mockReturnValue({
        updatedAt: Date.now(),
        packages: { '@helixui/library': '3.10.0' },
      });
      const dir = makeTmpProject({
        name: 'prerelease-library-icons-untouched',
        dependencies: {
          '@helixui/library': '3.10.0-next.5',
          '@helixui/icons': '^1.0.1',
        },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helixui/icons']).toBe('^1.0.1');
    });
  });

  // ─── v0.9.2: --offline serves from the registry cache ────────────────────

  describe('runUpgrade — offline mode', () => {
    let mockExit: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
    });

    afterEach(() => {
      mockExit.mockRestore();
    });

    it('serves latest versions from the registry cache when --offline is set', async () => {
      // No fetch stub — if runUpgrade hit the network this would throw.
      vi.mocked(readRegistryCache).mockReturnValue({
        updatedAt: Date.now(),
        packages: { '@helix/core': '2.0.0' },
      });
      const dir = makeTmpProject({
        name: 'offline-project',
        dependencies: { '@helix/core': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helix/core']).toBe('^2.0.0');
    });

    it('completes without throwing when offline and no cache exists', async () => {
      vi.mocked(readRegistryCache).mockReturnValue(null);
      const dir = makeTmpProject({
        name: 'offline-no-cache',
        dependencies: { '@helix/core': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await expect(runUpgrade(dir, { dryRun: false, offline: true })).resolves.toBeUndefined();
      // Nothing to compare against → package.json untouched.
      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helix/core']).toBe('^1.0.0');
    });

    it('falls back to the cache when an online fetch fails for every package', async () => {
      // Online (detectOffline → false) but every registry fetch rejects.
      vi.stubGlobal('fetch', () => Promise.reject(new Error('Network error')));
      vi.mocked(readRegistryCache).mockReturnValue({
        updatedAt: Date.now(),
        packages: { '@helix/core': '2.0.0' },
      });
      const dir = makeTmpProject({
        name: 'flaky-registry',
        dependencies: { '@helix/core': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helix/core']).toBe('^2.0.0');
    });

    it('takes the offline path when detectOffline() reports the network is down', async () => {
      vi.mocked(detectOffline).mockResolvedValue(true);
      vi.mocked(readRegistryCache).mockReturnValue({
        updatedAt: Date.now(),
        packages: { '@helix/core': '2.0.0' },
      });
      // No fetch stub — the offline path must not call fetch.
      const dir = makeTmpProject({
        name: 'auto-offline',
        dependencies: { '@helix/core': '^1.0.0' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helix/core']).toBe('^2.0.0');
    });
  });

  // ─── v0.9.2: monorepo apps/web + mixed-bucket consistency ────────────────

  describe('resolveHelixDir', () => {
    it('returns dir itself for a flat HELiX project', () => {
      const dir = makeTmpProject({
        name: 'flat',
        dependencies: { '@helixui/library': '^1.0.0' },
      });
      tmpDirs.push(dir);
      expect(resolveHelixDir(dir)).toBe(dir);
    });

    it('follows a monorepo root into apps/web', () => {
      const dir = makeTmpProject({ name: 'workspace-root', private: true });
      tmpDirs.push(dir);
      fs.mkdirSync(path.join(dir, 'apps', 'web'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'apps', 'web', 'package.json'),
        JSON.stringify({ name: '@acme/web', dependencies: { '@helixui/library': '^1.0.0' } }),
        'utf-8',
      );
      expect(resolveHelixDir(dir)).toBe(path.join(dir, 'apps', 'web'));
    });

    it('returns dir unchanged when neither it nor apps/web is a HELiX project', () => {
      const dir = makeTmpProject({ name: 'plain', dependencies: { react: '^19.0.0' } });
      tmpDirs.push(dir);
      expect(resolveHelixDir(dir)).toBe(dir);
    });
  });

  describe('runUpgrade — monorepo + mixed-bucket', () => {
    it('rewrites apps/web/package.json when run from a monorepo root', async () => {
      // `doctor` follows apps/web and recommends `create-helix upgrade`;
      // `upgrade` run from the root must rewrite the app manifest, not exit
      // "No HELiX project detected".
      vi.stubGlobal('fetch', () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '3.9.1' }) }),
      );
      const root = makeTmpProject({ name: 'workspace-root', private: true });
      tmpDirs.push(root);
      fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'apps', 'web', 'package.json'),
        JSON.stringify(
          { name: '@acme/web', dependencies: { '@helixui/library': '^1.0.0' } },
          null,
          2,
        ),
        'utf-8',
      );

      await runUpgrade(root, { dryRun: false });

      const updated = JSON.parse(
        fs.readFileSync(path.join(root, 'apps', 'web', 'package.json'), 'utf-8'),
      ) as { dependencies: Record<string, string> };
      expect(updated.dependencies['@helixui/library']).toBe('^3.9.1');
      // Root manifest untouched.
      const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as {
        dependencies?: Record<string, string>;
      };
      expect(rootPkg.dependencies).toBeUndefined();
    });

    it('syncs every bucket when one is stale and another is already current', async () => {
      // @helixui/library: peerDeps ^3.9.1 (current) but devDeps ^1.0.0
      // (stale). Surfacing the stalest range flags it upgradeable; the
      // write-back must then bring BOTH buckets to ^3.9.1.
      vi.stubGlobal('fetch', () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '3.9.1' }) }),
      );
      const dir = makeTmpProject({
        name: 'mixed-bucket-app',
        devDependencies: { '@helixui/library': '^1.0.0' },
        peerDependencies: { '@helixui/library': '^3.9.1' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        devDependencies: Record<string, string>;
        peerDependencies: Record<string, string>;
      };
      expect(updated.devDependencies['@helixui/library']).toBe('^3.9.1');
      expect(updated.peerDependencies['@helixui/library']).toBe('^3.9.1');
    });

    it('never downgrades a newer bucket when the (stale-cache) latest is older', async () => {
      // Mixed-bucket: peerDeps ^3.9.1 (newer), devDeps ^1.0.0 (stale). Offline
      // with a stale cache that says latest is 2.5.0. The stale devDeps bucket
      // SHOULD move up to ^2.5.0, but the ^3.9.1 peerDeps bucket must NOT be
      // dragged backward — the per-bucket no-downgrade guard.
      vi.mocked(readRegistryCache).mockReturnValue({
        updatedAt: Date.now(),
        packages: { '@helixui/library': '2.5.0' },
      });
      const dir = makeTmpProject({
        name: 'stale-cache-mixed',
        devDependencies: { '@helixui/library': '^1.0.0' },
        peerDependencies: { '@helixui/library': '^3.9.1' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        devDependencies: Record<string, string>;
        peerDependencies: Record<string, string>;
      };
      expect(updated.devDependencies['@helixui/library']).toBe('^2.5.0'); // stale bucket moved up
      expect(updated.peerDependencies['@helixui/library']).toBe('^3.9.1'); // newer bucket untouched
    });

    it('adds the @helixui/icons peer when library is 3.x in ONE bucket, even with no registry data', async () => {
      // Mixed-bucket: library on 3.x in peerDeps, stale 1.x in devDeps, and
      // @helixui/icons absent. Offline with no cache → no upgrade entry for
      // @helixui/library at all. The icon migration must STILL fire — the
      // 3.x peer contract is already in effect — so it keys off the highest
      // declared major across buckets, not the merged stalest range.
      vi.mocked(readRegistryCache).mockReturnValue(null);
      const dir = makeTmpProject({
        name: 'mixed-bucket-offline',
        devDependencies: { '@helixui/library': '^1.0.0' },
        peerDependencies: { '@helixui/library': '^3.9.1' },
      });
      tmpDirs.push(dir);

      await runUpgrade(dir, { dryRun: false, offline: true });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      // @helixui/icons added to an installable bucket despite the offline miss.
      expect(updated.devDependencies?.['@helixui/icons']).toBeDefined();
    });
  });
});
