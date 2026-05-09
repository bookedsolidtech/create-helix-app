import { TEMPLATES, COMPONENT_BUNDLES } from './templates.js';
import type { Framework, ComponentBundle, DrupalPreset } from './types.js';
import { isValidPreset } from './presets/loader.js';
import { HelixError, ErrorCode } from './errors.js';

export interface ParsedArgs {
  // Subcommands
  subcommand: 'list' | 'info' | 'doctor' | 'upgrade' | 'config' | null;
  subcommandArg: string | null;

  // Project
  projectName: string | null;

  // Flags
  dryRun: boolean;
  force: boolean;
  noInstall: boolean;
  quiet: boolean;
  json: boolean;
  isDrupal: boolean;
  noConfig: boolean;
  verbose: boolean;

  // Template options
  template: Framework | null;
  preset: DrupalPreset | null;
  bundles: ComponentBundle[] | null;
  outputDir: string | null;

  // Design system factory (wc-storybook)
  dsName: string | null;
  tokenPrefix: string | null;
  brandTagline: string | null;
  /** Comma-separated list of brand verticals; null when flag absent */
  brandVerticals: string[] | null;

  // Boolean toggles
  typescript: boolean;
  eslint: boolean;
  darkMode: boolean;
  tokens: boolean;

  // Tracks which boolean toggles were explicitly set via CLI
  explicitFlags: {
    typescript: boolean;
    eslint: boolean;
    darkMode: boolean;
    tokens: boolean;
  };

  // Audit
  skipAudit: boolean;

  // Offline mode
  offline: boolean;

  // Profile
  profile: string | null;

  // Meta
  showVersion: boolean;
  showHelp: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  // Subcommand detection
  let subcommand: 'list' | 'info' | 'doctor' | 'upgrade' | 'config' | null = null;
  if (argv[0] === 'list') subcommand = 'list';
  else if (argv[0] === 'info') subcommand = 'info';
  else if (argv[0] === 'doctor') subcommand = 'doctor';
  else if (argv[0] === 'upgrade') subcommand = 'upgrade';
  else if (argv[0] === 'config') subcommand = 'config';

  // Subcommand arg (for 'info' and 'config' commands)
  const subcommandArg =
    subcommand === 'info'
      ? (argv.find((a) => !a.startsWith('--') && a !== 'info') ?? null)
      : subcommand === 'config'
        ? (argv.find((a) => !a.startsWith('--') && a !== 'config') ?? null)
        : null;

  // Project name: first arg if not a flag and not a subcommand
  const projectName =
    argv[0] !== undefined && !argv[0].startsWith('--') && subcommand === null ? argv[0] : null;

  // Meta flags
  const showVersion = argv.includes('--version') || argv.includes('-v');
  const showHelp = argv.includes('--help') || argv.includes('-h');

  // Behavior flags
  const dryRun = argv.includes('--dry-run');
  const force = argv.includes('--force');
  const noInstall = argv.includes('--no-install');
  const quiet = argv.includes('--quiet') || argv.includes('-q');
  const json = argv.includes('--json');
  const isDrupal = argv.includes('--drupal');
  const noConfig = argv.includes('--no-config');
  const verbose = argv.includes('--verbose');
  const skipAudit = argv.includes('--skip-audit');
  const offline = argv.includes('--offline');

  // Boolean toggles (default true, disabled by --no-*)
  const typescript = !argv.includes('--no-typescript');
  const eslint = !argv.includes('--no-eslint');
  const darkMode = !argv.includes('--no-dark-mode');
  const tokens = !argv.includes('--no-tokens');

  // Track which boolean toggles were explicitly set via CLI
  const explicitFlags = {
    typescript: argv.includes('--typescript') || argv.includes('--no-typescript'),
    eslint: argv.includes('--eslint') || argv.includes('--no-eslint'),
    darkMode: argv.includes('--dark-mode') || argv.includes('--no-dark-mode'),
    tokens: argv.includes('--tokens') || argv.includes('--no-tokens'),
  };

  // --template
  const templateArgIndex = argv.indexOf('--template');
  const templateStr = templateArgIndex !== -1 ? (argv[templateArgIndex + 1] ?? null) : null;
  const validFrameworks = TEMPLATES.map((t) => t.id as Framework);

