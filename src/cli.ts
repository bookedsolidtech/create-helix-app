import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { TEMPLATES, COMPONENT_BUNDLES } from './templates.js';
import { scaffoldProject, getDryRunEntries } from './scaffold.js';
import type { Framework, ComponentBundle, ProjectOptions } from './types.js';
import { isValidPreset, PRESETS } from './presets/loader.js';
import { scaffoldDrupalTheme } from './generators/drupal-theme.js';
import type { DrupalPreset } from './types.js';
import { validateProjectName } from './validation.js';
import { parseArgs } from './args.js';
import { loadConfig } from './config.js';
import { runDoctor, formatDoctorOutput } from './doctor.js';

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

  // Validate preset if provided via flag
  if (presetArg !== null && !isValidPreset(presetArg)) {
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

  const template = TEMPLATES.find((t) => t.id === templateId);
  if (template) {
    if (isJson) {
      console.log(
        JSON.stringify(
          {
            type: 'template',
            id: template.id,
            name: template.name,
            description: template.description,
            hint: template.hint,
            dependencies: template.dependencies,
            devDependencies: template.devDependencies,
            features: template.features,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log('');
    console.log(pc.bold('  ' + template.name));
    console.log(pc.dim('  ' + template.description));
    console.log('');
    console.log(pc.dim('  ID:   ') + pc.cyan(template.id));
    console.log(pc.dim('  Type: ') + pc.white('Framework Template'));
    console.log('');

    if (Object.keys(template.dependencies).length > 0) {
      console.log(pc.bold('  Dependencies'));
      for (const [pkg, version] of Object.entries(template.dependencies)) {
        console.log(`    ${pc.cyan(pkg.padEnd(36))} ${pc.dim(version)}`);
      }
      console.log('');
    }

    if (Object.keys(template.devDependencies).length > 0) {
      console.log(pc.bold('  Dev Dependencies'));
      for (const [pkg, version] of Object.entries(template.devDependencies)) {
        console.log(`    ${pc.cyan(pkg.padEnd(36))} ${pc.dim(version)}`);
      }
      console.log('');
    }

    if (template.features.length > 0) {
      console.log(pc.bold('  Features'));
      for (const feature of template.features) {
        console.log(`    ${pc.white('•')} ${feature}`);
      }
      console.log('');
    }
    return;
  }

  const preset = PRESETS.find((pr) => pr.id === templateId);
  if (preset) {
    if (isJson) {
      console.log(
        JSON.stringify(
          {
            type: 'preset',
            id: preset.id,
            name: preset.name,
            description: preset.description,
            sdcList: preset.sdcList,
            dependencies: preset.dependencies,
            architectureNotes: preset.architectureNotes,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log('');
    console.log(pc.bold('  ' + preset.name));
    console.log(pc.dim('  ' + preset.description));
    console.log('');
    console.log(pc.dim('  ID:   ') + pc.cyan(preset.id));
    console.log(pc.dim('  Type: ') + pc.white('Drupal Preset'));
    console.log('');

    if (preset.sdcList.length > 0) {
      console.log(pc.bold('  SDC Components'));
      for (const sdc of preset.sdcList) {
        console.log(`    ${pc.white('•')} ${sdc}`);
      }
      console.log('');
    }

    if (Object.keys(preset.dependencies).length > 0) {
      console.log(pc.bold('  Dependencies'));
      for (const [pkg, version] of Object.entries(preset.dependencies)) {
        console.log(`    ${pc.cyan(pkg.padEnd(36))} ${pc.dim(version)}`);
      }
      console.log('');
    }

    if (preset.architectureNotes) {
      console.log(pc.bold('  Architecture Notes'));
      console.log(`    ${pc.dim(preset.architectureNotes)}`);
      console.log('');
    }
    return;
  }

  // Not found — show error with suggestions
  const allIds = [...TEMPLATES.map((t) => t.id), ...PRESETS.map((pr) => pr.id)];
  const suggestions = allIds.filter(
    (id) => id.includes(templateId) || templateId.includes(id.split('-')[0]),
  );

  console.error(`Template or preset not found: "${templateId}"`);
  if (suggestions.length > 0) {
    console.error(`Did you mean: ${suggestions.join(', ')}?`);
  } else {
    console.error(`Available templates: ${TEMPLATES.map((t) => t.id).join(', ')}`);
    console.error(`Available presets: ${PRESETS.map((pr) => pr.id).join(', ')}`);
  }
  process.exit(1);
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
  },
): Promise<void> {
  const validFrameworks = TEMPLATES.map((t) => t.id as Framework);

  if (!validFrameworks.includes(templateArg as Framework)) {
    const result: ScaffoldJsonResult = {
      success: false,
      error: `Invalid template: "${templateArg}". Valid options: ${validFrameworks.join(', ')}`,
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
    noInstall: isNoInstall,
    quiet: isQuiet,
    json: isJson,
    isDrupal,
    noConfig,
    verbose: isVerbose,
    template: templateArgRaw,
    preset: presetArg,
    bundles: bundlesFromFlagRaw,
    outputDir: outputDirArg,
    typescript: typescriptFlagRaw,
    eslint: eslintFlagRaw,
    darkMode: darkModeFlagRaw,
    tokens: tokensFlagRaw,
    explicitFlags,
    projectName,
  } = parsed;

  // Load config file (built-in defaults → config file → CLI flags)
  const { config: helixConfig, configFile } = loadConfig(noConfig);
  const cfgDefaults = helixConfig.defaults ?? {};

  const templateArg = templateArgRaw ?? cfgDefaults.template ?? null;
  const bundlesFromFlag = bundlesFromFlagRaw ?? cfgDefaults.bundles ?? null;
  const typescriptFlag = explicitFlags.typescript
    ? typescriptFlagRaw
    : (cfgDefaults.typescript ?? true);
  const eslintFlag = explicitFlags.eslint ? eslintFlagRaw : (cfgDefaults.eslint ?? true);
  const darkModeFlag = explicitFlags.darkMode ? darkModeFlagRaw : (cfgDefaults.darkMode ?? true);
  const tokensFlag = explicitFlags.tokens ? tokensFlagRaw : (cfgDefaults.tokens ?? true);

  if (showVersion) {
    console.log(`create-helix v${HELIX_VERSION}`);
    process.exit(0);
  }

  if (subcommand === 'list') {
    runListCommand(isJson, configFile);
    process.exit(0);
  }

  if (subcommand === 'info') {
    runInfoCommand(subcommandArg, isJson);
    process.exit(0);
  }

  if (subcommand === 'doctor') {
    const result = await runDoctor(HELIX_VERSION);
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatDoctorOutput(result));
    }
    process.exit(result.allPassed ? 0 : 1);
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
`);
    process.exit(0);
  }

  if (outputDirArg !== null) {
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
              options: TEMPLATES.map((t) => ({
                value: t.id as Framework,
                label: t.color(t.name),
                hint: t.hint,
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

  if (!isQuiet) p.outro(pc.green('Done!') + ' ' + pc.dim('Build something beautiful with HELiX.'));
}
