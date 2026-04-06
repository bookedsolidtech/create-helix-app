import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { loadConfig, listProfiles } from '../../src/config.js';
import { parseArgs } from '../../src/args.js';
import { logger } from '../../src/logger.js';

describe('Named config profiles', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(fs, 'readFileSync');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Profile merging with defaults ────────────────────────────────────────────

  describe('profile merging with defaults', () => {
    it('merges profile values over the default section', () => {
      const configContent = JSON.stringify({
        defaults: { template: 'react-vite', typescript: false },
        profiles: {
          'team-frontend': { template: 'react-next', typescript: true },
        },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false, 'team-frontend');
      expect(result.config.defaults?.template).toBe('react-next');
      expect(result.config.defaults?.typescript).toBe(true);
    });

    it('keeps default values not overridden by the profile', () => {
      const configContent = JSON.stringify({
        defaults: { template: 'react-vite', eslint: false, darkMode: true },
        profiles: {
          'team-frontend': { template: 'react-next' },
        },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false, 'team-frontend');
      expect(result.config.defaults?.template).toBe('react-next');
      expect(result.config.defaults?.eslint).toBe(false);
      expect(result.config.defaults?.darkMode).toBe(true);
    });

    it('profile bundles override default bundles', () => {
      const configContent = JSON.stringify({
        defaults: { bundles: ['core'] },
        profiles: {
          'team-frontend': { bundles: ['core', 'forms'] },
        },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false, 'team-frontend');
      expect(result.config.defaults?.bundles).toEqual(['core', 'forms']);
    });

    it('profile with no defaults section still applies profile values', () => {
      const configContent = JSON.stringify({
        profiles: {
          'team-drupal': { typescript: true },
        },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false, 'team-drupal');
      expect(result.config.defaults?.typescript).toBe(true);
    });

    it('returns the config file path when a profile is loaded', () => {
      const configContent = JSON.stringify({
        defaults: { template: 'react-vite' },
        profiles: { myprofile: { template: 'vue-vite' } },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false, 'myprofile');
      expect(result.configFile).toContain('.helixrc.json');
    });

    it('loads config without profile when profileName is undefined', () => {
      const configContent = JSON.stringify({
        defaults: { template: 'react-vite' },
        profiles: { myprofile: { template: 'vue-vite' } },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const result = loadConfig(false);
      // Raw config returned — profiles key preserved, defaults not merged
      expect(result.config.defaults?.template).toBe('react-vite');
      expect(result.config.profiles).toBeDefined();
    });
  });

  // ─── Unknown profile error ────────────────────────────────────────────────────

  describe('unknown profile error', () => {
    it('throws an error when the requested profile does not exist', () => {
      const configContent = JSON.stringify({
        defaults: { template: 'react-vite' },
        profiles: { 'team-frontend': { template: 'react-next' } },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      expect(() => loadConfig(false, 'nonexistent-profile')).toThrow(
        'Unknown profile: nonexistent-profile',
      );
    });

    it('error message includes the requested profile name', () => {
      const configContent = JSON.stringify({
        profiles: { existing: { typescript: true } },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      expect(() => loadConfig(false, 'bad-profile')).toThrow('bad-profile');
    });

    it('throws when profiles map is empty and a profile name is requested', () => {
      const configContent = JSON.stringify({ profiles: {} });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      expect(() => loadConfig(false, 'any-profile')).toThrow('Unknown profile: any-profile');
    });

    it('throws when no profiles key exists and a profile name is requested', () => {
      const configContent = JSON.stringify({ defaults: { template: 'react-vite' } });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      expect(() => loadConfig(false, 'any-profile')).toThrow('Unknown profile: any-profile');
    });
  });

  // ─── --profile flag in CLI args ───────────────────────────────────────────────

  describe('--profile flag', () => {
    it('parseArgs recognises --profile and extracts the profile name', () => {
      const parsed = parseArgs([
        'my-app',
        '--profile',
        'team-frontend',
        '--template',
        'react-vite',
      ]);
      expect(parsed.profile).toBe('team-frontend');
    });

    it('profile is null when --profile flag is not provided', () => {
      const parsed = parseArgs(['my-app', '--template', 'react-vite']);
      expect(parsed.profile).toBeNull();
    });

    it('profile is null when --profile flag has no value', () => {
      const parsed = parseArgs(['my-app', '--profile']);
      expect(parsed.profile).toBeNull();
    });

    it('--profile can be combined with other flags', () => {
      const parsed = parseArgs(['my-app', '--profile', 'team-drupal', '--no-install', '--dry-run']);
      expect(parsed.profile).toBe('team-drupal');
      expect(parsed.noInstall).toBe(true);
      expect(parsed.dryRun).toBe(true);
    });
  });

  // ─── list-profiles output ────────────────────────────────────────────────────

  describe('listProfiles', () => {
    it('returns profile names from .helixrc.json', () => {
      const configContent = JSON.stringify({
        profiles: {
          'team-frontend': { template: 'react-vite' },
          'team-drupal': { typescript: true },
        },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const profiles = listProfiles();
      expect(profiles).toEqual(['team-frontend', 'team-drupal']);
    });

    it('returns empty array when no profiles key exists', () => {
      const configContent = JSON.stringify({ defaults: { template: 'react-vite' } });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const profiles = listProfiles();
      expect(profiles).toEqual([]);
    });

    it('returns empty array when profiles map is empty', () => {
      const configContent = JSON.stringify({ profiles: {} });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const profiles = listProfiles();
      expect(profiles).toEqual([]);
    });

    it('returns empty array when no config file exists', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const profiles = listProfiles();
      expect(profiles).toEqual([]);
    });

    it('returns an array of strings (profile names)', () => {
      const configContent = JSON.stringify({
        profiles: { alpha: {}, beta: {}, gamma: {} },
      });
      vi.mocked(fs.readFileSync).mockReturnValueOnce(configContent as unknown as Buffer);

      const profiles = listProfiles();
      expect(profiles).toHaveLength(3);
      expect(profiles).toContain('alpha');
      expect(profiles).toContain('beta');
      expect(profiles).toContain('gamma');
    });
  });
});
