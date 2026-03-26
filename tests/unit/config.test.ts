import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  let readFileSyncSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let homedirSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/fake/cwd');
    homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue('/fake/home');
  });

  afterEach(() => {
    readFileSyncSpy.mockRestore();
    warnSpy.mockRestore();
    cwdSpy.mockRestore();
    homedirSpy.mockRestore();
  });

  it('loads a valid config from the current directory', () => {
    const mockConfig = {
      defaults: {
        template: 'react-next',
        typescript: true,
        eslint: true,
        darkMode: true,
        tokens: true,
        bundles: ['core', 'forms'],
      },
    };

    readFileSyncSpy.mockImplementation((filePath: unknown) => {
      if (filePath === path.resolve('/fake/cwd', '.helixrc.json')) {
        return JSON.stringify(mockConfig);
      }
      throw new Error('ENOENT');
    });

    const result = loadConfig(false);
    expect(result.config).toEqual(mockConfig);
    expect(result.configFile).toBe(path.resolve('/fake/cwd', '.helixrc.json'));
  });

  it('falls back to home directory config when cwd config is missing', () => {
    const mockConfig = { defaults: { template: 'vue-vite' } };

    readFileSyncSpy.mockImplementation((filePath: unknown) => {
      if (filePath === path.resolve('/fake/home', '.helixrc.json')) {
        return JSON.stringify(mockConfig);
      }
      throw new Error('ENOENT');
    });

    const result = loadConfig(false);
    expect(result.config).toEqual(mockConfig);
    expect(result.configFile).toBe(path.resolve('/fake/home', '.helixrc.json'));
  });

  it('returns empty config when no config file is found', () => {
    readFileSyncSpy.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = loadConfig(false);
    expect(result.config).toEqual({});
    expect(result.configFile).toBeNull();
  });

  it('warns on invalid JSON but does not crash', () => {
    readFileSyncSpy.mockImplementation((filePath: unknown) => {
      if (filePath === path.resolve('/fake/cwd', '.helixrc.json')) {
        return '{ invalid json ';
      }
      throw new Error('ENOENT');
    });

    const result = loadConfig(false);
    expect(result.config).toEqual({});
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('invalid JSON');
    expect(warnSpy.mock.calls[0][0]).toContain('.helixrc.json');
  });

  it('returns empty config when --no-config is set', () => {
    const mockConfig = { defaults: { template: 'react-next' } };
    readFileSyncSpy.mockImplementation(() => JSON.stringify(mockConfig));

    const result = loadConfig(true);
    expect(result.config).toEqual({});
    expect(result.configFile).toBeNull();
    expect(readFileSyncSpy).not.toHaveBeenCalled();
  });

  it('prefers cwd config over home directory config', () => {
    const cwdConfig = { defaults: { template: 'react-next' } };
    const homeConfig = { defaults: { template: 'vue-vite' } };

    readFileSyncSpy.mockImplementation((filePath: unknown) => {
      if (filePath === path.resolve('/fake/cwd', '.helixrc.json')) {
        return JSON.stringify(cwdConfig);
      }
      if (filePath === path.resolve('/fake/home', '.helixrc.json')) {
        return JSON.stringify(homeConfig);
      }
      throw new Error('ENOENT');
    });

    const result = loadConfig(false);
    expect(result.config).toEqual(cwdConfig);
    expect(result.configFile).toBe(path.resolve('/fake/cwd', '.helixrc.json'));
  });
});

describe('parseArgs --no-config flag', () => {
  it('parses --no-config flag', async () => {
    const { parseArgs } = await import('../../src/args.js');
    const parsed = parseArgs(['my-app', '--no-config']);
    expect(parsed.noConfig).toBe(true);
  });

  it('noConfig is false when not present', async () => {
    const { parseArgs } = await import('../../src/args.js');
    const parsed = parseArgs(['my-app']);
    expect(parsed.noConfig).toBe(false);
  });
});

describe('runListCommand configFile field', () => {
  let logs: string[];
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('JSON output includes configFile field when config is active', async () => {
    const { runListCommand } = await import('../../src/cli.js');
    runListCommand(true, '/path/to/.helixrc.json');
    const parsed = JSON.parse(logs[0]) as { configFile: string | null };
    expect(parsed.configFile).toBe('/path/to/.helixrc.json');
  });

  it('JSON output includes configFile as null when no config', async () => {
    const { runListCommand } = await import('../../src/cli.js');
    runListCommand(true, null);
    const parsed = JSON.parse(logs[0]) as { configFile: string | null };
    expect(parsed.configFile).toBeNull();
  });

  it('JSON output defaults configFile to null when not provided', async () => {
    const { runListCommand } = await import('../../src/cli.js');
    runListCommand(true);
    const parsed = JSON.parse(logs[0]) as { configFile: string | null };
    expect(parsed.configFile).toBeNull();
  });
});
