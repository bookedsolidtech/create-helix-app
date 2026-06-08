import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { TEMPLATES } from './templates.js';
import { HELIX_LIBRARY_MAJOR, HELIX_TOKENS_MAJOR, HELIX_ICONS_VERSION } from './helix-versions.js';

export interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail' | 'skip';
  message: string;
}

export interface DoctorResult {
  version: string;
  checks: CheckResult[];
  allPassed: boolean;
}

export interface DoctorOptions {
  /**
   * v0.6.0 Phase F — when true, skip checks that may be slow or that probe
   * the consumer's on-disk node_modules (e.g. the `/icons/helix.svg`
   * reachability check). CI environments that scaffold-but-don't-install
   * still get the deterministic checks.
   */
  quick?: boolean;
  /** Allow tests to inject a fake cwd. Defaults to `process.cwd()`. */
  cwd?: string;
}

function runCommand(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: 'pipe', timeout: 5000 }).toString().trim();
  } catch {
    return null;
  }
}

function parseVersion(output: string): string {
  const match = /(\d+\.\d+[.\d]*)/.exec(output);
  return match ? match[1] : output;
}

export function checkNodeVersion(): CheckResult {
  const version = process.version; // e.g. "v22.4.0"
  const major = parseInt(version.slice(1).split('.')[0], 10);
  if (major >= 20) {
    return { name: 'Node.js', status: 'ok', message: `${version} (>= 20 required)` };
  }
  return {
    name: 'Node.js',
    status: 'warn',
    message: `${version} (< 20 required — please upgrade)`,
  };
}

export function checkPackageManagers(): CheckResult[] {
  const results: CheckResult[] = [];

  const npmOut = runCommand('npm --version');
  if (npmOut !== null) {
    results.push({ name: 'npm', status: 'ok', message: `v${parseVersion(npmOut)}` });
  } else {
    results.push({ name: 'npm', status: 'warn', message: 'not found' });
  }

  const pnpmOut = runCommand('pnpm --version');
  if (pnpmOut !== null) {
    results.push({ name: 'pnpm', status: 'ok', message: `v${parseVersion(pnpmOut)}` });
  }

  const yarnOut = runCommand('yarn --version');
  if (yarnOut !== null) {
    results.push({ name: 'yarn', status: 'ok', message: `v${parseVersion(yarnOut)}` });
  }

  return results;
}

export function checkGit(): CheckResult {
  const out = runCommand('git --version');
  if (out !== null) {
    return { name: 'git', status: 'ok', message: `v${parseVersion(out)}` };
  }
  return { name: 'git', status: 'warn', message: 'not found' };
}

export function checkDiskSpace(): CheckResult {
  try {
    const cwd = process.cwd();
    // Use 'df' on Unix-like systems to get available disk space
    const out = runCommand(`df -k "${cwd}"`);
    if (out !== null) {
      const lines = out.split('\n');
      // Second line has the data
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        // df -k: columns are Filesystem, 1K-blocks, Used, Available, ...
        const availKb = parseInt(parts[3], 10);
        if (!isNaN(availKb)) {
          const availGb = (availKb / (1024 * 1024)).toFixed(1);
          return { name: 'Disk space', status: 'ok', message: `${availGb} GB available` };
        }
      }
    }
    // Fallback: use os.freemem as approximation isn't ideal but avoids failure
    const freeBytes = os.freemem();
    const freeGb = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);
    return { name: 'Disk space', status: 'ok', message: `~${freeGb} GB available (RAM free)` };
  } catch {
    return { name: 'Disk space', status: 'warn', message: 'unable to determine' };
  }
}

export function checkWritePermissions(): CheckResult {
  try {
    fs.accessSync(process.cwd(), fs.constants.W_OK);
    return { name: 'Write permissions', status: 'ok', message: 'OK' };
  } catch {
    return { name: 'Write permissions', status: 'fail', message: 'not writable' };
  }
}

export function checkNetwork(): Promise<CheckResult> {
  return new Promise((resolve) => {
    const req = https.get('https://registry.npmjs.org/', { timeout: 5000 }, (res) => {
      res.destroy();
      resolve({ name: 'Network', status: 'ok', message: 'npmjs.org reachable' });
    });
    req.on('error', () => {
      resolve({ name: 'Network', status: 'warn', message: 'npmjs.org unreachable' });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ name: 'Network', status: 'warn', message: 'npmjs.org timed out' });
    });
  });
}

// ─── v0.6.0 Phase F — wc-storybook surface checks ───────────────────────────
//
// These run when the doctor is invoked inside a SCAFFOLDED PROJECT (not when
// invoked outside of a project). Each check first proves the project is a
// wc-storybook scaffold; if not, it returns a `skip` status with a one-line
// rationale rather than a false-positive fail. devex-architect invariant:
// "every 'missing' diagnostic names the path inspected + the next step."

/**
 * Read the consuming project's package.json. Returns null when no
 * package.json exists at the resolved cwd (doctor was run somewhere else).
 */
function readProjectPackageJson(cwd: string): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  engines?: { node?: string };
} | null {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    return JSON.parse(raw) as ReturnType<typeof readProjectPackageJson>;
  } catch {
    return null;
  }
}

