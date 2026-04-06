import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  computeBackoffMs,
  sleep,
  HelixError,
  HELIX_E010_RETRY_EXHAUSTED,
} from '../retry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a function that fails `failCount` times then succeeds. */
function makeFlaky<T>(failCount: number, successValue: T): () => Promise<T> {
  let calls = 0;
  return async () => {
    calls++;
    if (calls <= failCount) {
      throw new Error(`Attempt ${calls} failed`);
    }
    return successValue;
  };
}

/** Creates a function that always throws. */
function makeAlwaysFail(msg = 'always fails'): () => Promise<never> {
  return async () => {
    throw new Error(msg);
  };
}

/** Shared no-op retry options to keep tests fast (no real delays). */
const FAST_OPTS = { initialDelayMs: 0, maxDelayMs: 0, onRetry: () => {} } as const;

// ---------------------------------------------------------------------------
// computeBackoffMs
// ---------------------------------------------------------------------------

describe('computeBackoffMs', () => {
  it('returns 0 when capped range is 0', () => {
    // attempt=0, initial=0: exponential = 0*1 = 0, jitter in [0,0) = 0
    expect(computeBackoffMs(0, 0, 30_000)).toBe(0);
  });

  it('caps delay at maxDelayMs', () => {
    // attempt=100 would give enormous exponential — must be capped
    const result = computeBackoffMs(100, 1_000, 5_000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(5_000);
  });

  it('grows with attempt number (statistical check — 200 samples)', () => {
    // For a large initial delay the average should grow with attempt number
    const avg = (attempt: number) => {
      const samples = Array.from({ length: 200 }, () => computeBackoffMs(attempt, 1_000, 30_000));
      return samples.reduce((a, b) => a + b, 0) / samples.length;
    };
    // avg for attempt=3 should be > avg for attempt=0
    expect(avg(3)).toBeGreaterThan(avg(0));
  });
});

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified delay', async () => {
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects immediately when an already-aborted signal is provided', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(1000, controller.signal)).rejects.toThrow('Aborted');
  });

  it('rejects when abort fires during the delay', async () => {
    const controller = new AbortController();
    const promise = sleep(5000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow('Aborted');
  });
});

// ---------------------------------------------------------------------------
// withRetry — success paths
// ---------------------------------------------------------------------------

