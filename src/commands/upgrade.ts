import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { validateDirectory } from '../validation.js';

/** Prefixes that identify a HELiX project in package.json dependencies. */
const HELIX_PREFIXES = ['@helix/', '@helixui/'] as const;

/**
 * Placeholder "latest" versions keyed by package name.
 * In a future iteration this will query the npm registry.
 */
const LATEST_VERSIONS: Record<string, string> = {
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

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackageJson(dir: string): PackageJson | null {
  const pkgPath = path.join(dir, 'package.json');
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

function isHelixDep(name: string): boolean {
  return HELIX_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Returns true when the directory contains a package.json with at least one
 * `@helix/*` or `@helixui/*` dependency.
 */
export function detectHelixProject(dir: string): boolean {
  const pkg = readPackageJson(dir);
  if (pkg === null) return false;

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.keys(allDeps).some(isHelixDep);
}

/**
 * Returns a map of installed HELiX package names to their current version
 * strings (as written in package.json).
 */
export function getInstalledVersions(dir: string): Record<string, string> {
  const pkg = readPackageJson(dir);
  if (pkg === null) return {};

  const allDeps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const result: Record<string, string> = {};
  for (const [name, version] of Object.entries(allDeps)) {
    if (isHelixDep(name)) {
      result[name] = version;
    }
  }
  return result;
}

export interface UpgradeOptions {
  dryRun?: boolean;
}

export interface UpgradePlan {
  name: string;
  current: string;
  latest: string;
  changed: boolean;
}

/**
 * Build an upgrade plan without performing any I/O beyond the initial read.
 */
export function buildUpgradePlan(installed: Record<string, string>): UpgradePlan[] {
  return Object.entries(installed).map(([name, current]) => {
    const knownLatest = LATEST_VERSIONS[name];
    const normalizedCurrent = current.replace(/^[\^~]/, '');
    const latest = knownLatest ?? normalizedCurrent;
    return {
      name,
      current,
      latest,
      changed: normalizedCurrent !== latest,
    };
  });
}

/**
 * Main upgrade entry point. Detects HELiX deps, shows current vs latest,
 * and (unless `--dry-run`) writes updated versions back to package.json.
 */
export function runUpgrade(dir: string, options: UpgradeOptions = {}): void {
  const { dryRun = false } = options;

  // SECURITY: Validate the directory path before reading any files.
  // This prevents path traversal attacks when the directory argument is
  // supplied programmatically or via future CLI flags.
  const dirError = validateDirectory(dir);
  if (dirError !== undefined) {
    p.log.error(pc.red(`Invalid directory: ${dirError}`));
    process.exit(1);
  }

  if (!detectHelixProject(dir)) {
    p.log.error(
      pc.red('No HELiX project detected.') +
        ' ' +
        pc.dim('Expected a package.json with @helix/* or @helixui/* dependencies.'),
    );
    process.exit(1);
  }

  const installed = getInstalledVersions(dir);
  const plan = buildUpgradePlan(installed);

  // Header
  p.intro(pc.bgCyan(pc.black(' create-helix upgrade ')));

  if (plan.length === 0) {
    p.log.info('No HELiX packages found to upgrade.');
    p.outro(pc.dim('Nothing to do.'));
    return;
  }

  // Display table
  const upgradeable = plan.filter((entry) => entry.changed);
  const upToDate = plan.filter((entry) => !entry.changed);

  if (upToDate.length > 0) {
    p.log.success(pc.green(`${upToDate.length} package(s) already up to date`));
    for (const entry of upToDate) {
      console.log(`  ${pc.dim(entry.name.padEnd(32))} ${pc.green(entry.latest)}`);
    }
  }

  if (upgradeable.length > 0) {
    console.log();
    p.log.info(`${upgradeable.length} package(s) can be upgraded:`);
    for (const entry of upgradeable) {
      console.log(
        `  ${pc.cyan(entry.name.padEnd(32))} ${pc.dim(entry.current)} ${pc.dim('->')} ${pc.green(entry.latest)}`,
      );
    }
  }

  if (upgradeable.length === 0) {
    console.log();
    p.outro(pc.green('All HELiX packages are up to date!'));
    return;
  }

  if (dryRun) {
    console.log();
    p.outro(pc.cyan('Dry run complete.') + ' ' + pc.dim('No files were modified.'));
    return;
  }

  // Write updated versions
  const pkgPath = path.join(dir, 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw) as PackageJson;

  for (const entry of upgradeable) {
    if (pkg.dependencies?.[entry.name] !== undefined) {
      pkg.dependencies[entry.name] = `^${entry.latest}`;
    }
    if (pkg.devDependencies?.[entry.name] !== undefined) {
      pkg.devDependencies[entry.name] = `^${entry.latest}`;
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  console.log();
  p.log.success(pc.green('package.json updated.'));
  p.note('Run `npm install` to apply the changes.', 'Next step');
  p.outro(pc.green('Upgrade complete!'));
}
