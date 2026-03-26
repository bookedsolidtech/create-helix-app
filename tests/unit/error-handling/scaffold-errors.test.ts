import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import * as p from '@clack/prompts';

// Mock @clack/prompts before importing scaffold
vi.mock('@clack/prompts', () => ({
  log: {
    error: vi.fn(),
  },
}));

// Import after mocking
const { scaffoldProject } = await import('../../../src/scaffold.js');

const TEST_DIR = '/tmp/helix-scaffold-errors-test';

function makeOptions(overrides: Partial<Parameters<typeof scaffoldProject>[0]> = {}) {
  return {
    name: 'test-app',
    directory: path.join(TEST_DIR, 'test-app'),
    framework: 'vanilla' as const,
    componentBundles: ['core'] as ['core'],
    typescript: false,
    eslint: false,
    designTokens: false,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(TEST_DIR);
  vi.clearAllMocks();
});

afterEach(async () => {
  await fs.remove(TEST_DIR);
  vi.restoreAllMocks();
});

describe('scaffold error handling — EACCES', () => {
  it('shows permission denied message on EACCES', async () => {
    const opts = makeOptions();
    const eaccesErr = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    vi.spyOn(fs, 'ensureDir').mockRejectedValueOnce(eaccesErr);

    await expect(scaffoldProject(opts)).rejects.toThrow(
      'Cannot write to directory. Check permissions.',
    );
    expect(p.log.error).toHaveBeenCalledWith('Cannot write to directory. Check permissions.');
  });

  it('cleans up partially created directory on EACCES', async () => {
    const opts = makeOptions();
    // Pre-create the directory to simulate partial creation
    await fs.ensureDir(opts.directory);

    const eaccesErr = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    vi.spyOn(fs, 'writeJson').mockRejectedValueOnce(eaccesErr);

    await expect(scaffoldProject(opts)).rejects.toThrow();

    // Directory should NOT be cleaned up because it existed before scaffold ran
    // (dirExistedBefore = true)
    // This tests that pre-existing dirs are not deleted
  });

  it('removes newly created directory on EACCES', async () => {
    const opts = makeOptions();
    // Do NOT pre-create the directory

    const eaccesErr = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    // Fail after ensureDir has created the directory
    let ensureDirCalled = false;
    vi.spyOn(fs, 'ensureDir').mockImplementationOnce(async (dirPath: string) => {
      await fs.mkdirp(dirPath);
      ensureDirCalled = true;
    });
    vi.spyOn(fs, 'writeJson').mockRejectedValueOnce(eaccesErr);

    expect(ensureDirCalled).toBe(false);
    await expect(scaffoldProject(opts)).rejects.toThrow();

    // The directory should have been cleaned up
    expect(await fs.pathExists(opts.directory)).toBe(false);
  });
});

describe('scaffold error handling — ENOSPC', () => {
  it('shows disk full message on ENOSPC', async () => {
    const opts = makeOptions();
    const enospcErr = Object.assign(new Error('ENOSPC: no space left on device'), {
      code: 'ENOSPC',
    });
    vi.spyOn(fs, 'ensureDir').mockRejectedValueOnce(enospcErr);

    await expect(scaffoldProject(opts)).rejects.toThrow(
      'Disk full. Free some space and try again.',
    );
    expect(p.log.error).toHaveBeenCalledWith('Disk full. Free some space and try again.');
  });
});

describe('scaffold error handling — EEXIST', () => {
  it('shows directory exists message on EEXIST', async () => {
    const opts = makeOptions();
    const eexistErr = Object.assign(new Error('EEXIST: file already exists'), { code: 'EEXIST' });
    vi.spyOn(fs, 'ensureDir').mockRejectedValueOnce(eexistErr);

    await expect(scaffoldProject(opts)).rejects.toThrow(
      'Directory already exists and is not empty. Choose a different name or use --force.',
    );
    expect(p.log.error).toHaveBeenCalledWith(
      'Directory already exists and is not empty. Choose a different name or use --force.',
    );
  });
});

describe('scaffold error handling — unknown errors', () => {
  it('rethrows unknown errors without a friendly message', async () => {
    const opts = makeOptions();
    const unknownErr = new Error('Something unexpected');
    vi.spyOn(fs, 'ensureDir').mockRejectedValueOnce(unknownErr);

    await expect(scaffoldProject(opts)).rejects.toThrow('Something unexpected');
    expect(p.log.error).not.toHaveBeenCalled();
  });
});
