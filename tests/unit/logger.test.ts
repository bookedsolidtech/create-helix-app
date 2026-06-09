import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, setLogLevel } from '../../src/logger.js';
import type { LogLevel, LogEntry } from '../../src/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture all stdout/stderr writes during a callback, return as strings. */
function captureOutput(fn: () => void): { stdout: string; stderr: string } {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutChunks.push(String(chunk));
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrChunks.push(String(chunk));
    return true;
  });

  try {
    fn();
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }

  return { stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') };
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

let origLogLevel: string | undefined;
let origLogFormat: string | undefined;

beforeEach(() => {
  // Snapshot env vars
  origLogLevel = process.env['HELIX_LOG_LEVEL'];
  origLogFormat = process.env['HELIX_LOG_FORMAT'];

  // Reset to known defaults before each test
  delete process.env['HELIX_LOG_LEVEL'];
  delete process.env['HELIX_LOG_FORMAT'];
  logger.reset();
});

afterEach(() => {
  // Restore env vars
  if (origLogLevel === undefined) {
    delete process.env['HELIX_LOG_LEVEL'];
  } else {
    process.env['HELIX_LOG_LEVEL'] = origLogLevel;
  }
  if (origLogFormat === undefined) {
    delete process.env['HELIX_LOG_FORMAT'];
  } else {
    process.env['HELIX_LOG_FORMAT'] = origLogFormat;
  }
  logger.reset();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Log level filtering
// ---------------------------------------------------------------------------

describe('log level filtering', () => {
  it('default level is info — debug messages are suppressed', () => {
    const { stdout } = captureOutput(() => logger.debug('hidden'));
    expect(stdout).toBe('');
  });

  it('default level is info — info messages are emitted', () => {
    const { stdout } = captureOutput(() => logger.info('visible'));
    expect(stdout).toContain('visible');
  });

  it('default level is info — warn messages are emitted', () => {
    const { stderr } = captureOutput(() => logger.warn('problem'));
    expect(stderr).toContain('problem');
  });

  it('default level is info — error messages are emitted', () => {
    const { stderr } = captureOutput(() => logger.error('failure'));
    expect(stderr).toContain('failure');
  });

  it('setting level to debug emits all messages', () => {
    setLogLevel('debug');
    const { stdout } = captureOutput(() => logger.debug('trace'));
    expect(stdout).toContain('trace');
  });

  it('setting level to warn suppresses debug and info', () => {
    setLogLevel('warn');
    const debugOut = captureOutput(() => logger.debug('nope'));
    const infoOut = captureOutput(() => logger.info('nope'));
    const warnOut = captureOutput(() => logger.warn('yes'));

    expect(debugOut.stdout).toBe('');
    expect(infoOut.stdout).toBe('');
    expect(warnOut.stderr).toContain('yes');
  });

  it('setting level to error suppresses debug, info, and warn', () => {
    setLogLevel('error');
    const debugOut = captureOutput(() => logger.debug('nope'));
    const infoOut = captureOutput(() => logger.info('nope'));
    const warnOut = captureOutput(() => logger.warn('nope'));
    const errOut = captureOutput(() => logger.error('yes'));

    expect(debugOut.stdout).toBe('');
    expect(infoOut.stdout).toBe('');
    expect(warnOut.stderr).toBe('');
    expect(errOut.stderr).toContain('yes');
  });

  it('getLevel() reflects the active level', () => {
    setLogLevel('debug');
    expect(logger.getLevel()).toBe('debug');

    setLogLevel('error');
    expect(logger.getLevel()).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// HELIX_LOG_LEVEL env var
// ---------------------------------------------------------------------------

describe('HELIX_LOG_LEVEL environment variable', () => {
  it('respects HELIX_LOG_LEVEL=debug', () => {
    process.env['HELIX_LOG_LEVEL'] = 'debug';
    logger.reset();

    expect(logger.getLevel()).toBe('debug');
    const { stdout } = captureOutput(() => logger.debug('env-debug'));
    expect(stdout).toContain('env-debug');
  });

  it('respects HELIX_LOG_LEVEL=warn', () => {
    process.env['HELIX_LOG_LEVEL'] = 'warn';
    logger.reset();

    expect(logger.getLevel()).toBe('warn');

    const infoOut = captureOutput(() => logger.info('should-be-suppressed'));
    expect(infoOut.stdout).toBe('');

    const warnOut = captureOutput(() => logger.warn('should-appear'));
    expect(warnOut.stderr).toContain('should-appear');
  });

  it('respects HELIX_LOG_LEVEL=error', () => {
    process.env['HELIX_LOG_LEVEL'] = 'error';
    logger.reset();

    expect(logger.getLevel()).toBe('error');

    const infoOut = captureOutput(() => logger.info('suppressed'));
    expect(infoOut.stdout).toBe('');
  });

  it('defaults to info when HELIX_LOG_LEVEL is unset', () => {
    delete process.env['HELIX_LOG_LEVEL'];
    logger.reset();

    expect(logger.getLevel()).toBe('info');
  });

  it('defaults to info when HELIX_LOG_LEVEL is an invalid value', () => {
    process.env['HELIX_LOG_LEVEL'] = 'verbose';
    logger.reset();

    expect(logger.getLevel()).toBe('info');
  });

  it('setLogLevel() overrides env var', () => {
    process.env['HELIX_LOG_LEVEL'] = 'warn';
    logger.reset();

    setLogLevel('debug');
    expect(logger.getLevel()).toBe('debug');
  });
});

// ---------------------------------------------------------------------------
// JSON output format
// ---------------------------------------------------------------------------

describe('JSON output format', () => {
  beforeEach(() => {
    process.env['HELIX_LOG_FORMAT'] = 'json';
    logger.reset();
  });

  it('detects JSON format from HELIX_LOG_FORMAT=json', () => {
    expect(logger.getFormat()).toBe('json');
  });

  it('emits valid JSON for info messages', () => {
    const { stdout } = captureOutput(() => logger.info('hello'));
    const parsed = JSON.parse(stdout.trim()) as LogEntry;
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('hello');
  });

  it('JSON output includes timestamp field', () => {
    const { stdout } = captureOutput(() => logger.info('ts-check'));
    const parsed = JSON.parse(stdout.trim()) as LogEntry;
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('JSON output includes data when provided', () => {
    const { stdout } = captureOutput(() => logger.info('with-data', { key: 'value' }));
    const parsed = JSON.parse(stdout.trim()) as LogEntry;
    expect(parsed.data).toEqual({ key: 'value' });
  });

  it('JSON output omits data field when not provided', () => {
    const { stdout } = captureOutput(() => logger.info('no-data'));
    const parsed = JSON.parse(stdout.trim()) as LogEntry;
    expect(parsed.data).toBeUndefined();
  });

  it('JSON warn goes to stderr', () => {
    const { stderr, stdout } = captureOutput(() => logger.warn('json-warn'));
    const parsed = JSON.parse(stderr.trim()) as LogEntry;
    expect(parsed.level).toBe('warn');
    expect(stdout).toBe('');
  });

  it('JSON error goes to stderr', () => {
    const { stderr, stdout } = captureOutput(() => logger.error('json-error'));
    const parsed = JSON.parse(stderr.trim()) as LogEntry;
    expect(parsed.level).toBe('error');
    expect(stdout).toBe('');
  });

  it('JSON debug message includes correct level field', () => {
    setLogLevel('debug');
    const { stdout } = captureOutput(() => logger.debug('json-debug'));
    const parsed = JSON.parse(stdout.trim()) as LogEntry;
    expect(parsed.level).toBe('debug');
  });

  it('emits one JSON object per call', () => {
    const { stdout } = captureOutput(() => {
      logger.info('first');
      logger.info('second');
    });
    const lines = stdout.trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]) as LogEntry;
    const second = JSON.parse(lines[1]) as LogEntry;
    expect(first.message).toBe('first');
    expect(second.message).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// Human-readable format
// ---------------------------------------------------------------------------

describe('human-readable format', () => {
  beforeEach(() => {
    delete process.env['HELIX_LOG_FORMAT'];
    logger.reset();
  });

  it('detects human format when HELIX_LOG_FORMAT is unset', () => {
    expect(logger.getFormat()).toBe('human');
  });

  it('detects human format when HELIX_LOG_FORMAT is not "json"', () => {
    process.env['HELIX_LOG_FORMAT'] = 'text';
    logger.reset();
    expect(logger.getFormat()).toBe('human');
  });

  it('human info output contains the message text', () => {
    const { stdout } = captureOutput(() => logger.info('human-info'));
    expect(stdout).toContain('human-info');
  });

  it('human warn output goes to stderr', () => {
    const { stderr, stdout } = captureOutput(() => logger.warn('human-warn'));
    expect(stderr).toContain('human-warn');
    expect(stdout).toBe('');
  });

  it('human error output goes to stderr', () => {
    const { stderr, stdout } = captureOutput(() => logger.error('human-error'));
    expect(stderr).toContain('human-error');
    expect(stdout).toBe('');
  });

  it('human debug output goes to stdout when level is debug', () => {
    setLogLevel('debug');
    const { stdout } = captureOutput(() => logger.debug('human-debug'));
    expect(stdout).toContain('human-debug');
  });

  it('human output is not valid JSON', () => {
    const { stdout } = captureOutput(() => logger.info('plain text message'));
    expect(() => JSON.parse(stdout)).toThrow();
  });

  it('human output includes data as a suffix when provided', () => {
    const { stdout } = captureOutput(() => logger.info('msg', { file: 'foo.ts' }));
    expect(stdout).toContain('foo.ts');
  });
});

// ---------------------------------------------------------------------------
// setLogLevel convenience function
// ---------------------------------------------------------------------------

describe('setLogLevel()', () => {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

  for (const level of levels) {
    it(`setLogLevel('${level}') updates getLevel()`, () => {
      setLogLevel(level);
      expect(logger.getLevel()).toBe(level);
    });
  }
});
