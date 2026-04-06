/**
 * Lightweight structured logger for create-helix CLI.
 *
 * Output format:
 *   - JSON when HELIX_LOG_FORMAT=json (for log aggregators / CI pipelines)
 *   - Human-readable colored output otherwise (interactive terminals)
 *
 * Log level precedence:
 *   1. setLogLevel() — programmatic override (e.g. from --log-level flag)
 *   2. HELIX_LOG_LEVEL env var
 *   3. Default: 'info'
 *
 * Levels (lowest → highest severity):
 *   debug < info < warn < error
 *
 * Debug: file writes, template resolution, config loading, validation steps, timing
 * Info:  scaffold progress, command results
 * Warn:  problems that don't stop execution
 * Error: failures that abort execution
 */

import pc from 'picocolors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'human';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Level ordering
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ---------------------------------------------------------------------------
// ANSI color helpers (human-readable format only)
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<LogLevel, (s: string) => string> = {
  debug: pc.dim,
  info: pc.cyan,
  warn: pc.yellow,
  error: pc.red,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

// ---------------------------------------------------------------------------
// Parse log level from string
// ---------------------------------------------------------------------------

function parseLogLevel(value: string | undefined): LogLevel | undefined {
  if (value === undefined) return undefined;
  const lower = value.toLowerCase();
  if (lower === 'debug' || lower === 'info' || lower === 'warn' || lower === 'error') {
    return lower as LogLevel;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Logger singleton
// ---------------------------------------------------------------------------

class Logger {
  private _level: LogLevel;
  private _format: LogFormat;

  constructor() {
    // Resolve initial log level from env var, defaulting to 'info'
    this._level = parseLogLevel(process.env['HELIX_LOG_LEVEL']) ?? 'info';

    // Resolve output format from env var
    this._format = process.env['HELIX_LOG_FORMAT'] === 'json' ? 'json' : 'human';
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  /**
   * Programmatically set the active log level (e.g. from --log-level flag).
   * Overrides HELIX_LOG_LEVEL for the lifetime of the process.
   */
  setLevel(level: LogLevel): void {
    this._level = level;
  }

  /**
   * Returns the currently active log level.
   */
  getLevel(): LogLevel {
    return this._level;
  }

  /**
   * Returns the currently active output format.
   */
  getFormat(): LogFormat {
    return this._format;
  }

  /**
   * Reset logger state to re-read from environment variables.
   * Primarily useful in tests.
   */
  reset(): void {
    this._level = parseLogLevel(process.env['HELIX_LOG_LEVEL']) ?? 'info';
    this._format = process.env['HELIX_LOG_FORMAT'] === 'json' ? 'json' : 'human';
  }

  // ── Logging methods ───────────────────────────────────────────────────────

  debug(message: string, data?: Record<string, unknown>): void {
    this._emit('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this._emit('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this._emit('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this._emit('error', message, data);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    // Filter by active log level
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this._level]) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(data !== undefined ? { data } : {}),
    };

    if (this._format === 'json') {
      this._writeJson(entry);
    } else {
      this._writeHuman(entry);
    }
  }

  private _writeJson(entry: LogEntry): void {
    const line = JSON.stringify(entry);
    if (entry.level === 'error' || entry.level === 'warn') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  private _writeHuman(entry: LogEntry): void {
    const colorFn = LEVEL_COLORS[entry.level];
    const label = colorFn(`[${LEVEL_LABELS[entry.level]}]`);
    const msg = entry.level === 'error' ? pc.red(entry.message) : entry.message;
    const dataSuffix = entry.data !== undefined ? pc.dim(' ' + JSON.stringify(entry.data)) : '';

    const line = `${label} ${msg}${dataSuffix}`;

    if (entry.level === 'error' || entry.level === 'warn') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const logger = new Logger();

/**
 * Convenience function to set the log level — useful when processing
 * a --log-level CLI flag before any logging occurs.
 */
export function setLogLevel(level: LogLevel): void {
  logger.setLevel(level);
}
