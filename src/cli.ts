import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { TEMPLATES, COMPONENT_BUNDLES, mergeWithCustomTemplates } from './templates.js';
import { loadCustomTemplates } from './custom-templates.js';
import { scaffoldProject, getDryRunEntries } from './scaffold.js';
import type { Framework, ComponentBundle, ProjectOptions, AnyTemplateConfig, CustomTemplateConfig } from './types.js';
import { isValidPreset, PRESETS } from './presets/loader.js';
import { scaffoldDrupalTheme } from './generators/drupal-theme.js';
import type { DrupalPreset } from './types.js';
import {
  validateProjectName,
  validateFramework,
  validatePreset,
  validateDirectory,
} from './validation.js';
import { parseArgs } from './args.js';
import { loadConfig, listProfiles, readEnvVars } from './config.js';
import { detectOffline } from './network.js';
import { runDoctor, formatDoctorOutput } from './doctor.js';
import { showTemplateInfo } from './commands/info.js';
import { auditDependencies } from './security/dep-audit.js';
import { checkForUpdate } from './version-check.js';
import { logger } from './logger.js';

const _require = createRequire(import.meta.url);
const pkg = _require('../package.json') as { version: string };
const HELIX_VERSION = pkg.version;

function banner(): void {
  console.log();
  console.log(pc.bold(pc.cyan('  ╭─────────────────────────────────────╮')));
  console.log(pc.bold(pc.cyan('  │                                     │')));
  console.log(
    pc.bold(
      pc.cyan('  │') +
        '   ' +
        pc.white('H E L i X') +
        '  ' +
        pc.dim('create') +
        '              ' +
        pc.cyan('│'),
    ),
  );
  console.log(
    pc.bold(pc.cyan('  │') + pc.dim('   Enterprise Web Components           ') + pc.cyan('│')),
  );
  console.log(
    pc.bold(
      pc.cyan('  │') +
        pc.dim(`   v${HELIX_VERSION}`) +
        '                              ' +
        pc.cyan('│'),
    ),
  );
  console.log(pc.bold(pc.cyan('  │                                     │')));
  console.log(pc.bold(pc.cyan('  ╰─────────────────────────────────────╯')));
  console.log();
}

