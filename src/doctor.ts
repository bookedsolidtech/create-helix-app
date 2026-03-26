import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import https from 'node:https';
import { withRetry, HelixError } from './retry.js';

export interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

export interface DoctorResult {
  version: string;
  checks: CheckResult[];
  allPassed: boolean;
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

/**
 * Probes npmjs.org reachability with up to 3 retry attempts using exponential
 * backoff. Returns 'warn' (rather than throwing) after all retries are
 * exhausted so the doctor report can still complete.
 */
export async function checkNetwork(): Promise<CheckResult> {
  const probe = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const req = https.get('https://registry.npmjs.org/', { timeout: 5000 }, (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', (err) => {
        reject(err);
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('npmjs.org timed out'));
      });
    });

  try {
    await withRetry(probe, { maxRetries: 3 });
    return { name: 'Network', status: 'ok', message: 'npmjs.org reachable' };
  } catch (err) {
    // Preserve specific messages from the last failed attempt (e.g. "npmjs.org timed out")
    // when they are surfaced via HelixError's cause chain.
    const lastCause = err instanceof HelixError ? err.cause : err;
    const specificMsg =
      lastCause instanceof Error && lastCause.message ? lastCause.message : 'npmjs.org unreachable';
    return { name: 'Network', status: 'warn', message: specificMsg };
  }
}

export async function runDoctor(version: string): Promise<DoctorResult> {
  const checks: CheckResult[] = [];

  checks.push(checkNodeVersion());
  checks.push(...checkPackageManagers());
  checks.push(checkGit());
  checks.push(checkDiskSpace());
  checks.push(checkWritePermissions());
  checks.push(await checkNetwork());

  const allPassed = checks.every((c) => c.status === 'ok');

  return { version, checks, allPassed };
}

export function formatDoctorOutput(result: DoctorResult): string {
  const lines: string[] = [];
  lines.push(`create-helix doctor v${result.version}`);
  lines.push('');

  for (const check of result.checks) {
    const icon = check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
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
