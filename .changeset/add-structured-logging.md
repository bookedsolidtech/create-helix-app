---
'create-helix': minor
---

Add structured logging with configurable levels and JSON output format.

Introduces `src/logger.ts` — a lightweight singleton logger (no external deps) with four levels (debug, info, warn, error). Output format is JSON when `HELIX_LOG_FORMAT=json` (for log aggregators) and human-readable colored output otherwise. Log level is controlled via the `HELIX_LOG_LEVEL` env var or the `setLogLevel()` function (for `--log-level` flag integration). Debug-level messages capture file writes, template resolution, config loading, and validation steps. Scaffold verbose output and config warnings are now routed through the logger.
