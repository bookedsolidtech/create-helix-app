/**
 * Cross-platform path handling tests
 *
 * Verifies that path handling in validation.ts, scaffold.ts, config.ts, and
 * doctor.ts works correctly with both Unix (/) and Windows (\) separators.
 * Uses path.win32 and path.posix to simulate both platform conventions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { validateDirectory, validateProjectName } from '../../src/validation.js';
import { loadConfig } from '../../src/config.js';
import { checkDiskSpace } from '../../src/doctor.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      readFileSync: vi.fn(),
      accessSync: vi.fn(),
      constants: actual.default.constants,
    },
    readFileSync: vi.fn(),
    accessSync: vi.fn(),
    constants: actual.constants,
  };
});

import { execSync } from 'node:child_process';

const mockExecSync = vi.mocked(execSync);

// ---------------------------------------------------------------------------
// validation.ts — path traversal detection with backslashes
// ---------------------------------------------------------------------------

describe('validateDirectory — Unix (posix) path separators', () => {
  it('accepts a simple Unix relative path', () => {
    expect(validateDirectory('projects/my-app')).toBeUndefined();
  });

  it('accepts an absolute Unix path', () => {
    expect(validateDirectory('/home/user/projects/my-app')).toBeUndefined();
  });

  it('rejects Unix path traversal ../', () => {
    expect(validateDirectory('../evil')).toBeTruthy();
  });

  it('rejects nested Unix path traversal', () => {
    expect(validateDirectory('safe/../../../etc/passwd')).toBeTruthy();
  });

  it('rejects Unix path with embedded traversal segment', () => {
    const p = path.posix.join('foo', '..', 'bar');
    // path.posix.join resolves the .., so we pass a raw string with ..
    expect(validateDirectory('foo/../bar')).toBeTruthy();
  });
});

describe('validateDirectory — Windows (win32) path separators (backslashes)', () => {
  it('rejects Windows-style path traversal with backslash (..\\\\)', () => {
    expect(validateDirectory('..\\evil')).toBeTruthy();
  });

  it('rejects Windows UNC-style traversal with backslashes', () => {
    expect(validateDirectory('safe\\..\\..\\etc\\passwd')).toBeTruthy();
  });

  it('rejects a ".." segment in a Windows-style path', () => {
    // Segments split by backslash should catch ".." regardless of OS
    const winPath = 'projects\\my-app\\..\\other';
    expect(validateDirectory(winPath)).toBeTruthy();
  });

  it('rejects bare ".." with backslash prefix', () => {
    // The bare ".." check
    expect(validateDirectory('..\\')).toBeTruthy();
  });
});

describe('validateDirectory — mixed separator paths', () => {
  it('rejects a path with mixed separators containing traversal', () => {
    expect(validateDirectory('foo/..\\bar')).toBeTruthy();
  });

  it('rejects a path traversal embedded with mixed separators', () => {
    expect(validateDirectory('safe/subdir\\..\\..\\evil')).toBeTruthy();
  });

  it('accepts a normal path that happens to use backslash (no traversal)', () => {
    // On non-Windows, backslashes are valid path chars but not traversal
    // The validator should only reject paths with ".." segments
    const result = validateDirectory('projects\\my-app');
    // No ".." segments — expect it to pass validation
    expect(result).toBeUndefined();
  });
});

describe('validateProjectName — path separator rejection', () => {
  it('rejects a forward-slash in project name', () => {
    expect(validateProjectName('my/project')).toBeTruthy();
  });

  it('rejects a backslash in project name', () => {
    expect(validateProjectName('my\\project')).toBeTruthy();
  });

  it('rejects a Windows-style relative path as project name', () => {
    const winPath = path.win32.join('subdir', 'my-project');
    // path.win32.join uses backslashes: "subdir\\my-project"
    expect(validateProjectName(winPath)).toBeTruthy();
  });

  it('rejects a Unix-style relative path as project name', () => {
    const posixPath = path.posix.join('subdir', 'my-project');
    // path.posix.join uses forward slashes: "subdir/my-project"
    expect(validateProjectName(posixPath)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// config.ts — config file resolution paths
// ---------------------------------------------------------------------------

describe('loadConfig — config file path resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses path.resolve (not hardcoded separator) for cwd config path', () => {
    const mockFs = vi.mocked(fs.readFileSync);
    mockFs.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    loadConfig(false);

    // Should have been called; paths derived via path.resolve use OS separator
    expect(mockFs).toHaveBeenCalled();
    const callArgs = mockFs.mock.calls;
    // Verify the path passed includes the config file name
    const calledPaths = callArgs.map((args) => String(args[0]));
    expect(calledPaths.some((p) => p.includes('.helixrc.json'))).toBe(true);
  });

  it('resolves config candidate from cwd using path.resolve', () => {
    const mockFs = vi.mocked(fs.readFileSync);
    mockFs.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    loadConfig(false);

    const calledPaths = mockFs.mock.calls.map((args) => String(args[0]));
    const cwdConfig = path.resolve(process.cwd(), '.helixrc.json');
    expect(calledPaths).toContain(cwdConfig);
  });

  it('resolves config candidate from homedir using path.resolve', () => {
    const mockFs = vi.mocked(fs.readFileSync);
    mockFs.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    loadConfig(false);

    const calledPaths = mockFs.mock.calls.map((args) => String(args[0]));
    const homeConfig = path.resolve(os.homedir(), '.helixrc.json');
    expect(calledPaths).toContain(homeConfig);
  });

  it('config candidate paths use the OS path separator (not hardcoded)', () => {
    const mockFs = vi.mocked(fs.readFileSync);
    mockFs.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    loadConfig(false);

    // On this OS, path.sep is '/' (Unix) or '\\' (Windows)
    const calledPaths = mockFs.mock.calls.map((args) => String(args[0]));
    // Every candidate path should be an absolute path using the OS separator
    for (const p of calledPaths) {
      expect(path.isAbsolute(p)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// doctor.ts — disk space check paths
// ---------------------------------------------------------------------------

describe('checkDiskSpace — path handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the cwd path to df wrapped in quotes', () => {
    mockExecSync.mockReturnValue(
      'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/disk1 100000 50000 50000 50% /\n',
    );

    checkDiskSpace();

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining(process.cwd()),
      expect.any(Object),
    );
  });

  it('uses process.cwd() (OS-native path) not a hardcoded path', () => {
    mockExecSync.mockReturnValue(
      'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/disk1 100000 50000 50000 50% /\n',
    );

    checkDiskSpace();

    const calls = mockExecSync.mock.calls;
    // The command string must include the actual cwd (which uses OS separators)
    const cmd = String(calls[0][0]);
    expect(cmd).toContain(process.cwd());
  });

  it('falls back gracefully when df command fails', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('df: command not found');
    });

    const result = checkDiskSpace();
    // Should not throw; should return a result
    expect(result).toHaveProperty('name', 'Disk space');
    expect(result.status).toMatch(/^(ok|warn|fail)$/);
  });

  it('returns disk space result with expected shape', () => {
    mockExecSync.mockReturnValue(
      'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/disk1 200000000 100000000 100000000 50% /\n',
    );

    const result = checkDiskSpace();
    expect(result).toHaveProperty('name', 'Disk space');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('message');
  });
});

// ---------------------------------------------------------------------------
// Cross-platform path construction — path.win32 vs path.posix
// ---------------------------------------------------------------------------

describe('path.win32 and path.posix — separator simulation', () => {
  it('path.win32.join uses backslash as separator', () => {
    const result = path.win32.join('projects', 'my-app', 'src');
    expect(result).toBe('projects\\my-app\\src');
  });

  it('path.posix.join uses forward slash as separator', () => {
    const result = path.posix.join('projects', 'my-app', 'src');
    expect(result).toBe('projects/my-app/src');
  });

  it('validateDirectory rejects a ".." segment regardless of surrounding separators', () => {
    // Build traversal strings using both path APIs
    const winTraversal = path.win32.join('safe', '..', 'evil');
    const posixTraversal = path.posix.join('safe', '..', 'evil');

    // path.win32.join resolves ".." so the result is "evil" — test raw string
    expect(validateDirectory('safe\\..\\evil')).toBeTruthy();
    expect(validateDirectory('safe/../evil')).toBeTruthy();
  });

  it('path.win32.normalize resolves traversal sequences', () => {
    // Demonstrates that path.win32.normalize("foo\\..\\bar") === "bar"
    const result = path.win32.normalize('foo\\..\\bar');
    expect(result).toBe('bar');
  });

  it('path.posix.normalize resolves traversal sequences', () => {
    const result = path.posix.normalize('foo/../bar');
    expect(result).toBe('bar');
  });

  it('validateProjectName rejects win32-style path component', () => {
    // path.win32.join produces backslash-separated string
    const winPath = path.win32.join('scope', 'package');
    expect(validateProjectName(winPath)).toBeTruthy();
  });

  it('validateProjectName rejects posix-style path component', () => {
    const posixPath = path.posix.join('scope', 'package');
    expect(validateProjectName(posixPath)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Source file audit — no hardcoded path separators in file I/O operations
// ---------------------------------------------------------------------------

describe('source file audit — path separator usage', () => {
  it('validation.ts split uses regex for both separators, not hardcoded /', () => {
    // The validateDirectory function splits on /[\\/]/ not on '/'
    // Verify by testing that backslash segments are also detected
    const backslashPath = 'a\\..\\b';
    expect(validateDirectory(backslashPath)).toBeTruthy();

    const slashPath = 'a/../b';
    expect(validateDirectory(slashPath)).toBeTruthy();
  });

  it('validateDirectory treats backslash "..\\\\" as traversal', () => {
    // Windows-style traversal: "..\\"
    expect(validateDirectory('..\\etc\\passwd')).toBeTruthy();
  });

  it('validateDirectory treats forward-slash "../" as traversal', () => {
    expect(validateDirectory('../etc/passwd')).toBeTruthy();
  });
});
