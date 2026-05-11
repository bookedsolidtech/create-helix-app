/**
 * v0.7.0 Phase C — Monorepo root orchestrator.
 *
 * Emits the 7 root artifacts shared by every monorepo emit shape:
 *
 *   pnpm-workspace.yaml
 *   turbo.json                (turbo 2.x schema — `tasks`, not 1.x `pipeline`)
 *   package.json              (workspace root; scripts fan out via turbo)
 *   tsconfig.json             (composite project references)
 *   README.md                 (consumer-facing intro to the monorepo)
 *   .gitignore                (workspace-aware ignores)
 *   apps/web/ + packages/{design-system,types,utils}/   (empty dirs; Phases D/E/F/G fill)
 *
 * Called from the per-framework monorepo emitters
 * (src/scaffold/{react-next,react-vite,wc-storybook}/monorepo.ts) BEFORE
 * they emit their app/DS-specific content. After Phase C this orchestrator
 * works end-to-end even though the framework bodies still throw — that's
 * the contract that lets us test the root structure independently.
 *
 * `includeDesignSystem === false` omits packages/design-system entirely:
 * the directory isn't created, the tsconfig reference is dropped, and the
 * root `storybook` / `build-storybook` scripts are omitted from package.json.
 */
import path from 'node:path';
import type { ProjectOptions } from '../types.js';
import { safeEnsureDir, safeWriteFile, safeWriteJson } from '../scaffold.js';
import { unscopeName } from '../validation.js';

export interface ScaffoldMonorepoRootInput {
  options: ProjectOptions;
}

/**
 * Derive the npm scope used to name workspace packages.
 *
 *   '@acme/foo'   → 'acme'
 *   'aurora-kit'  → 'aurora-kit'
 *
 * The fallback (unscoped name) keeps workspace package names predictable
 * for projects that haven't claimed an npm scope yet — they ship as
 * `@aurora-kit/design-system` and the consumer renames if they ever
 * publish under a real scope.
 */
function deriveScope(projectName: string): string {
  if (projectName.startsWith('@')) {
    const slash = projectName.indexOf('/');
    if (slash > 1) return projectName.slice(1, slash);
  }
  return unscopeName(projectName);
}

/**
 * Emit the shared root files for a v0.7.0 monorepo scaffold. Idempotent:
 * a second run over the same directory produces byte-identical output
 * (no timestamps, no random IDs, no version drift).
 */
