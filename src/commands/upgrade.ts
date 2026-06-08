import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { validateDirectory } from '../validation.js';
import { detectOffline, readRegistryCache, writeRegistryCache } from '../network.js';
import {
  HELIX_LIBRARY_MAJOR,
  HELIX_LIBRARY_VERSION,
  HELIX_ICONS_VERSION,
  libraryProvablyAtLeast,
  versionMeetsFloor,
  isResolvableRange,
} from '../helix-versions.js';

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
  /**
   * peerDependencies matters here: the wc-storybook scaffold declares its
   * `@helixui/*` packages as peerDependencies (the version CONTRACT) in
   * addition to devDependencies. An upgrade that touched only deps/devDeps
   * would leave the peer pin stale and produce an internally-inconsistent
   * package.json.
   */
  peerDependencies?: Record<string, string>;
}

/** The three dependency buckets `upgrade` reads from and writes back to. */
const DEP_BUCKETS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

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
 * Parse a semver-ish string into a [major, minor, patch] tuple, ignoring any
 * range prefix (`^`/`~`/`>=`), prerelease, and build metadata. Returns null
 * when the string can't be parsed — the caller falls back to string
 * comparison rather than guessing.
 *
 * Deliberately not a full semver library: `upgrade` only needs "is latest
 * strictly newer than installed" — the same minimal-dependency stance
 * `doctor.ts` takes for its major-floor check.
 */
function parseSemver(version: string): [number, number, number] | null {
  const cleaned = version.trim().replace(/^[\^~]|^>=?|^<=?|^=/g, '');
  const core = cleaned.split('-')[0].split('+')[0];
  const parts = core.split('.');
  // A clean version is EXACTLY `M.m.p`, every part purely numeric. Anything
  // else — partial ranges (`4.x`, `1.0`), wildcards (`*`), disjunctions
  // (`^1.0.0 || ^4.0.0`), npm aliases (`npm:pkg@4.0.0`) — is unparseable.
  // `parseInt` would silently accept `0 || ^4` as `0`, so validate the
  // exact shape: callers must treat null as "cannot compare — leave alone".
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) return null;
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

/**
 * Compare two semver-ish strings. Returns -1 when `a < b`, 0 when equal, 1
 * when `a > b`, or null when either side can't be parsed.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa === null || pb === null) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/**
 * Lenient leading-major extractor: the first run of digits in a spec
 * (`^3.9.1`, `3.x`, `3.0.0` → 3; `~0.3.0` → 0; unparseable → 0). Unlike
 * `parseSemver` this never returns null — it's for a coarse "is this on
 * major N+" gate where a partial range still carries a usable major. For a
 * disjunctive range (`^1.0.0 || ^4.0.0`) it reads the FIRST major (1), which
 * is the conservative lower bound.
 */
function leadingMajor(spec: string): number {
  const m = /(\d+)/.exec(spec);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Major version of `pkgName` as ACTUALLY RESOLVED in `dir`'s node_modules —
 * 0 when it isn't installed or the version is unparseable.
 *
 * The declared range text is not enough to decide "is this project on the
 * 3.x HELiX contract": a broad or union spec like `>=1.0.0` or
 * `^1.0.0 || ^3.9.1` reads as major 1 via `leadingMajor` but can resolve to
 * a 3.x install — which already has the unmet @helixui/icons peer this
 * migration is meant to fix. Best-effort: if node_modules hasn't been
 * populated yet this returns 0 and the declared-range signals still apply.
 */
function resolveInstalledMajor(dir: string, pkgName: string): number {
  const pkgJsonPath = path.join(dir, 'node_modules', ...pkgName.split('/'), 'package.json');
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version !== undefined ? leadingMajor(parsed.version) : 0;
  } catch {
    return 0;
  }
}

