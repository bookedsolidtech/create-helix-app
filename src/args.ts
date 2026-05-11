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
  /**
   * v0.6.0 Phase C — when true, the interactive framework prompt and the
   * `list` command both include templates marked `experimental: true`.
   * Default is false; the 13 stub-quality scaffolders are hidden behind
   * this flag. API callers (scaffold({framework: ...})) bypass the prompt
   * filter entirely and don't need this flag.
   */
  showExperimental: boolean;

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
  const showExperimental = argv.includes('--show-experimental');

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

  // Set of every documented CLI option so readValueFlag (defined below)
  // can distinguish "next argv is the value" from "next argv is the
  // next flag". Scoped to this function so both the legacy flags
  // (--template / --preset / --bundles / --output-dir / --profile) and
  // the wc-storybook flags (--ds-name / --token-prefix / --brand-*)
  // share one parser. Missing entries cause space-form value-flags to
  // incorrectly capture the next flag as the value.
  const KNOWN_OPTIONS = new Set([
    '--ds-name',
    '--token-prefix',
    '--brand-tagline',
    '--brand-verticals',
    '--template',
    '--name',
    '--directory',
    '--output-dir',
    '-o',
    '--profile',
    '--config',
    '--bundles',
    '--preset',
    '--yes',
    '-y',
    '--json',
    '--dry-run',
    '--force',
    '--verbose',
    '--quiet',
    '-q',
    '--no-install',
    '--no-eslint',
    '--no-tokens',
    '--no-typescript',
    '--no-dark-mode',
    '--typescript',
    '--eslint',
    '--tokens',
    '--dark-mode',
    '--skip-audit',
    '--offline',
    '--no-config',
    '--drupal',
    '--show-experimental',
    '--help',
    '-h',
    '--version',
    '-v',
  ]);
  // Helper: read a value flag accepting either `--flag value` or
  // `--flag=value`. The repo's own docs use both forms; routing every
  // value-flag through this helper keeps the two surfaces consistent
  // (previously --template / --preset / --bundles / --output-dir /
  // --profile silently dropped the `=` form).
  const readValueFlag = (flag: string): string | null => {
    const eqPrefix = `${flag}=`;
    const eqEntry = argv.find((a) => a.startsWith(eqPrefix));
    if (eqEntry !== undefined) return eqEntry.slice(eqPrefix.length);
    const idx = argv.indexOf(flag);
    if (idx === -1) return null;
    const next = argv[idx + 1];
    if (next === undefined || KNOWN_OPTIONS.has(next)) return null;
    return next;
  };

  // --template (accepts both `--template wc-storybook` and `--template=wc-storybook`)
  const templateStr = readValueFlag('--template');
  const validFrameworks = TEMPLATES.map((t) => t.id as Framework);
  // Production vs experimental split — v0.6.0 Phase C. Errors lean on this
  // list both to gate the "Re-run with --show-experimental" hint AND to
  // build the abbreviated valid-options string when the requested template
  // doesn't exist at all. API/json callers still get the full list via the
  // separate JSON-mode validation path.
  const productionFrameworks = TEMPLATES.filter((t) => !t.experimental).map(
    (t) => t.id as Framework,
  );

  if (templateStr !== null && !validFrameworks.includes(templateStr as Framework)) {
    throw new HelixError(
      ErrorCode.INVALID_TEMPLATE,
      `Invalid template: "${templateStr}". Valid options: ${validFrameworks.join(', ')}`,
    );
  }
  // Friendly redirect for hidden experimental templates: the value IS a real
  // template id, but it's been moved behind --show-experimental in v0.6.0.
  // Error names the flag inline (DXA Q3 — triple-discoverability point #2)
  // unless the caller already passed --show-experimental, in which case the
  // gate is open and we fall through.
  if (templateStr !== null && !showExperimental) {
    const requested = TEMPLATES.find((t) => t.id === templateStr);
    if (requested?.experimental === true) {
      throw new HelixError(
        ErrorCode.INVALID_TEMPLATE,
        `Template '${templateStr}' is experimental. Re-run with --show-experimental to enable, or pick from: ${productionFrameworks.join(', ')}.`,
      );
    }
  }
  const template = templateStr as Framework | null;

  // --preset (accepts both space- and `=`-forms)
  const presetStr = readValueFlag('--preset');

  if (presetStr !== null && !isValidPreset(presetStr)) {
    throw new HelixError(
      ErrorCode.INVALID_PRESET,
      `Invalid preset: "${presetStr}". Valid presets: standard, blog, healthcare, intranet`,
    );
  }
  const preset = presetStr as DrupalPreset | null;

  // --bundles (accepts both space- and `=`-forms)
  const bundlesStr = readValueFlag('--bundles');
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

  // --output-dir / -o (accepts both space- and `=`-forms on either alias)
  const outputDir = readValueFlag('--output-dir') ?? readValueFlag('-o');

  // --profile (accepts both space- and `=`-forms)
  const profile = readValueFlag('--profile');

  // --ds-name (design system codename, used by wc-storybook)
  const dsName = readValueFlag('--ds-name');

  // --token-prefix (CSS custom property prefix, used by wc-storybook)
  const tokenPrefix = readValueFlag('--token-prefix');

  // --brand-tagline (used by wc-storybook factory Cover + Brand MDX)
  const brandTagline = readValueFlag('--brand-tagline');

  // --brand-verticals (comma-separated list, used by wc-storybook brand toolbar)
  const brandVerticalsRaw = readValueFlag('--brand-verticals');
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
    showExperimental,
  };
}
