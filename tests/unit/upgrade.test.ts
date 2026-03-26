import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  detectHelixProject,
  getInstalledVersions,
  buildUpgradePlan,
  runUpgrade,
  clearVersionCache,
} from '../../src/commands/upgrade.js';

// Mock global fetch to avoid real network calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Helper: create a temp directory with a package.json. */
function makeTmpProject(pkgJson: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-upgrade-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf-8');
  return dir;
}

/**
 * Configure mockFetch to return a specific version for any package query.
 */
function mockRegistryVersion(version: string): void {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ version }),
  });
}

describe('upgrade command', () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    clearVersionCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

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

    it('returns false for a non-helix project', () => {
      const dir = makeTmpProject({
        name: 'generic-project',
        dependencies: { react: '^18.0.0', lodash: '^4.0.0' },
      });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(false);
    });

    it('returns false when no package.json exists', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-upgrade-'));
      fs.rmSync(path.join(dir, 'package.json'), { force: true });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(false);
    });
  });

  describe('getInstalledVersions', () => {
    it('returns only helix packages', () => {
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

    it('returns empty object for non-helix project', () => {
      const dir = makeTmpProject({
        name: 'generic',
        dependencies: { react: '^18.0.0' },
      });
      tmpDirs.push(dir);

      expect(getInstalledVersions(dir)).toEqual({});
    });

    it('returns empty object when no package.json', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-upgrade-'));
      tmpDirs.push(dir);
      fs.rmSync(path.join(dir, 'package.json'), { force: true });

      expect(getInstalledVersions(dir)).toEqual({});
    });
  });

  describe('buildUpgradePlan', () => {
    it('marks packages as changed when versions differ', async () => {
      mockRegistryVersion('1.0.0');

      const plan = await buildUpgradePlan({ '@helix/core': '^0.5.0' });
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(true);
      expect(core!.current).toBe('^0.5.0');
      expect(core!.latest).toBe('1.0.0');
    });

    it('marks packages as not changed when versions match', async () => {
      mockRegistryVersion('1.0.0');

      const plan = await buildUpgradePlan({ '@helix/core': '1.0.0' });
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(false);
    });

    it('handles unknown packages by keeping current version when registry fails', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const plan = await buildUpgradePlan({ '@helix/unknown-pkg': '^2.0.0' });
      const pkg = plan.find((e) => e.name === '@helix/unknown-pkg');

      expect(pkg).toBeDefined();
      expect(pkg!.latest).toBe('2.0.0');
      expect(pkg!.changed).toBe(false);
    });
  });

  describe('runUpgrade with --dry-run', () => {
    let mockExit: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
    });

    afterEach(() => {
      mockExit.mockRestore();
    });

    it('does not modify package.json in dry-run mode', async () => {
      mockRegistryVersion('1.0.0');

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
  });

  describe('runUpgrade writes changes', () => {
    it('updates package.json when not dry-run', async () => {
      mockRegistryVersion('1.0.0');

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
  });

  describe('edge cases', () => {
    it('detectHelixProject handles package.json with only a name field', () => {
      const dir = makeTmpProject({ name: 'minimal' });
      tmpDirs.push(dir);

      expect(detectHelixProject(dir)).toBe(false);
    });

    it('getInstalledVersions handles package.json with only dependencies (no devDeps)', () => {
      const dir = makeTmpProject({
        name: 'only-deps',
        dependencies: { '@helix/core': '^1.0.0' },
      });
      tmpDirs.push(dir);

      expect(getInstalledVersions(dir)).toEqual({ '@helix/core': '^1.0.0' });
    });

    it('getInstalledVersions handles package.json with only devDependencies (no deps)', () => {
      const dir = makeTmpProject({
        name: 'only-dev-deps',
        devDependencies: { '@helixui/react': '^0.3.0' },
      });
      tmpDirs.push(dir);

      expect(getInstalledVersions(dir)).toEqual({ '@helixui/react': '^0.3.0' });
    });

    it('buildUpgradePlan handles all known packages at once', async () => {
      mockRegistryVersion('2.0.0');

      const installed: Record<string, string> = {
        '@helix/core': '^1.0.0',
        '@helix/tokens': '^1.0.0',
        '@helixui/react': '^1.0.0',
      };

      const plan = await buildUpgradePlan(installed);
      expect(plan).toHaveLength(3);
      expect(plan.every((e) => e.changed)).toBe(true);
    });

    it('buildUpgradePlan handles mix of known and unknown packages', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ version: '2.0.0' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const plan = await buildUpgradePlan({
        '@helix/core': '^1.0.0',
        '@helix/nonexistent': '^1.0.0',
      });

      const core = plan.find((e) => e.name === '@helix/core');
      const unknown = plan.find((e) => e.name === '@helix/nonexistent');

      expect(core!.changed).toBe(true);
      expect(core!.latest).toBe('2.0.0');
      expect(unknown!.changed).toBe(false);
      expect(unknown!.latest).toBe('1.0.0');
    });
  });
});
