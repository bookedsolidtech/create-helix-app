import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/args.js';

// ─── Subcommands ───────────────────────────────────────────────────────────────

describe('subcommand detection', () => {
  it('detects doctor subcommand', () => {
    const result = parseArgs(['doctor']);
    expect(result.subcommand).toBe('doctor');
    expect(result.projectName).toBeNull();
  });

  it('detects upgrade subcommand', () => {
    const result = parseArgs(['upgrade']);
    expect(result.subcommand).toBe('upgrade');
    expect(result.projectName).toBeNull();
  });

  it('detects list subcommand and sets no projectName', () => {
    const result = parseArgs(['list']);
    expect(result.subcommand).toBe('list');
    expect(result.projectName).toBeNull();
  });

  it('detects info subcommand and captures subcommandArg', () => {
    const result = parseArgs(['info', 'vue-vite']);
    expect(result.subcommand).toBe('info');
    expect(result.subcommandArg).toBe('vue-vite');
  });

  it('subcommandArg is null for doctor', () => {
    const result = parseArgs(['doctor']);
    expect(result.subcommandArg).toBeNull();
  });

  it('subcommandArg is null for upgrade', () => {
    const result = parseArgs(['upgrade']);
    expect(result.subcommandArg).toBeNull();
  });

  it('subcommandArg is null for list', () => {
    const result = parseArgs(['list']);
    expect(result.subcommandArg).toBeNull();
  });

  it('unknown first arg that is not a subcommand becomes projectName', () => {
    const result = parseArgs(['my-project']);
    expect(result.subcommand).toBeNull();
    expect(result.projectName).toBe('my-project');
  });
});

// ─── --template flag ──────────────────────────────────────────────────────────

describe('--template flag', () => {
  it('--template react-next sets template', () => {
    const result = parseArgs(['--template', 'react-next']);
    expect(result.template).toBe('react-next');
  });

  it('--template vue-vite sets template', () => {
    const result = parseArgs(['--template', 'vue-vite']);
    expect(result.template).toBe('vue-vite');
  });

  it('--template svelte-kit sets template', () => {
    const result = parseArgs(['--template', 'svelte-kit']);
    expect(result.template).toBe('svelte-kit');
  });

  it('throws on invalid template value', () => {
    expect(() => parseArgs(['--template', 'not-a-framework'])).toThrow(/Invalid template/);
  });

  it('template is null when --template flag is absent', () => {
    const result = parseArgs(['my-app']);
    expect(result.template).toBeNull();
  });
});

// ─── --preset flag ────────────────────────────────────────────────────────────

describe('--preset flag', () => {
  it('--preset standard sets preset', () => {
    const result = parseArgs(['--preset', 'standard']);
    expect(result.preset).toBe('standard');
  });

  it('--preset blog sets preset', () => {
    const result = parseArgs(['--preset', 'blog']);
    expect(result.preset).toBe('blog');
  });

  it('--preset healthcare sets preset', () => {
    const result = parseArgs(['--preset', 'healthcare']);
    expect(result.preset).toBe('healthcare');
  });

  it('--preset intranet sets preset', () => {
    const result = parseArgs(['--preset', 'intranet']);
    expect(result.preset).toBe('intranet');
  });

  it('throws on invalid preset value', () => {
    expect(() => parseArgs(['--preset', 'not-a-preset'])).toThrow(/Invalid preset/);
  });

  it('preset is null when --preset flag is absent', () => {
    const result = parseArgs(['my-app']);
    expect(result.preset).toBeNull();
  });
});

// ─── --output-dir / -o flag ───────────────────────────────────────────────────

describe('--output-dir / -o flag', () => {
  it('--output-dir ./my-app sets outputDir', () => {
    const result = parseArgs(['--output-dir', './my-app']);
    expect(result.outputDir).toBe('./my-app');
  });

  it('-o ./my-app short flag sets outputDir', () => {
    const result = parseArgs(['-o', './my-app']);
    expect(result.outputDir).toBe('./my-app');
  });

  it('outputDir is null when neither flag is present', () => {
    const result = parseArgs(['my-app']);
    expect(result.outputDir).toBeNull();
  });
});

// ─── Boolean behavior flags ───────────────────────────────────────────────────

