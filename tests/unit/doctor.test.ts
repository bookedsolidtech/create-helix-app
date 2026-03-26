import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkNodeVersion,
  checkGit,
  checkWritePermissions,
  checkDiskSpace,
  checkPackageManagers,
  runDoctor,
  formatDoctorOutput,
  type DoctorResult,
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
    it('returns ok when node >= 20', () => {
      // process.version is the real version; we can test the logic directly
      const origVersion = process.version;
      Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });

      const result = checkNodeVersion();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('v22.4.0');
      expect(result.name).toBe('Node.js');

      Object.defineProperty(process, 'version', { value: origVersion, writable: true });
    });

    it('returns warn when node < 20', () => {
      Object.defineProperty(process, 'version', { value: 'v18.0.0', writable: true });

      const result = checkNodeVersion();

      expect(result.status).toBe('warn');
      expect(result.message).toContain('v18.0.0');

      Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
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
  });

  describe('checkWritePermissions', () => {
    it('returns ok when directory is writable', () => {
      mockAccessSync.mockReturnValue(undefined);

      const result = checkWritePermissions();

      expect(result.status).toBe('ok');
      expect(result.message).toBe('OK');
    });

    it('returns fail when directory is not writable', () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      const result = checkWritePermissions();

      expect(result.status).toBe('fail');
      expect(result.message).toBe('not writable');
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
