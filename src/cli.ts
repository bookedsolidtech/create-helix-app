import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { TEMPLATES, COMPONENT_BUNDLES } from './templates.js';
import { scaffoldProject, getDryRunEntries, getLastScaffoldTiming } from './scaffold.js';
import type { Framework, ComponentBundle, ProjectOptions } from './types.js';
import { isValidPreset, PRESETS } from './presets/loader.js';
import { scaffoldDrupalTheme } from './generators/drupal-theme.js';
import type { DrupalPreset } from './types.js';
import {
  validateProjectName,
  validateFramework,
  validatePreset,
  validateDirectory,
  validateDsName,
  validateTokenPrefix,
  unscopeName,
  validateScopedNameForFramework,
} from './validation.js';
import { parseArgs } from './args.js';
import { loadConfig, listProfiles, readEnvVars } from './config.js';
import { auditDependencies } from './security/dep-audit.js';
import { checkForUpdate, getCachedLatestVersion } from './version-check.js';
import { logger } from './logger.js';
import { runDoctor, formatDoctorOutput } from './doctor.js';
import { showTemplateInfo } from './commands/info.js';
import { helixBanner } from './cli/banner.js';

const _require = createRequire(import.meta.url);
const pkg = _require('../package.json') as { version: string };
const HELIX_VERSION = pkg.version;

/**
 * Render the create-helix banner via the extracted helixBanner() helper
 * (v0.6.0 Phase D). Suppression contract is enforced inside the helper:
 * returns [] under --quiet, --json, or non-TTY pipes.
 */
function banner(
  opts: {
    asJson?: boolean;
    suppressed?: boolean;
    latestNpmVersion?: string;
  } = {},
): void {
  helixBanner(opts).forEach((line) => {
    console.log(line);
  });
}

async function runDrupalCLI(presetArg: string | null, isQuiet: boolean): Promise<void> {
  banner({ suppressed: isQuiet, latestNpmVersion: getCachedLatestVersion() ?? undefined });

  if (!isQuiet) p.intro(pc.bgCyan(pc.black(' create-helix — Drupal theme ')));

  // Validate preset if provided via flag — use both isValidPreset (legacy) and
  // validatePreset (new hardened type guard) for defense-in-depth
  if (presetArg !== null && (!isValidPreset(presetArg) || !validatePreset(presetArg))) {
    console.error(
      `Invalid preset: "${presetArg}". Valid presets: standard, blog, healthcare, intranet, ecommerce`,
    );
    process.exit(1);
  }

  const themeName = await p.text({
    message: 'Drupal theme machine name',
    placeholder: 'my-helix-theme',
    /* istanbul ignore next -- validate callback is never invoked when @clack/prompts is mocked */
    validate(value) {
      if (!value) return 'Theme name is required';
      // SECURITY: Whitelist-only validation — enforces a valid Drupal machine
      // name (lowercase letters, digits, underscores; must start with a letter).
      // Rejects path traversal sequences, shell metacharacters, and null bytes.
      // This name is used as the directory name and embedded in YAML/JSON files.
      if (!/^[a-z][a-z0-9_]*$/.test(value))
        return 'Use only lowercase letters, numbers, and underscores (must start with a letter)';
      return undefined;
    },
  });

  if (p.isCancel(themeName)) {
    p.cancel('Operation cancelled.');
    process.exit(0);
  }

  let preset: DrupalPreset;

  if (presetArg !== null && isValidPreset(presetArg)) {
    preset = presetArg;
  } else {
    const selected = await p.select<DrupalPreset>({
      message: 'Which Drupal preset?',
      options: PRESETS.map((pr) => ({
        value: pr.id,
        label: pr.name,
        hint: pr.description,
      })),
    });

    if (p.isCancel(selected)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    preset = selected as DrupalPreset;
  }

  const themeNameStr = themeName as string;
  const directory = path.resolve(process.cwd(), themeNameStr);

  const s = p.spinner();
  if (!isQuiet) s.start('Scaffolding Drupal theme...');

  await scaffoldDrupalTheme({ themeName: themeNameStr, directory, preset });

  if (!isQuiet) s.stop(pc.green('Drupal theme scaffolded'));

  const nextSteps = [
    `Move ${themeNameStr}/ into your project:`,
    `  DDEV:  cp -r ${themeNameStr}/ web/themes/custom/`,
    `  Lando: cp -r ${themeNameStr}/ web/themes/custom/`,
    `  Other: copy to <drupal-root>/web/themes/custom/`,
    ``,
    `Enable the theme:`,
    `  ddev drush theme:enable ${themeNameStr} && ddev drush cr`,
    `  lando drush theme:enable ${themeNameStr} && lando drush cr`,
    ``,
    `Standalone testing (no existing Drupal install needed):`,
    `  cd ${themeNameStr}/docker && docker compose up -d`,
    `  See README.md for full instructions`,
  ].join('\n');

  if (!isQuiet) p.note(nextSteps, 'Next steps');

  console.log();
  console.log(pc.dim('  Theme:     ') + pc.cyan(themeNameStr));
  console.log(pc.dim('  Preset:    ') + pc.white(preset));
  console.log(pc.dim('  Directory: ') + pc.white(directory));
  console.log();

  if (!isQuiet)
    p.outro(pc.green('Done!') + ' ' + pc.dim('Build something beautiful with HELiX + Drupal.'));
}

export function runInfoCommand(templateId: string | null, isJson: boolean): void {
  if (templateId === null) {
    console.error('Usage: create-helix info <template-or-preset-id>');
    process.exit(1);
  }
  showTemplateInfo(templateId, isJson);
}

export function runListCommand(
  isJson: boolean,
  configFile?: string | null,
  showExperimental = false,
): void {
  const productionTemplates = TEMPLATES.filter((t) => !t.experimental);
  const experimentalTemplates = TEMPLATES.filter((t) => t.experimental);
  if (isJson) {
    const visibleTemplates = showExperimental ? TEMPLATES : productionTemplates;
    const output: {
      templates: { id: string; name: string; hint: string; experimental?: boolean }[];
      presets: { id: string; name: string; description: string }[];
      experimentalHidden?: number;
      configFile?: string | null;
    } = {
      templates: visibleTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        hint: t.hint,
        ...(t.experimental ? { experimental: true as const } : {}),
      })),
      presets: PRESETS.map((pr) => ({ id: pr.id, name: pr.name, description: pr.description })),
    };
    if (!showExperimental && experimentalTemplates.length > 0) {
      output.experimentalHidden = experimentalTemplates.length;
    }
    if (configFile !== undefined) {
      output.configFile = configFile;
    }
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log('');
  if (showExperimental) {
    console.log(pc.bold('  Framework Templates — Production'));
    console.log('');
    for (const t of productionTemplates) {
      console.log(`  ${pc.cyan(t.id.padEnd(18))} ${pc.white(t.name.padEnd(26))} ${pc.dim(t.hint)}`);
    }
    console.log('');
    console.log(pc.bold('  Framework Templates — Experimental'));
    console.log(pc.dim('  (stub-quality scaffolders; surfaced via --show-experimental)'));
    console.log('');
    for (const t of experimentalTemplates) {
      console.log(
        `  ${pc.yellow(t.id.padEnd(18))} ${pc.white(t.name.padEnd(26))} ${pc.dim(t.hint)}`,
      );
    }
  } else {
    console.log(pc.bold('  Framework Templates'));
    console.log('');
    for (const t of productionTemplates) {
      console.log(`  ${pc.cyan(t.id.padEnd(18))} ${pc.white(t.name.padEnd(26))} ${pc.dim(t.hint)}`);
    }
  }
  console.log('');
  console.log(pc.bold('  Drupal Presets'));
  console.log('');
  for (const pr of PRESETS) {
    console.log(
      `  ${pc.cyan(pr.id.padEnd(18))} ${pc.white(pr.name.padEnd(26))} ${pc.dim(pr.description)}`,
    );
  }
  console.log('');
  if (!showExperimental && experimentalTemplates.length > 0) {
    // DXA Q3 triple-discoverability point #1 — footer hint at the bottom
    // of the default list output. Pinned by cli-list-experimental tests.
    console.log(
      pc.dim(
        `  ${String(experimentalTemplates.length)} experimental templates hidden. Use --show-experimental to see them.`,
      ),
    );
    console.log('');
  }
}

