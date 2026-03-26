import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { validateDirectory } from '../validation.js';
import { withRetry } from '../retry.js';

/** Prefixes that identify a HELiX project in package.json dependencies. */
const HELIX_PREFIXES = ['@helix/', '@helixui/'] as const;

/** In-memory cache so repeated fetch calls within one CLI run don't refetch. */
const versionCache = new Map<string, string>();

/** Clears the version cache. Exposed for testing. */
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
 * Fetches the latest published version of a single npm package.
 * Retries up to 3 times with exponential backoff on transient network errors.
 * Returns undefined when the package cannot be resolved after all attempts.
 */
async function fetchPackageVersion(packageName: string): Promise<string | undefined> {
  if (versionCache.has(packageName)) {
    return versionCache.get(packageName);
  }
  try {
    return await withRetry(
      async () => {
        // Scoped packages like @helix/core require %2F encoding of the slash
        const encodedName = packageName.startsWith('@')
          ? packageName.replace('/', '%2F')
          : packageName;
        const url = `https://registry.npmjs.org/${encodedName}/latest`;
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          throw new Error(`npm registry returned ${response.status} for ${packageName}`);
        }
        const data = (await response.json()) as { version?: string };
        const version = data.version;
        if (version !== undefined) {
          versionCache.set(packageName, version);
        }
        return version;
      },
      { maxRetries: 3 },
    );
  } catch {
    return undefined;
  }
}

/**
 * Fetches latest versions for all given package names from the npm registry.
 * Packages that cannot be resolved (offline, not published, etc.) are omitted
 * from the returned map so the caller can detect and handle that case.
 */
export async function fetchLatestVersions(packageNames: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    packageNames.map(async (name) => {
      const version = await fetchPackageVersion(name);
      return [name, version] as [string, string | undefined];
    }),
  );

  const result: Record<string, string> = {};
  for (const [name, version] of entries) {
    if (version !== undefined) {
      result[name] = version;
    }
  }
  return result;
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
 * Build an upgrade plan given installed versions and the fetched latest versions.
 * For packages not found in `latestVersions` (e.g. offline or not published),
 * the current version is used as the latest so they appear up-to-date.
 */
export function buildUpgradePlan(
  installed: Record<string, string>,
  latestVersions: Record<string, string>,
): UpgradePlan[] {
  return Object.entries(installed).map(([name, current]) => {
    const knownLatest = latestVersions[name];
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
 * Main upgrade entry point. Queries the npm registry for latest versions of all
 * installed HELiX packages, shows current vs latest, and (unless `--dry-run`)
 * writes updated versions back to package.json.
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

  // Query the npm registry for the latest versions of all installed HELiX packages
  const s = p.spinner();
  s.start('Fetching latest versions from npm registry…');
  const latestVersions = await fetchLatestVersions(Object.keys(installed));
  s.stop('Fetched latest versions');

  const fetchedCount = Object.keys(latestVersions).length;
  const totalCount = Object.keys(installed).length;
  if (totalCount > 0 && fetchedCount === 0) {
    p.log.warn(
      pc.yellow('Could not reach npm registry.') +
        ' ' +
        pc.dim('Showing installed versions only — upgrade check skipped.'),
    );
  }

  const plan = buildUpgradePlan(installed, latestVersions);

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
