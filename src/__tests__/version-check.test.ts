import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// We import checkForUpdate and isNewer after mocking https
import { isNewer } from '../version-check.js';

// ─── isNewer unit tests ───────────────────────────────────────────────────────

describe('isNewer', () => {
  it('returns true when latest has higher patch', () => {
    expect(isNewer('0.3.0', '0.3.1')).toBe(true);
  });

  it('returns true when latest has higher minor', () => {
    expect(isNewer('0.3.0', '0.4.0')).toBe(true);
  });

  it('returns true when latest has higher major', () => {
    expect(isNewer('0.3.0', '1.0.0')).toBe(true);
  });

  it('returns false when same version', () => {
    expect(isNewer('0.3.0', '0.3.0')).toBe(false);
  });

  it('returns false when latest is older', () => {
    expect(isNewer('0.4.0', '0.3.0')).toBe(false);
  });

  it('handles v-prefix', () => {
    expect(isNewer('v0.3.0', 'v0.4.0')).toBe(true);
  });
});

// ─── checkForUpdate integration tests ────────────────────────────────────────

const CACHE_DIR = path.join(os.homedir(), '.helix', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'version-check.json');

describe('checkForUpdate', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Remove env var so tests start clean
    delete process.env['HELIX_NO_UPDATE_CHECK'];
    // Remove cache file before each test
    try {
      fs.unlinkSync(CACHE_FILE);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clean up cache file after each test
    try {
      fs.unlinkSync(CACHE_FILE);
    } catch {
      // ignore
    }
  });

  it('returns null when --offline is set', async () => {
    // Dynamically import so we get a fresh module reference
    const { checkForUpdate } = await import('../version-check.js');
    const result = await checkForUpdate({ offline: true, currentVersion: '0.3.0' });
    expect(result).toBeNull();
  });

  it('returns null when --json is set', async () => {
    const { checkForUpdate } = await import('../version-check.js');
    const result = await checkForUpdate({ json: true, currentVersion: '0.3.0' });
    expect(result).toBeNull();
  });

  it('returns null when HELIX_NO_UPDATE_CHECK=1', async () => {
    process.env['HELIX_NO_UPDATE_CHECK'] = '1';
    const { checkForUpdate } = await import('../version-check.js');
    const result = await checkForUpdate({ currentVersion: '0.3.0' });
    expect(result).toBeNull();
  });

  it('returns warning string when outdated (uses cached latest)', async () => {
    // Seed the cache with a newer version so we bypass network fetch
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const entry = { latestVersion: '0.4.0', checkedAt: Date.now() };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(entry), 'utf8');

    const { checkForUpdate } = await import('../version-check.js');
    const result = await checkForUpdate({ currentVersion: '0.3.0' });
    expect(result).toBe('Update available: 0.3.0 → 0.4.0. Run: npm install -g create-helix');
  });

  it('returns null when already on latest (uses cached latest)', async () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const entry = { latestVersion: '0.3.0', checkedAt: Date.now() };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(entry), 'utf8');

    const { checkForUpdate } = await import('../version-check.js');
    const result = await checkForUpdate({ currentVersion: '0.3.0' });
    expect(result).toBeNull();
  });

  it('ignores stale cache and fetches fresh (network returns null on timeout — returns null gracefully)', async () => {
    // Write a stale cache entry
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const staleEntry = {
      latestVersion: '0.4.0',
      checkedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(staleEntry), 'utf8');

    // Mock https.get to simulate a timeout (never resolves within TTL)
    const https = await import('node:https');
    const originalGet = https.default.get.bind(https.default);
    const getFn = vi
      .spyOn(https.default, 'get')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((_url: any, cb?: any) => {
        // simulate a request object with a destroy method
        const req = {
          destroy: () => {
            /* no-op */
          },
          on: (_event: string, _handler: unknown) => req,
        } as unknown as ReturnType<typeof originalGet>;
        // Never call cb — triggers the 2 s timeout path
        void cb;
        return req;
      });

    const { checkForUpdate } = await import('../version-check.js');
    // With a 2 s timeout in source, we rely on the mock — the timeout fires
    // because destroy() is called. In tests the timer fires after real 2 s
    // unless we use fake timers. Use fake timers to advance past the timeout.
    vi.useFakeTimers();
    const promise = checkForUpdate({ currentVersion: '0.3.0' });
    // Advance past the 2 s timeout
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const result = await promise;
    // Network timed out → no data → null (no cache hit after stale discard)
    expect(result).toBeNull();

    getFn.mockRestore();
  });

  it('cache TTL: fresh cache is re-used without hitting network', async () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const freshEntry = { latestVersion: '0.4.0', checkedAt: Date.now() };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(freshEntry), 'utf8');

    const https = await import('node:https');
    const getSpy = vi.spyOn(https.default, 'get');

    const { checkForUpdate } = await import('../version-check.js');
    const result = await checkForUpdate({ currentVersion: '0.3.0' });

    expect(result).toBe('Update available: 0.3.0 → 0.4.0. Run: npm install -g create-helix');
    // Network should NOT have been called when cache is fresh
    expect(getSpy).not.toHaveBeenCalled();

    getSpy.mockRestore();
  });
});
