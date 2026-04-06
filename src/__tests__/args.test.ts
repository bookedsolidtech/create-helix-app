import { describe, it, expect } from 'vitest';
import { parseArgs } from '../args.js';

// ---------------------------------------------------------------------------
// parseArgs — basic defaults
// ---------------------------------------------------------------------------

describe('parseArgs — defaults', () => {
  it('returns all defaults when given an empty argv', () => {
    const result = parseArgs([]);
    expect(result.subcommand).toBeNull();
    expect(result.subcommandArg).toBeNull();
    expect(result.projectName).toBeNull();
    expect(result.dryRun).toBe(false);
    expect(result.force).toBe(false);
    expect(result.noInstall).toBe(false);
    expect(result.quiet).toBe(false);
    expect(result.json).toBe(false);
    expect(result.isDrupal).toBe(false);
    expect(result.noConfig).toBe(false);
    expect(result.verbose).toBe(false);
    expect(result.skipAudit).toBe(false);
    expect(result.offline).toBe(false);
    expect(result.profile).toBeNull();
    expect(result.template).toBeNull();
    expect(result.preset).toBeNull();
    expect(result.bundles).toBeNull();
    expect(result.outputDir).toBeNull();
    expect(result.typescript).toBe(true);
    expect(result.eslint).toBe(true);
    expect(result.darkMode).toBe(true);
    expect(result.tokens).toBe(true);
    expect(result.showVersion).toBe(false);
    expect(result.showHelp).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseArgs — project name
// ---------------------------------------------------------------------------

describe('parseArgs — projectName', () => {
  it('captures the first positional argument as projectName', () => {
    expect(parseArgs(['my-app']).projectName).toBe('my-app');
  });

  it('does not capture a flag as projectName', () => {
    expect(parseArgs(['--dry-run']).projectName).toBeNull();
  });

  it('does not capture a subcommand as projectName', () => {
    expect(parseArgs(['list']).projectName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseArgs — meta flags
// ---------------------------------------------------------------------------

describe('parseArgs — --version / -v', () => {
  it('detects --version', () => {
    expect(parseArgs(['--version']).showVersion).toBe(true);
  });

  it('detects -v', () => {
    expect(parseArgs(['-v']).showVersion).toBe(true);
  });

  it('returns false when neither flag is present', () => {
    expect(parseArgs(['my-app']).showVersion).toBe(false);
  });
});

describe('parseArgs — --help / -h', () => {
  it('detects --help', () => {
    expect(parseArgs(['--help']).showHelp).toBe(true);
  });

  it('detects -h', () => {
    expect(parseArgs(['-h']).showHelp).toBe(true);
  });

  it('returns false when neither flag is present', () => {
    expect(parseArgs(['my-app']).showHelp).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseArgs — behavior flags
// ---------------------------------------------------------------------------

describe('parseArgs — --dry-run', () => {
  it('sets dryRun to true when --dry-run is present', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('leaves dryRun false when --dry-run is absent', () => {
    expect(parseArgs(['my-app']).dryRun).toBe(false);
  });
});

describe('parseArgs — --no-install', () => {
  it('sets noInstall to true when --no-install is present', () => {
    expect(parseArgs(['--no-install']).noInstall).toBe(true);
  });

  it('leaves noInstall false when absent', () => {
    expect(parseArgs(['my-app']).noInstall).toBe(false);
  });
});

describe('parseArgs — --force', () => {
  it('sets force to true when --force is present', () => {
    expect(parseArgs(['--force']).force).toBe(true);
  });
});

describe('parseArgs — --quiet / -q', () => {
  it('sets quiet to true with --quiet', () => {
    expect(parseArgs(['--quiet']).quiet).toBe(true);
  });

  it('sets quiet to true with -q', () => {
    expect(parseArgs(['-q']).quiet).toBe(true);
  });
});

describe('parseArgs — --json', () => {
  it('sets json to true when --json is present', () => {
    expect(parseArgs(['--json']).json).toBe(true);
  });
});

describe('parseArgs — --drupal', () => {
  it('sets isDrupal to true when --drupal is present', () => {
    expect(parseArgs(['--drupal']).isDrupal).toBe(true);
  });
});

describe('parseArgs — --verbose', () => {
  it('sets verbose to true when --verbose is present', () => {
    expect(parseArgs(['--verbose']).verbose).toBe(true);
  });
});

describe('parseArgs — --skip-audit', () => {
  it('sets skipAudit to true when --skip-audit is present', () => {
    expect(parseArgs(['--skip-audit']).skipAudit).toBe(true);
  });
});

describe('parseArgs — --offline', () => {
  it('sets offline to true when --offline is present', () => {
    expect(parseArgs(['--offline']).offline).toBe(true);
  });
});

describe('parseArgs — --no-config', () => {
  it('sets noConfig to true when --no-config is present', () => {
    expect(parseArgs(['--no-config']).noConfig).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseArgs — --profile
// ---------------------------------------------------------------------------

describe('parseArgs — --profile', () => {
  it('captures the profile value', () => {
    expect(parseArgs(['--profile', 'production']).profile).toBe('production');
  });

  it('returns null when --profile is absent', () => {
    expect(parseArgs(['my-app']).profile).toBeNull();
  });

  it('returns null when --profile has no value', () => {
    expect(parseArgs(['--profile']).profile).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseArgs — --template
// ---------------------------------------------------------------------------

describe('parseArgs — --template', () => {
  it('parses a valid template', () => {
    expect(parseArgs(['--template', 'react-next']).template).toBe('react-next');
  });

  it('returns null when --template is absent', () => {
    expect(parseArgs(['my-app']).template).toBeNull();
  });

  it('returns null when --template has no value', () => {
    // --template with no following value returns null (next token undefined)
    expect(parseArgs(['--template']).template).toBeNull();
  });

  it('throws for an invalid template value', () => {
    expect(() => parseArgs(['--template', 'django'])).toThrow(/Invalid template/);
  });

  it('includes the invalid template name in the error message', () => {
    expect(() => parseArgs(['--template', 'bad-framework'])).toThrow(/"bad-framework"/);
  });
});

// ---------------------------------------------------------------------------
// parseArgs — --preset
// ---------------------------------------------------------------------------

describe('parseArgs — --preset', () => {
  it('parses a valid preset', () => {
    expect(parseArgs(['--preset', 'blog']).preset).toBe('blog');
  });

  it('returns null when --preset is absent', () => {
    expect(parseArgs(['my-theme']).preset).toBeNull();
  });

  it('returns null when --preset has no value', () => {
    expect(parseArgs(['--preset']).preset).toBeNull();
  });

  it('throws for an invalid preset value', () => {
    expect(() => parseArgs(['--preset', 'enterprise'])).toThrow(/Invalid preset/);
  });

  it('includes the invalid preset name in the error message', () => {
    expect(() => parseArgs(['--preset', 'bad-preset'])).toThrow(/"bad-preset"/);
  });
});

// ---------------------------------------------------------------------------
// parseArgs — --bundles
// ---------------------------------------------------------------------------

describe('parseArgs — --bundles', () => {
  it('parses a single valid bundle', () => {
    expect(parseArgs(['--bundles', 'core']).bundles).toEqual(['core']);
  });

  it('parses multiple comma-separated bundles', () => {
    expect(parseArgs(['--bundles', 'core,forms']).bundles).toEqual(['core', 'forms']);
  });

  it('returns null when --bundles is absent', () => {
    expect(parseArgs(['my-app']).bundles).toBeNull();
  });

  it('throws for an invalid bundle value', () => {
    expect(() => parseArgs(['--bundles', 'invalid-bundle'])).toThrow(/Invalid bundle/);
  });
});

// ---------------------------------------------------------------------------
// parseArgs — --output-dir / -o
// ---------------------------------------------------------------------------

describe('parseArgs — --output-dir / -o', () => {
  it('captures the output directory with --output-dir', () => {
    expect(parseArgs(['--output-dir', './dist']).outputDir).toBe('./dist');
  });

  it('captures the output directory with -o', () => {
    expect(parseArgs(['-o', './build']).outputDir).toBe('./build');
  });

  it('returns null when neither flag is present', () => {
    expect(parseArgs(['my-app']).outputDir).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseArgs — boolean toggles (--no-*)
// ---------------------------------------------------------------------------

describe('parseArgs — boolean toggles', () => {
  it('typescript defaults to true', () => {
    expect(parseArgs([]).typescript).toBe(true);
  });

  it('--no-typescript sets typescript to false', () => {
    expect(parseArgs(['--no-typescript']).typescript).toBe(false);
  });

  it('--typescript sets typescript to true and marks it explicit', () => {
    const result = parseArgs(['--typescript']);
    expect(result.typescript).toBe(true);
    expect(result.explicitFlags.typescript).toBe(true);
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

// ---------------------------------------------------------------------------
// parseArgs — explicitFlags tracking
// ---------------------------------------------------------------------------

describe('parseArgs — explicitFlags', () => {
  it('no explicit flags by default', () => {
    const result = parseArgs([]);
    expect(result.explicitFlags.typescript).toBe(false);
    expect(result.explicitFlags.eslint).toBe(false);
    expect(result.explicitFlags.darkMode).toBe(false);
    expect(result.explicitFlags.tokens).toBe(false);
  });

  it('marks typescript as explicit when --no-typescript is provided', () => {
    expect(parseArgs(['--no-typescript']).explicitFlags.typescript).toBe(true);
  });

  it('marks eslint as explicit when --eslint is provided', () => {
    expect(parseArgs(['--eslint']).explicitFlags.eslint).toBe(true);
  });

  it('marks darkMode as explicit when --dark-mode is provided', () => {
    expect(parseArgs(['--dark-mode']).explicitFlags.darkMode).toBe(true);
  });

  it('marks tokens as explicit when --no-tokens is provided', () => {
    expect(parseArgs(['--no-tokens']).explicitFlags.tokens).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseArgs — subcommands
// ---------------------------------------------------------------------------

describe('parseArgs — subcommands', () => {
  it('detects the "list" subcommand', () => {
    expect(parseArgs(['list']).subcommand).toBe('list');
  });

  it('detects the "info" subcommand', () => {
    expect(parseArgs(['info', 'react-next']).subcommand).toBe('info');
  });

  it('detects the "doctor" subcommand', () => {
    expect(parseArgs(['doctor']).subcommand).toBe('doctor');
  });

  it('detects the "upgrade" subcommand', () => {
    expect(parseArgs(['upgrade']).subcommand).toBe('upgrade');
  });

  it('detects the "config" subcommand', () => {
    expect(parseArgs(['config', 'get']).subcommand).toBe('config');
  });

  it('returns null subcommand for a regular project name', () => {
    expect(parseArgs(['my-app']).subcommand).toBeNull();
  });

  it('captures subcommandArg for the "info" subcommand', () => {
    expect(parseArgs(['info', 'react-next']).subcommandArg).toBe('react-next');
  });

  it('captures subcommandArg for the "config" subcommand', () => {
    expect(parseArgs(['config', 'get']).subcommandArg).toBe('get');
  });

  it('returns null subcommandArg for subcommands that do not use it', () => {
    expect(parseArgs(['list']).subcommandArg).toBeNull();
    expect(parseArgs(['doctor']).subcommandArg).toBeNull();
    expect(parseArgs(['upgrade']).subcommandArg).toBeNull();
  });

  it('projectName is null when a subcommand is present', () => {
    expect(parseArgs(['list']).projectName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseArgs — combined / integration scenarios
// ---------------------------------------------------------------------------

describe('parseArgs — combined flags', () => {
  it('parses a typical project creation invocation', () => {
    const result = parseArgs(['my-project', '--template', 'react-next', '--no-install']);
    expect(result.projectName).toBe('my-project');
    expect(result.template).toBe('react-next');
    expect(result.noInstall).toBe(true);
  });

  it('parses a Drupal project invocation', () => {
    const result = parseArgs(['my-theme', '--drupal', '--preset', 'healthcare']);
    expect(result.projectName).toBe('my-theme');
    expect(result.isDrupal).toBe(true);
    expect(result.preset).toBe('healthcare');
  });

  it('version flag coexists with other flags without error', () => {
    const result = parseArgs(['--version', '--quiet']);
    expect(result.showVersion).toBe(true);
    expect(result.quiet).toBe(true);
  });

  it('help flag coexists with other flags without error', () => {
    const result = parseArgs(['--help', '--json']);
    expect(result.showHelp).toBe(true);
    expect(result.json).toBe(true);
  });
});
