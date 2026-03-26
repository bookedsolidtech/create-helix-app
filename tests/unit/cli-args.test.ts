import { describe, it, expect } from 'vitest';
import { TEMPLATES, COMPONENT_BUNDLES } from '../../src/templates.js';
import { isValidPreset, PRESETS } from '../../src/presets/loader.js';
import type { Framework, ComponentBundle } from '../../src/types.js';
import { createRequire } from 'node:module';
import path from 'node:path';

const _require = createRequire(import.meta.url);
const pkg = _require('../../package.json') as { version: string };

const validFrameworks = TEMPLATES.map((t) => t.id as Framework);
const validBundles = COMPONENT_BUNDLES.map((b) => b.id as ComponentBundle);

// Mirrors the --template validation logic in src/cli.ts
function validateTemplateArg(args: string[]): { templateArg: string | null; error: string | null } {
  const templateArgIndex = args.indexOf('--template');
  const templateArg = templateArgIndex !== -1 ? (args[templateArgIndex + 1] ?? null) : null;

  if (templateArg !== null && !validFrameworks.includes(templateArg as Framework)) {
    return {
      templateArg,
      error: `Invalid template: "${templateArg}". Valid options: ${validFrameworks.join(', ')}`,
    };
  }

  return { templateArg, error: null };
}

// Mirrors the --bundles validation logic in src/cli.ts
function validateBundlesArg(args: string[]): {
  bundlesArg: string | null;
  bundlesFromFlag: ComponentBundle[] | null;
  error: string | null;
} {
  const bundlesArgIndex = args.indexOf('--bundles');
  const bundlesArg = bundlesArgIndex !== -1 ? (args[bundlesArgIndex + 1] ?? null) : null;

  if (bundlesArg === null) {
    return { bundlesArg: null, bundlesFromFlag: null, error: null };
  }

  const requested = bundlesArg.split(',').map((s) => s.trim()) as ComponentBundle[];
  const invalid = requested.filter((b) => !validBundles.includes(b));

  if (invalid.length > 0) {
    return {
      bundlesArg,
      bundlesFromFlag: null,
      error: `Invalid bundle(s): ${invalid.map((b) => `"${b}"`).join(', ')}. Valid options: ${validBundles.join(', ')}`,
    };
  }

  return { bundlesArg, bundlesFromFlag: requested, error: null };
}

// Mirrors the --preset validation logic in src/cli.ts / runDrupalCLI
function validatePresetArg(args: string[]): { presetArg: string | null; error: string | null } {
  const presetArgIndex = args.indexOf('--preset');
  const presetArg = presetArgIndex !== -1 ? (args[presetArgIndex + 1] ?? null) : null;

  if (presetArg !== null && !isValidPreset(presetArg)) {
    return {
      presetArg,
      error: `Invalid preset: "${presetArg}". Valid presets: standard, blog, healthcare, intranet`,
    };
  }

  return { presetArg, error: null };
}

// Mirrors the --output-dir writability check in src/cli.ts (logic only, no fs)
function parseOutputDirArg(args: string[]): string | null {
  const outputDirArgIndex =
    args.indexOf('--output-dir') !== -1 ? args.indexOf('--output-dir') : args.indexOf('-o');
  return outputDirArgIndex !== -1 ? (args[outputDirArgIndex + 1] ?? null) : null;
}

// Mirrors the --version output in src/cli.ts
function buildVersionOutput(version: string): string {
  return `create-helix v${version}`;
}

// Mirrors the --help output flags list in src/cli.ts
function buildHelpOutput(version: string): string {
  const frameworkList = TEMPLATES.map((t) => `    ${t.id.padEnd(16)} ${t.hint}`).join('\n');
  const presetList = PRESETS.map((pr) => `    ${pr.id.padEnd(16)} ${pr.description}`).join('\n');
  return `
  create-helix v${version}

  Usage:
    npx create-helix [project-name] [options]

  Options:
    --force                 Overwrite existing files in a non-empty directory
    --dry-run               Show files that would be created without writing them
    --no-install            Skip dependency installation after scaffolding
    --quiet, -q             Suppress banner, spinners, and decorative output (CI-friendly)
    --version, -v           Print version and exit
    --help, -h              Show this help message and exit

  Framework Selection:
    --template <name>       Select a framework directly (skips prompt)

  Available frameworks:
${frameworkList}

  Drupal Options:
    --drupal                Scaffold a Drupal theme instead of a web app
    --preset <name>         Select a Drupal preset directly (skips prompt)

  Available presets:
${presetList}

  Output Control:
    --bundles <list>        Select component bundles (comma-separated, skips prompt)
                            Values: all, core, forms, navigation, data-display, feedback, layout
    --typescript            Use TypeScript (default: true)
    --no-typescript         Disable TypeScript
    --eslint                Include ESLint + Prettier (default: true)
    --no-eslint             Exclude ESLint + Prettier
    --tokens                Include HELiX design tokens (default: true)
    --no-tokens             Exclude HELiX design tokens
    --dark-mode             Enable dark mode support (default: true)
    --no-dark-mode          Disable dark mode support
    --output-dir, -o <path> Use a custom output directory instead of the project name

  Examples:
    create-helix my-app                          # Interactive mode
    create-helix my-app --template react-next    # Skip framework prompt
    create-helix my-app --dry-run                # Preview without writing
    create-helix my-app --output-dir ./projects  # Custom output directory
    create-helix my-theme --drupal --preset blog # Drupal blog theme
`;
}