describe('withRetry — success', () => {
  it('returns the value immediately when fn succeeds on first attempt', async () => {
    const fn = vi.fn(async () => 'hello');
    const result = await withRetry(fn, FAST_OPTS);
    expect(result).toBe('hello');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds after one transient failure', async () => {
    const fn = makeFlaky(1, 'ok');
    const onRetry = vi.fn();
    const result = await withRetry(fn, { ...FAST_OPTS, maxRetries: 3, onRetry });
    expect(result).toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('succeeds after two transient failures within maxRetries', async () => {
    const fn = makeFlaky(2, 'value');
    const onRetry = vi.fn();
    const result = await withRetry(fn, { ...FAST_OPTS, maxRetries: 3, onRetry });
    expect(result).toBe('value');
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// withRetry — max retries honored
// ---------------------------------------------------------------------------

describe('withRetry — max retries honored', () => {
  it('throws HelixError with HELIX_E010_RETRY_EXHAUSTED after exhausting all attempts', async () => {
    await expect(
      withRetry(makeAlwaysFail('network error'), { ...FAST_OPTS, maxRetries: 3 }),
    ).rejects.toMatchObject({
      code: HELIX_E010_RETRY_EXHAUSTED,
      name: 'HelixError',
    });
  });

  it('calls fn exactly maxRetries times when always failing', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error('fail');
    };

    await expect(withRetry(fn, { ...FAST_OPTS, maxRetries: 4 })).rejects.toMatchObject({
      code: HELIX_E010_RETRY_EXHAUSTED,
    });

    expect(calls).toBe(4);
  });

  it('calls onRetry (maxRetries - 1) times', async () => {
    const onRetry = vi.fn();

    await expect(
      withRetry(makeAlwaysFail(), { ...FAST_OPTS, maxRetries: 3, onRetry }),
    ).rejects.toMatchObject({ code: HELIX_E010_RETRY_EXHAUSTED });

    // onRetry is called before each retry — not before the first attempt
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('includes the last error as cause', async () => {
    const underlying = new Error('root cause');
    const fn = async () => {
      throw underlying;
    };

    try {
      await withRetry(fn, { ...FAST_OPTS, maxRetries: 2 });
      expect.fail('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HelixError);
      expect((err as HelixError).cause).toBe(underlying);
    }
  });

  it('respects custom maxRetries=1 (no retries, just one attempt)', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error('fail');
    };

    await expect(withRetry(fn, { ...FAST_OPTS, maxRetries: 1 })).rejects.toMatchObject({
      code: HELIX_E010_RETRY_EXHAUSTED,
    });

    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// withRetry — AbortSignal
// ---------------------------------------------------------------------------

describe('withRetry — AbortSignal', () => {
  it('throws immediately when signal is already aborted before first attempt', async () => {
    const controller = new AbortController();
    controller.abort();

    const fn = vi.fn(async () => 'never');
    await expect(withRetry(fn, { ...FAST_OPTS, signal: controller.signal })).rejects.toThrow(
      'Aborted',
    );

    expect(fn).not.toHaveBeenCalled();
  });

  it('propagates AbortError thrown by fn without retrying', async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new DOMException('Aborted', 'AbortError');
    };

    await expect(withRetry(fn, { ...FAST_OPTS, maxRetries: 3, onRetry })).rejects.toMatchObject({
      name: 'AbortError',
    });

    // Should not retry after an AbortError
    expect(calls).toBe(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('stops retrying when signal is aborted during backoff sleep', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const onRetry = vi.fn();
    let calls = 0;

    const fn = async () => {
      calls++;
      throw new Error('transient');
    };

    // Attach a rejection handler immediately so it is never "unhandled"
    const promise = withRetry(fn, {
      maxRetries: 5,
      signal: controller.signal,
      onRetry,
      initialDelayMs: 1_000,
      maxDelayMs: 1_000,
    }).catch((err: unknown) => err);

    // Allow the first attempt to run
    await Promise.resolve();
    // Abort while the sleep timer is pending
    controller.abort();
    // Drain all timers so the sleep can react to the abort
    await vi.runAllTimersAsync();

    const result = await promise;
    expect((result as DOMException).name).toBe('AbortError');
    // Only one fn call before abort interrupted the sleep
    expect(calls).toBe(1);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// withRetry — TUI output
// ---------------------------------------------------------------------------

describe('withRetry — TUI output', () => {
  it('calls onRetry with the correct attempt number and maxRetries', async () => {
    const retries: Array<[number, number]> = [];
    const fn = makeFlaky(2, 'done');

    await withRetry(fn, {
      ...FAST_OPTS,
      maxRetries: 3,
      onRetry: (attempt, max) => retries.push([attempt, max]),
    });

    // First retry: attempt 2/3, second retry: attempt 3/3
    expect(retries).toEqual([
      [2, 3],
      [3, 3],
    ]);
  });

  it('does not call onRetry when fn succeeds on first attempt', async () => {
    const onRetry = vi.fn();
    await withRetry(async () => 'ok', { ...FAST_OPTS, onRetry });
    expect(onRetry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// withRetry — backoff timing
// ---------------------------------------------------------------------------

describe('withRetry — backoff timing', () => {
  it('waits between retries (fake timers)', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error('fail');
    };

    const onRetry = vi.fn();
    // Attach catch immediately so the rejection is never unhandled
    const promise = withRetry(fn, {
      maxRetries: 3,
      onRetry,
      initialDelayMs: 500,
      maxDelayMs: 500,
    }).catch((err: unknown) => err);

    // First attempt runs synchronously
    await Promise.resolve();
    expect(calls).toBe(1);

    // Advance all timers to process all sleeps and remaining attempts
    await vi.runAllTimersAsync();

    const result = await promise;
    expect((result as HelixError).code).toBe(HELIX_E010_RETRY_EXHAUSTED);
    expect(calls).toBe(3);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// HelixError
// ---------------------------------------------------------------------------

describe('HelixError', () => {
  it('has the correct name, code, and message', () => {
    const err = new HelixError('something went wrong', 'HELIX_E010_RETRY_EXHAUSTED', 'root');
    expect(err.name).toBe('HelixError');
    expect(err.code).toBe('HELIX_E010_RETRY_EXHAUSTED');
    expect(err.message).toBe('something went wrong');
    expect(err.cause).toBe('root');
  });

  it('is an instance of Error', () => {
    const err = new HelixError('msg', 'CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HelixError);
  });

  it('exports the constant HELIX_E010_RETRY_EXHAUSTED', () => {
    expect(HELIX_E010_RETRY_EXHAUSTED).toBe('HELIX_E010_RETRY_EXHAUSTED');
  });
});