/** Resolved version string of `pkgName` in `dir`'s node_modules, or undefined. */
function resolveInstalledVersion(dir: string, pkgName: string): string | undefined {
  const pkgJsonPath = path.join(dir, 'node_modules', ...pkgName.split('/'), 'package.json');
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
    return (JSON.parse(raw) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

/** Every `||`-split leaf of `@helixui/library`'s declared ranges across buckets. */
function declaredLibraryLeaves(pkg: PackageJson): string[] {
  return DEP_BUCKETS.flatMap((b) => {
    const range = pkg[b]?.['@helixui/library'];
    return range !== undefined ? range.split('||').map((leaf) => leaf.trim()) : [];
  });
}

/**
 * Will `@helixui/library` PROVABLY be a stable version >= `floor` (a clean
 * `M.m.p`, e.g. `3.10.0`) after this run? Gates the @helixui/icons 1.0.4 peer,
 * required only from library 3.10.0 onward — NOT from the earlier 3.9.x pins,
 * which paired with icons 1.0.1.
 *
 * "Provable" is the key word: `upgrade` must only raise icons when it can show,
 * unambiguously, that the library reaches a stable 3.10. Three positive signals
 * — all routed through the SHARED `libraryProvablyAtLeast` predicate (the same
 * one `doctor` uses, so the two paths can't drift), which fails OPEN on every
 * ambiguous form (upper-bound ranges, prereleases, workspace:/catalog:/alias,
 * wildcards, below-floor):
 *   1. the RESOLVED install is provably >= floor (ground truth), or
 *   2. a declared leaf is provably >= floor already, or
 *   3. the plan will MOVE the library to the registry latest — which needs a
 *      declared leaf that PARSES and is strictly below that latest (so
 *      buildUpgradePlan marks it `changed`) AND a registry latest that is itself
 *      a provable stable >= floor.
 *
 * Signal 3 is why `registryLatest >= floor` ALONE is never proof: when every
 * declared spec is unparseable — `workspace:*`, `catalog:...`, an npm alias —
 * `compareSemver` returns null, the plan leaves the library untouched, and icons
 * must NOT be raised. Monorepo scaffolds use those specs, so this is a real path.
 */
function libraryMeetsFloor(
  pkg: PackageJson,
  projectDir: string,
  registryLatest: string | undefined,
  floor: string,
): boolean {
  const installed = resolveInstalledVersion(projectDir, '@helixui/library');
  if (installed !== undefined && libraryProvablyAtLeast(installed, floor)) return true;

  const declaredLeaves = declaredLibraryLeaves(pkg);
  // Already declared at a provable >= floor.
  if (declaredLeaves.some((leaf) => libraryProvablyAtLeast(leaf, floor))) return true;

  // The plan moves the library to the registry latest only when a declared leaf
  // parses AND is strictly below that latest (compareSemver === -1). An
  // unparseable spec (workspace:/catalog:/alias) compares null → not moved, so
  // the registry latest is irrelevant. And that latest must itself be a provable
  // stable >= floor (a prerelease "latest" is not proof).
  if (registryLatest !== undefined && libraryProvablyAtLeast(registryLatest, floor)) {
    return declaredLeaves.some((leaf) => compareSemver(leaf, registryLatest) === -1);
  }
  return false;
}

/**
 * Fetches the latest published version of a single npm package.
 * Returns undefined on any error (network failure, package not found, etc.).
 */
async function fetchPackageVersion(packageName: string): Promise<string | undefined> {
  if (versionCache.has(packageName)) {
    return versionCache.get(packageName);
  }
  try {
    // Scoped packages like @helix/core require %2F encoding of the slash
    const encodedName = packageName.startsWith('@') ? packageName.replace('/', '%2F') : packageName;
    const url = `https://registry.npmjs.org/${encodedName}/latest`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return undefined;
    const data = (await response.json()) as { version?: string };
    const version = data.version;
    if (version !== undefined) {
      versionCache.set(packageName, version);
    }
    return version;
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
 * `@helix/*` or `@helixui/*` dependency in any bucket (dependencies,
 * devDependencies, or peerDependencies).
 */
export function detectHelixProject(dir: string): boolean {
  const pkg = readPackageJson(dir);
  if (pkg === null) return false;

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.devDependencies,
  };
  return Object.keys(allDeps).some(isHelixDep);
}

/**
 * Resolve the directory whose `package.json` `upgrade` should operate on.
 *
 * For a flat project that's `dir`. For a scaffolded monorepo the HELiX
 * dependencies live in `apps/web/package.json`, not the workspace root — so
 * if `dir` itself declares no HELiX dep but `dir/apps/web` does, follow it
 * there. This mirrors `doctor`'s `resolveHelixManifestDir` so that
 * `create-helix doctor` (which already follows apps/web) and the
 * `create-helix upgrade` it recommends operate on the same manifest —
 * otherwise the recommended command exits "No HELiX project detected" from
 * a monorepo root.
 */
export function resolveHelixDir(dir: string): string {
  if (detectHelixProject(dir)) return dir;
  const appsWeb = path.join(dir, 'apps', 'web');
  if (detectHelixProject(appsWeb)) return appsWeb;
  return dir;
}

/**
 * Returns a map of installed HELiX package names to their current version
 * strings (as written in package.json).
 *
 * When a package appears in more than one bucket (`dependencies`,
 * `devDependencies`, `peerDependencies`) — the wc-storybook scaffold puts
 * `@helixui/*` in both peer + dev — the STALEST range wins. That matters:
 * if one bucket is current and another is behind, collapsing to the current
 * one would make `buildUpgradePlan` report the package up-to-date and the
 * stale bucket would never be rewritten. Surfacing the stalest range flags
 * the package as upgradeable, and the write-back then syncs every bucket.
 */
export function getInstalledVersions(dir: string): Record<string, string> {
  const pkg = readPackageJson(dir);
  if (pkg === null) return {};

  const result: Record<string, string> = {};
  for (const bucket of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
    if (bucket === undefined) continue;
    for (const [name, version] of Object.entries(bucket)) {
      if (!isHelixDep(name)) continue;
      const existing = result[name];
      if (existing === undefined) {
        result[name] = version;
        continue;
      }
      // Keep the staler of the two ranges. `compareSemver` of the
      // prefix-stripped versions: 1 means `existing` is newer than this
      // bucket's `version`, so `version` is staler → keep it. -1 / 0 / null
      // → keep `existing` (already the staler-or-equal, or incomparable).
      const cmp = compareSemver(existing.replace(/^[\^~]/, ''), version.replace(/^[\^~]/, ''));
      if (cmp === 1) result[name] = version;
    }
  }
  return result;
}

export interface UpgradeOptions {
  dryRun?: boolean;
  /**
   * When true, skip the npm registry entirely and serve latest-version data
   * from the on-disk registry cache (`~/.helix/cache/registry.json`). Set by
   * the `--offline` flag. Even without it, `runUpgrade` falls back to the
   * cache when a fast offline probe says the network is unreachable.
   */
  offline?: boolean;
}

export interface UpgradePlan {
  name: string;
  current: string;
  latest: string;
  changed: boolean;
}

/**
 * Build an upgrade plan given installed versions and the fetched latest
 * versions. A package is marked `changed` only when the latest is strictly
 * newer than what's installed — never when it's equal or OLDER, so `upgrade`
 * can't silently propose a downgrade. For packages not in `latestVersions`
 * (offline, not published) the current version is used as the latest so they
 * appear up-to-date.
 */
export function buildUpgradePlan(
  installed: Record<string, string>,
  latestVersions: Record<string, string>,
): UpgradePlan[] {
  return Object.entries(installed).map(([name, current]) => {
    const knownLatest = latestVersions[name];
    const normalizedCurrent = current.replace(/^[\^~]/, '');
    const latest = knownLatest ?? normalizedCurrent;
    const cmp = compareSemver(normalizedCurrent, latest);
    // Only `changed` when we can PROVE the latest is strictly newer
    // (cmp === -1). Equal, already-newer (cmp 0/1), OR unparseable
    // (cmp === null) all leave the dep untouched. Unparseable matters:
    // npm specs like `4.x`, `*`, or alias ranges don't parse, and a
    // string-inequality fallback could rewrite a project already on a
    // newer major DOWN to `latest` — the exact downgrade this guards against.
    const changed = cmp === -1;
    return {
      name,
      current,
      latest,
      changed,
    };
  });
}

/**
 * Main upgrade entry point. Resolves the latest versions of all installed
 * HELiX packages (registry when online, on-disk cache when offline), shows
 * current vs latest, and — unless `--dry-run` — writes the updated versions
 * back to every dependency bucket they appear in.
 */
export async function runUpgrade(dir: string, options: UpgradeOptions = {}): Promise<void> {
  const { dryRun = false, offline = false } = options;

  // SECURITY: Validate the directory path before reading any files.
  // This prevents path traversal attacks when the directory argument is
  // supplied programmatically or via future CLI flags.
  const dirError = validateDirectory(dir);
  if (dirError !== undefined) {
    p.log.error(pc.red(`Invalid directory: ${dirError}`));
    process.exit(1);
  }

  // For a scaffolded monorepo the HELiX deps live in apps/web/package.json,
  // not the workspace root. `doctor` already follows apps/web and recommends
  // `create-helix upgrade` as the fix — so `upgrade` must follow it too, or
  // the recommended command exits "No HELiX project detected" from the root.
  const projectDir = resolveHelixDir(dir);

  if (!detectHelixProject(projectDir)) {
    p.log.error(
      pc.red('No HELiX project detected.') +
        ' ' +
        pc.dim('Expected a package.json with @helix/* or @helixui/* dependencies.'),
    );
    process.exit(1);
  }

  const installed = getInstalledVersions(projectDir);

  // Read the manifest once, up front: the icon-peer migration decision below
  // needs the actual per-bucket shape (not just the flat installed map), and
  // the write-back at the end mutates this same object. `detectHelixProject`
  // already proved it parses, but guard defensively.
  const pkgPath = path.join(projectDir, 'package.json');
  const pkg = readPackageJson(projectDir);
  if (pkg === null) {
    p.log.error(pc.red(`Unable to read ${pkgPath}.`));
    process.exit(1);
  }

  // Drupal scaffolds: exempt @helixui/tokens from the upgrade plan
  // entirely. The runtime token layer for a Drupal theme is
  // `css/vendor/helix-tokens.css` (vendored at scaffold time, refreshed by
  // the theme's postinstall when `npm install` runs) — NOT the declared
  // range in package.json. Bumping the pin without also refreshing that
  // vendored CSS would advance the declaration while the theme keeps
  // serving stale token bytes. v0.9.3 ships the scaffold-time vendoring
  // for FRESH scaffolds; the upgrade-time refresh + pre-v0.9.3 theme-file
  // migration is the v0.9.4 follow-up. Until then, no honest @helixui/tokens
  // upgrade exists for an existing Drupal theme, so skip it from the plan.
  // (`@helixui/drupal-starter` is the Drupal marker.)
  const drupalTokensExcluded =
    installed['@helixui/drupal-starter'] !== undefined &&
    installed['@helixui/tokens'] !== undefined;
  if (drupalTokensExcluded) {
    delete installed['@helixui/tokens'];
  }

  // Resolve "latest" — registry when online, on-disk cache when offline.
  // `--offline` short-circuits the probe; otherwise a fast (500ms) reachability
  // check lets `upgrade` degrade gracefully when the network is simply down,
  // instead of hanging on a 5s-per-package fetch timeout.
  const isOffline = offline || (await detectOffline());
  let latestVersions: Record<string, string>;

  if (isOffline) {
    const cache = readRegistryCache();
    if (cache === null) {
      p.log.warn(
        pc.yellow('Offline — no cached registry data available.') +
          ' ' +
          pc.dim('Showing installed versions only; run `create-helix upgrade` online to refresh.'),
      );
      latestVersions = {};
    } else {
      latestVersions = cache.packages;
      const age = Math.round((Date.now() - cache.updatedAt) / (60 * 60 * 1000));
      p.log.info(pc.dim(`Offline — using cached registry data (${age}h old).`));
    }
  } else {
    const s = p.spinner();
    s.start('Fetching latest versions from npm registry…');
    const fetched = await fetchLatestVersions(Object.keys(installed));
    s.stop('Fetched latest versions');

    const fetchedCount = Object.keys(fetched).length;
    const totalCount = Object.keys(installed).length;
    const cache = readRegistryCache();

    // Start from the fresh results, then backfill any package the registry
    // did NOT return from the cache. A partial failure (one timeout, one
    // success) must not silently mark the missing package up-to-date.
    latestVersions = { ...fetched };
    if (fetchedCount < totalCount && cache !== null) {
      for (const name of Object.keys(installed)) {
        if (latestVersions[name] === undefined && cache.packages[name] !== undefined) {
          latestVersions[name] = cache.packages[name];
        }
      }
    }

    if (fetchedCount === 0) {
      p.log.warn(
        cache !== null
          ? pc.yellow('Could not reach npm registry — using cached version data.') +
              ' ' +
              pc.dim('Results may be stale.')
          : pc.yellow('Could not reach npm registry.') +
              ' ' +
              pc.dim('Showing installed versions only — upgrade check skipped.'),
      );
    } else if (fetchedCount < totalCount) {
      p.log.warn(
        pc.yellow('Some registry lookups failed.') +
          ' ' +
          pc.dim('Missing packages backfilled from the cache where available.'),
      );
    }

    if (fetchedCount > 0) {
      // Merge the fresh results INTO the existing cache rather than
      // overwriting — a partial failure must never shrink the cache and
      // leave subsequent offline runs worse off than before.
      writeRegistryCache({ ...(cache?.packages ?? {}), ...fetched });
    }
  }

  // create-helix KNOWS the @helixui/icons floor that @helixui/library@3.x
  // peer-requires (HELIX_ICONS_VERSION). Treat it as a registry-independent
  // MINIMUM "latest" for @helixui/icons: if a project declares @helixui/icons
  // below that floor and the registry lookup missed (offline, no cache, or a
  // partial failure), the plan would otherwise see "no known latest", keep
  // the stale range, and no-op — leaving `doctor` failing immediately after
  // it told the user to run `create-helix upgrade`. A real registry hit (>=
  // the floor) still wins; buildUpgradePlan's compareSemver guard refuses any
  // downgrade, so a project already above the floor is left untouched.
  //
  // SCOPED to a provable stable 3.10.0+: this floor is only required once
  // @helixui/library is (or is becoming) 3.10.0+ — the release that tightened
  // the <hx-icon> peer to icons 1.0.4. The earlier 3.9.x pins paired with icons
  // 1.0.1, so a project on 3.9.x (or below 3.10.0, an upper-bound/prerelease/
  // workspace range, or on 1.x/2.x) must NOT have icons synthesized up to 1.0.4
  // — that would rewrite a perfectly valid pre-3.10 pin. The shared
  // `libraryProvablyAtLeast` predicate (same one doctor uses) fails open on
  // every ambiguous form.
  const libraryFloor = HELIX_LIBRARY_VERSION.replace(/^[\^~]/, '');
  // Is @helixui/library provably a stable >= 3.10.0 (resolved/declared/being
  // moved there)? Computed ONCE and reused by both the synthetic-latest block
  // below and the peer-only devDep-seed — both raise icons to the 1.0.4 floor
  // ONLY when this holds.
  const libraryAtFloor = libraryMeetsFloor(
    pkg,
    projectDir,
    latestVersions['@helixui/library'],
    libraryFloor,
  );
  if (libraryAtFloor && installed['@helixui/icons'] !== undefined) {
    const iconsFloor = HELIX_ICONS_VERSION.replace(/^[\^~]/, '');
    const knownIconsLatest = latestVersions['@helixui/icons'];
    // Override the registry "latest" with the floor when there's no known
    // latest OR the known latest is below the floor — a semver floor check
    // (not ad-hoc compareSemver), consistent with doctor's icons-floor gate.
    if (knownIconsLatest === undefined || !versionMeetsFloor(knownIconsLatest, iconsFloor)) {
      latestVersions['@helixui/icons'] = iconsFloor;
    }
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

  // HELiX 3.x migration: @helixui/library@3.x peer-requires @helixui/icons
  // (the <hx-icon> registry). If the project's @helixui/library will be on
  // 3.x+ after this run — whether this run BUMPS it there or it was ALREADY
  // 3.x — and @helixui/icons is not declared anywhere, `upgrade` adds it.
  // The already-on-3.x case matters: that is the exact state `doctor` flags
  // and tells the user to fix with `create-helix upgrade`, so the
  // remediation must not be a no-op there — which is why this is computed
  // BEFORE the "nothing to upgrade" early return below. The final
  // @helixui/library spec is `latest` when it's being upgraded, else
  // whatever is already declared; `leadingMajor` reads a usable major from
  // either. This is the bounded part of the migration `upgrade` can do
  // safely (a package.json edit) — the same-origin sprite wiring is a
  // source-file change a tool shouldn't make blind (see the note below).
  // "Will @helixui/library be on 3.x+ after this run?" — true if it's being
  // upgraded TO 3.x+, OR it's ALREADY 3.x+ in ANY bucket. The second half
  // matters for mixed-bucket projects (e.g. peerDependencies on `^3.9.1`,
  // devDependencies still on `^1.0.0`) when there's no registry upgrade
  // entry — offline, or a full registry miss. `installed[...]` alone is the
  // merged STALEST range, which would read as 1.x and miss the migration.
  const libEntry = upgradeable.find((e) => e.name === '@helixui/library');
  const maxDeclaredMajor = (name: string): number =>
    DEP_BUCKETS.reduce((max, b) => {
      const range = pkg[b]?.[name];
      return range !== undefined ? Math.max(max, leadingMajor(range)) : max;
    }, 0);
  // Third disjunct: the version @helixui/library ACTUALLY resolves to in
  // node_modules. A broad or union declared range (`>=1.0.0`,
  // `^1.0.0 || ^3.9.1`) reads as major 1 via leadingMajor but can resolve to
  // a 3.x install that already has the unmet @helixui/icons peer — neither
  // the registry-entry nor the declared-range signal catches that.
  const libraryWillBeV3Plus =
    (libEntry !== undefined && leadingMajor(libEntry.latest) >= HELIX_LIBRARY_MAJOR) ||
    maxDeclaredMajor('@helixui/library') >= HELIX_LIBRARY_MAJOR ||
    resolveInstalledMajor(projectDir, '@helixui/library') >= HELIX_LIBRARY_MAJOR;
  // When @helixui/library will be on 3.x+, @helixui/icons must end up both
  // DECLARED and INSTALLABLE. Three states:
  //   - absent    → add it (to the library's buckets, then ensure installable)
  //   - peer-only → seed devDependencies; `pnpm install` does NOT put a bare
  //                 peerDependency into the package's own node_modules, so a
  //                 peer-only declaration leaves doctor + the runtime unable
  //                 to resolve it
  //   - already in dependencies/devDependencies → nothing to do
  const iconsBuckets = DEP_BUCKETS.filter((b) => pkg[b]?.['@helixui/icons'] !== undefined);
  const iconsAbsent = iconsBuckets.length === 0;
  const iconsPeerOnly =
    !iconsAbsent &&
    !iconsBuckets.includes('dependencies') &&
    !iconsBuckets.includes('devDependencies');
  const iconsMigrationNeeded = libraryWillBeV3Plus && (iconsAbsent || iconsPeerOnly);

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

  if (iconsMigrationNeeded) {
    console.log();
    p.log.info(
      iconsAbsent
        ? `@helixui/library is on 3.x but its required @helixui/icons peer is missing — will add @helixui/icons ${HELIX_ICONS_VERSION}.`
        : '@helixui/icons is declared only in peerDependencies — will seed a devDependencies copy so it actually installs.',
    );
  }

  if (drupalTokensExcluded) {
    console.log();
    p.log.info(
      pc.dim(
        '@helixui/tokens skipped — for Drupal themes the runtime tokens come from css/vendor/helix-tokens.css, not the declared range. Upgrade-time vendored-CSS refresh is the v0.9.4 follow-up.',
      ),
    );
  }

  // Nothing to do only when there are no version bumps AND no icon-peer
  // migration to apply.
  if (upgradeable.length === 0 && !iconsMigrationNeeded) {
    console.log();
    p.outro(pc.green('All HELiX packages are up to date!'));
    return;
  }

  if (dryRun) {
    console.log();
    p.outro(pc.cyan('Dry run complete.') + ' ' + pc.dim('No files were modified.'));
    return;
  }

  // Write updated versions back to every bucket each package appears in.
  // Mutates the `pkg` object read up front (from `projectDir` — a monorepo's
  // apps/web manifest, not the raw `dir`).
  //
  // Per-bucket no-downgrade guard: `entry.latest` is derived from the
  // STALEST declared range (getInstalledVersions surfaces the stalest so the
  // package gets flagged at all), so a bucket that's ALREADY newer than
  // `entry.latest` must not be dragged backward — which can happen on an
  // offline run against a stale cache (peerDeps `^3.9.1`, devDeps `^1.0.0`,
  // cached latest `2.5.0`). Only rewrite a bucket when `latest` is strictly
  // newer than what that bucket already pins; an unparseable current range
  // (compareSemver → null) is left untouched.
  for (const entry of upgradeable) {
    for (const bucket of DEP_BUCKETS) {
      const deps = pkg[bucket];
      const currentInBucket = deps?.[entry.name];
      if (deps === undefined || currentInBucket === undefined) continue;
      if (compareSemver(currentInBucket.replace(/^[\^~]/, ''), entry.latest) === -1) {
        deps[entry.name] = `^${entry.latest}`;
      }
    }
  }

  if (iconsMigrationNeeded && iconsAbsent) {
    // Add @helixui/icons to the SAME bucket(s) @helixui/library lives in —
    // library-shaped projects (the wc-storybook scaffold) keep HELiX packages
    // in peerDependencies/devDependencies on purpose, so forcing icons into
    // `dependencies` would break that contract. Then ensure at least one
    // INSTALLABLE bucket: `pnpm install` does NOT place a bare
    // peerDependency into the package's own node_modules, so a peer-only
    // placement would leave doctor + the runtime unable to resolve it. (The
    // wc-storybook scaffold declares @helixui/icons in BOTH peer + dev for
    // exactly this reason.)
    const targetBuckets = new Set<(typeof DEP_BUCKETS)[number]>(
      DEP_BUCKETS.filter((b) => pkg[b]?.['@helixui/library'] !== undefined),
    );
    if (targetBuckets.size === 0) targetBuckets.add('dependencies');
    if (!targetBuckets.has('dependencies') && !targetBuckets.has('devDependencies')) {
      targetBuckets.add('devDependencies');
    }
    for (const bucket of targetBuckets) {
      const deps = (pkg[bucket] ??= {});
      deps['@helixui/icons'] = HELIX_ICONS_VERSION;
    }
  } else if (iconsMigrationNeeded && iconsPeerOnly) {
    // @helixui/icons is declared, but only in peerDependencies — keep that
    // contract entry and seed a devDependencies copy so the package actually
    // installs into node_modules (`pnpm install` does NOT place a bare
    // peerDependency into the package's own node_modules).
    //
    // The 1.0.4 icons floor is only required once @helixui/library is provably
    // a stable >= 3.10.0 (libraryAtFloor) — the earlier 3.9.x pins paired with
    // icons 1.0.1. So we only RAISE the seeded copy to the floor when BOTH the
    // library is at the floor AND the peer range doesn't already meet it. The
    // floor check runs through the shared semver predicate (NOT ad-hoc
    // compareSemver). A clean single range we can seed verbatim (e.g. `^1.0.1`)
    // is kept as-is on a 3.9.x project; a peer we can't cleanly copy — a `||`
    // union (`^1.0.0 || ^2.0.0`) or an unparseable spec (`workspace:*`) — falls
    // back to the known-good floor pin regardless.
    const peerRange = pkg.peerDependencies?.['@helixui/icons'];
    const iconsFloor = HELIX_ICONS_VERSION.replace(/^[\^~]/, '');
    const peerCleanlySeedable =
      peerRange !== undefined && !peerRange.includes('||') && isResolvableRange(peerRange);
    const peerMeetsFloor = peerRange !== undefined && libraryProvablyAtLeast(peerRange, iconsFloor);
    // Raise to the floor when the library needs it (3.10+) and the peer is
    // below it, OR when the peer can't be seeded verbatim at all.
    const raiseToFloor = !peerCleanlySeedable || (libraryAtFloor && !peerMeetsFloor);
    (pkg.devDependencies ??= {})['@helixui/icons'] = raiseToFloor ? HELIX_ICONS_VERSION : peerRange;
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  console.log();
  p.log.success(pc.green('package.json updated.'));
  if (iconsMigrationNeeded && iconsAbsent) {
    p.log.warn(
      pc.yellow(`Added @helixui/icons ${HELIX_ICONS_VERSION}`) +
        ' ' +
        pc.dim('— required by @helixui/library@3.x.'),
    );
    p.note(
      'HELiX 3.x serves <hx-icon> sprites from a CDN the browser blocks cross-origin.\n' +
        'Two manual steps remain for <hx-icon> to render same-origin:\n' +
        '  1. copy @helixui/icons sprite SVGs into your static dir (public/icons or static/icons)\n' +
        "  2. call setBasePath('/icons') before @helixui/library loads in your runtime loader\n" +
        'Run `create-helix doctor` to verify, or re-scaffold to get the wiring generated.',
      'HELiX 3.x icon setup',
    );
  } else if (iconsMigrationNeeded && iconsPeerOnly) {
    p.log.warn(
      pc.yellow('Seeded a devDependencies copy of @helixui/icons') +
        ' ' +
        pc.dim('— the peer-only declaration is not installable on its own.'),
    );
  }
  p.note('Run `pnpm install` to apply the changes.', 'Next step');
  p.outro(pc.green('Upgrade complete!'));
}
