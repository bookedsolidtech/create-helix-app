import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/args.js';
import { TEMPLATES, COMPONENT_BUNDLES } from '../../src/templates.js';
import type { Framework, ComponentBundle } from '../../src/types.js';

const validFrameworks = TEMPLATES.map((t) => t.id as Framework);
const validBundles = COMPONENT_BUNDLES.map((b) => b.id as ComponentBundle);

describe('parseArgs', () => {
  describe('subcommand detection', () => {
    it('detects list subcommand', () => {
      const parsed = parseArgs(['list']);
      expect(parsed.subcommand).toBe('list');
    });

    it('detects info subcommand', () => {
      const parsed = parseArgs(['info', 'react-next']);
      expect(parsed.subcommand).toBe('info');
    });

    it('extracts subcommandArg for info', () => {
      const parsed = parseArgs(['info', 'react-next']);
      expect(parsed.subcommandArg).toBe('react-next');
    });

    it('subcommandArg is null when info has no argument', () => {
      const parsed = parseArgs(['info']);
      expect(parsed.subcommandArg).toBeNull();
    });

    it('subcommandArg ignores flags for info', () => {
      const parsed = parseArgs(['info', '--json', 'react-next']);
      expect(parsed.subcommandArg).toBe('react-next');
    });

    it('subcommand is null with no subcommand', () => {
      const parsed = parseArgs(['my-app', '--template', 'react-next']);
      expect(parsed.subcommand).toBeNull();
    });

    it('subcommandArg is null when not info subcommand', () => {
      const parsed = parseArgs(['list', '--json']);
      expect(parsed.subcommandArg).toBeNull();
    });
  });

  describe('projectName', () => {
    it('extracts project name from first arg', () => {
      const parsed = parseArgs(['my-app', '--template', 'react-next']);
      expect(parsed.projectName).toBe('my-app');
    });

    it('projectName is null when first arg is a flag', () => {
      const parsed = parseArgs(['--template', 'react-next']);
      expect(parsed.projectName).toBeNull();
    });

    it('projectName is null when no args', () => {
      const parsed = parseArgs([]);
      expect(parsed.projectName).toBeNull();
    });

    it('projectName is null when subcommand is first arg', () => {
      const parsed = parseArgs(['list']);
      expect(parsed.projectName).toBeNull();
    });
  });

  describe('--version / -v flag', () => {
    it('detects --version flag', () => {
      expect(parseArgs(['--version']).showVersion).toBe(true);
    });

    it('detects -v short flag', () => {
      expect(parseArgs(['-v']).showVersion).toBe(true);
    });

    it('showVersion is false when not present', () => {
      expect(parseArgs(['my-app']).showVersion).toBe(false);
    });
  });

  describe('--help / -h flag', () => {
    it('detects --help flag', () => {
      expect(parseArgs(['--help']).showHelp).toBe(true);
    });

    it('detects -h short flag', () => {
      expect(parseArgs(['-h']).showHelp).toBe(true);
    });

    it('showHelp is false when not present', () => {
      expect(parseArgs(['my-app']).showHelp).toBe(false);
    });
  });

  describe('--dry-run flag', () => {
    it('detects --dry-run', () => {
      expect(parseArgs(['my-app', '--dry-run']).dryRun).toBe(true);
    });

    it('dryRun is false when not present', () => {
      expect(parseArgs(['my-app']).dryRun).toBe(false);
    });
  });

  describe('--force flag', () => {
    it('detects --force', () => {
      expect(parseArgs(['my-app', '--force']).force).toBe(true);
    });

    it('force is false when not present', () => {
      expect(parseArgs(['my-app']).force).toBe(false);
    });
  });

  describe('--no-install flag', () => {
    it('detects --no-install', () => {
      expect(parseArgs(['my-app', '--no-install']).noInstall).toBe(true);
    });

    it('noInstall is false when not present', () => {
      expect(parseArgs(['my-app']).noInstall).toBe(false);
    });
  });

  describe('--quiet / -q flag', () => {
    it('detects --quiet', () => {
      expect(parseArgs(['my-app', '--quiet']).quiet).toBe(true);
    });

    it('detects -q short flag', () => {
      expect(parseArgs(['my-app', '-q']).quiet).toBe(true);
    });

    it('quiet is false when not present', () => {
      expect(parseArgs(['my-app']).quiet).toBe(false);
    });
  });

  describe('--verbose flag', () => {
    it('detects --verbose', () => {
      expect(parseArgs(['my-app', '--verbose']).verbose).toBe(true);
    });

    it('verbose is false when not present', () => {
      expect(parseArgs(['my-app']).verbose).toBe(false);
    });

    it('verbose works with other flags', () => {
      const parsed = parseArgs(['my-app', '--verbose', '--template', 'react-next']);
      expect(parsed.verbose).toBe(true);
      expect(parsed.template).toBe('react-next');
    });
  });

  describe('--json flag', () => {
    it('detects --json', () => {
      expect(parseArgs(['my-app', '--json']).json).toBe(true);
    });

    it('json is false when not present', () => {
      expect(parseArgs(['my-app']).json).toBe(false);
    });
  });

  describe('--drupal flag', () => {
    it('detects --drupal', () => {
      expect(parseArgs(['my-theme', '--drupal']).isDrupal).toBe(true);
    });

    it('isDrupal is false when not present', () => {
      expect(parseArgs(['my-app']).isDrupal).toBe(false);
    });
  });

  describe('boolean toggles (--no-* flags)', () => {
    it('typescript defaults to true', () => {
      expect(parseArgs(['my-app']).typescript).toBe(true);
    });

    it('--no-typescript sets typescript to false', () => {
      expect(parseArgs(['my-app', '--no-typescript']).typescript).toBe(false);
    });

    it('eslint defaults to true', () => {
      expect(parseArgs(['my-app']).eslint).toBe(true);
    });

    it('--no-eslint sets eslint to false', () => {
      expect(parseArgs(['my-app', '--no-eslint']).eslint).toBe(false);
    });

    it('darkMode defaults to true', () => {
      expect(parseArgs(['my-app']).darkMode).toBe(true);
    });

    it('--no-dark-mode sets darkMode to false', () => {
      expect(parseArgs(['my-app', '--no-dark-mode']).darkMode).toBe(false);
    });

    it('tokens defaults to true', () => {
      expect(parseArgs(['my-app']).tokens).toBe(true);
    });

    it('--no-tokens sets tokens to false', () => {
      expect(parseArgs(['my-app', '--no-tokens']).tokens).toBe(false);
    });
  });

  describe('--template flag', () => {
    it('parses a valid template', () => {
      const parsed = parseArgs(['my-app', '--template', 'react-next']);
      expect(parsed.template).toBe('react-next');
    });

    it('template is null when not provided', () => {
      expect(parseArgs(['my-app']).template).toBeNull();
    });

    it('template is null when --template has no value', () => {
      expect(parseArgs(['my-app', '--template']).template).toBeNull();
    });

    it('throws for invalid template', () => {
      expect(() => parseArgs(['my-app', '--template', 'invalid-framework'])).toThrow(
        /Invalid template/,
      );
    });

    it('error message includes the invalid template name', () => {
      expect(() => parseArgs(['my-app', '--template', 'bad-template'])).toThrow('"bad-template"');
    });

    it('error message includes valid options', () => {
      try {
        parseArgs(['my-app', '--template', 'bad']);
        expect.fail('should have thrown');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        validFrameworks.forEach((fw) => {
          expect(message).toContain(fw);
        });
      }
    });

    it('accepts all valid framework names without throwing', () => {
      validFrameworks.forEach((fw) => {
        expect(() => parseArgs(['my-app', '--template', fw])).not.toThrow();
      });
    });
  });

  describe('--preset flag', () => {
    it('parses a valid preset', () => {
      const parsed = parseArgs(['my-theme', '--preset', 'blog']);
      expect(parsed.preset).toBe('blog');
    });

    it('preset is null when not provided', () => {
      expect(parseArgs(['my-app']).preset).toBeNull();
    });

    it('preset is null when --preset has no value', () => {
      expect(parseArgs(['my-app', '--preset']).preset).toBeNull();
    });

    it('throws for invalid preset', () => {
      expect(() => parseArgs(['my-theme', '--preset', 'not-a-preset'])).toThrow(/Invalid preset/);
    });

    it('accepts all valid preset names without throwing', () => {
      ['standard', 'blog', 'healthcare', 'intranet'].forEach((preset) => {
        expect(() => parseArgs(['my-theme', '--preset', preset])).not.toThrow();
      });
    });
  });

  describe('--bundles flag', () => {
    it('parses valid bundles', () => {
      const parsed = parseArgs(['my-app', '--bundles', 'core,forms']);
      expect(parsed.bundles).toEqual(['core', 'forms']);
    });

    it('bundles is null when not provided', () => {
      expect(parseArgs(['my-app']).bundles).toBeNull();
    });

    it('throws for invalid bundle', () => {
      expect(() => parseArgs(['my-app', '--bundles', 'invalid-bundle'])).toThrow(/Invalid bundle/);
    });

    it('error message includes the invalid bundle name', () => {
      expect(() => parseArgs(['my-app', '--bundles', 'bad-bundle'])).toThrow('"bad-bundle"');
    });

    it('throws listing all invalid bundles in a mix', () => {
      try {
        parseArgs(['my-app', '--bundles', 'core,bad-bundle,forms,another-bad']);
        expect.fail('should have thrown');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain('"bad-bundle"');
        expect(message).toContain('"another-bad"');
        expect(message).not.toContain('"core"');
        expect(message).not.toContain('"forms"');
      }
    });

    it('accepts all valid bundle names', () => {
      const allBundles = validBundles.join(',');
      expect(() => parseArgs(['my-app', '--bundles', allBundles])).not.toThrow();
    });
  });

  describe('--output-dir / -o flag', () => {
    it('parses --output-dir value', () => {
      const parsed = parseArgs(['my-app', '--output-dir', './projects']);
      expect(parsed.outputDir).toBe('./projects');
    });

    it('parses -o short flag', () => {
      const parsed = parseArgs(['my-app', '-o', '/custom/path']);
      expect(parsed.outputDir).toBe('/custom/path');
    });

    it('outputDir is null when not provided', () => {
      expect(parseArgs(['my-app']).outputDir).toBeNull();
    });

    it('outputDir is null when --output-dir has no value', () => {
      expect(parseArgs(['my-app', '--output-dir']).outputDir).toBeNull();
    });
  });

  describe('flag combinations', () => {
    it('parses multiple flags together', () => {
      const parsed = parseArgs([
        'my-app',
        '--template',
        'react-next',
        '--dry-run',
        '--force',
        '--no-install',
        '--quiet',
        '--no-typescript',
        '--no-eslint',
      ]);
      expect(parsed.projectName).toBe('my-app');
      expect(parsed.template).toBe('react-next');
      expect(parsed.dryRun).toBe(true);
      expect(parsed.force).toBe(true);
      expect(parsed.noInstall).toBe(true);
      expect(parsed.quiet).toBe(true);
      expect(parsed.typescript).toBe(false);
      expect(parsed.eslint).toBe(false);
      expect(parsed.darkMode).toBe(true);
      expect(parsed.tokens).toBe(true);
    });

    it('json mode with template and bundles', () => {
      const parsed = parseArgs([
        'my-app',
        '--json',
        '--template',
        'vue-vite',
        '--bundles',
        'core,navigation',
      ]);
      expect(parsed.json).toBe(true);
      expect(parsed.template).toBe('vue-vite');
      expect(parsed.bundles).toEqual(['core', 'navigation']);
    });

    it('drupal mode with preset', () => {
      const parsed = parseArgs(['my-theme', '--drupal', '--preset', 'blog', '--quiet']);
      expect(parsed.isDrupal).toBe(true);
      expect(parsed.preset).toBe('blog');
      expect(parsed.quiet).toBe(true);
    });

    it('list subcommand with --json', () => {
      const parsed = parseArgs(['list', '--json']);
      expect(parsed.subcommand).toBe('list');
      expect(parsed.json).toBe(true);
    });

    it('unknown flags do not cause errors', () => {
      expect(() =>
        parseArgs(['my-app', '--unknown-flag', '--another-unknown', '--template', 'react-next']),
      ).not.toThrow();
    });
  });
});
