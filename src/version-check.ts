/**
 * Version check module — checks the npm registry for a newer version of
 * create-helix and returns a one-line warning string when an update is
 * available.
 *
 * Design goals:
 *   - Non-blocking: 2 s timeout, never delays CLI startup
 *   - Cache result in ~/.helix/cache/version-check.json (24 h TTL)
 *   - Respect --offline flag and HELIX_NO_UPDATE_CHECK=1 env var
 */

import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REGISTRY_URL = 'https://registry.npmjs.org/create-helix/latest';
const CACHE_DIR = path.join(os.homedir(), '.helix', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'version-check.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 2000;

interface CacheEntry {
  latestVersion: string;
  checkedAt: number;
}

/** Read the cached version entry, returning null on any error or if stale. */
function readCache(): CacheEntry | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const entry = JSON.parse(raw) as unknown;
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).latestVersion !== 'string' ||
      typeof (entry as Record<string, unknown>).checkedAt !== 'number'
    ) {
      return null;
    }
    const typed = entry as CacheEntry;
    if (Date.now() - typed.checkedAt > CACHE_TTL_MS) {
      return null; // stale
    }
    return typed;
  } catch {
    return null;
  }
}

/** Write a cache entry, silently ignoring errors. */
function writeCache(latestVersion: string): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const entry: CacheEntry = { latestVersion, checkedAt: Date.now() };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(entry, null, 2), 'utf8');
  } catch {
    // cache write failure is non-fatal
  }
}

/**
 * Fetch the latest version from the npm registry with a timeout.
 * Returns the version string or null on any failure.
 */
function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      req.destroy();
      resolve(null);
    }, FETCH_TIMEOUT_MS);

    const req = https.get(REGISTRY_URL, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        res.resume();
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
          if (
            typeof body === 'object' &&
            body !== null &&
            typeof (body as Record<string, unknown>).version === 'string'
          ) {
            resolve((body as { version: string }).version);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
      res.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    });

    req.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

/**
 * Compare two semver strings.
 * Returns true if `latest` is strictly newer than `current`.
 * Only handles simple MAJOR.MINOR.PATCH (no pre-release tags).
 */
export function isNewer(current: string, latest: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const parts = v.replace(/^v/, '').split('.').map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [cMaj, cMin, cPat] = parse(current);
  const [lMaj, lMin, lPat] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

export interface CheckForUpdateOptions {
  /** Skip check when in offline mode. */
  offline?: boolean;
  /** Skip check when outputting JSON (non-interactive). */
  json?: boolean;
  /** Current version — injected for testability. */
  currentVersion?: string;
}

/**
 * Check for an available update.
 *
 * Returns a one-line warning string when a newer version is available,
 * or null when the check is skipped or the current version is up to date.
 *
 * Never throws.
 */
export async function checkForUpdate(options: CheckForUpdateOptions = {}): Promise<string | null> {
  // Respect opt-out mechanisms
  if (options.offline) return null;
  if (options.json) return null;
  if (process.env['HELIX_NO_UPDATE_CHECK'] === '1') return null;

  const current = options.currentVersion ?? (await getCurrentVersion());
  if (current === null) return null;

  // Try cache first
  let latest: string | null = null;
  const cached = readCache();
  if (cached !== null) {
    latest = cached.latestVersion;
  } else {
    latest = await fetchLatestVersion();
    if (latest !== null) {
      writeCache(latest);
    }
  }

  if (latest === null) return null;
  if (!isNewer(current, latest)) return null;

  return `Update available: ${current} → ${latest}. Run: npm install -g create-helix`;
}

/** Resolve the current package version at runtime. */
async function getCurrentVersion(): Promise<string | null> {
  try {
    const { createRequire } = await import('node:module');
    const _require = createRequire(import.meta.url);
    const pkg = _require('../package.json') as { version: string };
    return pkg.version;
  } catch {
    return null;
  }
}