interface ScaffoldJsonResult {
  success: boolean;
  project?: {
    name: string;
    directory: string;
    framework: string;
    typescript: boolean;
    eslint: boolean;
    darkMode: boolean;
    designTokens: boolean;
    bundles: string[];
  };
  files?: string[];
  dryRun?: boolean;
  timing?: {
    totalMs: number;
    fileCount: number;
    bytesWritten: number;
    dependencyCount: number;
    phases: {
      validationMs: number;
      templateResolutionMs: number;
      fileGenerationMs: number;
      fileWritingMs: number;
    };
  };
  error?: string;
}

export async function runJsonScaffold(
  name: string,
  templateArg: string,
  opts: {
    isDryRun: boolean;
    isForce: boolean;
    isNoInstall: boolean;
    isVerbose: boolean;
    typescriptFlag: boolean;
    eslintFlag: boolean;
    darkModeFlag: boolean;
    tokensFlag: boolean;
    bundlesFromFlag: ComponentBundle[] | null;
    outputDirArg: string | null;
    dsNameFromArgs?: string | null;
    tokenPrefixFromArgs?: string | null;
    brandTaglineFromArgs?: string | null;
    brandVerticalsFromArgs?: string[] | null;
  },
): Promise<void> {
  const validFrameworks = TEMPLATES.map((t) => t.id as Framework);

  // Use both the template list check and the hardened validateFramework type guard
  if (!validFrameworks.includes(templateArg as Framework) || !validateFramework(templateArg)) {
    const result: ScaffoldJsonResult = {
      success: false,
      error: `Invalid template: "${templateArg}". Valid options: ${validFrameworks.join(', ')}`,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // Reject scoped names for frameworks that can't consume them (Stencil's
  // namespace, Ember's modulePrefix and asset URLs both choke on `/` /
  // `@`). validateProjectName itself permits scoped shapes for library
  // templates; the framework gate runs after we know which template was
  // picked.
  const scopeErr = validateScopedNameForFramework(name, templateArg);
  if (scopeErr) {
    const result: ScaffoldJsonResult = { success: false, error: scopeErr };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // Default the output directory to the UNSCOPED name. `@acme/design-system`
  // would otherwise create `./@acme/design-system/` as nested directories;
  // unscoping yields `./design-system/`. The package.json still records
  // the full scoped name; this only affects the on-disk folder layout.
  const directory =
    opts.outputDirArg !== null
      ? path.resolve(process.cwd(), opts.outputDirArg)
      : path.resolve(process.cwd(), unscopeName(name));

  // wc-storybook now seeds helix.storybook.config.ts.components.include
  // from these bundles, so a no-flag scaffold with the old ['core', 'forms']
  // default would hide every non-core/non-forms tag (navigation, layout,
  // feedback, etc.) until the consumer manually edited the config file.
  // Default to 'all' for wc-storybook so the catalog matches the
  // "full catalog out of the box" advertised behavior; other framework
  // templates keep the smaller default since they don't surface a catalog.
  const bundleDefault: ComponentBundle[] =
    templateArg === 'wc-storybook'
      ? (['all'] as ComponentBundle[])
      : (['core', 'forms'] as ComponentBundle[]);
  const bundles: ComponentBundle[] = opts.bundlesFromFlag ?? bundleDefault;

  // JSON-mode bypasses the interactive prompt entirely — apply the same
  // dsName / tokenPrefix regex here so wc-storybook scaffolds can't get a
  // path-traversal-shaped or invalid-identifier-shaped value through JSON
  // inputs that the interactive flow would have rejected.
  if (templateArg === 'wc-storybook') {
    if (opts.dsNameFromArgs !== null && opts.dsNameFromArgs !== undefined) {
      const err = validateDsName(opts.dsNameFromArgs);
      if (err) {
        const result: ScaffoldJsonResult = {
          success: false,
          error: `Invalid --ds-name "${opts.dsNameFromArgs}": ${err}`,
        };
        console.log(JSON.stringify(result, null, 2));
        process.exit(1);
      }
    }
    if (opts.tokenPrefixFromArgs !== null && opts.tokenPrefixFromArgs !== undefined) {
      const err = validateTokenPrefix(opts.tokenPrefixFromArgs);
      if (err) {
        const result: ScaffoldJsonResult = {
          success: false,
          error: `Invalid --token-prefix "${opts.tokenPrefixFromArgs}": ${err}`,
        };
        console.log(JSON.stringify(result, null, 2));
        process.exit(1);
      }
    }
    // When --ds-name is omitted in JSON mode, fall back to the project
    // name only IF it passes validateDsName. Project names like '123-ui'
    // or 'foo_bar' are valid npm names but invalid dsNames (leading
    // digit / underscore). The interactive + API paths gracefully
    // degrade to 'my-ds' — JSON mode now does the same so the supported
    // project-name surface is consistent across entry points. Explicit
    // --ds-name still validates strictly: when the caller supplies a
    // value, they get a real error, not a silent default.
    if (opts.dsNameFromArgs !== null && opts.dsNameFromArgs !== undefined) {
      const dsErr = validateDsName(opts.dsNameFromArgs);
      if (dsErr) {
        const result: ScaffoldJsonResult = {
          success: false,
          error: `Invalid --ds-name "${opts.dsNameFromArgs}": ${dsErr}`,
        };
        console.log(JSON.stringify(result, null, 2));
        process.exit(1);
      }
    }
    // Note: the scaffolder itself falls back to 'my-ds' when name is not
    // a valid dsName (see scaffoldWcStorybook entry), so JSON mode no
    // longer rejects those project names — automation gets the same
    // forgiveness as interactive/API.
  }

  // wc-storybook is a TypeScript + token-pipeline factory. The interactive
  // CLI and API both coerce typescript / designTokens to true regardless of
  // user input — JSON mode must do the same so `--json --template
  // wc-storybook --no-typescript` doesn't produce a broken scaffold where
  // tsconfig.json / token files are skipped while the generator still
  // emits .ts components.
  const isWcStorybook = templateArg === 'wc-storybook';
  const options: import('./types.js').ProjectOptions = {
    name,
    directory,
    framework: templateArg as Framework,
    componentBundles: bundles,
    typescript: isWcStorybook ? true : opts.typescriptFlag,
    eslint: opts.eslintFlag,
    designTokens: isWcStorybook ? true : opts.tokensFlag,
    darkMode: opts.darkModeFlag,
    installDeps: !opts.isNoInstall,
    dryRun: opts.isDryRun,
    force: opts.isForce,
    verbose: opts.isVerbose,
    // dsName: pass through explicit --ds-name when valid; otherwise
    // strip the @scope/ prefix and pass the basename when it's a valid
    // dsName, else undefined so the scaffolder falls back to 'my-ds'.
    // Same forgiveness as interactive + API paths — `@acme/design-system`
    // resolves to dsName='design-system', not 'my-ds'.
    dsName: (() => {
      if (opts.dsNameFromArgs) return opts.dsNameFromArgs;
      const candidate = unscopeName(name);
      return validateDsName(candidate) === undefined ? candidate : undefined;
    })(),
    // For wc-storybook, default tokenPrefix to --{validDsName} so the
    // consumer's brand layer gets its own namespace; defaulting to --hx
    // caused cyclic self-references in the bridge layer and dropped the
    // override surface. Other frameworks keep --hx (they don't emit a
    // brand bridge). Falls back to undefined when neither --token-prefix
    // nor a valid name is available — scaffolder then derives from its
    // resolved dsName ('my-ds' worst case).
    tokenPrefix: (() => {
      if (opts.tokenPrefixFromArgs) return opts.tokenPrefixFromArgs;
      if (templateArg !== 'wc-storybook') return '--hx';
      const candidate = opts.dsNameFromArgs ?? unscopeName(name);
      if (validateDsName(candidate) !== undefined) return undefined;
      // dsName='hx' would derive '--hx', which validateTokenPrefix rejects
      // as reserved. Match the scaffolder's special-case fallback so
      // `create-helix hx --json --template wc-storybook` succeeds.
      return candidate === 'hx' ? `--${candidate}-ds` : `--${candidate}`;
    })(),
    // Brand-storytelling fields — wc-storybook factory only. Optional with
    // cross-domain neutral defaults so JSON / --yes flows don't break and
    // sample copy honors the realistic-sample-data rule (no domain lock).
    brandTagline: opts.brandTaglineFromArgs ?? undefined,
    brandVerticals: opts.brandVerticalsFromArgs ?? undefined,
    // heroScenarios is too complex for a CLI flag in v1; consumers edit
    // helix.storybook.config.ts post-scaffold to populate scenes.
    heroScenarios: undefined,
  };

  try {
    await scaffoldProject(options);

    let files: string[];
    if (opts.isDryRun) {
      files = getDryRunEntries().map((e) => path.relative(directory, e.path));
    } else {
      files = await collectFiles(directory);
    }

    const timing = getLastScaffoldTiming();
    const result: ScaffoldJsonResult = {
      success: true,
      project: {
        name,
        directory,
        framework: templateArg,
        // Echo the EFFECTIVE flags (after wc-storybook coercion) so JSON
        // consumers see what was actually scaffolded, not the raw CLI
        // input. wc-storybook always emits TypeScript + tokens
        // regardless of --no-typescript / --no-tokens; reporting
        // `typescript: false` while the project contains tsconfig.json
        // and .ts sources misleads any tooling that reads this payload.
        typescript: options.typescript,
        eslint: options.eslint,
        darkMode: options.darkMode,
        designTokens: options.designTokens,
        bundles: bundles,
      },
      files,
      dryRun: opts.isDryRun,
      ...(timing !== null
        ? {
            timing: {
              totalMs: timing.totalMs,
              fileCount: timing.fileCount,
              bytesWritten: timing.bytesWritten,
              dependencyCount: timing.dependencyCount,
              phases: {
                validationMs: timing.phases.validationMs,
                templateResolutionMs: timing.phases.templateResolutionMs,
                fileGenerationMs: timing.phases.fileGenerationMs,
                fileWritingMs: timing.phases.fileWritingMs,
              },
            },
          }
        : {}),
    };
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result: ScaffoldJsonResult = { success: false, error: message };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

async function collectFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await collectFiles(full);
        results.push(...sub.map((f) => path.join(entry.name, f)));
      } else {
        results.push(entry.name);
      }
    }
  } catch {
    // directory may not exist or be unreadable
  }
  return results.sort();
}

export async function runCLI(): Promise<void> {
  const argv = process.argv.slice(2);

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    const isJsonMode = argv.includes('--json');
    const message = err instanceof Error ? err.message : String(err);
    if (isJsonMode) {
      console.log(JSON.stringify({ success: false, error: message }, null, 2));
    } else {
      console.error(message);
    }
    process.exit(1);
  }

  const {
    showVersion,
    subcommand,
    subcommandArg,
    showHelp,
    dryRun: isDryRun,
    force: isForce,
    noInstall: isNoInstallFromArgs,
    quiet: isQuiet,
    json: isJson,
    isDrupal,
    noConfig,
    verbose: isVerboseFromArgs,
    template: templateArgRaw,
    preset: presetArgFromCli,
    bundles: bundlesFromFlagRaw,
    outputDir: outputDirFromArgs,
    typescript: typescriptFlagRaw,
    eslint: eslintFlagRaw,
    darkMode: darkModeFlagRaw,
    tokens: tokensFlagRaw,
    explicitFlags,
    projectName,
    skipAudit,
    dsName: dsNameFromArgs,
    tokenPrefix: tokenPrefixFromArgs,
    brandTagline: brandTaglineFromArgs,
    brandVerticals: brandVerticalsFromArgs,
    showExperimental,
    doctorQuick,
    monorepo: monorepoFlag,
    noDesignSystem: noDesignSystemFlag,
  } = parsed;

  // Load config file and environment variables
  // Precedence: CLI flags > env vars > .helixrc.json > defaults
  let helixConfigResult: ReturnType<typeof loadConfig>;
  try {
    helixConfigResult = loadConfig(noConfig);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  }
  const { config: helixConfig } = helixConfigResult;
  const cfgDefaults = helixConfig.defaults ?? {};
  const envVars = readEnvVars();

  const templateArg = templateArgRaw ?? envVars.template ?? cfgDefaults.template ?? null;
  const bundlesFromFlag = bundlesFromFlagRaw ?? envVars.bundles ?? cfgDefaults.bundles ?? null;
  const typescriptFlag = explicitFlags.typescript
    ? typescriptFlagRaw
    : (envVars.typescript ?? cfgDefaults.typescript ?? true);
  const eslintFlag = explicitFlags.eslint
    ? eslintFlagRaw
    : (envVars.eslint ?? cfgDefaults.eslint ?? true);
  const darkModeFlag = explicitFlags.darkMode
    ? darkModeFlagRaw
    : (envVars.darkMode ?? cfgDefaults.darkMode ?? true);
  const tokensFlag = explicitFlags.tokens
    ? tokensFlagRaw
    : (envVars.tokens ?? cfgDefaults.tokens ?? true);
  const presetArg = presetArgFromCli ?? envVars.preset ?? null;
  const outputDirArg = outputDirFromArgs ?? envVars.outputDir ?? null;
  const isVerbose = isVerboseFromArgs || (envVars.verbose ?? false);
  const isNoInstall = isNoInstallFromArgs || (envVars.offline ?? false);

  // Start version check in background (non-blocking); display after prompts
  const updateCheckPromise: Promise<string | null> =
    !isJson && !isNoInstall
      ? checkForUpdate({ offline: isNoInstall, json: isJson })
      : Promise.resolve(null);

  if (showVersion) {
    console.log(`create-helix v${HELIX_VERSION}`);
    process.exit(0);
  }

  if (subcommand === 'list') {
    const { listAll } = await import('./commands/list.js');
    listAll(isJson, showExperimental);
    process.exit(0);
  }

  if (subcommand === 'info') {
    runInfoCommand(subcommandArg, isJson);
    process.exit(0);
  }

  if (subcommand === 'doctor') {
    const result = await runDoctor(HELIX_VERSION, { quick: doctorQuick });
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatDoctorOutput(result));
    }
    process.exit(result.allPassed ? 0 : 1);
  }

  if (subcommand === 'upgrade') {
    const { runUpgrade } = await import('./commands/upgrade.js');
    await runUpgrade(process.cwd(), { dryRun: isDryRun });
    process.exit(0);
  }

  if (subcommand === 'config') {
    if (subcommandArg === 'validate') {
      const { runConfigValidateCommand } = await import('./commands/config-validate.js');
      runConfigValidateCommand(process.cwd());
    } else if (subcommandArg === 'list-profiles') {
      const profiles = listProfiles();
      if (profiles.length === 0) {
        console.log('No profiles defined in .helixrc.json');
      } else {
        for (const name of profiles) {
          console.log(name);
        }
      }
    } else {
      console.error(
        `Unknown config subcommand: "${subcommandArg ?? ''}". Usage: create-helix config validate`,
      );
      process.exit(1);
    }
    process.exit(0);
  }

  if (showHelp) {
    // v0.6.0 Phase C — help lists production frameworks by default; an
    // experimental section is appended when --show-experimental is passed
    // so consumers can discover the full registry without the prompt.
    const productionList = TEMPLATES.filter((t) => !t.experimental);
    const experimentalList = TEMPLATES.filter((t) => t.experimental);
    const frameworkList = productionList.map((t) => `    ${t.id.padEnd(16)} ${t.hint}`).join('\n');
    const experimentalSection = showExperimental
      ? `\n  Experimental frameworks (stub-quality; surfaced via --show-experimental):\n` +
        experimentalList.map((t) => `    ${t.id.padEnd(16)} ${t.hint}`).join('\n') +
        '\n'
      : `\n  ${String(experimentalList.length)} experimental templates hidden. Use --show-experimental to see them.\n`;
    const presetList = PRESETS.map((pr) => `    ${pr.id.padEnd(16)} ${pr.description}`).join('\n');
    console.log(`
  create-helix v${HELIX_VERSION}

  Usage:
    npx create-helix [project-name] [options]

  Options:
    --force                 Overwrite existing files in a non-empty directory
    --dry-run               Show files that would be created without writing them
    --no-install            Skip dependency installation after scaffolding
    --quiet, -q             Suppress banner, spinners, and decorative output (CI-friendly)
    --verbose               Show detailed scaffolding output (files created, config used)
    --json                  Output scaffold result as JSON (suppresses all TUI output)
    --version, -v           Print version and exit
    --help, -h              Show this help message and exit

  Framework Selection:
    --template <name>       Select a framework directly (skips prompt)
    --show-experimental     Surface 13 stub-quality framework templates in
                            the interactive prompt, the 'list' subcommand,
                            and as valid --template values. Off by default.
    --monorepo              For react-next / react-vite, scaffold a
                            pnpm + turbo monorepo (apps/web + packages/
                            design-system + packages/types + packages/
                            utils). Skips the "Include @{scope}/design-
                            system?" prompt. Default for app frameworks
                            in interactive mode. Ignored for wc-storybook.
    --no-design-system      Opposite of --monorepo. Skip the prompt and
                            scaffold the flat (single-app) shape with no
                            packages/design-system alongside. Ignored
                            for wc-storybook.

  Available frameworks:
${frameworkList}
${experimentalSection}

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

  Environment Variables:
    HELIX_TEMPLATE=<name>     Framework template (same values as --template)
    HELIX_TYPESCRIPT=<bool>   Enable TypeScript (true/false/1/0/yes/no)
    HELIX_ESLINT=<bool>       Include ESLint + Prettier
    HELIX_DARK_MODE=<bool>    Enable dark mode support
    HELIX_TOKENS=<bool>       Include HELiX design tokens
    HELIX_BUNDLES=<list>      Component bundles (comma-separated)
    HELIX_OUTPUT_DIR=<path>   Custom output directory
    HELIX_PRESET=<name>       Drupal preset (same values as --preset)
    HELIX_VERBOSE=<bool>      Show detailed output
    HELIX_OFFLINE=<bool>      Skip dependency installation (offline mode)

    Precedence: CLI flags > env vars > .helixrc.json > defaults

  Examples:
    create-helix my-app                          # Interactive mode
    create-helix my-app --template react-next    # Skip framework prompt
    create-helix my-app --dry-run                # Preview without writing
    create-helix my-app --output-dir ./projects  # Custom output directory
    create-helix my-theme --drupal --preset blog # Drupal blog theme
    create-helix upgrade                         # Upgrade HELiX deps
    create-helix upgrade --dry-run               # Preview upgrade without writing
    create-helix doctor                          # Run environment health checks
    create-helix doctor --quick                  # Skip slow/filesystem-probe checks (CI)
    HELIX_TEMPLATE=react-vite create-helix app   # Use env var for template
`);
    process.exit(0);
  }

  if (outputDirArg !== null) {
    // SECURITY: Validate the output directory argument before resolving it to an
    // absolute path or attempting any filesystem operations.
    const dirError = validateDirectory(outputDirArg);
    if (dirError !== undefined) {
      console.error(`Invalid output directory: ${dirError}`);
      process.exit(1);
    }

    const resolvedOutputDir = path.resolve(process.cwd(), outputDirArg);
    try {
      fs.mkdirSync(resolvedOutputDir, { recursive: true });
      fs.accessSync(resolvedOutputDir, fs.constants.W_OK);
    } catch {
      console.error(`Output directory is not writable: "${resolvedOutputDir}"`);
      process.exit(1);
    }
  }

  if (isDrupal || presetArg !== null) {
    await runDrupalCLI(presetArg, isQuiet);
    return;
  }

  if (isJson) {
    if (projectName === null) {
      console.log(
        JSON.stringify(
          { success: false, error: 'Project name is required in --json mode' },
          null,
          2,
        ),
      );
      process.exit(1);
    }
    if (templateArg === null) {
      console.log(
        JSON.stringify({ success: false, error: '--template is required in --json mode' }, null, 2),
      );
      process.exit(1);
    }
    await runJsonScaffold(projectName, templateArg, {
      isDryRun,
      isForce,
      isNoInstall,
      isVerbose,
      typescriptFlag,
      eslintFlag,
      darkModeFlag,
      tokensFlag,
      bundlesFromFlag,
      outputDirArg,
      dsNameFromArgs,
      tokenPrefixFromArgs,
      brandTaglineFromArgs,
      brandVerticalsFromArgs,
    });
    return;
  }

  banner({
    asJson: isJson,
    suppressed: isQuiet,
    latestNpmVersion: getCachedLatestVersion() ?? undefined,
  });

  if (!isQuiet) p.intro(pc.bgCyan(pc.black(' create-helix ')));

  const project = await p.group(
    {
      name: () =>
        p.text({
          message: 'Project name',
          placeholder: 'my-helix-app',
          initialValue: projectName ?? '',
          validate: validateProjectName,
        }),

      framework: (ctx: { results: Record<string, unknown> } = { results: {} }) => {
        const resolveFramework = async (): Promise<Framework> => {
          // v0.7.0 Phase B — "Pick a starter kit" two-step prompt.
          //   Q1: What does this project build?
          //     wc-storybook (default) | react-next | react-vite
          //   Q2 (only when Q1 ∈ {react-next, react-vite}):
          //     Include @{scope}/design-system package?  (Y/n)
          //
          // Experimental gate (v0.6.0 Phase C) is preserved when
          // --show-experimental is passed: the extra templates are
          // appended to Q1 as a secondary group. The default 3-option
          // shape stays in place for the common case.
          // templateArg (--template=<id>) bypasses Q1 entirely; args.ts
          // already rejects hidden ids at parse time with a friendly hint.
          const promptTemplates = showExperimental
            ? TEMPLATES
            : TEMPLATES.filter((t) => !t.experimental);
          const fw =
            templateArg !== null
              ? (templateArg as Framework)
              : ((await p.select({
                  message: 'What does this project build?',
                  options: promptTemplates.map((t) => ({
                    value: t.id as Framework,
                    label: t.color(t.name),
                    hint:
                      t.id === 'wc-storybook'
                        ? 'Design system + Storybook (recommended for new projects)'
                        : t.id === 'react-next'
                          ? 'Next.js app'
                          : t.id === 'react-vite'
                            ? 'Vite SPA'
                            : t.id === 'astro'
                              ? 'Astro (web-components-native, static-first)'
                              : t.id === 'svelte-kit'
                                ? 'SvelteKit (web-components-native, runes + adapter-static)'
                                : t.hint,
                  })),
                  initialValue: 'wc-storybook' as Framework,
                })) as Framework);
          // Reject scoped names paired with non-library frameworks. By
          // the time the framework prompt resolves we know both pieces;
          // emit a clear error rather than letting Stencil/Ember choke
          // downstream on `@scope/...` interpolation in their config.
          const enteredName = (ctx.results.name as string | undefined) ?? '';
          const scopeErr = validateScopedNameForFramework(enteredName, fw);
          if (scopeErr) {
            p.cancel(scopeErr);
            process.exit(1);
          }
          return fw;
        };
        return resolveFramework();
      },

      // v0.7.0 Phase B — Q2: "Include @{scope}/design-system package?"
      // Only shown for app frameworks (react-next, react-vite). Default
      // is yes — every consumer building a Helix app wants the DS
      // alongside. --monorepo / --no-design-system skip the question.
      // wc-storybook (or any other framework) resolves to false (DS-only
      // scaffold isn't a monorepo wrap, and other frameworks have no
      // monorepo emitter yet in v0.7.0).
      includeDesignSystem: (ctx: { results: Record<string, unknown> } = { results: {} }) => {
        const fw = (ctx.results.framework as Framework | undefined) ?? null;
        const isAppFramework =
          fw === 'react-next' || fw === 'react-vite' || fw === 'astro' || fw === 'svelte-kit';
        if (!isAppFramework) {
          return Promise.resolve(false);
        }
        if (monorepoFlag) {
          return Promise.resolve(true);
        }
        if (noDesignSystemFlag) {
          return Promise.resolve(false);
        }
        return p.confirm({
          message: 'Include @{scope}/design-system package alongside?',
          initialValue: true,
        });
      },

      componentBundles: (ctx: { results: Record<string, unknown> } = { results: {} }) => {
        if (bundlesFromFlag !== null) return Promise.resolve(bundlesFromFlag as ComponentBundle[]);
        // wc-storybook seeds helix.storybook.config.ts.components.include
        // from this selection, so default to 'all' there — otherwise an
        // Enter-through-the-defaults scaffold would hide every non-core/
        // non-forms tag. Other framework templates keep ['core', 'forms']
        // since they don't surface a runtime catalog.
        const fw = ctx.results.framework as Framework | undefined;
        const initial: ComponentBundle[] =
          fw === 'wc-storybook'
            ? (['all'] as ComponentBundle[])
            : (['core', 'forms'] as ComponentBundle[]);
        return p.multiselect({
          message: 'Which component bundles? ' + pc.dim('(space to toggle, enter to confirm)'),
          options: COMPONENT_BUNDLES.map((b) => ({
            value: b.id as ComponentBundle,
            label: b.name,
            hint: b.description,
          })),
          initialValues: initial,
          required: true,
        });
      },

      features: () => {
        const defaultFeatures = [
          ...(typescriptFlag ? ['typescript'] : []),
          ...(eslintFlag ? ['eslint'] : []),
          ...(tokensFlag ? ['tokens'] : []),
          ...(darkModeFlag ? ['dark-mode'] : []),
          'examples',
        ];
        if (templateArg !== null) {
          return Promise.resolve(defaultFeatures);
        }
        return p.multiselect({
          message: 'Additional features',
          options: [
            { value: 'typescript', label: 'TypeScript' },
            { value: 'eslint', label: 'ESLint + Prettier' },
            { value: 'tokens', label: 'HELiX Design Tokens' },
            { value: 'dark-mode', label: 'Dark Mode Support' },
            { value: 'examples', label: 'Example Pages (forms, dashboard, settings)' },
          ],
          initialValues: defaultFeatures as (
            | 'typescript'
            | 'eslint'
            | 'tokens'
            | 'dark-mode'
            | 'examples'
          )[],
          required: false,
        });
      },

      dsName: (ctx: { results: Record<string, unknown> } = { results: {} }) => {
        const fw = (ctx.results.framework as string) ?? templateArg;
        if (fw !== 'wc-storybook') {
          return Promise.resolve(projectName ?? 'my-ds');
        }
        if (dsNameFromArgs !== null) {
          // Flag/JSON path used to interpolate the value verbatim — guard with
          // the same regex the interactive prompt enforces. Inputs like
          // `../../tmp` and `123_app` would otherwise reach scaffold output
          // paths and class names unchecked.
          const err = validateDsName(dsNameFromArgs);
          if (err) {
            console.error(`Invalid --ds-name "${dsNameFromArgs}": ${err}`);
            process.exit(1);
          }
          return Promise.resolve(dsNameFromArgs);
        }
        // Resolve the project name from the prompt-result context if the
        // user just typed it in this same wizard run — `projectName` is the
        // captured CLI positional which is null when invoked as plain
        // `npx create-helix`, so accepting defaults always seeded
        // dsName='my-ds' even when the user picked a great name like
        // 'acme-ui'. The interactive group records the typed name under
        // ctx.results.name; falling back to that gives sensible defaults.
        const enteredName = (ctx.results.name as string | undefined) ?? null;
        // Strip the @scope/ prefix before validating as a dsName candidate
        // so '@acme/design-system' surfaces 'design-system' as the prompt
        // default — same forgiveness as the JSON / API paths. Without this,
        // scoped names always fell back to 'my-ds' even though the
        // unscoped basename is itself a perfectly valid dsName.
        const rawDsDefault = dsNameFromArgs ?? enteredName ?? projectName ?? 'my-ds';
        const dsDefault = unscopeName(rawDsDefault);
        const dsInitial = validateDsName(dsDefault) === undefined ? dsDefault : 'my-ds';
        return p.text({
          message: 'Design system codename',
          placeholder: dsInitial,
          initialValue: dsInitial,
          validate: (v) => validateDsName(v),
        });
      },

      tokenPrefix: (ctx: { results: Record<string, unknown> } = { results: {} }) => {
        const fw = (ctx.results.framework as string) ?? templateArg;
        if (fw !== 'wc-storybook') {
          return Promise.resolve('--hx');
        }
        if (tokenPrefixFromArgs !== null) {
          // See validateDsName comment — same flag/JSON validation gap.
          const err = validateTokenPrefix(tokenPrefixFromArgs);
          if (err) {
            console.error(`Invalid --token-prefix "${tokenPrefixFromArgs}": ${err}`);
            process.exit(1);
          }
          return Promise.resolve(tokenPrefixFromArgs);
        }
        // Derive the default from dsName so the consumer's brand layer
        // gets its own --{ds}-* namespace by default. Defaulting to --hx
        // produced cyclic self-references in the generated bridge layer
        // (--hx-button-bg: var(--hx-button-bg, ...)) and silently
        // dropped the entire override surface.
        //
        // Special-case dsName='hx' to match the JSON/API derivations: the
        // literal '--hx' is reserved by validateTokenPrefix, so seeding
        // it as the prompt's initialValue would make Enter on the default
        // fail immediately.
        const dsResult = (ctx.results.dsName as string) ?? dsNameFromArgs ?? projectName ?? 'my-ds';
        const defaultPrefix = dsResult === 'hx' ? `--${dsResult}-ds` : `--${dsResult}`;
        return p.text({
          message: 'CSS token prefix',
          placeholder: defaultPrefix,
          initialValue: defaultPrefix,
          validate: (v) => validateTokenPrefix(v),
        });
      },

      brandTagline: (ctx: { results: Record<string, unknown> } = { results: {} }) => {
        const fw = (ctx.results.framework as string) ?? templateArg;
        // Brand-storytelling prompts are wc-storybook-only. Other frameworks
        // get an empty string here and the scaffolder applies a neutral default.
        if (fw !== 'wc-storybook') return Promise.resolve('');
        if (brandTaglineFromArgs !== null) return Promise.resolve(brandTaglineFromArgs);
        return p.text({
          message: 'Brand tagline ' + pc.dim('(rendered into Cover + Brand MDX)'),
          placeholder: 'Design system extending HELiX',
          initialValue: '',
        });
      },

      brandVerticals: (ctx: { results: Record<string, unknown> } = { results: {} }) => {
        const fw = (ctx.results.framework as string) ?? templateArg;
        if (fw !== 'wc-storybook') return Promise.resolve('');
        if (brandVerticalsFromArgs !== null) {
          return Promise.resolve(brandVerticalsFromArgs.join(','));
        }
        return p.text({
          message: 'Brand verticals ' + pc.dim('(comma-separated; empty = single-brand mode)'),
          placeholder: 'fintech, wellness',
          initialValue: '',
        });
      },

      installDeps: () =>
        isNoInstall
          ? Promise.resolve(false)
          : p.confirm({
              message: 'Install dependencies?',
              initialValue: true,
            }),
    },
    {
      onCancel() {
        p.cancel('Operation cancelled.');
        process.exit(0);
      },
    },
  );

  const options: ProjectOptions = {
    name: project.name as string,
    // Same unscoping as the JSON path: scoped names like
    // @acme/design-system land in ./design-system/ rather than nested
    // ./@acme/design-system/ directories. package.json records the full
    // scoped name; only the on-disk folder is unscoped.
    directory:
      outputDirArg !== null
        ? path.resolve(process.cwd(), outputDirArg)
        : path.resolve(process.cwd(), unscopeName(project.name as string)),
    framework: project.framework as Framework,
    componentBundles: project.componentBundles as ComponentBundle[],
    // wc-storybook is a Lit + TypeScript + token-pipeline factory. The
    // emitted scaffold ALWAYS uses TypeScript (strict mode for decorators)
    // and ALWAYS emits the token build pipeline (build-tokens.ts ->
    // tokens.css). Reading the generic features set here let users opt
    // out of flags the template requires, producing inconsistent output
    // (summary said "TypeScript: no" while the emitted tsconfig.json /
    // .ts files were unchanged). Force them on for wc-storybook so the
    // generated scaffold matches its own contract.
    typescript:
      project.framework === 'wc-storybook' || (project.features as string[]).includes('typescript'),
    eslint: (project.features as string[]).includes('eslint'),
    designTokens:
      project.framework === 'wc-storybook' || (project.features as string[]).includes('tokens'),
    darkMode: (project.features as string[]).includes('dark-mode'),
    installDeps: project.installDeps as boolean,
    dryRun: isDryRun,
    force: isForce,
    verbose: isVerbose,
    dsName: project.dsName as string,
    tokenPrefix: project.tokenPrefix as string,
    // Brand-storytelling fields. Empty string from non-wc-storybook frameworks
    // resolves to undefined so the scaffolder's neutral defaults kick in.
    brandTagline: ((project.brandTagline as string) ?? '').trim() || undefined,
    brandVerticals: (() => {
      const raw = ((project.brandVerticals as string) ?? '').trim();
      if (!raw) return undefined;
      const list = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return list.length > 0 ? list : undefined;
    })(),
    // heroScenarios deferred — consumers populate via helix.storybook.config.ts.
    heroScenarios: undefined,
    // v0.7.0 Phase B — derive monorepoMode from the prompt's Q2 answer.
    // wc-storybook coerces to false (DS-only scaffold). For app
    // frameworks, monorepoMode tracks the DS-include answer 1:1 — Phase
    // B doesn't ship the "monorepo without DS" combo. Phase A's stub
    // monorepo emitters throw "not yet implemented" until Phases D/E/F
    // fill them in.
    monorepoMode:
      project.framework === 'wc-storybook' ? false : (project.includeDesignSystem as boolean),
    includeDesignSystem:
      project.framework === 'wc-storybook' ? false : (project.includeDesignSystem as boolean),
  };

  const template = TEMPLATES.find((t) => t.id === options.framework);

  const s = p.spinner();

  if (isDryRun) {
    if (!isQuiet) s.start('Collecting files (dry run)...');
    await scaffoldProject(options);
    if (!isQuiet) s.stop(pc.cyan('Dry run complete'));

    if (!isQuiet) p.outro(pc.cyan('Dry run finished.') + ' ' + pc.dim('No files were written.'));
    return;
  }

  if (!isQuiet) s.start('Scaffolding project...');
  await scaffoldProject(options);
  if (!isQuiet) s.stop(pc.green('Project scaffolded'));

  // ── Dependency audit ─────────────────────────────────────────────────────
  if (!skipAudit) {
    // Audit every package the template adds to the consumer project, not
    // just `dependencies`. wc-storybook is a library-mode template that
    // puts almost the entire toolchain (Storybook, Vite, Playwright,
    // ESLint, Helix packages) in devDependencies + peerDependencies —
    // auditing only `dependencies` would silently skip vulnerability /
    // license coverage on most of the actual install footprint.
    const templateDeps = {
      ...(template?.dependencies ?? {}),
      ...(template?.devDependencies ?? {}),
      ...(template?.peerDependencies ?? {}),
    };
    const auditResult = await auditDependencies(templateDeps);
    if (!auditResult.networkError) {
      for (const v of auditResult.vulnerabilities) {
        p.log.warn(
          `${v.package}@${v.version} has ${v.count} ${v.severity} vulnerability/vulnerabilities`,
        );
      }
      for (const l of auditResult.licenseIssues) {
        p.log.warn(`${l.package}@${l.version} uses a non-standard license: ${l.license}`);
      }
    }
  }

  if (isNoInstall) {
    console.log(pc.dim('  Skipping dependency installation. Run `npm install` when ready.'));
  }

  if (options.installDeps) {
    if (!isQuiet) s.start('Installing dependencies...');
    // SECURITY: execSync is used here with hardcoded command strings — no
    // user input is interpolated into the shell command itself, so command
    // injection is not possible. The `cwd` option sets the working directory
    // to the scaffolded project folder, which is validated by:
    //   1. Project name regex (/^[a-z0-9-_]+$/i) — prevents path traversal
    //   2. path.resolve(process.cwd(), name) — produces an absolute path
    //   3. assertWithinBase() in scaffoldProject() — defense-in-depth check
    // stdio: 'pipe' suppresses noisy installer output from the terminal.
    const { execSync } = await import('node:child_process');
    try {
      execSync('pnpm install', {
        cwd: options.directory,
        stdio: 'pipe',
      });
      if (!isQuiet) s.stop(pc.green('Dependencies installed'));
      // wc-storybook ships scripts/generate-catalog.ts; run it now so the
      // ~120 hx-* catalog stories are populated BEFORE the consumer boots
      // Storybook for the first time. Without this, the sidebar shows
      // only the 8 Phase 2 component pages on first boot, which is a
      // confusing "where are the other components" UX (v0.6.0 Phase G).
      if (options.framework === 'wc-storybook') {
        if (!isQuiet) s.start('Generating component catalog (pnpm cem:catalog)...');
        try {
          execSync('pnpm cem:catalog', { cwd: options.directory, stdio: 'pipe' });
          if (!isQuiet) s.stop(pc.green('Component catalog generated'));
        } catch {
          if (!isQuiet)
            s.stop(pc.yellow('Catalog generation failed — run `pnpm cem:catalog` manually'));
        }
      }
    } catch {
      try {
        execSync('npm install', {
          cwd: options.directory,
          stdio: 'pipe',
        });
        if (!isQuiet) s.stop(pc.green('Dependencies installed (npm)'));
        if (options.framework === 'wc-storybook') {
          if (!isQuiet) s.start('Generating component catalog (npm run cem:catalog)...');
          try {
            execSync('npm run cem:catalog', { cwd: options.directory, stdio: 'pipe' });
            if (!isQuiet) s.stop(pc.green('Component catalog generated'));
          } catch {
            if (!isQuiet)
              s.stop(pc.yellow('Catalog generation failed — run `npm run cem:catalog` manually'));
          }
        }
      } catch {
        if (!isQuiet) s.stop(pc.yellow('Could not install dependencies — run manually'));
      }
    }
  }

  // For scoped names like @acme/design-system the scaffold lands at
  // ./design-system/, not ./@acme/design-system/. Print the actual on-disk
  // directory so the suggested `cd` command works as typed.
  const cdTarget =
    path.relative(process.cwd(), options.directory) || unscopeName(project.name as string);
  // wc-storybook scaffolds emit scripts/generate-catalog.ts. When the
  // consumer skipped --install-deps, surface an explicit cem:catalog
  // step in the next-steps banner so the HELiX/* sidebar populates on
  // first boot. When --install-deps ran, the catalog generation
  // already happened in the post-install block above (Phase G).
  const isWcStorybook = options.framework === 'wc-storybook';
  const needsManualCatalog = isWcStorybook && !options.installDeps;
  const nextSteps = [
    `cd ${cdTarget}`,
    ...(needsManualCatalog ? ['pnpm install', 'pnpm cem:catalog'] : []),
    options.framework === 'vanilla' ? 'open index.html' : 'npm run dev',
  ];

  if (!isQuiet) p.note(nextSteps.join('\n'), 'Next steps');

  console.log();
  console.log(pc.dim('  Project:    ') + pc.cyan(project.name as string));
  console.log(pc.dim('  Framework:  ') + (template?.color(template.name) ?? project.framework));
  console.log(pc.dim('  Directory:  ') + pc.white(options.directory));
  if (!isQuiet) {
    console.log(pc.dim('  TypeScript: ') + (options.typescript ? pc.green('yes') : pc.dim('no')));
    console.log(
      pc.dim('  Bundles:    ') +
        pc.white(
          options.componentBundles.includes('all')
            ? '98 components (full library)'
            : `${options.componentBundles.join(', ')}`,
        ),
    );
    console.log(
      pc.dim('  Features:   ') +
        pc.white(
          [
            options.eslint && 'ESLint',
            options.designTokens && 'Design Tokens',
            options.darkMode && 'Dark Mode',
          ]
            .filter(Boolean)
            .join(', ') || 'None',
        ),
    );
  }
  console.log();

  // ── Scaffold timing display ──────────────────────────────────────────────
  if (!isQuiet) {
    const scaffoldTiming = getLastScaffoldTiming();
    if (scaffoldTiming !== null) {
      const { totalMs, fileCount, bytesWritten, phases } = scaffoldTiming;
      let sizeStr: string;
      if (bytesWritten >= 1024 * 1024) {
        sizeStr = `${(bytesWritten / (1024 * 1024)).toFixed(2)} MB`;
      } else if (bytesWritten >= 1024) {
        sizeStr = `${(bytesWritten / 1024).toFixed(2)} KB`;
      } else {
        sizeStr = `${bytesWritten} B`;
      }
      console.log(pc.dim(`  Performance: ${totalMs}ms · ${fileCount} files · ${sizeStr}`));
      if (isVerbose) {
        console.log(pc.dim('  Per-phase timing:'));
        console.log(pc.dim(`    validation: ${phases.validationMs}ms`));
        console.log(pc.dim(`    template resolution: ${phases.templateResolutionMs}ms`));
        console.log(pc.dim(`    file generation: ${phases.fileGenerationMs}ms`));
        console.log(pc.dim(`    file writing: ${phases.fileWritingMs}ms`));
      }
    }
  }

  const updateMsg = await updateCheckPromise;
  if (updateMsg && !isQuiet) {
    logger.warn(updateMsg);
  }

  if (!isQuiet) p.outro(pc.green('Done!') + ' ' + pc.dim('Build something beautiful with HELiX.'));
}
