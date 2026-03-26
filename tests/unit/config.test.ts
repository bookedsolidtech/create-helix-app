import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
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

  describe('missing config file', () => {
    it('returns empty defaults when no config file exists', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = loadConfig(false);
      expect(result.config).toEqual({});
      expect(result.configFile).toBeNull();
    });
  });

  describe('valid config file', () => {
    it('loads a valid config file', () => {
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
      expect(result.config.defaults?.bundles).toEqual(['core', 'forms']);
      expect(result.configFile).not.toBeNull();
    });

    it('returns the path to the loaded config file', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{}' as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.configFile).toContain('.helixrc.json');
    });
  });

  describe('invalid JSON', () => {
    it('warns when config file contains invalid JSON', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{ invalid json' as unknown as Buffer);

      loadConfig(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));
    });

    it('returns empty config when JSON is invalid', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{ bad json }' as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config).toEqual({});
    });

    it('does not crash when config file contains invalid JSON', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('not json at all' as unknown as Buffer);

      expect(() => loadConfig(false)).not.toThrow();
    });
  });

  describe('merge behavior (CLI flags override config)', () => {
    it('config template default can be read from result', () => {
      const configContent = JSON.stringify({ defaults: { template: 'vue-vite' } });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config.defaults?.template).toBe('vue-vite');
    });

    it('config typescript: false is returned in defaults', () => {
      const configContent = JSON.stringify({ defaults: { typescript: false } });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config.defaults?.typescript).toBe(false);
    });

    it('empty defaults object is preserved', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce('{"defaults":{}}' as unknown as Buffer);

      const result = loadConfig(false);
      expect(result.config.defaults).toEqual({});
    });
  });
});
