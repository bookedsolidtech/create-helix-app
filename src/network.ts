/**
 * Network utilities — offline detection and registry cache.
 *
 * detectOffline(): performs a fast HTTP probe with a configurable timeout.
 *   Returns true when the host cannot be reached (offline/degraded).
 * readRegistryCache() / writeRegistryCache(): persist last-known npm registry
 *   package version data to ~/.helix/cache/registry.json.
 */

import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CACHE_DIR = path.join(os.homedir(), '.helix', 'cache');
export const REGISTRY_CACHE_FILE = path.join(CACHE_DIR, 'registry.json');

/**
 * Probes npmjs.org with a short timeout to detect offline state.
 * Returns true when offline (unreachable or timed out), false when online.
 *
 * @param timeoutMs - max milliseconds to wait (default: 500)
 */
export function detectOffline(timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;

    const done = (offline: boolean): void => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(offline);
      }
    };

    const timer = setTimeout(() => {
      req.destroy();
      done(true); // timed out → offline
    }, timeoutMs);

    const req = https.get('https://registry.npmjs.org/', { timeout: timeoutMs }, (res) => {
      res.destroy();
      done(false); // reachable → online
    });

    req.on('error', () => {
      done(true); // error → offline
    });

    req.on('timeout', () => {
      req.destroy();
      done(true); // socket timeout → offline
    });
  });
}

export interface RegistryCache {
  updatedAt: number;
  packages: Record<string, string>;
}

/**
 * Read cached registry package versions from disk.
 * Returns null on any error (file missing, malformed, etc.).
 */
export function readRegistryCache(): RegistryCache | null {
  try {
    const raw = fs.readFileSync(REGISTRY_CACHE_FILE, 'utf8');
    const entry = JSON.parse(raw) as unknown;
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).updatedAt !== 'number' ||
      typeof (entry as Record<string, unknown>).packages !== 'object' ||
      (entry as Record<string, unknown>).packages === null
    ) {
      return null;
    }
    return entry as RegistryCache;
  } catch {
    return null;
  }
}

/**
 * Write registry package version data to the cache file.
 * Silently ignores errors — cache writes are non-fatal.
 */
export function writeRegistryCache(packages: Record<string, string>): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const entry: RegistryCache = { updatedAt: Date.now(), packages };
    fs.writeFileSync(REGISTRY_CACHE_FILE, JSON.stringify(entry, null, 2), 'utf8');
  } catch {
    // cache write failure is non-fatal
  }
}
