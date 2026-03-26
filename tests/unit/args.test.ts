import { describe, it, expect } from 'vitest';
import { parseArgs, ParseArgsError } from '../../src/args.js';

describe('parseArgs', () => {
  describe('subcommand detection', () => {
    it('detects list subcommand', () => {
      const result = parseArgs(['list']);
      expect(result.subcommand).toBe('list');
    });

    it('detects info subcommand', () => {
      const result = parseArgs(['info']);
      expect(result.subcommand).toBe('info');
    });

    it('returns null subcommand when no subcommand is present', () => {
      const result = parseArgs(['my-app', '--template', 'react-next']);
      expect(result.subcommand).toBeNull();
    });

    it('captures subcommandArg for positional after subcommand', () => {
      const result = parseArgs(['info', 'react-next']);
      expect(result.subcommand).toBe('info');
      expect(result.subcommandArg).toBe('react-next');
    });

    it('does not capture flag as subcommandArg', () => {
      const result = parseArgs(['list', '--json']);
      expect(result.subcommandArg).toBeNull();
    });
  });

  describe('showVersion', () => {
    it('detects --version flag', () => {
      expect(parseArgs(['--version']).showVersion).toBe(true);
    });

    it('detects -v short flag', () => {
      expect(parseArgs(['-v']).showVersion).toBe(true);
    });

    it('is false when neither --version nor -v is present', () => {
      expect(parseArgs(['my-app']).showVersion).toBe(false);
    });
  });

  describe('showHelp', () => {
    it('detects --help flag', () => {
      expect(parseArgs(['--help']).showHelp).toBe(true);
    });

    it('detects -h short flag', () => {
      expect(parseArgs(['-h']).showHelp).toBe(true);
    });

    it('is false when neither --help nor -h is present', () => {
      expect(parseArgs(['my-app']).showHelp).toBe(false);
    });
  });

  describe('projectName', () => {
    it('returns first arg as projectName when no subcommand', () => {
      expect(parseArgs(['my-app']).projectName).toBe('my-app');
    });

    it('returns null projectName when subcommand is set', () => {
      expect(parseArgs(['list']).projectName).toBeNull();
    });

    it('returns null projectName when no args', () => {
      expect(parseArgs([]).projectName).toBeNull();
    });
  });

  describe('boolean flags', () => {
    it('detects --dry-run', () => {
      expect(parseArgs(['--dry-run']).dryRun).toBe(true);
    });

    it('dryRun defaults to false', () => {
      expect(parseArgs([]).dryRun).toBe(false);
    });

    it('detects --force', () => {
      expect(parseArgs(['--force']).force).toBe(true);
    });

    it('force defaults to false', () => {
      expect(parseArgs([]).force).toBe(false);
    });

    it('detects --no-install', () => {
      expect(parseArgs(['--no-install']).noInstall).toBe(true);
    });

    it('noInstall defaults to false', () => {
      expect(parseArgs([]).noInstall).toBe(false);
    });

    it('detects --quiet', () => {
      expect(parseArgs(['--quiet']).quiet).toBe(true);
    });

    it('detects -q short flag', () => {
      expect(parseArgs(['-q']).quiet).toBe(true);
    });

    it('quiet defaults to false', () => {
      expect(parseArgs([]).quiet).toBe(false);
    });

    it('detects --json', () => {
      expect(parseArgs(['--json']).json).toBe(true);
    });

    it('json defaults to false', () => {
      expect(parseArgs([]).json).toBe(false);
    });

    it('detects --drupal', () => {
      expect(parseArgs(['--drupal']).isDrupal).toBe(true);
    });

    it('isDrupal defaults to false', () => {
      expect(parseArgs([]).isDrupal).toBe(false);
    });
  });

  describe('boolean toggle flags', () => {
    it('typescript defaults to true', () => {
      expect(parseArgs([]).typescript).toBe(true);
    });

    it('--no-typescript sets typescript to false', () => {
      expect(parseArgs(['--no-typescript']).typescript).toBe(false);
    });

    it('eslint defaults to true', () => {
      expect(parseArgs([]).eslint).toBe(true);
    });

    it('--no-eslint sets eslint to false', () => {
      expect(parseArgs(['--no-eslint']).eslint).toBe(false);
    });

    it('darkMode defaults to true', () => {
      expect(parseArgs([]).darkMode).toBe(true);
    });

    it('--no-dark-mode sets darkMode to false', () => {
      expect(parseArgs(['--no-dark-mode']).darkMode).toBe(false);
    });

    it('tokens defaults to true', () => {
      expect(parseArgs([]).tokens).toBe(true);
    });

    it('--no-tokens sets tokens to false', () => {
      expect(parseArgs(['--no-tokens']).tokens).toBe(false);
    });
  });

  describe('--template flag', () => {
    it('parses a valid template', () => {
      expect(parseArgs(['--template', 'react-next']).template).toBe('react-next');
    });

    it('returns null when --template is not provided', () => {
      expect(parseArgs([]).template).toBeNull();
    });

    it('returns null when --template has no value', () => {
      expect(parseArgs(['--template']).template).toBeNull();
    });

    it('throws ParseArgsError for invalid template', () => {
      expect(() => parseArgs(['--template', 'invalid-fw'])).toThrow(ParseArgsError);
      expect(() => parseArgs(['--template', 'invalid-fw'])).toThrow('"invalid-fw"');
    });

    it('error message includes valid options', () => {
      try {
        parseArgs(['--template', 'bad']);
      } catch (err) {
        expect(err).toBeInstanceOf(ParseArgsError);
        expect((err as ParseArgsError).message).toContain('Valid options:');
        expect((err as ParseArgsError).message).toContain('react-next');
      }
    });
  });

  describe('--preset flag', () => {
    it('parses a valid preset', () => {
      expect(parseArgs(['--preset', 'blog']).preset).toBe('blog');
    });

    it('returns null when --preset is not provided', () => {
      expect(parseArgs([]).preset).toBeNull();
    });

    it('returns null when --preset has no value', () => {
      expect(parseArgs(['--preset']).preset).toBeNull();
    });

    it('throws ParseArgsError for invalid preset', () => {
      expect(() => parseArgs(['--preset', 'invalid-preset'])).toThrow(ParseArgsError);
      expect(() => parseArgs(['--preset', 'invalid-preset'])).toThrow('"invalid-preset"');
    });

    it('accepts all valid presets without throwing', () => {
      for (const preset of ['standard', 'blog', 'healthcare', 'intranet']) {
        expect(() => parseArgs(['--preset', preset])).not.toThrow();
      }
    });
  });

  describe('--bundles flag', () => {
    it('parses valid bundles as an array', () => {
      const result = parseArgs(['--bundles', 'core,forms']);
      expect(result.bundles).toEqual(['core', 'forms']);
    });

    it('returns null when --bundles is not provided', () => {
      expect(parseArgs([]).bundles).toBeNull();
    });

    it('throws ParseArgsError for invalid bundle', () => {
      expect(() => parseArgs(['--bundles', 'bad-bundle'])).toThrow(ParseArgsError);
      expect(() => parseArgs(['--bundles', 'bad-bundle'])).toThrow('"bad-bundle"');
    });

    it('throws listing all invalid bundles when mix provided', () => {
      try {
        parseArgs(['--bundles', 'core,bad-one,forms,bad-two']);
      } catch (err) {
        expect(err).toBeInstanceOf(ParseArgsError);
        expect((err as ParseArgsError).message).toContain('"bad-one"');
        expect((err as ParseArgsError).message).toContain('"bad-two"');
        expect((err as ParseArgsError).message).not.toContain('"core"');
        expect((err as ParseArgsError).message).not.toContain('"forms"');
      }
    });

    it('accepts all valid bundles without throwing', () => {
      expect(() =>
        parseArgs(['--bundles', 'all,core,forms,navigation,data-display,feedback,layout']),
      ).not.toThrow();
    });
  });

  describe('--output-dir / -o flag', () => {
    it('parses --output-dir value', () => {
      expect(parseArgs(['--output-dir', './projects']).outputDir).toBe('./projects');
    });

    it('parses -o short flag', () => {
      expect(parseArgs(['-o', '/custom/path']).outputDir).toBe('/custom/path');
    });

    it('returns null when not provided', () => {
      expect(parseArgs([]).outputDir).toBeNull();
    });

    it('returns null when --output-dir has no value', () => {
      expect(parseArgs(['--output-dir']).outputDir).toBeNull();
    });
  });

  describe('flag combinations', () => {
    it('parses multiple flags together', () => {
      const result = parseArgs([
        'my-app',
        '--template',
        'react-vite',
        '--dry-run',
        '--quiet',
        '--no-install',
        '--no-typescript',
      ]);
      expect(result.projectName).toBe('my-app');
      expect(result.template).toBe('react-vite');
      expect(result.dryRun).toBe(true);
      expect(result.quiet).toBe(true);
      expect(result.noInstall).toBe(true);
      expect(result.typescript).toBe(false);
    });

    it('--quiet is compatible with --dry-run', () => {
      const result = parseArgs(['--quiet', '--dry-run']);
      expect(result.quiet).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    it('--drupal with --preset does not throw', () => {
      const result = parseArgs(['--drupal', '--preset', 'blog']);
      expect(result.isDrupal).toBe(true);
      expect(result.preset).toBe('blog');
    });
  });
});