describe('--dry-run flag', () => {
  it('--dry-run sets dryRun to true', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('dryRun is false by default', () => {
    expect(parseArgs([]).dryRun).toBe(false);
  });
});

describe('--no-install flag', () => {
  it('--no-install sets noInstall to true', () => {
    expect(parseArgs(['--no-install']).noInstall).toBe(true);
  });

  it('noInstall is false by default', () => {
    expect(parseArgs([]).noInstall).toBe(false);
  });
});

describe('--no-config flag', () => {
  it('--no-config sets noConfig to true', () => {
    expect(parseArgs(['--no-config']).noConfig).toBe(true);
  });

  it('noConfig is false by default', () => {
    expect(parseArgs([]).noConfig).toBe(false);
  });
});

describe('--force flag', () => {
  it('--force sets force to true', () => {
    expect(parseArgs(['--force']).force).toBe(true);
  });

  it('force is false by default', () => {
    expect(parseArgs([]).force).toBe(false);
  });
});

describe('--json flag', () => {
  it('--json sets json to true', () => {
    expect(parseArgs(['--json']).json).toBe(true);
  });

  it('json is false by default', () => {
    expect(parseArgs([]).json).toBe(false);
  });
});

describe('--verbose flag', () => {
  it('--verbose sets verbose to true', () => {
    expect(parseArgs(['--verbose']).verbose).toBe(true);
  });

  it('verbose is false by default', () => {
    expect(parseArgs([]).verbose).toBe(false);
  });
});

// ─── --version / -v flag ──────────────────────────────────────────────────────

describe('--version / -v flag', () => {
  it('--version sets showVersion to true', () => {
    expect(parseArgs(['--version']).showVersion).toBe(true);
  });

  it('-v short flag sets showVersion to true', () => {
    expect(parseArgs(['-v']).showVersion).toBe(true);
  });

  it('showVersion is false by default', () => {
    expect(parseArgs([]).showVersion).toBe(false);
  });
});

// ─── --help / -h flag ─────────────────────────────────────────────────────────

describe('--help / -h flag', () => {
  it('--help sets showHelp to true', () => {
    expect(parseArgs(['--help']).showHelp).toBe(true);
  });

  it('-h short flag sets showHelp to true', () => {
    expect(parseArgs(['-h']).showHelp).toBe(true);
  });

  it('showHelp is false by default', () => {
    expect(parseArgs([]).showHelp).toBe(false);
  });
});

// ─── Unknown flags ────────────────────────────────────────────────────────────

describe('unknown flags', () => {
  it('unknown flag does not throw', () => {
    expect(() => parseArgs(['--totally-unknown-flag'])).not.toThrow();
  });

  it('multiple unknown flags do not crash', () => {
    expect(() =>
      parseArgs(['my-app', '--unknown-one', '--unknown-two', '--template', 'react-next']),
    ).not.toThrow();
  });

  it('unknown flag after a known flag is ignored silently', () => {
    const result = parseArgs(['my-app', '--dry-run', '--unknown-flag']);
    expect(result.dryRun).toBe(true);
    expect(result.projectName).toBe('my-app');
  });
});

// ─── Positional arg as project name ──────────────────────────────────────────

describe('positional project name', () => {
  it('first positional arg is captured as projectName', () => {
    const result = parseArgs(['my-app']);
    expect(result.projectName).toBe('my-app');
  });

  it('project name with hyphens is preserved', () => {
    const result = parseArgs(['my-awesome-app']);
    expect(result.projectName).toBe('my-awesome-app');
  });

  it('projectName is null when first arg starts with --', () => {
    const result = parseArgs(['--dry-run']);
    expect(result.projectName).toBeNull();
  });

  it('projectName is null with empty args', () => {
    const result = parseArgs([]);
    expect(result.projectName).toBeNull();
  });
});

// ─── Combined flags ───────────────────────────────────────────────────────────

describe('combined flags', () => {
  it('my-app --template react-next --dry-run --no-install all parse correctly', () => {
    const result = parseArgs(['my-app', '--template', 'react-next', '--dry-run', '--no-install']);
    expect(result.projectName).toBe('my-app');
    expect(result.template).toBe('react-next');
    expect(result.dryRun).toBe(true);
    expect(result.noInstall).toBe(true);
  });

  it('full combination: name + template + preset + output-dir + dry-run', () => {
    const result = parseArgs([
      'my-theme',
      '--template',
      'vanilla',
      '--preset',
      'blog',
      '--output-dir',
      './dist',
      '--dry-run',
      '--verbose',
      '--json',
    ]);
    expect(result.projectName).toBe('my-theme');
    expect(result.template).toBe('vanilla');
    expect(result.preset).toBe('blog');
    expect(result.outputDir).toBe('./dist');
    expect(result.dryRun).toBe(true);
    expect(result.verbose).toBe(true);
    expect(result.json).toBe(true);
  });

  it('empty args returns all defaults', () => {
    const result = parseArgs([]);
    expect(result.subcommand).toBeNull();
    expect(result.subcommandArg).toBeNull();
    expect(result.projectName).toBeNull();
    expect(result.template).toBeNull();
    expect(result.preset).toBeNull();
    expect(result.bundles).toBeNull();
    expect(result.outputDir).toBeNull();
    expect(result.dryRun).toBe(false);
    expect(result.force).toBe(false);
    expect(result.noInstall).toBe(false);
    expect(result.quiet).toBe(false);
    expect(result.json).toBe(false);
    expect(result.isDrupal).toBe(false);
    expect(result.noConfig).toBe(false);
    expect(result.verbose).toBe(false);
    expect(result.typescript).toBe(true);
    expect(result.eslint).toBe(true);
    expect(result.darkMode).toBe(true);
    expect(result.tokens).toBe(true);
    expect(result.showVersion).toBe(false);
    expect(result.showHelp).toBe(false);
  });
});

// ─── --bundles flag ───────────────────────────────────────────────────────────

describe('--bundles flag', () => {
  it('--bundles core,forms parses comma-separated values', () => {
    const result = parseArgs(['my-app', '--bundles', 'core,forms']);
    expect(result.bundles).toEqual(['core', 'forms']);
  });

  it('--bundles all parses as single bundle', () => {
    const result = parseArgs(['my-app', '--bundles', 'all']);
    expect(result.bundles).toEqual(['all']);
  });

  it('--bundles with spaces after commas are trimmed', () => {
    const result = parseArgs(['my-app', '--bundles', 'core, forms']);
    expect(result.bundles).toEqual(['core', 'forms']);
  });

  it('bundles is null when not provided', () => {
    const result = parseArgs(['my-app']);
    expect(result.bundles).toBeNull();
  });

  it('throws on invalid bundle name', () => {
    expect(() => parseArgs(['my-app', '--bundles', 'invalid-bundle'])).toThrow(/Invalid bundle/);
  });
});

// ─── Boolean toggle flags (--dark-mode / --no-dark-mode, etc.) ────────────────

describe('--dark-mode / --no-dark-mode toggle', () => {
  it('darkMode defaults to true when neither flag is present', () => {
    expect(parseArgs([]).darkMode).toBe(true);
  });

  it('--dark-mode keeps darkMode true and marks it explicit', () => {
    const result = parseArgs(['--dark-mode']);
    expect(result.darkMode).toBe(true);
    expect(result.explicitFlags.darkMode).toBe(true);
  });

  it('--no-dark-mode sets darkMode to false', () => {
    const result = parseArgs(['--no-dark-mode']);
    expect(result.darkMode).toBe(false);
  });

  it('--no-dark-mode marks darkMode as explicitly set', () => {
    const result = parseArgs(['--no-dark-mode']);
    expect(result.explicitFlags.darkMode).toBe(true);
  });

  it('darkMode explicitFlags is false when neither flag passed', () => {
    const result = parseArgs([]);
    expect(result.explicitFlags.darkMode).toBe(false);
  });
});

describe('--typescript / --no-typescript toggle', () => {
  it('typescript defaults to true when neither flag is present', () => {
    expect(parseArgs([]).typescript).toBe(true);
  });

  it('--typescript keeps typescript true and marks it explicit', () => {
    const result = parseArgs(['--typescript']);
    expect(result.typescript).toBe(true);
    expect(result.explicitFlags.typescript).toBe(true);
  });

  it('--no-typescript sets typescript to false', () => {
    const result = parseArgs(['--no-typescript']);
    expect(result.typescript).toBe(false);
  });

  it('--no-typescript marks typescript as explicitly set', () => {
    const result = parseArgs(['--no-typescript']);
    expect(result.explicitFlags.typescript).toBe(true);
  });

  it('typescript explicitFlags is false when neither flag passed', () => {
    const result = parseArgs([]);
    expect(result.explicitFlags.typescript).toBe(false);
  });
});

// ─── explicitFlags tracking ───────────────────────────────────────────────────

describe('explicitFlags tracking', () => {
  it('all explicitFlags are false when no toggle flags are passed', () => {
    const result = parseArgs(['my-app', '--dry-run']);
    expect(result.explicitFlags).toEqual({
      typescript: false,
      eslint: false,
      darkMode: false,
      tokens: false,
    });
  });

  it('only the explicitly set toggle flags are true in explicitFlags', () => {
    const result = parseArgs(['--no-tokens', '--dark-mode']);
    expect(result.explicitFlags.tokens).toBe(true);
    expect(result.explicitFlags.darkMode).toBe(true);
    expect(result.explicitFlags.typescript).toBe(false);
    expect(result.explicitFlags.eslint).toBe(false);
  });

  it('--eslint marks eslint as explicit and keeps it true', () => {
    const result = parseArgs(['--eslint']);
    expect(result.eslint).toBe(true);
    expect(result.explicitFlags.eslint).toBe(true);
  });

  it('--no-eslint marks eslint as explicit and sets it false', () => {
    const result = parseArgs(['--no-eslint']);
    expect(result.eslint).toBe(false);
    expect(result.explicitFlags.eslint).toBe(true);
  });

  it('--tokens marks tokens as explicit and keeps it true', () => {
    const result = parseArgs(['--tokens']);
    expect(result.tokens).toBe(true);
    expect(result.explicitFlags.tokens).toBe(true);
  });

  it('--no-tokens marks tokens as explicit and sets it false', () => {
    const result = parseArgs(['--no-tokens']);
    expect(result.tokens).toBe(false);
    expect(result.explicitFlags.tokens).toBe(true);
  });
});
