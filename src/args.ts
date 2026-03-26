import { TEMPLATES, COMPONENT_BUNDLES } from './templates.js';
import { isValidPreset } from './presets/loader.js';
import type { Framework, ComponentBundle, DrupalPreset } from './types.js';

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

  // Meta
  showVersion: boolean;
  showHelp: boolean;
}

export class ParseArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseArgsError';
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  // Subcommand detection
  let subcommand: 'list' | 'info' | null = null;
  let subcommandArg: string | null = null;

  if (argv[0] === 'list') {
    subcommand = 'list';
    subcommandArg = argv[1] && !argv[1].startsWith('-') ? argv[1] : null;
  } else if (argv[0] === 'info') {
    subcommand = 'info';
    subcommandArg = argv[1] && !argv[1].startsWith('-') ? argv[1] : null;
  }

  // Meta flags
  const showVersion = argv.includes('--version') || argv.includes('-v');
  const showHelp = argv.includes('--help') || argv.includes('-h');

  // Project name: first positional arg when no subcommand
  const projectName = subcommand === null ? (argv[0] ?? null) : null;

  // Boolean flags
  const dryRun = argv.includes('--dry-run');
  const force = argv.includes('--force');
  const noInstall = argv.includes('--no-install');
  const quiet = argv.includes('--quiet') || argv.includes('-q');
  const json = argv.includes('--json');
  const isDrupal = argv.includes('--drupal');
  const typescript = !argv.includes('--no-typescript');
  const eslint = !argv.includes('--no-eslint');
  const darkMode = !argv.includes('--no-dark-mode');
  const tokens = !argv.includes('--no-tokens');

  // Template
  const templateArgIndex = argv.indexOf('--template');
  const templateArg = templateArgIndex !== -1 ? (argv[templateArgIndex + 1] ?? null) : null;
  const validFrameworks = TEMPLATES.map((t) => t.id as Framework);
  if (templateArg !== null && !validFrameworks.includes(templateArg as Framework)) {
    throw new ParseArgsError(
      `Invalid template: "${templateArg}". Valid options: ${validFrameworks.join(', ')}`,
    );
  }

  // Preset
  const presetArgIndex = argv.indexOf('--preset');
  const presetArg = presetArgIndex !== -1 ? (argv[presetArgIndex + 1] ?? null) : null;
  if (presetArg !== null && !isValidPreset(presetArg)) {
    throw new ParseArgsError(
      `Invalid preset: "${presetArg}". Valid presets: standard, blog, healthcare, intranet`,
    );
  }

  // Bundles
  const bundlesArgIndex = argv.indexOf('--bundles');
  const bundlesArg = bundlesArgIndex !== -1 ? (argv[bundlesArgIndex + 1] ?? null) : null;
  const validBundles = COMPONENT_BUNDLES.map((b) => b.id as ComponentBundle);
  let bundles: ComponentBundle[] | null = null;
  if (bundlesArg !== null) {
    const requested = bundlesArg.split(',').map((s) => s.trim()) as ComponentBundle[];
    const invalid = requested.filter((b) => !validBundles.includes(b));
    if (invalid.length > 0) {
      throw new ParseArgsError(
        `Invalid bundle(s): ${invalid.map((b) => `"${b}"`).join(', ')}. Valid options: ${validBundles.join(', ')}`,
      );
    }
    bundles = requested;
  }

  // Output dir
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
    template: templateArg as Framework | null,
    preset: presetArg as DrupalPreset | null,
    bundles,
    outputDir,
    typescript,
    eslint,
    darkMode,
    tokens,
    showVersion,
    showHelp,
  };
}