/** True when `dir`'s package.json declares any `@helixui/*` dependency. */
function dirDeclaresHelix(dir: string): boolean {
  const pkg = readProjectPackageJson(dir);
  if (pkg === null) return false;
  return [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies].some(
    (bucket) => bucket !== undefined && Object.keys(bucket).some((k) => k.startsWith('@helixui/')),
  );
}

/**
 * Resolve the directory whose `package.json` + `node_modules` the
 * `@helixui/*` checks should inspect.
 *
 * For a flat scaffold that's `cwd`. For a monorepo scaffold the HELiX
 * packages live in `apps/web/`, not the workspace root — so if `cwd` itself
 * declares no `@helixui/*` dep but `cwd/apps/web` does, the checks follow it
 * there. Without this, `create-helix doctor` run from a monorepo root would
 * `skip` the drift + icon checks entirely, even when `apps/web` is stale.
 * (The monorepo `packages/design-system/` is the library author's own
 * surface; doctor targets the consuming app.)
 */
function resolveHelixManifestDir(cwd: string): string {
  if (dirDeclaresHelix(cwd)) return cwd;
  const appsWeb = path.join(cwd, 'apps', 'web');
  if (dirDeclaresHelix(appsWeb)) return appsWeb;
  return cwd;
}

/**
 * Does `dir` declare @helixui/icons in any deps bucket? Cheap proxy for
 * "this scaffold consumes the icon registry." Used to gate checkHelixIcons.
 */
function projectDeclaresIcons(dir: string): boolean {
  const pkg = readProjectPackageJson(dir);
  if (pkg === null) return false;
  return Boolean(
    pkg.dependencies?.['@helixui/icons'] ??
    pkg.devDependencies?.['@helixui/icons'] ??
    pkg.peerDependencies?.['@helixui/icons'],
  );
}

/**
 * Compare two semver-ish strings — true when `actual` >= `floor`. Range
 * prefixes (`^`, `~`, `v`) are stripped and prerelease/build metadata is
 * ignored; unparseable input returns false so a malformed version surfaces
 * as a failure rather than silently passing. Enough precision for a
 * minor/patch floor check without pulling in a full semver lib.
 */
function versionAtLeast(actual: string, floor: string): boolean {
  const parse = (v: string): [number, number, number] | null => {
    const m = /^[v^~]*(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : null;
  };
  const a = parse(actual);
  const f = parse(floor);
  if (a === null || f === null) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > f[i]) return true;
    if (a[i] < f[i]) return false;
  }
  return true; // exactly equal
}

/**
 * Read the package.json of `pkgName` as installed in the CONSUMER's tree.
 *
 * Uses a direct `node_modules/<pkg>/package.json` read rather than
 * `createRequire().resolve('<pkg>/package.json')`: modern packages
 * (@helixui/library, @helixui/tokens, @helixui/icons all do this) ship an
 * `exports` map that does NOT expose `./package.json`, so `resolve()` throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` against a real install. The direct read
 * matches the node_modules-path approach checkIconBasePathReachable uses.
 *
 * Returns null when the package is not on disk under `cwd/node_modules`.
 */
function readConsumerPackageVersion(
  cwd: string,
  pkgName: string,
): { version: string; pkgJsonPath: string } | null {
  const pkgJsonPath = path.join(cwd, 'node_modules', ...pkgName.split('/'), 'package.json');
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return { version: pkg.version ?? 'unknown', pkgJsonPath };
  } catch {
    return null;
  }
}

/**
 * Major version of `pkgName` as ACTUALLY RESOLVED in the consumer's
 * node_modules — 0 when it isn't on disk or the version is unparseable.
 *
 * The declared range text alone is not enough: a broad or union spec like
 * `>=1.0.0` or `^1.0.0 || ^3.9.1` reads as major 1 (the lower bound) but can
 * resolve to a 3.x install. A 3.x HELiX library requires the @helixui/icons
 * peer regardless of how the range that pulled it in was written, so the
 * checks must look at what's installed, not only what's declared.
 */
function installedMajor(dir: string, pkgName: string): number {
  const resolved = readConsumerPackageVersion(dir, pkgName);
  if (resolved === null) return 0;
  const m = /^v?(\d+)\./.exec(resolved.version.trim());
  return m ? parseInt(m[1], 10) : 0;
}

