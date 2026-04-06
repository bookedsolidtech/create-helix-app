import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// We mock 'node:https' before importing the module under test so the
// production code picks up our stub.
vi.mock('node:https', () => {
  return {
    default: {
      get: vi.fn(),
    },
  };
});

// We mock 'node:fs' so filesystem operations are fully controlled in tests.
vi.mock('node:fs', () => {
  return {
    default: {
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
  };
});

import https from 'node:https';
import fs from 'node:fs';
import {
  detectOffline,
  readRegistryCache,
  writeRegistryCache,
  REGISTRY_CACHE_FILE,
} from '../network.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal fake IncomingMessage-like EventEmitter with a destroy().
 */
function makeFakeResponse(): EventEmitter & { destroy: () => void } {
  const res = new EventEmitter() as EventEmitter & { destroy: () => void };
  res.destroy = vi.fn();
  return res;
}

/**
 * Creates a minimal fake ClientRequest-like EventEmitter with destroy().
 */
function makeFakeRequest(): EventEmitter & { destroy: () => void } {
  const req = new EventEmitter() as EventEmitter & { destroy: () => void };
  req.destroy = vi.fn();
  return req;
}

// ---------------------------------------------------------------------------
// detectOffline
// ---------------------------------------------------------------------------

describe('detectOffline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when the request succeeds (online)', async () => {
    const req = makeFakeRequest();
    const res = makeFakeResponse();

    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      // Simulate an immediate successful response
      if (typeof cb === 'function') {
        cb(res as never);
      }
      return req as never;
    });

    const promise = detectOffline(500);
    // Advance time slightly so the setTimeout is registered but not yet fired
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(false);
  });

  it('returns true when the request emits an error', async () => {
    const req = makeFakeRequest();

    vi.mocked(https.get).mockImplementation(() => {
      // Emit error asynchronously on next tick
      setImmediate(() => {
        req.emit('error', new Error('ENOTFOUND'));
      });
      return req as never;
    });

    const promise = detectOffline(500);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(true);
  });

  it('returns true when the request times out (socket timeout event)', async () => {
    const req = makeFakeRequest();

    vi.mocked(https.get).mockImplementation(() => {
      // Emit 'timeout' asynchronously
      setImmediate(() => {
        req.emit('timeout');
      });
      return req as never;
    });

    const promise = detectOffline(500);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(true);
    expect(req.destroy).toHaveBeenCalled();
  });

  it('returns true when the outer setTimeout fires before a response', async () => {
    const req = makeFakeRequest();

    vi.mocked(https.get).mockImplementation(() => {
      // Never call cb — simulate a hang
      return req as never;
    });

    const promise = detectOffline(500);
    // Advance past the timeout
    vi.advanceTimersByTime(600);
    const result = await promise;

    expect(result).toBe(true);
    expect(req.destroy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// readRegistryCache
// ---------------------------------------------------------------------------

describe('readRegistryCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(readRegistryCache()).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('not-valid-json');

    expect(readRegistryCache()).toBeNull();
  });

  it('returns null when updatedAt is missing', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ packages: { '@helix/core': '1.0.0' } }),
    );

    expect(readRegistryCache()).toBeNull();
  });

  it('returns null when packages is missing', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ updatedAt: 12345 }));

    expect(readRegistryCache()).toBeNull();
  });

  it('returns the cache entry when the file contains valid data', () => {
    const cache = { updatedAt: 1700000000000, packages: { '@helix/core': '2.3.0' } };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cache));

    const result = readRegistryCache();
    expect(result).toEqual(cache);
  });
});

// ---------------------------------------------------------------------------
// writeRegistryCache
// ---------------------------------------------------------------------------

describe('writeRegistryCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes valid JSON to the cache file', () => {
    const packages = { '@helix/core': '2.3.0', '@helix/forms': '1.1.0' };
    writeRegistryCache(packages);

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.helix'), {
      recursive: true,
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      REGISTRY_CACHE_FILE,
      expect.stringContaining('"@helix/core"'),
      'utf8',
    );

    // Verify the written content is valid JSON with the right shape
    const written = vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as { updatedAt: number; packages: Record<string, string> };
    expect(parsed.packages).toEqual(packages);
    expect(typeof parsed.updatedAt).toBe('number');
  });

  it('silently ignores write errors (non-fatal)', () => {
    vi.mocked(fs.mkdirSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    // Should not throw
    expect(() => writeRegistryCache({ '@helix/core': '1.0.0' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// --offline flag (integration-style: verify args.ts parses the flag)
// ---------------------------------------------------------------------------

describe('--offline flag in parseArgs', () => {
  it('parses --offline as true', async () => {
    const { parseArgs } = await import('../args.js');
    const result = parseArgs(['--offline']);
    expect(result.offline).toBe(true);
  });

  it('offline defaults to false when flag is absent', async () => {
    const { parseArgs } = await import('../args.js');
    const result = parseArgs([]);
    expect(result.offline).toBe(false);
  });
});
