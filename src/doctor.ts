import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { createRequire } from 'node:module';
import { TEMPLATES } from './templates.js';

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

/**
 * Does the consuming project declare @helixui/icons in any deps bucket?
 * Cheap proxy for "this is a wc-storybook scaffold." Used to gate the
 * icon-package version + staticDir checks.
 */
function projectDeclaresIcons(cwd: string): boolean {
  const pkg = readProjectPackageJson(cwd);
  if (pkg === null) return false;
  return Boolean(
    pkg.dependencies?.['@helixui/icons'] ??
    pkg.devDependencies?.['@helixui/icons'] ??
    pkg.peerDependencies?.['@helixui/icons'],
  );
}

/**
 * Compare a semver-like version string against a major floor. Permissive —
 * we only care about the major number for the v0.6.0 "^1.0.0" gate. Strict
 * range parsing belongs to a real semver lib; this avoids the dep for one
 * check.
 */
function versionMajorAtLeast(actual: string, minMajor: number): boolean {
  const match = /^v?(\d+)\./.exec(actual.trim());
  if (!match) return false;
  return parseInt(match[1], 10) >= minMajor;
}

export function checkHelixIcons(cwd: string): CheckResult {
  if (!projectDeclaresIcons(cwd)) {
    return {
      name: '@helixui/icons',
      status: 'skip',
      message: 'not a wc-storybook project — skipped.',
    };
  }
  // Resolve from the CONSUMING project, not from create-helix's own
  // node_modules. createRequire(<consumer>/package.json) walks the consumer
  // tree so a missing install is detected here, not after we've already
  // told the consumer everything is fine.
  const consumerReq = createRequire(path.join(cwd, 'package.json'));
  let pkgJsonPath: string;
  try {
    pkgJsonPath = consumerReq.resolve('@helixui/icons/package.json');
  } catch {
    return {
      name: '@helixui/icons',
      status: 'fail',
      message: '@helixui/icons not resolvable — run `pnpm install` to populate node_modules.',
    };
  }
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    const version = pkg.version ?? 'unknown';
    if (!versionMajorAtLeast(version, 1)) {
      return {
        name: '@helixui/icons',
        status: 'fail',
        message: `version ${version} — v0.6.0 requires ^1.0.0; run \`pnpm update @helixui/icons\`.`,
      };
    }
    return {
      name: '@helixui/icons',
      status: 'ok',
      message: `v${version} resolvable at ${path.relative(cwd, pkgJsonPath)}`,
    };
  } catch {
    return {
      name: '@helixui/icons',
      status: 'fail',
      message: `unable to read ${pkgJsonPath} — package.json malformed?`,
    };
  }
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
  checks.push(checkHelixIcons(cwd));
  checks.push(checkStorybookStaticDirs(cwd));
  // --quick skips the only check that walks the consumer's node_modules tree
  // for an asset file. CI runs without `pnpm install` complete still get the
  // deterministic version + staticDirs + engines + config-warning checks.
  if (!quick) {
    checks.push(checkIconBasePathReachable(cwd));
  } else {
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
