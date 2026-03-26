import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { validateDirectory } from '../validation.js';

/** Prefixes that identify a HELiX project in package.json dependencies. */
const HELIX_PREFIXES = ['@helix/', '@helixui/'] as const;

/** Shape of the npm registry response for the "latest" dist-tag. */
interface NpmRegistryResponse {
  version: string;
}

/** Session-level cache for npm registry lookups. */
const versionCache = new Map<string, string>();

/**
 * Fetch the latest published version of an npm package from the registry.
 * Results are cached for the lifetime of the process. On network errors or
 * 404s the function returns `null` so callers can fall back gracefully.
 */
export async function fetchLatestVersion(packageName: string): Promise<string | null> {
  const cached = versionCache.get(packageName);
  if (cached !== undefined) return cached;

  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
    const response = await fetch(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as NpmRegistryResponse;
    if (typeof data.version === 'string' && data.version.length > 0) {
      versionCache.set(packageName, data.version);
      return data.version;
    }

    return null;
  } catch {
    // Network error (offline, DNS failure, timeout, etc.)
    return null;
  }
}

/**
 * Query latest versions for a list of package names in parallel.
 * Returns a map of package name -> latest version string.
 * Packages that could not be resolved are omitted from the result.
 */
export async function fetchLatestVersions(packageNames: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const entries = await Promise.all(
    packageNames.map(async (name) => {
      const version = await fetchLatestVersion(name);
      return [name, version] as const;
    }),
  );

  for (const [name, version] of entries) {
    if (version !== null) {
      results.set(name, version);
    }
  }
  return results;
}

/**
 * Clear the version cache. Useful for testing.
 */
export function clearVersionCache(): void {
  versionCache.clear();
}

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
 * Build an upgrade plan by querying the npm registry for latest versions.
 * Falls back to the current version (no upgrade) when the registry is
 * unreachable or the package is not published.
 */
export async function buildUpgradePlan(installed: Record<string, string>): Promise<UpgradePlan[]> {
  const packageNames = Object.keys(installed);
  const latestVersions = await fetchLatestVersions(packageNames);

  const plan: UpgradePlan[] = [];
  for (const [name, current] of Object.entries(installed)) {
    const normalizedCurrent = current.replace(/^[\^~]/, '');
    const registryLatest = latestVersions.get(name);

    // If we could not reach the registry, fall back to current (no upgrade)
    if (registryLatest === undefined) {
      p.log.warn(pc.yellow(`Could not fetch latest version for ${name} — skipping upgrade check`));
      plan.push({ name, current, latest: normalizedCurrent, changed: false });
      continue;
    }

    plan.push({
      name,
      current,
      latest: registryLatest,
      changed: normalizedCurrent !== registryLatest,
    });
  }
  return plan;
}

/**
 * Main upgrade entry point. Detects HELiX deps, shows current vs latest,
 * and (unless `--dry-run`) writes updated versions back to package.json.
 */
export async function runUpgrade(dir: string, options: UpgradeOptions = {}): Promise<void> {
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
  const plan = await buildUpgradePlan(installed);

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