export function checkHelixIcons(cwd: string): CheckResult {
  // Follow the scaffold's manifest — the flat scaffold root, or apps/web for
  // a monorepo scaffold (see resolveHelixManifestDir).
  const dir = resolveHelixManifestDir(cwd);
  if (!projectDeclaresIcons(dir)) {
    // @helixui/icons absent. On @helixui/library@3.x it's a REQUIRED peer
    // (the <hx-icon> registry) — so if the manifest declares library at
    // 3.x+ in ANY bucket, the absence is a real failure, not a skip. This is
    // the state an older app scaffold lands in after `create-helix upgrade`
    // bumps library to 3.x: <hx-icon> cannot work until the peer is added.
    // Pre-3.x library had no icon API, so for those (or no library at all)
    // it's still a skip. declaredMaxMajor checks every bucket so a
    // mixed-bucket project on the 3.x contract isn't missed; installedMajor
    // also catches a project whose declared range reads pre-3.x (`>=1.0.0`,
    // `^1.0.0 || ^3.9.1`) but actually RESOLVES @helixui/library at 3.x.
    const libMajor = Math.max(
      declaredMaxMajor(dir, '@helixui/library'),
      installedMajor(dir, '@helixui/library'),
    );
    if (libMajor >= HELIX_LIBRARY_MAJOR) {
      return {
        name: '@helixui/icons',
        status: 'fail',
        message: `@helixui/library@${libMajor}.x requires the @helixui/icons peer, but it is not declared — add it (\`pnpm add @helixui/icons\`) or run \`create-helix upgrade\`.`,
      };
    }
    return {
      name: '@helixui/icons',
      status: 'skip',
      message: 'no @helixui/icons dependency — skipped.',
    };
  }
  // Read from the CONSUMING project's node_modules so a missing install is
  // detected here, not after we've already told the consumer everything is
  // fine.
  const resolved = readConsumerPackageVersion(dir, '@helixui/icons');
  if (resolved === null) {
    return {
      name: '@helixui/icons',
      status: 'fail',
      message: '@helixui/icons not resolvable — run `pnpm install` to populate node_modules.',
    };
  }
  const { version, pkgJsonPath } = resolved;
  // @helixui/library@3.x peer-requires @helixui/icons at the
  // HELIX_ICONS_VERSION floor — a major-only check would wrongly pass a
  // 1.0.0 install that doesn't satisfy the ^1.0.4 the scaffold pins.
  if (!versionAtLeast(version, HELIX_ICONS_VERSION)) {
    return {
      name: '@helixui/icons',
      status: 'fail',
      message: `v${version} — below the ${HELIX_ICONS_VERSION} floor create-helix pins; run \`create-helix upgrade\` or \`pnpm update @helixui/icons\`.`,
    };
  }
  return {
    name: '@helixui/icons',
    status: 'ok',
    message: `v${version} resolvable at ${path.relative(cwd, pkgJsonPath)}`,
  };
}

/** Every declared version range for `pkgName` across all deps buckets. */
function declaredRanges(dir: string, pkgName: string): string[] {
  const pkg = readProjectPackageJson(dir);
  if (pkg === null) return [];
  return [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]
    .map((bucket) => bucket?.[pkgName])
    .filter((range): range is string => range !== undefined);
}