async function runDrupalCLI(presetArg: string | null, isQuiet: boolean): Promise<void> {
  if (!isQuiet) banner();

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

  const nextSteps = [`Copy ${themeNameStr}/ to your Drupal themes directory`, 'drush cr'];

  if (!isQuiet) p.note(nextSteps.join('\n'), 'Next steps');

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

export function runListCommand(isJson: boolean, configFile?: string | null): void {
  if (isJson) {
    const output: {
      templates: { id: string; name: string; hint: string }[];
      presets: { id: string; name: string; description: string }[];
      configFile?: string | null;
    } = {
      templates: TEMPLATES.map((t) => ({ id: t.id, name: t.name, hint: t.hint })),
      presets: PRESETS.map((pr) => ({ id: pr.id, name: pr.name, description: pr.description })),
    };
    if (configFile !== undefined) {
      output.configFile = configFile;
    }
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log('');
  console.log(pc.bold('  Framework Templates'));
  console.log('');
  for (const t of TEMPLATES) {
    console.log(`  ${pc.cyan(t.id.padEnd(18))} ${pc.white(t.name.padEnd(26))} ${pc.dim(t.hint)}`);
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
    customTemplates?: CustomTemplateConfig[];
  },
): Promise<void> {
  const mergedTemplates =
    opts.customTemplates && opts.customTemplates.length > 0
      ? mergeWithCustomTemplates(opts.customTemplates)
      : TEMPLATES;
  const validIds = mergedTemplates.map((t) => t.id);

  // Built-in templates also require the hardened validateFramework type guard.
  // Custom templates bypass the Framework union check since their IDs are arbitrary strings.
  const isBuiltIn = validateFramework(templateArg);
  const isCustom = !isBuiltIn && validIds.includes(templateArg);

  if (!isBuiltIn && !isCustom) {
    const result: ScaffoldJsonResult = {
      success: false,
      error: `Invalid template: "${templateArg}". Valid options: ${validIds.join(', ')}`,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const directory =
    opts.outputDirArg !== null
      ? path.resolve(process.cwd(), opts.outputDirArg)
      : path.resolve(process.cwd(), name);

  const bundles: ComponentBundle[] =
    opts.bundlesFromFlag ?? (['core', 'forms'] as ComponentBundle[]);

  const options: import('./types.js').ProjectOptions = {
    name,
    directory,
    framework: templateArg as Framework,
    componentBundles: bundles,
    typescript: opts.typescriptFlag,
    eslint: opts.eslintFlag,
    designTokens: opts.tokensFlag,
    darkMode: opts.darkModeFlag,
    installDeps: !opts.isNoInstall,
    dryRun: opts.isDryRun,
    force: opts.isForce,
    verbose: opts.isVerbose,
    customTemplates:
      opts.customTemplates && opts.customTemplates.length > 0 ? opts.customTemplates : undefined,
  };

  try {
    await scaffoldProject(options);

    let files: string[];
    if (opts.isDryRun) {
      files = getDryRunEntries().map((e) => path.relative(directory, e.path));
    } else {
      files = await collectFiles(directory);
    }

    const result: ScaffoldJsonResult = {
      success: true,
      project: {
        name,
        directory,
        framework: templateArg,
        typescript: opts.typescriptFlag,
        eslint: opts.eslintFlag,
        darkMode: opts.darkModeFlag,
        designTokens: opts.tokensFlag,
        bundles: bundles,
      },
      files,
      dryRun: opts.isDryRun,
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

  // Fire offline detection as early as possible so the probe runs in parallel
  // with argument parsing, config loading, and other synchronous startup work.
  const offlineDetectPromise = detectOffline(500);

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
    skipAudit: isSkipAudit,
    offline: isOfflineFlag,
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
    profile: profileArg,
  } = parsed;

  // Load config file and environment variables
  // Precedence: CLI flags > env vars > .helixrc.json > defaults
  let helixConfigResult: ReturnType<typeof loadConfig>;
  try {
    helixConfigResult = loadConfig(noConfig, profileArg ?? undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
  const { config: helixConfig } = helixConfigResult;
  const cfgDefaults = helixConfig.defaults ?? {};
  const envVars = readEnvVars();

  const templateArg = templateArgRaw ?? envVars.template ?? cfgDefaults.template ?? null;
  const bundlesFromFlag = bundlesFromFlagRaw ?? envVars.bundles ?? cfgDefaults.bundles ?? null;

  // Load custom templates from templateDir (env var takes precedence over config file)
  const templateDirResolved =
    envVars.templateDir ?? helixConfig.templateDir ?? null;
  const customTemplates: CustomTemplateConfig[] =
    templateDirResolved !== null ? loadCustomTemplates(templateDirResolved) : [];
  // Merge built-ins with custom templates for display in TUI and validation
  const allTemplates: AnyTemplateConfig[] =
    customTemplates.length > 0 ? mergeWithCustomTemplates(customTemplates) : TEMPLATES;
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

  // Determine offline state: --offline flag or HELIX_OFFLINE env var short-circuits
  // the probe (no need to wait for a result we'll ignore). Otherwise await the
  // already-in-flight detectOffline promise that was started at the top of runCLI.
  const isOfflineFlagResolved = isOfflineFlag || (envVars.offline ?? false);
  const detectedOffline = isOfflineFlagResolved ? false : await offlineDetectPromise;
  const isOffline = isOfflineFlagResolved || detectedOffline;

  const isNoInstall = isNoInstallFromArgs || isOffline;
  const updateCheckPromise: Promise<string | null> =
    !parsed.json && !isOffline
      ? checkForUpdate({ offline: isOffline, json: parsed.json })
      : Promise.resolve(null);

  if (showVersion) {
    console.log(`create-helix v${HELIX_VERSION}`);
    process.exit(0);
  }

  if (subcommand === 'list') {
    const { listAll } = await import('./commands/list.js');
    listAll(isJson);
    process.exit(0);
  }

  if (subcommand === 'info') {
    runInfoCommand(subcommandArg, isJson);
    process.exit(0);
  }

  if (subcommand === 'doctor') {
    const result = await runDoctor(HELIX_VERSION, { offline: isOffline });
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatDoctorOutput(result));
    }
    process.exit(result.allPassed ? 0 : 1);
  }

  if (subcommand === 'upgrade') {
    const { runUpgrade } = await import('./commands/upgrade.js');
    await runUpgrade(process.cwd(), { dryRun: isDryRun, offline: isOffline });
    process.exit(0);
  }

  if (subcommand === 'config') {
    if (subcommandArg === 'list-profiles') {
      const profiles = listProfiles();
      if (profiles.length === 0) {
        console.log('No profiles defined in .helixrc.json');
      } else {
        for (const name of profiles) {
          console.log(name);
        }
      }
      process.exit(0);
    }
    console.error(`Unknown config subcommand: "${subcommandArg ?? ''}". Available: list-profiles`);
    process.exit(1);
  }

  if (showHelp) {
    const frameworkList = TEMPLATES.map((t) => `    ${t.id.padEnd(16)} ${t.hint}`).join('\n');
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
    --skip-audit            Skip dependency vulnerability and license audit
    --offline               Run in offline mode (skip network checks, use cached registry data)
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
      customTemplates: customTemplates.length > 0 ? customTemplates : undefined,
    });
    return;
  }

  if (!isQuiet) banner();

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

      framework: () =>
        templateArg !== null
          ? Promise.resolve(templateArg as Framework)
          : p.select({
              message: 'Which framework?',
              options: allTemplates.map((t) => ({
                value: t.id as Framework,
                label: t.color(t.name),
                hint: 'isCustom' in t ? `[custom] ${t.hint}` : t.hint,
              })),
            }),

      componentBundles: () =>
        bundlesFromFlag !== null
          ? Promise.resolve(bundlesFromFlag as ComponentBundle[])
          : p.multiselect({
              message: 'Which component bundles? ' + pc.dim('(space to toggle, enter to confirm)'),
              options: COMPONENT_BUNDLES.map((b) => ({
                value: b.id as ComponentBundle,
                label: b.name,
                hint: b.description,
              })),
              initialValues: ['core', 'forms'] as ComponentBundle[],
              required: true,
            }),

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
    directory:
      outputDirArg !== null
        ? path.resolve(process.cwd(), outputDirArg)
        : path.resolve(process.cwd(), project.name as string),
    framework: project.framework as Framework,
    componentBundles: project.componentBundles as ComponentBundle[],
    typescript: (project.features as string[]).includes('typescript'),
    eslint: (project.features as string[]).includes('eslint'),
    designTokens: (project.features as string[]).includes('tokens'),
    darkMode: (project.features as string[]).includes('dark-mode'),
    installDeps: project.installDeps as boolean,
    dryRun: isDryRun,
    force: isForce,
    verbose: isVerbose,
    customTemplates: customTemplates.length > 0 ? customTemplates : undefined,
  };

  const template = allTemplates.find((t) => t.id === options.framework);

  const s = p.spinner();

  // ── Dependency audit (before writing package.json) ────────────────────────
  if (!isSkipAudit && !isDryRun && template !== undefined) {
    if (!isQuiet) s.start('Auditing dependencies...');
    const auditResult = await auditDependencies(template.dependencies);
    if (!isQuiet) {
      if (auditResult.networkError) {
        s.stop(pc.yellow('Dependency audit skipped (network unavailable)'));
      } else {
        s.stop(pc.green('Dependencies audited'));
      }
    }

    if (!auditResult.networkError) {
      for (const vuln of auditResult.vulnerabilities) {
        const msg = `${vuln.package}@${vuln.version} has ${String(vuln.count)} ${vuln.severity} ${vuln.count === 1 ? 'vulnerability' : 'vulnerabilities'}`;
        if (!isQuiet) p.log.warn(`⚠ ${msg}`);
      }
      for (const lic of auditResult.licenseIssues) {
        const msg = `${lic.package}@${lic.version} uses non-standard license: ${lic.license}`;
        if (!isQuiet) p.log.warn(`⚠ ${msg}`);
      }
    }
  }

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
    } catch {
      try {
        execSync('npm install', {
          cwd: options.directory,
          stdio: 'pipe',
        });
        if (!isQuiet) s.stop(pc.green('Dependencies installed (npm)'));
      } catch {
        if (!isQuiet) s.stop(pc.yellow('Could not install dependencies — run manually'));
      }
    }
  }

  const nextSteps = [
    `cd ${project.name}`,
    options.framework === 'vanilla' ? 'open index.html' : 'npm run dev',
  ];

  if (!isQuiet) p.note(nextSteps.join('\n'), 'Next steps');

  console.log();
  console.log(pc.dim('  Project:    ') + pc.cyan(project.name as string));
  const frameworkLabel =
    template !== undefined
      ? template.color(template.name) + ('isCustom' in template ? pc.dim(' [custom]') : '')
      : String(project.framework);
  console.log(pc.dim('  Framework:  ') + frameworkLabel);
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

  const updateWarning = await updateCheckPromise;
  if (updateWarning !== null && !isQuiet) {
    logger.warn(updateWarning);
  }

  if (!isQuiet) p.outro(pc.green('Done!') + ' ' + pc.dim('Build something beautiful with HELiX.'));
}
