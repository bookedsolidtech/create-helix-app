import { TEMPLATES, COMPONENT_BUNDLES } from './templates.js';
import type { Framework, ComponentBundle, DrupalPreset } from './types.js';
import { isValidPreset } from './presets/loader.js';

export interface ParsedArgs {
  // Subcommands
  subcommand: 'list' | 'info' | null;
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

  // Template options
  template: Framework | null;
  preset: DrupalPreset | null;
  bundles: ComponentBundle[] | null;
  outputDir: string | null;

  // Boolean toggles
  typescript: boolean;
  eslint: boolean;
  darkMode: boolean;
  tokens: boolean;

  // Config
  noConfig: boolean;

  // Meta
  showVersion: boolean;
  showHelp: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  // Subcommand detection
  let subcommand: 'list' | 'info' | null = null;
  if (argv[0] === 'list') subcommand = 'list';
  else if (argv[0] === 'info') subcommand = 'info';

  // Subcommand arg (for 'info' command)
  const subcommandArg =
    subcommand === 'info' ? (argv.find((a) => !a.startsWith('--') && a !== 'info') ?? null) : null;

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

  // Boolean toggles (default true, disabled by --no-*)
  const typescript = !argv.includes('--no-typescript');
  const eslint = !argv.includes('--no-eslint');
  const darkMode = !argv.includes('--no-dark-mode');
  const tokens = !argv.includes('--no-tokens');

  // --template
  const templateArgIndex = argv.indexOf('--template');
  const templateStr = templateArgIndex !== -1 ? (argv[templateArgIndex + 1] ?? null) : null;
  const validFrameworks = TEMPLATES.map((t) => t.id as Framework);

  if (templateStr !== null && !validFrameworks.includes(templateStr as Framework)) {
    throw new Error(
      `Invalid template: "${templateStr}". Valid options: ${validFrameworks.join(', ')}`,
    );
  }
  const template = templateStr as Framework | null;

  // --preset
  const presetArgIndex = argv.indexOf('--preset');
  const presetStr = presetArgIndex !== -1 ? (argv[presetArgIndex + 1] ?? null) : null;

  if (presetStr !== null && !isValidPreset(presetStr)) {
    throw new Error(
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
      throw new Error(
        `Invalid bundle(s): ${invalid.map((b) => `"${b}"`).join(', ')}. Valid options: ${validBundles.join(', ')}`,
      );
    }
    bundles = requested;
  }

  // --output-dir / -o
  const outputDirArgIndex =
    argv.indexOf('--output-dir') !== -1 ? argv.indexOf('--output-dir') : argv.indexOf('-o');
  const outputDir = outputDirArgIndex !== -1 ? (argv[outputDirArgIndex + 1] ?? null) : null;

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
    template,
    preset,
    bundles,
    outputDir,
    typescript,
    eslint,
    darkMode,
    tokens,
    noConfig,
    showVersion,
    showHelp,
  };
}