/** Major version parsed from a range string (`^3.9.1` → 3); 0 if unparseable. */
function rangeMajor(range: string): number {
  const m = /(\d+)\./.exec(range.trim());
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Highest major `pkgName` is declared at across ALL deps buckets, or 0 when
 * it isn't declared. Checking every bucket matters: a mixed-bucket project
 * (e.g. `devDependencies['@helixui/library']='^1.0.0'` +
 * `peerDependencies['@helixui/library']='^3.9.1'`) is already on the 3.x
 * contract — looking at only the first-declared range would miss that.
 */
function declaredMaxMajor(dir: string, pkgName: string): number {
  return declaredRanges(dir, pkgName).reduce((max, range) => Math.max(max, rangeMajor(range)), 0);
}

/** Does the consuming project declare `pkgName` in any deps bucket? */
function projectDeclares(dir: string, pkgName: string): boolean {
  return declaredRanges(dir, pkgName).length > 0;
}

/**
 * Shared body for the `@helixui/library` + `@helixui/tokens` version-drift
 * checks. Reads the version actually installed in the CONSUMER's tree and
 * fails when its major is behind the major create-helix pins/tests against
 * (`helix-versions.ts`). Offline + deterministic — no registry call; the
 * freshness signal comes from create-helix releases bumping the floor. The
 * `create-helix upgrade` command is the remediation path.
 *
 * This is the guard the Pulse implementation test asked for: a scaffold that
 * has silently fallen majors behind now gets told, instead of finding out
 * when the design tooling targets an API the installed major doesn't have.
 */
function checkHelixDrift(cwd: string, pkgName: string, floorMajor: number): CheckResult {
  // Follow the scaffold's manifest — the flat scaffold root, or apps/web for
  // a monorepo scaffold (see resolveHelixManifestDir). Without this, doctor
  // run from a monorepo root would skip the drift check entirely.
  const dir = resolveHelixManifestDir(cwd);
  // Drupal scaffolds skip the @helixui/tokens drift check entirely. The
  // runtime token layer for a Drupal theme comes from
  // `css/vendor/helix-tokens.css` (vendored at scaffold time, refreshed by
  // the theme's postinstall when `npm install` runs), NOT from
  // `node_modules/@helixui/tokens` directly and NOT from the declared range
  // in package.json. Until `runUpgrade` can refresh that vendored CSS
  // alongside the pin bump (v0.9.4 follow-up), no signal here corresponds
  // to "is the runtime token layer current":
  //   - package.json range can move forward without the vendored CSS being
  //     refreshed (the cp-r+drush flow doesn't run `npm install`).
  //   - node_modules can be missing entirely (same flow) or stale even when
  //     the declared range is current.
  // Skipping is the only honest answer; doctor surfaces the install/upgrade
  // tooling gap in the v0.9.4 task. (`@helixui/drupal-starter` is the marker.)
  if (pkgName === '@helixui/tokens' && projectDeclares(dir, '@helixui/drupal-starter')) {
    return {
      name: pkgName,
      status: 'skip',
      message:
        'Drupal scaffold — @helixui/tokens drift check deferred until runUpgrade can migrate theme wiring + refresh the vendored CSS (v0.9.4).',
    };
  }
  if (!projectDeclares(dir, pkgName)) {
    return {
      name: pkgName,
      status: 'skip',
      message: `no ${pkgName} dependency — skipped.`,
    };
  }
  const resolved = readConsumerPackageVersion(dir, pkgName);
  if (resolved === null) {
    return {
      name: pkgName,
      status: 'fail',
      message: `${pkgName} not resolvable — run \`pnpm install\` to populate node_modules.`,
    };
  }
  const { version, pkgJsonPath } = resolved;
  const match = /^v?(\d+)\./.exec(version.trim());
  if (!match) {
    return {
      name: pkgName,
      status: 'fail',
      message: `could not parse installed version "${version}" at ${path.relative(cwd, pkgJsonPath)}.`,
    };
  }
  const installedMajor = parseInt(match[1], 10);
  if (installedMajor < floorMajor) {
    const behind = floorMajor - installedMajor;
    return {
      name: pkgName,
      status: 'fail',
      message: `v${version} at ${path.relative(cwd, pkgJsonPath)} — ${behind} major version${behind === 1 ? '' : 's'} behind (create-helix pins ^${floorMajor}.x); run \`create-helix upgrade\` or \`pnpm update ${pkgName}\`.`,
    };
  }
  return {
    name: pkgName,
    status: 'ok',
    message: `v${version} resolvable at ${path.relative(cwd, pkgJsonPath)}`,
  };
}

/**
 * v0.9.2 — fails when the installed `@helixui/library` major is behind the
 * major create-helix scaffolds/tests against. See checkHelixDrift.
 */
export function checkHelixLibrary(cwd: string): CheckResult {
  return checkHelixDrift(cwd, '@helixui/library', HELIX_LIBRARY_MAJOR);
}

/**
 * v0.9.2 — fails when the installed `@helixui/tokens` major is behind the
 * major create-helix scaffolds/tests against. See checkHelixDrift.
 */
export function checkHelixTokens(cwd: string): CheckResult {
  return checkHelixDrift(cwd, '@helixui/tokens', HELIX_TOKENS_MAJOR);
}

export function checkStorybookStaticDirs(cwd: string): CheckResult {
  const mainPath = path.join(cwd, '.storybook', 'main.ts');
  if (!fs.existsSync(mainPath)) {
    return {
      name: 'storybook staticDirs',
      status: 'skip',
      message: 'no .storybook/main.ts — skipped.',
    };
  }
  try {
    const contents = fs.readFileSync(mainPath, 'utf8');
    if (contents.includes('@helixui/icons/dist')) {
      return {
        name: 'storybook staticDirs',
        status: 'ok',
        message: `${path.relative(cwd, mainPath)} → staticDirs includes @helixui/icons/dist`,
      };
    }
    return {
      name: 'storybook staticDirs',
      status: 'fail',
      message: `${path.relative(cwd, mainPath)} staticDirs missing @helixui/icons/dist — icons won't resolve at runtime.`,
    };
  } catch {
    return {
      name: 'storybook staticDirs',
      status: 'fail',
      message: `unable to read ${mainPath}`,
    };
  }
}

export function checkIconBasePathReachable(cwd: string): CheckResult {
  const mainPath = path.join(cwd, '.storybook', 'main.ts');
  if (!fs.existsSync(mainPath)) {
    return {
      name: '/icons/helix.svg',
      status: 'skip',
      message: 'no .storybook/main.ts — skipped.',
    };
  }
  // Filesystem proxy for "the asset Storybook would serve at /icons/helix.svg
  // is actually on disk." HTTP probe is more correct when Storybook IS
  // running but pulls a curl/fetch dependency for the rare case; this is
  // the cheap, deterministic stand-in. devex-architect invariant: the
  // resolved path goes in the diagnostic, not just the conceptual name.
  const svgPath = path.join(cwd, 'node_modules', '@helixui', 'icons', 'dist', 'helix.svg');
  if (fs.existsSync(svgPath)) {
    return {
      name: '/icons/helix.svg',
      status: 'ok',
      message: `reachable at ${path.relative(cwd, svgPath)}`,
    };
  }
  return {
    name: '/icons/helix.svg',
    status: 'fail',
    message: `${path.relative(cwd, svgPath)} not on disk — run \`pnpm install\` or check @helixui/icons version.`,
  };
}

/**
 * Recursively scan the consumer's `<dir>/src` source files, returning true as
 * soon as `test` matches a file's contents. Bounded — `src/` is small and has
 * no node_modules under it. False when `src/` doesn't exist or nothing
 * matches. `.vue`/`.html`/`.mdx` are in the set so the scan covers every
 * framework target's render surface, not just the JS/TS ones.
 */
function srcFileMatches(dir: string, test: (text: string) => boolean): boolean {
  const srcDir = path.join(dir, 'src');
  if (!fs.existsSync(srcDir)) return false;
  const SOURCE_EXT = new Set([
    '.astro',
    '.svelte',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.vue',
    '.html',
    '.mdx',
  ]);
  const stack: string[] = [srcDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && SOURCE_EXT.has(path.extname(entry.name))) {
        try {
          if (test(fs.readFileSync(full, 'utf8'))) return true;
        } catch {
          // unreadable file — skip
        }
      }
    }
  }
  return false;
}

