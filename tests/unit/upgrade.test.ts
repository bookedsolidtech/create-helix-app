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

/** Helper: create a temp directory without a package.json. */
function makeTmpDirOnly(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'helix-upgrade-'));
}

describe('upgrade command', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
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
  });

  // ─── buildUpgradePlan ────────────────────────────────────────────────────

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

    it('marks packages with caret prefix as not changed when base version matches', () => {
      const plan = buildUpgradePlan({ '@helix/core': '^1.0.0' });
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(false);
      expect(core!.current).toBe('^1.0.0');
      expect(core!.latest).toBe('1.0.0');
    });

    it('marks packages with tilde prefix as not changed when base version matches', () => {
      const plan = buildUpgradePlan({ '@helix/core': '~1.0.0' });
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(false);
    });

    it('strips caret prefix before comparing versions', () => {
      const plan = buildUpgradePlan({ '@helix/core': '^0.9.0' });
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(true);
      expect(core!.latest).toBe('1.0.0');
    });

    it('strips tilde prefix before comparing versions', () => {
      const plan = buildUpgradePlan({ '@helix/core': '~0.9.0' });
      const core = plan.find((e) => e.name === '@helix/core');

      expect(core).toBeDefined();
      expect(core!.changed).toBe(true);
      expect(core!.latest).toBe('1.0.0');
    });

    it('handles unknown packages by keeping current version (normalized)', () => {
      const plan = buildUpgradePlan({ '@helix/unknown-pkg': '^2.0.0' });
      const pkg = plan.find((e) => e.name === '@helix/unknown-pkg');

      expect(pkg).toBeDefined();
      expect(pkg!.latest).toBe('2.0.0');
      expect(pkg!.changed).toBe(false);
    });

    it('handles unknown packages without version prefix', () => {
      const plan = buildUpgradePlan({ '@helix/custom': '3.2.1' });
      const pkg = plan.find((e) => e.name === '@helix/custom');

      expect(pkg).toBeDefined();
      expect(pkg!.latest).toBe('3.2.1');
      expect(pkg!.changed).toBe(false);
    });

    it('returns an empty plan for empty input', () => {
      const plan = buildUpgradePlan({});

      expect(plan).toEqual([]);
    });

    it('creates a plan entry for every installed package', () => {
      const installed = {
        '@helix/core': '^0.5.0',
        '@helix/tokens': '~0.4.0',
        '@helixui/react': '^0.3.0',
        '@helixui/vue': '1.0.0',
      };

      const plan = buildUpgradePlan(installed);

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

      const plan = buildUpgradePlan(installed);
      const changed = plan.filter((e) => e.changed);
      const unchanged = plan.filter((e) => !e.changed);

      expect(changed).toHaveLength(2);
      expect(unchanged).toHaveLength(2);
      expect(changed.map((e) => e.name).sort()).toEqual(['@helix/core', '@helixui/vue']);
      expect(unchanged.map((e) => e.name).sort()).toEqual(['@helix/tokens', '@helixui/react']);
    });

    it('preserves the original current version string in the plan', () => {
      const plan = buildUpgradePlan({
        '@helix/core': '^0.5.0',
        '@helix/tokens': '~0.4.0',
        '@helix/icons': '0.3.0',
      });

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

      const plan = buildUpgradePlan(allKnown);

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

      const plan = buildUpgradePlan(installed);

      const core = plan.find((e) => e.name === '@helix/core');
      const custom = plan.find((e) => e.name === '@helix/custom-plugin');

      expect(core!.changed).toBe(true);
      expect(core!.latest).toBe('1.0.0');
      expect(custom!.changed).toBe(false);
      expect(custom!.latest).toBe('2.0.0');
    });
  });

  // ─── runUpgrade with --dry-run ───────────────────────────────────────────

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

    it('exits with error when directory has no package.json', () => {
      const dir = makeTmpDirOnly();
      tmpDirs.push(dir);

      expect(() => runUpgrade(dir, { dryRun: true })).toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // ─── runUpgrade writes changes ───────────────────────────────────────────

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
      expect(updated.dependencies['react']).toBe('^18.0.0');
    });

    it('updates devDependencies when not dry-run', () => {
      const dir = makeTmpProject({
        name: 'test-project',
        devDependencies: { '@helixui/react': '^0.3.0', vitest: '^1.0.0' },
      });
      tmpDirs.push(dir);

      runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        devDependencies: Record<string, string>;
      };
      expect(updated.devDependencies['@helixui/react']).toBe('^1.0.0');
      expect(updated.devDependencies['vitest']).toBe('^1.0.0');
    });

    it('updates packages in both deps and devDeps simultaneously', () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^0.5.0' },
        devDependencies: { '@helixui/react': '^0.3.0' },
      });
      tmpDirs.push(dir);

      runUpgrade(dir, { dryRun: false });

      const updated = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      expect(updated.dependencies['@helix/core']).toBe('^1.0.0');
      expect(updated.devDependencies['@helixui/react']).toBe('^1.0.0');
    });

    it('does not modify already-up-to-date packages', () => {
      const dir = makeTmpProject({
        name: 'test-project',
        dependencies: { '@helix/core': '^1.0.0', '@helix/tokens': '^1.0.0' },
      });
      tmpDirs.push(dir);

      runUpgrade(dir, { dryRun: false });

      const raw = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
      const updated = JSON.parse(raw) as { dependencies: Record<string, string> };
      expect(updated.dependencies['@helix/core']).toBe('^1.0.0');
      expect(updated.dependencies['@helix/tokens']).toBe('^1.0.0');
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
      const plan = buildUpgradePlan({});
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
});