  if (templateStr !== null && !validFrameworks.includes(templateStr as Framework)) {
    throw new HelixError(
      ErrorCode.INVALID_TEMPLATE,
      `Invalid template: "${templateStr}". Valid options: ${validFrameworks.join(', ')}`,
    );
  }
  const template = templateStr as Framework | null;

  // --preset
  const presetArgIndex = argv.indexOf('--preset');
  const presetStr = presetArgIndex !== -1 ? (argv[presetArgIndex + 1] ?? null) : null;

  if (presetStr !== null && !isValidPreset(presetStr)) {
    throw new HelixError(
      ErrorCode.INVALID_PRESET,
      `Invalid preset: "${presetStr}". Valid presets: standard, blog, healthcare, intranet`,
    );
  }
  const preset = presetStr as DrupalPreset | null;

  // --bundles
  const bundlesArgIndex = argv.indexOf('--bundles');
  const bundlesStr = bundlesArgIndex !== -1 ? (argv[bundlesArgIndex + 1] ?? null) : null;
  const validBundles = COMPONENT_BUNDLES.map((b) => b.id as ComponentBundle);

  let bundles: ComponentBundle[] | null = null;
  if (bundlesStr !== null) {
    const requested = bundlesStr.split(',').map((s) => s.trim()) as ComponentBundle[];
    const invalid = requested.filter((b) => !validBundles.includes(b));
    if (invalid.length > 0) {
      throw new HelixError(
        ErrorCode.INVALID_BUNDLE,
        `Invalid bundle(s): ${invalid.map((b) => `"${b}"`).join(', ')}. Valid options: ${validBundles.join(', ')}`,
      );
    }
    bundles = requested;
  }

  // --output-dir / -o
  const outputDirArgIndex =
    argv.indexOf('--output-dir') !== -1 ? argv.indexOf('--output-dir') : argv.indexOf('-o');
  const outputDir = outputDirArgIndex !== -1 ? (argv[outputDirArgIndex + 1] ?? null) : null;

  // --profile
  const profileArgIndex = argv.indexOf('--profile');
  const profile = profileArgIndex !== -1 ? (argv[profileArgIndex + 1] ?? null) : null;

  // --ds-name (design system codename, used by wc-storybook)
  const dsNameArgIndex = argv.indexOf('--ds-name');
  const dsName = dsNameArgIndex !== -1 ? (argv[dsNameArgIndex + 1] ?? null) : null;

  // --token-prefix (CSS custom property prefix, used by wc-storybook)
  const tokenPrefixArgIndex = argv.indexOf('--token-prefix');
  const tokenPrefix = tokenPrefixArgIndex !== -1 ? (argv[tokenPrefixArgIndex + 1] ?? null) : null;

  // --brand-tagline (used by wc-storybook factory Cover + Brand MDX)
  const brandTaglineArgIndex = argv.indexOf('--brand-tagline');
  const brandTagline =
    brandTaglineArgIndex !== -1 ? (argv[brandTaglineArgIndex + 1] ?? null) : null;

  // --brand-verticals (comma-separated list, used by wc-storybook brand toolbar)
  const brandVerticalsArgIndex = argv.indexOf('--brand-verticals');
  const brandVerticalsRaw =
    brandVerticalsArgIndex !== -1 ? (argv[brandVerticalsArgIndex + 1] ?? null) : null;
  const brandVerticals: string[] | null =
    brandVerticalsRaw === null
      ? null
      : brandVerticalsRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
  // heroScenarios are interactive-only — too complex for a CLI flag; --yes
  // / non-interactive flows fall back to neutral defaults in the scaffolder.

  return {
    subcommand,
    subcommandArg,
    projectName,
    dryRun,
    force,
    noInstall,
    quiet,
    json,
    isDrupal,
    noConfig,
    verbose,
    template,
    preset,
    bundles,
    outputDir,
    typescript,
    eslint,
    darkMode,
    tokens,
    explicitFlags,
    skipAudit,
    offline,
    profile,
    dsName,
    tokenPrefix,
    brandTagline,
    brandVerticals,
    showVersion,
    showHelp,
  };
}