/**
 * True when the consumer's `src/` calls `setBasePath('/icons')` (single or
 * double quotes) — the runtime-loader half of the icon self-hosting wiring.
 */
function sourceWiresSetBasePath(dir: string): boolean {
  return srcFileMatches(
    dir,
    (text) => text.includes("setBasePath('/icons')") || text.includes('setBasePath("/icons")'),
  );
}

/**
 * True when the consumer's `src/` renders an `<hx-icon>` element — the markup
 * that resolves a sprite href and so 404s without the self-hosting wiring.
 * Matches the element tag (`<hx-icon ` / `<hx-icon>` / `<hx-icon/>`), NOT the
 * JSX intrinsic-element type declarations the scaffold also emits
 * (`'hx-icon': HxElement`) nor escaped `&lt;hx-icon&gt;` references in doc
 * copy — both lack the literal `<hx-icon` followed by a tag delimiter.
 */
function sourceRendersHxIcon(dir: string): boolean {
  return srcFileMatches(dir, (text) => /<hx-icon[\s/>]/.test(text));
}

/**
 * v0.9.2 — for a create-helix app scaffold that self-hosts `@helixui/icons`
 * sprites, verify the wiring is actually complete: the sprite sheets are in
 * the static dir AND `setBasePath('/icons')` is called in the runtime loader.
 *
 * HELiX 3.x's `<hx-icon>` resolves sprites from `${basePath}/<sprite>.svg`;
 * the scaffold sets `basePath` to `/icons` and copies the sprites into
 * `public/icons/` (`static/icons/` for SvelteKit) via a postinstall script.
 * Both halves must be in place — sprites copied AND setBasePath wired — or
 * `<hx-icon>` 404s against the blocked cross-origin jsDelivr CDN default,
 * even though `checkHelixIcons` reports the package itself is fine.
 *
 * Keyed on `scripts/copy-helix-icons.mjs` existing: that file is emitted
 * ONLY for the four app frameworks that render `<hx-icon>` (astro,
 * svelte-kit, react-next, react-vite). When it's ABSENT the project still
 * splits two ways, and the split MUST be made by a real signal (see NOTE):
 *   - a fresh experimental template / plain project that never renders
 *     `<hx-icon>` → not applicable, `skip`;
 *   - a pre-v0.9.2 app scaffold that DID emit `<hx-icon library="fa-free">`
 *     and has since been upgraded to `@helixui/library@3.x` → genuinely
 *     broken at runtime, `fail`.
 * wc-storybook serves icons through Storybook `staticDirs` instead (covered
 * by `checkStorybookStaticDirs` + `checkIconBasePathReachable`).
 *
 * NOTE (deliberate, after a codex-review flip-flop — finally resolved by
 * checking the facts): one round demanded a bare `skip` when the copy-script
 * is absent ("a fresh experimental scaffold has no copy-script — must NOT
 * false-fail"); a later round demanded the opposite ("an upgraded pre-v0.9.2
 * app also has no copy-script — it should FAIL"). An earlier revision of this
 * NOTE claimed the two shapes were indistinguishable and that pre-v0.9.2
 * `<hx-icon>` had "no `library=` / sprite API at all" — that was WRONG.
 * `origin/main:src/scaffold/astro/_shared.ts` + `sveltekit/_shared.ts` show
 * pre-v0.9.2 scaffolds emitting `<hx-icon library="fa-free" …>` on the
 * landing page. So the shapes ARE distinguishable, by the only signal that
 * matters: does the consumer's `src/` actually render an `<hx-icon>` element?
 * If it does and the project is on the 3.x contract, a missing copy-script is
 * a real runtime break, not "not applicable" — `sourceRendersHxIcon` makes
 * that call.
 */
