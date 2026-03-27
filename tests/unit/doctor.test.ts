import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkNodeVersion,
  checkGit,
  checkWritePermissions,
  checkDiskSpace,
  checkPackageManagers,
  checkNetwork,
  runDoctor,
  formatDoctorOutput,
  type DoctorResult,
  type CheckResult,
} from '../../src/doctor.js';

// Mock child_process.execSync
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock node:fs
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      accessSync: vi.fn(),
      constants: actual.default.constants,
    },
    accessSync: vi.fn(),
    constants: actual.constants,
  };
});

// Mock node:https for network check
vi.mock('node:https', () => ({
  default: {
    get: vi.fn(),
  },
}));

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';

const mockExecSync = vi.mocked(execSync);
const mockAccessSync = vi.mocked(fs.accessSync);
const mockHttpsGet = vi.mocked(https.get);

describe('doctor checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('checkNodeVersion', () => {
    const origVersion = process.version;

    afterEach(() => {
      Object.defineProperty(process, 'version', { value: origVersion, writable: true });
    });

    it('returns ok when node >= 20', () => {
      Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });

      const result = checkNodeVersion();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('v22.4.0');
      expect(result.name).toBe('Node.js');
    });

    it('returns warn when node < 20', () => {
      Object.defineProperty(process, 'version', { value: 'v18.0.0', writable: true });

      const result = checkNodeVersion();

      expect(result.status).toBe('warn');
      expect(result.message).toContain('v18.0.0');
    });

    it('returns ok for exactly node v20.0.0 (boundary)', () => {
      Object.defineProperty(process, 'version', { value: 'v20.0.0', writable: true });

      const result = checkNodeVersion();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('v20.0.0');
      expect(result.message).toContain('>= 20 required');
    });

    it('returns warn for node v19.9.9 (just below boundary)', () => {
      Object.defineProperty(process, 'version', { value: 'v19.9.9', writable: true });

      const result = checkNodeVersion();

      expect(result.status).toBe('warn');
      expect(result.message).toContain('v19.9.9');
    });

    it('returns ok for a future major version like v24', () => {
      Object.defineProperty(process, 'version', { value: 'v24.1.0', writable: true });

      const result = checkNodeVersion();

      expect(result.status).toBe('ok');
    });

    it('includes upgrade message when version is too low', () => {
      Object.defineProperty(process, 'version', { value: 'v16.0.0', writable: true });

      const result = checkNodeVersion();

      expect(result.status).toBe('warn');
      expect(result.message).toContain('please upgrade');
    });
  });

  describe('checkGit', () => {
    it('returns ok when git is available', () => {
      mockExecSync.mockReturnValue(Buffer.from('git version 2.45.0'));

      const result = checkGit();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('2.45.0');
      expect(result.name).toBe('git');
    });

    it('returns warn when git is not found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found');
      });

      const result = checkGit();

      expect(result.status).toBe('warn');
      expect(result.message).toBe('not found');
    });

    it('parses version from verbose git version output', () => {
      mockExecSync.mockReturnValue(Buffer.from('git version 2.39.3 (Apple Git-146)'));

      const result = checkGit();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('2.39.3');
    });
  });

  describe('checkPackageManagers', () => {
    it('returns npm check as ok when npm is available', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('npm')) return Buffer.from('10.8.1');
        throw new Error('not found');
      });

      const results = checkPackageManagers();
      const npmResult = results.find((r) => r.name === 'npm');

      expect(npmResult).toBeDefined();
      expect(npmResult!.status).toBe('ok');
      expect(npmResult!.message).toContain('10.8.1');
    });

    it('returns npm warn when npm is not found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const results = checkPackageManagers();
      const npmResult = results.find((r) => r.name === 'npm');

      expect(npmResult).toBeDefined();
      expect(npmResult!.status).toBe('warn');
      expect(npmResult!.message).toBe('not found');
    });

    it('includes pnpm when available', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('pnpm')) return Buffer.from('8.6.0');
        if (cmdStr.includes('npm')) return Buffer.from('10.8.1');
        throw new Error('not found');
      });

      const results = checkPackageManagers();
      const pnpmResult = results.find((r) => r.name === 'pnpm');

      expect(pnpmResult).toBeDefined();
      expect(pnpmResult!.status).toBe('ok');
      expect(pnpmResult!.message).toContain('8.6.0');
    });

    it('includes yarn when available', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('yarn')) return Buffer.from('4.1.0');
        if (cmdStr.includes('npm')) return Buffer.from('10.8.1');
        throw new Error('not found');
      });

      const results = checkPackageManagers();
      const yarnResult = results.find((r) => r.name === 'yarn');

      expect(yarnResult).toBeDefined();
      expect(yarnResult!.status).toBe('ok');
      expect(yarnResult!.message).toContain('4.1.0');
    });

    it('detects all three package managers when available', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('pnpm')) return Buffer.from('8.6.0');
        if (cmdStr.includes('yarn')) return Buffer.from('4.1.0');
        if (cmdStr.includes('npm')) return Buffer.from('10.8.1');
        throw new Error('not found');
      });

      const results = checkPackageManagers();

      expect(results).toHaveLength(3);
      expect(results.find((r) => r.name === 'npm')).toBeDefined();
      expect(results.find((r) => r.name === 'pnpm')).toBeDefined();
      expect(results.find((r) => r.name === 'yarn')).toBeDefined();
      expect(results.every((r) => r.status === 'ok')).toBe(true);
    });

    it('omits pnpm and yarn from results when not found', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('npm') && !cmdStr.includes('pnpm')) return Buffer.from('10.8.1');
        throw new Error('not found');
      });

      const results = checkPackageManagers();

      expect(results.find((r) => r.name === 'npm')).toBeDefined();
      expect(results.find((r) => r.name === 'pnpm')).toBeUndefined();
      expect(results.find((r) => r.name === 'yarn')).toBeUndefined();
    });

    it('always includes npm entry even when not found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const results = checkPackageManagers();
      const npmResult = results.find((r) => r.name === 'npm');

      expect(npmResult).toBeDefined();
      expect(results).toHaveLength(1); // only npm warn, no pnpm/yarn
    });
  });

  describe('checkWritePermissions', () => {
    it('returns ok when directory is writable', () => {
      mockAccessSync.mockReturnValue(undefined);

      const result = checkWritePermissions();

      expect(result.status).toBe('ok');
      expect(result.message).toBe('OK');
      expect(result.name).toBe('Write permissions');
    });

    it('returns fail when directory is not writable', () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      const result = checkWritePermissions();

      expect(result.status).toBe('fail');
      expect(result.message).toBe('not writable (EACCES)');
    });

    it('checks cwd with W_OK flag', () => {
      mockAccessSync.mockReturnValue(undefined);

      checkWritePermissions();

      expect(mockAccessSync).toHaveBeenCalledWith(process.cwd(), fs.constants.W_OK);
    });
  });

  describe('checkDiskSpace', () => {
    it('returns ok with available disk space', () => {
      mockExecSync.mockReturnValue(
        Buffer.from(
          'Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/disk1s1  976762584 500000000 476762584  51% /',
        ),
      );

      const result = checkDiskSpace();

      expect(result.status).toBe('ok');
      expect(result.name).toBe('Disk space');
      expect(result.message).toContain('GB available');
    });

    it('calculates GB correctly from df output', () => {
      // 1048576 KB = 1 GB (1024*1024)
      mockExecSync.mockReturnValue(
        Buffer.from(
          'Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/sda1  976762584 500000000 1048576  51% /',
        ),
      );

      const result = checkDiskSpace();

      expect(result.status).toBe('ok');
      expect(result.message).toBe('1.0 GB available');
    });

    it('falls back to os.freemem when df returns single line', () => {
      mockExecSync.mockReturnValue(Buffer.from('Filesystem header only'));

      const result = checkDiskSpace();

      // Falls back to os.freemem path
      expect(result.status).toBe('ok');
      expect(result.name).toBe('Disk space');
      expect(result.message).toContain('GB available');
    });

    it('falls back to os.freemem when df command fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found');
      });

      const result = checkDiskSpace();

      expect(result.status).toBe('ok');
      expect(result.name).toBe('Disk space');
      expect(result.message).toContain('GB available');
      expect(result.message).toContain('RAM free');
    });

    it('falls back to os.freemem when df output has non-numeric available column', () => {
      mockExecSync.mockReturnValue(
        Buffer.from(
          'Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/sda1  976762584 500000000 NaN  51% /',
        ),
      );

      const result = checkDiskSpace();

      // NaN check triggers fallback
      expect(result.status).toBe('ok');
      expect(result.message).toContain('GB available');
    });
  });

  describe('checkNetwork', () => {
    it('returns ok when registry is reachable', async () => {
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (res: { destroy: () => void }) => void;
        cb({ destroy: () => undefined });
        return { on: () => undefined } as unknown as ReturnType<typeof https.get>;
      });

      const result = await checkNetwork();

      expect(result.status).toBe('ok');
      expect(result.name).toBe('Network');
      expect(result.message).toBe('npmjs.org reachable');
    });

    it('returns warn when registry request errors', async () => {
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, _callback: unknown) => {
        const handlers: Record<string, (() => void)[]> = {};
        const req = {
          on: (event: string, handler: () => void) => {
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push(handler);
            // Trigger error immediately
            if (event === 'error') {
              setTimeout(() => handler(), 0);
            }
            return req;
          },
          destroy: () => undefined,
        };
        return req as unknown as ReturnType<typeof https.get>;
      });

      const result = await checkNetwork();

      expect(result.status).toBe('warn');
      expect(result.message).toBe('npmjs.org unreachable');
    });

    it('returns warn when registry request times out', async () => {
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, _callback: unknown) => {
        const handlers: Record<string, (() => void)[]> = {};
        const req = {
          on: (event: string, handler: () => void) => {
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push(handler);
            // Trigger timeout immediately
            if (event === 'timeout') {
              setTimeout(() => handler(), 0);
            }
            return req;
          },
          destroy: () => undefined,
        };
        return req as unknown as ReturnType<typeof https.get>;
      });

      const result = await checkNetwork();

      expect(result.status).toBe('warn');
      expect(result.message).toBe('npmjs.org timed out');
    });
  });

  describe('runDoctor', () => {
    it('returns DoctorResult with all checks', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.0.0'));
      mockAccessSync.mockReturnValue(undefined);
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (res: { destroy: () => void }) => void;
        cb({ destroy: () => undefined });
        return { on: () => undefined } as unknown as ReturnType<typeof https.get>;
      });

      const result = await runDoctor('0.8.0');

      expect(result.version).toBe('0.8.0');
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(typeof result.allPassed).toBe('boolean');
    });

    it('sets allPassed false when any check fails', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.0.0'));
      mockAccessSync.mockImplementation(() => {
        throw new Error('EACCES');
      });
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (res: { destroy: () => void }) => void;
        cb({ destroy: () => undefined });
        return { on: () => undefined } as unknown as ReturnType<typeof https.get>;
      });

      const result = await runDoctor('0.8.0');

      expect(result.allPassed).toBe(false);
    });

    it('sets allPassed true when every check is ok', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.0.0'));
      mockAccessSync.mockReturnValue(undefined);
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (res: { destroy: () => void }) => void;
        cb({ destroy: () => undefined });
        return { on: () => undefined } as unknown as ReturnType<typeof https.get>;
      });

      const result = await runDoctor('1.0.0');

      // All checks should be ok since execSync returns valid versions
      // and accessSync does not throw
      expect(result.allPassed).toBe(true);
      expect(result.checks.every((c: CheckResult) => c.status === 'ok')).toBe(true);
    });

    it('includes Node.js, npm, git, Disk space, Write permissions, Network checks', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.0.0'));
      mockAccessSync.mockReturnValue(undefined);
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (res: { destroy: () => void }) => void;
        cb({ destroy: () => undefined });
        return { on: () => undefined } as unknown as ReturnType<typeof https.get>;
      });

      const result = await runDoctor('0.8.0');

      const checkNames = result.checks.map((c: CheckResult) => c.name);
      expect(checkNames).toContain('Node.js');
      expect(checkNames).toContain('npm');
      expect(checkNames).toContain('git');
      expect(checkNames).toContain('Disk space');
      expect(checkNames).toContain('Write permissions');
      expect(checkNames).toContain('Network');
    });

    it('passes version string through to result', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.0.0'));
      mockAccessSync.mockReturnValue(undefined);
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (res: { destroy: () => void }) => void;
        cb({ destroy: () => undefined });
        return { on: () => undefined } as unknown as ReturnType<typeof https.get>;
      });

      const result = await runDoctor('2.5.3');

      expect(result.version).toBe('2.5.3');
    });

    it('sets allPassed false when network check warns', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.0.0'));
      mockAccessSync.mockReturnValue(undefined);
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, _callback: unknown) => {
        const handlers: Record<string, (() => void)[]> = {};
        const req = {
          on: (event: string, handler: () => void) => {
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push(handler);
            if (event === 'error') {
              setTimeout(() => handler(), 0);
            }
            return req;
          },
          destroy: () => undefined,
        };
        return req as unknown as ReturnType<typeof https.get>;
      });

      const result = await runDoctor('0.8.0');

      expect(result.allPassed).toBe(false);
    });
  });

  describe('formatDoctorOutput', () => {
    it('formats plain text output correctly', () => {
      const result: DoctorResult = {
        version: '0.8.0',
        checks: [
          { name: 'Node.js', status: 'ok', message: 'v22.4.0 (>= 20 required)' },
          { name: 'npm', status: 'ok', message: 'v10.8.1' },
          { name: 'git', status: 'ok', message: 'v2.45.0' },
          { name: 'Disk space', status: 'ok', message: '45.2 GB available' },
          { name: 'Write permissions', status: 'ok', message: 'OK' },
          { name: 'Network', status: 'ok', message: 'npmjs.org reachable' },
        ],
        allPassed: true,
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain('create-helix doctor v0.8.0');
      expect(output).toContain('✓ Node.js: v22.4.0');
      expect(output).toContain('✓ npm: v10.8.1');
      expect(output).toContain('✓ git: v2.45.0');
      expect(output).toContain('✓ Disk space: 45.2 GB available');
      expect(output).toContain('✓ Write permissions: OK');
      expect(output).toContain('✓ Network: npmjs.org reachable');
      expect(output).toContain('All checks passed! Ready to scaffold.');
    });

    it('shows warning icon for warn status', () => {
      const result: DoctorResult = {
        version: '0.8.0',
        checks: [{ name: 'git', status: 'warn', message: 'not found' }],
        allPassed: false,
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain('⚠ git: not found');
      expect(output).toContain('Some checks failed or have warnings.');
    });

    it('shows fail icon for fail status', () => {
      const result: DoctorResult = {
        version: '0.8.0',
        checks: [{ name: 'Write permissions', status: 'fail', message: 'not writable' }],
        allPassed: false,
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain('✗ Write permissions: not writable');
    });

    it('handles mixed ok, warn, and fail statuses', () => {
      const result: DoctorResult = {
        version: '1.0.0',
        checks: [
          { name: 'Node.js', status: 'ok', message: 'v22.4.0 (>= 20 required)' },
          { name: 'git', status: 'warn', message: 'not found' },
          { name: 'Write permissions', status: 'fail', message: 'not writable' },
        ],
        allPassed: false,
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain('✓ Node.js');
      expect(output).toContain('⚠ git');
      expect(output).toContain('✗ Write permissions');
      expect(output).toContain('Some checks failed or have warnings.');
    });

    it('formats empty checks array', () => {
      const result: DoctorResult = {
        version: '0.1.0',
        checks: [],
        allPassed: true,
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain('create-helix doctor v0.1.0');
      expect(output).toContain('All checks passed! Ready to scaffold.');
    });

    it('includes version in header line', () => {
      const result: DoctorResult = {
        version: '3.2.1',
        checks: [],
        allPassed: true,
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain('create-helix doctor v3.2.1');
    });

    it('output is newline-separated', () => {
      const result: DoctorResult = {
        version: '0.8.0',
        checks: [
          { name: 'Node.js', status: 'ok', message: 'v22.4.0' },
          { name: 'npm', status: 'ok', message: 'v10.8.1' },
        ],
        allPassed: true,
      };

      const output = formatDoctorOutput(result);
      const lines = output.split('\n');

      // Header, blank line, 2 checks, blank line, summary = 6 lines
      expect(lines.length).toBeGreaterThanOrEqual(6);
      expect(lines[0]).toContain('create-helix doctor');
      expect(lines[1]).toBe('');
    });
  });

  describe('--json output format', () => {
    it('runDoctor returns serializable result', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.0.0'));
      mockAccessSync.mockReturnValue(undefined);
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (res: { destroy: () => void }) => void;
        cb({ destroy: () => undefined });
        return { on: () => undefined } as unknown as ReturnType<typeof https.get>;
      });

      const result = await runDoctor('0.8.0');
      const json = JSON.stringify(result);
      const parsed = JSON.parse(json) as DoctorResult;

      expect(parsed.version).toBe('0.8.0');
      expect(Array.isArray(parsed.checks)).toBe(true);
      expect(typeof parsed.allPassed).toBe('boolean');
      for (const check of parsed.checks) {
        expect(check.name).toBeDefined();
        expect(check.status).toMatch(/^(ok|warn|fail)$/);
        expect(check.message).toBeDefined();
      }
    });
  });
});
