---
'create-helix': minor
---

Add retry utility with exponential backoff for network operations.

Introduces `src/retry.ts` — a generic `withRetry<T>` function that wraps any async operation with up to 3 configurable retry attempts, exponential backoff (initial 1 s, max 30 s) with full jitter, AbortSignal support, and TUI progress output ("Retrying... (attempt 2/3)"). Exhausting all retries throws a `HelixError` with code `HELIX_E010_RETRY_EXHAUSTED`. Applied to npm registry queries in `commands/upgrade.ts` and the network connectivity probe in `doctor.ts`.