export function checkAppIconSprites(cwd: string): CheckResult {
  const dir = resolveHelixManifestDir(cwd);
  const scriptRel = path.join('scripts', 'copy-helix-icons.mjs');
  const scriptPath = path.join(dir, scriptRel);
  if (!fs.existsSync(scriptPath)) {
    // No copy-script. For a fresh experimental scaffold or a plain project
    // that's correct — they don't render `<hx-icon>`, so sprite self-hosting
    // is genuinely not applicable. But a pre-v0.9.2 astro/sveltekit/react
    // scaffold DID emit `<hx-icon library="fa-free">`; once `create-helix
    // upgrade` bumps it to `@helixui/library@3.x`, that markup 404s against
    // the blocked jsDelivr CDN — and a bare `skip` would let `doctor` report
    // clean on a genuinely-broken app. Distinguish on the signal that
    // actually matters: is `<hx-icon>` rendered in src/, on the 3.x contract,
    // outside a Storybook project (those are covered by checkStorybook*).
    const onThreeXContract =
      installedMajor(dir, '@helixui/library') >= HELIX_LIBRARY_MAJOR ||
      declaredMaxMajor(dir, '@helixui/library') >= HELIX_LIBRARY_MAJOR;
    const isStorybookProject = fs.existsSync(path.join(dir, '.storybook'));
    if (onThreeXContract && !isStorybookProject && sourceRendersHxIcon(dir)) {
      return {
        name: 'app icon sprites',
        status: 'fail',
        message:
          "<hx-icon> will 404 its sprites at runtime: this app renders <hx-icon> on @helixui/library@3.x but has no sprite-serving setup (no scripts/copy-helix-icons.mjs). Re-scaffold with create-helix to generate the wiring, or copy @helixui/icons sprites into your static dir + call setBasePath('/icons') before @helixui/library loads.",
      };
    }
    return {
      name: 'app icon sprites',
      status: 'skip',
      message: 'no scripts/copy-helix-icons.mjs — icon-sprite self-hosting not applicable.',
    };
  }
  // The copy script targets exactly ONE served dir — `public/icons/` for
  // astro/react, `static/icons/` for SvelteKit. Read which from the script
  // itself (its `join(process.cwd(), '<dir>', 'icons')` line) rather than
  // accepting either: sprites copied into the WRONG dir aren't served, so
  // `<hx-icon>` still 404s. Default to `public` if the script can't be read.
  let staticDir = 'public';
  try {
    const scriptSrc = fs.readFileSync(scriptPath, 'utf8');
    const m = /process\.cwd\(\),\s*'(public|static)'/.exec(scriptSrc);
    if (m) staticDir = m[1];
  } catch {
    // unreadable script — fall back to the `public` default
  }
  // The remediation command, correct from `cwd`. For a monorepo (the check
  // resolved into apps/web) the script MUST run with apps/web as the cwd —
  // copy-helix-icons.mjs writes into `process.cwd()/<staticDir>/icons`, so
  // `node apps/web/scripts/...` from the repo root would copy to the wrong
  // place. `pnpm install` (postinstall runs the script in the right cwd) is
  // the always-correct fallback the messages also mention.
  const runScript =
    dir === cwd
      ? 'node scripts/copy-helix-icons.mjs'
      : `(cd ${path.relative(cwd, dir)} && node scripts/copy-helix-icons.mjs)`;
  // Half 1: the sprite-copy postinstall lands BOTH sheets in <staticDir>/icons/
  // — `helix.svg` AND `fa-free-solid.svg`. The scaffold's pages render both
  // `<hx-icon library="helix">` and `library="fa-free">`, so a partial copy
  // (only helix.svg) still 404s the fa-free icons. The dir "passes" only
  // when it has both sheets — and only the framework-correct served dir.
  const SPRITES = ['helix.svg', 'fa-free-solid.svg'];
  const iconDir = path.join(dir, staticDir, 'icons');
  const complete = SPRITES.every((s) => fs.existsSync(path.join(iconDir, s)));
  const partial = !complete && fs.existsSync(path.join(iconDir, 'helix.svg'));
  // Half 2: the runtime loader must call setBasePath('/icons') before
  // @helixui/library loads, or <hx-icon> resolves against the blocked CDN.
  const basePathWired = sourceWiresSetBasePath(dir);

  if (complete && basePathWired) {
    return {
      name: 'app icon sprites',
      status: 'ok',
      message: `self-hosted at ${path.relative(cwd, iconDir)}/ + setBasePath('/icons') wired`,
    };
  }
  const missing: string[] = [];
  if (!complete) {
    const iconDirRel = path.relative(cwd, iconDir);
    missing.push(
      partial
        ? `${iconDirRel}/ has helix.svg but not fa-free-solid.svg — re-run \`${runScript}\``
        : `sprite sheets not in ${iconDirRel}/ — run \`${runScript}\` (or \`pnpm install\`)`,
    );
  }
  if (!basePathWired) {
    missing.push(
      "setBasePath('/icons') not found in src/ — wire it in the runtime loader before @helixui/library loads",
    );
  }
  return {
    name: 'app icon sprites',
    status: 'fail',
    message: `<hx-icon> will 404 its sprites at runtime: ${missing.join('; ')}.`,
  };
}

