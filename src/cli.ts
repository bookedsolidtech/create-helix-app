import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import { createRequire } from 'node:module';
import { TEMPLATES, COMPONENT_BUNDLES } from './templates.js';
import { scaffoldProject } from './scaffold.js';
import type { Framework, ComponentBundle, ProjectOptions } from './types.js';
import { isValidPreset, PRESETS } from './presets/loader.js';
import { scaffoldDrupalTheme } from './generators/drupal-theme.js';
import type { DrupalPreset } from './types.js';
import { validateProjectName } from './validation.js';

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

async function runDrupalCLI(presetArg: string | null): Promise<void> {
  banner();

  p.intro(pc.bgCyan(pc.black(' create-helix — Drupal theme ')));

  // Validate preset if provided via flag
  if (presetArg !== null && !isValidPreset(presetArg)) {
    console.error(
      `Invalid preset: "${presetArg}". Valid presets: standard, blog, healthcare, intranet`,
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
  s.start('Scaffolding Drupal theme...');

  await scaffoldDrupalTheme({ themeName: themeNameStr, directory, preset });

  s.stop(pc.green('Drupal theme scaffolded'));

  const nextSteps = [
    `cd ${themeNameStr}`,
    'npm install',
    `# Copy theme to: web/themes/custom/${themeNameStr}`,
    '# Enable in Drupal admin: /admin/appearance',
  ];

  p.note(nextSteps.join('\n'), 'Next steps');

  console.log();
  console.log(pc.dim('  Theme:  ') + pc.white(themeNameStr));
  console.log(pc.dim('  Preset: ') + pc.white(preset));
  console.log();

  p.outro(pc.green('Done!') + ' ' + pc.dim('Build something beautiful with HELiX + Drupal.'));
}

export async function runCLI(): Promise<void> {
  // Parse flags before prompting
  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`create-helix v${HELIX_VERSION}`);
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
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

  Examples:
    create-helix my-app                          # Interactive mode
    create-helix my-app --template react-next    # Skip framework prompt
    create-helix my-app --dry-run                # Preview without writing
    create-helix my-theme --drupal --preset blog # Drupal blog theme
`);
    process.exit(0);
  }

  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');
  const isNoInstall = args.includes('--no-install');
  const isDrupal = args.includes('--drupal');
  const typescriptFlag = args.includes('--no-typescript') ? false : true;
  const eslintFlag = args.includes('--no-eslint') ? false : true;
  const darkModeFlag = args.includes('--no-dark-mode') ? false : true;
  const tokensFlag = args.includes('--no-tokens') ? false : true;
  const presetArgIndex = args.indexOf('--preset');
  const presetArg = presetArgIndex !== -1 ? (args[presetArgIndex + 1] ?? null) : null;

  const templateArgIndex = args.indexOf('--template');
  const templateArg = templateArgIndex !== -1 ? (args[templateArgIndex + 1] ?? null) : null;
  const validFrameworks = TEMPLATES.map((t) => t.id as Framework);

  if (templateArg !== null && !validFrameworks.includes(templateArg as Framework)) {
    console.error(
      `Invalid template: "${templateArg}". Valid options: ${validFrameworks.join(', ')}`,
    );
    process.exit(1);
  }

  const bundlesArgIndex = args.indexOf('--bundles');
  const bundlesArg = bundlesArgIndex !== -1 ? (args[bundlesArgIndex + 1] ?? null) : null;
  const validBundles = COMPONENT_BUNDLES.map((b) => b.id as ComponentBundle);

  let bundlesFromFlag: ComponentBundle[] | null = null;
  if (bundlesArg !== null) {
    const requested = bundlesArg.split(',').map((s) => s.trim()) as ComponentBundle[];
    const invalid = requested.filter((b) => !validBundles.includes(b));
    if (invalid.length > 0) {
      console.error(
        `Invalid bundle(s): ${invalid.map((b) => `"${b}"`).join(', ')}. Valid options: ${validBundles.join(', ')}`,
      );
      process.exit(1);
    }
    bundlesFromFlag = requested;
  }

  if (isDrupal || presetArg !== null) {
    await runDrupalCLI(presetArg);
    return;
  }

  banner();

  p.intro(pc.bgCyan(pc.black(' create-helix ')));

  const argName = process.argv[2];

  const project = await p.group(
    {
      name: () =>
        p.text({
          message: 'Project name',
          placeholder: 'my-helix-app',
          initialValue: argName ?? '',
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
    directory: path.resolve(process.cwd(), project.name as string),
    framework: project.framework as Framework,
    componentBundles: project.componentBundles as ComponentBundle[],
    typescript: (project.features as string[]).includes('typescript'),
    eslint: (project.features as string[]).includes('eslint'),
    designTokens: (project.features as string[]).includes('tokens'),
    darkMode: (project.features as string[]).includes('dark-mode'),
    installDeps: project.installDeps as boolean,
    dryRun: isDryRun,
    force: isForce,
  };

  const template = TEMPLATES.find((t) => t.id === options.framework);

  const s = p.spinner();

  if (isDryRun) {
    s.start('Collecting files (dry run)...');
    await scaffoldProject(options);
    s.stop(pc.cyan('Dry run complete'));

    p.outro(pc.cyan('Dry run finished.') + ' ' + pc.dim('No files were written.'));
    return;
  }

  s.start('Scaffolding project...');
  await scaffoldProject(options);
  s.stop(pc.green('Project scaffolded'));

  if (isNoInstall) {
    console.log(pc.dim('  Skipping dependency installation. Run `npm install` when ready.'));
  }

  if (options.installDeps) {
    s.start('Installing dependencies...');
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
      s.stop(pc.green('Dependencies installed'));
    } catch {
      try {
        execSync('npm install', {
          cwd: options.directory,
          stdio: 'pipe',
        });
        s.stop(pc.green('Dependencies installed (npm)'));
      } catch {
        s.stop(pc.yellow('Could not install dependencies — run manually'));
      }
    }
  }

  const nextSteps = [
    `cd ${project.name}`,
    options.framework === 'vanilla' ? 'open index.html' : 'pnpm dev',
  ];

  p.note(nextSteps.join('\n'), 'Next steps');

  console.log();
  console.log(pc.dim('  Framework:  ') + (template?.color(template.name) ?? project.framework));
  console.log(
    pc.dim('  Components: ') +
      pc.white(
        options.componentBundles.includes('all')
          ? '98 components (full library)'
          : `${options.componentBundles.length} bundle(s)`,
      ),
  );
  console.log(
    pc.dim('  Features:   ') +
      pc.white(
        [
          options.typescript && 'TypeScript',
          options.eslint && 'ESLint',
          options.designTokens && 'Design Tokens',
          options.darkMode && 'Dark Mode',
        ]
          .filter(Boolean)
          .join(', ') || 'None',
      ),
  );
  console.log();

  p.outro(pc.green('Done!') + ' ' + pc.dim('Build something beautiful with HELiX.'));
}