export async function scaffoldMonorepoRoot(input: ScaffoldMonorepoRootInput): Promise<void> {
  const { options } = input;
  const includeDesignSystem = options.includeDesignSystem ?? false;
  const scope = deriveScope(options.name);
  const dsPackageName = `@${scope}/design-system`;

  // 1. pnpm-workspace.yaml — pnpm reads this to know which dirs are packages.
  //    Quoted single-quote globs match the project plan exactly and avoid
  //    YAML's flow-style ambiguity around the leading * character.
  const pnpmWorkspace = `packages:
  - 'apps/*'
  - 'packages/*'
`;
  await safeWriteFile(path.join(options.directory, 'pnpm-workspace.yaml'), pnpmWorkspace);

  // 2. turbo.json — turbo 2.x schema. The breaking change vs 1.x is that
  //    `pipeline` was renamed to `tasks`. The `$schema` URL is the same
  //    canonical URL across versions; turbo picks the active version's
  //    schema based on the installed CLI. `ui: "tui"` enables the modern
  //    multi-pane runner UI.
  const turboJson: Record<string, unknown> = {
    $schema: 'https://turbo.build/schema.json',
    ui: 'tui',
    tasks: {
      build: {
        dependsOn: ['^build'],
        outputs: ['dist/**', '.next/**', '!.next/cache/**', 'storybook-static/**'],
      },
      dev: {
        cache: false,
        persistent: true,
      },
      test: {
        dependsOn: ['^build'],
        outputs: [],
      },
      lint: {
        dependsOn: ['^build'],
        outputs: [],
      },
      'type-check': {
        dependsOn: ['^build'],
        outputs: [],
      },
      storybook: {
        cache: false,
        persistent: true,
      },
    },
  };
  await safeWriteJson(path.join(options.directory, 'turbo.json'), turboJson, { spaces: 2 });

  // 3. Root package.json — workspace root, scripts fan out via turbo.
  //    storybook + build-storybook scripts only emitted when the DS package
  //    is part of the workspace; without it the --filter target wouldn't
  //    resolve and `npm run storybook` would print a confusing turbo error.
  const rootScripts: Record<string, string> = {
    build: 'turbo run build',
    dev: 'turbo run dev',
    test: 'turbo run test',
    lint: 'turbo run lint',
    'type-check': 'turbo run type-check',
  };
  if (includeDesignSystem) {
    rootScripts['storybook'] = `turbo run storybook --filter=${dsPackageName}`;
    rootScripts['build-storybook'] = `turbo run build --filter=${dsPackageName}`;
  }
  rootScripts['format'] = 'prettier --write "**/*.{ts,tsx,md,json,yaml,yml,css}"';
  rootScripts['format:check'] = 'prettier --check "**/*.{ts,tsx,md,json,yaml,yml,css}"';

  const rootPkg = {
    name: options.name,
    version: '0.0.0',
    private: true,
    workspaces: ['apps/*', 'packages/*'],
    scripts: rootScripts,
    devDependencies: {
      turbo: '^2.0.0',
      typescript: '^5.0.0',
      prettier: '^3.0.0',
    },
    packageManager: 'pnpm@9.15.9',
    engines: {
      node: '^22.0.0 || ^24.0.0',
      pnpm: '>=9',
    },
  };
  await safeWriteJson(path.join(options.directory, 'package.json'), rootPkg, { spaces: 2 });

  // 4. Root tsconfig.json — composite project references. Each per-package
  //    tsconfig.json carries the actual `compilerOptions`; the root file is
  //    purely a build-order graph. Skipping the design-system reference when
  //    the package isn't being created keeps `tsc -b` from erroring on a
  //    dangling path.
  const tsReferences: Array<{ path: string }> = [{ path: './apps/web' }];
  if (includeDesignSystem) {
    tsReferences.push({ path: './packages/design-system' });
  }
  tsReferences.push({ path: './packages/types' }, { path: './packages/utils' });
  const rootTsconfig = {
    files: [],
    references: tsReferences,
  };
  await safeWriteJson(path.join(options.directory, 'tsconfig.json'), rootTsconfig, { spaces: 2 });

  // 5. Root README.md — consumer-facing intro. Keep it intentionally short;
  //    consumers usually navigate straight to apps/web or packages/design-system.
  //    MIGRATING.md is referenced but written in Phase I — link is forward-
  //    compatible (404 in Phase C, populated by I).
  const dsBullet = includeDesignSystem
    ? `- \`packages/design-system/\` — the ${dsPackageName} component library. Storybook lives here.\n`
    : '';
  const dsRunHint = includeDesignSystem
    ? '\n- `npm run storybook` — start the design-system Storybook (filters to `packages/design-system/`).'
    : '';
  const readme = `# ${options.name}

A HELiX-powered monorepo scaffolded with [create-helix](https://www.npmjs.com/package/create-helix).

## Layout

- \`apps/web/\` — the application surface.
${dsBullet}- \`packages/types/\` — shared TypeScript types consumed across the workspace.
- \`packages/utils/\` — shared utilities consumed across the workspace.

## Workflow

This workspace is orchestrated by [Turborepo](https://turborepo.com) over
[pnpm workspaces](https://pnpm.io/workspaces). The root scripts fan out to
each package via \`turbo run <task>\`.

\`\`\`bash
pnpm install
pnpm dev          # turbo run dev — runs every package's dev script in parallel
pnpm build        # turbo run build — topologically ordered build${dsRunHint}
\`\`\`

Per-package commands live inside each package's own \`package.json\`. Turbo
caches successful task outputs, so re-runs of unchanged packages are
near-instant.

## Migrating from a flat scaffold

See [MIGRATING.md](./MIGRATING.md) for guidance on moving a v0.6.x flat
scaffold into this monorepo shape.
`;
  await safeWriteFile(path.join(options.directory, 'README.md'), readme);

  // 6. Root .gitignore — workspace-aware. Covers node_modules at every depth
  //    (pnpm hoists some packages to the root, others land in the per-package
  //    node_modules), turbo's cache, all per-framework build artifacts we
  //    expect to see somewhere in the tree, and the usual editor/OS noise.
  //
  //    The trailing newline is load-bearing for the idempotency test —
  //    fs.writeFile + a missing trailing newline produces a different byte
  //    count vs. an editor that auto-adds one, and re-runs of the
  //    orchestrator would then differ from manually-touched files.
  const gitignore = `# Dependencies
node_modules/

# Turbo
.turbo/

# Build outputs
dist/
build/
.next/
.nuxt/
.svelte-kit/
.astro/
storybook-static/

# TypeScript build info
*.tsbuildinfo

# Env files
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*

# OS / editor
.DS_Store
Thumbs.db
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
`;
  await safeWriteFile(path.join(options.directory, '.gitignore'), gitignore);

  // 7. Empty placeholder dirs for the packages that Phases D/E/F/G fill.
  //    safeEnsureDir is dry-run aware (records nothing for empty dirs, which
  //    is the documented behavior — `--dry-run` reports files, not dirs).
  await safeEnsureDir(path.join(options.directory, 'apps'));
  await safeEnsureDir(path.join(options.directory, 'apps', 'web'));
  await safeEnsureDir(path.join(options.directory, 'packages'));
  await safeEnsureDir(path.join(options.directory, 'packages', 'types'));
  await safeEnsureDir(path.join(options.directory, 'packages', 'utils'));
  if (includeDesignSystem) {
    await safeEnsureDir(path.join(options.directory, 'packages', 'design-system'));
  }
}