export function checkCatalogPopulated(cwd: string): CheckResult {
  // Proxy for "this is a wc-storybook project": the scaffolder emits
  // scripts/generate-catalog.ts only for wc-storybook. Skipping when it's
  // absent means doctor stays useful in non-wc-storybook scaffolds without
  // a false fail. Idempotency: if the file is added/removed, the skip
  // boundary moves accordingly — there's no hardcoded path assumption.
  const generatorPath = path.join(cwd, 'scripts', 'generate-catalog.ts');
  if (!fs.existsSync(generatorPath)) {
    return {
      name: 'catalog stories',
      status: 'skip',
      message: 'no scripts/generate-catalog.ts — skipped.',
    };
  }
  const catalogDir = path.join(cwd, 'src', 'stories', 'catalog');
  if (!fs.existsSync(catalogDir)) {
    return {
      name: 'catalog stories',
      status: 'fail',
      message: `${path.relative(cwd, catalogDir)} missing — run \`pnpm cem:catalog\` to populate the HELiX/* sidebar (~120 stories).`,
    };
  }
  try {
    const entries = fs.readdirSync(catalogDir).filter((f) => f.endsWith('.stories.ts'));
    if (entries.length === 0) {
      return {
        name: 'catalog stories',
        status: 'fail',
        message: `${path.relative(cwd, catalogDir)} is empty — run \`pnpm cem:catalog\` to populate the HELiX/* sidebar (~120 stories).`,
      };
    }
    return {
      name: 'catalog stories',
      status: 'ok',
      message: `${String(entries.length)} stories in ${path.relative(cwd, catalogDir)}`,
    };
  } catch {
    return {
      name: 'catalog stories',
      status: 'fail',
      message: `unable to read ${catalogDir}`,
    };
  }
}

/**
 * Test if `process.version` satisfies a simplified engines range. Handles the
 * shapes the scaffolder emits — `>=20`, `>=22.0.0`, `^22.0.0`, and
 * `^22.0.0 || ^24.0.0` alternation. Anything more exotic gets a permissive
 * pass so we don't bark at hand-edited engines fields we can't parse.
 */
export function nodeSatisfiesEngines(processVersion: string, engines: string): boolean {
  const versionMatch = /^v?(\d+)\.(\d+)\.(\d+)/.exec(processVersion);
  if (!versionMatch) return true;
  const [, majStr, minStr, patStr] = versionMatch;
  const major = parseInt(majStr, 10);
  const minor = parseInt(minStr, 10);
  const patch = parseInt(patStr, 10);

  const ranges = engines
    .split('||')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ranges.length === 0) return true;

  for (const range of ranges) {
    // `^22.0.0` — same major.
    const caretMatch = /^\^\s*(\d+)\.(\d+)\.(\d+)/.exec(range);
    if (caretMatch) {
      const [, rMajS, rMinS, rPatS] = caretMatch;
      const rMaj = parseInt(rMajS, 10);
      const rMin = parseInt(rMinS, 10);
      const rPat = parseInt(rPatS, 10);
      if (major === rMaj && (minor > rMin || (minor === rMin && patch >= rPat) || minor > rMin)) {
        return true;
      }
      continue;
    }
    // `>=20` or `>=22.0.0`.
    const gteMatch = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range);
    if (gteMatch) {
      const [, rMajS, rMinS = '0', rPatS = '0'] = gteMatch;
      const rMaj = parseInt(rMajS, 10);
      const rMin = parseInt(rMinS, 10);
      const rPat = parseInt(rPatS, 10);
      if (
        major > rMaj ||
        (major === rMaj && minor > rMin) ||
        (major === rMaj && minor === rMin && patch >= rPat)
      ) {
        return true;
      }
      continue;
    }
    // Exact match `22.0.0`.
    const exactMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(range);
    if (exactMatch) {
      const [, rMajS, rMinS, rPatS] = exactMatch;
      if (
        major === parseInt(rMajS, 10) &&
        minor === parseInt(rMinS, 10) &&
        patch === parseInt(rPatS, 10)
      ) {
        return true;
      }
      continue;
    }
    // Unrecognized range — give the benefit of the doubt (permissive).
    return true;
  }
  return false;
}

export function checkProjectEngines(cwd: string): CheckResult {
  const pkg = readProjectPackageJson(cwd);
  if (pkg === null) {
    return {
      name: 'project engines',
      status: 'skip',
      message: 'no package.json in cwd — skipped.',
    };
  }
  const engines = pkg.engines?.node;
  if (!engines) {
    return {
      name: 'project engines',
      status: 'skip',
      message: 'package.json has no engines.node — skipped.',
    };
  }
  const satisfied = nodeSatisfiesEngines(process.version, engines);
  if (satisfied) {
    return {
      name: 'project engines',
      status: 'ok',
      message: `${process.version} satisfies engines.node "${engines}"`,
    };
  }
  return {
    name: 'project engines',
    status: 'fail',
    message: `${process.version} does not satisfy engines.node "${engines}" — upgrade Node or relax the constraint.`,
  };
}

