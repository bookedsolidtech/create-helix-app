/**
 * Generic retry utility with exponential backoff and jitter.
 *
 * Features:
 *   - Exponential backoff (initial 1s, max 30s) with randomised jitter
 *   - Configurable maxRetries (default 3)
 *   - AbortSignal support — aborts immediately when the signal fires
 *   - TUI progress output via @clack/prompts ("Retrying... (attempt 2/3)")
 *   - Throws HelixError with code HELIX_E010_RETRY_EXHAUSTED on exhaustion
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';

// ---------------------------------------------------------------------------
// HelixError — inline definition to avoid a circular import dependency
// ---------------------------------------------------------------------------

export class HelixError extends Error {
  readonly code: string;
  readonly cause: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'HelixError';
    this.code = code;
    this.cause = cause;
  }
}

/** Error code emitted when all retry attempts are exhausted. */
export const HELIX_E010_RETRY_EXHAUSTED = 'HELIX_E010_RETRY_EXHAUSTED';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of attempts (default: 3). */
  maxRetries?: number;
  /** Initial backoff delay in milliseconds (default: 1000). */
  initialDelayMs?: number;
  /** Maximum backoff delay in milliseconds (default: 30_000). */
  maxDelayMs?: number;
  /** When set, any abort event cancels the retry loop immediately. */
  signal?: AbortSignal;
  /**
   * Callback invoked before each retry attempt (not before the first call).
   * Receives the 1-based attempt index and the total number of retries allowed.
   * Override in tests to suppress TUI output.
   */
  onRetry?: (attempt: number, maxRetries: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the next backoff delay using exponential backoff with full jitter.
 *   delay = random(0, min(maxDelay, initialDelay * 2^attempt))
 */
export function computeBackoffMs(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = initialDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelayMs);
  // Full jitter: random value in [0, capped)
  return Math.floor(Math.random() * capped);
}

/**
 * Returns a Promise that resolves after `ms` milliseconds, but rejects
 * immediately if the provided AbortSignal fires before the delay elapses.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal !== undefined) {
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Default TUI progress reporter shown before each retry attempt.
 */
function defaultOnRetry(attempt: number, maxRetries: number): void {
  p.log.warn(pc.yellow(`Retrying... (attempt ${attempt}/${maxRetries})`));
}

// ---------------------------------------------------------------------------
// Core retry function
// ---------------------------------------------------------------------------

/**
 * Calls `fn` up to `maxRetries` times, applying exponential backoff with
 * jitter between attempts. Returns the value produced by `fn` on success.
 *
 * Throws a `HelixError` with code `HELIX_E010_RETRY_EXHAUSTED` when all
 * attempts fail, or re-throws immediately when the AbortSignal fires.
 *
 * @example
 * ```ts
 * const data = await withRetry(() => fetchPackageVersion('@helix/core'), {
 *   maxRetries: 3,
 *   signal: AbortSignal.timeout(10_000),
 * });
 * ```
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1_000,
    maxDelayMs = 30_000,
    signal,
    onRetry = defaultOnRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Honour abort before even trying
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      return await fn();
    } catch (err) {
      // Propagate abort errors immediately — don't retry
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      // Also propagate if signal fired mid-request
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      lastError = err;

      if (attempt < maxRetries) {
        // Notify caller / TUI before sleeping
        onRetry(attempt + 1, maxRetries);

        const delay = computeBackoffMs(attempt - 1, initialDelayMs, maxDelayMs);
        await sleep(delay, signal);
      }
    }
  }

  throw new HelixError(
    `Operation failed after ${maxRetries} attempt(s)`,
    HELIX_E010_RETRY_EXHAUSTED,
    lastError,
  );
}
