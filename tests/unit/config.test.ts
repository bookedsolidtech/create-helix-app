import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(fs, 'readFileSync');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── --no-config flag ───────────────────────────────────────────────────────

  describe('--no-config flag', () => {
    it('returns empty config when noConfig is true', () => {
      const result = loadConfig(true);
      expect(result.config).toEqual({});
      expect(result.configFile).toBeNull();
    });

    it('does not read any files when noConfig is true', () => {
      loadConfig(true);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });

  // ─── Missing config file ─────────────────────────────────────────────────────

  describe('missing config file', () => {
    it('returns empty defaults when no config file exists in cwd or homedir', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = loadConfig(false);
      expect(result.config).toEqual({});
      expect(result.configFile).toBeNull();
    });

    it('checks both cwd and homedir when no config file exists', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      loadConfig(false);
      // Should have attempted to read both candidate paths
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Loading from cwd ────────────────────────────────────────────────────────

  describe('loading from current directory', () => {
    it('loads .helixrc.json from the current working directory', () => {
      const configContent = JSON.stringify({ defaults: { template: 'react-next' } });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.configFile).toBe(path.resolve(process.cwd(), '.helixrc.json'));
    });

    it('returns the path to the loaded config file', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{}' as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.configFile).toContain('.helixrc.json');
    });
  });

  // ─── Homedir fallback (analogous to parent directory traversal) ──────────────

  describe('homedir fallback', () => {
    it('falls back to homedir .helixrc.json when cwd config is missing', () => {
      const homedirConfig = JSON.stringify({ defaults: { template: 'vue-vite' } });

      vi.mocked(fs.readFileSync)
        // First call (cwd) throws ENOENT
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        })
        // Second call (homedir) succeeds
        .mockReturnValueOnce(homedirConfig as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config.defaults?.template).toBe('vue-vite');
      expect(result.configFile).toBe(path.resolve(os.homedir(), '.helixrc.json'));
    });

    it('prefers cwd config over homedir config', () => {
      const cwdConfig = JSON.stringify({ defaults: { template: 'solid-vite' } });
      const homedirConfig = JSON.stringify({ defaults: { template: 'vue-vite' } });

      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(cwdConfig as unknown as Buffer)
        .mockReturnValueOnce(homedirConfig as unknown as Buffer);

      const result = loadConfig(false);
      // Should use cwd config and never read homedir
      expect(result.config.defaults?.template).toBe('solid-vite');
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('returns null configFile when neither cwd nor homedir config exists', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = loadConfig(false);
      expect(result.configFile).toBeNull();
    });
  });

  // ─── Valid config file ───────────────────────────────────────────────────────

  describe('valid config file', () => {
    it('loads all supported defaults fields from a valid config', () => {
      const configContent = JSON.stringify({
        defaults: {
          template: 'react-next',
          typescript: true,
          eslint: true,
          darkMode: true,
          tokens: true,
          bundles: ['core', 'forms'],
        },
      });

      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config.defaults?.template).toBe('react-next');
      expect(result.config.defaults?.typescript).toBe(true);
      expect(result.config.defaults?.eslint).toBe(true);
      expect(result.config.defaults?.darkMode).toBe(true);
      expect(result.config.defaults?.tokens).toBe(true);
      expect(result.config.defaults?.bundles).toEqual(['core', 'forms']);
      expect(result.configFile).not.toBeNull();
    });

    it('accepts a valid framework value in config', () => {
      const frameworks = [
        'react-next',
        'react-vite',
        'remix',
        'vue-nuxt',
        'vue-vite',
        'solid-vite',
        'qwik-vite',
        'svelte-kit',
        'angular',
        'astro',
        'vanilla',
        'lit-vite',
        'preact-vite',
        'stencil',
      ] as const;

      for (const fw of frameworks) {
        vi.mocked(fs.readFileSync).mockReturnValueOnce(
          JSON.stringify({ defaults: { template: fw } }) as unknown as Buffer,
        );
        const result = loadConfig(false);
        expect(result.config.defaults?.template).toBe(fw);
        vi.restoreAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(fs, 'readFileSync');
      }
    });

    it('passes through an unrecognised framework value without error (no validation at load time)', () => {
      const configContent = JSON.stringify({ defaults: { template: 'not-a-real-framework' } });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      // loadConfig does not validate framework values — it defers that to the CLI layer
      const result = loadConfig(false);
      expect(result.config.defaults?.template).toBe('not-a-real-framework' as never);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('ignores unknown keys gracefully without warning or crashing', () => {
      const configContent = JSON.stringify({
        defaults: { template: 'astro' },
        unknownTopLevelKey: true,
        anotherUnknown: { nested: 'value' },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config.defaults?.template).toBe('astro');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // ─── Boolean flags ───────────────────────────────────────────────────────────

  describe('boolean flags in config', () => {
    it('returns typescript: true when set in config', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ defaults: { typescript: true } }) as unknown as Buffer,
      );
      expect(loadConfig(false).config.defaults?.typescript).toBe(true);
    });

    it('returns typescript: false when set in config', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ defaults: { typescript: false } }) as unknown as Buffer,
      );
      expect(loadConfig(false).config.defaults?.typescript).toBe(false);
    });

    it('returns eslint: true when set in config', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ defaults: { eslint: true } }) as unknown as Buffer,
      );
      expect(loadConfig(false).config.defaults?.eslint).toBe(true);
    });

    it('returns eslint: false when set in config', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ defaults: { eslint: false } }) as unknown as Buffer,
      );
      expect(loadConfig(false).config.defaults?.eslint).toBe(false);
    });

    it('returns darkMode: true when set in config', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ defaults: { darkMode: true } }) as unknown as Buffer,
      );
      expect(loadConfig(false).config.defaults?.darkMode).toBe(true);
    });

    it('returns darkMode: false when set in config', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ defaults: { darkMode: false } }) as unknown as Buffer,
      );
      expect(loadConfig(false).config.defaults?.darkMode).toBe(false);
    });

    it('returns tokens: true when set in config', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ defaults: { tokens: true } }) as unknown as Buffer,
      );
      expect(loadConfig(false).config.defaults?.tokens).toBe(true);
    });

    it('returns tokens: false when set in config', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ defaults: { tokens: false } }) as unknown as Buffer,
      );
      expect(loadConfig(false).config.defaults?.tokens).toBe(false);
    });
  });

  // ─── Invalid JSON ─────────────────────────────────────────────────────────────

  describe('invalid JSON', () => {
    it('warns when config file contains invalid JSON', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{ invalid json' as unknown as Buffer);

      loadConfig(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));
    });

    it('warning message includes the config file path', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{bad}' as unknown as Buffer);

      loadConfig(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('.helixrc.json'));
    });

    it('returns empty config when JSON is invalid', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{ bad json }' as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config).toEqual({});
    });

    it('returns the config file path even when JSON is invalid', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('not valid json' as unknown as Buffer);

      const result = loadConfig(false);
      // The file was found but contained invalid JSON — path is still recorded
      expect(result.configFile).toContain('.helixrc.json');
    });

    it('does not crash when config file contains invalid JSON', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('not json at all' as unknown as Buffer);

      expect(() => loadConfig(false)).not.toThrow();
    });

    it('does not attempt to read homedir config after finding invalid JSON in cwd', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{broken' as unknown as Buffer);

      loadConfig(false);
      // Should stop after the first candidate (cwd), even with bad JSON
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Merge behavior ──────────────────────────────────────────────────────────

  describe('merge behavior (CLI flags override config)', () => {
    it('config template default can be read from result', () => {
      const configContent = JSON.stringify({ defaults: { template: 'vue-vite' } });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config.defaults?.template).toBe('vue-vite');
    });

    it('empty defaults object is preserved', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{"defaults":{}}' as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config.defaults).toEqual({});
    });

    it('config with no defaults key returns undefined defaults', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{}' as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config.defaults).toBeUndefined();
    });

    it('all boolean defaults can coexist in a single config', () => {
      const configContent = JSON.stringify({
        defaults: {
          template: 'angular',
          typescript: true,
          eslint: false,
          darkMode: true,
          tokens: false,
        },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config.defaults?.template).toBe('angular');
      expect(result.config.defaults?.typescript).toBe(true);
      expect(result.config.defaults?.eslint).toBe(false);
      expect(result.config.defaults?.darkMode).toBe(true);
      expect(result.config.defaults?.tokens).toBe(false);
    });
  });
});