export function checkExperimentalConfig(cwd: string): CheckResult {
  const rcPath = path.join(cwd, '.helixrc.json');
  if (!fs.existsSync(rcPath)) {
    return {
      name: 'experimental template config',
      status: 'skip',
      message: 'no .helixrc.json — skipped.',
    };
  }
  let cfg: {
    framework?: string;
    template?: string;
    defaults?: { framework?: string; template?: string };
  };
  try {
    cfg = JSON.parse(fs.readFileSync(rcPath, 'utf8')) as typeof cfg;
  } catch {
    return {
      name: 'experimental template config',
      status: 'fail',
      message: `${path.relative(cwd, rcPath)} is not valid JSON.`,
    };
  }
  // Accept all shapes the config loader honors: top-level `framework` /
  // `template` AND nested `defaults.framework` / `defaults.template`.
  // Mirrors src/config.ts loader so this check doesn't false-pass when the
  // experimental id is one level deeper than the user wrote.
  const selected =
    cfg.framework ?? cfg.template ?? cfg.defaults?.framework ?? cfg.defaults?.template ?? null;
  if (selected === null) {
    return {
      name: 'experimental template config',
      status: 'skip',
      message: `${path.relative(cwd, rcPath)} has no framework/template field — skipped.`,
    };
  }
  const template = TEMPLATES.find((t) => t.id === selected);
  if (!template) {
    return {
      name: 'experimental template config',
      status: 'warn',
      message: `${path.relative(cwd, rcPath)} selects unknown template '${selected}'.`,
    };
  }
  if (template.experimental === true) {
    return {
      name: 'experimental template config',
      status: 'warn',
      message: `Config selects experimental template '${selected}'. Run with --show-experimental or migrate to a production framework.`,
    };
  }
  return {
    name: 'experimental template config',
    status: 'ok',
    message: `Config selects production template '${selected}'.`,
  };
}

export async function runDoctor(
  version: string,
  options: DoctorOptions = {},
): Promise<DoctorResult> {
  const checks: CheckResult[] = [];
  const cwd = options.cwd ?? process.cwd();
  const quick = options.quick === true;

  checks.push(checkNodeVersion());
  checks.push(...checkPackageManagers());
  checks.push(checkGit());
  checks.push(checkDiskSpace());
  checks.push(checkWritePermissions());
  checks.push(await checkNetwork());

  // v0.6.0 Phase F — scaffold-surface checks. Each one is skip-aware so
  // running doctor outside a scaffolded project doesn't fail loudly; it
  // just reports "not applicable" alongside the environment checks.
  //
  // The three @helixui/* package checks all resolve the consumer's
  // node_modules tree, so they sit behind the same `--quick` gate as
  // checkIconBasePathReachable: a scaffold-but-don't-install CI run gets
  // `skip`, not a false `fail` for a not-yet-installed package.
  //   - checkHelixLibrary / checkHelixTokens (v0.9.2): drift checks — catch
  //     a scaffold that has silently fallen majors behind current Helix.
  //   - checkHelixIcons: pre-v0.9.2 this only ran for wc-storybook (the
  //     only template declaring @helixui/icons); v0.9.2 made every app
  //     template declare it, so without this gate `--quick` would now
  //     false-fail on every fresh app scaffold too.
  const NODE_MODULES_SKIP = 'skipped under --quick (needs an installed node_modules tree).';
  if (!quick) {
    checks.push(checkHelixLibrary(cwd));
    checks.push(checkHelixTokens(cwd));
    checks.push(checkHelixIcons(cwd));
  } else {
    checks.push({ name: '@helixui/library', status: 'skip', message: NODE_MODULES_SKIP });
    checks.push({ name: '@helixui/tokens', status: 'skip', message: NODE_MODULES_SKIP });
    checks.push({ name: '@helixui/icons', status: 'skip', message: NODE_MODULES_SKIP });
  }
  checks.push(checkStorybookStaticDirs(cwd));
  // --quick also skips the on-disk asset probes (the node_modules sprite
  // for wc-storybook, and the postinstall-generated public|static/icons/
  // for app scaffolds) — both depend on an install having run. CI runs
  // without `pnpm install` complete still get the deterministic
  // staticDirs + engines + config-warning checks.
  if (!quick) {
    checks.push(checkIconBasePathReachable(cwd));
    checks.push(checkAppIconSprites(cwd));
  } else {
    checks.push({
      name: 'app icon sprites',
      status: 'skip',
      message: 'skipped under --quick (sprites are postinstall-generated).',
    });
    checks.push({
      name: '/icons/helix.svg',
      status: 'skip',
      message: 'skipped under --quick.',
    });
  }
  checks.push(checkCatalogPopulated(cwd));
  checks.push(checkProjectEngines(cwd));
  checks.push(checkExperimentalConfig(cwd));

  // `skip` is not a failure; only `ok` and `skip` count as "passing" for
  // the overall green-light boolean. `warn` still reads as not-all-passed
  // so the existing exit-code-1 contract for warnings is preserved.
  const allPassed = checks.every((c) => c.status === 'ok' || c.status === 'skip');

  return { version, checks, allPassed };
}

export function formatDoctorOutput(result: DoctorResult): string {
  const lines: string[] = [];
  lines.push(`create-helix doctor v${result.version}`);
  lines.push('');

  for (const check of result.checks) {
    const icon =
      check.status === 'ok'
        ? '✓'
        : check.status === 'warn'
          ? '⚠'
          : check.status === 'skip'
            ? '–'
            : '✗';
    lines.push(`${icon} ${check.name}: ${check.message}`);
  }

  lines.push('');
  if (result.allPassed) {
    lines.push('All checks passed! Ready to scaffold.');
  } else {
    lines.push('Some checks failed or have warnings. Review items above.');
  }

  return lines.join('\n');
}