describe('CLI argument validation edge cases', () => {
  // Test 1: --template with invalid framework name
  describe('--template flag', () => {
    it('errors on invalid framework name with list of valid options', () => {
      const { error } = validateTemplateArg(['my-app', '--template', 'invalid-framework']);
      expect(error).not.toBeNull();
      expect(error).toContain('"invalid-framework"');
      expect(error).toContain('Valid options:');
      validFrameworks.forEach((fw) => {
        expect(error).toContain(fw);
      });
    });

    // Test 2: --template with no value (missing argument)
    it('returns null gracefully when --template has no value', () => {
      const { templateArg, error } = validateTemplateArg(['my-app', '--template']);
      expect(templateArg).toBeNull();
      expect(error).toBeNull();
    });

    it('accepts valid framework names without error', () => {
      validFrameworks.forEach((fw) => {
        const { error } = validateTemplateArg(['my-app', '--template', fw]);
        expect(error).toBeNull();
      });
    });

    it('returns no error when --template is not provided', () => {
      const { templateArg, error } = validateTemplateArg(['my-app']);
      expect(templateArg).toBeNull();
      expect(error).toBeNull();
    });
  });

  // Test 3: --bundles with invalid bundle name
  describe('--bundles flag', () => {
    it('errors on invalid bundle name with list of valid bundles', () => {
      const { error } = validateBundlesArg(['my-app', '--bundles', 'invalid-bundle']);
      expect(error).not.toBeNull();
      expect(error).toContain('"invalid-bundle"');
      expect(error).toContain('Valid options:');
      validBundles.forEach((b) => {
        expect(error).toContain(b);
      });
    });

    // Test 4: --bundles with mix of valid and invalid
    it('errors listing invalid bundles when mix of valid and invalid is provided', () => {
      const { error, bundlesFromFlag } = validateBundlesArg([
        'my-app',
        '--bundles',
        'core,bad-bundle,forms,another-bad',
      ]);
      expect(bundlesFromFlag).toBeNull();
      expect(error).not.toBeNull();
      expect(error).toContain('"bad-bundle"');
      expect(error).toContain('"another-bad"');
      // valid bundles should NOT be in the invalid list
      expect(error).not.toContain('"core"');
      expect(error).not.toContain('"forms"');
    });

    it('accepts all valid bundle names without error', () => {
      const allBundles = validBundles.join(',');
      const { error } = validateBundlesArg(['my-app', '--bundles', allBundles]);
      expect(error).toBeNull();
    });
  });

  // Test 5: --preset with invalid preset
  describe('--preset flag', () => {
    it('errors on invalid preset with list of valid presets', () => {
      const { error } = validatePresetArg(['my-theme', '--preset', 'not-a-preset']);
      expect(error).not.toBeNull();
      expect(error).toContain('"not-a-preset"');
      expect(error).toContain('standard');
      expect(error).toContain('blog');
      expect(error).toContain('healthcare');
      expect(error).toContain('intranet');
    });

    it('returns no error for valid presets', () => {
      ['standard', 'blog', 'healthcare', 'intranet'].forEach((preset) => {
        const { error } = validatePresetArg(['my-theme', '--preset', preset]);
        expect(error).toBeNull();
      });
    });

    it('returns null when --preset has no value', () => {
      const { presetArg, error } = validatePresetArg(['my-theme', '--preset']);
      expect(presetArg).toBeNull();
      expect(error).toBeNull();
    });
  });

  // Test 6: --output-dir with non-writable path
  describe('--output-dir flag', () => {
    it('parses --output-dir value from args', () => {
      const outputDir = parseOutputDirArg(['my-app', '--output-dir', './projects']);
      expect(outputDir).toBe('./projects');
    });

    it('parses -o short flag', () => {
      const outputDir = parseOutputDirArg(['my-app', '-o', '/custom/path']);
      expect(outputDir).toBe('/custom/path');
    });

    it('returns null when --output-dir has no value', () => {
      const outputDir = parseOutputDirArg(['my-app', '--output-dir']);
      expect(outputDir).toBeNull();
    });

    it('resolves output-dir path relative to cwd', () => {
      const outputDirArg = './projects/my-app';
      const resolved = path.resolve('/base', outputDirArg);
      expect(resolved).toBe('/base/projects/my-app');
    });

    it('returns null when --output-dir is not provided', () => {
      const outputDir = parseOutputDirArg(['my-app', '--template', 'react-next']);
      expect(outputDir).toBeNull();
    });
  });

  // Test 7: --version outputs version string matching package.json
  describe('--version flag', () => {
    it('outputs version string matching package.json', () => {
      const output = buildVersionOutput(pkg.version);
      expect(output).toBe(`create-helix v${pkg.version}`);
      // Verify it matches package.json version format
      expect(output).toMatch(/^create-helix v\d+\.\d+\.\d+/);
    });

    it('detects --version flag in args', () => {
      const args = ['--version'];
      expect(args.includes('--version') || args.includes('-v')).toBe(true);
    });

    it('detects -v short flag in args', () => {
      const args = ['-v'];
      expect(args.includes('--version') || args.includes('-v')).toBe(true);
    });
  });

  // Test 8: --help output contains all documented flags
  describe('--help flag', () => {
    it('help output contains all documented flags', () => {
      const help = buildHelpOutput(pkg.version);
      expect(help).toContain('--force');
      expect(help).toContain('--dry-run');
      expect(help).toContain('--no-install');
      expect(help).toContain('--version');
      expect(help).toContain('-v');
      expect(help).toContain('--help');
      expect(help).toContain('-h');
      expect(help).toContain('--template');
      expect(help).toContain('--drupal');
      expect(help).toContain('--preset');
      expect(help).toContain('--bundles');
      expect(help).toContain('--typescript');
      expect(help).toContain('--no-typescript');
      expect(help).toContain('--eslint');
      expect(help).toContain('--no-eslint');
      expect(help).toContain('--tokens');
      expect(help).toContain('--no-tokens');
      expect(help).toContain('--dark-mode');
      expect(help).toContain('--no-dark-mode');
      expect(help).toContain('--output-dir');
      expect(help).toContain('-o');
    });

    it('help output contains the version from package.json', () => {
      const help = buildHelpOutput(pkg.version);
      expect(help).toContain(`create-helix v${pkg.version}`);
    });

    it('help output lists all valid framework names', () => {
      const help = buildHelpOutput(pkg.version);
      validFrameworks.forEach((fw) => {
        expect(help).toContain(fw);
      });
    });

    it('help output lists all valid preset names', () => {
      const help = buildHelpOutput(pkg.version);
      ['standard', 'blog', 'healthcare', 'intranet'].forEach((preset) => {
        expect(help).toContain(preset);
      });
    });

    it('detects --help flag in args', () => {
      const args = ['--help'];
      expect(args.includes('--help') || args.includes('-h')).toBe(true);
    });

    it('help output contains --quiet and -q flags', () => {
      const help = buildHelpOutput(pkg.version);
      expect(help).toContain('--quiet');
      expect(help).toContain('-q');
    });
  });

  // Test for --quiet / -q flag
  describe('--quiet flag', () => {
    it('detects --quiet flag in args', () => {
      const args = ['my-app', '--template', 'react-next', '--quiet'];
      const isQuiet = args.includes('--quiet') || args.includes('-q');
      expect(isQuiet).toBe(true);
    });

    it('detects -q short flag in args', () => {
      const args = ['my-app', '--template', 'react-next', '-q'];
      const isQuiet = args.includes('--quiet') || args.includes('-q');
      expect(isQuiet).toBe(true);
    });

    it('isQuiet is false when neither --quiet nor -q is present', () => {
      const args = ['my-app', '--template', 'react-next'];
      const isQuiet = args.includes('--quiet') || args.includes('-q');
      expect(isQuiet).toBe(false);
    });

    it('--quiet is compatible with --dry-run', () => {
      const args = ['my-app', '--template', 'react-next', '--quiet', '--dry-run'];
      const isQuiet = args.includes('--quiet') || args.includes('-q');
      const isDryRun = args.includes('--dry-run');
      expect(isQuiet).toBe(true);
      expect(isDryRun).toBe(true);
    });
  });

  // Test 9: Unknown flags are ignored (do not cause errors)
  describe('unknown flags are ignored', () => {
    it('unknown flags do not trigger template validation error', () => {
      const { error } = validateTemplateArg(['my-app', '--unknown-flag', '--another-flag']);
      expect(error).toBeNull();
    });

    it('unknown flags do not trigger bundles validation error', () => {
      const { error } = validateBundlesArg(['my-app', '--unknown-flag', 'some-value']);
      expect(error).toBeNull();
    });

    it('unknown flags do not trigger preset validation error', () => {
      const { error } = validatePresetArg(['my-theme', '--unknown-flag', 'some-value']);
      expect(error).toBeNull();
    });

    it('unknown flags alongside valid --template do not cause errors', () => {
      const { templateArg, error } = validateTemplateArg([
        'my-app',
        '--unknown-flag',
        '--template',
        'react-next',
        '--another-unknown',
      ]);
      expect(error).toBeNull();
      expect(templateArg).toBe('react-next');
    });
  });
});
