import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  detectHelixProject,
  getInstalledVersions,
  buildUpgradePlan,
  runUpgrade,
} from '../../src/commands/upgrade.js';

/** Helper: create a temp directory with a package.json. */
function makeTmpProject(pkgJson: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-upgrade-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf-8');
  return dir;
}

describe('upgrade command', () => {
  const tmpDirs: string[] = [];

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
    it('marks packages as changed when versions differ', () => {
      const plan = buildUpgradePlan({ '@helix/core': '^0.5.0' });
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(true);
      expect(core!.current).toBe('^0.5.0');
      expect(core!.latest).toBe('1.0.0');
    });

    it('marks packages as not changed when versions match', () => {
      const plan = buildUpgradePlan({ '@helix/core': '1.0.0' });
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(false);
    });

    it('handles unknown packages by keeping current version', () => {
      const plan = buildUpgradePlan({ '@helix/unknown-pkg': '^2.0.0' });
      const pkg = plan.find((e) => e.name === '@helix/unknown-pkg');

      expect(pkg).toBeDefined();
      expect(pkg!.latest).toBe('2.0.0');
      expect(pkg!.changed).toBe(false);
    });
  });

  describe('runUpgrade with --dry-run', () => {
    // Mock process.exit so it doesn't kill the test runner
    let mockExit: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
    });

    afterEach(() => {
      mockExit.mockRestore();
    });

    it('does not modify package.json in dry-run mode', () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^0.5.0' },
      });
      tmpDirs.push(dir);

      const originalContent = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');

      runUpgrade(dir, { dryRun: true });

      const afterContent = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
      expect(afterContent).toBe(originalContent);
    });

    it('exits with error for non-helix projects', () => {
      const dir = makeTmpProject({
        name: 'generic',
        dependencies: { react: '^18.0.0' },
      });
      tmpDirs.push(dir);

      expect(() => runUpgrade(dir, { dryRun: true })).toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('runUpgrade writes changes', () => {
    it('updates package.json when not dry-run', () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^0.5.0', react: '^18.0.0' },
      });
      tmpDirs.push(dir);

      runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helix/core']).toBe('^1.0.0');
      // Non-helix deps should be untouched
      expect(updated.dependencies['react']).toBe('^18.0.0');
    });
  });
});
