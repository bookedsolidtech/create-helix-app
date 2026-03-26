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

    it('returns ok for exactly node 20', () => {
      Object.defineProperty(process, 'version', { value: 'v20.0.0', writable: true });

      const result = checkNodeVersion();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('v20.0.0');

      Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
    });

    it('returns warn for node 19', () => {
      Object.defineProperty(process, 'version', { value: 'v19.9.9', writable: true });

      const result = checkNodeVersion();

      expect(result.status).toBe('warn');
      expect(result.message).toContain('< 20 required');

      Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
    });

    it('message includes >= 20 required text for ok status', () => {
      Object.defineProperty(process, 'version', { value: 'v21.0.0', writable: true });

      const result = checkNodeVersion();

      expect(result.message).toContain('>= 20 required');

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

    it('parses complex git version strings', () => {
      mockExecSync.mockReturnValue(Buffer.from('git version 2.39.3 (Apple Git-145)'));

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
        if (cmdStr.includes('yarn')) return Buffer.from('1.22.22');
        if (cmdStr.includes('npm')) return Buffer.from('10.8.1');
        throw new Error('not found');
      });

      const results = checkPackageManagers();
      const yarnResult = results.find((r) => r.name === 'yarn');

      expect(yarnResult).toBeDefined();
      expect(yarnResult!.status).toBe('ok');
      expect(yarnResult!.message).toContain('1.22.22');
    });

    it('does not include pnpm when not available', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('npm') && !cmdStr.includes('pnpm')) return Buffer.from('10.8.1');
        throw new Error('not found');
      });

      const results = checkPackageManagers();
      const pnpmResult = results.find((r) => r.name === 'pnpm');

      expect(pnpmResult).toBeUndefined();
    });

    it('returns all three package managers when all available', () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('pnpm')) return Buffer.from('9.0.0');
        if (cmdStr.includes('yarn')) return Buffer.from('1.22.22');
        if (cmdStr.includes('npm')) return Buffer.from('10.8.1');
        throw new Error('not found');
      });

      const results = checkPackageManagers();
      const names = results.map((r) => r.name);

      expect(names).toContain('npm');
      expect(names).toContain('pnpm');
      expect(names).toContain('yarn');
    });

    it('always includes npm in results even when not found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const results = checkPackageManagers();

      expect(results.some((r) => r.name === 'npm')).toBe(true);
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

    it('has correct check name', () => {
      mockAccessSync.mockReturnValue(undefined);

      const result = checkWritePermissions();

      expect(result.name).toBe('Write permissions');
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

    it('falls back gracefully when df fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('df not available');
      });

      const result = checkDiskSpace();

      expect(result.name).toBe('Disk space');
      // Either ok (with freemem fallback) or warn
      expect(['ok', 'warn']).toContain(result.status);
    });

    it('handles malformed df output', () => {
      mockExecSync.mockReturnValue(Buffer.from('malformed output'));

      const result = checkDiskSpace();

      expect(result.name).toBe('Disk space');
      expect(result.status).toBe('ok'); // falls back to freemem
    });
  });

  describe('checkNetwork', () => {
    it('returns ok when npmjs.org is reachable', async () => {
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

    it('returns warn when connection errors occur', async () => {
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, _callback: unknown) => {
        const req = {
          on: (event: string, handler: () => void) => {
            if (event === 'error') {
              handler();
            }
            return req;
          },
        };
        return req as unknown as ReturnType<typeof https.get>;
      });

      const result = await checkNetwork();

      expect(result.status).toBe('warn');
      expect(result.message).toBe('npmjs.org unreachable');
    });

    it('returns warn when connection times out', async () => {
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, _callback: unknown) => {
        const req = {
          destroy: () => undefined,
          on: (event: string, handler: () => void) => {
            if (event === 'timeout') {
              handler();
            }
            return req;
          },
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

    it('includes a network check in results', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.0.0'));
      mockAccessSync.mockReturnValue(undefined);
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (res: { destroy: () => void }) => void;
        cb({ destroy: () => undefined });
        return { on: () => undefined } as unknown as ReturnType<typeof https.get>;
      });

      const result = await runDoctor('1.2.3');

      const networkCheck = result.checks.find((c) => c.name === 'Network');
      expect(networkCheck).toBeDefined();
    });

    it('passes version through to result', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.0.0'));
      mockAccessSync.mockReturnValue(undefined);
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (res: { destroy: () => void }) => void;
        cb({ destroy: () => undefined });
        return { on: () => undefined } as unknown as ReturnType<typeof https.get>;
      });

      const result = await runDoctor('1.2.3');

      expect(result.version).toBe('1.2.3');
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

    it('includes version in header', () => {
      const result: DoctorResult = {
        version: '1.5.0',
        checks: [],
        allPassed: true,
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain('create-helix doctor v1.5.0');
    });

    it('shows mixed statuses with correct icons', () => {
      const result: DoctorResult = {
        version: '0.8.0',
        checks: [
          { name: 'Node.js', status: 'ok', message: 'v22.0.0' },
          { name: 'git', status: 'warn', message: 'not found' },
          { name: 'Write permissions', status: 'fail', message: 'not writable' },
        ],
        allPassed: false,
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain('✓ Node.js:');
      expect(output).toContain('⚠ git:');
      expect(output).toContain('✗ Write permissions:');
    });

    it('shows failure message when allPassed is false', () => {
      const result: DoctorResult = {
        version: '0.8.0',
        checks: [{ name: 'Network', status: 'warn', message: 'unreachable' }],
        allPassed: false,
      };

      const output = formatDoctorOutput(result);

      expect(output).toContain('Some checks failed or have warnings. Review items above.');
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

    it('JSON round-trip preserves all check fields', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.0.0'));
      mockAccessSync.mockReturnValue(undefined);
      mockHttpsGet.mockImplementation((_url: unknown, _opts: unknown, callback: unknown) => {
        const cb = callback as (res: { destroy: () => void }) => void;
        cb({ destroy: () => undefined });
        return { on: () => undefined } as unknown as ReturnType<typeof https.get>;
      });

      const result = await runDoctor('0.9.0');
      const json = JSON.stringify(result);
      const parsed = JSON.parse(json) as DoctorResult;

      expect(parsed.checks).toHaveLength(result.checks.length);
      for (let i = 0; i < result.checks.length; i++) {
        expect(parsed.checks[i].name).toBe(result.checks[i].name);
        expect(parsed.checks[i].status).toBe(result.checks[i].status);
        expect(parsed.checks[i].message).toBe(result.checks[i].message);
      }
    });

    it('serializes warn status correctly in JSON', () => {
      const result: DoctorResult = {
        version: '0.8.0',
        checks: [{ name: 'git', status: 'warn', message: 'not found' }],
        allPassed: false,
      };

      const parsed = JSON.parse(JSON.stringify(result)) as DoctorResult;

      expect(parsed.checks[0].status).toBe('warn');
      expect(parsed.allPassed).toBe(false);
    });

    it('serializes fail status correctly in JSON', () => {
      const result: DoctorResult = {
        version: '0.8.0',
        checks: [{ name: 'Write permissions', status: 'fail', message: 'not writable' }],
        allPassed: false,
      };

      const parsed = JSON.parse(JSON.stringify(result)) as DoctorResult;

      expect(parsed.checks[0].status).toBe('fail');
    });

    it('serializes mixed statuses correctly in JSON', () => {
      const result: DoctorResult = {
        version: '0.8.0',
        checks: [
          { name: 'Node.js', status: 'ok', message: 'v22.0.0' },
          { name: 'git', status: 'warn', message: 'not found' },
          { name: 'Write permissions', status: 'fail', message: 'not writable' },
        ],
        allPassed: false,
      };

      const parsed = JSON.parse(JSON.stringify(result)) as DoctorResult;

      expect(parsed.checks).toHaveLength(3);
      expect(parsed.checks[0].status).toBe('ok');
      expect(parsed.checks[1].status).toBe('warn');
      expect(parsed.checks[2].status).toBe('fail');
    });
  });
});
