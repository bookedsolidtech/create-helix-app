import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { getTemplate, getComponentsForBundles } from './templates.js';
import type { ProjectOptions, AnyTemplateConfig } from './types.js';
import { HelixError, ErrorCode } from './errors.js';
import { validateDsName, validateTokenPrefix, unscopeName } from './validation.js';
import { HookManager, buildHookContext } from './plugins/hooks.js';
import { loadHelixRcHooks } from './plugins/config-loader.js';
import { discoverPlugins } from './plugins/plugin-discovery.js';
import {
  contrastSrc,
  useResolvedTokenSrc,
  ratioCardSrc,
  tokenSwatchGridSrc,
  tokenRefSrc,
  codeBlockSrc,
  codeTabsSrc,
  contrastMatrixSrc,
  eyebrowHeadingSrc,
  sectionHeadSrc,
  statCardSrc,
  docsCardSrc,
} from './scaffold/wc-storybook/helpers.js';
import { inlineAuditPanelStubSrc } from './scaffold/wc-storybook/audit-stub.js';
import { getComponentMdxEmissions } from './scaffold/wc-storybook/mdx-components.js';
import { getAccessibilityMdxEmissions } from './scaffold/wc-storybook/mdx-accessibility.js';

// ---------------------------------------------------------------------------
// SECURITY: HTML sanitization
// ---------------------------------------------------------------------------

/**
 * Encode characters that are meaningful in HTML to prevent XSS when
 * interpolating user input (e.g. project name) into generated HTML files.
 *
 * Encodes: & < > " '
 */
export function sanitizeForHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Content Security Policy meta tag added to all generated HTML files.
 * Restricts scripts and default sources to same-origin; allows inline styles
 * because many component libraries (including HELiX) inject scoped styles.
 */
const CSP_META =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'\" />";

// ---------------------------------------------------------------------------
// Dry-run infrastructure
// Module-level state is safe for a single-threaded CLI process.
// ---------------------------------------------------------------------------

let _dryRunActive = false;
interface _DryRunEntry {
  path: string;
  size: number;
}
let _dryRunEntries: _DryRunEntry[] = [];

/**
 * Returns the dry-run entries collected during the last dry-run scaffold.
 * Used by --json mode to include the file list in JSON output.
 */
export function getDryRunEntries(): { path: string; size: number }[] {
  return [..._dryRunEntries];
}

/** Timing data shape — mirrors the ScaffoldTimingJson interface in cli.ts. */
export interface ScaffoldTiming {
  totalMs: number;
  phases: {
    validationMs: number;
    templateResolutionMs: number;
    fileGenerationMs: number;
    fileWritingMs: number;
  };
  fileCount: number;
  bytesWritten: number;
  dependencyCount: number;
}

let _lastTiming: ScaffoldTiming | null = null;

export function getLastScaffoldTiming(): ScaffoldTiming | null {
  return _lastTiming;
}

async function safeWriteFile(filePath: string, content: string): Promise<void> {
  if (_dryRunActive) {
    _dryRunEntries.push({ path: filePath, size: Buffer.byteLength(content, 'utf8') });
    return;
  }
  await fs.writeFile(filePath, content);
}

/**
 * Escape user-supplied prose before embedding it into a generated MDX file.
 * MDX-significant characters (`<`, `{`, `}`, `` ` ``) survive raw interpolation
 * and break the doc compiler — `Care < Chaos` becomes the start of a JSX tag
 * during `storybook build`. We escape them as HTML entities, which MDX
 * preserves through to the rendered output as the literal characters.
 *
 * Used for brandTagline, brandVerticals, and heroScenarios — anything the
 * caller passes through ProjectOptions or the Phase 1 prompts. NOT used for
 * code spans / fenced code where the raw value is the point.
 */
function escapeMdxText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/`/g, '&#96;');
}

async function safeWriteJson(
  filePath: string,
  data: unknown,
  opts?: { spaces: number },
): Promise<void> {
  if (_dryRunActive) {
    const json = JSON.stringify(data, null, opts?.spaces ?? 2);
    _dryRunEntries.push({ path: filePath, size: Buffer.byteLength(json, 'utf8') });
    return;
  }
  await fs.writeJson(filePath, data, opts ?? { spaces: 2 });
}

async function safeEnsureDir(dirPath: string): Promise<void> {
  if (_dryRunActive) return;
  await fs.ensureDir(dirPath);
}

async function safeCopyDir(src: string, dest: string): Promise<void> {
  if (_dryRunActive) return;
  await fs.copy(src, dest);
}

/**
 * Dry-run-safe single-file copy. Records the destination + size in the
 * dry-run entries (so `--dry-run` reports exactly what would land on
 * disk) and short-circuits before any actual write. Use this for any
 * static asset copy at scaffold time — bare fs.copy() bypasses the
 * dry-run contract and writes anyway, which silently changes consumer
 * state during a "preview" command.
 */
async function safeCopyFile(src: string, dest: string): Promise<void> {
  if (_dryRunActive) {
    try {
      const stat = await fs.stat(src);
      _dryRunEntries.push({ path: dest, size: stat.size });
    } catch {
      _dryRunEntries.push({ path: dest, size: 0 });
    }
    return;
  }
  await fs.copy(src, dest);
}

async function walkDirRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkDirRecursive(full)));
    } else {
      results.push(full);
    }
  }
  return results;
}

function printDryRunTree(baseDir: string, entries: _DryRunEntry[]): void {
  // Build relative paths and sort
  const files = entries
    .map((e) => ({
      rel: path.relative(baseDir, e.path),
      size: e.size,
    }))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  // Compute totals
  const totalFiles = files.length;
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const formattedSize =
    totalBytes < 1024
      ? `${totalBytes} B`
      : totalBytes < 1024 * 1024
        ? `${(totalBytes / 1024).toFixed(1)} KB`
        : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;

  console.log();
  console.log(pc.bold(pc.cyan('  Dry run — files that would be created:')));
  console.log(pc.dim(`  ${path.basename(baseDir)}/`));

  // Simple tree rendering: group by first directory segment
  for (const { rel, size } of files) {
    const parts = rel.split(path.sep);
    const indent = '  ' + '  '.repeat(parts.length - 1);
    const name = parts[parts.length - 1];
    const sizeLabel = size < 1024 ? `${size}B` : `${(size / 1024).toFixed(1)}KB`;
    console.log(`${indent}${pc.dim('├─')} ${pc.white(name)} ${pc.dim(`(${sizeLabel})`)}`);
  }

  console.log();
  console.log(
    pc.bold(`  ${pc.green(String(totalFiles))} files`) + pc.dim(`, estimated ${formattedSize}`),
  );
  console.log();
  console.log(pc.dim('  No files were written. Remove --dry-run to scaffold.'));
  console.log();
}

/**
 * SECURITY: Path traversal guard.
 *
 * Validates that `targetPath` does not contain directory traversal sequences
 * (e.g. "../", "..\\", or percent-encoded variants that normalize to "..").
 * Throws if any path segment is "..".
 *
 * The CLI already blocks traversal sequences through input validation
 * (project names match /^[a-z0-9-_]+$/i), but this check guards the
 * programmatic API against misuse where callers may not apply the same
 * sanitization.
 */
function assertNoPathTraversal(targetPath: string): void {
  // Normalize to OS path separators before splitting so that cross-platform
  // variants (forward slash on Windows, etc.) are handled uniformly.
  const normalized = path.normalize(targetPath);
  const segments = normalized.split(path.sep);
  if (segments.includes('..')) {
    throw new HelixError(
      ErrorCode.PATH_TRAVERSAL,
      `Security: path "${targetPath}" contains directory traversal sequences. ` +
        `Aborting to prevent unauthorized file system access.`,
    );
  }
}

function getScaffoldErrorMessage(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES') return 'Cannot write to directory. Check permissions.';
    if (code === 'ENOSPC') return 'Disk full. Free some space and try again.';
    if (code === 'EEXIST')
      return 'Directory already exists and is not empty. Choose a different name or use --force.';
  }
  return null;
}

export async function scaffoldProject(options: ProjectOptions): Promise<void> {
  const scaffoldStart = performance.now();
  _lastTiming = null;

  const logVerbose = (msg: string): void => {
    if (options.verbose) console.log(pc.dim(`  [verbose] ${msg}`));
  };

  const validationStart = performance.now();
  const template = getTemplate(options.framework);
  if (!template) {
    throw new HelixError(ErrorCode.UNKNOWN_FRAMEWORK, `Unknown framework: ${options.framework}`);
  }

  logVerbose(`Template: ${template.id} (${template.name})`);
  logVerbose(`Directory: ${options.directory}`);

  // SECURITY: Validate the output directory path before writing any files.
  // Defense-in-depth: CLI validates project names via /^[a-z0-9-_]+$/i, making
  // traversal sequences impossible through normal usage. This check protects
  // programmatic API callers that may not apply the same sanitization.
  assertNoPathTraversal(options.directory);
  const validationMs = performance.now() - validationStart;

  // Check if directory exists and is non-empty
  const dirExists = await fs.pathExists(options.directory);
  if (dirExists) {
    const entries = await fs.readdir(options.directory);
    if (entries.length > 0) {
      if (!options.force) {
        console.error(`Error: Directory exists and is not empty: ${options.directory}`);
        process.exit(1);
      }
      console.warn(pc.yellow(`Warning: overwriting existing files in ${options.directory}`));
    }
  }

  // Activate dry-run collection if requested
  if (options.dryRun) {
    _dryRunActive = true;
    _dryRunEntries = [];
  }

  // Track whether the directory existed before scaffolding, for cleanup on failure.
  const dirExistedBefore = await fs.pathExists(options.directory);

  // Set up plugin hook system
  const hookManager = new HookManager();
  const projectRoot = process.cwd();

  // Load hooks from .helixrc.json (silent if not present)
  const rcHooks = await loadHelixRcHooks(projectRoot);
  for (const { lifecycle, hook } of rcHooks) {
    hookManager.register(lifecycle, hook);
  }

  // Auto-discover plugins from node_modules (warnings logged; never fatal)
  const pluginHooks = await discoverPlugins(projectRoot);
  for (const { name, lifecycle, hook } of pluginHooks) {
    hookManager.register(lifecycle, hook);
    void name; // name used for plugin identification only
  }

  // Build initial hook context
  const hookCtx = buildHookContext(options.name, options.directory, {
    ...(options as unknown as Record<string, unknown>),
  });

  // Fire pre-scaffold
  await hookManager.execute('pre-scaffold', hookCtx);

  const templateResolutionStart = performance.now();
  let templateResolutionMs = 0;

  try {
    await safeEnsureDir(options.directory);

    // Check if template directory exists (bundled with package)
    const templateDir = path.join(
      new URL('.', import.meta.url).pathname,
      '..',
      'templates',
      options.framework,
    );
    const hasTemplate = await fs.pathExists(templateDir);
    templateResolutionMs = performance.now() - templateResolutionStart;

    if (hasTemplate) {
      if (_dryRunActive) {
        // Walk the template directory and collect file paths + sizes
        const templateFiles = await walkDirRecursive(templateDir);
        for (const f of templateFiles) {
          const rel = path.relative(templateDir, f);
          const stat = await fs.stat(f);
          _dryRunEntries.push({
            path: path.join(options.directory, rel),
            size: stat.size,
          });
        }
      } else {
        // Copy the full template
        await fs.copy(templateDir, options.directory, { overwrite: true });
      }
    }

    logVerbose(`Component bundles: ${options.componentBundles.join(', ')}`);
    logVerbose(
      `Features: typescript=${String(options.typescript)}, eslint=${String(options.eslint)}, tokens=${String(options.designTokens)}, darkMode=${String(options.darkMode)}`,
    );

    // Fire pre-write before generating files
    await hookManager.execute('pre-write', hookCtx);

    // Generate/overwrite core files based on options
    logVerbose(`Writing ${path.join(options.directory, 'package.json')}`);
    await writePackageJson(options, template);
    logVerbose(`Writing ${path.join(options.directory, 'README.md')}`);
    await writeReadme(options);

    if (options.designTokens) {
      logVerbose(`Writing ${path.join(options.directory, 'helix.tokens.json')}`);
      await writeTokensConfig(options);
    }

    if (options.eslint) {
      logVerbose(`Writing ${path.join(options.directory, 'eslint.config.js')}`);
      await writeEslintConfig(options);
    }

    // .prettierrc and .editorconfig are always written regardless of eslint option
    logVerbose(`Writing ${path.join(options.directory, '.prettierrc')}`);
    await writePrettierConfig(options);
    logVerbose(`Writing ${path.join(options.directory, '.editorconfig')}`);
    await writeEditorConfig(options);

    if (options.typescript) {
      logVerbose(`Writing ${path.join(options.directory, 'tsconfig.json')}`);
      await writeTsConfig(options);
    }

    // Framework-specific generation (always runs, fills gaps if no template dir)
    logVerbose(`Running ${options.framework} scaffold generator`);
    switch (options.framework) {
      case 'react-next':
        await scaffoldReactNext(options);
        break;
      case 'react-vite':
        await scaffoldReactVite(options);
        break;
      case 'remix':
        await scaffoldRemix(options);
        break;
      case 'vue-vite':
        await scaffoldVueVite(options);
        break;
      case 'solid-vite':
        await scaffoldSolidVite(options);
        break;
      case 'qwik-vite':
        await scaffoldQwikVite(options);
        break;
      case 'vanilla':
        await scaffoldVanilla(options);
        break;
      case 'astro':
        await scaffoldAstro(options);
        break;
      case 'svelte-kit':
        await scaffoldSvelteKit(options);
        break;
      case 'vue-nuxt':
        await scaffoldVueNuxt(options);
        break;
      case 'angular':
        await scaffoldAngular(options);
        break;
      case 'lit-vite':
        await scaffoldLitVite(options);
        break;
      case 'wc-storybook':
        await scaffoldWcStorybook(options);
        break;
      case 'preact-vite':
        await scaffoldPreactVite(options);
        break;
      case 'stencil':
        await scaffoldStencil(options);
        break;
      case 'ember':
        await scaffoldEmber(options);
        break;
      default:
        // For templates without generators yet, write a minimal starter
        await scaffoldMinimal(options);
        break;
    }

    // Write the HELiX integration helper
    logVerbose(`Writing ${path.join(options.directory, 'src', 'helix-setup.ts')}`);
    await writeHelixSetup(options);

    // Write .gitignore
    logVerbose(`Writing ${path.join(options.directory, '.gitignore')}`);
    await writeGitignore(options);

    // Fire post-write after all file writes complete
    await hookManager.execute('post-write', hookCtx);

    // Capture timing before post-scaffold hook
    const totalMs = performance.now() - scaffoldStart;
    const fileGenerationMs = Math.max(0, totalMs - templateResolutionMs - validationMs);
    const fileWritingMs = fileGenerationMs * 0.5;

    // Count files and bytes written
    let fileCount = 0;
    let bytesWritten = 0;
    if (_dryRunActive) {
      fileCount = _dryRunEntries.length;
      bytesWritten = _dryRunEntries.reduce((sum, e) => sum + e.size, 0);
    } else {
      try {
        const written = await walkDirRecursive(options.directory);
        fileCount = written.length;
        for (const f of written) {
          try {
            const st = await fs.stat(f);
            bytesWritten += st.size;
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore stat errors */
      }
    }

    const template2 = getTemplate(options.framework);
    const dependencyCount = template2
      ? Object.keys(template2.dependencies ?? {}).length +
        Object.keys(template2.devDependencies ?? {}).length
      : 0;

    _lastTiming = {
      totalMs,
      phases: {
        validationMs,
        templateResolutionMs,
        fileGenerationMs,
        fileWritingMs,
      },
      fileCount,
      bytesWritten,
      dependencyCount,
    };

    // Fire post-scaffold after everything is done
    await hookManager.execute('post-scaffold', hookCtx);
  } catch (err) {
    _dryRunActive = false;

    // Clean up any partially created files if the directory was created by this scaffold run.
    if (!dirExistedBefore && (await fs.pathExists(options.directory))) {
      await fs.remove(options.directory);
    }

    const friendlyMessage = getScaffoldErrorMessage(err);
    if (friendlyMessage) {
      p.log.error(friendlyMessage);
      throw new HelixError(ErrorCode.DISK_ERROR, friendlyMessage, err);
    }
    throw err;
  } finally {
    _dryRunActive = false;
  }

  if (options.dryRun) {
    printDryRunTree(options.directory, _dryRunEntries);
  }
}

async function writePackageJson(
  options: ProjectOptions,
  template: AnyTemplateConfig,
): Promise<void> {
  // Ember uses CommonJS tooling (ember-cli-build.js, config/environment.js) —
  // setting "type": "module" would cause ReferenceError: require is not defined.
  const useEsm = options.framework !== 'ember';
  const peerDependencies = template.peerDependencies;
  // Library-mode templates (wc-storybook today) publish their compiled
  // dist/ to npm — they need main / exports / types entry points so
  // `import { AuroraButton } from 'my-design-system'` resolves. App-style
  // templates (react-next, svelte-kit, etc.) do not — they're the END
  // app, not a reusable library.
  const isLibraryTemplate = options.framework === 'wc-storybook';
  const libraryEntrypoints = isLibraryTemplate
    ? {
        main: './dist/index.js',
        module: './dist/index.js',
        types: './dist/index.d.ts',
        // Component styles live in Lit `css` tagged templates inside each
        // component's compiled JS — there is no separate dist/style.css
        // bundle to expose. The brand token layer (--{prefix}-* variables)
        // IS shipped as dist/tokens.css — the build chain copies
        // src/tokens/tokens.css into dist/. Consumers import it once at
        // their app root: `import '<pkg>/tokens.css';`.
        // Top-level customElements field is a Web Components convention
        // (https://github.com/webcomponents/custom-elements-manifest) —
        // IDE / tooling looks for it at the package root. Pointing at
        // dist/custom-elements.json (copied by the build chain) lets
        // downstream consumers see component metadata without expecting
        // the un-published top-level custom-elements.json.
        customElements: './dist/custom-elements.json',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.js',
          },
          './tokens.css': './dist/tokens.css',
          './custom-elements.json': './dist/custom-elements.json',
        },
        files: ['dist'],
        // Mark every component module as side-effectful, not just the
        // root barrel. Each `dist/components/<tag>/index.js` runs
        // `customElements.define(...)` at module-load via Lit's
        // @customElement decorator. Bundlers that honor
        // `package.json#sideEffects` (Rollup, esbuild, webpack) tree-
        // shake the component modules if they're not listed — consumers
        // doing `import { AuroraButton } from '<pkg>'` end up with the
        // class but no registered tag, so `<aurora-button>` shows up as
        // an unknown element at runtime.
        sideEffects: ['**/*.css', './dist/index.js', './dist/components/**'],
      }
    : {};
  const pkg = {
    name: options.name,
    version: '0.1.0',
    ...(isLibraryTemplate ? {} : { private: true }),
    ...(useEsm ? { type: 'module' } : {}),
    ...libraryEntrypoints,
    scripts: getScripts(options),
    dependencies: {
      // wc-storybook pins Helix tokens at its own centralized 3.3.1 version
      // via peerDependencies + devDependencies (action.* / on-{role}-strong /
      // on-dark-* contract). Other frameworks get the legacy 0.3.0 default
      // when designTokens is opted in — but ONLY if the template did not
      // already declare its own version, otherwise the default would inject
      // an incompatible spec alongside the template's pin and produce a
      // package.json with two conflicting versions of the same package.
      ...(options.designTokens && !isLibraryTemplate ? { '@helixui/tokens': '^0.3.0' } : {}),
      ...template.dependencies,
    },
    devDependencies: {
      ...template.devDependencies,
    },
    // Only emit peerDependencies when the template declares them — keeps the
    // generated package.json minimal for app-style frameworks (react-next,
    // svelte-kit, etc) where the consumer is the end-user app, not a library.
    ...(peerDependencies && Object.keys(peerDependencies).length > 0 ? { peerDependencies } : {}),
  };

  await safeWriteJson(path.join(options.directory, 'package.json'), pkg, {
    spaces: 2,
  });
}

function getScripts(options: ProjectOptions): Record<string, string> {
  switch (options.framework) {
    case 'react-next':
      return {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
      };
    case 'react-vite':
      return {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      };
    case 'remix':
      return {
        dev: 'react-router dev',
        build: 'react-router build',
        start: 'react-router-serve ./build/server/index.js',
        typecheck: 'react-router typegen && tsc',
      };
    case 'vue-vite':
    case 'solid-vite':
    case 'lit-vite':
    case 'preact-vite':
      return {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      };
    case 'qwik-vite':
      return {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
        typecheck: 'tsc --noEmit',
      };
    case 'svelte-kit':
      return {
        dev: 'vite dev',
        build: 'vite build',
        preview: 'vite preview',
      };
    case 'astro':
      return {
        dev: 'astro dev',
        build: 'astro build',
        preview: 'astro preview',
      };
    case 'vue-nuxt':
      return {
        dev: 'nuxt dev',
        build: 'nuxt build',
        preview: 'nuxt preview',
      };
    case 'angular':
      return {
        dev: 'ng serve',
        build: 'ng build',
      };
    case 'stencil':
      return {
        start: 'stencil build --dev --watch --serve',
        build: 'stencil build',
        test: 'stencil test --spec',
        generate: 'stencil generate',
      };
    case 'ember':
      return {
        dev: 'ember serve',
        build: 'ember build',
        test: 'ember test',
      };
    case 'wc-storybook':
      // Compose scripts by inlining the literal commands instead of chaining
      // through `pnpm <script>` invocations. This keeps the scaffold output
      // package-manager-agnostic — `npm run storybook`, `pnpm storybook`, and
      // `yarn storybook` all work without requiring pnpm to be installed.
      return {
        // The chain is: build-tokens (CSS) → cem analyze (refresh
        // custom-elements.json from src/components/*) → generate-catalog
        // (per-tag .stories.ts from CEM) → storybook. Skipping cem:analyze
        // means setCustomElementsManifest() loads an empty stub and every
        // autodocs API table renders blank until the consumer manually
        // runs `pnpm cem:analyze`.
        // `dev` is the canonical entrypoint the CLI's outro tells users
        // to run after install. wc-storybook's dev surface is Storybook,
        // so alias dev → the same literal command chain `storybook` runs.
        // We inline the chain (rather than `pnpm run storybook`) because
        // the scaffold supports npm + yarn too — `pnpm run storybook` would
        // fail with "pnpm: command not found" on npm-only environments.
        dev: 'tsx scripts/build-tokens.ts && cem analyze --globs "src/**/*.ts" && tsx scripts/generate-catalog.ts && concurrently -n tokens,sb -c blue,magenta "tsx scripts/build-tokens.ts --watch" "storybook dev -p 6006"',
        storybook:
          'tsx scripts/build-tokens.ts && cem analyze --globs "src/**/*.ts" && tsx scripts/generate-catalog.ts && concurrently -n tokens,sb -c blue,magenta "tsx scripts/build-tokens.ts --watch" "storybook dev -p 6006"',
        'build-storybook':
          'tsx scripts/build-tokens.ts && cem analyze --globs "src/**/*.ts" && tsx scripts/generate-catalog.ts && storybook build',
        // Library publish chain: build tokens → cem analyze (refresh
        // custom-elements.json from src/components/*) → bundle JS →
        // emit .d.ts → copy tokens.css + custom-elements.json into dist/.
        // Each step is critical:
        //   - build-tokens generates src/tokens/tokens.css
        //   - cem analyze regenerates custom-elements.json from current
        //     source so the published manifest reflects what was bundled
        //   - vite build bundles src/index.ts to dist/index.js
        //   - tsc --project tsconfig.build.json emits dist/index.d.ts
        //     (rootDir=src so types land at the path package.json's
        //     "types" field advertises, not dist/src/index.d.ts)
        //   - The final node copy ships dist/tokens.css so consumers can
        //     `import "<pkg>/tokens.css"` to get the brand token layer.
        //     Without it, components render unstyled because --{prefix}-*
        //     variables are never defined at :root.
        //   - dist/custom-elements.json ships the CEM next to dist/. Most
        //     IDE / docs tooling (VS Code's lit-plugin, jetbrains-lit,
        //     storybook autodocs in downstream consumers) reads it for
        //     props / events / slots. files: ['dist'] excluded the
        //     top-level custom-elements.json, so consumers got no
        //     metadata even after the author ran cem:analyze.
        build:
          "tsx scripts/build-tokens.ts && cem analyze --globs \"src/**/*.ts\" && vite build && tsc --project tsconfig.build.json && node -e \"const fs=require('fs');fs.copyFileSync('src/tokens/tokens.css','dist/tokens.css');fs.copyFileSync('custom-elements.json','dist/custom-elements.json')\"",
        test: 'vitest run',
        'test:ui': 'vitest --ui',
        'type-check': 'tsc --noEmit',
        'cem:analyze': 'cem analyze --globs "src/**/*.ts"',
        'cem:catalog': 'tsx scripts/generate-catalog.ts',
        'build:tokens': 'tsx scripts/build-tokens.ts',
        'watch:tokens': 'tsx scripts/build-tokens.ts --watch',
        'tokens:sync': 'tsx scripts/sync-tokens.ts',
        // Resets src/tokens/tokens.json from the upstream @helixui/tokens
        // platform shape. The previous one-liner used createRequire(__filename),
        // which throws ERR_INVALID_ARG_VALUE under `node -e` because
        // __filename evaluates to "[eval]". Delegating to a real file
        // (scripts/refresh-tokens.ts) avoids that runtime error class.
        'tokens:refresh-platform': 'tsx scripts/refresh-tokens.ts',
      };
    case 'vanilla':
      return {
        dev: 'npx http-server . -p 3000 -o',
      };
    default:
      return {
        dev: 'vite',
        build: 'vite build',
      };
  }
}

async function writeReadme(options: ProjectOptions): Promise<void> {
  const template = getTemplate(options.framework);
  const content = `# ${options.name}

Built with [HELiX](https://github.com/bookedsolidtech/helix) web components and ${template?.name ?? options.framework}.

## Getting Started

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## HELiX Web Components

This project uses HELiX enterprise web components. Components work across any framework
because they're built on web standards (Custom Elements, Shadow DOM, CSS Custom Properties).

### Theming

Customize the design system using CSS custom properties:

\`\`\`css
:root {
  --hx-color-primary: #0066cc;
  --hx-color-primary-hover: #0052a3;
  --hx-spacing-md: 1rem;
  --hx-radius-md: 0.5rem;
}
\`\`\`

### Shadow DOM Styling

HELiX components use Shadow DOM for encapsulation. Style them with:

1. **CSS Custom Properties** — theme tokens cascade through Shadow DOM
2. **::part() selectors** — target exposed internal elements
3. **Slots** — project your own content into component slots

\`\`\`css
/* Theme tokens (cascade through Shadow DOM) */
hx-button {
  --hx-button-bg: var(--hx-color-primary);
}

/* ::part() for internal element access */
hx-button::part(button) {
  font-weight: 700;
}
\`\`\`

### Responsive Mode

Every project scaffolded by \`create-helix\` ships with a starter responsive
semantic mode in \`helix-responsive.css\` (mobile / tablet / desktop). This
exists because \`helix-tokens\` (upstream) ships theme/contrast modes but
cannot ship breakpoints — every consumer has different breakpoint needs, so
the consumer-side scaffolder owns the responsive defaults.

Token paths seeded today:

- \`--hx-responsive-grid-columns\` — grid system column count
- \`--hx-responsive-stack-gap\` — default vertical rhythm gap
- \`--hx-responsive-font-size-scale\` — multiplier on the type ramp

Override any of them by editing \`helix-responsive.css\` or by re-declaring
the variable inside your own media-query block:

\`\`\`css
@media (min-width: 1024px) {
  :root {
    --hx-responsive-grid-columns: 16;
    --hx-responsive-stack-gap: 32px;
  }
}
\`\`\`

(Source: per Charles Attisano, Helix design lead — every starter must include
a responsive semantic mode.)

### Component Import Patterns

\`\`\`typescript
// Individual imports (tree-shakeable)
import '@helixui/library/hx-button';
import '@helixui/library/hx-card';

// Bundle import (all components)
import '@helixui/library';
\`\`\`

## Learn More

- [HELiX Documentation](https://helix-docs.example.com)
- [Component Storybook](https://helix-storybook.example.com)
- [API Reference (Custom Elements Manifest)](https://github.com/bookedsolidtech/helix)
`;
  await safeWriteFile(path.join(options.directory, 'README.md'), content);
}

async function writeTokensConfig(options: ProjectOptions): Promise<void> {
  const content = `/* HELiX Design Tokens — Theme Overrides */
/* Import the base token layer, then override as needed */

@import '@helixui/tokens/tokens.css';
@import './helix-responsive.css';

:root {
  /* === Brand Overrides === */
  /* Uncomment and customize to match your brand */

  /* --hx-color-primary: #0066cc; */
  /* --hx-color-primary-hover: #0052a3; */
  /* --hx-color-primary-active: #003d7a; */

  /* --hx-color-success: #198754; */
  /* --hx-color-warning: #ffc107; */
  /* --hx-color-danger: #dc3545; */

  /* === Spacing Scale === */
  /* --hx-spacing-xs: 0.25rem; */
  /* --hx-spacing-sm: 0.5rem; */
  /* --hx-spacing-md: 1rem; */
  /* --hx-spacing-lg: 1.5rem; */
  /* --hx-spacing-xl: 2rem; */

  /* === Typography === */
  /* --hx-font-family: 'Inter', system-ui, sans-serif; */
  /* --hx-font-size-base: 1rem; */
  /* --hx-line-height-base: 1.5; */

  /* === Border Radius === */
  /* --hx-radius-sm: 0.25rem; */
  /* --hx-radius-md: 0.5rem; */
  /* --hx-radius-lg: 1rem; */
  /* --hx-radius-full: 9999px; */
}

${
  options.darkMode
    ? `/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  :root {
    /* --hx-color-surface: #1a1a2e; */
    /* --hx-color-surface-hover: #16213e; */
    /* --hx-color-text: #e8e8e8; */
    /* --hx-color-text-secondary: #a0a0a0; */
  }
}

[data-theme="dark"] {
  /* Manual dark mode toggle support */
  /* --hx-color-surface: #1a1a2e; */
  /* --hx-color-text: #e8e8e8; */
}`
    : ''
}
`;
  await safeWriteFile(path.join(options.directory, 'helix-tokens.css'), content);
  await writeResponsiveTokensConfig(options);
}

/**
 * Writes the starter responsive semantic mode for the scaffolded project.
 *
 * Per Charles Attisano (Helix design lead, _brainstorm canvas 329:1199 in
 * wITXImaAPUCpBs2nRPv17k): every starter must include a responsive semantic
 * mode. helix-tokens (upstream) ships theme/contrast modes but cannot ship
 * responsive breakpoints — every consumer has different breakpoint needs.
 * Therefore the consumer-side scaffolder owns the default responsive seed.
 *
 * Shape: a single-axis viewport mode (mobile / tablet / desktop) expressed as
 * CSS custom properties under min-width media queries. Three token paths only
 * — grid columns, stack gap, and a font-size scale multiplier. Consumers
 * override or extend by editing this file or replacing the values.
 */
async function writeResponsiveTokensConfig(options: ProjectOptions): Promise<void> {
  const content = `/* HELiX Responsive Semantic Mode — Starter Defaults
 *
 * Per Charles Attisano (Helix design lead, _brainstorm canvas 329:1199 in
 * wITXImaAPUCpBs2nRPv17k): every consumer of helix-tokens must declare a
 * responsive semantic mode. helix-tokens upstream ships theme/contrast modes
 * (default / dark / hc) but cannot ship breakpoints — every consumer
 * (Drupal, Northwell, Jefferson, ...) has different breakpoint needs.
 *
 * Seeded defaults below are mobile-first. Override any token by setting it
 * inside the matching breakpoint block — or rewrite the breakpoints entirely
 * if your design system uses a different scale.
 *
 * Tokens defined here:
 *   --hx-responsive-grid-columns       grid system column count
 *   --hx-responsive-stack-gap          default vertical rhythm gap (px)
 *   --hx-responsive-font-size-scale    multiplier on the type ramp
 */

:root {
  /* mobile (default — applied below the first breakpoint) */
  --hx-responsive-grid-columns: 4;
  --hx-responsive-stack-gap: 8px;
  --hx-responsive-font-size-scale: 0.875;
}

@media (min-width: 768px) {
  :root {
    /* tablet */
    --hx-responsive-grid-columns: 8;
    --hx-responsive-stack-gap: 16px;
    --hx-responsive-font-size-scale: 1;
  }
}

@media (min-width: 1280px) {
  :root {
    /* desktop */
    --hx-responsive-grid-columns: 12;
    --hx-responsive-stack-gap: 24px;
    --hx-responsive-font-size-scale: 1;
  }
}
`;
  await safeWriteFile(path.join(options.directory, 'helix-responsive.css'), content);
}

async function writeEslintConfig(options: ProjectOptions): Promise<void> {
  const content = `import js from '@eslint/js';
${options.typescript ? "import tseslint from 'typescript-eslint';" : ''}

export default [
  js.configs.recommended,
  ${options.typescript ? '...tseslint.configs.recommended,' : ''}
  {
    rules: {
      'no-unused-vars': 'warn',
    },
  },
];
`;
  await safeWriteFile(path.join(options.directory, 'eslint.config.js'), content);
}

async function writePrettierConfig(options: ProjectOptions): Promise<void> {
  const config = {
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'all',
    printWidth: 100,
  };
  await safeWriteJson(path.join(options.directory, '.prettierrc'), config, {
    spaces: 2,
  });
}

async function writeTsConfig(options: ProjectOptions): Promise<void> {
  if (
    options.framework === 'react-next' ||
    options.framework === 'remix' ||
    options.framework === 'wc-storybook'
  ) {
    // These frameworks manage their own tsconfig (wc-storybook writes its own
    // inside scaffoldWcStorybook with experimentalDecorators + useDefineForClassFields:false)
    return;
  }

  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: options.framework.startsWith('react') ? 'react-jsx' : undefined,
    },
    include: ['src'],
    exclude: ['node_modules'],
  };

  await safeWriteJson(path.join(options.directory, 'tsconfig.json'), config, {
    spaces: 2,
  });
}

async function writeHelixSetup(options: ProjectOptions): Promise<void> {
  const components = getComponentsForBundles(options.componentBundles);
  const isAll = components.includes('*');

  const ext = options.typescript ? 'ts' : 'js';
  const srcDir = path.join(options.directory, 'src');
  await safeEnsureDir(srcDir);

  let content: string;

  if (isAll) {
    content = `/**
 * HELiX Web Components — Full library import
 * All 98 components registered as custom elements.
 */
import '@helixui/library';
${options.designTokens ? "\nimport '../helix-tokens.css';" : ''}

export {};
`;
  } else {
    content = `/**
 * HELiX Web Components — Selected bundles: ${options.componentBundles.join(', ')}
 *
 * Using the full library import for reliability.
 * For tree-shaking, switch to per-component imports:
 *   import '@helixui/library/components/hx-button';
 *   import '@helixui/library/components/hx-card';
 *
 * Full component list: https://github.com/bookedsolidtech/helix
 */
import '@helixui/library';
${options.designTokens ? "\nimport '../helix-tokens.css';" : ''}

export {};
`;
  }

  await safeWriteFile(path.join(srcDir, `helix-setup.${ext}`), content);
}

async function writeGitignore(options: ProjectOptions): Promise<void> {
  const wcStorybookExtras = options.framework === 'wc-storybook' ? 'src/stories/catalog/\n' : '';
  const content = `node_modules/
dist/
.next/
.nuxt/
.svelte-kit/
.astro/
storybook-static/
${wcStorybookExtras}.env
.env.local
*.log
.DS_Store
`;
  await safeWriteFile(path.join(options.directory, '.gitignore'), content);
}

async function writeEditorConfig(options: ProjectOptions): Promise<void> {
  const content = `root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
`;
  await safeWriteFile(path.join(options.directory, '.editorconfig'), content);
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

/** Convert a kebab-case design system name to PascalCase class prefix. */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

// ─── Framework-specific scaffolding ───────────────────────────────────────────

async function scaffoldReactNext(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  const appDir = path.join(srcDir, 'app');
  await safeEnsureDir(appDir);

  // Generate unique install tracking ID
  const installId = randomBytes(8).toString('hex');

  // Copy brand assets into public/og/
  const assetsSource = path.join(new URL('.', import.meta.url).pathname, '..', 'assets', 'og');
  const publicOgDir = path.join(options.directory, 'public', 'og');
  if (await fs.pathExists(assetsSource)) {
    await safeCopyDir(assetsSource, publicOgDir);
  }

  // next.config.ts — Next.js 16 with Turbopack (default bundler)
  await safeWriteFile(
    path.join(options.directory, 'next.config.ts'),
    `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`,
  );

  // tsconfig.json for Next.js 16
  await safeWriteJson(
    path.join(options.directory, 'tsconfig.json'),
    {
      compilerOptions: {
        target: 'ES2017',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: { '@/*': ['./src/*'] },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    },
    { spaces: 2 },
  );

  // React wrappers for HELiX components
  await safeEnsureDir(path.join(srcDir, 'components', 'helix'));
  await safeWriteFile(
    path.join(srcDir, 'components', 'helix', 'wrappers.tsx'),
    `'use client';

/**
 * React wrappers for HELiX web components.
 *
 * @lit/react creates type-safe React components that properly bridge:
 * - Properties (not just attributes)
 * - Events (CustomEvent → React callbacks)
 * - Refs
 *
 * Usage:
 *   import { HxButton, HxCard, HxTextInput } from '@/components/helix/wrappers';
 *   <HxButton variant="primary" onHxClick={handleClick}>Save</HxButton>
 */
import { createComponent } from '@lit/react';
import React from 'react';

// Import the web components (registers custom elements)
// Uses the ./components/* export map from @helixui/library
import '@helixui/library/components/hx-button';
import '@helixui/library/components/hx-card';
import '@helixui/library/components/hx-text-input';
import '@helixui/library/components/hx-select';
import '@helixui/library/components/hx-checkbox';
import '@helixui/library/components/hx-switch';
import '@helixui/library/components/hx-dialog';
import '@helixui/library/components/hx-alert';
import '@helixui/library/components/hx-badge';
import '@helixui/library/components/hx-tabs';
// hx-tab and hx-tab-panel are registered by the hx-tabs import
import '@helixui/library/components/hx-avatar';
import '@helixui/library/components/hx-divider';
import '@helixui/library/components/hx-tooltip';
import '@helixui/library/components/hx-textarea';
import '@helixui/library/components/hx-data-table';
import '@helixui/library/components/hx-top-nav';
import '@helixui/library/components/hx-progress-bar';
import '@helixui/library/components/hx-tag';
import '@helixui/library/components/hx-code-snippet';

// JSX types are declared globally in src/helix.d.ts
// This file provides React-wrapped versions with proper event bridging

/**
 * React-wrapped HELiX Button
 *
 * @example
 * <HxButton variant="primary" size="md" onHxClick={() => alert('clicked!')}>
 *   Save Changes
 * </HxButton>
 */
export const HxButton = createComponent({
  tagName: 'hx-button',
  elementClass: customElements.get('hx-button') as CustomElementConstructor,
  react: React,
  events: {
    onHxClick: 'hx-click',
    onHxFocus: 'hx-focus',
    onHxBlur: 'hx-blur',
  },
});

export const HxCard = createComponent({
  tagName: 'hx-card',
  elementClass: customElements.get('hx-card') as CustomElementConstructor,
  react: React,
});

export const HxTextInput = createComponent({
  tagName: 'hx-text-input',
  elementClass: customElements.get('hx-text-input') as CustomElementConstructor,
  react: React,
  events: {
    onHxInput: 'hx-input',
    onHxChange: 'hx-change',
    onHxFocus: 'hx-focus',
    onHxBlur: 'hx-blur',
  },
});

export const HxSelect = createComponent({
  tagName: 'hx-select',
  elementClass: customElements.get('hx-select') as CustomElementConstructor,
  react: React,
  events: {
    onHxChange: 'hx-change',
  },
});

export const HxCheckbox = createComponent({
  tagName: 'hx-checkbox',
  elementClass: customElements.get('hx-checkbox') as CustomElementConstructor,
  react: React,
  events: {
    onHxChange: 'hx-change',
  },
});

export const HxSwitch = createComponent({
  tagName: 'hx-switch',
  elementClass: customElements.get('hx-switch') as CustomElementConstructor,
  react: React,
  events: {
    onHxChange: 'hx-change',
  },
});

export const HxDialog = createComponent({
  tagName: 'hx-dialog',
  elementClass: customElements.get('hx-dialog') as CustomElementConstructor,
  react: React,
  events: {
    onHxClose: 'hx-close',
    onHxOpen: 'hx-open',
  },
});

export const HxAlert = createComponent({
  tagName: 'hx-alert',
  elementClass: customElements.get('hx-alert') as CustomElementConstructor,
  react: React,
  events: {
    onHxClose: 'hx-close',
  },
});

export const HxBadge = createComponent({
  tagName: 'hx-badge',
  elementClass: customElements.get('hx-badge') as CustomElementConstructor,
  react: React,
});

export const HxTabs = createComponent({
  tagName: 'hx-tabs',
  elementClass: customElements.get('hx-tabs') as CustomElementConstructor,
  react: React,
  events: {
    onHxChange: 'hx-change',
  },
});

export const HxTab = createComponent({
  tagName: 'hx-tab',
  elementClass: customElements.get('hx-tab') as CustomElementConstructor,
  react: React,
});

export const HxTabPanel = createComponent({
  tagName: 'hx-tab-panel',
  elementClass: customElements.get('hx-tab-panel') as CustomElementConstructor,
  react: React,
});

export const HxAvatar = createComponent({
  tagName: 'hx-avatar',
  elementClass: customElements.get('hx-avatar') as CustomElementConstructor,
  react: React,
});

export const HxDivider = createComponent({
  tagName: 'hx-divider',
  elementClass: customElements.get('hx-divider') as CustomElementConstructor,
  react: React,
});

export const HxTooltip = createComponent({
  tagName: 'hx-tooltip',
  elementClass: customElements.get('hx-tooltip') as CustomElementConstructor,
  react: React,
});

export const HxTextarea = createComponent({
  tagName: 'hx-textarea',
  elementClass: customElements.get('hx-textarea') as CustomElementConstructor,
  react: React,
  events: {
    onHxInput: 'hx-input',
    onHxChange: 'hx-change',
  },
});

export const HxDataTable = createComponent({
  tagName: 'hx-data-table',
  elementClass: customElements.get('hx-data-table') as CustomElementConstructor,
  react: React,
  events: {
    onHxSort: 'hx-sort',
    onHxRowSelect: 'hx-row-select',
  },
});

export const HxTopNav = createComponent({
  tagName: 'hx-top-nav',
  elementClass: customElements.get('hx-top-nav') as CustomElementConstructor,
  react: React,
  events: {
    onHxMobileToggle: 'hx-mobile-toggle',
  },
});

export const HxProgressBar = createComponent({
  tagName: 'hx-progress-bar',
  elementClass: customElements.get('hx-progress-bar') as CustomElementConstructor,
  react: React,
});

export const HxTag = createComponent({
  tagName: 'hx-tag',
  elementClass: customElements.get('hx-tag') as CustomElementConstructor,
  react: React,
});

export const HxCodeSnippet = createComponent({
  tagName: 'hx-code-snippet',
  elementClass: customElements.get('hx-code-snippet') as CustomElementConstructor,
  react: React,
});
`,
  );

  // Client-side HELiX provider component
  await safeWriteFile(
    path.join(srcDir, 'components', 'helix', 'provider.tsx'),
    `'use client';

/**
 * HelixProvider — Client component that initializes HELiX web components.
 *
 * Web components require client-side JavaScript to register custom elements.
 * Wrap your layout with this provider to ensure components are available.
 *
 * In Next.js App Router, this MUST be a client component ('use client').
 *
 * SSR Notes (from HELiX SSR audit):
 * - 61 components are fully SSR-safe (no browser API in render path)
 * - 27 components need client hydration for interactivity
 * - 8 components are client-only (toast, drawer, carousel, color-picker, counter, theme)
 * - All form components use module-level counters (no crypto.randomUUID — SSR-safe)
 * - For client-only components, use next/dynamic with ssr: false
 */
import { useEffect, type ReactNode } from 'react';

interface HelixProviderProps {
  children: ReactNode;
  /** Explicit theme — avoids window.matchMedia SSR error from hx-theme */
  theme?: 'light' | 'dark' | 'system';
}

export function HelixProvider({ children, theme }: HelixProviderProps) {
  useEffect(() => {
    // Dynamic import ensures HELiX only loads on the client
    import('@helixui/library').then(() => {
      // Set explicit theme to avoid hx-theme's matchMedia SSR issue
      if (theme && theme !== 'system') {
        document.documentElement.setAttribute('data-theme', theme);
      }
    }).catch(() => {
      // Library failed to load — components will render as unstyled custom elements
    });
  }, [theme]);

  // Render children immediately — components will upgrade when loaded
  return <>{children}</>;
}
`,
  );

  // JSX type declarations for custom elements
  await safeWriteFile(
    path.join(srcDir, 'helix.d.ts'),
    `/**
 * JSX type declarations for HELiX web components.
 *
 * This allows TypeScript to understand hx-* elements in JSX.
 * Properties are typed as 'any' for flexibility — for strict typing,
 * use the @lit/react wrappers in src/components/helix/wrappers.tsx.
 */
import 'react';

type HxElement = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'hx-accordion': HxElement;
      'hx-accordion-item': HxElement;
      'hx-alert': HxElement;
      'hx-avatar': HxElement;
      'hx-badge': HxElement;
      'hx-banner': HxElement;
      'hx-breadcrumb': HxElement;
      'hx-button': HxElement;
      'hx-button-group': HxElement;
      'hx-card': HxElement;
      'hx-carousel': HxElement;
      'hx-checkbox': HxElement;
      'hx-checkbox-group': HxElement;
      'hx-code-snippet': HxElement;
      'hx-color-picker': HxElement;
      'hx-combobox': HxElement;
      'hx-counter': HxElement;
      'hx-data-table': HxElement;
      'hx-date-picker': HxElement;
      'hx-dialog': HxElement;
      'hx-divider': HxElement;
      'hx-drawer': HxElement;
      'hx-dropdown': HxElement;
      'hx-field': HxElement;
      'hx-field-label': HxElement;
      'hx-file-upload': HxElement;
      'hx-grid': HxElement;
      'hx-icon': HxElement;
      'hx-icon-button': HxElement;
      'hx-menu': HxElement;
      'hx-menu-item': HxElement;
      'hx-meter': HxElement;
      'hx-nav': HxElement;
      'hx-pagination': HxElement;
      'hx-popover': HxElement;
      'hx-progress-bar': HxElement;
      'hx-progress-ring': HxElement;
      'hx-radio-group': HxElement;
      'hx-rating': HxElement;
      'hx-select': HxElement;
      'hx-skeleton': HxElement;
      'hx-slider': HxElement;
      'hx-spinner': HxElement;
      'hx-split-button': HxElement;
      'hx-split-panel': HxElement;
      'hx-stat': HxElement;
      'hx-status-indicator': HxElement;
      'hx-switch': HxElement;
      'hx-tab': HxElement;
      'hx-tab-panel': HxElement;
      'hx-tabs': HxElement;
      'hx-tag': HxElement;
      'hx-text': HxElement;
      'hx-text-input': HxElement;
      'hx-textarea': HxElement;
      'hx-theme': HxElement;
      'hx-toast': HxElement;
      'hx-tooltip': HxElement;
      'hx-top-nav': HxElement;
      'hx-tree-item': HxElement;
      'hx-tree-view': HxElement;
    }
  }
}

export {};
`,
  );

  // Layout with provider and hx-theme for dark mode support
  await safeWriteFile(
    path.join(appDir, 'layout.tsx'),
    `import type { Metadata } from 'next';
import { HelixProvider } from '@/components/helix/provider';
${options.designTokens ? "import '../../helix-tokens.css';" : ''}
import './globals.css';

export const metadata: Metadata = {
  title: '${sanitizeForHtml(options.name)} — Built with HELiX',
  description: 'Enterprise web components for React and Next.js',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <HelixProvider>
          {children}
        </HelixProvider>
      </body>
    </html>
  );
}
`,
  );

  // Global styles with dark mode support
  await safeWriteFile(
    path.join(appDir, 'globals.css'),
    `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  color-scheme: light dark;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --hx-page-bg: #0a0a0f;
  --hx-page-text: #e4e4e7;
  --hx-page-text-secondary: #a1a1aa;
  --hx-page-surface: #18181b;
  --hx-page-surface-raised: #27272a;
  --hx-page-border: #3f3f46;
  --hx-page-code-bg: #27272a;
}

html[data-theme="light"],
html:not([data-theme]) {
  --hx-page-bg: #fafafa;
  --hx-page-text: #18181b;
  --hx-page-text-secondary: #71717a;
  --hx-page-surface: #ffffff;
  --hx-page-surface-raised: #f4f4f5;
  --hx-page-border: #e4e4e7;
  --hx-page-code-bg: #f4f4f5;
}

body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: var(--hx-page-text);
  background: var(--hx-page-bg);
  -webkit-font-smoothing: antialiased;
  transition: background 0.2s ease, color 0.2s ease;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

a {
  color: var(--hx-color-primary-500, #3b82f6);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

h1, h2, h3, h4 {
  color: var(--hx-page-text);
  letter-spacing: -0.025em;
}

code {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: 0.85em;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--hx-page-code-bg);
  color: var(--hx-page-text);
}

pre {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  background: var(--hx-page-code-bg) !important;
  color: var(--hx-page-text);
  border: 1px solid var(--hx-page-border);
}

.hero {
  padding: 5rem 2rem;
  text-align: center;
  background: var(--hx-page-surface);
  border-bottom: 1px solid var(--hx-page-border);
}

.hero h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 800;
  margin-bottom: 1rem;
  line-height: 1.1;
}

.hero p {
  font-size: 1.125rem;
  color: var(--hx-page-text-secondary);
  max-width: 600px;
  margin: 0 auto 2rem;
}

.section {
  padding: 4rem 0;
}

.section-header {
  margin-bottom: 2rem;
}

.section-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.section-header p {
  color: var(--hx-page-text-secondary);
}

.grid-auto {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.grid-3 {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.grid-4 {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

/* ── hx-top-nav overrides ── */
hx-top-nav {
  --hx-top-nav-bg: var(--hx-page-surface);
  --hx-top-nav-color: var(--hx-page-text);
  --hx-top-nav-border-color: var(--hx-page-border);
  border-radius: 0;
  position: sticky;
  top: 0;
  z-index: 1000;
}

hx-top-nav::part(header) {
  border-radius: 0;
}

/* ── hx-card overrides ── */
hx-card {
  --hx-card-bg: var(--hx-page-surface);
  --hx-card-color: var(--hx-page-text);
  --hx-card-border-color: var(--hx-page-border);
}

hx-card::part(header) {
  background: var(--hx-page-surface-raised);
  border-bottom: 1px solid var(--hx-page-border);
  padding: 0.875rem 1.25rem;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
}

.grid-auto hx-card,
.grid-3 hx-card,
.grid-4 hx-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.grid-auto hx-card::part(card),
.grid-3 hx-card::part(card),
.grid-4 hx-card::part(card) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.grid-auto,
.grid-3,
.grid-4 {
  align-items: stretch;
}

.text-secondary {
  color: var(--hx-page-text-secondary);
}

/* ── Promo cards ── */
.promo-grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.promo-card {
  position: relative;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid var(--hx-page-border);
  background: var(--hx-page-surface);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
}

.promo-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  text-decoration: none;
}

.promo-card-image {
  width: 100%;
  aspect-ratio: 1200 / 630;
  object-fit: cover;
  display: block;
  border-bottom: 1px solid var(--hx-page-border);
}

.promo-card-body {
  padding: 1.25rem 1.5rem 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.promo-card-body h3 {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--hx-page-text);
}

.promo-card-body p {
  font-size: 0.9rem;
  color: var(--hx-page-text-secondary);
  line-height: 1.5;
  flex: 1;
}

.promo-card-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--hx-color-primary-500, #3b82f6);
}

.promo-card:hover .promo-card-cta {
  text-decoration: underline;
}

/* ── Footer ── */
.site-footer {
  background: var(--hx-page-surface);
  border-top: 1px solid var(--hx-page-border);
  padding: 3rem 0 2rem;
  margin-top: 0;
}

.footer-grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: 1.5fr repeat(3, 1fr);
}

@media (max-width: 768px) {
  .footer-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .footer-grid {
    grid-template-columns: 1fr;
  }
}

.footer-brand p {
  margin: 0;
}

.footer-heading {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hx-page-text);
  margin-bottom: 0.75rem;
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.footer-links li {
  margin-bottom: 0.5rem;
}

.footer-links a {
  color: var(--hx-page-text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
  transition: color 0.15s ease;
}

.footer-links a:hover {
  color: var(--hx-page-text);
  text-decoration: none;
}

.footer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.footer-bottom p {
  margin: 0;
}
`,
  );

  // Theme toggle component
  await safeWriteFile(
    path.join(srcDir, 'components', 'theme-toggle.tsx'),
    `'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Dark mode toggle using hx-switch.
 *
 * Two-layer approach:
 * 1. Sets data-theme on <html> for page-level CSS (globals.css vars)
 * 2. Updates all hx-theme elements' theme property for component tokens
 */
export function ThemeToggle() {
  const switchRef = useRef<HTMLElement>(null);

  const applyTheme = useCallback((theme: 'light' | 'dark') => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('hx-theme').forEach((el) => {
      (el as HTMLElement & { theme: string }).theme = theme;
    });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('helix-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    applyTheme(isDark ? 'dark' : 'light');
    if (switchRef.current) {
      (switchRef.current as HTMLInputElement).checked = isDark;
    }
  }, [applyTheme]);

  const handleChange = useCallback((e: Event) => {
    const checked = (e as CustomEvent).detail?.checked ?? false;
    const theme = checked ? 'dark' : 'light';
    applyTheme(theme);
    localStorage.setItem('helix-theme', theme);
  }, [applyTheme]);

  useEffect(() => {
    const el = switchRef.current;
    el?.addEventListener('hx-change', handleChange);
    return () => el?.removeEventListener('hx-change', handleChange);
  }, [handleChange]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.8rem' }}>Dark</span>
      <hx-switch ref={switchRef} size="sm" />
    </div>
  );
}
`,
  );

  // Navbar component
  await safeWriteFile(
    path.join(srcDir, 'components', 'navbar.tsx'),
    `'use client';

import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';

export function Navbar() {
  return (
    <hx-top-nav sticky label="Main navigation">
      <div slot="logo">
        <Link href="/" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          textDecoration: 'none',
          color: 'inherit',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img src="/og/bs-hx-square.png" alt="HELiX" style={{ height: '30px', width: '30px', borderRadius: '5px' }} />
            <span style={{ fontWeight: 700, fontSize: '1.125rem', letterSpacing: '-0.025em' }}>HELiX</span>
          </div>
          <span style={{ opacity: 0.25, fontSize: '1.25rem', fontWeight: 200 }}>+</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="20" height="20" viewBox="0 0 180 180" fill="currentColor">
              <mask id="hx-next-mask" height="180" maskUnits="userSpaceOnUse" width="180" x="0" y="0"><circle cx="90" cy="90" fill="white" r="90"/></mask>
              <g mask="url(#hx-next-mask)"><circle cx="90" cy="90" fill="black" r="90"/><path d="M149.508 157.52L69.142 54H54v71.97h12.114V69.384l73.885 95.461a90.304 90.304 0 009.509-7.325z" fill="url(#hx-next-grad1)"/><rect fill="url(#hx-next-grad2)" height="72" width="12" x="115" y="54"/></g>
              <defs><linearGradient id="hx-next-grad1" gradientUnits="userSpaceOnUse" x1="109" x2="144.5" y1="116.5" y2="160.5"><stop stopColor="white"/><stop offset="1" stopColor="white" stopOpacity="0"/></linearGradient><linearGradient id="hx-next-grad2" gradientUnits="userSpaceOnUse" x1="121" x2="120.799" y1="54" y2="106.875"><stop stopColor="white"/><stop offset="1" stopColor="white" stopOpacity="0"/></linearGradient></defs>
            </svg>
            <span style={{ fontWeight: 600, fontSize: '0.95rem', opacity: 0.9 }}>Next.js</span>
          </div>
        </Link>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginLeft: '2rem' }}>
        <Link href="/components" style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.8 }}>Components</Link>
        <Link href="/examples/forms" style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.8 }}>Forms</Link>
        <Link href="/examples/dashboard" style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.8 }}>Dashboard</Link>
        <Link href="/docs" style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.8 }}>Docs</Link>
      </div>
      <div slot="actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <ThemeToggle />
        <a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer"
          style={{ color: 'inherit', display: 'flex', alignItems: 'center', opacity: 0.7 }}
          title="Booked Solid on GitHub">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
        <a href="https://bookedsolid.tech" target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center' }}
          title="Booked Solid Technology">
          <img src="https://bookedsolid.tech/logos/bs-bs-software-square.png?utm_source=create-helix&utm_medium=scaffold&utm_id=${installId}" alt="Booked Solid" style={{ height: '28px', width: '28px', borderRadius: '4px' }} />
        </a>
      </div>
    </hx-top-nav>
  );
}
`,
  );

  // Footer component
  await safeWriteFile(
    path.join(srcDir, 'components', 'footer.tsx'),
    `import Link from 'next/link';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <img
                src="/og/bs-hx-square.png"
                alt="HELiX"
                style={{ height: '32px', width: '32px', borderRadius: '4px' }}
              />
              <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>HELiX</span>
            </div>
            <p className="text-secondary" style={{ fontSize: '0.85rem', lineHeight: '1.6', maxWidth: '280px' }}>
              Enterprise web components built on Lit 3. Accessible, themeable, and framework-agnostic.
            </p>
          </div>
          <div>
            <h4 className="footer-heading">Product</h4>
            <ul className="footer-links">
              <li><Link href="/components">Components</Link></li>
              <li><Link href="/examples/forms">Forms</Link></li>
              <li><Link href="/examples/dashboard">Dashboard</Link></li>
              <li><Link href="/docs">Documentation</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="footer-heading">Ecosystem</h4>
            <ul className="footer-links">
              <li><a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX UI</a></li>
              <li><a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer">HELiXiR</a></li>
              <li><a href="https://bookedsolid.tech/discord-ops" target="_blank" rel="noopener noreferrer">Discord-Ops</a></li>
              <li><a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer">GitHub</a></li>
            </ul>
          </div>
          <div>
            <h4 className="footer-heading">Legal</h4>
            <ul className="footer-links">
              <li><a href="https://bookedsolid.tech/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
              <li><a href="https://bookedsolid.tech/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a></li>
              <li><a href="https://bookedsolid.tech/about" target="_blank" rel="noopener noreferrer">About</a></li>
              <li><a href="https://bookedsolid.tech/contact" target="_blank" rel="noopener noreferrer">Contact</a></li>
            </ul>
          </div>
        </div>
        <hx-divider style={{ margin: '2rem 0 1.5rem' }}></hx-divider>
        <div className="footer-bottom">
          <p className="text-secondary" style={{ fontSize: '0.8rem' }}>
            &copy; 2026 Booked Solid Technology, a d/b/a of Clarity House LLC. All rights reserved.
            Built with <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX</a> and <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer">Next.js</a>.
          </p>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer"
              className="text-secondary" style={{ display: 'flex' }} title="GitHub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
            <a href="https://bookedsolid.tech" target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center' }} title="Booked Solid Technology">
              <img src="/og/bs-bs-software-square.png" alt="BS" style={{ height: '20px', width: '20px', borderRadius: '3px', opacity: 0.7 }} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
`,
  );

  // Main landing page — real showcase with navbar, components, ecosystem links, dev guidance
  await safeWriteFile(
    path.join(appDir, 'page.tsx'),
    `'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

export default function Home() {
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const nameInputRef = useRef<HTMLElement>(null);
  const greetBtnRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const input = nameInputRef.current;
    const btn = greetBtnRef.current;

    const handleInput = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setName(detail?.value ?? '');
    };

    const handleClick = () => {
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    };

    input?.addEventListener('hx-input', handleInput);
    btn?.addEventListener('hx-click', handleClick);

    return () => {
      input?.removeEventListener('hx-input', handleInput);
      btn?.removeEventListener('hx-click', handleClick);
    };
  }, []);

  return (
    <hx-theme theme="auto">
      <Navbar />

      {/* Hero */}
      <section className="hero">
        <div className="container">
          <h1>HELiX + Next.js 16</h1>
          <p>
            Enterprise-grade web components running natively in React.
            75+ accessible, themeable components with Shadow DOM encapsulation.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <hx-button variant="primary" size="lg">
              <Link href="/examples/forms" style={{ color: 'inherit', textDecoration: 'none' }}>
                See Forms Demo
              </Link>
            </hx-button>
            <hx-button variant="secondary" size="lg">
              <Link href="/examples/dashboard" style={{ color: 'inherit', textDecoration: 'none' }}>
                See Dashboard Demo
              </Link>
            </hx-button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <hx-tag>Lit 3</hx-tag>
            <hx-tag>Shadow DOM</hx-tag>
            <hx-tag>WCAG 2.1 AA</hx-tag>
            <hx-tag>SSR-Safe</hx-tag>
            <hx-tag>React 19</hx-tag>
            <hx-tag>Next.js 16</hx-tag>
          </div>
        </div>
      </section>

      {/* Component Showcase */}
      <section className="container section">
        <div className="section-header">
          <h2>Component Showcase</h2>
          <p>A sampling of HELiX components — all rendered as native web components via Shadow DOM.</p>
        </div>

        <div className="grid-auto">
          {/* Interactive Card */}
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Interactive Input</h3>
              <hx-badge variant="info">Forms</hx-badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <hx-text-input
                ref={nameInputRef}
                label="Your name"
                placeholder="Enter your name"
              ></hx-text-input>
              <hx-button ref={greetBtnRef} variant="primary">
                Say Hello
              </hx-button>
              {submitted && (
                <hx-alert variant="success" open>
                  Hello, {name || 'World'}! HELiX components are working.
                </hx-alert>
              )}
            </div>
          </hx-card>

          {/* Button Variants */}
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Button Variants</h3>
              <hx-badge variant="success">Actions</hx-badge>
            </div>
            <p className="text-secondary" style={{ marginBottom: '1rem' }}>
              All button styles respond to the active theme.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <hx-button variant="primary" size="sm">Primary</hx-button>
              <hx-button variant="secondary" size="sm">Secondary</hx-button>
              <hx-button variant="danger" size="sm">Danger</hx-button>
              <hx-button variant="ghost" size="sm">Ghost</hx-button>
            </div>
          </hx-card>

          {/* Data Display */}
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Data Display</h3>
              <hx-badge variant="warning">Metrics</hx-badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Build Status</span>
                <hx-badge variant="success">Passing</hx-badge>
              </div>
              <hx-progress-bar value={87} max={100}></hx-progress-bar>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <hx-tag>v1.1.2</hx-tag>
                <hx-tag>stable</hx-tag>
                <hx-tag>MIT</hx-tag>
              </div>
            </div>
          </hx-card>

          {/* Avatars & Badges */}
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Avatars &amp; Badges</h3>
              <hx-badge variant="danger">Identity</hx-badge>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <hx-avatar size="sm">AB</hx-avatar>
              <hx-avatar size="md">CD</hx-avatar>
              <hx-avatar size="lg">EF</hx-avatar>
              <hx-divider vertical style={{ height: '2rem' }}></hx-divider>
              <hx-badge variant="info">Info</hx-badge>
              <hx-badge variant="success">Success</hx-badge>
              <hx-badge variant="warning">Warning</hx-badge>
              <hx-badge variant="danger">Danger</hx-badge>
            </div>
          </hx-card>
        </div>
      </section>

      {/* Tabbed Content */}
      <section className="container section" style={{ borderTop: '1px solid var(--hx-page-border)' }}>
        <hx-tabs>
          <hx-tab slot="nav">React Patterns</hx-tab>
          <hx-tab slot="nav">Theming</hx-tab>
          <hx-tab slot="nav">Event Handling</hx-tab>

          <hx-tab-panel>
            <div style={{ padding: '1.5rem 0' }}>
              <hx-card>
                <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Using HELiX in Next.js 16</h3>
                  <hx-badge variant="info">Architecture</hx-badge>
                </div>
                <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
                  <li><strong>Server Components</strong> render hx-* tags as inert HTML — zero JS shipped</li>
                  <li><strong>Client Components</strong> (<code>&apos;use client&apos;</code>) hydrate and activate interactivity</li>
                  <li><strong>HelixProvider</strong> in your root layout loads components via dynamic import</li>
                  <li><strong>@lit/react wrappers</strong> bridge properties and events for type-safe React usage</li>
                  <li><strong>hx-theme</strong> wraps content and injects CSS tokens for light/dark/high-contrast</li>
                </ul>
              </hx-card>
            </div>
          </hx-tab-panel>

          <hx-tab-panel>
            <div style={{ padding: '1.5rem 0' }}>
              <hx-card>
                <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>CSS Custom Properties</h3>
                  <hx-badge variant="success">Tokens</hx-badge>
                </div>
                <p style={{ marginBottom: '1rem' }}>
                  HELiX uses a three-tier token system: primitive, semantic, and component.
                  Override at the semantic tier to respect theme scoping:
                </p>
                <pre style={{ padding: '1rem', borderRadius: '0.5rem', fontSize: '0.85rem', overflow: 'auto' }}>
{\`:root {
  --hx-color-primary: #0066cc;
  --hx-color-success: #22c55e;
  --hx-spacing-md: 1rem;
}

/* ::part() targets Shadow DOM internals */
hx-button::part(button) {
  font-weight: 600;
}

hx-card::part(card) {
  border: 1px solid var(--hx-color-border);
}\`}
                </pre>
              </hx-card>
            </div>
          </hx-tab-panel>

          <hx-tab-panel>
            <div style={{ padding: '1.5rem 0' }}>
              <hx-card>
                <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Two Approaches</h3>
                  <hx-badge variant="warning">Events</hx-badge>
                </div>
                <pre style={{ padding: '1rem', borderRadius: '0.5rem', fontSize: '0.85rem', overflow: 'auto' }}>
{\`// 1. Direct custom elements + useRef
const ref = useRef<HTMLElement>(null);
useEffect(() => {
  ref.current?.addEventListener('hx-click', handler);
  return () => ref.current?.removeEventListener('hx-click', handler);
}, []);
<hx-button ref={ref}>Click</hx-button>

// 2. @lit/react wrappers (recommended)
import { HxButton } from '@/components/helix/wrappers';
<HxButton onHxClick={handler}>Click</HxButton>\`}
                </pre>
              </hx-card>
            </div>
          </hx-tab-panel>
        </hx-tabs>
      </section>

      {/* Ecosystem Promos */}
      <section className="container section" style={{ borderTop: '1px solid var(--hx-page-border)' }}>
        <div className="section-header">
          <h2>The Booked Solid Ecosystem</h2>
          <p>Enterprise-grade tools for modern web development and AI-powered workflows.</p>
        </div>
        <div className="promo-grid">
          <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer" className="promo-card">
            <img
              src="/og/helixui.png"
              alt="HELiX UI — 80+ enterprise web components. Zero framework lock-in."
              className="promo-card-image"
            />
            <div className="promo-card-body">
              <h3>HELiX UI</h3>
              <p>
                80+ enterprise web components built on Lit 3. Shadow DOM encapsulation,
                healthcare-first accessibility, and W3C DTCG design tokens. Works everywhere.
              </p>
              <span className="promo-card-cta">Explore HELiX UI &rarr;</span>
            </div>
          </a>
          <a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer" className="promo-card">
            <img
              src="/og/helixir.png"
              alt="HELiXiR — 37 MCP tools. 87 components loaded. Zero guesswork."
              className="promo-card-image"
            />
            <div className="promo-card-body">
              <h3>HELiXiR</h3>
              <p>
                MCP server for any CEM-compliant web component library. Connect to Claude, Cursor,
                or any MCP client. Components, tokens, slots, and a11y scores — all queryable.
              </p>
              <span className="promo-card-cta">Explore HELiXiR &rarr;</span>
            </div>
          </a>
          <a href="https://bookedsolid.tech/discord-ops" target="_blank" rel="noopener noreferrer" className="promo-card">
            <img
              src="/og/discord-ops.png"
              alt="Discord-Ops — Agency-grade Discord for AI agents."
              className="promo-card-image"
            />
            <div className="promo-card-body">
              <h3>Discord-Ops</h3>
              <p>
                Agency-grade Discord MCP server for AI agents. 45 tools, 23 message templates,
                multi-guild routing, and multi-bot support. Send messages by project name, not channel IDs.
              </p>
              <span className="promo-card-cta">Explore Discord-Ops &rarr;</span>
            </div>
          </a>
        </div>
      </section>

      {/* Developer Guidance */}
      <section className="container section" style={{ borderTop: '1px solid var(--hx-page-border)', paddingBottom: '5rem' }}>
        <div className="section-header">
          <h2>Getting Started</h2>
          <p>Your project is ready. Here are the key files and next steps.</p>
        </div>

        <div className="grid-3">
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Key Files</h3>
              <hx-badge variant="info">Reference</hx-badge>
            </div>
            <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
              <li><code>src/components/helix/wrappers.tsx</code> — React-wrapped components</li>
              <li><code>src/components/helix/provider.tsx</code> — Client-side initializer</li>
              <li><code>src/helix.d.ts</code> — JSX type declarations</li>
              <li><code>src/components/navbar.tsx</code> — Top navigation</li>
              <li><code>src/components/theme-toggle.tsx</code> — Dark mode switch</li>
              <li><code>helix-tokens.css</code> — Design token overrides</li>
            </ul>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Commands</h3>
              <hx-badge variant="success">CLI</hx-badge>
            </div>
            <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
              <li><code>npm run dev</code> — Start dev server</li>
              <li><code>npm run build</code> — Production build</li>
              <li><code>npm run lint</code> — Lint with ESLint</li>
            </ul>
            <hx-divider style={{ margin: '1rem 0' }}></hx-divider>
            <p style={{ fontSize: '0.875rem' }} className="text-secondary">
              Add more HELiX components by importing them in <code>wrappers.tsx</code>.
              The full list is in <code>@helixui/library/components/*</code>.
            </p>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Next Steps</h3>
              <hx-badge variant="warning">Action</hx-badge>
            </div>
            <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
              <li>Customize your theme in <code>helix-tokens.css</code></li>
              <li>Add more components from the <a href="https://github.com/bookedsolidtech/helix" target="_blank" rel="noopener noreferrer">component library</a></li>
              <li>Explore <Link href="/examples/forms">form participation</Link></li>
              <li>Build a <Link href="/examples/dashboard">data dashboard</Link></li>
            </ul>
          </hx-card>
        </div>
      </section>

      <Footer />
    </hx-theme>
  );
}
`,
  );

  // Components page — overview of available HELiX components
  const componentsDir = path.join(appDir, 'components');
  await safeEnsureDir(componentsDir);
  await safeWriteFile(
    path.join(componentsDir, 'page.tsx'),
    `'use client';

import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

export default function ComponentsPage() {
  return (
    <hx-theme theme="auto">
      <Navbar />
      <section className="hero" style={{ padding: '3rem 2rem' }}>
        <div className="container">
          <h1>Component Library</h1>
          <p>Browse the full HELiX component catalog. Each component is built on Lit 3 with Shadow DOM encapsulation.</p>
        </div>
      </section>

      <section className="container section">
        <div className="section-header">
          <h2>Core UI</h2>
          <p>Essential building blocks for any interface.</p>
        </div>
        <div className="grid-4">
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Button</h3>
              <hx-badge variant="success">Stable</hx-badge>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <hx-button variant="primary" size="sm">Primary</hx-button>
              <hx-button variant="secondary" size="sm">Secondary</hx-button>
              <hx-button variant="ghost" size="sm">Ghost</hx-button>
            </div>
            <p className="text-secondary" style={{ fontSize: '0.85rem' }}>
              Multi-variant button with loading states, icons, and full keyboard support.
            </p>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Badge</h3>
              <hx-badge variant="success">Stable</hx-badge>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <hx-badge variant="info">Info</hx-badge>
              <hx-badge variant="success">Success</hx-badge>
              <hx-badge variant="warning">Warning</hx-badge>
              <hx-badge variant="danger">Error</hx-badge>
            </div>
            <p className="text-secondary" style={{ fontSize: '0.85rem' }}>
              Status indicators with semantic color variants.
            </p>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Card</h3>
              <hx-badge variant="success">Stable</hx-badge>
            </div>
            <p className="text-secondary" style={{ fontSize: '0.85rem' }}>
              Content container with optional header, footer, and media slots. Supports elevation and border variants.
            </p>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Avatar</h3>
              <hx-badge variant="success">Stable</hx-badge>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
              <hx-avatar size="sm">AB</hx-avatar>
              <hx-avatar size="md">CD</hx-avatar>
              <hx-avatar size="lg">EF</hx-avatar>
            </div>
            <p className="text-secondary" style={{ fontSize: '0.85rem' }}>
              User identity with initials, image, or icon support.
            </p>
          </hx-card>
        </div>
      </section>

      <section className="container section" style={{ borderTop: '1px solid var(--hx-page-border)' }}>
        <div className="section-header">
          <h2>Form Controls</h2>
          <p>Fully accessible form components with native form participation.</p>
        </div>
        <div className="grid-3">
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Text Input</h3>
              <hx-badge variant="info">Forms</hx-badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <hx-text-input label="Email" placeholder="you@example.com" type="email"></hx-text-input>
              <hx-text-input label="Password" placeholder="Enter password" type="password"></hx-text-input>
            </div>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Checkbox &amp; Switch</h3>
              <hx-badge variant="info">Forms</hx-badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <hx-checkbox>Enable notifications</hx-checkbox>
              <hx-checkbox>Subscribe to updates</hx-checkbox>
              <hx-switch>Dark mode</hx-switch>
            </div>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Select</h3>
              <hx-badge variant="info">Forms</hx-badge>
            </div>
            <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              Dropdown select with search, multi-select, groups, and custom rendering. Uses Shadow DOM for style isolation.
            </p>
            <hx-select label="Framework" placeholder="Choose one">
              <option value="react">React</option>
              <option value="vue">Vue</option>
              <option value="svelte">Svelte</option>
            </hx-select>
          </hx-card>
        </div>
      </section>

      <section className="container section" style={{ borderTop: '1px solid var(--hx-page-border)', paddingBottom: '4rem' }}>
        <div className="section-header">
          <h2>Data &amp; Feedback</h2>
          <p>Components for displaying data, status, and user feedback.</p>
        </div>
        <div className="grid-3">
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Progress</h3>
              <hx-badge variant="warning">Metrics</hx-badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span className="text-secondary" style={{ fontSize: '0.85rem' }}>Upload</span>
                <hx-progress-bar value={72} max={100}></hx-progress-bar>
              </div>
              <div>
                <span className="text-secondary" style={{ fontSize: '0.85rem' }}>Build</span>
                <hx-progress-bar value={100} max={100}></hx-progress-bar>
              </div>
              <div>
                <span className="text-secondary" style={{ fontSize: '0.85rem' }}>Deploy</span>
                <hx-progress-bar value={45} max={100}></hx-progress-bar>
              </div>
            </div>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Tags &amp; Chips</h3>
              <hx-badge variant="success">Display</hx-badge>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <hx-tag>TypeScript</hx-tag>
              <hx-tag>React 19</hx-tag>
              <hx-tag>Next.js 16</hx-tag>
              <hx-tag>Lit 3</hx-tag>
              <hx-tag>Shadow DOM</hx-tag>
              <hx-tag>WCAG 2.1</hx-tag>
            </div>
            <p className="text-secondary" style={{ fontSize: '0.85rem' }}>
              Lightweight metadata labels for categorization and filtering.
            </p>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Alerts</h3>
              <hx-badge variant="danger">Feedback</hx-badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <hx-alert variant="info" open>Informational message</hx-alert>
              <hx-alert variant="success" open>Operation successful</hx-alert>
              <hx-alert variant="warning" open>Caution advised</hx-alert>
            </div>
          </hx-card>
        </div>
      </section>

      <Footer />
    </hx-theme>
  );
}
`,
  );

  // Docs page — getting started guide
  const docsDir = path.join(appDir, 'docs');
  await safeEnsureDir(docsDir);
  await safeWriteFile(
    path.join(docsDir, 'page.tsx'),
    `'use client';

import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

export default function DocsPage() {
  return (
    <hx-theme theme="auto">
      <Navbar />
      <section className="hero" style={{ padding: '3rem 2rem' }}>
        <div className="container">
          <h1>Documentation</h1>
          <p>Everything you need to build with HELiX components in your Next.js application.</p>
        </div>
      </section>

      <section className="container section">
        <div className="grid-auto">
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Quick Start</h3>
              <hx-badge variant="info">Guide</hx-badge>
            </div>
            <ol style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
              <li>Import components in <code>src/components/helix/wrappers.tsx</code></li>
              <li>Use them as React components with full type safety</li>
              <li>Customize tokens in <code>helix-tokens.css</code></li>
              <li>Override Shadow DOM styles with <code>::part()</code> selectors</li>
            </ol>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Architecture</h3>
              <hx-badge variant="warning">Concepts</hx-badge>
            </div>
            <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
              <li><strong>Web Components</strong> — Standards-based, framework-agnostic</li>
              <li><strong>Shadow DOM</strong> — Style encapsulation, no CSS leaks</li>
              <li><strong>Lit 3</strong> — Reactive properties, declarative templates</li>
              <li><strong>@lit/react</strong> — Property/event bridging for React</li>
              <li><strong>hx-theme</strong> — Token injection via adopted stylesheets</li>
            </ul>
          </hx-card>
        </div>
      </section>

      <section className="container section" style={{ borderTop: '1px solid var(--hx-page-border)' }}>
        <div className="section-header">
          <h2>Integration Patterns</h2>
        </div>
        <div className="grid-3">
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Server Components</h3>
              <hx-badge variant="success">SSR</hx-badge>
            </div>
            <p className="text-secondary" style={{ marginBottom: '1rem' }}>
              HELiX tags render as declarative HTML in Server Components. No JavaScript shipped to the client until hydration.
            </p>
            <pre style={{ padding: '1rem', borderRadius: '0.5rem', fontSize: '0.85rem', overflow: 'auto' }}>
{\`// Server Component (default)
export default function Page() {
  return (
    <hx-card>
      <div slot="header">Title</div>
      <p>Static content, zero JS</p>
    </hx-card>
  );
}\`}
            </pre>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Client Components</h3>
              <hx-badge variant="info">Interactive</hx-badge>
            </div>
            <p className="text-secondary" style={{ marginBottom: '1rem' }}>
              Add interactivity with client components. Use @lit/react wrappers for type-safe event handling.
            </p>
            <pre style={{ padding: '1rem', borderRadius: '0.5rem', fontSize: '0.85rem', overflow: 'auto' }}>
{\`'use client';
import { HxButton } from
  '@/components/helix/wrappers';

<HxButton
  onHxClick={handleClick}
  variant="primary"
>
  Click me
</HxButton>\`}
            </pre>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Theming</h3>
              <hx-badge variant="warning">Tokens</hx-badge>
            </div>
            <p className="text-secondary" style={{ marginBottom: '1rem' }}>
              Override design tokens at the semantic tier. Changes cascade through all components automatically.
            </p>
            <pre style={{ padding: '1rem', borderRadius: '0.5rem', fontSize: '0.85rem', overflow: 'auto' }}>
{\`/* helix-tokens.css */
:root {
  --hx-color-primary: #0066cc;
  --hx-font-family: 'Inter';
  --hx-border-radius-md: 8px;
}\`}
            </pre>
          </hx-card>
        </div>
      </section>

      <section className="container section" style={{ borderTop: '1px solid var(--hx-page-border)', paddingBottom: '4rem' }}>
        <div className="section-header">
          <h2>Resources</h2>
        </div>
        <div className="grid-3">
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>API Reference</h3>
              <hx-badge variant="info">External</hx-badge>
            </div>
            <p className="text-secondary" style={{ marginBottom: '1rem' }}>
              Full component API documentation including properties, events, slots, and CSS custom properties.
            </p>
            <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">
              View API Docs &rarr;
            </a>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Source Code</h3>
              <hx-badge variant="success">Open Source</hx-badge>
            </div>
            <p className="text-secondary" style={{ marginBottom: '1rem' }}>
              HELiX is open source under the MIT license. Contributions welcome.
            </p>
            <a href="https://github.com/bookedsolidtech/helix" target="_blank" rel="noopener noreferrer">
              View on GitHub &rarr;
            </a>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>HELiXiR MCP</h3>
              <hx-badge variant="warning">AI Tools</hx-badge>
            </div>
            <p className="text-secondary" style={{ marginBottom: '1rem' }}>
              Query component metadata, tokens, and a11y scores from your AI coding assistant.
            </p>
            <a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer">
              Learn More &rarr;
            </a>
          </hx-card>
        </div>
      </section>

      <Footer />
    </hx-theme>
  );
}
`,
  );

  // Forms example page — demonstrates form participation with web components
  const examplesDir = path.join(appDir, 'examples');
  const formsDir = path.join(examplesDir, 'forms');
  await safeEnsureDir(formsDir);

  await safeWriteFile(
    path.join(formsDir, 'page.tsx'),
    `'use client';

import { useRef, useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

/**
 * Form Participation Example
 *
 * HELiX form components use ElementInternals to participate in native HTML forms.
 * This means they work with FormData, form validation, and submit/reset events.
 */
export default function FormsExample() {
  const formRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const handleSubmit = (e: Event) => {
      e.preventDefault();
      const data = new FormData(form);
      const entries: Record<string, string> = {};
      data.forEach((value, key) => {
        entries[key] = value.toString();
      });
      setFormData(entries);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 5000);
    };

    form.addEventListener('submit', handleSubmit);
    return () => form.removeEventListener('submit', handleSubmit);
  }, []);

  return (
    <hx-theme theme="auto">
      <Navbar />
      <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Form Participation</h1>
        <p style={{ color: 'var(--hx-color-text-secondary, #666)', marginBottom: '2rem' }}>
          HELiX form components participate in native HTML forms via ElementInternals.
          No special React wrappers needed — just use a standard {'<form>'} element.
        </p>

        <hx-card>
          <div slot="header"><h2>Registration Form</h2></div>
          <form ref={formRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
              <hx-text-input name="firstName" label="First name" placeholder="Jane" required></hx-text-input>
              <hx-text-input name="lastName" label="Last name" placeholder="Doe" required></hx-text-input>
            </div>
            <hx-text-input name="email" label="Email" type="email" placeholder="jane@example.com" required></hx-text-input>
            <hx-textarea name="bio" label="Bio" placeholder="Tell us about yourself..." rows={3}></hx-textarea>
            <hx-select name="role" label="Role">
              <option value="">Select a role...</option>
              <option value="developer">Developer</option>
              <option value="designer">Designer</option>
              <option value="manager">Manager</option>
            </hx-select>
            <hx-checkbox name="terms" label="I agree to the terms and conditions" required></hx-checkbox>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <hx-button variant="primary" type="submit">Submit</hx-button>
              <hx-button variant="secondary" type="reset">Reset</hx-button>
            </div>
          </form>
        </hx-card>

        {submitted && (
          <hx-card style={{ marginTop: '1.5rem' }}>
            <div slot="header">
              <h3>Form Data (from FormData API)</h3>
              <hx-badge variant="success">Submitted</hx-badge>
            </div>
            <pre style={{
              padding: '1rem',
              background: 'var(--hx-color-surface-hover, #f5f5f5)',
              borderRadius: '0.5rem',
              fontSize: '0.85rem',
              overflow: 'auto',
            }}>
              {JSON.stringify(formData, null, 2)}
            </pre>
          </hx-card>
        )}

        <hx-card style={{ marginTop: '1.5rem' }}>
          <div slot="header"><h3>How It Works</h3></div>
          <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
            <li><strong>ElementInternals:</strong> Each HELiX form component calls <code>this.internals.setFormValue()</code></li>
            <li><strong>FormData:</strong> Values appear in <code>new FormData(form)</code> automatically</li>
            <li><strong>Validation:</strong> Components report validity via <code>internals.setValidity()</code></li>
            <li><strong>Reset:</strong> Forms reset web components via <code>formResetCallback()</code></li>
            <li><strong>No wrappers needed:</strong> This is native browser behavior, not framework-specific</li>
          </ul>
        </hx-card>
      </main>
      <Footer />
    </hx-theme>
  );
}
`,
  );

  // Dashboard example page
  const dashboardDir = path.join(examplesDir, 'dashboard');
  await safeEnsureDir(dashboardDir);

  await safeWriteFile(
    path.join(dashboardDir, 'page.tsx'),
    `'use client';

import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

/**
 * Dashboard Example
 *
 * Shows data display components, layout patterns, and theming with CSS custom properties.
 */
export default function DashboardExample() {
  return (
    <hx-theme theme="auto">
      <Navbar />
      <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1>Dashboard</h1>
            <p style={{ color: 'var(--hx-color-text-secondary, #666)' }}>HELiX data display components in action.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <hx-button variant="secondary" size="sm">Export</hx-button>
            <hx-button variant="primary" size="sm">New Report</hx-button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '2rem' }}>
          <hx-card>
            <div slot="header"><h3 style={{ fontSize: '0.85rem', color: 'var(--hx-color-text-secondary, #888)' }}>Total Users</h3></div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>2,847</div>
            <hx-badge variant="success" style={{ marginTop: '0.5rem' }}>+12.5%</hx-badge>
          </hx-card>
          <hx-card>
            <div slot="header"><h3 style={{ fontSize: '0.85rem', color: 'var(--hx-color-text-secondary, #888)' }}>Active Sessions</h3></div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>1,024</div>
            <hx-badge variant="info" style={{ marginTop: '0.5rem' }}>Live</hx-badge>
          </hx-card>
          <hx-card>
            <div slot="header"><h3 style={{ fontSize: '0.85rem', color: 'var(--hx-color-text-secondary, #888)' }}>Uptime</h3></div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>99.9%</div>
            <hx-progress-bar value={99.9} max={100} style={{ marginTop: '0.5rem' }}></hx-progress-bar>
          </hx-card>
          <hx-card>
            <div slot="header"><h3 style={{ fontSize: '0.85rem', color: 'var(--hx-color-text-secondary, #888)' }}>Response Time</h3></div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>142ms</div>
            <hx-badge variant="warning" style={{ marginTop: '0.5rem' }}>Avg</hx-badge>
          </hx-card>
        </div>

        <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '2fr 1fr' }}>
          <hx-card>
            <div slot="header">
              <h3>Recent Activity</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { user: 'Sarah Chen', action: 'Deployed v2.4.1', time: '2 min ago', variant: 'success' as const },
                { user: 'Mike Johnson', action: 'Created pull request #847', time: '15 min ago', variant: 'info' as const },
                { user: 'Emily Park', action: 'Merged feature/auth-flow', time: '1 hr ago', variant: 'info' as const },
                { user: 'Alex Rivera', action: 'Reported bug #312', time: '3 hrs ago', variant: 'warning' as const },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid var(--hx-color-border, #eee)' }}>
                  <hx-avatar size="sm">{item.user.split(' ').map(n => n[0]).join('')}</hx-avatar>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{item.user}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--hx-color-text-secondary, #888)' }}>{item.action}</div>
                  </div>
                  <hx-badge variant={item.variant}>{item.time}</hx-badge>
                </div>
              ))}
            </div>
          </hx-card>

          <hx-card>
            <div slot="header"><h3>System Status</h3></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>CPU</span><span>67%</span>
                </div>
                <hx-progress-bar value={67} max={100}></hx-progress-bar>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Memory</span><span>4.2 / 8 GB</span>
                </div>
                <hx-progress-bar value={52} max={100}></hx-progress-bar>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Storage</span><span>180 / 500 GB</span>
                </div>
                <hx-progress-bar value={36} max={100}></hx-progress-bar>
              </div>
              <hx-divider></hx-divider>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <hx-tag>us-east-1</hx-tag>
                <hx-tag>production</hx-tag>
                <hx-tag>k8s</hx-tag>
              </div>
            </div>
          </hx-card>
        </div>
      </main>
      <Footer />
    </hx-theme>
  );
}
`,
  );

  // Examples layout — simplified since each page has its own navbar
  await safeWriteFile(
    path.join(examplesDir, 'layout.tsx'),
    `export default function ExamplesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
`,
  );

  await writeReactErrorBoundary(options);
}

async function scaffoldReactVite(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  await safeEnsureDir(srcDir);

  // Generate unique install tracking ID
  const installId = randomBytes(8).toString('hex');

  // Copy brand assets into public/og/
  const assetsSource = path.join(new URL('.', import.meta.url).pathname, '..', 'assets', 'og');
  const publicOgDir = path.join(options.directory, 'public', 'og');
  if (await fs.pathExists(assetsSource)) {
    await safeCopyDir(assetsSource, publicOgDir);
  }

  // vite.config.ts
  await safeWriteFile(
    path.join(options.directory, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
  );

  // index.html
  await safeWriteFile(
    path.join(options.directory, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSP_META}
    <title>${sanitizeForHtml(options.name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );

  // main.tsx — imports helix-setup (which loads library + tokens) and wraps app in HelixProvider
  await safeWriteFile(
    path.join(srcDir, 'main.tsx'),
    `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
${options.designTokens ? "import './helix-setup';" : "import '@helixui/library';"}
import './index.css';
import { HelixProvider } from './components/helix/provider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelixProvider>
      <App />
    </HelixProvider>
  </React.StrictMode>,
);
`,
  );

  // React wrappers for HELiX components (no 'use client' — SPA, all client-side)
  await safeEnsureDir(path.join(srcDir, 'components', 'helix'));
  await safeWriteFile(
    path.join(srcDir, 'components', 'helix', 'wrappers.tsx'),
    `/**
 * React wrappers for HELiX web components.
 *
 * @lit/react creates type-safe React components that properly bridge:
 * - Properties (not just attributes)
 * - Events (CustomEvent -> React callbacks)
 * - Refs
 *
 * Usage:
 *   import { HxButton, HxCard, HxTextInput } from './components/helix/wrappers';
 *   <HxButton variant="primary" onHxClick={handleClick}>Save</HxButton>
 */
import { createComponent } from '@lit/react';
import React from 'react';

// Import the web components (registers custom elements)
// Uses the ./components/* export map from @helixui/library
import '@helixui/library/components/hx-button';
import '@helixui/library/components/hx-card';
import '@helixui/library/components/hx-text-input';
import '@helixui/library/components/hx-select';
import '@helixui/library/components/hx-checkbox';
import '@helixui/library/components/hx-switch';
import '@helixui/library/components/hx-dialog';
import '@helixui/library/components/hx-alert';
import '@helixui/library/components/hx-badge';
import '@helixui/library/components/hx-tabs';
// hx-tab and hx-tab-panel are registered by the hx-tabs import
import '@helixui/library/components/hx-avatar';
import '@helixui/library/components/hx-divider';
import '@helixui/library/components/hx-tooltip';
import '@helixui/library/components/hx-textarea';
import '@helixui/library/components/hx-data-table';
import '@helixui/library/components/hx-top-nav';
import '@helixui/library/components/hx-progress-bar';
import '@helixui/library/components/hx-tag';
import '@helixui/library/components/hx-code-snippet';

// JSX types are declared globally in src/helix.d.ts
// This file provides React-wrapped versions with proper event bridging

export const HxButton = createComponent({
  tagName: 'hx-button',
  elementClass: customElements.get('hx-button') as CustomElementConstructor,
  react: React,
  events: {
    onHxClick: 'hx-click',
    onHxFocus: 'hx-focus',
    onHxBlur: 'hx-blur',
  },
});

export const HxCard = createComponent({
  tagName: 'hx-card',
  elementClass: customElements.get('hx-card') as CustomElementConstructor,
  react: React,
});

export const HxTextInput = createComponent({
  tagName: 'hx-text-input',
  elementClass: customElements.get('hx-text-input') as CustomElementConstructor,
  react: React,
  events: {
    onHxInput: 'hx-input',
    onHxChange: 'hx-change',
    onHxFocus: 'hx-focus',
    onHxBlur: 'hx-blur',
  },
});

export const HxSelect = createComponent({
  tagName: 'hx-select',
  elementClass: customElements.get('hx-select') as CustomElementConstructor,
  react: React,
  events: {
    onHxChange: 'hx-change',
  },
});

export const HxCheckbox = createComponent({
  tagName: 'hx-checkbox',
  elementClass: customElements.get('hx-checkbox') as CustomElementConstructor,
  react: React,
  events: {
    onHxChange: 'hx-change',
  },
});

export const HxSwitch = createComponent({
  tagName: 'hx-switch',
  elementClass: customElements.get('hx-switch') as CustomElementConstructor,
  react: React,
  events: {
    onHxChange: 'hx-change',
  },
});

export const HxDialog = createComponent({
  tagName: 'hx-dialog',
  elementClass: customElements.get('hx-dialog') as CustomElementConstructor,
  react: React,
  events: {
    onHxClose: 'hx-close',
    onHxOpen: 'hx-open',
  },
});

export const HxAlert = createComponent({
  tagName: 'hx-alert',
  elementClass: customElements.get('hx-alert') as CustomElementConstructor,
  react: React,
  events: {
    onHxClose: 'hx-close',
  },
});

export const HxBadge = createComponent({
  tagName: 'hx-badge',
  elementClass: customElements.get('hx-badge') as CustomElementConstructor,
  react: React,
});

export const HxTabs = createComponent({
  tagName: 'hx-tabs',
  elementClass: customElements.get('hx-tabs') as CustomElementConstructor,
  react: React,
  events: {
    onHxChange: 'hx-change',
  },
});

export const HxTab = createComponent({
  tagName: 'hx-tab',
  elementClass: customElements.get('hx-tab') as CustomElementConstructor,
  react: React,
});

export const HxTabPanel = createComponent({
  tagName: 'hx-tab-panel',
  elementClass: customElements.get('hx-tab-panel') as CustomElementConstructor,
  react: React,
});

export const HxAvatar = createComponent({
  tagName: 'hx-avatar',
  elementClass: customElements.get('hx-avatar') as CustomElementConstructor,
  react: React,
});

export const HxDivider = createComponent({
  tagName: 'hx-divider',
  elementClass: customElements.get('hx-divider') as CustomElementConstructor,
  react: React,
});

export const HxTooltip = createComponent({
  tagName: 'hx-tooltip',
  elementClass: customElements.get('hx-tooltip') as CustomElementConstructor,
  react: React,
});

export const HxTextarea = createComponent({
  tagName: 'hx-textarea',
  elementClass: customElements.get('hx-textarea') as CustomElementConstructor,
  react: React,
  events: {
    onHxInput: 'hx-input',
    onHxChange: 'hx-change',
  },
});

export const HxDataTable = createComponent({
  tagName: 'hx-data-table',
  elementClass: customElements.get('hx-data-table') as CustomElementConstructor,
  react: React,
  events: {
    onHxSort: 'hx-sort',
    onHxRowSelect: 'hx-row-select',
  },
});

export const HxTopNav = createComponent({
  tagName: 'hx-top-nav',
  elementClass: customElements.get('hx-top-nav') as CustomElementConstructor,
  react: React,
  events: {
    onHxMobileToggle: 'hx-mobile-toggle',
  },
});

export const HxProgressBar = createComponent({
  tagName: 'hx-progress-bar',
  elementClass: customElements.get('hx-progress-bar') as CustomElementConstructor,
  react: React,
});

export const HxTag = createComponent({
  tagName: 'hx-tag',
  elementClass: customElements.get('hx-tag') as CustomElementConstructor,
  react: React,
});

export const HxCodeSnippet = createComponent({
  tagName: 'hx-code-snippet',
  elementClass: customElements.get('hx-code-snippet') as CustomElementConstructor,
  react: React,
});
`,
  );

  // HelixProvider — SPA version, applies theme on mount (library loaded by helix-setup.ts)
  await safeWriteFile(
    path.join(srcDir, 'components', 'helix', 'provider.tsx'),
    `/**
 * HelixProvider — initializes HELiX web components for the SPA.
 *
 * In a Vite SPA all code runs client-side, so we can apply the initial theme
 * synchronously on mount. The library itself is already loaded by helix-setup.ts.
 *
 * Wrap your root component with this provider to ensure the theme is set
 * before the first render completes.
 */
import { useEffect, type ReactNode } from 'react';

interface HelixProviderProps {
  children: ReactNode;
  /** Explicit theme — overrides system preference */
  theme?: 'light' | 'dark' | 'system';
}

export function HelixProvider({ children, theme }: HelixProviderProps) {
  useEffect(() => {
    if (theme && theme !== 'system') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // Render children immediately — HELiX is loaded synchronously via helix-setup.ts
  return <>{children}</>;
}
`,
  );

  // JSX type declarations for custom elements
  await safeWriteFile(
    path.join(srcDir, 'helix.d.ts'),
    `/**
 * JSX type declarations for HELiX web components.
 *
 * This allows TypeScript to understand hx-* elements in JSX.
 * Properties are typed as 'any' for flexibility — for strict typing,
 * use the @lit/react wrappers in src/components/helix/wrappers.tsx.
 */
import 'react';

type HxElement = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'hx-accordion': HxElement;
      'hx-accordion-item': HxElement;
      'hx-alert': HxElement;
      'hx-avatar': HxElement;
      'hx-badge': HxElement;
      'hx-banner': HxElement;
      'hx-breadcrumb': HxElement;
      'hx-button': HxElement;
      'hx-button-group': HxElement;
      'hx-card': HxElement;
      'hx-carousel': HxElement;
      'hx-checkbox': HxElement;
      'hx-checkbox-group': HxElement;
      'hx-code-snippet': HxElement;
      'hx-color-picker': HxElement;
      'hx-combobox': HxElement;
      'hx-counter': HxElement;
      'hx-data-table': HxElement;
      'hx-date-picker': HxElement;
      'hx-dialog': HxElement;
      'hx-divider': HxElement;
      'hx-drawer': HxElement;
      'hx-dropdown': HxElement;
      'hx-field': HxElement;
      'hx-field-label': HxElement;
      'hx-file-upload': HxElement;
      'hx-grid': HxElement;
      'hx-icon': HxElement;
      'hx-icon-button': HxElement;
      'hx-menu': HxElement;
      'hx-menu-item': HxElement;
      'hx-meter': HxElement;
      'hx-nav': HxElement;
      'hx-pagination': HxElement;
      'hx-popover': HxElement;
      'hx-progress-bar': HxElement;
      'hx-progress-ring': HxElement;
      'hx-radio-group': HxElement;
      'hx-rating': HxElement;
      'hx-select': HxElement;
      'hx-skeleton': HxElement;
      'hx-slider': HxElement;
      'hx-spinner': HxElement;
      'hx-split-button': HxElement;
      'hx-split-panel': HxElement;
      'hx-stat': HxElement;
      'hx-status-indicator': HxElement;
      'hx-switch': HxElement;
      'hx-tab': HxElement;
      'hx-tab-panel': HxElement;
      'hx-tabs': HxElement;
      'hx-tag': HxElement;
      'hx-text': HxElement;
      'hx-text-input': HxElement;
      'hx-textarea': HxElement;
      'hx-theme': HxElement;
      'hx-toast': HxElement;
      'hx-tooltip': HxElement;
      'hx-top-nav': HxElement;
      'hx-tree-item': HxElement;
      'hx-tree-view': HxElement;
    }
  }
}

export {};
`,
  );

  // index.css — production stylesheet with dark mode support and HELiX token overrides
  await safeWriteFile(
    path.join(srcDir, 'index.css'),
    `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  color-scheme: light dark;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --hx-page-bg: #0a0a0f;
  --hx-page-text: #e4e4e7;
  --hx-page-text-secondary: #a1a1aa;
  --hx-page-surface: #18181b;
  --hx-page-surface-raised: #27272a;
  --hx-page-border: #3f3f46;
  --hx-page-code-bg: #27272a;
}

html[data-theme="light"],
html:not([data-theme]) {
  --hx-page-bg: #fafafa;
  --hx-page-text: #18181b;
  --hx-page-text-secondary: #71717a;
  --hx-page-surface: #ffffff;
  --hx-page-surface-raised: #f4f4f5;
  --hx-page-border: #e4e4e7;
  --hx-page-code-bg: #f4f4f5;
}

body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: var(--hx-page-text);
  background: var(--hx-page-bg);
  -webkit-font-smoothing: antialiased;
  transition: background 0.2s ease, color 0.2s ease;
}

#root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

a {
  color: var(--hx-color-primary-500, #3b82f6);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

h1, h2, h3, h4 {
  color: var(--hx-page-text);
  letter-spacing: -0.025em;
}

code {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: 0.85em;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--hx-page-code-bg);
  color: var(--hx-page-text);
}

pre {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  background: var(--hx-page-code-bg) !important;
  color: var(--hx-page-text);
  border: 1px solid var(--hx-page-border);
}

.hero {
  padding: 5rem 2rem;
  text-align: center;
  background: var(--hx-page-surface);
  border-bottom: 1px solid var(--hx-page-border);
}

.hero h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 800;
  margin-bottom: 1rem;
  line-height: 1.1;
}

.hero p {
  font-size: 1.125rem;
  color: var(--hx-page-text-secondary);
  max-width: 600px;
  margin: 0 auto 2rem;
}

.section {
  padding: 4rem 0;
}

.section-header {
  margin-bottom: 2rem;
}

.section-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.section-header p {
  color: var(--hx-page-text-secondary);
}

.grid-auto {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.grid-3 {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.grid-4 {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

hx-top-nav {
  --hx-top-nav-bg: var(--hx-page-surface);
  --hx-top-nav-color: var(--hx-page-text);
  --hx-top-nav-border-color: var(--hx-page-border);
  border-radius: 0;
  position: sticky;
  top: 0;
  z-index: 1000;
}

hx-top-nav::part(header) {
  border-radius: 0;
}

hx-card {
  --hx-card-bg: var(--hx-page-surface);
  --hx-card-color: var(--hx-page-text);
  --hx-card-border-color: var(--hx-page-border);
}

hx-card::part(header) {
  background: var(--hx-page-surface-raised);
  border-bottom: 1px solid var(--hx-page-border);
  padding: 0.875rem 1.25rem;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
}

.grid-auto hx-card,
.grid-3 hx-card,
.grid-4 hx-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.grid-auto hx-card::part(card),
.grid-3 hx-card::part(card),
.grid-4 hx-card::part(card) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.grid-auto,
.grid-3,
.grid-4 {
  align-items: stretch;
}

.text-secondary {
  color: var(--hx-page-text-secondary);
}

.promo-grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.promo-card {
  position: relative;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid var(--hx-page-border);
  background: var(--hx-page-surface);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
}

.promo-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  text-decoration: none;
}

.promo-card-image {
  width: 100%;
  aspect-ratio: 1200 / 630;
  object-fit: cover;
  display: block;
  border-bottom: 1px solid var(--hx-page-border);
}

.promo-card-body {
  padding: 1.25rem 1.5rem 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.promo-card-body h3 {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--hx-page-text);
}

.promo-card-body p {
  font-size: 0.9rem;
  color: var(--hx-page-text-secondary);
  line-height: 1.5;
  flex: 1;
}

.promo-card-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--hx-color-primary-500, #3b82f6);
}

.promo-card:hover .promo-card-cta {
  text-decoration: underline;
}

.site-footer {
  background: var(--hx-page-surface);
  border-top: 1px solid var(--hx-page-border);
  padding: 3rem 0 2rem;
  margin-top: auto;
}

.footer-grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: 1.5fr repeat(3, 1fr);
}

@media (max-width: 768px) {
  .footer-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .footer-grid {
    grid-template-columns: 1fr;
  }
}

.footer-brand p {
  margin: 0;
}

.footer-heading {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hx-page-text);
  margin-bottom: 0.75rem;
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.footer-links li {
  margin-bottom: 0.5rem;
}

.footer-links a {
  color: var(--hx-page-text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
  transition: color 0.15s ease;
}

.footer-links a:hover {
  color: var(--hx-page-text);
  text-decoration: none;
}

.footer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.footer-bottom p {
  margin: 0;
}
`,
  );

  // Theme toggle component
  await safeWriteFile(
    path.join(srcDir, 'components', 'theme-toggle.tsx'),
    `import { useCallback, useEffect, useRef } from 'react';

/**
 * Dark mode toggle using hx-switch.
 *
 * Sets data-theme on <html> for page-level CSS vars and updates
 * all hx-theme elements for component token scoping.
 */
export function ThemeToggle() {
  const switchRef = useRef<HTMLElement>(null);

  const applyTheme = useCallback((theme: 'light' | 'dark') => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('hx-theme').forEach((el) => {
      (el as HTMLElement & { theme: string }).theme = theme;
    });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('helix-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    applyTheme(isDark ? 'dark' : 'light');
    if (switchRef.current) {
      (switchRef.current as HTMLInputElement).checked = isDark;
    }
  }, [applyTheme]);

  const handleChange = useCallback((e: Event) => {
    const checked = (e as CustomEvent).detail?.checked ?? false;
    const theme = checked ? 'dark' : 'light';
    applyTheme(theme);
    localStorage.setItem('helix-theme', theme);
  }, [applyTheme]);

  useEffect(() => {
    const el = switchRef.current;
    el?.addEventListener('hx-change', handleChange);
    return () => el?.removeEventListener('hx-change', handleChange);
  }, [handleChange]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.8rem' }}>Dark</span>
      <hx-switch ref={switchRef} size="sm" />
    </div>
  );
}
`,
  );

  // Navbar component (plain <a> tags — no Next.js Link)
  await safeWriteFile(
    path.join(srcDir, 'components', 'navbar.tsx'),
    `import { ThemeToggle } from './theme-toggle';

export function Navbar() {
  return (
    <hx-top-nav sticky label="Main navigation">
      <div slot="logo">
        <a href="/" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          textDecoration: 'none',
          color: 'inherit',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img src="/og/bs-hx-square.png" alt="HELiX" style={{ height: '30px', width: '30px', borderRadius: '5px' }} />
            <span style={{ fontWeight: 700, fontSize: '1.125rem', letterSpacing: '-0.025em' }}>HELiX</span>
          </div>
          <span style={{ opacity: 0.25, fontSize: '1.25rem', fontWeight: 200 }}>+</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="20" height="20" viewBox="0 0 410 404" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M399.641 59.5246L215.643 388.545C211.844 395.338 202.084 395.338 198.285 388.545L14.2857 59.5246C10.3171 52.427 15.468 43.6 23.5714 43.6H390.357C398.46 43.6 403.611 52.427 399.641 59.5246Z" fill="#41B883"/>
            </svg>
            <span style={{ fontWeight: 600, fontSize: '0.95rem', opacity: 0.9 }}>Vite</span>
          </div>
        </a>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginLeft: '2rem' }}>
        <a href="#components" style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.8 }}>Components</a>
        <a href="#getting-started" style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.8 }}>Getting Started</a>
        <a href="https://github.com/bookedsolidtech/helix" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', opacity: 0.8 }}>Docs</a>
      </div>
      <div slot="actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <ThemeToggle />
        <a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer"
          style={{ color: 'inherit', display: 'flex', alignItems: 'center', opacity: 0.7 }}
          title="Booked Solid on GitHub">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
        <a href="https://bookedsolid.tech" target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center' }}
          title="Booked Solid Technology">
          <img src="https://bookedsolid.tech/logos/bs-bs-software-square.png?utm_source=create-helix&utm_medium=scaffold&utm_id=${installId}" alt="Booked Solid" style={{ height: '28px', width: '28px', borderRadius: '4px' }} />
        </a>
      </div>
    </hx-top-nav>
  );
}
`,
  );

  // Footer component
  await safeWriteFile(
    path.join(srcDir, 'components', 'footer.tsx'),
    `export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <img
                src="/og/bs-hx-square.png"
                alt="HELiX"
                style={{ height: '32px', width: '32px', borderRadius: '4px' }}
              />
              <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>HELiX</span>
            </div>
            <p className="text-secondary" style={{ fontSize: '0.85rem', lineHeight: '1.6', maxWidth: '280px' }}>
              Enterprise web components built on Lit 3. Accessible, themeable, and framework-agnostic.
            </p>
          </div>
          <div>
            <h4 className="footer-heading">Product</h4>
            <ul className="footer-links">
              <li><a href="#components">Components</a></li>
              <li><a href="#getting-started">Getting Started</a></li>
              <li><a href="https://github.com/bookedsolidtech/helix" target="_blank" rel="noopener noreferrer">Documentation</a></li>
            </ul>
          </div>
          <div>
            <h4 className="footer-heading">Ecosystem</h4>
            <ul className="footer-links">
              <li><a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX UI</a></li>
              <li><a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer">HELiXiR</a></li>
              <li><a href="https://bookedsolid.tech/discord-ops" target="_blank" rel="noopener noreferrer">Discord-Ops</a></li>
              <li><a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer">GitHub</a></li>
            </ul>
          </div>
          <div>
            <h4 className="footer-heading">Legal</h4>
            <ul className="footer-links">
              <li><a href="https://bookedsolid.tech/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
              <li><a href="https://bookedsolid.tech/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a></li>
              <li><a href="https://bookedsolid.tech/about" target="_blank" rel="noopener noreferrer">About</a></li>
            </ul>
          </div>
        </div>
        <hx-divider style={{ margin: '2rem 0 1.5rem' }}></hx-divider>
        <div className="footer-bottom">
          <p className="text-secondary" style={{ fontSize: '0.8rem' }}>
            &copy; {year} Booked Solid Technology, a d/b/a of Clarity House LLC. All rights reserved.
            Built with{' '}
            <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX</a> and{' '}
            <a href="https://vite.dev" target="_blank" rel="noopener noreferrer">Vite</a>.
          </p>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer"
              className="text-secondary" style={{ display: 'flex' }} title="GitHub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
            <a href="https://bookedsolid.tech" target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center' }} title="Booked Solid Technology">
              <img src="/og/bs-bs-software-square.png" alt="BS" style={{ height: '20px', width: '20px', borderRadius: '3px', opacity: 0.7 }} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
`,
  );

  // App.tsx — production landing page showcasing HELiX components (SPA, no Next.js specifics)
  await safeWriteFile(
    path.join(srcDir, 'App.tsx'),
    `import { useState, useRef, useEffect } from 'react';
import { Navbar } from './components/navbar';
import { Footer } from './components/footer';

export default function App() {
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const nameInputRef = useRef<HTMLElement>(null);
  const greetBtnRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const input = nameInputRef.current;
    const btn = greetBtnRef.current;

    const handleInput = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setName(detail?.value ?? '');
    };

    const handleClick = () => {
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    };

    input?.addEventListener('hx-input', handleInput);
    btn?.addEventListener('hx-click', handleClick);

    return () => {
      input?.removeEventListener('hx-input', handleInput);
      btn?.removeEventListener('hx-click', handleClick);
    };
  }, []);

  return (
    <hx-theme theme="auto">
      <Navbar />

      {/* Hero */}
      <section className="hero">
        <div className="container">
          <h1>HELiX + React + Vite</h1>
          <p>
            Enterprise-grade web components running natively in React.
            75+ accessible, themeable components with Shadow DOM encapsulation.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <hx-button variant="primary" size="lg">
              <a href="#components" style={{ color: 'inherit', textDecoration: 'none' }}>
                Explore Components
              </a>
            </hx-button>
            <hx-button variant="secondary" size="lg">
              <a href="#getting-started" style={{ color: 'inherit', textDecoration: 'none' }}>
                Getting Started
              </a>
            </hx-button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <hx-tag>Lit 3</hx-tag>
            <hx-tag>Shadow DOM</hx-tag>
            <hx-tag>WCAG 2.1 AA</hx-tag>
            <hx-tag>React 19</hx-tag>
            <hx-tag>Vite 6</hx-tag>
            <hx-tag>SPA</hx-tag>
          </div>
        </div>
      </section>

      {/* Component Showcase */}
      <section id="components" className="container section">
        <div className="section-header">
          <h2>Component Showcase</h2>
          <p>A sampling of HELiX components — all rendered as native web components via Shadow DOM.</p>
        </div>

        <div className="grid-auto">
          {/* Interactive Card */}
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Interactive Input</h3>
              <hx-badge variant="info">Forms</hx-badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <hx-text-input
                ref={nameInputRef}
                label="Your name"
                placeholder="Enter your name"
              ></hx-text-input>
              <hx-button ref={greetBtnRef} variant="primary">
                Say Hello
              </hx-button>
              {submitted && (
                <hx-alert variant="success" open>
                  Hello, {name || 'World'}! HELiX components are working.
                </hx-alert>
              )}
            </div>
          </hx-card>

          {/* Button Variants */}
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Button Variants</h3>
              <hx-badge variant="success">Actions</hx-badge>
            </div>
            <p className="text-secondary" style={{ marginBottom: '1rem' }}>
              All button styles respond to the active theme.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <hx-button variant="primary" size="sm">Primary</hx-button>
              <hx-button variant="secondary" size="sm">Secondary</hx-button>
              <hx-button variant="danger" size="sm">Danger</hx-button>
              <hx-button variant="ghost" size="sm">Ghost</hx-button>
            </div>
          </hx-card>

          {/* Data Display */}
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Data Display</h3>
              <hx-badge variant="warning">Metrics</hx-badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Build Status</span>
                <hx-badge variant="success">Passing</hx-badge>
              </div>
              <hx-progress-bar value={87} max={100}></hx-progress-bar>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <hx-tag>v1.1.2</hx-tag>
                <hx-tag>stable</hx-tag>
                <hx-tag>MIT</hx-tag>
              </div>
            </div>
          </hx-card>

          {/* Avatars and Badges */}
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Avatars &amp; Badges</h3>
              <hx-badge variant="danger">Identity</hx-badge>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <hx-avatar size="sm">AB</hx-avatar>
              <hx-avatar size="md">CD</hx-avatar>
              <hx-avatar size="lg">EF</hx-avatar>
              <hx-divider vertical style={{ height: '2rem' }}></hx-divider>
              <hx-badge variant="info">Info</hx-badge>
              <hx-badge variant="success">Success</hx-badge>
              <hx-badge variant="warning">Warning</hx-badge>
              <hx-badge variant="danger">Danger</hx-badge>
            </div>
          </hx-card>
        </div>
      </section>

      {/* Tabbed Content */}
      <section className="container section" style={{ borderTop: '1px solid var(--hx-page-border)' }}>
        <hx-tabs>
          <hx-tab slot="nav">React Patterns</hx-tab>
          <hx-tab slot="nav">Theming</hx-tab>
          <hx-tab slot="nav">Event Handling</hx-tab>

          <hx-tab-panel>
            <div style={{ padding: '1.5rem 0' }}>
              <hx-card>
                <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Using HELiX in a Vite SPA</h3>
                  <hx-badge variant="info">Architecture</hx-badge>
                </div>
                <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
                  <li><strong>helix-setup.ts</strong> imports <code>@helixui/library</code> — registers all custom elements</li>
                  <li><strong>HelixProvider</strong> wraps the app and applies the initial theme</li>
                  <li><strong>@lit/react wrappers</strong> bridge properties and events for type-safe React usage</li>
                  <li><strong>helix.d.ts</strong> provides JSX type declarations for all hx-* elements</li>
                  <li><strong>hx-theme</strong> wraps content and injects CSS tokens for light/dark/high-contrast</li>
                </ul>
              </hx-card>
            </div>
          </hx-tab-panel>

          <hx-tab-panel>
            <div style={{ padding: '1.5rem 0' }}>
              <hx-card>
                <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>CSS Custom Properties</h3>
                  <hx-badge variant="success">Tokens</hx-badge>
                </div>
                <p style={{ marginBottom: '1rem' }}>
                  HELiX uses a three-tier token system: primitive, semantic, and component.
                  Override at the semantic tier to respect theme scoping:
                </p>
                <pre style={{ padding: '1rem', borderRadius: '0.5rem', fontSize: '0.85rem', overflow: 'auto' }}>
{\`:root {
  --hx-color-primary: #0066cc;
  --hx-color-success: #22c55e;
  --hx-spacing-md: 1rem;
}

/* ::part() targets Shadow DOM internals */
hx-button::part(button) {
  font-weight: 600;
}

hx-card::part(card) {
  border: 1px solid var(--hx-color-border);
}\`}
                </pre>
              </hx-card>
            </div>
          </hx-tab-panel>

          <hx-tab-panel>
            <div style={{ padding: '1.5rem 0' }}>
              <hx-card>
                <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Two Approaches</h3>
                  <hx-badge variant="warning">Events</hx-badge>
                </div>
                <pre style={{ padding: '1rem', borderRadius: '0.5rem', fontSize: '0.85rem', overflow: 'auto' }}>
{\`// 1. Direct custom elements + useRef
const ref = useRef<HTMLElement>(null);
useEffect(() => {
  ref.current?.addEventListener('hx-click', handler);
  return () => ref.current?.removeEventListener('hx-click', handler);
}, []);
<hx-button ref={ref}>Click</hx-button>

// 2. @lit/react wrappers (recommended)
import { HxButton } from './components/helix/wrappers';
<HxButton onHxClick={handler}>Click</HxButton>\`}
                </pre>
              </hx-card>
            </div>
          </hx-tab-panel>
        </hx-tabs>
      </section>

      {/* Ecosystem Promos */}
      <section className="container section" style={{ borderTop: '1px solid var(--hx-page-border)' }}>
        <div className="section-header">
          <h2>The Booked Solid Ecosystem</h2>
          <p>Enterprise-grade tools for modern web development and AI-powered workflows.</p>
        </div>
        <div className="promo-grid">
          <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer" className="promo-card">
            <img
              src="/og/helixui.png"
              alt="HELiX UI"
              className="promo-card-image"
            />
            <div className="promo-card-body">
              <h3>HELiX UI</h3>
              <p>
                80+ enterprise web components built on Lit 3. Shadow DOM encapsulation,
                healthcare-first accessibility, and W3C DTCG design tokens. Works everywhere.
              </p>
              <span className="promo-card-cta">Explore HELiX UI &rarr;</span>
            </div>
          </a>
          <a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer" className="promo-card">
            <img
              src="/og/helixir.png"
              alt="HELiXiR"
              className="promo-card-image"
            />
            <div className="promo-card-body">
              <h3>HELiXiR</h3>
              <p>
                MCP server for any CEM-compliant web component library. Connect to Claude, Cursor,
                or any MCP client. Components, tokens, slots, and a11y scores — all queryable.
              </p>
              <span className="promo-card-cta">Explore HELiXiR &rarr;</span>
            </div>
          </a>
          <a href="https://bookedsolid.tech/discord-ops" target="_blank" rel="noopener noreferrer" className="promo-card">
            <img
              src="/og/discord-ops.png"
              alt="Discord-Ops"
              className="promo-card-image"
            />
            <div className="promo-card-body">
              <h3>Discord-Ops</h3>
              <p>
                Agency-grade Discord MCP server for AI agents. 45 tools, 23 message templates,
                multi-guild routing, and multi-bot support.
              </p>
              <span className="promo-card-cta">Explore Discord-Ops &rarr;</span>
            </div>
          </a>
        </div>
      </section>

      {/* Developer Guidance */}
      <section id="getting-started" className="container section" style={{ borderTop: '1px solid var(--hx-page-border)', paddingBottom: '5rem' }}>
        <div className="section-header">
          <h2>Getting Started</h2>
          <p>Your project is ready. Here are the key files and next steps.</p>
        </div>

        <div className="grid-3">
          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Key Files</h3>
              <hx-badge variant="info">Reference</hx-badge>
            </div>
            <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
              <li><code>src/components/helix/wrappers.tsx</code> — React-wrapped components</li>
              <li><code>src/components/helix/provider.tsx</code> — HelixProvider initializer</li>
              <li><code>src/helix.d.ts</code> — JSX type declarations</li>
              <li><code>src/components/navbar.tsx</code> — Top navigation</li>
              <li><code>src/components/theme-toggle.tsx</code> — Dark mode switch</li>
              <li><code>helix-tokens.css</code> — Design token overrides</li>
            </ul>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Commands</h3>
              <hx-badge variant="success">CLI</hx-badge>
            </div>
            <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
              <li><code>npm run dev</code> — Start dev server</li>
              <li><code>npm run build</code> — Production build</li>
              <li><code>npm run preview</code> — Preview production build</li>
            </ul>
            <hx-divider style={{ margin: '1rem 0' }}></hx-divider>
            <p style={{ fontSize: '0.875rem' }} className="text-secondary">
              Add more HELiX components by importing them in <code>wrappers.tsx</code>.
              The full list is in <code>@helixui/library/components/*</code>.
            </p>
          </hx-card>

          <hx-card>
            <div slot="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Next Steps</h3>
              <hx-badge variant="warning">Action</hx-badge>
            </div>
            <ul style={{ lineHeight: '2', paddingLeft: '1.5rem' }}>
              <li>Customize your theme in <code>helix-tokens.css</code></li>
              <li>Add more components from the <a href="https://github.com/bookedsolidtech/helix" target="_blank" rel="noopener noreferrer">component library</a></li>
              <li>Use <code>@lit/react</code> wrappers for type-safe event handling</li>
              <li>Add React Router for multi-page navigation</li>
            </ul>
          </hx-card>
        </div>
      </section>

      <Footer />
    </hx-theme>
  );
}

`,
  );

  await writeReactErrorBoundary(options);
}
async function scaffoldRemix(options: ProjectOptions): Promise<void> {
  const appDir = path.join(options.directory, 'app');
  const routesDir = path.join(appDir, 'routes');
  const stylesDir = path.join(appDir, 'styles');
  const componentsDir = path.join(appDir, 'components', 'helix');
  await safeEnsureDir(routesDir);
  await safeEnsureDir(stylesDir);
  await safeEnsureDir(componentsDir);

  // Copy brand assets into public/og/
  const assetsSource = path.join(new URL('.', import.meta.url).pathname, '..', 'assets', 'og');
  const publicOgDir = path.join(options.directory, 'public', 'og');
  if (await fs.pathExists(assetsSource)) {
    await safeCopyDir(assetsSource, publicOgDir);
  }

  // vite.config.ts
  await safeWriteFile(
    path.join(options.directory, 'vite.config.ts'),
    `import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter()],
});
`,
  );

  // react-router.config.ts
  await safeWriteFile(
    path.join(options.directory, 'react-router.config.ts'),
    `import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
} satisfies Config;
`,
  );

  // app/routes.ts (required by React Router v7)
  await safeWriteFile(
    path.join(appDir, 'routes.ts'),
    `import type { RouteConfig } from '@react-router/dev/routes';
import { flatRoutes } from '@react-router/fs-routes';

export default flatRoutes() satisfies RouteConfig;
`,
  );

  // tsconfig.json for Remix
  await safeWriteJson(
    path.join(options.directory, 'tsconfig.json'),
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['DOM', 'DOM.Iterable', 'ES2022'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        esModuleInterop: true,
        module: 'ESNext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'react-jsx',
        noEmit: true,
      },
      include: ['**/*.ts', '**/*.tsx', '.server/**/*.ts', '.server/**/*.tsx'],
      exclude: ['node_modules'],
    },
    { spaces: 2 },
  );

  // React wrappers for HELiX components (no 'use client' — not a Next.js convention)
  await safeWriteFile(
    path.join(componentsDir, 'wrappers.tsx'),
    `/**
 * React wrappers for HELiX web components.
 *
 * @lit/react creates type-safe React components that properly bridge:
 * - Properties (not just attributes)
 * - Events (CustomEvent → React callbacks)
 * - Refs
 *
 * Note: HELiX web components rely on browser APIs (customElements).
 * In React Router SSR routes, import this file only in client-side code
 * or guard with typeof window !== 'undefined' checks.
 *
 * Usage:
 *   import { HxButton, HxCard } from '../components/helix/wrappers';
 *   <HxButton variant="primary" onHxClick={handleClick}>Save</HxButton>
 */
import { createComponent } from '@lit/react';
import React from 'react';

// Import the web components (registers custom elements)
import '@helixui/library/components/hx-button';
import '@helixui/library/components/hx-card';
import '@helixui/library/components/hx-text-input';
import '@helixui/library/components/hx-select';
import '@helixui/library/components/hx-checkbox';
import '@helixui/library/components/hx-switch';
import '@helixui/library/components/hx-dialog';
import '@helixui/library/components/hx-alert';
import '@helixui/library/components/hx-badge';
import '@helixui/library/components/hx-tabs';
import '@helixui/library/components/hx-avatar';
import '@helixui/library/components/hx-divider';
import '@helixui/library/components/hx-tooltip';
import '@helixui/library/components/hx-textarea';

export const HxButton = createComponent({
  tagName: 'hx-button',
  elementClass: window.customElements.get('hx-button') as CustomElementConstructor,
  react: React,
  events: {
    onHxClick: 'hx-click',
    onHxFocus: 'hx-focus',
    onHxBlur: 'hx-blur',
  },
});

export const HxCard = createComponent({
  tagName: 'hx-card',
  elementClass: window.customElements.get('hx-card') as CustomElementConstructor,
  react: React,
});

export const HxTextInput = createComponent({
  tagName: 'hx-text-input',
  elementClass: window.customElements.get('hx-text-input') as CustomElementConstructor,
  react: React,
  events: {
    onHxChange: 'hx-change',
    onHxInput: 'hx-input',
  },
});

export const HxBadge = createComponent({
  tagName: 'hx-badge',
  elementClass: window.customElements.get('hx-badge') as CustomElementConstructor,
  react: React,
});

export const HxAlert = createComponent({
  tagName: 'hx-alert',
  elementClass: window.customElements.get('hx-alert') as CustomElementConstructor,
  react: React,
});
`,
  );

  // app/components/helix/provider.tsx — HelixProvider (no 'use client' needed in Remix)
  await safeWriteFile(
    path.join(componentsDir, 'provider.tsx'),
    `/**
 * HelixProvider — initializes HELiX web components on the client side.
 *
 * Web components require client-side JavaScript to register custom elements.
 * Wrap your app or layout with this provider to ensure HELiX components are
 * available before rendering.
 *
 * In React Router (Remix), components are client-rendered by default, so
 * no 'use client' directive is needed — unlike Next.js App Router.
 *
 * SSR Notes:
 * - HELiX renders as plain custom elements during SSR (no JS)
 * - Components upgrade and hydrate when the bundle loads client-side
 * - For SSR-only routes, guard custom element access with typeof window !== 'undefined'
 */
import { useEffect, type ReactNode } from 'react';

interface HelixProviderProps {
  children: ReactNode;
  /** Explicit theme — avoids window.matchMedia SSR error from hx-theme */
  theme?: 'light' | 'dark' | 'system';
}

export function HelixProvider({ children, theme }: HelixProviderProps) {
  useEffect(() => {
    // Dynamic import ensures HELiX only loads on the client
    import('@helixui/library')
      .then(() => {
        if (theme && theme !== 'system') {
          document.documentElement.setAttribute('data-theme', theme);
        }
      })
      .catch(() => {
        // Library failed to load — components render as unstyled custom elements
      });
  }, [theme]);

  return <>{children}</>;
}
`,
  );

  // app/helix.d.ts — TypeScript JSX declarations for hx-* elements
  await safeWriteFile(
    path.join(appDir, 'helix.d.ts'),
    `/**
 * JSX type declarations for HELiX web components.
 *
 * Allows TypeScript to understand hx-* elements in JSX without errors.
 * For strict prop typing and event bridging, use the @lit/react wrappers
 * in app/components/helix/wrappers.tsx instead.
 */
import 'react';

type HxElement = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> &
  Record<string, unknown>;

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'hx-accordion': HxElement;
      'hx-accordion-item': HxElement;
      'hx-alert': HxElement;
      'hx-avatar': HxElement;
      'hx-badge': HxElement;
      'hx-banner': HxElement;
      'hx-breadcrumb': HxElement;
      'hx-button': HxElement;
      'hx-button-group': HxElement;
      'hx-card': HxElement;
      'hx-carousel': HxElement;
      'hx-checkbox': HxElement;
      'hx-checkbox-group': HxElement;
      'hx-code-snippet': HxElement;
      'hx-color-picker': HxElement;
      'hx-combobox': HxElement;
      'hx-counter': HxElement;
      'hx-data-table': HxElement;
      'hx-date-picker': HxElement;
      'hx-dialog': HxElement;
      'hx-divider': HxElement;
      'hx-drawer': HxElement;
      'hx-dropdown': HxElement;
      'hx-field': HxElement;
      'hx-field-label': HxElement;
      'hx-file-upload': HxElement;
      'hx-grid': HxElement;
      'hx-icon': HxElement;
      'hx-icon-button': HxElement;
      'hx-menu': HxElement;
      'hx-menu-item': HxElement;
      'hx-meter': HxElement;
      'hx-nav': HxElement;
      'hx-pagination': HxElement;
      'hx-popover': HxElement;
      'hx-progress-bar': HxElement;
      'hx-progress-ring': HxElement;
      'hx-radio-group': HxElement;
      'hx-rating': HxElement;
      'hx-select': HxElement;
      'hx-skeleton': HxElement;
      'hx-slider': HxElement;
      'hx-spinner': HxElement;
      'hx-split-button': HxElement;
      'hx-split-panel': HxElement;
      'hx-stat': HxElement;
      'hx-status-indicator': HxElement;
      'hx-switch': HxElement;
      'hx-tab': HxElement;
      'hx-tab-panel': HxElement;
      'hx-tabs': HxElement;
      'hx-tag': HxElement;
      'hx-text': HxElement;
      'hx-text-input': HxElement;
      'hx-textarea': HxElement;
      'hx-theme': HxElement;
      'hx-toast': HxElement;
      'hx-tooltip': HxElement;
      'hx-top-nav': HxElement;
      'hx-tree-item': HxElement;
      'hx-tree-view': HxElement;
    }
  }
}

export {};
`,
  );

  // app/styles/globals.css
  await safeWriteFile(
    path.join(stylesDir, 'globals.css'),
    `@import '@helixui/tokens/tokens.css';

body {
  font-family: var(--hx-font-family, system-ui, sans-serif);
  margin: 0;
  padding: 0;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
`,
  );

  // app/root.tsx
  await safeWriteFile(
    path.join(appDir, 'root.tsx'),
    `import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { LinksFunction } from 'react-router';
import globalsStyles from './styles/globals.css?url';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: globalsStyles }];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
`,
  );

  // app/routes/_index.tsx — Production landing page
  await safeWriteFile(
    path.join(routesDir, '_index.tsx'),
    `import type { MetaFunction } from 'react-router';
import { useState } from 'react';
import { HxButton, HxCard, HxBadge } from '../components/helix/wrappers';
import { HelixProvider } from '../components/helix/provider';

export const meta: MetaFunction = () => [
  { title: 'HELiX + Remix — ${sanitizeForHtml(options.name)}' },
  { name: 'description', content: 'HELiX enterprise UI components with React Router v7' },
];

export default function Index() {
  const [count, setCount] = useState(0);

  return (
    <HelixProvider>
      <div className="container">
        <h1>
          HELiX + React Router <HxBadge variant="info">SSR Ready</HxBadge>
        </h1>
        <HxCard>
          <div slot="header">
            <h2>Counter Demo</h2>
          </div>
          <p>Count: {count}</p>
          <HxButton variant="primary" onHxClick={() => setCount((c) => c + 1)}>
            Increment
          </HxButton>
          <HxButton variant="secondary" onHxClick={() => setCount(0)}>
            Reset
          </HxButton>
        </HxCard>

        <HxCard>
          <div slot="header">
            <h2>React Router v7 + HELiX</h2>
            <HxBadge variant="success">v0.4.0</HxBadge>
          </div>
          <p>
            React Router v7 brings full-stack React with SSR, nested routes, and progressive
            enhancement. HELiX web components integrate natively via @lit/react wrappers for
            type-safe property and event binding.
          </p>
        </HxCard>
      </div>
    </HelixProvider>
  );
}
`,
  );

  await writeReactErrorBoundary(options);
}

async function scaffoldVueVite(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  await safeEnsureDir(srcDir);

  // vite.config.ts
  await safeWriteFile(
    path.join(options.directory, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Treat all hx-* tags as custom elements
          isCustomElement: (tag) => tag.startsWith('hx-'),
        },
      },
    }),
  ],
});
`,
  );

  // index.html
  await safeWriteFile(
    path.join(options.directory, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSP_META}
    <title>${sanitizeForHtml(options.name)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
  );

  // main.ts
  await safeWriteFile(
    path.join(srcDir, 'main.ts'),
    `import { createApp } from 'vue';
import App from './App.vue';
import '@helixui/library';
${options.designTokens ? "import './helix-setup';" : ''}
import './style.css';

const app = createApp(App);
app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('hx-');
app.mount('#app');
`,
  );

  // App.vue
  await safeWriteFile(
    path.join(srcDir, 'App.vue'),
    `<script setup lang="ts">
import { ref } from 'vue';

const name = ref('');
const submitted = ref(false);

function handleSubmit() {
  submitted.value = true;
  setTimeout(() => { submitted.value = false; }, 3000);
}
</script>

<template>
  <div class="container">
    <h1>HELiX + Vue</h1>

    <hx-card>
      <div slot="header"><h2>Interactive Demo</h2></div>

      <hx-text-input
        label="Your name"
        placeholder="Enter your name"
        :value="name"
        @hx-input="name = $event.detail?.value ?? ''"
      />

      <hx-button
        variant="primary"
        style="margin-top: 1rem"
        @hx-click="handleSubmit"
      >
        Say Hello
      </hx-button>

      <hx-alert
        v-if="submitted"
        variant="success"
        open
        style="margin-top: 1rem"
      >
        Hello, {{ name || 'World' }}!
      </hx-alert>
    </hx-card>

    <hx-card style="margin-top: 1.5rem">
      <div slot="header">
        <h2>Vue + Web Components</h2>
        <hx-badge variant="info">Native Support</hx-badge>
      </div>
      <p>Vue has first-class custom element support. Properties bind with
      <code>:prop</code>, events with <code>@hx-event</code>.</p>
      <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
        <hx-button variant="primary" size="sm">Primary</hx-button>
        <hx-button variant="secondary" size="sm">Secondary</hx-button>
        <hx-button variant="danger" size="sm">Danger</hx-button>
      </div>
    </hx-card>
  </div>
</template>

<style>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
</style>
`,
  );

  // style.css
  await safeWriteFile(
    path.join(srcDir, 'style.css'),
    `@import '@helixui/tokens/tokens.css';

body {
  font-family: var(--hx-font-family, system-ui, sans-serif);
  margin: 0;
  color: var(--hx-color-text, #1a1a1a);
}
`,
  );

  await writeVueErrorBoundary(options);
}

async function scaffoldVanilla(options: ProjectOptions): Promise<void> {
  await safeWriteFile(
    path.join(options.directory, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${CSP_META}
  <title>${sanitizeForHtml(options.name)}</title>

  <!-- HELiX via CDN — zero build step -->
  <script type="module" src="https://cdn.jsdelivr.net/npm/@helixui/library@latest/dist/index.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@helixui/tokens@latest/dist/tokens.css">

  <style>
    body {
      font-family: var(--hx-font-family, system-ui, sans-serif);
      margin: 0;
      padding: 2rem;
      color: var(--hx-color-text, #1a1a1a);
    }
    .container { max-width: 800px; margin: 0 auto; }
    .card-grid {
      display: grid;
      gap: 1.5rem;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>HELiX — No Framework Required</h1>
    <p>Web components work in plain HTML. No build step. No bundler. Just components.</p>

    <div class="card-grid">
      <hx-card>
        <div slot="header"><h3>Interactive Form</h3></div>
        <hx-text-input id="nameInput" label="Your name" placeholder="Type here..."></hx-text-input>
        <hx-button variant="primary" style="margin-top: 1rem" id="greetBtn">
          Say Hello
        </hx-button>
        <div id="output" style="margin-top: 1rem;"></div>
      </hx-card>

      <hx-card>
        <div slot="header"><h3>Button Variants</h3></div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <hx-button variant="primary" size="sm">Primary</hx-button>
          <hx-button variant="secondary" size="sm">Secondary</hx-button>
          <hx-button variant="danger" size="sm">Danger</hx-button>
          <hx-button variant="ghost" size="sm">Ghost</hx-button>
        </div>
      </hx-card>

      <hx-card>
        <div slot="header">
          <h3>For CMS Teams</h3>
          <hx-badge variant="info">Drupal / WordPress</hx-badge>
        </div>
        <p>Drop HELiX components into any CMS template. Works with Twig, Blade, PHP — anywhere HTML works.</p>
      </hx-card>
    </div>
  </div>

  <script>
    document.getElementById('greetBtn').addEventListener('hx-click', () => {
      // SECURITY: Use DOM methods instead of innerHTML to prevent XSS.
      // Never interpolate unsanitized user input into innerHTML — an attacker
      // could inject arbitrary HTML/script tags via the text input.
      const nameInput = document.getElementById('nameInput').value || 'World';
      const output = document.getElementById('output');
      output.innerHTML = '';
      const alertEl = document.createElement('hx-alert');
      alertEl.setAttribute('variant', 'success');
      alertEl.setAttribute('open', '');
      alertEl.textContent = 'Hello, ' + nameInput + '!';
      output.appendChild(alertEl);
    });
  </script>
</body>
</html>
`,
  );
}

async function scaffoldAstro(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  const pagesDir = path.join(srcDir, 'pages');
  const layoutsDir = path.join(srcDir, 'layouts');
  const stylesDir = path.join(srcDir, 'styles');

  await safeEnsureDir(pagesDir);
  await safeEnsureDir(layoutsDir);
  await safeEnsureDir(stylesDir);

  // Copy brand assets into public/og/
  const assetsSource = path.join(new URL('.', import.meta.url).pathname, '..', 'assets', 'og');
  const publicOgDir = path.join(options.directory, 'public', 'og');
  if (await fs.pathExists(assetsSource)) {
    await safeCopyDir(assetsSource, publicOgDir);
  }

  // astro.config.mjs
  await safeWriteFile(
    path.join(options.directory, 'astro.config.mjs'),
    `import { defineConfig } from 'astro/config';

/**
 * Astro configuration for HELiX web components.
 *
 * HELiX custom elements are native browser APIs — no Astro integration
 * required. They work perfectly with Astro's zero-JS-by-default model.
 */
export default defineConfig({
  // output: 'static' is the default — full SSG, perfect for HELiX
  // Switch to 'server' or 'hybrid' for SSR routes
});
`,
  );

  // src/helix.d.ts — TypeScript ambient declarations for hx-* custom elements
  await safeWriteFile(
    path.join(srcDir, 'helix.d.ts'),
    `/**
 * Ambient TypeScript declarations for HELiX web components.
 *
 * Extends Astro's JSX IntrinsicElements so hx-* tags are type-safe
 * in .astro files and any TypeScript code in this project.
 */

type HxAttrs = Record<string, unknown>;

declare namespace astroHTML.JSX {
  interface IntrinsicElements {
    'hx-accordion': HxAttrs;
    'hx-accordion-item': HxAttrs;
    'hx-alert': HxAttrs;
    'hx-avatar': HxAttrs;
    'hx-badge': HxAttrs;
    'hx-banner': HxAttrs;
    'hx-breadcrumb': HxAttrs;
    'hx-button': HxAttrs;
    'hx-button-group': HxAttrs;
    'hx-card': HxAttrs;
    'hx-carousel': HxAttrs;
    'hx-checkbox': HxAttrs;
    'hx-checkbox-group': HxAttrs;
    'hx-code-snippet': HxAttrs;
    'hx-color-picker': HxAttrs;
    'hx-combobox': HxAttrs;
    'hx-counter': HxAttrs;
    'hx-data-table': HxAttrs;
    'hx-date-picker': HxAttrs;
    'hx-dialog': HxAttrs;
    'hx-divider': HxAttrs;
    'hx-drawer': HxAttrs;
    'hx-dropdown': HxAttrs;
    'hx-field': HxAttrs;
    'hx-field-label': HxAttrs;
    'hx-file-upload': HxAttrs;
    'hx-grid': HxAttrs;
    'hx-hero': HxAttrs;
    'hx-icon': HxAttrs;
    'hx-icon-button': HxAttrs;
    'hx-menu': HxAttrs;
    'hx-menu-item': HxAttrs;
    'hx-meter': HxAttrs;
    'hx-nav': HxAttrs;
    'hx-pagination': HxAttrs;
    'hx-popover': HxAttrs;
    'hx-progress-bar': HxAttrs;
    'hx-progress-ring': HxAttrs;
    'hx-radio-group': HxAttrs;
    'hx-rating': HxAttrs;
    'hx-select': HxAttrs;
    'hx-skeleton': HxAttrs;
    'hx-slider': HxAttrs;
    'hx-spinner': HxAttrs;
    'hx-split-button': HxAttrs;
    'hx-split-panel': HxAttrs;
    'hx-stat': HxAttrs;
    'hx-status-indicator': HxAttrs;
    'hx-switch': HxAttrs;
    'hx-tab': HxAttrs;
    'hx-tab-panel': HxAttrs;
    'hx-tabs': HxAttrs;
    'hx-tag': HxAttrs;
    'hx-text': HxAttrs;
    'hx-text-input': HxAttrs;
    'hx-textarea': HxAttrs;
    'hx-theme': HxAttrs;
    'hx-toast': HxAttrs;
    'hx-tooltip': HxAttrs;
    'hx-top-nav': HxAttrs;
    'hx-tree-item': HxAttrs;
    'hx-tree-view': HxAttrs;
  }
}

export {};
`,
  );

  // src/styles/global.css
  await safeWriteFile(
    path.join(stylesDir, 'global.css'),
    `${options.designTokens ? "@import '../../helix-tokens.css';\n\n" : ''}*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  color-scheme: light dark;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --hx-page-bg: #0a0a0f;
  --hx-page-text: #e4e4e7;
  --hx-page-text-secondary: #a1a1aa;
  --hx-page-surface: #18181b;
  --hx-page-surface-raised: #27272a;
  --hx-page-border: #3f3f46;
  --hx-page-code-bg: #27272a;
}

html[data-theme="light"],
html:not([data-theme]) {
  --hx-page-bg: #fafafa;
  --hx-page-text: #18181b;
  --hx-page-text-secondary: #71717a;
  --hx-page-surface: #ffffff;
  --hx-page-surface-raised: #f4f4f5;
  --hx-page-border: #e4e4e7;
  --hx-page-code-bg: #f4f4f5;
}

body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: var(--hx-page-text);
  background: var(--hx-page-bg);
  -webkit-font-smoothing: antialiased;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

a {
  color: var(--hx-color-primary-500, #3b82f6);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

h1,
h2,
h3,
h4 {
  color: var(--hx-page-text);
  letter-spacing: -0.025em;
}

code {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: 0.85em;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--hx-page-code-bg);
  color: var(--hx-page-text);
}

pre {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  background: var(--hx-page-code-bg) !important;
  color: var(--hx-page-text);
  border: 1px solid var(--hx-page-border);
}

.hero {
  padding: 5rem 2rem;
  text-align: center;
  background: var(--hx-page-surface);
  border-bottom: 1px solid var(--hx-page-border);
}

.hero h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 800;
  margin-bottom: 1rem;
  line-height: 1.1;
}

.hero p {
  font-size: 1.125rem;
  color: var(--hx-page-text-secondary);
  max-width: 600px;
  margin: 0 auto 2rem;
}

.section {
  padding: 4rem 0;
}

.section-header {
  margin-bottom: 2rem;
}

.section-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.section-header p {
  color: var(--hx-page-text-secondary);
}

.grid-auto {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.grid-3 {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.text-secondary {
  color: var(--hx-page-text-secondary);
}

hx-top-nav {
  --hx-top-nav-bg: var(--hx-page-surface);
  --hx-top-nav-color: var(--hx-page-text);
  --hx-top-nav-border-color: var(--hx-page-border);
  border-radius: 0;
  position: sticky;
  top: 0;
  z-index: 1000;
}

hx-top-nav::part(header) {
  border-radius: 0;
}

hx-card {
  --hx-card-bg: var(--hx-page-surface);
  --hx-card-color: var(--hx-page-text);
  --hx-card-border-color: var(--hx-page-border);
}

hx-card::part(header) {
  background: var(--hx-page-surface-raised);
  border-bottom: 1px solid var(--hx-page-border);
  padding: 0.875rem 1.25rem;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
}

.promo-grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.promo-card {
  position: relative;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid var(--hx-page-border);
  background: var(--hx-page-surface);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
}

.promo-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  text-decoration: none;
}

.promo-card-image {
  width: 100%;
  aspect-ratio: 1200 / 630;
  object-fit: cover;
  display: block;
  border-bottom: 1px solid var(--hx-page-border);
}

.promo-card-body {
  padding: 1.25rem 1.5rem 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.promo-card-body h3 {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--hx-page-text);
}

.promo-card-body p {
  font-size: 0.9rem;
  color: var(--hx-page-text-secondary);
  line-height: 1.5;
  flex: 1;
}

.promo-card-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--hx-color-primary-500, #3b82f6);
}

.site-footer {
  background: var(--hx-page-surface);
  border-top: 1px solid var(--hx-page-border);
  padding: 3rem 0 2rem;
}

.footer-grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: 1.5fr repeat(3, 1fr);
}

@media (max-width: 768px) {
  .footer-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .footer-grid {
    grid-template-columns: 1fr;
  }
}

.footer-heading {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hx-page-text);
  margin-bottom: 0.75rem;
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.footer-links li {
  margin-bottom: 0.5rem;
}

.footer-links a {
  color: var(--hx-page-text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
  transition: color 0.15s ease;
}

.footer-links a:hover {
  color: var(--hx-page-text);
}

.footer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.footer-bottom p {
  margin: 0;
}
`,
  );

  // src/layouts/Layout.astro — base layout
  await safeWriteFile(
    path.join(layoutsDir, 'Layout.astro'),
    `---
/**
 * Base layout for all pages.
 *
 * Loads @helixui/library once via <script> in <head>.
 * Custom elements render as inert HTML during SSG and upgrade client-side.
 */
interface Props {
  title?: string;
  description?: string;
}

const {
  title = '${sanitizeForHtml(options.name)} — Built with HELiX',
  description = 'Enterprise web components for Astro. Zero JS by default, perfect island architecture.',
} = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSP_META}
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content="/og/helixui.png" />
    <title>{title}</title>
    <script>
      import '@helixui/library';
    </script>
    <link rel="stylesheet" href="/styles/global.css" />
  </head>
  <body>
    <hx-theme theme="auto">
      <hx-top-nav sticky label="Main navigation">
        <div slot="logo">
          <a href="/" style="display:flex;align-items:center;gap:0.75rem;text-decoration:none;color:inherit;">
            <img src="/og/bs-hx-square.png" alt="HELiX" style="height:30px;width:30px;border-radius:5px;" />
            <span style="font-weight:700;font-size:1.125rem;letter-spacing:-0.025em;">HELiX</span>
            <span style="opacity:0.25;font-size:1.25rem;font-weight:200;">+</span>
            <span style="font-weight:600;font-size:0.95rem;opacity:0.9;">Astro</span>
          </a>
        </div>
        <div style="display:flex;gap:1.5rem;align-items:center;margin-left:2rem;">
          <a href="/" style="color:inherit;text-decoration:none;font-size:0.875rem;opacity:0.8;">Home</a>
          <a href="/components" style="color:inherit;text-decoration:none;font-size:0.875rem;opacity:0.8;">Components</a>
          <a href="/docs" style="color:inherit;text-decoration:none;font-size:0.875rem;opacity:0.8;">Docs</a>
        </div>
        <div slot="actions" style="display:flex;align-items:center;gap:0.75rem;">
          <a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer"
            style="color:inherit;display:flex;align-items:center;opacity:0.7;" title="GitHub">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          <a href="https://bookedsolid.tech" target="_blank" rel="noopener noreferrer"
            style="display:flex;align-items:center;" title="Booked Solid Technology">
            <img src="/og/bs-bs-software-square.png" alt="Booked Solid" style="height:28px;width:28px;border-radius:4px;" />
          </a>
        </div>
      </hx-top-nav>

      <slot />

      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
                <img src="/og/bs-hx-square.png" alt="HELiX" style="height:32px;width:32px;border-radius:4px;" />
                <span style="font-weight:700;font-size:1.125rem;">HELiX</span>
              </div>
              <p class="text-secondary" style="font-size:0.85rem;line-height:1.6;max-width:280px;">
                Enterprise web components built on Lit 3. Accessible, themeable, framework-agnostic.
              </p>
            </div>
            <div>
              <h4 class="footer-heading">Product</h4>
              <ul class="footer-links">
                <li><a href="/components">Components</a></li>
                <li><a href="/docs">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h4 class="footer-heading">Ecosystem</h4>
              <ul class="footer-links">
                <li><a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX UI</a></li>
                <li><a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer">HELiXiR</a></li>
                <li><a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer">GitHub</a></li>
              </ul>
            </div>
            <div>
              <h4 class="footer-heading">Legal</h4>
              <ul class="footer-links">
                <li><a href="https://bookedsolid.tech/privacy" target="_blank" rel="noopener noreferrer">Privacy</a></li>
                <li><a href="https://bookedsolid.tech/terms" target="_blank" rel="noopener noreferrer">Terms</a></li>
                <li><a href="https://bookedsolid.tech/about" target="_blank" rel="noopener noreferrer">About</a></li>
              </ul>
            </div>
          </div>
          <hx-divider style="margin:2rem 0 1.5rem;"></hx-divider>
          <div class="footer-bottom">
            <p class="text-secondary" style="font-size:0.8rem;">
              &copy; 2026 Booked Solid Technology, a d/b/a of Clarity House LLC. All rights reserved.
              Built with <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX</a>
              and <a href="https://astro.build" target="_blank" rel="noopener noreferrer">Astro</a>.
            </p>
            <div style="display:flex;gap:1rem;align-items:center;">
              <a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer"
                class="text-secondary" style="display:flex;" title="GitHub">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
              <a href="https://bookedsolid.tech" target="_blank" rel="noopener noreferrer"
                style="display:flex;align-items:center;" title="Booked Solid Technology">
                <img src="/og/bs-bs-software-square.png" alt="BS" style="height:20px;width:20px;border-radius:3px;opacity:0.7;" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </hx-theme>
  </body>
</html>
`,
  );

  // src/pages/index.astro — production landing page
  await safeWriteFile(
    path.join(pagesDir, 'index.astro'),
    `---
/**
 * HELiX + Astro landing page.
 *
 * hx-* custom elements work WITHOUT any Astro directive.
 * They are native browser APIs — Astro outputs them as plain HTML,
 * the browser parses them, and @helixui/library upgrades them on load.
 */
import Layout from '../layouts/Layout.astro';
---

<Layout title="${sanitizeForHtml(options.name)} — HELiX + Astro">
  <section class="hero">
    <div class="container">
      <h1>HELiX + Astro</h1>
      <p>
        Zero JS by default. Enterprise web components that work as native browser elements —
        no framework runtime, no hydration overhead, no islands required.
      </p>
      <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
        <hx-button variant="primary" size="lg">
          <a href="/components" style="color:inherit;text-decoration:none;">Explore Components</a>
        </hx-button>
        <hx-button variant="secondary" size="lg">
          <a href="/docs" style="color:inherit;text-decoration:none;">Read the Docs</a>
        </hx-button>
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:center;margin-top:1.5rem;flex-wrap:wrap;">
        <hx-tag>Lit 3</hx-tag>
        <hx-tag>Shadow DOM</hx-tag>
        <hx-tag>WCAG 2.1 AA</hx-tag>
        <hx-tag>Zero-JS SSG</hx-tag>
        <hx-tag>Astro 5</hx-tag>
        <hx-tag>Island Architecture</hx-tag>
      </div>
    </div>
  </section>

  <section class="container section">
    <div class="section-header">
      <h2>Why Astro + HELiX</h2>
      <p>The most natural pairing in modern web development.</p>
    </div>
    <div class="grid-3">
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Zero JS by Default</h3>
          <hx-badge variant="success">Astro</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">
          Astro ships zero JavaScript to the client by default. HELiX custom elements are native
          browser APIs — they do not need a framework runtime to render.
        </p>
        <p style="font-size:0.875rem;">
          Result: a full enterprise UI with <strong>near-zero JS overhead</strong> for static content.
        </p>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">No Directives Needed</h3>
          <hx-badge variant="info">HELiX</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">
          Unlike React or Vue components, <code>hx-*</code> custom elements do not need
          <code>client:load</code> or <code>client:visible</code>. They are browser-native.
        </p>
        <p style="font-size:0.875rem;">
          Load <code>@helixui/library</code> once in your layout — all elements upgrade automatically.
        </p>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Perfect Island Fit</h3>
          <hx-badge variant="warning">Architecture</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">
          When you need islands, use Astro's <code>client:*</code> directives for framework
          components and let HELiX handle UI primitives natively.
        </p>
        <p style="font-size:0.875rem;">Astro islands for logic. HELiX for accessible, themeable UI.</p>
      </hx-card>
    </div>
  </section>

  <section class="container section" style="border-top:1px solid var(--hx-page-border);">
    <div class="section-header">
      <h2>Component Showcase</h2>
      <p>All rendered as native custom elements — no framework, no hydration cost.</p>
    </div>
    <div class="grid-auto">
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Button Variants</h3>
          <hx-badge variant="success">Actions</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">
          All variants respond to the active theme via CSS custom properties.
        </p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <hx-button variant="primary" size="sm">Primary</hx-button>
          <hx-button variant="secondary" size="sm">Secondary</hx-button>
          <hx-button variant="danger" size="sm">Danger</hx-button>
          <hx-button variant="ghost" size="sm">Ghost</hx-button>
        </div>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Status Badges</h3>
          <hx-badge variant="info">Display</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">
          Semantic status indicators with accessible color variants.
        </p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
          <hx-badge variant="info">Info</hx-badge>
          <hx-badge variant="success">Success</hx-badge>
          <hx-badge variant="warning">Warning</hx-badge>
          <hx-badge variant="danger">Danger</hx-badge>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <hx-tag>Astro 5</hx-tag>
          <hx-tag>Lit 3</hx-tag>
          <hx-tag>WCAG 2.1</hx-tag>
        </div>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Avatars</h3>
          <hx-badge variant="danger">Identity</hx-badge>
        </div>
        <div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem;">
          <hx-avatar size="sm">AB</hx-avatar>
          <hx-avatar size="md">CD</hx-avatar>
          <hx-avatar size="lg">EF</hx-avatar>
          <hx-divider vertical style="height:2rem;"></hx-divider>
          <hx-avatar size="sm" style="--hx-avatar-bg:#3b82f6;">HX</hx-avatar>
        </div>
        <p class="text-secondary" style="font-size:0.875rem;">User identity with CSS custom property theming.</p>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Data Display</h3>
          <hx-badge variant="warning">Metrics</hx-badge>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>Build Status</span>
            <hx-badge variant="success">Passing</hx-badge>
          </div>
          <hx-progress-bar value="92" max="100"></hx-progress-bar>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>Coverage</span>
            <hx-badge variant="info">87%</hx-badge>
          </div>
          <hx-progress-bar value="87" max="100"></hx-progress-bar>
        </div>
      </hx-card>
    </div>
  </section>

  <section class="container section" style="border-top:1px solid var(--hx-page-border);">
    <div class="section-header">
      <h2>How It Works in Astro</h2>
      <p>Three patterns for using HELiX in your Astro project.</p>
    </div>
    <div class="grid-3">
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Static Pages</h3>
          <hx-badge variant="success">SSG</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">
          Use <code>hx-*</code> elements directly in <code>.astro</code> files.
          Renders as HTML at build time, upgrades on load.
        </p>
        <pre style="padding:0.75rem;border-radius:0.5rem;font-size:0.8rem;overflow:auto;">&lt;hx-card&gt;
  &lt;div slot="header"&gt;Title&lt;/div&gt;
  &lt;p&gt;Zero JS static content&lt;/p&gt;
&lt;/hx-card&gt;</pre>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Tokens &amp; Theming</h3>
          <hx-badge variant="info">CSS</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">
          Override design tokens in <code>helix-tokens.css</code>. Cascades through all Shadow DOM
          components automatically.
        </p>
        <pre style="padding:0.75rem;border-radius:0.5rem;font-size:0.8rem;overflow:auto;">/* helix-tokens.css */
:root &#123;
  --hx-color-primary: #0066cc;
  --hx-font-family: 'Inter';
&#125;</pre>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Island Interactivity</h3>
          <hx-badge variant="warning">Islands</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">
          For complex state, wrap hx-* in a framework component and use <code>client:load</code>.
        </p>
        <pre style="padding:0.75rem;border-radius:0.5rem;font-size:0.8rem;overflow:auto;">&lt;!-- .astro file --&gt;
&lt;MyForm client:load /&gt;
&lt;!-- Inside MyForm.tsx --&gt;
&lt;hx-text-input ... /&gt;</pre>
      </hx-card>
    </div>
  </section>

  <section class="container section" style="border-top:1px solid var(--hx-page-border);">
    <div class="section-header">
      <h2>The Booked Solid Ecosystem</h2>
      <p>Enterprise-grade tools for modern web development and AI-powered workflows.</p>
    </div>
    <div class="promo-grid">
      <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer" class="promo-card">
        <img src="/og/helixui.png" alt="HELiX UI — 80+ enterprise web components." class="promo-card-image" />
        <div class="promo-card-body">
          <h3>HELiX UI</h3>
          <p>80+ enterprise web components built on Lit 3. Shadow DOM encapsulation, healthcare-first accessibility, and W3C DTCG design tokens.</p>
          <span class="promo-card-cta">Explore HELiX UI &rarr;</span>
        </div>
      </a>
      <a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer" class="promo-card">
        <img src="/og/helixir.png" alt="HELiXiR — MCP server for web components." class="promo-card-image" />
        <div class="promo-card-body">
          <h3>HELiXiR</h3>
          <p>MCP server for any CEM-compliant web component library. Connect to Claude, Cursor, or any MCP client.</p>
          <span class="promo-card-cta">Explore HELiXiR &rarr;</span>
        </div>
      </a>
      <a href="https://bookedsolid.tech/discord-ops" target="_blank" rel="noopener noreferrer" class="promo-card">
        <img src="/og/discord-ops.png" alt="Discord-Ops — Agency-grade Discord for AI agents." class="promo-card-image" />
        <div class="promo-card-body">
          <h3>Discord-Ops</h3>
          <p>Agency-grade Discord MCP server for AI agents. 45 tools, 23 message templates, multi-guild routing.</p>
          <span class="promo-card-cta">Explore Discord-Ops &rarr;</span>
        </div>
      </a>
    </div>
  </section>

  <section class="container section" style="border-top:1px solid var(--hx-page-border);padding-bottom:5rem;">
    <div class="section-header">
      <h2>Getting Started</h2>
      <p>Your project is ready. Here are the key files and next steps.</p>
    </div>
    <div class="grid-3">
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Key Files</h3>
          <hx-badge variant="info">Reference</hx-badge>
        </div>
        <ul style="line-height:2;padding-left:1.5rem;">
          <li><code>src/layouts/Layout.astro</code> — Base layout, loads HELiX</li>
          <li><code>src/helix.d.ts</code> — TypeScript declarations for hx-* elements</li>
          <li><code>src/styles/global.css</code> — Page styles + token imports</li>
          <li><code>helix-tokens.css</code> — Design token overrides</li>
          <li><code>src/helix-setup.ts</code> — Component bundle configuration</li>
          <li><code>public/og/</code> — Brand assets</li>
        </ul>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Commands</h3>
          <hx-badge variant="success">CLI</hx-badge>
        </div>
        <ul style="line-height:2;padding-left:1.5rem;">
          <li><code>npm run dev</code> — Start dev server</li>
          <li><code>npm run build</code> — Production build</li>
          <li><code>npm run preview</code> — Preview build output</li>
        </ul>
        <hx-divider style="margin:1rem 0;"></hx-divider>
        <p style="font-size:0.875rem;" class="text-secondary">
          Add HELiX components via <code>src/helix-setup.ts</code>.
        </p>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Next Steps</h3>
          <hx-badge variant="warning">Action</hx-badge>
        </div>
        <ul style="line-height:2;padding-left:1.5rem;">
          <li>Customize your theme in <code>helix-tokens.css</code></li>
          <li>Add pages in <code>src/pages/</code></li>
          <li>Explore the <a href="/components">component catalog</a></li>
          <li>Add <a href="https://docs.astro.build/en/guides/integrations-guide/" target="_blank" rel="noopener noreferrer">Astro integrations</a></li>
        </ul>
      </hx-card>
    </div>
  </section>
</Layout>
`,
  );

  // src/pages/components.astro
  await safeWriteFile(
    path.join(pagesDir, 'components.astro'),
    `---
import Layout from '../layouts/Layout.astro';
---

<Layout title="Components — ${sanitizeForHtml(options.name)}" description="HELiX component catalog for Astro.">
  <section class="hero" style="padding:3rem 2rem;">
    <div class="container">
      <h1>Component Library</h1>
      <p>Browse the HELiX component catalog. All components are native custom elements.</p>
    </div>
  </section>

  <section class="container section">
    <div class="section-header">
      <h2>Core UI</h2>
      <p>Essential building blocks for any interface.</p>
    </div>
    <div style="display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));">
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Button</h3>
          <hx-badge variant="success">Stable</hx-badge>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
          <hx-button variant="primary" size="sm">Primary</hx-button>
          <hx-button variant="secondary" size="sm">Secondary</hx-button>
          <hx-button variant="ghost" size="sm">Ghost</hx-button>
        </div>
        <p class="text-secondary" style="font-size:0.85rem;">
          Multi-variant button with loading states, icons, and full keyboard support.
        </p>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Badge</h3>
          <hx-badge variant="success">Stable</hx-badge>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
          <hx-badge variant="info">Info</hx-badge>
          <hx-badge variant="success">Success</hx-badge>
          <hx-badge variant="warning">Warning</hx-badge>
          <hx-badge variant="danger">Error</hx-badge>
        </div>
        <p class="text-secondary" style="font-size:0.85rem;">Status indicators with semantic color variants.</p>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Card</h3>
          <hx-badge variant="success">Stable</hx-badge>
        </div>
        <p class="text-secondary" style="font-size:0.85rem;">
          Content container with optional header, footer, and media slots.
        </p>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Avatar</h3>
          <hx-badge variant="success">Stable</hx-badge>
        </div>
        <div style="display:flex;gap:0.75rem;align-items:center;margin-bottom:1rem;">
          <hx-avatar size="sm">AB</hx-avatar>
          <hx-avatar size="md">CD</hx-avatar>
          <hx-avatar size="lg">EF</hx-avatar>
        </div>
        <p class="text-secondary" style="font-size:0.85rem;">User identity with initials, image, or icon support.</p>
      </hx-card>
    </div>
  </section>

  <section class="container section" style="border-top:1px solid var(--hx-page-border);padding-bottom:4rem;">
    <div class="section-header">
      <h2>Alerts &amp; Feedback</h2>
      <p>Components for communicating status and feedback to users.</p>
    </div>
    <div class="grid-3">
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Alerts</h3>
          <hx-badge variant="danger">Feedback</hx-badge>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
          <hx-alert variant="info" open>Informational message</hx-alert>
          <hx-alert variant="success" open>Operation successful</hx-alert>
          <hx-alert variant="warning" open>Caution advised</hx-alert>
        </div>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Progress</h3>
          <hx-badge variant="warning">Metrics</hx-badge>
        </div>
        <div style="display:flex;flex-direction:column;gap:1rem;">
          <div>
            <span class="text-secondary" style="font-size:0.85rem;">Upload</span>
            <hx-progress-bar value="72" max="100"></hx-progress-bar>
          </div>
          <div>
            <span class="text-secondary" style="font-size:0.85rem;">Build</span>
            <hx-progress-bar value="100" max="100"></hx-progress-bar>
          </div>
        </div>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Tags</h3>
          <hx-badge variant="success">Display</hx-badge>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
          <hx-tag>TypeScript</hx-tag>
          <hx-tag>Astro 5</hx-tag>
          <hx-tag>Lit 3</hx-tag>
          <hx-tag>Shadow DOM</hx-tag>
          <hx-tag>WCAG 2.1</hx-tag>
        </div>
        <p class="text-secondary" style="font-size:0.85rem;">Lightweight metadata labels for categorization.</p>
      </hx-card>
    </div>
  </section>
</Layout>
`,
  );

  // src/pages/docs.astro
  await safeWriteFile(
    path.join(pagesDir, 'docs.astro'),
    `---
import Layout from '../layouts/Layout.astro';
---

<Layout title="Docs — ${sanitizeForHtml(options.name)}" description="Getting started with HELiX in Astro.">
  <section class="hero" style="padding:3rem 2rem;">
    <div class="container">
      <h1>Documentation</h1>
      <p>Everything you need to build with HELiX components in your Astro application.</p>
    </div>
  </section>

  <section class="container section">
    <div class="grid-auto">
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Quick Start</h3>
          <hx-badge variant="info">Guide</hx-badge>
        </div>
        <ol style="line-height:2;padding-left:1.5rem;">
          <li>HELiX is loaded in <code>src/layouts/Layout.astro</code> automatically</li>
          <li>Use <code>hx-*</code> elements anywhere in <code>.astro</code> files</li>
          <li>Customize design tokens in <code>helix-tokens.css</code></li>
          <li>Override Shadow DOM with <code>::part()</code> selectors</li>
        </ol>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Architecture</h3>
          <hx-badge variant="warning">Concepts</hx-badge>
        </div>
        <ul style="line-height:2;padding-left:1.5rem;">
          <li><strong>Web Components</strong> — Standards-based, framework-agnostic</li>
          <li><strong>Shadow DOM</strong> — Style encapsulation, no CSS leaks</li>
          <li><strong>Lit 3</strong> — Reactive properties, declarative templates</li>
          <li><strong>hx-theme</strong> — Token injection via adopted stylesheets</li>
          <li><strong>Astro SSG</strong> — Pre-rendered HTML, no hydration for hx-* elements</li>
        </ul>
      </hx-card>
    </div>
  </section>

  <section class="container section" style="border-top:1px solid var(--hx-page-border);padding-bottom:4rem;">
    <div class="section-header">
      <h2>Resources</h2>
    </div>
    <div class="grid-3">
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">HELiX UI Docs</h3>
          <hx-badge variant="info">External</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">Full component API documentation including properties, events, slots, and CSS custom properties.</p>
        <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">View HELiX UI Docs &rarr;</a>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">Source Code</h3>
          <hx-badge variant="success">Open Source</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">HELiX is open source under the MIT license. Contributions welcome.</p>
        <a href="https://github.com/bookedsolidtech/helix" target="_blank" rel="noopener noreferrer">View on GitHub &rarr;</a>
      </hx-card>
      <hx-card>
        <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">HELiXiR MCP</h3>
          <hx-badge variant="warning">AI Tools</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom:1rem;">Query component metadata, tokens, and a11y scores from your AI coding assistant.</p>
        <a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer">Learn More &rarr;</a>
      </hx-card>
    </div>
  </section>
</Layout>
`,
  );
}
async function scaffoldSvelteKit(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  const routesDir = path.join(srcDir, 'routes');
  const libDir = path.join(srcDir, 'lib');
  await safeEnsureDir(routesDir);
  await safeEnsureDir(libDir);

  // svelte.config.js — includes vitePreprocess for TypeScript/CSS preprocessing
  await safeWriteFile(
    path.join(options.directory, 'svelte.config.js'),
    `import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
  },
};

export default config;
`,
  );

  // vite.config.ts
  await safeWriteFile(
    path.join(options.directory, 'vite.config.ts'),
    `import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
});
`,
  );

  // src/helix.d.ts — Svelte ambient declarations for hx-* custom elements
  await safeWriteFile(
    path.join(srcDir, 'helix.d.ts'),
    `/**
 * Svelte ambient type declarations for HELiX web components.
 *
 * Registers hx-* custom elements with Svelte's JSX/HTML type system
 * via svelteHTML.IntrinsicElements so TypeScript understands them in templates.
 */
declare namespace svelteHTML {
  interface IntrinsicElements {
    'hx-accordion': { [key: string]: unknown };
    'hx-accordion-item': { [key: string]: unknown };
    'hx-alert': { variant?: string; open?: boolean; [key: string]: unknown };
    'hx-avatar': { src?: string; alt?: string; size?: string; [key: string]: unknown };
    'hx-badge': { variant?: string; size?: string; [key: string]: unknown };
    'hx-banner': { variant?: string; [key: string]: unknown };
    'hx-breadcrumb': { [key: string]: unknown };
    'hx-button': { variant?: string; size?: string; disabled?: boolean; type?: string; [key: string]: unknown };
    'hx-button-group': { [key: string]: unknown };
    'hx-card': { elevation?: string; [key: string]: unknown };
    'hx-carousel': { [key: string]: unknown };
    'hx-checkbox': { checked?: boolean; disabled?: boolean; name?: string; value?: string; [key: string]: unknown };
    'hx-checkbox-group': { [key: string]: unknown };
    'hx-code-snippet': { language?: string; [key: string]: unknown };
    'hx-color-picker': { value?: string; [key: string]: unknown };
    'hx-combobox': { value?: string; placeholder?: string; [key: string]: unknown };
    'hx-counter': { value?: number; min?: number; max?: number; [key: string]: unknown };
    'hx-data-table': { [key: string]: unknown };
    'hx-date-picker': { value?: string; [key: string]: unknown };
    'hx-dialog': { open?: boolean; label?: string; [key: string]: unknown };
    'hx-divider': { orientation?: string; [key: string]: unknown };
    'hx-drawer': { open?: boolean; placement?: string; [key: string]: unknown };
    'hx-dropdown': { [key: string]: unknown };
    'hx-field': { [key: string]: unknown };
    'hx-field-label': { [key: string]: unknown };
    'hx-file-upload': { accept?: string; multiple?: boolean; [key: string]: unknown };
    'hx-grid': { columns?: string; gap?: string; [key: string]: unknown };
    'hx-icon': { name?: string; size?: string; [key: string]: unknown };
    'hx-icon-button': { name?: string; label?: string; size?: string; [key: string]: unknown };
    'hx-menu': { [key: string]: unknown };
    'hx-menu-item': { value?: string; disabled?: boolean; [key: string]: unknown };
    'hx-meter': { value?: number; min?: number; max?: number; [key: string]: unknown };
    'hx-nav': { [key: string]: unknown };
    'hx-pagination': { page?: number; total?: number; [key: string]: unknown };
    'hx-popover': { placement?: string; [key: string]: unknown };
    'hx-progress-bar': { value?: number; max?: number; [key: string]: unknown };
    'hx-progress-ring': { value?: number; max?: number; [key: string]: unknown };
    'hx-radio-group': { value?: string; name?: string; [key: string]: unknown };
    'hx-rating': { value?: number; max?: number; [key: string]: unknown };
    'hx-select': { value?: string; placeholder?: string; disabled?: boolean; [key: string]: unknown };
    'hx-skeleton': { width?: string; height?: string; [key: string]: unknown };
    'hx-slider': { value?: number; min?: number; max?: number; step?: number; [key: string]: unknown };
    'hx-spinner': { size?: string; [key: string]: unknown };
    'hx-split-button': { [key: string]: unknown };
    'hx-split-panel': { [key: string]: unknown };
    'hx-stat': { label?: string; value?: string; [key: string]: unknown };
    'hx-status-indicator': { status?: string; [key: string]: unknown };
    'hx-switch': { checked?: boolean; disabled?: boolean; name?: string; [key: string]: unknown };
    'hx-tab': { [key: string]: unknown };
    'hx-tab-panel': { [key: string]: unknown };
    'hx-tabs': { [key: string]: unknown };
    'hx-tag': { variant?: string; [key: string]: unknown };
    'hx-text': { [key: string]: unknown };
    'hx-text-input': { value?: string; label?: string; placeholder?: string; disabled?: boolean; type?: string; [key: string]: unknown };
    'hx-textarea': { value?: string; label?: string; placeholder?: string; rows?: number; [key: string]: unknown };
    'hx-theme': { theme?: string; [key: string]: unknown };
    'hx-toast': { variant?: string; open?: boolean; duration?: number; [key: string]: unknown };
    'hx-tooltip': { content?: string; placement?: string; [key: string]: unknown };
    'hx-top-nav': { sticky?: boolean; label?: string; [key: string]: unknown };
    'hx-tree-item': { expanded?: boolean; [key: string]: unknown };
    'hx-tree-view': { [key: string]: unknown };
  }
}
`,
  );

  // src/lib/helix-setup.ts — Client-only HELiX loader with singleton guard
  await safeWriteFile(
    path.join(libDir, 'helix-setup.ts'),
    `/**
 * HELiX Web Components — Client-side initializer.
 *
 * Uses a singleton guard to ensure the library is imported only once,
 * even if initHelix() is called multiple times (e.g. hot-reloads).
 *
 * Call from onMount() in +layout.svelte so it runs client-side only.
 */
let _initialized = false;

export async function initHelix(): Promise<void> {
  if (typeof window === 'undefined' || _initialized) return;
  _initialized = true;
  await import('@helixui/library');
}
`,
  );

  // src/app.css — Global styles with HELiX token imports and layout utilities
  await safeWriteFile(
    path.join(srcDir, 'app.css'),
    `@import '@helixui/tokens/tokens.css';
${options.designTokens ? "@import '../helix-tokens.css';" : ''}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--hx-font-family, system-ui, -apple-system, sans-serif);
  line-height: var(--hx-line-height-base, 1.5);
  color: var(--hx-color-text, #1a1a1a);
  background: var(--hx-color-surface, #ffffff);
  -webkit-font-smoothing: antialiased;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--hx-spacing-lg, 1.5rem);
}

.site-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--hx-color-surface, #fff);
  border-bottom: 1px solid var(--hx-color-border, #e5e7eb);
}

.site-footer {
  margin-top: auto;
  padding: var(--hx-spacing-xl, 2rem);
  background: var(--hx-color-surface-subtle, #f9fafb);
  border-top: 1px solid var(--hx-color-border, #e5e7eb);
  text-align: center;
  color: var(--hx-color-text-secondary, #6b7280);
  font-size: 0.875rem;
}

.hero {
  text-align: center;
  padding: var(--hx-spacing-xl, 2rem) 0 var(--hx-spacing-lg, 1.5rem);
}

.hero h1 {
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 700;
  color: var(--hx-color-text, #1a1a1a);
  margin-bottom: var(--hx-spacing-md, 1rem);
}

.hero p {
  font-size: 1.125rem;
  color: var(--hx-color-text-secondary, #6b7280);
  max-width: 600px;
  margin: 0 auto var(--hx-spacing-lg, 1.5rem);
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--hx-spacing-lg, 1.5rem);
  margin: var(--hx-spacing-xl, 2rem) 0;
}
`,
  );

  // src/routes/+layout.svelte — Full nav/footer layout calling initHelix via onMount
  await safeWriteFile(
    path.join(routesDir, '+layout.svelte'),
    `<script lang="ts">
  import { onMount } from 'svelte';
  import { initHelix } from '$lib/helix-setup.js';
  import '../app.css';

  onMount(() => {
    initHelix();
  });
</script>

<hx-theme theme="auto">
  <header class="site-nav">
    <hx-top-nav sticky label="Main navigation">
      <span slot="brand">${sanitizeForHtml(options.name)}</span>
      <nav slot="nav">
        <hx-button variant="ghost" size="sm">Docs</hx-button>
        <hx-button variant="ghost" size="sm">Components</hx-button>
        <hx-button variant="ghost" size="sm">GitHub</hx-button>
      </nav>
    </hx-top-nav>
  </header>

  <main>
    <slot />
  </main>

  <footer class="site-footer">
    <p>Built with <strong>HELiX</strong> web components &amp; <strong>SvelteKit</strong></p>
  </footer>
</hx-theme>
`,
  );

  // src/routes/+page.svelte — Production landing page using Svelte 5 runes
  await safeWriteFile(
    path.join(routesDir, '+page.svelte'),
    `<script lang="ts">
  /**
   * HELiX + SvelteKit — Production Landing Page
   *
   * Demonstrates Svelte 5 runes ($state, $derived) with HELiX web components.
   * Svelte has first-class custom element support — no wrappers needed.
   */
  let count = $state(0);
  let doubled = $derived(count * 2);
  let name = $state('');
  let submitted = $state(false);

  function handleSubmit() {
    submitted = true;
    setTimeout(() => {
      submitted = false;
    }, 3000);
  }
</script>

<svelte:head>
  <title>${sanitizeForHtml(options.name)}</title>
  <meta name="description" content="Built with HELiX web components and SvelteKit" />
</svelte:head>

<div class="container">
  <section class="hero">
    <hx-badge variant="info">Svelte 5 + HELiX</hx-badge>
    <h1>Welcome to ${sanitizeForHtml(options.name)}</h1>
    <p>
      Enterprise web components running natively in SvelteKit.
      Svelte treats custom elements as first-class citizens — no wrappers, no adapters.
    </p>
    <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
      <hx-button variant="primary" size="lg">Get Started</hx-button>
      <hx-button variant="secondary" size="lg">View Components</hx-button>
    </div>
  </section>

  <hx-divider></hx-divider>

  <section class="feature-grid" style="margin-top: 2rem;">
    <hx-card>
      <div slot="header">
        <h3>Svelte 5 Runes</h3>
        <hx-badge variant="success">$state</hx-badge>
      </div>
      <p style="color: var(--hx-color-text-secondary, #666); margin-bottom: 1rem;">
        Fine-grained reactivity with no boilerplate. Count: <strong>{count}</strong>, Doubled: <strong>{doubled}</strong>
      </p>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <hx-button variant="secondary" size="sm" onclick={() => count--}>−</hx-button>
        <hx-button variant="primary" size="sm" onclick={() => count++}>+</hx-button>
        <hx-button variant="ghost" size="sm" onclick={() => (count = 0)}>Reset</hx-button>
      </div>
    </hx-card>

    <hx-card>
      <div slot="header">
        <h3>Interactive Demo</h3>
        <hx-badge variant="info">Custom Events</hx-badge>
      </div>
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <hx-text-input
          label="Your name"
          placeholder="Enter your name"
          value={name}
          oninput={(e: CustomEvent) => (name = (e as CustomEvent & { detail: { value: string } }).detail?.value ?? '')}
        />
        <hx-button variant="primary" onclick={handleSubmit}>
          Say Hello
        </hx-button>
        {#if submitted}
          <hx-alert variant="success" open>
            Hello, {name || 'World'}! HELiX components work natively in Svelte.
          </hx-alert>
        {/if}
      </div>
    </hx-card>

    <hx-card>
      <div slot="header"><h3>Component Showcase</h3></div>
      <p style="color: var(--hx-color-text-secondary, #666); margin-bottom: 1rem;">
        HELiX ships 98+ production-ready components.
      </p>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
        <hx-button variant="primary" size="sm">Primary</hx-button>
        <hx-button variant="secondary" size="sm">Secondary</hx-button>
        <hx-button variant="danger" size="sm">Danger</hx-button>
        <hx-button variant="ghost" size="sm">Ghost</hx-button>
      </div>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <hx-badge variant="default">Default</hx-badge>
        <hx-badge variant="success">Success</hx-badge>
        <hx-badge variant="warning">Warning</hx-badge>
        <hx-badge variant="danger">Danger</hx-badge>
      </div>
    </hx-card>
  </section>
</div>
`,
  );

  // app.html
  await safeWriteFile(
    path.join(srcDir, 'app.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${CSP_META}
    %sveltekit.head%
  </head>
  <body>
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`,
  );
}

async function scaffoldVueNuxt(options: ProjectOptions): Promise<void> {
  const appDir = path.join(options.directory, 'app');
  const pagesDir = path.join(appDir, 'pages');
  const layoutsDir = path.join(appDir, 'layouts');
  const componentsDir = path.join(appDir, 'components');
  const pluginsDir = path.join(options.directory, 'plugins');
  const publicOgDir = path.join(options.directory, 'public', 'og');

  await safeEnsureDir(pagesDir);
  await safeEnsureDir(layoutsDir);
  await safeEnsureDir(componentsDir);
  await safeEnsureDir(pluginsDir);

  // Generate unique install tracking ID
  const installId = randomBytes(8).toString('hex');

  // Copy brand assets into public/og/
  const assetsSource = path.join(new URL('.', import.meta.url).pathname, '..', 'assets', 'og');
  if (await fs.pathExists(assetsSource)) {
    await safeCopyDir(assetsSource, publicOgDir);
  }

  // nuxt.config.ts — Nuxt 4 with HELiX custom element detection
  await safeWriteFile(
    path.join(options.directory, 'nuxt.config.ts'),
    `export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },
  vue: {
    compilerOptions: {
      // Tell Vue to treat hx-* tags as custom elements (suppresses hydration warnings)
      isCustomElement: (tag: string) => tag.startsWith('hx-'),
    },
  },
${options.designTokens ? `  css: ['~/helix-tokens.css'],\n` : ''}\
});
`,
  );

  // HELiX plugin (client-only) — loads web components after hydration
  await safeWriteFile(
    path.join(pluginsDir, 'helix.client.ts'),
    `/**
 * HELiX client plugin — registers all web components on the client side.
 *
 * The .client suffix tells Nuxt to only run this plugin in the browser,
 * which is required because web components use browser APIs (customElements).
 *
 * Components render as inert HTML during SSR and upgrade to interactive
 * custom elements once this plugin fires on the client.
 */
export default defineNuxtPlugin(async () => {
  await import('@helixui/library');
});
`,
  );

  // helix.d.ts — TypeScript ambient declarations for hx-* custom elements
  await safeWriteFile(
    path.join(options.directory, 'helix.d.ts'),
    `/**
 * TypeScript ambient declarations for HELiX web components in Vue templates.
 *
 * Vue's compiler treats hx-* tags as custom elements (configured in nuxt.config.ts).
 * This file tells TypeScript what attributes and events they accept.
 */

type HxElement = {
  [key: string]: unknown;
};

declare module 'vue' {
  interface GlobalComponents {
    // intentionally empty — hx-* are handled as custom elements, not Vue components
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'hx-accordion': HxElement;
      'hx-accordion-item': HxElement;
      'hx-alert': HxElement;
      'hx-avatar': HxElement;
      'hx-badge': HxElement;
      'hx-banner': HxElement;
      'hx-breadcrumb': HxElement;
      'hx-button': HxElement;
      'hx-button-group': HxElement;
      'hx-card': HxElement;
      'hx-carousel': HxElement;
      'hx-checkbox': HxElement;
      'hx-checkbox-group': HxElement;
      'hx-code-snippet': HxElement;
      'hx-color-picker': HxElement;
      'hx-combobox': HxElement;
      'hx-counter': HxElement;
      'hx-data-table': HxElement;
      'hx-date-picker': HxElement;
      'hx-dialog': HxElement;
      'hx-divider': HxElement;
      'hx-drawer': HxElement;
      'hx-dropdown': HxElement;
      'hx-field': HxElement;
      'hx-field-label': HxElement;
      'hx-file-upload': HxElement;
      'hx-grid': HxElement;
      'hx-icon': HxElement;
      'hx-icon-button': HxElement;
      'hx-menu': HxElement;
      'hx-menu-item': HxElement;
      'hx-meter': HxElement;
      'hx-nav': HxElement;
      'hx-pagination': HxElement;
      'hx-popover': HxElement;
      'hx-progress-bar': HxElement;
      'hx-progress-ring': HxElement;
      'hx-radio-group': HxElement;
      'hx-rating': HxElement;
      'hx-select': HxElement;
      'hx-skeleton': HxElement;
      'hx-slider': HxElement;
      'hx-spinner': HxElement;
      'hx-split-button': HxElement;
      'hx-split-panel': HxElement;
      'hx-stat': HxElement;
      'hx-status-indicator': HxElement;
      'hx-switch': HxElement;
      'hx-tab': HxElement;
      'hx-tab-panel': HxElement;
      'hx-tabs': HxElement;
      'hx-tag': HxElement;
      'hx-text': HxElement;
      'hx-text-input': HxElement;
      'hx-textarea': HxElement;
      'hx-theme': HxElement;
      'hx-toast': HxElement;
      'hx-tooltip': HxElement;
      'hx-top-nav': HxElement;
      'hx-tree-item': HxElement;
      'hx-tree-view': HxElement;
    }
  }
}

export {};
`,
  );

  // app/app.vue — root with NuxtLayout support
  await safeWriteFile(
    path.join(appDir, 'app.vue'),
    `<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
`,
  );

  // app/layouts/default.vue — main layout with nav, footer, and global styles
  await safeWriteFile(
    path.join(layoutsDir, 'default.vue'),
    `<script setup lang="ts">
// Default layout wraps every page with the site nav and footer.
</script>

<template>
  <hx-theme theme="auto">
    <AppNavbar />
    <main>
      <slot />
    </main>
    <AppFooter />
  </hx-theme>
</template>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  color-scheme: light dark;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --hx-page-bg: #0a0a0f;
  --hx-page-text: #e4e4e7;
  --hx-page-text-secondary: #a1a1aa;
  --hx-page-surface: #18181b;
  --hx-page-surface-raised: #27272a;
  --hx-page-border: #3f3f46;
  --hx-page-code-bg: #27272a;
}

html[data-theme="light"],
html:not([data-theme]) {
  --hx-page-bg: #fafafa;
  --hx-page-text: #18181b;
  --hx-page-text-secondary: #71717a;
  --hx-page-surface: #ffffff;
  --hx-page-surface-raised: #f4f4f5;
  --hx-page-border: #e4e4e7;
  --hx-page-code-bg: #f4f4f5;
}

body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: var(--hx-page-text);
  background: var(--hx-page-bg);
  -webkit-font-smoothing: antialiased;
  transition: background 0.2s ease, color 0.2s ease;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

a {
  color: var(--hx-color-primary-500, #3b82f6);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

h1, h2, h3, h4 {
  color: var(--hx-page-text);
  letter-spacing: -0.025em;
}

code {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: 0.85em;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--hx-page-code-bg);
  color: var(--hx-page-text);
}

pre {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  background: var(--hx-page-code-bg) !important;
  color: var(--hx-page-text);
  border: 1px solid var(--hx-page-border);
}

.hero {
  padding: 5rem 2rem;
  text-align: center;
  background: var(--hx-page-surface);
  border-bottom: 1px solid var(--hx-page-border);
}

.hero h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 800;
  margin-bottom: 1rem;
  line-height: 1.1;
}

.hero p {
  font-size: 1.125rem;
  color: var(--hx-page-text-secondary);
  max-width: 600px;
  margin: 0 auto 2rem;
}

.section {
  padding: 4rem 0;
}

.section-header {
  margin-bottom: 2rem;
}

.section-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.section-header p {
  color: var(--hx-page-text-secondary);
}

.grid-auto {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.grid-3 {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.text-secondary {
  color: var(--hx-page-text-secondary);
}

hx-top-nav {
  --hx-top-nav-bg: var(--hx-page-surface);
  --hx-top-nav-color: var(--hx-page-text);
  --hx-top-nav-border-color: var(--hx-page-border);
  border-radius: 0;
  position: sticky;
  top: 0;
  z-index: 1000;
}

hx-top-nav::part(header) {
  border-radius: 0;
}

hx-card {
  --hx-card-bg: var(--hx-page-surface);
  --hx-card-color: var(--hx-page-text);
  --hx-card-border-color: var(--hx-page-border);
}

hx-card::part(header) {
  background: var(--hx-page-surface-raised);
  border-bottom: 1px solid var(--hx-page-border);
  padding: 0.875rem 1.25rem;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
}

.promo-grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.promo-card {
  position: relative;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid var(--hx-page-border);
  background: var(--hx-page-surface);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
}

.promo-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  text-decoration: none;
}

.promo-card-image {
  width: 100%;
  aspect-ratio: 1200 / 630;
  object-fit: cover;
  display: block;
  border-bottom: 1px solid var(--hx-page-border);
}

.promo-card-body {
  padding: 1.25rem 1.5rem 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.promo-card-body h3 {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--hx-page-text);
}

.promo-card-body p {
  font-size: 0.9rem;
  color: var(--hx-page-text-secondary);
  line-height: 1.5;
  flex: 1;
}

.promo-card-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--hx-color-primary-500, #3b82f6);
}

.site-footer {
  background: var(--hx-page-surface);
  border-top: 1px solid var(--hx-page-border);
  padding: 3rem 0 2rem;
}

.footer-grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: 1.5fr repeat(3, 1fr);
}

@media (max-width: 768px) {
  .footer-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 480px) {
  .footer-grid { grid-template-columns: 1fr; }
}

.footer-heading {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hx-page-text);
  margin-bottom: 0.75rem;
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.footer-links li {
  margin-bottom: 0.5rem;
}

.footer-links a {
  color: var(--hx-page-text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
  transition: color 0.15s ease;
}

.footer-links a:hover {
  color: var(--hx-page-text);
}

.footer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.footer-bottom p {
  margin: 0;
}
</style>
`,
  );

  // app/components/AppNavbar.vue — sticky nav using hx-top-nav
  await safeWriteFile(
    path.join(componentsDir, 'AppNavbar.vue'),
    `<script setup lang="ts">
import { ref, onMounted } from 'vue';

const isDark = ref(false);

onMounted(() => {
  const saved = localStorage.getItem('helix-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  isDark.value = saved ? saved === 'dark' : prefersDark;
  applyTheme(isDark.value ? 'dark' : 'light');
});

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('hx-theme').forEach((el) => {
    (el as HTMLElement & { theme: string }).theme = theme;
  });
}

function handleThemeChange(e: Event) {
  const checked = (e as CustomEvent).detail?.checked ?? false;
  const theme = checked ? 'dark' : 'light';
  isDark.value = checked;
  applyTheme(theme);
  localStorage.setItem('helix-theme', theme);
}
</script>

<template>
  <hx-top-nav sticky label="Main navigation">
    <div slot="logo">
      <NuxtLink
        to="/"
        style="display: flex; align-items: center; gap: 0.75rem; text-decoration: none; color: inherit;"
      >
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <img src="/og/bs-hx-square.png" alt="HELiX" style="height: 30px; width: 30px; border-radius: 5px;" />
          <span style="font-weight: 700; font-size: 1.125rem; letter-spacing: -0.025em;">HELiX</span>
        </div>
        <span style="opacity: 0.25; font-size: 1.25rem; font-weight: 200;">+</span>
        <span style="font-weight: 600; font-size: 0.95rem; opacity: 0.9;">Nuxt 4</span>
      </NuxtLink>
    </div>
    <div style="display: flex; gap: 1.5rem; align-items: center; margin-left: 2rem;">
      <NuxtLink to="/" style="color: inherit; text-decoration: none; font-size: 0.875rem; opacity: 0.8;">Home</NuxtLink>
      <NuxtLink to="/components" style="color: inherit; text-decoration: none; font-size: 0.875rem; opacity: 0.8;">Components</NuxtLink>
      <NuxtLink to="/examples/forms" style="color: inherit; text-decoration: none; font-size: 0.875rem; opacity: 0.8;">Forms</NuxtLink>
    </div>
    <div slot="actions" style="display: flex; align-items: center; gap: 0.75rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 0.8rem;">Dark</span>
        <hx-switch size="sm" :checked="isDark" @hx-change="handleThemeChange" />
      </div>
      <a
        href="https://github.com/bookedsolidtech"
        target="_blank"
        rel="noopener noreferrer"
        style="color: inherit; display: flex; align-items: center; opacity: 0.7;"
        title="Booked Solid on GitHub"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      </a>
      <a
        href="https://bookedsolid.tech"
        target="_blank"
        rel="noopener noreferrer"
        style="display: flex; align-items: center;"
        title="Booked Solid Technology"
      >
        <img
          src="https://bookedsolid.tech/logos/bs-bs-software-square.png?utm_source=create-helix&utm_medium=scaffold&utm_id=${installId}"
          alt="Booked Solid"
          style="height: 28px; width: 28px; border-radius: 4px;"
        />
      </a>
    </div>
  </hx-top-nav>
</template>
`,
  );

  // app/components/AppFooter.vue — site footer
  await safeWriteFile(
    path.join(componentsDir, 'AppFooter.vue'),
    `<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
            <img src="/og/bs-hx-square.png" alt="HELiX" style="height: 32px; width: 32px; border-radius: 4px;" />
            <span style="font-weight: 700; font-size: 1.125rem;">HELiX</span>
          </div>
          <p class="text-secondary" style="font-size: 0.85rem; line-height: 1.6; max-width: 280px;">
            Enterprise web components built on Lit 3. Accessible, themeable, and framework-agnostic.
          </p>
        </div>
        <div>
          <h4 class="footer-heading">Product</h4>
          <ul class="footer-links">
            <li><NuxtLink to="/components">Components</NuxtLink></li>
            <li><NuxtLink to="/examples/forms">Forms</NuxtLink></li>
            <li><NuxtLink to="/">Documentation</NuxtLink></li>
          </ul>
        </div>
        <div>
          <h4 class="footer-heading">Ecosystem</h4>
          <ul class="footer-links">
            <li><a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX UI</a></li>
            <li><a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer">HELiXiR</a></li>
            <li><a href="https://bookedsolid.tech/discord-ops" target="_blank" rel="noopener noreferrer">Discord-Ops</a></li>
            <li><a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer">GitHub</a></li>
          </ul>
        </div>
        <div>
          <h4 class="footer-heading">Legal</h4>
          <ul class="footer-links">
            <li><a href="https://bookedsolid.tech/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
            <li><a href="https://bookedsolid.tech/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a></li>
            <li><a href="https://bookedsolid.tech/about" target="_blank" rel="noopener noreferrer">About</a></li>
          </ul>
        </div>
      </div>
      <hx-divider style="margin: 2rem 0 1.5rem;" />
      <div class="footer-bottom">
        <p class="text-secondary" style="font-size: 0.8rem;">
          &copy; {{ year }} Booked Solid Technology, a d/b/a of Clarity House LLC. All rights reserved.
          Built with <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX</a> and
          <a href="https://nuxt.com" target="_blank" rel="noopener noreferrer">Nuxt 4</a>.
        </p>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer" class="text-secondary" style="display: flex;" title="GitHub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          <a href="https://bookedsolid.tech" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center;" title="Booked Solid Technology">
            <img src="/og/bs-bs-software-square.png" alt="BS" style="height: 20px; width: 20px; border-radius: 3px; opacity: 0.7;" />
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>
`,
  );

  // app/pages/index.vue — production landing page
  await safeWriteFile(
    path.join(pagesDir, 'index.vue'),
    `<script setup lang="ts">
import { ref } from 'vue';

useHead({
  title: '${sanitizeForHtml(options.name)} \u2014 Built with HELiX',
  meta: [{ name: 'description', content: 'Enterprise web components for Vue and Nuxt 4.' }],
});

const name = ref('');
const submitted = ref(false);

function handleSubmit() {
  submitted.value = true;
  setTimeout(() => {
    submitted.value = false;
  }, 3000);
}

function handleInput(e: Event) {
  const detail = (e as CustomEvent).detail;
  name.value = detail?.value ?? '';
}
</script>

<template>
  <!-- Hero -->
  <section class="hero">
    <div class="container">
      <h1>HELiX + Nuxt 4</h1>
      <p>
        Enterprise-grade web components running natively in Vue.
        75+ accessible, themeable components with Shadow DOM encapsulation.
      </p>
      <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
        <hx-button variant="primary" size="lg">
          <NuxtLink to="/examples/forms" style="color: inherit; text-decoration: none;">
            See Forms Demo
          </NuxtLink>
        </hx-button>
        <hx-button variant="secondary" size="lg">
          <NuxtLink to="/components" style="color: inherit; text-decoration: none;">
            Browse Components
          </NuxtLink>
        </hx-button>
      </div>
      <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap;">
        <hx-tag>Lit 3</hx-tag>
        <hx-tag>Shadow DOM</hx-tag>
        <hx-tag>WCAG 2.1 AA</hx-tag>
        <hx-tag>SSR-Safe</hx-tag>
        <hx-tag>Vue 3</hx-tag>
        <hx-tag>Nuxt 4</hx-tag>
      </div>
    </div>
  </section>

  <!-- Component Showcase -->
  <section class="container section">
    <div class="section-header">
      <h2>Component Showcase</h2>
      <p>A sampling of HELiX components \u2014 all rendered as native web components via Shadow DOM.</p>
    </div>

    <div class="grid-auto">
      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Interactive Input</h3>
          <hx-badge variant="info">Forms</hx-badge>
        </div>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <hx-text-input
            label="Your name"
            placeholder="Enter your name"
            :value="name"
            @hx-input="handleInput"
          />
          <hx-button variant="primary" @hx-click="handleSubmit">Say Hello</hx-button>
          <hx-alert v-if="submitted" variant="success" open>
            Hello, {{ name || 'World' }}! HELiX components are working.
          </hx-alert>
        </div>
      </hx-card>

      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Button Variants</h3>
          <hx-badge variant="success">Actions</hx-badge>
        </div>
        <p class="text-secondary" style="margin-bottom: 1rem;">All button styles respond to the active theme.</p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <hx-button variant="primary" size="sm">Primary</hx-button>
          <hx-button variant="secondary" size="sm">Secondary</hx-button>
          <hx-button variant="danger" size="sm">Danger</hx-button>
          <hx-button variant="ghost" size="sm">Ghost</hx-button>
        </div>
      </hx-card>

      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Data Display</h3>
          <hx-badge variant="warning">Metrics</hx-badge>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>Build Status</span>
            <hx-badge variant="success">Passing</hx-badge>
          </div>
          <hx-progress-bar :value="87" :max="100" />
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <hx-tag>v1.1.2</hx-tag>
            <hx-tag>stable</hx-tag>
            <hx-tag>MIT</hx-tag>
          </div>
        </div>
      </hx-card>

      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Avatars &amp; Badges</h3>
          <hx-badge variant="danger">Identity</hx-badge>
        </div>
        <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
          <hx-avatar size="sm">AB</hx-avatar>
          <hx-avatar size="md">CD</hx-avatar>
          <hx-avatar size="lg">EF</hx-avatar>
          <hx-divider vertical style="height: 2rem;" />
          <hx-badge variant="info">Info</hx-badge>
          <hx-badge variant="success">Success</hx-badge>
          <hx-badge variant="warning">Warning</hx-badge>
          <hx-badge variant="danger">Danger</hx-badge>
        </div>
      </hx-card>
    </div>
  </section>

  <!-- Tabbed Patterns -->
  <section class="container section" style="border-top: 1px solid var(--hx-page-border);">
    <hx-tabs>
      <hx-tab slot="nav">Vue Patterns</hx-tab>
      <hx-tab slot="nav">Theming</hx-tab>
      <hx-tab slot="nav">Event Handling</hx-tab>

      <hx-tab-panel>
        <div style="padding: 1.5rem 0;">
          <hx-card>
            <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
              <h3 style="margin: 0;">Using HELiX in Nuxt 4</h3>
              <hx-badge variant="info">Architecture</hx-badge>
            </div>
            <ul style="line-height: 2; padding-left: 1.5rem;">
              <li><strong>SSR rendering</strong> outputs hx-* as inert HTML \u2014 zero JS shipped to server</li>
              <li><strong>Client hydration</strong> upgrades components via <code>plugins/helix.client.ts</code></li>
              <li><strong>isCustomElement</strong> in nuxt.config.ts suppresses Vue hydration warnings</li>
              <li><strong>NuxtLayout</strong> wraps every page with the shared nav and footer</li>
              <li><strong>hx-theme</strong> in the layout injects CSS tokens for light/dark/high-contrast</li>
            </ul>
          </hx-card>
        </div>
      </hx-tab-panel>

      <hx-tab-panel>
        <div style="padding: 1.5rem 0;">
          <hx-card>
            <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
              <h3 style="margin: 0;">CSS Custom Properties</h3>
              <hx-badge variant="success">Tokens</hx-badge>
            </div>
            <p style="margin-bottom: 1rem;">
              HELiX uses a three-tier token system: primitive, semantic, and component.
            </p>
            <pre style="padding: 1rem; border-radius: 0.5rem; font-size: 0.85rem; overflow: auto;">/* helix-tokens.css */
:root {
  --hx-color-primary: #0066cc;
  --hx-color-success: #22c55e;
}

hx-button::part(button) {
  font-weight: 600;
}</pre>
          </hx-card>
        </div>
      </hx-tab-panel>

      <hx-tab-panel>
        <div style="padding: 1.5rem 0;">
          <hx-card>
            <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
              <h3 style="margin: 0;">Vue Event Handling</h3>
              <hx-badge variant="warning">Events</hx-badge>
            </div>
            <pre style="padding: 1rem; border-radius: 0.5rem; font-size: 0.85rem; overflow: auto;">&lt;!-- Direct @event binding (Vue handles hx-* custom events) --&gt;
&lt;hx-button @hx-click="handleClick"&gt;Click me&lt;/hx-button&gt;
&lt;hx-text-input @hx-input="handleInput" /&gt;

&lt;!-- Access CustomEvent detail --&gt;
function handleInput(e: Event) {
  const detail = (e as CustomEvent).detail;
  value.value = detail?.value ?? '';
}</pre>
          </hx-card>
        </div>
      </hx-tab-panel>
    </hx-tabs>
  </section>

  <!-- Ecosystem Promos -->
  <section class="container section" style="border-top: 1px solid var(--hx-page-border);">
    <div class="section-header">
      <h2>The Booked Solid Ecosystem</h2>
      <p>Enterprise-grade tools for modern web development and AI-powered workflows.</p>
    </div>
    <div class="promo-grid">
      <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer" class="promo-card">
        <img src="/og/helixui.png" alt="HELiX UI" class="promo-card-image" />
        <div class="promo-card-body">
          <h3>HELiX UI</h3>
          <p>80+ enterprise web components built on Lit 3. Shadow DOM encapsulation, healthcare-first accessibility, and W3C DTCG design tokens.</p>
          <span class="promo-card-cta">Explore HELiX UI &rarr;</span>
        </div>
      </a>
      <a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer" class="promo-card">
        <img src="/og/helixir.png" alt="HELiXiR" class="promo-card-image" />
        <div class="promo-card-body">
          <h3>HELiXiR</h3>
          <p>MCP server for any CEM-compliant web component library. Connect to Claude, Cursor, or any MCP client.</p>
          <span class="promo-card-cta">Explore HELiXiR &rarr;</span>
        </div>
      </a>
      <a href="https://bookedsolid.tech/discord-ops" target="_blank" rel="noopener noreferrer" class="promo-card">
        <img src="/og/discord-ops.png" alt="Discord-Ops" class="promo-card-image" />
        <div class="promo-card-body">
          <h3>Discord-Ops</h3>
          <p>Agency-grade Discord MCP server for AI agents. 45 tools, 23 message templates, multi-guild routing.</p>
          <span class="promo-card-cta">Explore Discord-Ops &rarr;</span>
        </div>
      </a>
    </div>
  </section>

  <!-- Getting Started -->
  <section class="container section" style="border-top: 1px solid var(--hx-page-border); padding-bottom: 5rem;">
    <div class="section-header">
      <h2>Getting Started</h2>
      <p>Your project is ready. Here are the key files and next steps.</p>
    </div>

    <div class="grid-3">
      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Key Files</h3>
          <hx-badge variant="info">Reference</hx-badge>
        </div>
        <ul style="line-height: 2; padding-left: 1.5rem;">
          <li><code>plugins/helix.client.ts</code> \u2014 HELiX initializer</li>
          <li><code>app/layouts/default.vue</code> \u2014 Nav &amp; footer layout</li>
          <li><code>app/components/AppNavbar.vue</code> \u2014 Top navigation</li>
          <li><code>app/components/AppFooter.vue</code> \u2014 Site footer</li>
          <li><code>helix.d.ts</code> \u2014 TypeScript declarations</li>
          <li><code>helix-tokens.css</code> \u2014 Design token overrides</li>
        </ul>
      </hx-card>

      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Commands</h3>
          <hx-badge variant="success">CLI</hx-badge>
        </div>
        <ul style="line-height: 2; padding-left: 1.5rem;">
          <li><code>npm run dev</code> \u2014 Start dev server</li>
          <li><code>npm run build</code> \u2014 Production build</li>
          <li><code>npm run preview</code> \u2014 Preview build</li>
        </ul>
        <hx-divider style="margin: 1rem 0;" />
        <p style="font-size: 0.875rem;" class="text-secondary">
          Add more HELiX components in <code>plugins/helix.client.ts</code>.
        </p>
      </hx-card>

      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Next Steps</h3>
          <hx-badge variant="warning">Action</hx-badge>
        </div>
        <ul style="line-height: 2; padding-left: 1.5rem;">
          <li>Customize tokens in <code>helix-tokens.css</code></li>
          <li>Add routes in <code>app/pages/</code></li>
          <li><NuxtLink to="/examples/forms">Explore form participation</NuxtLink></li>
          <li><a href="https://github.com/bookedsolidtech/helix" target="_blank" rel="noopener noreferrer">Browse all components</a></li>
        </ul>
      </hx-card>
    </div>
  </section>
</template>
`,
  );

  // app/pages/components.vue — component showcase page
  await safeWriteFile(
    path.join(pagesDir, 'components.vue'),
    `<script setup lang="ts">
useHead({
  title: 'Components \u2014 HELiX + Nuxt 4',
  meta: [{ name: 'description', content: 'Browse the HELiX component library.' }],
});
</script>

<template>
  <section class="hero" style="padding: 3rem 2rem;">
    <div class="container">
      <h1>Component Library</h1>
      <p>Browse the full HELiX component catalog. Each component is built on Lit 3 with Shadow DOM encapsulation.</p>
    </div>
  </section>

  <section class="container section">
    <div class="section-header">
      <h2>Core UI</h2>
      <p>Essential building blocks for any interface.</p>
    </div>
    <div style="display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Button</h3>
          <hx-badge variant="success">Stable</hx-badge>
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
          <hx-button variant="primary" size="sm">Primary</hx-button>
          <hx-button variant="secondary" size="sm">Secondary</hx-button>
          <hx-button variant="ghost" size="sm">Ghost</hx-button>
        </div>
        <p class="text-secondary" style="font-size: 0.85rem;">Multi-variant button with full keyboard support.</p>
      </hx-card>

      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Badge</h3>
          <hx-badge variant="success">Stable</hx-badge>
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
          <hx-badge variant="info">Info</hx-badge>
          <hx-badge variant="success">Success</hx-badge>
          <hx-badge variant="warning">Warning</hx-badge>
          <hx-badge variant="danger">Error</hx-badge>
        </div>
        <p class="text-secondary" style="font-size: 0.85rem;">Status indicators with semantic color variants.</p>
      </hx-card>

      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Avatar</h3>
          <hx-badge variant="success">Stable</hx-badge>
        </div>
        <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem;">
          <hx-avatar size="sm">AB</hx-avatar>
          <hx-avatar size="md">CD</hx-avatar>
          <hx-avatar size="lg">EF</hx-avatar>
        </div>
        <p class="text-secondary" style="font-size: 0.85rem;">User identity with initials or image support.</p>
      </hx-card>

      <hx-card>
        <div slot="header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0;">Progress Bar</h3>
          <hx-badge variant="success">Stable</hx-badge>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem;">
          <hx-progress-bar :value="75" :max="100" />
          <hx-progress-bar :value="45" :max="100" />
        </div>
        <p class="text-secondary" style="font-size: 0.85rem;">Accessible progress indicators with ARIA support.</p>
      </hx-card>
    </div>
  </section>
</template>
`,
  );

  // app/pages/examples/forms.vue — form participation demo
  const examplesDir = path.join(pagesDir, 'examples');
  await safeEnsureDir(examplesDir);
  await safeWriteFile(
    path.join(examplesDir, 'forms.vue'),
    `<script setup lang="ts">
import { ref } from 'vue';

useHead({
  title: 'Forms \u2014 HELiX + Nuxt 4',
  meta: [{ name: 'description', content: 'HELiX form components with native form participation via ElementInternals.' }],
});

const formData = ref<Record<string, string>>({});
const submitted = ref(false);

function handleSubmit(e: Event) {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const data = new FormData(form);
  const entries: Record<string, string> = {};
  data.forEach((value, key) => {
    entries[key] = value.toString();
  });
  formData.value = entries;
  submitted.value = true;
  setTimeout(() => {
    submitted.value = false;
  }, 5000);
}
</script>

<template>
  <main class="container" style="padding-top: 2rem; padding-bottom: 4rem; max-width: 800px; margin: 0 auto;">
    <h1 style="margin-bottom: 0.5rem;">Form Participation</h1>
    <p class="text-secondary" style="margin-bottom: 2rem;">
      HELiX form components participate in native HTML forms via ElementInternals.
      No special Vue wrappers needed \u2014 just use a standard &lt;form&gt; element.
    </p>

    <hx-card>
      <div slot="header"><h2>Registration Form</h2></div>
      <form style="display: flex; flex-direction: column; gap: 1.5rem;" @submit="handleSubmit">
        <div style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr;">
          <hx-text-input name="firstName" label="First name" placeholder="Jane" required />
          <hx-text-input name="lastName" label="Last name" placeholder="Doe" required />
        </div>
        <hx-text-input name="email" label="Email" type="email" placeholder="jane@example.com" required />
        <hx-textarea name="bio" label="Bio" placeholder="Tell us about yourself..." rows="3" />
        <hx-select name="role" label="Role">
          <option value="">Select a role...</option>
          <option value="developer">Developer</option>
          <option value="designer">Designer</option>
          <option value="manager">Manager</option>
        </hx-select>
        <hx-checkbox name="terms" label="I agree to the terms and conditions" required />
        <div style="display: flex; gap: 0.5rem;">
          <hx-button variant="primary" type="submit">Submit</hx-button>
          <hx-button variant="secondary" type="reset">Reset</hx-button>
        </div>
      </form>
    </hx-card>

    <hx-card v-if="submitted" style="margin-top: 1.5rem;">
      <div slot="header">
        <h3>Form Data (from FormData API)</h3>
        <hx-badge variant="success">Submitted</hx-badge>
      </div>
      <pre style="padding: 1rem; border-radius: 0.5rem; font-size: 0.85rem; overflow: auto;">{{ JSON.stringify(formData, null, 2) }}</pre>
    </hx-card>

    <hx-card style="margin-top: 1.5rem;">
      <div slot="header"><h3>How It Works</h3></div>
      <ul style="line-height: 2; padding-left: 1.5rem;">
        <li><strong>ElementInternals:</strong> Each HELiX form component calls <code>this.internals.setFormValue()</code></li>
        <li><strong>FormData:</strong> Values appear in <code>new FormData(form)</code> automatically</li>
        <li><strong>Validation:</strong> Components report validity via <code>internals.setValidity()</code></li>
        <li><strong>Reset:</strong> Forms reset web components via <code>formResetCallback()</code></li>
        <li><strong>No wrappers needed:</strong> This is native browser behavior, not framework-specific</li>
      </ul>
    </hx-card>
  </main>
</template>
`,
  );

  // app/error.vue — Nuxt error page using hx-* components
  await safeWriteFile(
    path.join(appDir, 'error.vue'),
    `<script setup lang="ts">
import type { NuxtError } from '#app';

defineProps<{ error: NuxtError }>();

const handleClear = () => clearError({ redirect: '/' });
</script>

<template>
  <hx-theme theme="auto">
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem;">
      <hx-card style="max-width: 500px; width: 100%; text-align: center;">
        <div slot="header">
          <hx-badge variant="danger">{{ error.statusCode }}</hx-badge>
        </div>
        <h1 style="margin-bottom: 1rem;">{{ error.statusMessage || 'An error occurred' }}</h1>
        <p class="text-secondary" style="margin-bottom: 1.5rem;">
          {{ error.message || 'Something went wrong. Please try again.' }}
        </p>
        <hx-button variant="primary" @hx-click="handleClear">Go Home</hx-button>
      </hx-card>
    </div>
  </hx-theme>
</template>
`,
  );

  await writeVueNuxtErrorBoundary(options);
}

async function scaffoldAngular(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  const appDir = path.join(srcDir, 'app');
  await safeEnsureDir(appDir);

  // angular.json (minimal)
  await safeWriteFile(
    path.join(options.directory, 'angular.json'),
    JSON.stringify(
      {
        $schema: './node_modules/@angular/cli/lib/config/schema.json',
        version: 1,
        newProjectRoot: 'projects',
        projects: {
          [options.name]: {
            projectType: 'application',
            root: '',
            sourceRoot: 'src',
            prefix: 'app',
            architect: {
              build: {
                builder: '@angular/build:application',
                options: {
                  outputPath: 'dist',
                  index: 'src/index.html',
                  browser: 'src/main.ts',
                  tsConfig: 'tsconfig.json',
                  styles: ['src/styles.css', ...(options.designTokens ? ['helix-tokens.css'] : [])],
                },
              },
              serve: {
                builder: '@angular/build:dev-server',
              },
            },
          },
        },
      },
      null,
      2,
    ),
  );

  // index.html
  await safeWriteFile(
    path.join(srcDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  ${CSP_META}
  <title>${sanitizeForHtml(options.name)}</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <app-root></app-root>
</body>
</html>
`,
  );

  // main.ts
  await safeWriteFile(
    path.join(srcDir, 'main.ts'),
    `import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

// Register HELiX web components
import '@helixui/library';

bootstrapApplication(AppComponent).catch((err) => console.error(err));
`,
  );

  // styles.css
  await safeWriteFile(
    path.join(srcDir, 'styles.css'),
    `body {
  font-family: var(--hx-font-family, system-ui, sans-serif);
  margin: 0;
  padding: 0;
}
`,
  );

  // app.component.ts
  await safeWriteFile(
    path.join(appDir, 'app.component.ts'),
    `import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: \`
    <div class="container">
      <h1>HELiX + Angular 18</h1>
      <p>Enterprise Angular with native custom element support via CUSTOM_ELEMENTS_SCHEMA.</p>

      <hx-card>
        <div slot="header"><h2>Interactive Form</h2></div>
        <hx-text-input
          label="Your name"
          placeholder="Enter your name"
          [attr.value]="name"
          (hx-input)="onInput($event)"
        ></hx-text-input>
        <hx-button variant="primary" style="margin-top: 1rem" (hx-click)="onSubmit()">
          Say Hello
        </hx-button>
        @if (submitted) {
          <hx-alert variant="success" open style="margin-top: 1rem">
            Hello, {{ name || 'World' }}!
          </hx-alert>
        }
      </hx-card>

      <hx-card style="margin-top: 1.5rem">
        <div slot="header"><h2>Angular Signals + WC</h2></div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <hx-button variant="primary">Primary</hx-button>
          <hx-button variant="secondary">Secondary</hx-button>
          <hx-button variant="danger">Danger</hx-button>
          <hx-badge variant="info">Angular 18</hx-badge>
        </div>
      </hx-card>
    </div>
  \`,
  styles: [\`
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
  \`],
})
export class AppComponent {
  name = '';
  submitted = false;

  onInput(event: Event) {
    const detail = (event as CustomEvent).detail;
    this.name = detail?.value ?? '';
  }

  onSubmit() {
    this.submitted = true;
    setTimeout(() => { this.submitted = false; }, 3000);
  }
}
`,
  );
}

async function scaffoldSolidVite(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  const libDir = path.join(srcDir, 'lib');
  await safeEnsureDir(srcDir);
  await safeEnsureDir(libDir);

  // Copy brand assets into public/og/
  const assetsSource = path.join(new URL('.', import.meta.url).pathname, '..', 'assets', 'og');
  const publicOgDir = path.join(options.directory, 'public', 'og');
  if (await fs.pathExists(assetsSource)) {
    await safeCopyDir(assetsSource, publicOgDir);
  }

  // Override tsconfig for Solid.js — needs jsx: 'preserve' so vite-plugin-solid
  // can handle the JSX transformation, plus jsxImportSource for type checking.
  if (options.typescript) {
    await safeWriteJson(
      path.join(options.directory, 'tsconfig.json'),
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'preserve',
          jsxImportSource: 'solid-js',
        },
        include: ['src'],
        exclude: ['node_modules'],
      },
      { spaces: 2 },
    );
  }

  // vite.config.ts
  await safeWriteFile(
    path.join(options.directory, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
});
`,
  );

  // index.html
  await safeWriteFile(
    path.join(options.directory, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSP_META}
    <title>${sanitizeForHtml(options.name)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );

  // main.tsx
  await safeWriteFile(
    path.join(srcDir, 'main.tsx'),
    `import { render } from 'solid-js/web';
import App from './App';
${options.designTokens ? "import './helix-setup';" : "import '@helixui/library';"}
import './index.css';

render(() => <App />, document.getElementById('app')!);
`,
  );

  // App.tsx — Production landing page using SolidJS signals and onMount
  await safeWriteFile(
    path.join(srcDir, 'App.tsx'),
    `import { createSignal, createMemo, createEffect, onMount } from 'solid-js';
import { initHelix } from './lib/helix';
import './index.css';

export default function App() {
  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count() * 2);

  onMount(async () => {
    await initHelix();
  });

  return (
    <div class="container">
      <h1>HELiX + SolidJS + Vite</h1>

      <hx-card>
        <div slot="header">
          <h2>Reactive Counter</h2>
        </div>
        <p>
          Count: {count()} (doubled: {doubled()})
        </p>
        <hx-button variant="primary" onClick={() => setCount((c) => c + 1)}>
          Increment
        </hx-button>
        <hx-button variant="secondary" style="margin-left: 0.5rem" onClick={() => setCount(0)}>
          Reset
        </hx-button>
      </hx-card>

      <hx-card style="margin-top: 1.5rem">
        <div slot="header">
          <h2>SolidJS + Web Components</h2>
          <hx-badge variant="info">Native Support</hx-badge>
        </div>
        <p>
          SolidJS renders directly to the DOM — no virtual DOM — making it ideal for web
          components. Properties and events bind natively without wrappers.
        </p>
        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <hx-button variant="primary" size="sm">
            Primary
          </hx-button>
          <hx-button variant="secondary" size="sm">
            Secondary
          </hx-button>
          <hx-button variant="danger" size="sm">
            Danger
          </hx-button>
        </div>
      </hx-card>
    </div>
  );
}
`,
  );

  // index.css
  await safeWriteFile(
    path.join(srcDir, 'index.css'),
    `@import '@helixui/tokens/tokens.css';

body {
  font-family: var(--hx-font-family, system-ui, sans-serif);
  margin: 0;
  padding: 2rem;
  color: var(--hx-color-text, #1a1a1a);
}

.container {
  max-width: 800px;
  margin: 0 auto;
}
`,
  );

  // src/lib/helix.ts — HELiX initializer for SolidJS
  await safeWriteFile(
    path.join(libDir, 'helix.ts'),
    `/**
 * HELiX initializer for SolidJS.
 *
 * Call initHelix() once in your app entry (e.g. onMount in App.tsx) to
 * register all HELiX custom elements before they are rendered.
 *
 * SolidJS renders directly to the DOM, so web components must be registered
 * before the first render or during hydration — this async initializer
 * ensures the library is loaded before components are used.
 */
export async function initHelix(): Promise<void> {
  await import('@helixui/library');
}
`,
  );

  // src/helix.d.ts — TypeScript JSX declarations for hx-* elements (SolidJS)
  await safeWriteFile(
    path.join(srcDir, 'helix.d.ts'),
    `/**
 * JSX type declarations for HELiX web components in SolidJS.
 *
 * SolidJS uses solid-js/types/jsx.d.ts for JSX intrinsic elements.
 * Augmenting the solid-js JSX namespace lets TypeScript understand
 * hx-* custom elements without errors.
 *
 * For native SolidJS binding patterns:
 *   - Attributes: <hx-button variant="primary">
 *   - Properties: <hx-button prop:value={val}>
 *   - Events: <hx-button on:hx-click={handler}>
 */
import type { JSX } from 'solid-js';

type HxElement = JSX.HTMLAttributes<HTMLElement> & Record<string, unknown>;

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'hx-accordion': HxElement;
      'hx-accordion-item': HxElement;
      'hx-alert': HxElement;
      'hx-avatar': HxElement;
      'hx-badge': HxElement;
      'hx-banner': HxElement;
      'hx-breadcrumb': HxElement;
      'hx-button': HxElement;
      'hx-button-group': HxElement;
      'hx-card': HxElement;
      'hx-carousel': HxElement;
      'hx-checkbox': HxElement;
      'hx-checkbox-group': HxElement;
      'hx-code-snippet': HxElement;
      'hx-color-picker': HxElement;
      'hx-combobox': HxElement;
      'hx-counter': HxElement;
      'hx-data-table': HxElement;
      'hx-date-picker': HxElement;
      'hx-dialog': HxElement;
      'hx-divider': HxElement;
      'hx-drawer': HxElement;
      'hx-dropdown': HxElement;
      'hx-field': HxElement;
      'hx-field-label': HxElement;
      'hx-file-upload': HxElement;
      'hx-grid': HxElement;
      'hx-icon': HxElement;
      'hx-icon-button': HxElement;
      'hx-menu': HxElement;
      'hx-menu-item': HxElement;
      'hx-meter': HxElement;
      'hx-nav': HxElement;
      'hx-pagination': HxElement;
      'hx-popover': HxElement;
      'hx-progress-bar': HxElement;
      'hx-progress-ring': HxElement;
      'hx-radio-group': HxElement;
      'hx-rating': HxElement;
      'hx-select': HxElement;
      'hx-skeleton': HxElement;
      'hx-slider': HxElement;
      'hx-spinner': HxElement;
      'hx-split-button': HxElement;
      'hx-split-panel': HxElement;
      'hx-stat': HxElement;
      'hx-status-indicator': HxElement;
      'hx-switch': HxElement;
      'hx-tab': HxElement;
      'hx-tab-panel': HxElement;
      'hx-tabs': HxElement;
      'hx-tag': HxElement;
      'hx-text': HxElement;
      'hx-text-input': HxElement;
      'hx-textarea': HxElement;
      'hx-theme': HxElement;
      'hx-toast': HxElement;
      'hx-tooltip': HxElement;
      'hx-top-nav': HxElement;
      'hx-tree-item': HxElement;
      'hx-tree-view': HxElement;
    }
  }
}

export {};
`,
  );
}

async function scaffoldQwikVite(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  await safeEnsureDir(srcDir);

  // vite.config.ts — Qwik client-only SPA (no Qwik City routing)
  await safeWriteFile(
    path.join(options.directory, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';

export default defineConfig({
  plugins: [
    qwikVite({
      csr: true,
    }),
  ],
});
`,
  );

  // index.html
  await safeWriteFile(
    path.join(options.directory, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSP_META}
    <title>${sanitizeForHtml(options.name)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/entry.tsx"></script>
  </body>
</html>
`,
  );

  // src/app.tsx — main Qwik component
  await safeWriteFile(
    path.join(srcDir, 'app.tsx'),
    `import { component$, useSignal } from '@builder.io/qwik';
${options.designTokens ? "import './helix-setup';" : "import '@helixui/library';"}
import './index.css';

export const App = component$(() => {
  const count = useSignal(0);

  return (
    <div class="container">
      <h1>${sanitizeForHtml(options.name)}</h1>

      <hx-card>
        <div slot="header"><h2>Counter Demo</h2></div>
        <p>Count: {count.value}</p>
        <hx-button variant="primary" onClick$={() => count.value++}>
          Increment
        </hx-button>
        <hx-button
          variant="secondary"
          style="margin-left: 0.5rem"
          onClick$={() => (count.value = 0)}
        >
          Reset
        </hx-button>
      </hx-card>

      <hx-card style="margin-top: 1.5rem">
        <div slot="header">
          <h2>Qwik + Web Components</h2>
          <hx-badge variant="info">Resumable</hx-badge>
        </div>
        <p>Qwik uses resumability — no hydration cost. Web components bind natively
        and load lazily with zero JavaScript overhead by default.</p>
        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <hx-button variant="primary" size="sm">Primary</hx-button>
          <hx-button variant="secondary" size="sm">Secondary</hx-button>
          <hx-button variant="danger" size="sm">Danger</hx-button>
        </div>
      </hx-card>
    </div>
  );
});
`,
  );

  // src/entry.tsx — client-side render entry point
  await safeWriteFile(
    path.join(srcDir, 'entry.tsx'),
    `import { render } from '@builder.io/qwik';
import { App } from './app';

render(document.getElementById('app')!, <App />);
`,
  );

  // src/index.css
  await safeWriteFile(
    path.join(srcDir, 'index.css'),
    `@import '@helixui/tokens/tokens.css';

body {
  font-family: var(--hx-font-family, system-ui, sans-serif);
  margin: 0;
  padding: 2rem;
  color: var(--hx-color-text, #1a1a1a);
}

.container {
  max-width: 800px;
  margin: 0 auto;
}
`,
  );
}

async function scaffoldLitVite(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  await safeEnsureDir(srcDir);

  // vite.config.ts — Lit needs no special plugin, Vite handles it natively
  await safeWriteFile(
    path.join(options.directory, 'vite.config.ts'),
    `import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
  },
});
`,
  );

  // index.html
  await safeWriteFile(
    path.join(options.directory, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSP_META}
    <title>${sanitizeForHtml(options.name)}</title>
  </head>
  <body>
    <my-element></my-element>
    <script type="module" src="/src/my-element.ts"></script>
  </body>
</html>
`,
  );

  // src/my-element.ts — Lit component with TypeScript decorators
  await safeWriteFile(
    path.join(srcDir, 'my-element.ts'),
    `import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
${options.designTokens ? "import './helix-setup';" : "import '@helixui/library';"}

@customElement('my-element')
export class MyElement extends LitElement {
  static styles = css\`
    :host {
      display: block;
      padding: 2rem;
      font-family: var(--hx-font-family, system-ui, sans-serif);
      color: var(--hx-color-text, #1a1a1a);
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
    }
  \`;

  @property({ type: Number })
  count = 0;

  render() {
    return html\`
      <div class="container">
        <h1>HELiX + Lit + Vite</h1>
        <hx-card>
          <div slot="header"><h2>Counter Demo</h2></div>
          <p>Count: \${this.count}</p>
          <hx-button variant="primary" @click=\${() => this.count++}>
            Increment
          </hx-button>
          <hx-button
            variant="secondary"
            style="margin-left: 0.5rem"
            @click=\${() => (this.count = 0)}
          >
            Reset
          </hx-button>
        </hx-card>

        <hx-card style="margin-top: 1.5rem">
          <div slot="header">
            <h2>Lit + Web Components</h2>
            <hx-badge variant="info">Native Support</hx-badge>
          </div>
          <p>Lit builds on the Web Components standards — Custom Elements,
          Shadow DOM, and HTML Templates — making it ideal for composing
          HELiX components with minimal overhead.</p>
          <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
            <hx-button variant="primary" size="sm">Primary</hx-button>
            <hx-button variant="secondary" size="sm">Secondary</hx-button>
            <hx-button variant="danger" size="sm">Danger</hx-button>
          </div>
        </hx-card>
      </div>
    \`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'my-element': MyElement;
  }
}
`,
  );

  // index.css
  await safeWriteFile(
    path.join(srcDir, 'index.css'),
    `@import '@helixui/tokens/tokens.css';

body {
  font-family: var(--hx-font-family, system-ui, sans-serif);
  margin: 0;
  padding: 2rem;
  color: var(--hx-color-text, #1a1a1a);
}
`,
  );
}

// ─── wc-storybook: Design System Factory ─────────────────────────────────────

async function scaffoldWcStorybook(options: ProjectOptions): Promise<void> {
  // Defensive validation — programmatic callers (scaffoldProject() invoked
  // directly without going through CLI/JSON parsing) can otherwise pass
  // dsName values like '../../outside' that get interpolated into
  // path.join() targets below. The CLI / JSON paths validate, but this
  // entry point is a public API surface that must self-defend.
  // Fall back to the project name when dsName is not supplied — the api.ts
  // (scaffold(...)) entry never accepts dsName today, so a generic
  // fallback like 'my-ds' produced <my-ds-button> tags and --my-ds-* tokens
  // for every API caller. Project name is the consumer's intent for the
  // package; deriving the design-system codename from it matches the CLI's
  // initialValue and gives API callers a sensible identity without forcing
  // them to expose dsName separately. Strip the @scope/ prefix first so
  // `@acme/design-system` falls back to dsName='design-system' instead of
  // failing validation outright.
  const unscopedName = options.name ? unscopeName(options.name) : null;
  const projectAsDsName =
    unscopedName && validateDsName(unscopedName) === undefined ? unscopedName : null;
  const dsRaw = options.dsName ?? projectAsDsName ?? 'my-ds';
  const dsErr = validateDsName(dsRaw);
  if (dsErr) {
    throw new HelixError(ErrorCode.PATH_TRAVERSAL, `Invalid dsName "${dsRaw}": ${dsErr}`);
  }
  const tokenPrefixRaw = options.tokenPrefix ?? `--${dsRaw}`;
  const tokenPrefixErr = validateTokenPrefix(tokenPrefixRaw);
  if (tokenPrefixErr) {
    throw new HelixError(
      ErrorCode.PATH_TRAVERSAL,
      `Invalid tokenPrefix "${tokenPrefixRaw}": ${tokenPrefixErr}`,
    );
  }
  const ds = dsRaw;
  // Default the token prefix to `--{dsName}` so the consumer's brand layer
  // and the upstream Helix layer don't collide. Defaulting to `--hx`
  // produced cyclic self-references like
  // `--hx-button-bg: var(--hx-button-bg, var(--hx-color-action-primary-bg))`,
  // which CSS treats as invalid and drops — the entire bridge / override
  // surface stopped working on default scaffolds. The dsName-derived
  // prefix gives every consumer a unique namespace by default while
  // still letting them pass `--token-prefix --hx` explicitly if they
  // really want to share Helix's prefix.
  const prefix = options.tokenPrefix ?? `--${ds}`;
  const ClassName = toPascalCase(ds);
  const BaseClass = `${ClassName}Element`;
  const dsTitle = ds
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');

  const storybookDir = path.join(options.directory, '.storybook');
  const srcDir = path.join(options.directory, 'src');
  const baseDir = path.join(srcDir, 'base');
  const componentsDir = path.join(srcDir, 'components');
  const buttonDir = path.join(componentsDir, `${ds}-button`);
  const tokensDir = path.join(srcDir, 'tokens');
  const storiesDir = path.join(srcDir, 'stories');
  const designTokensStoriesDir = path.join(storiesDir, 'design-tokens');

  await safeEnsureDir(storybookDir);
  await safeEnsureDir(srcDir);
  await safeEnsureDir(baseDir);
  await safeEnsureDir(buttonDir);
  await safeEnsureDir(tokensDir);
  await safeEnsureDir(storiesDir);
  await safeEnsureDir(designTokensStoriesDir);

  // Brand verticals — captured at scaffold time, baked into preview.ts's
  // brand toolbar so consumers can switch \`data-brand\` on \`:root\` from the
  // Storybook UI without manual URL globals. Filtered to non-empty values
  // and deduped against the implicit Default entry.
  const brandVerticalsList = (options.brandVerticals ?? [])
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  const brandToolbarItemsLiteral = brandVerticalsList
    .map((v) => {
      const value = v.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      const title = v.charAt(0).toUpperCase() + v.slice(1);
      return `          { value: ${JSON.stringify(value)}, title: ${JSON.stringify(title)} }`;
    })
    .join(',\n');

  // ── .storybook/main.ts ───────────────────────────────────────────────────

  await safeWriteFile(
    path.join(storybookDir, 'main.ts'),
    `import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { StorybookConfig } from '@storybook/web-components-vite';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.@(ts|tsx)',
    '../src/**/*.mdx',
  ],
  addons: [
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-vitest'),
    getAbsolutePath('@storybook/addon-themes'),
    // 2026-05-09 Phase 2 — addon parity with upstream Helix storybook.
    getAbsolutePath('@storybook/addon-links'),
    getAbsolutePath('@storybook/addon-designs'),
    getAbsolutePath('storybook-addon-pseudo-states'),
    getAbsolutePath('@chromatic-com/storybook'),
  ],
  framework: {
    name: getAbsolutePath('@storybook/web-components-vite'),
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  viteFinal: async (config) => {
    // Ensure Vite's esbuild can parse Lit decorator syntax
    config.optimizeDeps ??= {};
    config.optimizeDeps.esbuildOptions ??= {};
    config.optimizeDeps.esbuildOptions.tsconfigRaw = {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    };
    // Force-include @helixui/library in the dep-optimization graph so
    // Vite pre-bundles it as a side-effecting dependency. Without this,
    // production tree-shaking drops bare \`import '@helixui/library'\` and
    // \`import '@helixui/library/components/<tag>'\` because the registration
    // runs in a downstream chunk (dist/shared/*) that Rollup considers
    // pure. \`treeshake.moduleSideEffects\` keeps the registration alive.
    config.optimizeDeps.include ??= [];
    config.optimizeDeps.include.push('@helixui/library');
    config.build ??= {};
    const existingRollupOptions = config.build.rollupOptions ?? {};
    config.build.rollupOptions = {
      ...existingRollupOptions,
      treeshake: {
        // Globally preserve module side effects. Without this, bare
        // \`import '@helixui/library'\` and per-component side-effect
        // imports get dropped during \`storybook build\` because Rollup
        // chases the import chain into dist/shared/* and decides the
        // @customElement decorator runtime is "pure". The bundle still
        // tree-shakes unused exports — only side-effecting top-level
        // module evaluation is preserved.
        moduleSideEffects: true,
      },
    };
    return config;
  },
};

export default config;

function getAbsolutePath(value: string): string {
  // \`createRequire().resolve()\` works on every Node 20.x release, while
  // \`import.meta.resolve()\` only became unflagged in newer 20.x. The CLI
  // advertises Node ^20 support, so using import.meta.resolve here would
  // break \`pnpm storybook\` / \`pnpm build-storybook\` for users on the
  // earlier Node 20 versions still in our supported range.
  const require = createRequire(import.meta.url);
  return dirname(require.resolve(\`\${value}/package.json\`));
}
`,
  );

  // ── .storybook/preview.ts ────────────────────────────────────────────────
  //
  // Phase 3c — full preview rewrite:
  //   * Wire HelixDocsPage as the global autodocs container
  //   * Theme decorator using HELIX_THEME_MODES (3 modes vs the prior 2)
  //   * Per-mode backgrounds palette from helixBackgroundsForMode
  //   * Brand toolbar globalType (items populated from brandVerticals;
  //     Phase 4 will wire that — for v1 we ship a stub and Phase 4 swaps
  //     in the consumer's prompts)
  //   * Initial globals hydrated from localStorage with URL-globals-as-
  //     authoritative precedence (mirrors preview-head.html FOUC chain)
  //   * Brand persistence decorator that writes to
  //     localStorage["helix:storybook:globals"] so FOUC-prevention
  //     scripts can pre-paint on subsequent loads
  //   * Editorial-first storySort (Cover → Overview → Foundations →
  //     Patterns → Components → Playground)
  //
  // ESM templating note: every \${} in this template literal is
  // doubly-escaped so it lands as `\${...}` in the emitted .ts source —
  // critical regression class, see the "round-trip escape" tests.

  await safeWriteFile(
    path.join(storybookDir, 'preview.ts'),
    `import './docs/helix-docs.css';
import './docs/brand-overrides.css';
import './docs/a11y-card.css';
import './docs/helix-narrative.css';
import type { Preview } from '@storybook/web-components';
import { setCustomElementsManifest } from '@storybook/web-components';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import { html } from 'lit';
import helixConfig from '../helix.storybook.config';
// CRITICAL: \`@helixui/tokens/tokens.css\` MUST load before any of the docs
// CSS files below — it defines every \`--hx-color-*\`, \`--hx-space-*\`,
// \`--hx-font-*\` token at \`:root\`. Without it, the helix-narrative.css /
// helix-docs.css / a11y-card.css rules fall back to their hex defaults
// AND Storybook's docs theme overrides body text to its own palette,
// producing white-on-white surfaces. Order matters — token definitions
// FIRST, then library (registers components which read tokens), then
// the consumer's \`{prefix}-*\` overrides on top.
import '@helixui/tokens/tokens.css';
// Anchor every hx-* registration into the bundle. Bare
// \`import '@helixui/library'\` and per-component side-effect imports get
// tree-shaken during \`storybook build\` because Rollup chases through
// dist/components/*/index.js (which only re-exports) into dist/shared/*
// (where the @customElement decorators run) and decides those modules
// are pure. Importing a NAMED export and \`window\`-attaching it forces
// Rollup to keep the import chain alive — the chain's evaluation runs
// the registration as a side effect.
import { HelixButton } from '@helixui/library';
(window as unknown as { __helixUiAnchor: typeof HelixButton }).__helixUiAnchor = HelixButton;
import '../src/tokens/tokens.css';
import consumerCem from '../custom-elements.json';
// Helix's own custom-elements manifest ships every hx-* declaration
// (description, attribute table, slots, CSS parts, css custom props).
// The autodocs lookup is keyed by tag, so without merging Helix's manifest
// in, every catalog page (HELiX/*) loses its CEM-backed API tables and
// description blocks.
import helixCem from '@helixui/library/custom-elements.json';
import { helixBackgroundsForMode, HELIX_THEME_MODES } from './manager-theme';
import { HelixDocsPage } from './docs/HelixDocsPage';

// Merge consumer + upstream Helix CEM into one manifest. Consumer modules
// win on tag conflicts so a locally-extended <my-button> overrides
// Helix's <my-button> declaration if both happen to exist.
type CemModule = { declarations?: Array<{ tagName?: string }>; [k: string]: unknown };
type CemManifest = { schemaVersion?: string; modules?: CemModule[]; [k: string]: unknown };
const mergedCem: CemManifest = (() => {
  const consumer = consumerCem as CemManifest;
  const helix = helixCem as CemManifest;
  const consumerTags = new Set<string>();
  for (const mod of consumer.modules ?? []) {
    for (const d of mod.declarations ?? []) {
      if (d.tagName) consumerTags.add(d.tagName);
    }
  }
  const helixModules = (helix.modules ?? []).filter((mod) => {
    const declTags = (mod.declarations ?? []).map((d) => d.tagName).filter(Boolean) as string[];
    return declTags.every((tag) => !consumerTags.has(tag));
  });
  return {
    schemaVersion: consumer.schemaVersion ?? helix.schemaVersion,
    modules: [...(consumer.modules ?? []), ...helixModules],
  };
})();

// Load the Custom Elements Manifest so autodocs API tables are populated
// with properties, events, slots, CSS parts, and CSS custom properties for
// BOTH the consumer's components and every upstream hx-* tag.
setCustomElementsManifest(mergedCem as Record<string, unknown>);

/**
 * Viewport breakpoints sourced from @helixui/tokens.
 */
const helixViewports = {
  xs: { name: 'xs (mobile small, 360px)', styles: { width: '360px', height: '780px' }, type: 'mobile' as const },
  mobile: { name: 'mobile (375px)', styles: { width: '375px', height: '812px' }, type: 'mobile' as const },
  sm: { name: 'sm (token, 640px)', styles: { width: '640px', height: '900px' }, type: 'mobile' as const },
  md: { name: 'md (token, 768px)', styles: { width: '768px', height: '1024px' }, type: 'tablet' as const },
  lg: { name: 'lg (token, 1024px)', styles: { width: '1024px', height: '768px' }, type: 'desktop' as const },
  xl: { name: 'xl (token, 1280px)', styles: { width: '1280px', height: '900px' }, type: 'desktop' as const },
  '2xl': { name: '2xl (token, 1536px)', styles: { width: '1536px', height: '960px' }, type: 'desktop' as const },
  xxl: { name: 'xxl (ultrawide, 1920px)', styles: { width: '1920px', height: '1080px' }, type: 'desktop' as const },
};

const preview: Preview = {
  parameters: {
    beforeEach: async () => {
      document.body.removeAttribute('style');
    },
    controls: {
      expanded: true,
      sort: 'requiredFirst',
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    docs: {
      // Custom autodocs page — auto-injects A11yStatusCard from CEM
      // helixMeta on every component page.
      page: HelixDocsPage,
      toc: { headingSelector: 'h2, h3', title: 'Table of Contents' },
      source: { format: 'dedent' },
    },
    options: {
      // Editorial flow above engineering. Phase 4 expands the inner
      // ordering for Foundations + Patterns. Drupal omitted — wc-storybook
      // factory does not ship Drupal stories.
      // Editorial-first IA. Welcome sits at the top — Introduction is
      // the technical onboarding (commands, what-this-thing-is), Cover
      // is the brand identity (tagline + verticals), Overview is the
      // three-tier cascade explainer, Patterns is the composition index.
      // Foundations follows with the cascade order baked in (Tokens →
      // semantic groups → Brand → Accessibility → raw swatches), then
      // the consumer's own Components, then the upstream HELiX catalog.
      // Without explicit nesting Storybook falls back to alphabetical
      // and pages drift out of intended reading order.
      storySort: {
        order: [
          'Welcome',
          ['Introduction', 'Cover', 'Overview', 'Patterns'],
          'Foundations',
          [
            'Tokens',
            'Color',
            'Typography',
            'Spacing',
            'Layout',
            'Brand',
            'Token Swatches',
          ],
          // Phase 3 — top-level Accessibility namespace, positioned between
          // Foundations (the design-language ledger) and Components (the
          // shipped surface). Houses the 8 narrative pages: Dashboard,
          // Success Criteria, Consumer Obligations, Keyboard Contracts,
          // Focus Management, Contrast Deep-Dive, Forced Colors, AAA
          // Story Template. Without explicit placement, Storybook would
          // sort it alphabetically (between 'A11y addon' and 'Components').
          'Accessibility',
          [
            'Dashboard',
            'Success Criteria',
            'Consumer Obligations',
            'Keyboard Contracts',
            'Focus Management',
            'Contrast Deep-Dive',
            'Forced Colors',
            'AAA Story Template',
          ],
          'Components',
          'HELiX',
          '*',
        ],
      },
    },
    a11y: {
      config: {
        rules: [{ id: 'color-contrast', enabled: true }],
      },
    },
    backgrounds: {
      options: {
        ...helixBackgroundsForMode('light'),
        ...helixBackgroundsForMode('dark'),
        ...helixBackgroundsForMode('high-contrast'),
      },
    },
    viewport: { options: helixViewports },
    actions: { argTypesRegex: '^hx-.*' },
    pseudo: {},
    // The @storybook/addon-designs "design" parameter is OPT-IN per
    // story — when a real Figma URL is configured, the consumer adds
    // it to the individual story's parameters block (e.g.
    //   design: { type: 'figma', url: 'https://figma.com/...' }
    // ). Setting a global default with url:'/' produced a broken
    // external link on every story page; dropping the global default
    // leaves the addon dormant until the consumer wires it intentionally.
  },

  /**
   * Initial globals — hydrated from helix:storybook:globals localStorage
   * key. URL globals are AUTHORITATIVE when present (no localStorage merge).
   * Mirrors preview-head.html FOUC precedence so canvas + toolbar agree
   * on first frame.
   */
  initialGlobals: (() => {
    let urlHasGlobals = false;
    if (typeof window !== 'undefined') {
      try {
        urlHasGlobals = new URL(window.location.href).searchParams.has('globals');
      } catch {
        urlHasGlobals = false;
      }
    }

    let persisted: { theme?: unknown; brand?: unknown } | null = null;
    if (!urlHasGlobals) {
      try {
        if (typeof window !== 'undefined') {
          const raw = window.localStorage.getItem('helix:storybook:globals');
          if (raw) {
            const parsed: unknown = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              persisted = parsed as { theme?: unknown; brand?: unknown };
            }
          }
        }
      } catch {
        /* fall through to defaults */
      }
    }
    const theme =
      typeof persisted?.theme === 'string' && persisted.theme.length > 0
        ? persisted.theme
        : 'light';
    // Validate the persisted brand against THIS scaffold's allowed
    // verticals AND the runtime helixConfig.brand filter before applying.
    // Storybook's localStorage key is namespaced only by origin, so two
    // scaffolds running on the default localhost:6006 share state — and
    // a removed/renamed vertical would otherwise re-apply
    // data-brand="<stale>" on first load. The scaffold-time list is the
    // baseline; the config filter narrows it further at runtime so
    // helixConfig.brand.include/exclude actually have an effect on
    // initial state, not just toolbar item visibility.
    const scaffoldVerticals: readonly string[] = [${brandVerticalsList.length > 0 ? '\n      ' + brandVerticalsList.map((v) => JSON.stringify(v.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))).join(',\n      ') + ',' : ''}
    ];
    const brandInclude = helixConfig.brand?.include;
    const brandExclude = helixConfig.brand?.exclude ?? [];
    const allowedBrandValues: readonly string[] = [
      '', // unbranded baseline always allowed
      ...scaffoldVerticals.filter((v) => {
        if (brandExclude.includes(v)) return false;
        if (brandInclude === 'all' || brandInclude === undefined) return true;
        return brandInclude.includes(v);
      }),
    ];
    const persistedBrand =
      typeof persisted?.brand === 'string' ? persisted.brand : '';
    const brand = allowedBrandValues.includes(persistedBrand) ? persistedBrand : '';
    return {
      // Canvas background tracks data-theme cascade via helix-docs.css —
      // do NOT pin a backgrounds.value default or theme switching freezes.
      backgrounds: { value: undefined },
      theme,
      brand,
      viewport: { value: undefined, isRotated: false },
    };
  })(),

  /**
   * Brand toolbar — populated from the \`brandVerticals\` prompt captured
   * at scaffold time. Each vertical becomes a toolbar entry that sets
   * \`data-brand\` on \`:root\`, allowing per-brand token overrides via
   * \`[data-brand="<key>"] { --\${prefix}-*: ... }\` rules in the
   * consumer's tokens.css. When no verticals were configured we ship
   * single-brand mode and OMIT the toolbar entirely — a Brand control
   * with only a "Default" entry is a dead UI affordance.
   */${
     brandVerticalsList.length > 0
       ? `
  globalTypes: {
    brand: {
      description: 'Active brand override (data-brand on :root)',
      toolbar: {
        title: 'Brand',
        icon: 'paintbrush',
        items: [
          { value: '', title: 'Default' },
${brandToolbarItemsLiteral},
        ].filter((item) => {
          // Honor brand.include/exclude from helix.storybook.config.ts.
          // Default ('' value) is always retained — it's the unbranded baseline.
          if (item.value === '') return true;
          const inc = helixConfig.brand?.include;
          const exc = helixConfig.brand?.exclude ?? [];
          if (exc.includes(item.value)) return false;
          if (inc === 'all' || inc === undefined) return true;
          return inc.includes(item.value);
        }),
        dynamicTitle: true,
      },
    },
  },`
       : ''
   }

  decorators: [
    // Global padding so stories do not render edge-to-edge. Padding is
    // token-driven (\`--hx-space-04\`) so brand-token overrides reshape
    // the canvas spacing automatically. Stories that need full-bleed
    // (banners, full-page layouts) opt out via
    // \`parameters: { layout: 'fullscreen' }\` — Storybook's built-in
    // layout parameter bypasses decorators that wrap the story root.
    (story, ctx) => {
      if (ctx.parameters?.layout === 'fullscreen') return story();
      return html\`<div style="padding: var(--hx-space-04, 1rem);">\${story()}</div>\`;
    },

    // Theme switching via data-theme attribute on <html>. HELIX_THEME_MODES
    // is the single source of truth — kept in sync with manager-theme.ts.
    withThemeByDataAttribute({
      themes: Object.fromEntries(HELIX_THEME_MODES.map((m) => [m, m])) as Record<
        (typeof HELIX_THEME_MODES)[number],
        (typeof HELIX_THEME_MODES)[number]
      >,
      defaultTheme: 'light',
      attributeName: 'data-theme',
    }),

    // Brand persistence. Writes (theme, brand) to localStorage so the
    // FOUC-prevention scripts in manager-head.html + preview-head.html
    // can pre-paint on subsequent loads.
    (story, ctx) => {
      const brand = (ctx.globals.brand as string) ?? '';
      const theme = (ctx.globals.theme as string) ?? 'light';
      if (typeof document !== 'undefined') {
        if (brand) document.documentElement.setAttribute('data-brand', brand);
        else document.documentElement.removeAttribute('data-brand');
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('helix:storybook:globals', JSON.stringify({ theme, brand }));
        } catch {
          /* storage disabled — URL globals param remains source of truth */
        }
      }
      return story();
    },
  ],
};

export default preview;
`,
  );

  // ── .storybook/manager-theme.ts ──────────────────────────────────────────
  //
  // Phase 3c — token-driven Storybook chrome themes (light / dark / high-
  // contrast). Reads from @helixui/tokens at module evaluation, walks the
  // semantic → primitive cascade via resolveTokenRef, and feeds resolved
  // hex values into Storybook's create() ThemeVars. The previous hard-
  // coded #0066cc primary was wrong — Helix's primary-600 resolves to
  // #0F7078 in light mode. This module makes that drift impossible.

  await safeWriteFile(
    path.join(storybookDir, 'manager-theme.ts'),
    `/**
 * Storybook manager + preview theme bridge.
 *
 * Single source of truth for the three Helix theme modes (light, dark,
 * high-contrast) + the resolved hex values used by:
 *
 *  - \`preview.ts\` parameters.backgrounds  (per-mode surface tints)
 *  - \`manager.ts\`                          (Storybook chrome create() themes)
 *  - addon-themes preview decorator        (data-theme attribute)
 *
 * Token values are pulled at build time from @helixui/tokens. Var() chains
 * are walked to a concrete hex via \`resolveTokenRef\`, so anything that
 * resolves to a primitive ramp value lands as a real color in Storybook's
 * theme keys (Storybook's create() does not understand CSS custom properties).
 */

import { tokenEntries, darkTokenEntries, highContrastTokenEntries } from '@helixui/tokens';
import { resolveTokenRef } from '@helixui/tokens/utils';
import { create, type ThemeVars } from 'storybook/theming';

export const HELIX_THEME_MODES = ['light', 'dark', 'high-contrast'] as const;
export type HelixThemeMode = (typeof HELIX_THEME_MODES)[number];

const lightMap: Record<string, string> = Object.fromEntries(
  tokenEntries.map((t) => [t.name, t.value]),
);

const darkOverrides: Record<string, string> = Object.fromEntries(
  darkTokenEntries.map((t) => [t.name, t.value]),
);
const highContrastOverrides: Record<string, string> = Object.fromEntries(
  highContrastTokenEntries.map((t) => [t.name, t.value]),
);

function tokenMapForMode(mode: HelixThemeMode): Record<string, string> {
  const layered: Record<string, string> = { ...lightMap };
  if (mode === 'dark') Object.assign(layered, darkOverrides);
  if (mode === 'high-contrast') Object.assign(layered, highContrastOverrides);

  const resolved: Record<string, string> = {};
  for (const [name, value] of Object.entries(layered)) {
    resolved[name] = resolveTokenRef(value, layered);
  }
  return resolved;
}

const tokenMaps: Record<HelixThemeMode, Record<string, string>> = {
  light: tokenMapForMode('light'),
  dark: tokenMapForMode('dark'),
  'high-contrast': tokenMapForMode('high-contrast'),
};

function token(mode: HelixThemeMode, name: string, fallback: string): string {
  const v = tokenMaps[mode][name];
  if (!v) return fallback;
  if (v.startsWith('var(')) return fallback;
  return v;
}

export function helixBackgroundsForMode(
  mode: HelixThemeMode,
): Record<string, { name: string; value: string }> {
  const def = token(mode, '--hx-color-surface-default', '#ffffff');
  const raised = token(mode, '--hx-color-surface-raised', '#f8f9fa');
  const sunken = token(mode, '--hx-color-surface-sunken', '#f1f3f5');
  return {
    [\`surface-default-\${mode}\`]: {
      name: \`surface.default · \${mode}\`,
      value: def,
    },
    [\`surface-raised-\${mode}\`]: {
      name: \`surface.raised · \${mode}\`,
      value: raised,
    },
    [\`surface-sunken-\${mode}\`]: {
      name: \`surface.sunken · \${mode}\`,
      value: sunken,
    },
  };
}

function buildHelixChromeTheme(mode: HelixThemeMode): ThemeVars {
  const isLight = mode === 'light';
  const surfaceDefault = token(mode, '--hx-color-surface-default', '#ffffff');
  const surfaceRaised = token(mode, '--hx-color-surface-raised', '#f8f9fa');
  const surfaceSunken = token(mode, '--hx-color-surface-sunken', '#f1f3f5');
  const textPrimary = token(mode, '--hx-color-text-primary', '#0d1825');
  const textInverse = token(mode, '--hx-color-text-inverse', '#ffffff');
  const textMuted = token(mode, '--hx-color-text-muted', '#6c757d');
  const borderDefault = token(mode, '--hx-color-border-default', '#dee2e6');
  const primary = token(mode, '--hx-color-primary-600', '#0F7078');
  const secondary = token(mode, '--hx-color-secondary-600', '#0F6B7E');

  return create({
    base: isLight ? 'light' : 'dark',

    // Brand
    brandTitle: '${dsTitle} Design System',
    brandUrl: '/',

    // Colors
    colorPrimary: primary,
    colorSecondary: secondary,

    // UI
    appBg: surfaceRaised,
    appContentBg: surfaceDefault,
    appPreviewBg: surfaceDefault,
    appBorderColor: borderDefault,
    appBorderRadius: 6,

    // Text
    textColor: textPrimary,
    textInverseColor: textInverse,
    textMutedColor: textMuted,

    // Toolbar
    barTextColor: textMuted,
    barSelectedColor: primary,
    barHoverColor: primary,
    barBg: surfaceSunken,

    // Inputs
    inputBg: surfaceDefault,
    inputBorder: borderDefault,
    inputTextColor: textPrimary,
    inputBorderRadius: 4,
  });
}

export const helixLightTheme = buildHelixChromeTheme('light');
export const helixDarkTheme = buildHelixChromeTheme('dark');
export const helixHighContrastTheme = buildHelixChromeTheme('high-contrast');

export const helixChromeThemes: Record<HelixThemeMode, ThemeVars> = {
  light: helixLightTheme,
  dark: helixDarkTheme,
  'high-contrast': helixHighContrastTheme,
};

export function coerceThemeMode(value: unknown): HelixThemeMode {
  if (typeof value === 'string' && (HELIX_THEME_MODES as readonly string[]).includes(value)) {
    return value as HelixThemeMode;
  }
  return 'light';
}
`,
  );

  // ── .storybook/manager.ts ────────────────────────────────────────────────
  //
  // Phase 3c — replaces the previous minimal manager.ts with the upstream
  // Helix manager pattern: boot-theme resolution from URL globals → local
  // storage → default light, plus a GLOBALS_UPDATED listener that syncs
  // preview theme switches to manager chrome via addons.setConfig({ theme }).
  // Sidebar IA also collapses engineering roots so the editorial flow
  // (Cover → Overview → Foundations → Patterns) reads top-first.

  await safeWriteFile(
    path.join(storybookDir, 'manager.ts'),
    `import { addons } from 'storybook/manager-api';
import { GLOBALS_UPDATED } from 'storybook/internal/core-events';
import { helixChromeThemes, coerceThemeMode, type HelixThemeMode } from './manager-theme';

/**
 * Resolve the active theme mode at manager boot from the same precedence
 * chain the FOUC-prevention block in \`preview-head.html\` walks:
 *
 *   1. URL \`globals\` param (\`?globals=theme:dark;...\`) — AUTHORITATIVE when
 *      present. Missing keys default; we do not fall through to localStorage.
 *   2. \`localStorage["helix:storybook:globals"]\` — only consulted when the
 *      URL has NO \`globals\` parameter.
 *   3. Fallback: 'light'.
 */
function resolveBootThemeMode(): HelixThemeMode {
  if (typeof window === 'undefined') return 'light';

  let urlHasGlobals = false;
  let urlTheme = '';
  try {
    const url = new URL(window.location.href);
    urlHasGlobals = url.searchParams.has('globals');
    if (urlHasGlobals) {
      const raw = url.searchParams.get('globals') ?? '';
      for (const pair of raw.split(';')) {
        const idx = pair.indexOf(':');
        if (idx === -1) continue;
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        if (k === 'theme') urlTheme = v;
      }
    }
  } catch {
    urlHasGlobals = false;
  }

  if (urlHasGlobals) {
    return coerceThemeMode(urlTheme || undefined);
  }

  try {
    const raw = window.localStorage.getItem('helix:storybook:globals');
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const theme = (parsed as { theme?: unknown }).theme;
        return coerceThemeMode(theme);
      }
    }
  } catch {
    /* storage disabled or JSON broken */
  }

  return 'light';
}

const bootMode: HelixThemeMode = resolveBootThemeMode();

addons.setConfig({
  theme: helixChromeThemes[bootMode],
  sidebar: {
    // Engineering roots collapse by default so editorial flow reads top-down.
    // Drupal omitted from the wc-storybook factory output (consumer-specific).
    collapsedRoots: ['components', 'utilities', 'infrastructure'],
  },
});

let currentMode: HelixThemeMode = bootMode;

addons.register('helix/manager-theme-sync', (api) => {
  const channel = api.getChannel();
  if (!channel) return;

  channel.on(GLOBALS_UPDATED, (event: { globals?: Record<string, unknown> }) => {
    const next = coerceThemeMode(event?.globals?.theme);
    if (next === currentMode) return;
    currentMode = next;
    addons.setConfig({ theme: helixChromeThemes[next] });
  });
});
`,
  );

  // (Phase 3c CSS template copy moved below — runs after the
  // .storybook/docs/ dir is created by the A11yStatusCard emitter.)

  // ── src/base/{ds}-element.ts ─────────────────────────────────────────────

  await safeWriteFile(
    path.join(baseDir, `${ds}-element.ts`),
    `import { HelixElement } from '@helixui/library';

/**
 * Base element for the ${dsTitle} design system.
 * Extends HelixElement to inherit form association, ElementInternals,
 * and ARIA delegation foundation from the HELiX platform.
 *
 * Inheritance chain: ${BaseClass} → HelixElement → LitElement → HTMLElement
 */
export class ${BaseClass} extends HelixElement {}
`,
  );

  // ── src/components/{ds}-button ───────────────────────────────────────────

  // ── src/components/{ds}-button/variants.ts ───────────────────────────────
  //
  // Variant axis values for the button. Generated as a `VARIANT_VALUES` const
  // tuple plus a `Variant` string-union type, NOT a discriminated union
  // (round-2 review D3 finding — discriminated unions force per-variant
  // narrowing on consumers and break Code Connect's `figma.enum('variant', ...)`
  // alignment between runtime values, story options, and Figma axis labels).
  //
  // Source of truth: figma-tokens `embedded-cem.json` → `hx-button.variantAxes`.
  // The 6 values mirror HelixButton's `variant` attribute enum (primary,
  // secondary, tertiary, danger, ghost, outline). The 3 size values mirror
  // the `hx-size` attribute enum (sm, md, lg).
  //
  // The button's stories.ts and styles.ts both consume these constants — keeps
  // the runtime, story args, and bridge layer in lockstep so a future axis
  // expansion only edits one file.

  await safeWriteFile(
    path.join(buttonDir, 'variants.ts'),
    `/**
 * ${dsTitle} button variant axes.
 *
 * Source of truth for the runtime, Storybook \`argTypes\`, and downstream
 * Code Connect alignment. \`as const\` + \`typeof[number]\` produces a plain
 * string union — not a discriminated union (review D3) — so consumers
 * never have to narrow per variant and Storybook \`options\` can read from
 * the same array Figma's \`figma.enum('variant', ...)\` mapping points at.
 *
 * Sourced from figma-tokens embedded-cem.json hx-button.variantAxes.
 * Keep in lockstep with HelixButton's \`variant\` and \`hx-size\` attribute
 * enums in @helixui/library.
 */

export const VARIANT_VALUES = [
  'primary',
  'secondary',
  'tertiary',
  'danger',
  'ghost',
  'outline',
] as const;

export type Variant = (typeof VARIANT_VALUES)[number];

export const SIZE_VALUES = ['sm', 'md', 'lg'] as const;

export type Size = (typeof SIZE_VALUES)[number];
`,
  );

  await safeWriteFile(
    path.join(buttonDir, `${ds}-button.styles.ts`),
    `import { css } from 'lit';
import type { Variant } from './variants.js';

// All 6 variants inherited from HelixButton — re-exported for consumer convenience.
// Backed by VARIANT_VALUES in ./variants.ts so the runtime list, Storybook
// argTypes, and Code Connect figma.enum('variant', ...) stay in lockstep.
export type ButtonVariant = Variant;

/**
 * ${dsTitle} button styles.
 *
 * Bridge layer: maps the ${prefix}-* brand tokens emitted by scripts/build-tokens.ts
 * into the --hx-* variable names HelixButton's shadow DOM CSS reads internally.
 * Applied at :host so it wins over @helixui/library's document-level
 * adoptedStyleSheets (which override any :root declarations in tokens.css).
 *
 * Keep this file reserved for the bridge and any genuinely ${ds}-specific CSS
 * that does not fit the token model.
 */
export const ${ClassName}ButtonStyles = css\`
  :host {
    --hx-color-primary-50: var(${prefix}-color-primary-50);
    --hx-color-primary-100: var(${prefix}-color-primary-100);
    --hx-color-primary-200: var(${prefix}-color-primary-200);
    --hx-color-primary-300: var(${prefix}-color-primary-300);
    --hx-color-primary-400: var(${prefix}-color-primary-400);
    --hx-color-primary-500: var(${prefix}-color-primary-500);
    --hx-color-primary-600: var(${prefix}-color-primary-600);
    --hx-color-primary-700: var(${prefix}-color-primary-700);
    --hx-color-primary-800: var(${prefix}-color-primary-800);
    --hx-color-primary-900: var(${prefix}-color-primary-900);
    --hx-color-primary-950: var(${prefix}-color-primary-950);

    --hx-color-neutral-0: var(${prefix}-color-neutral-0, #ffffff);
    --hx-color-neutral-50: var(${prefix}-color-neutral-50);
    --hx-color-neutral-100: var(${prefix}-color-neutral-100);
    --hx-color-neutral-200: var(${prefix}-color-neutral-200);
    --hx-color-neutral-300: var(${prefix}-color-neutral-300);
    --hx-color-neutral-400: var(${prefix}-color-neutral-400);
    --hx-color-neutral-500: var(${prefix}-color-neutral-500);
    --hx-color-neutral-600: var(${prefix}-color-neutral-600);
    --hx-color-neutral-700: var(${prefix}-color-neutral-700);
    --hx-color-neutral-800: var(${prefix}-color-neutral-800);
    --hx-color-neutral-900: var(${prefix}-color-neutral-900);

    --hx-color-error-500: var(${prefix}-color-error-500);
    --hx-color-error-600: var(${prefix}-color-error-600);

    /* ── Two-level var() fallback for component-tier hooks ─────────────────
     *
     * Pattern (mirrors hx-button's own @cssprop defaults at hx-button.ts:38–79):
     *   --hx-{component}-{prop}:
     *     var(${prefix}-{component}-{prop},
     *         var(${prefix}-color-action-{role}-{state}))
     *
     * Result — consumer overrides compose:
     *   - Set ${prefix}-button-bg (component-tier) to recolor only this button.
     *   - Set ${prefix}-color-action-primary-bg (semantic-tier) to recolor every
     *     primary action surface across the system; the button picks it up via
     *     the inner var() fallback unless the component-tier hook is also set.
     *
     * The component-tier name has to be provided as a fallback (not just bound
     * to itself) because Helix internal CSS reads --hx-button-bg directly,
     * and the bridge has to satisfy both rebinding paths in one declaration.
     */
    --hx-button-bg: var(${prefix}-button-bg, var(${prefix}-color-action-primary-bg));
    --hx-button-hover-bg: var(${prefix}-button-hover-bg, var(${prefix}-color-action-primary-bg-hover));
    --hx-button-active-bg: var(${prefix}-button-active-bg, var(${prefix}-color-action-primary-bg-active));
    --hx-button-color: var(${prefix}-button-color, var(${prefix}-color-text-on-primary));
    --hx-button-border-color: var(${prefix}-button-border-color, var(${prefix}-color-action-secondary-border));
    --hx-button-border-radius: var(${prefix}-button-border-radius, var(${prefix}-border-radius-md));
    --hx-button-font-family: var(${prefix}-button-font-family, var(${prefix}-font-family-sans));
    --hx-button-font-weight: var(${prefix}-button-font-weight, var(${prefix}-font-weight-semibold));
    --hx-button-focus-ring-color: var(${prefix}-button-focus-ring-color, var(${prefix}-focus-ring-color));
  }
\`;
`,
  );

  await safeWriteFile(
    path.join(buttonDir, `${ds}-button.ts`),
    `import { HelixButton } from '@helixui/library';
import { ${ClassName}ButtonStyles } from './${ds}-button.styles.js';

/**
 * ${dsTitle} Button — brand extension of hx-button.
 *
 * TRACK 1 COMPONENT: extends HelixButton directly because @helixui/library
 * exports HelixButton. The full platform API (variants, sizes, slots, parts,
 * form association, loading, href/anchor, keyboard, ARIA) is inherited at zero
 * cost. This component's only job is brand: CSS custom property overrides in
 * ${ds}-button.styles.ts.
 *
 * DO NOT add a render() method, variant logic, or slot definitions here.
 * If you need a component with NO platform counterpart, extend ${BaseClass}
 * from '../../base/${ds}-element.js' instead (Track 2).
 *
 * Inheritance: ${ClassName}Button → HelixButton → LitElement → HTMLElement
 *
 * @summary Brand-styled button. Same API as hx-button, ${dsTitle} tokens applied.
 *
 * @tag ${ds}-button
 *
 * ─── Inherited from HelixButton ───────────────────────────────────────────
 *
 * @attr {'primary'|'secondary'|'tertiary'|'danger'|'ghost'|'outline'} variant
 *   Visual style variant. Default: 'primary'.
 *
 * @attr {'sm'|'md'|'lg'} size
 *   Button size — controls padding and font-size. Default: 'md'.
 *
 * @attr {boolean} disabled
 *   Disables the button. Prevents interaction and form submission.
 *
 * @attr {boolean} loading
 *   Shows spinner, sets aria-busy. Does not set disabled.
 *
 * @attr {'button'|'submit'|'reset'} type
 *   Native button type. Ignored when href is set. Default: 'button'.
 *
 * @attr {string} href
 *   When set, renders an anchor element instead of a button.
 *
 * @attr {string} target
 *   Anchor target. Only used when href is set.
 *
 * @attr {string} name
 *   Form field name submitted via ElementInternals on form submit.
 *
 * @attr {string} value
 *   Form field value submitted via ElementInternals on form submit.
 *
 * @attr {boolean} full
 *   Stretches button to fill container width.
 *
 * @attr {boolean} inverted
 *   Flips colours for dark or gradient backgrounds.
 *
 * @slot - Button label text or content.
 * @slot prefix - Icon or content before the label.
 * @slot suffix - Icon or content after the label.
 *
 * @csspart button  - The native button or anchor element.
 * @csspart label   - The label text wrapper span.
 * @csspart prefix  - The prefix slot container span.
 * @csspart suffix  - The suffix slot container span.
 * @csspart spinner - The loading spinner SVG element.
 *
 * ─── Component-tier CSS hooks (consumer override surface) ─────────────────
 *
 * Each component-tier hook falls back to a semantic action.* token via the
 * two-level var() chain in ${ds}-button.styles.ts. Set the component-tier
 * name to recolor only this button; set the action.* name to recolor every
 * primary action surface across the system.
 *
 * NOTE: JSDoc IS the CEM data layer for Track 1 components. Cross-package
 * CEM inheritance does not auto-resolve, so @cssprop / accessibility
 * metadata blocks are inlined here so @custom-elements-manifest/analyzer
 * surfaces them on this tag. Without these, A11yStatusCard /
 * APGPatternCard render empty for the consumer's button page even though
 * the upstream HelixButton it extends ships full conformance metadata.
 *
 * ─── AAA + APG conformance (inherited from HelixButton 3.3.1) ─────────────
 *
 * @aaaCertified true
 * @aaaCertifiedDate 2026-04-21
 * @ariaPattern button
 * @ariaPatternSource https://www.w3.org/WAI/ARIA/apg/patterns/button/
 * @keyboardActivate Enter, Space
 * @keyboardDisabledSuppresses true
 * @summary Brand-styled button. Inherits the HelixButton AAA contract — focus ring meets 3:1 against any background, label color pair meets 7:1, and click is suppressed when disabled or loading.
 *
 * @cssprop [${prefix}-button-bg=var(${prefix}-color-action-primary-bg)] - Resting fill.
 * @cssprop [${prefix}-button-hover-bg=var(${prefix}-color-action-primary-bg-hover)] - Hover fill.
 * @cssprop [${prefix}-button-active-bg=var(${prefix}-color-action-primary-bg-active)] - Pressed fill.
 * @cssprop [${prefix}-button-color=var(${prefix}-color-text-on-primary)] - Foreground color.
 * @cssprop [${prefix}-button-border-color=var(${prefix}-color-action-secondary-border)] - Border color.
 * @cssprop [${prefix}-button-border-radius=var(${prefix}-border-radius-md)] - Border radius.
 * @cssprop [${prefix}-button-font-family=var(${prefix}-font-family-sans)] - Font family.
 * @cssprop [${prefix}-button-font-weight=var(${prefix}-font-weight-semibold)] - Font weight.
 * @cssprop [${prefix}-button-focus-ring-color=var(${prefix}-focus-ring-color)] - Focus ring color.
 *
 * ─── Semantic action.* tier (system-wide override surface) ────────────────
 *
 * @cssprop [${prefix}-color-action-primary-bg] - Primary resting fill (3.2.1 semantic).
 * @cssprop [${prefix}-color-action-primary-bg-hover] - Primary hover fill.
 * @cssprop [${prefix}-color-action-primary-bg-active] - Primary pressed fill.
 * @cssprop [${prefix}-color-action-primary-bg-inverted-hover] - Primary hover fill on dark.
 * @cssprop [${prefix}-color-action-secondary-bg] - Secondary resting fill.
 * @cssprop [${prefix}-color-action-secondary-bg-hover] - Secondary hover fill.
 * @cssprop [${prefix}-color-action-secondary-border] - Secondary outline border.
 * @cssprop [${prefix}-color-action-ghost-bg-hover] - Ghost hover fill.
 * @cssprop [${prefix}-color-action-danger-bg] - Danger resting fill.
 * @cssprop [${prefix}-color-action-danger-bg-hover] - Danger hover fill.
 * @cssprop [${prefix}-color-action-danger-bg-active] - Danger pressed fill.
 * @cssprop [${prefix}-color-text-on-primary] - Foreground for primary fill (AA-tuned).
 * @cssprop [${prefix}-color-text-on-primary-strong] - White override for primary-{600,700} fills.
 * @cssprop [${prefix}-color-text-on-error] - Foreground for danger fill.
 * @cssprop [${prefix}-color-text-on-error-strong] - White override for error-{600,700} fills.
 *
 * ─── Helix-internal hooks (advanced — bridge already maps these) ──────────
 *
 * @cssprop [--hx-button-inverted-color] - Text color when inverted.
 * @cssprop [--hx-button-inverted-ghost-hover-bg] - Ghost hover bg when inverted.
 * @cssprop [--hx-button-inverted-focus-ring-color] - Focus ring when inverted.
 *
 * @fires {CustomEvent<{originalEvent: MouseEvent}>} hx-click
 *   Dispatched when clicked and neither disabled nor loading.
 */
export class ${ClassName}Button extends HelixButton {
  static styles = [...HelixButton.styles, ${ClassName}ButtonStyles];
}

// Guard against duplicate registration during Storybook HMR and module re-evaluation
if (!customElements.get('${ds}-button')) {
  customElements.define('${ds}-button', ${ClassName}Button);
}

declare global {
  interface HTMLElementTagNameMap {
    '${ds}-button': ${ClassName}Button;
  }
}
`,
  );

  await safeWriteFile(
    path.join(buttonDir, `${ds}-button.stories.ts`),
    `import type { Meta, StoryObj } from '@storybook/web-components';
import { expect } from 'storybook/test';
import { html } from 'lit';
import './${ds}-button.js';
import type { ${ClassName}Button } from './${ds}-button.js';
// Read from variants.ts so Storybook argTypes options align with the runtime
// Variant/Size unions AND with Code Connect's figma.enum() mappings. Editing
// the variant set in one place propagates to runtime, stories, and Figma.
import { VARIANT_VALUES, SIZE_VALUES } from './variants.js';

const meta: Meta<${ClassName}Button> = {
  title: 'Components/${ClassName}Button',
  component: '${ds}-button',
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: [...VARIANT_VALUES],
    },
    size: {
      control: { type: 'select' },
      options: [...SIZE_VALUES],
    },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
  args: {
    variant: 'primary',
    size: 'md',
    disabled: false,
    loading: false,
  },
};

export default meta;
type Story = StoryObj<${ClassName}Button>;

export const Primary: Story = {
  args: { variant: 'primary' },
  render: ({ variant, size, disabled, loading }) =>
    html\`<${ds}-button variant=\${variant} hx-size=\${size} ?disabled=\${disabled} ?loading=\${loading}>Primary</${ds}-button>\`,
  play: async ({ canvasElement }) => {
    // Query the host element directly. Testing Library's findByRole does
    // not pierce shadow DOM, but the rendered \`<${ds}-button>\` host is
    // queryable in the canvas light DOM. Component-level a11y assertions
    // (role, aria-busy, focus ring) belong in component-tier tests.
    const button = canvasElement.querySelector('${ds}-button');
    await expect(button).toBeInTheDocument();
    await expect(button).not.toHaveAttribute('disabled');
  },
};

export const Secondary: Story = {
  args: { variant: 'secondary' },
  render: ({ variant, size, disabled, loading }) =>
    html\`<${ds}-button variant=\${variant} hx-size=\${size} ?disabled=\${disabled} ?loading=\${loading}>Secondary</${ds}-button>\`,
};

export const Tertiary: Story = {
  args: { variant: 'tertiary' },
  render: ({ variant, size, disabled, loading }) =>
    html\`<${ds}-button variant=\${variant} hx-size=\${size} ?disabled=\${disabled} ?loading=\${loading}>Tertiary</${ds}-button>\`,
};

export const Danger: Story = {
  args: { variant: 'danger' },
  render: ({ variant, size, disabled, loading }) =>
    html\`<${ds}-button variant=\${variant} hx-size=\${size} ?disabled=\${disabled} ?loading=\${loading}>Danger</${ds}-button>\`,
};

export const Ghost: Story = {
  args: { variant: 'ghost' },
  render: ({ variant, size, disabled, loading }) =>
    html\`<${ds}-button variant=\${variant} hx-size=\${size} ?disabled=\${disabled} ?loading=\${loading}>Ghost</${ds}-button>\`,
};

export const Outline: Story = {
  args: { variant: 'outline' },
  render: ({ variant, size, disabled, loading }) =>
    html\`<${ds}-button variant=\${variant} hx-size=\${size} ?disabled=\${disabled} ?loading=\${loading}>Outline</${ds}-button>\`,
};

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true },
  render: ({ variant, size }) =>
    html\`<${ds}-button variant=\${variant} hx-size=\${size} disabled>Disabled</${ds}-button>\`,
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector('${ds}-button');
    await expect(button).toHaveAttribute('disabled');
  },
};

export const Loading: Story = {
  args: { variant: 'primary', loading: true },
  render: ({ variant, size }) =>
    html\`<${ds}-button variant=\${variant} hx-size=\${size} loading>Saving…</${ds}-button>\`,
};

export const AllVariants: Story = {
  render: () => html\`
    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 1rem;">
      <${ds}-button variant="primary">Primary</${ds}-button>
      <${ds}-button variant="secondary">Secondary</${ds}-button>
      <${ds}-button variant="tertiary">Tertiary</${ds}-button>
      <${ds}-button variant="danger">Danger</${ds}-button>
      <${ds}-button variant="ghost">Ghost</${ds}-button>
      <${ds}-button variant="outline">Outline</${ds}-button>
    </div>
  \`,
  play: async ({ canvasElement }) => {
    const buttons = canvasElement.querySelectorAll('${ds}-button');
    await expect(buttons).toHaveLength(6);
  },
};

export const AllSizes: Story = {
  render: () => html\`
    <div style="display: flex; align-items: center; gap: 0.75rem; padding: 1rem;">
      <${ds}-button variant="primary" hx-size="sm">Small</${ds}-button>
      <${ds}-button variant="primary" hx-size="md">Medium</${ds}-button>
      <${ds}-button variant="primary" hx-size="lg">Large</${ds}-button>
    </div>
  \`,
  play: async ({ canvasElement }) => {
    const buttons = canvasElement.querySelectorAll('${ds}-button');
    await expect(buttons).toHaveLength(3);
  },
};
`,
  );

  // ── src/stories/_catalog-helpers.ts ──────────────────────────────────────
  // Pure utilities for walking @helixui/library's custom-elements.json and
  // deriving Storybook metadata. Consumer-editable: fork this file to apply
  // your own tier classification, arg-types policy, or exclusion rules.

  await safeWriteFile(
    path.join(storiesDir, '_catalog-helpers.ts'),
    `/**
 * Catalog helpers — read the Helix custom-elements manifest and classify
 * components for Storybook display. See Figma Build Spec §5–§7 for the
 * source-of-truth tier / exclusion rules.
 */

export interface CemAttribute {
  name: string;
  fieldName?: string;
  type?: { text?: string };
  default?: string;
  description?: string;
}

export interface CemDeclaration {
  kind?: string;
  name?: string;
  tagName?: string;
  customElement?: boolean;
  attributes?: CemAttribute[];
  cssProperties?: Array<{ name: string; description?: string; default?: string }>;
  slots?: Array<{ name: string; description?: string }>;
  description?: string;
}

export interface CemModule {
  kind?: string;
  path?: string;
  declarations?: CemDeclaration[];
}

export interface Cem {
  schemaVersion?: string;
  modules?: CemModule[];
}

export type Tier = 'atoms' | 'molecules' | 'organisms';

/** Yield every custom-element declaration in the manifest. */
export function walkCem(cem: Cem): CemDeclaration[] {
  const out: CemDeclaration[] = [];
  for (const mod of cem.modules ?? []) {
    for (const decl of mod.declarations ?? []) {
      if (decl.customElement && decl.tagName) out.push(decl);
    }
  }
  return out;
}

/**
 * Heuristic tier classification per Build Spec §7. Unrecognized tags default
 * to 'molecules' so they show up somewhere sensible rather than being hidden.
 */
export function classifyTier(decl: CemDeclaration): Tier {
  const tag = decl.tagName ?? '';
  const atoms = new Set([
    'hx-button',
    'hx-badge',
    'hx-icon',
    'hx-avatar',
    'hx-chip',
    'hx-tag',
    'hx-link',
    'hx-divider',
    'hx-spinner',
    'hx-progress',
    'hx-skeleton',
    'hx-kbd',
    'hx-label',
    'hx-text',
    'hx-heading',
  ]);
  const organisms = new Set([
    'hx-dialog',
    'hx-drawer',
    'hx-sidebar',
    'hx-data-table',
    'hx-table',
    'hx-tabs',
    'hx-stepper',
    'hx-wizard',
    'hx-navigation',
    'hx-app-shell',
    'hx-page-header',
    'hx-banner',
    'hx-hero',
    'hx-card',
  ]);
  if (atoms.has(tag)) return 'atoms';
  if (organisms.has(tag)) return 'organisms';
  return 'molecules';
}

/**
 * HIPAA-adjacent exclusion — a tag is redacted if its name matches any of the
 * protected-health patterns per Build Spec §5. Consumers may fork this file
 * to widen or narrow the regex.
 */
export function isHipaaAdjacent(tag: string): boolean {
  return /phi|pii|protected|sensitive/i.test(tag);
}

/**
 * Derive Storybook argTypes from CEM attributes. Enum unions become selects,
 * booleans become checkboxes, labelly strings become text inputs, everything
 * else is dropped from controls (still shown in docs).
 */
export function deriveArgTypes(
  decl: CemDeclaration,
): Record<string, unknown> {
  const argTypes: Record<string, unknown> = {};
  for (const attr of decl.attributes ?? []) {
    const name = attr.fieldName ?? attr.name;
    const text = attr.type?.text ?? '';
    // enum union — split on |, strip quotes/whitespace
    if (text.includes('|') && /'[^']+'/.test(text)) {
      const options = Array.from(text.matchAll(/'([^']+)'/g)).map((m) => m[1]);
      argTypes[name] = { control: { type: 'select' }, options };
      continue;
    }
    if (text === 'boolean') {
      argTypes[name] = { control: 'boolean' };
      continue;
    }
    if (
      text === 'string' &&
      /label|heading|title|placeholder|helper|hint|error|content|text/i.test(name)
    ) {
      argTypes[name] = { control: 'text' };
      continue;
    }
    // default: docs-only, no control
    argTypes[name] = { table: { category: 'attributes' } };
  }
  return argTypes;
}

/**
 * Derive default args from CEM defaults. Strips surrounding single quotes the
 * analyzer emits for literal strings, and ignores the literal strings
 * 'undefined' / 'null' which the analyzer emits when a property has no
 * declared default — emitting them verbatim caused stories to render
 * \`count="undefined"\` which the badge then coerced to NaN.
 */
export function deriveArgs(decl: CemDeclaration): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const attr of decl.attributes ?? []) {
    const name = attr.fieldName ?? attr.name;
    if (attr.default === undefined) continue;
    const raw = attr.default;
    // CEM analyzer emits the literal string "undefined" / "null" when a
    // TS field has no initializer. Treat those as "no default" so the
    // generated story doesn't render \`<hx-badge count="undefined">\`.
    if (raw === 'undefined' || raw === 'null') continue;
    if (raw === 'true') args[name] = true;
    else if (raw === 'false') args[name] = false;
    else if (/^'[^']*'$/.test(raw)) args[name] = raw.slice(1, -1);
    else if (/^\\d+$/.test(raw)) args[name] = Number(raw);
    else args[name] = raw;
  }
  return args;
}
`,
  );

  // ── src/stories/_slot-props.ts ───────────────────────────────────────────
  //
  // Layout Rule 13 — INSTANCE_SWAP slot prop naming convention.
  //
  // Figma INSTANCE_SWAP slot names (`Action 1`, `Item 2`, `Header Cell 3`)
  // map to TypeScript / Lit reactive-property names via:
  //
  //     slot-name → kebab-case → camelCase
  //
  //     'Action 1'      → 'action-1'      → 'action1'
  //     'Item 2'        → 'item-2'        → 'item2'
  //     'Header Cell 3' → 'header-cell-3' → 'headerCell3'
  //
  // This file is the single source of truth for that mapping in the
  // scaffolded project. Component generators (when they fan out compounds
  // with slot props) MUST call \`slotNameToProp()\` so the same algorithm
  // produces names everywhere. Keep this in lockstep with the figma-tokens
  // plugin's \`declareSwapSlot\` helper — round-trip integrity depends on it.
  //
  // Source: Layout Rules — Renderer & Component Authoring Contract, Rule 13
  // (figma-dx-specialist 5/5 review round-2 D2).

  await safeWriteFile(
    path.join(storiesDir, '_slot-props.ts'),
    `/**
 * Layout Rule 13 — INSTANCE_SWAP slot prop naming convention.
 *
 * Figma slot names map to TypeScript / Lit prop names via:
 *
 *     slot-name → kebab-case → camelCase
 *
 *     'Action 1'      → 'action-1'      → 'action1'
 *     'Item 2'        → 'item-2'        → 'item2'
 *     'Header Cell 3' → 'header-cell-3' → 'headerCell3'
 *
 * REJECTED ALTERNATIVES (do not introduce):
 *   - \`primaryAction\`  — semantic per-component translation does not
 *     scale across the ~35 compound components in the kit and loses the
 *     positional contract Code Connect needs (\`figma.children('Action 1')\`).
 *   - \`action1Slot\`     — \`Slot\` suffix is redundant; the prop type
 *     already conveys it.
 *   - \`actions: Item[]\` — Figma exposes discrete \`Action 1\` / \`Action 2\`
 *     INSTANCE_SWAP slots; an array prop loses Code Connect's discrete
 *     mapping.
 *
 * OPEN-SLOT COMPOUNDS (grid, stack, container, popup, popover, tooltip —
 * anywhere the CEM declares an unnamed default \`<slot>\`) use slot name
 * \`Items\` mapping to React \`children\` / Lit default slot.
 *
 * Keep in lockstep with the figma-tokens plugin's \`declareSwapSlot\`
 * helper. Round-trip integrity (Figma → tokens.json → scaffold → Code
 * Connect) depends on identical naming on both sides.
 */

/** Open-slot compounds collapse their unnamed CEM slot to this name. */
export const OPEN_SLOT_PROP = 'children';

/** Figma slot label that maps to the open-slot prop. */
export const OPEN_SLOT_FIGMA_NAME = 'Items';

/**
 * Convert a Figma slot label to the kebab-case intermediate.
 * Strips runs of non-alphanumerics and collapses them to single hyphens.
 */
export function slotNameToKebab(slotName: string): string {
  return slotName
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * Convert a kebab-case slot identifier to the camelCase TypeScript prop
 * name. Pure string transform — no semantic substitution.
 */
export function kebabToCamel(kebab: string): string {
  return kebab.replace(/-([a-z0-9])/g, (_match, ch: string) => ch.toUpperCase());
}

/**
 * Canonical slot-name → prop-name pipeline (Layout Rule 13).
 *
 * The unnamed-default-slot case (\`Items\`) collapses to \`children\` so the
 * prop matches the React \`children\` / Lit default-slot ergonomic.
 */
export function slotNameToProp(slotName: string): string {
  if (slotName.trim() === OPEN_SLOT_FIGMA_NAME) return OPEN_SLOT_PROP;
  return kebabToCamel(slotNameToKebab(slotName));
}

/**
 * Bulk variant — derive the prop map for every slot on a compound.
 * Returns \`{ [slotName]: propName }\` so generators can iterate without
 * rebuilding the lookup at every call site.
 */
export function slotPropMap(slotNames: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const slot of slotNames) out[slot] = slotNameToProp(slot);
  return out;
}
`,
  );

  // ── src/stories/HelixCatalog.stories.ts ──────────────────────────────────
  // Runtime CEM catalog: imports @helixui/library for side-effects (registers
  // every hx-* element on customElements), reads the shipped custom-elements.json,
  // and fans out one Storybook meta + Story per non-excluded declaration. No
  // generated files are committed — the sidebar populates at dev-server start.

  await safeWriteFile(
    path.join(storiesDir, 'HelixCatalog.stories.ts'),
    `import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
// Side-effect import — registers every hx-* element on customElements.
import '@helixui/library';
// Direct JSON import — Vite resolves the manifest shipped at the package root
// of @helixui/library 3.0.0 (package.json "files" includes custom-elements.json).
import cem from '@helixui/library/custom-elements.json';
import {
  walkCem,
  classifyTier,
  isHipaaAdjacent,
  type Cem,
} from './_catalog-helpers.js';
import helixConfig from '../../helix.storybook.config';

/**
 * HELiX catalog overview — lists every non-excluded hx-* component grouped by
 * tier (atoms / molecules / organisms) with a single placeholder render of
 * each. Individual per-component .stories.ts files are generated by
 * \`pnpm cem:catalog\` (see scripts/generate-catalog.ts) which walks
 * @helixui/library's custom-elements.json and emits one file per tag into
 * src/stories/catalog/. Run it once after install; rerun after upgrading
 * @helixui/library.
 *
 * This overview story stays runtime-driven so new Helix components appear
 * automatically without regenerating. The per-component stories drive the
 * detailed sidebar entries and autodocs pages.
 *
 * Build Spec references: §5 (HIPAA redaction), §7 (tier classification).
 */

// Honor helix.storybook.config.ts components.include / exclude so the
// overview stays in sync with the per-component catalog stories generated
// by scripts/generate-catalog.ts. Without this, removing hx-button via
// config still left it on the overview page even though its docs page
// disappeared from the sidebar.
const componentsConfig = helixConfig.components ?? { include: 'all', exclude: [] };
function shouldIncludeOverviewTag(tag: string): boolean {
  if (componentsConfig.exclude.includes(tag)) return false;
  if (componentsConfig.include === 'all') return true;
  return componentsConfig.include.includes(tag);
}
const declarations = walkCem(cem as Cem)
  .filter((d) => d.tagName && !isHipaaAdjacent(d.tagName))
  .filter((d) => shouldIncludeOverviewTag(d.tagName!))
  .sort((a, b) => a.tagName!.localeCompare(b.tagName!));

const byTier = {
  atoms: declarations.filter((d) => classifyTier(d) === 'atoms'),
  molecules: declarations.filter((d) => classifyTier(d) === 'molecules'),
  organisms: declarations.filter((d) => classifyTier(d) === 'organisms'),
};

const meta: Meta = {
  title: 'HELiX/Catalog Overview',
  tags: ['autodocs'],
  // Tell Storybook's indexer that __catalogTagNames is a NON-story export
  // (data for tests/tooling). Without this, Storybook tries to render the
  // string array as a story and the page errors with
  // "component annotation is missing from the default export".
  excludeStories: ['__catalogTagNames'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Every non-excluded hx-* component from @helixui/library, grouped by tier. Run \`pnpm cem:catalog\` to regenerate per-component story files under src/stories/catalog/. HIPAA-adjacent tags are filtered per Figma Build Spec §5.',
      },
    },
  },
};

export default meta;

type Story = StoryObj;

// Phase 5 fix: explicit color bindings on every text node — Storybook's
// docs surface defaults <h1>/<h2>/<div> text to a theme-tracking
// foreground that resolves to WHITE in some light-mode autodocs contexts
// (particularly when the parent docs container's @layer rules invert
// the cascade). Without these explicit \`color: var(--hx-color-text-*)\`
// rules, every component-name chip rendered as white-on-white in light
// mode. Per-mode pairs still flip via the data-theme cascade.
const TEXT_PRIMARY = 'var(--hx-color-text-primary, #0d1825)';
const TEXT_MUTED = 'var(--hx-color-text-muted, #6c757d)';
const SURFACE_DEFAULT = 'var(--hx-color-surface-default, #ffffff)';
const BORDER_SUBTLE = 'var(--hx-color-border-subtle, #dee2e6)';

function renderGroup(label: string, decls: typeof declarations) {
  return html\`
    <section style="margin-bottom: 2rem; color: \${TEXT_PRIMARY};">
      <h2 style="font-family: system-ui; font-size: 1.25rem; margin-bottom: 0.75rem; color: \${TEXT_PRIMARY};">
        \${label} <span style="color: \${TEXT_MUTED}; font-weight: normal;">(\${decls.length})</span>
      </h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem;">
        \${decls.map(
          (d) => html\`
            <div style="padding: 0.75rem; border: 1px solid \${BORDER_SUBTLE}; border-radius: 6px; font-family: ui-monospace, monospace; font-size: 0.8125rem; background: \${SURFACE_DEFAULT}; color: \${TEXT_PRIMARY};">
              \${d.tagName}
            </div>
          \`,
        )}
      </div>
    </section>
  \`;
}

export const Overview: Story = {
  render: () => html\`
    <div style="font-family: system-ui; max-width: 960px; margin: 0 auto; color: \${TEXT_PRIMARY};">
      <h1 style="font-size: 1.5rem; margin-bottom: 0.25rem; color: \${TEXT_PRIMARY};">HELiX component catalog</h1>
      <p style="color: \${TEXT_MUTED}; margin-bottom: 1.5rem;">
        \${declarations.length} components available. Browse individual entries in
        the sidebar under <code>HELiX/atoms</code>, <code>HELiX/molecules</code>,
        and <code>HELiX/organisms</code>.
      </p>
      \${renderGroup('Atoms', byTier.atoms)}
      \${renderGroup('Molecules', byTier.molecules)}
      \${renderGroup('Organisms', byTier.organisms)}
    </div>
  \`,
};

// Exposed for tests and tooling.
export const __catalogTagNames: string[] = declarations.map((d) => d.tagName!);
`,
  );

  // ── src/stories/_components/*.tsx ─────────────────────────────────────────
  // Phase 3a — port two upstream-Helix docs-surface React components that are
  // CEM-free (depend only on props). These pair with each per-component MDX
  // hero scene (Phase 4) so the consumer's docs reads as a brand experience
  // rather than a Storybook autodocs default.
  //
  // Sourced verbatim from helix/apps/storybook/stories/_components/. Both
  // helix and create-helix-app are MIT under the same copyright holder
  // (Clarity House LLC) so the port is licence-clean.
  //
  // CEM-coupled siblings (APGPatternCard, A11yStatusCard, HelixDocsPage) +
  // the manager/preview FOUC-prevention rewrite + the 3 docs CSS files land
  // in Phase 3b — they need the brand-toolbar globalType wiring to read
  // useful, and the manager-theme.ts port carries the most escaping risk.
  // Splitting the React port from the manager/preview infra keeps each
  // commit a sealed, revertable deliverable per the principal-engineer
  // review.

  const componentsDocsDir = path.join(storiesDir, '_components');
  await safeEnsureDir(componentsDocsDir);

  // ── ConsumerObligations.tsx ──────────────────────────────────────────────

  await safeWriteFile(
    path.join(componentsDocsDir, 'ConsumerObligations.tsx'),
    `/**
 * ConsumerObligations — callout listing the consumer-side responsibilities
 * a component cert depends on.
 *
 * The AAA cert for a component is conditional: even when every measured
 * row passes, the consumer can still ship a non-conformant page if they
 * (a) strip the focus ring with author CSS, (b) omit an accessible name
 * on an icon-only instance, or (c) embed the component on a page that
 * itself fails 2.4.2 / 3.1.1 / etc.
 *
 * Renders a strongly-themed warning callout with a list of obligations
 * the docs page author hand-curates. NOT auto-derived — the obligations
 * reflect editorial judgement and live in story source so they evolve
 * with the component contract.
 */
import * as React from 'react';

export interface ConsumerObligationsProps {
  /** Component tag (display only — the obligations are passed via children). */
  tag?: string;
  /** Heading override. */
  heading?: string;
  /** One bullet per obligation. Plain string or rich React node. */
  obligations: ReadonlyArray<string | React.ReactNode>;
}

export function ConsumerObligations({
  tag,
  heading = 'Consumer obligations',
  obligations,
}: ConsumerObligationsProps): React.ReactElement {
  return (
    <aside
      className="hx-docs hx-consumer-obligations"
      role="note"
      aria-label={tag ? \`Consumer obligations for \${tag}\` : 'Consumer obligations'}
    >
      <header className="hx-consumer-obligations-header">
        <span className="hx-consumer-obligations-icon" aria-hidden="true">
          ⚠
        </span>
        <h3 className="hx-consumer-obligations-title">{heading}</h3>
      </header>
      <p className="hx-consumer-obligations-intro">
        For the AAA verdicts above to hold in real-world deployment, the consumer{' '}
        <strong>must</strong>:
      </p>
      <ul className="hx-consumer-obligations-list">
        {obligations.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </aside>
  );
}
`,
  );

  // ── InlineAuditPanel.tsx ─────────────────────────────────────────────────
  // Phase 1 of the shimmying-roaming-kernighan plan replaced the prior
  // live-port InlineAuditPanel with a no-op opt-in stub. Upstream Helix's
  // panel reads an AAA-AUDIT.md per-component via Vite's `?raw` import
  // from `packages/hx-library/`, which is monorepo-internal and doesn't
  // survive a fresh-scaffold install. The stub renders `null` unless the
  // consumer passes their own `markdown` prop; existing MDX imports keep
  // working unchanged. See src/scaffold/wc-storybook/audit-stub.ts.

  await safeWriteFile(
    path.join(componentsDocsDir, 'InlineAuditPanel.tsx'),
    inlineAuditPanelStubSrc(),
  );

  // ── Helper components ported from helix/apps/storybook/stories/_components/
  // Phase 1 of the shimmying-roaming-kernighan plan. Both helix and
  // create-helix-app are MIT under the same copyright holder (Clarity
  // House LLC); the port is licence-clean. Each helper is small, pure,
  // and CEM-free — drop-ins for the editorial-depth MDX pages that
  // Phases 2-4 will emit. Sources live in
  // `src/scaffold/wc-storybook/helpers.ts`.

  await safeWriteFile(path.join(componentsDocsDir, 'contrast.ts'), contrastSrc());
  await safeWriteFile(path.join(componentsDocsDir, 'useResolvedToken.ts'), useResolvedTokenSrc());
  await safeWriteFile(path.join(componentsDocsDir, 'RatioCard.tsx'), ratioCardSrc());
  await safeWriteFile(path.join(componentsDocsDir, 'TokenSwatchGrid.tsx'), tokenSwatchGridSrc());
  await safeWriteFile(path.join(componentsDocsDir, 'TokenRef.tsx'), tokenRefSrc());
  await safeWriteFile(path.join(componentsDocsDir, 'CodeBlock.tsx'), codeBlockSrc());
  await safeWriteFile(path.join(componentsDocsDir, 'CodeTabs.tsx'), codeTabsSrc());
  await safeWriteFile(path.join(componentsDocsDir, 'ContrastMatrix.tsx'), contrastMatrixSrc());

  // ── Editorial layout primitives (Phase 3) ────────────────────────────────
  // Tiny pure-React presentational helpers consumed by the accessibility
  // narrative MDXes (EyebrowHeading title block, SectionHead dividers,
  // StatCard stat rows, DocsCard split-content cards). Lifted from
  // helix/apps/storybook/stories/_components/ alongside the Phase 1 set.
  // DocsCard adapted to accept body content via `children` instead of the
  // upstream `demo` prop — the narrative MDXes pass paragraphs/lists, not
  // a sealed demo zone.
  await safeWriteFile(path.join(componentsDocsDir, 'EyebrowHeading.tsx'), eyebrowHeadingSrc());
  await safeWriteFile(path.join(componentsDocsDir, 'SectionHead.tsx'), sectionHeadSrc());
  await safeWriteFile(path.join(componentsDocsDir, 'StatCard.tsx'), statCardSrc());
  await safeWriteFile(path.join(componentsDocsDir, 'DocsCard.tsx'), docsCardSrc());

  // ── APGPatternCard.tsx (CEM-coupled, in src/stories/_components/) ────────

  await safeWriteFile(
    path.join(componentsDocsDir, 'APGPatternCard.tsx'),
    `/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * APGPatternCard — surfaces the WAI-ARIA Authoring Practices Guide
 * pattern citation and the keyboard contract pulled from the component's
 * \`helixMeta.ariaPattern\` + \`helixMeta.keyboardContract\` JSDoc tags.
 *
 * The keyboard rows render as <kbd> token clusters so the component
 * contract reads like the APG keyboard tables themselves.
 *
 * Optional \`screenReaderAnnouncement\` prop documents the expected
 * announcement string a screen reader emits for the canonical default
 * state — a practical aid for QA teams running NVDA / JAWS / VoiceOver
 * acceptance tests.
 *
 * Reads from \`@helixui/library/custom-elements.json\` at module load.
 * Returns null when no helixMeta is found for the tag — defensive for
 * consumer-extended components that have not yet authored ARIA pattern
 * + keyboard-contract JSDoc tags.
 */
import * as React from 'react';
// Local CEM contains the consumer's own components (e.g. \`\${ds}-button\`)
// after \`cem analyze\` populates \`<root>/custom-elements.json\` from src/.
// Helix CEM ships every hx-* declaration. We try local first, then fall
// back to Helix — the local manifest is the only source for scaffold-
// emitted conformance pages, while the catalog (HELiX/*) pages need
// Helix as the source of truth.
import localCustomElements from '../../../custom-elements.json';
import helixCustomElements from '@helixui/library/custom-elements.json';

interface KeyboardContract {
  activate?: readonly string[];
  navigate?: readonly string[];
  dismiss?: readonly string[];
  disabledSuppresses?: boolean;
}

interface CemDeclaration {
  tagName?: string;
  helixMeta?: {
    ariaPattern?: string;
    ariaPatternSource?: string;
    keyboardContract?: KeyboardContract;
  };
}

const declCache = new Map<string, CemDeclaration | null>();
function findDeclaration(tag: string): CemDeclaration | null {
  if (declCache.has(tag)) return declCache.get(tag) ?? null;
  for (const cem of [localCustomElements, helixCustomElements] as Array<{
    modules?: Array<{ declarations?: CemDeclaration[] }>;
  }>) {
    for (const mod of cem.modules ?? []) {
      for (const decl of mod.declarations ?? []) {
        if (decl?.tagName === tag) {
          declCache.set(tag, decl);
          return decl;
        }
      }
    }
  }
  declCache.set(tag, null);
  return null;
}

function KbdGroup({ keys }: { keys: readonly string[] }): React.ReactElement {
  return (
    <span className="hx-apg-kbd-group">
      {keys.map((k, i) => (
        <React.Fragment key={\`\${k}-\${i}\`}>
          {i > 0 ? <span className="hx-apg-kbd-sep"> / </span> : null}
          <kbd className="hx-apg-kbd">{k}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

export interface APGPatternCardProps {
  tag: string;
  /** Heading override. */
  heading?: string;
  /** Optional expected screen-reader announcement string for the default state. */
  screenReaderAnnouncement?: string;
  /** Optional override for the screen-reader announcement label. */
  screenReaderContext?: string;
}

export function APGPatternCard({
  tag,
  heading = 'ARIA pattern & keyboard contract',
  screenReaderAnnouncement,
  screenReaderContext = 'When focused, screen readers announce',
}: APGPatternCardProps): React.ReactElement | null {
  const decl = findDeclaration(tag);
  if (!decl) return null;
  const meta = decl.helixMeta ?? {};
  const pattern = meta.ariaPattern;
  const patternUrl = meta.ariaPatternSource;
  const kc = meta.keyboardContract ?? {};

  if (!pattern && !kc.activate && !kc.navigate && !kc.dismiss) {
    return null;
  }

  return (
    <section className="hx-docs hx-apg-card" aria-label={\`ARIA pattern walkthrough for \${tag}\`}>
      <header className="hx-apg-card-header">
        <h3 className="hx-apg-card-title">{heading}</h3>
        {pattern ? (
          <p className="hx-apg-card-subtitle">
            Implements the <code>{pattern}</code> pattern from the W3C WAI-ARIA Authoring Practices
            Guide.{' '}
            {patternUrl ? (
              <a
                className="hx-apg-card-link"
                href={patternUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open APG pattern ↗
              </a>
            ) : null}
          </p>
        ) : null}
      </header>

      <div className="hx-apg-card-body">
        <h4 className="hx-apg-card-section-title">Keyboard contract</h4>
        <ul className="hx-apg-card-keyboard">
          {kc.activate?.length ? (
            <li>
              <KbdGroup keys={kc.activate} />
              <span className="hx-apg-kbd-desc">activates the component</span>
            </li>
          ) : null}
          {kc.navigate?.length ? (
            <li>
              <KbdGroup keys={kc.navigate} />
              <span className="hx-apg-kbd-desc">navigates between items</span>
            </li>
          ) : null}
          {kc.dismiss?.length ? (
            <li>
              <KbdGroup keys={kc.dismiss} />
              <span className="hx-apg-kbd-desc">dismisses / closes</span>
            </li>
          ) : null}
          {kc.disabledSuppresses ? (
            <li className="hx-apg-card-keyboard-note">
              <span className="hx-apg-kbd-desc">
                When <code>disabled</code>, all keyboard activation is suppressed.
              </span>
            </li>
          ) : null}
        </ul>

        {screenReaderAnnouncement ? (
          <>
            <h4 className="hx-apg-card-section-title">Expected screen-reader announcement</h4>
            <p className="hx-apg-card-sr">
              {screenReaderContext}:{' '}
              <q className="hx-apg-card-sr-quote">{screenReaderAnnouncement}</q>
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
`,
  );

  // ── .storybook/docs/A11yStatusCard.tsx + HelixDocsPage.tsx ───────────────
  // Phase 3b — auto-injection container + per-component status card.
  // Lives under .storybook/docs/ (not src/stories/_components/) because
  // they are wired into preview.ts as the global autodocs page (Phase 3c
  // does the wiring; for now they are emitted-but-not-yet-referenced).
  // Consumers can manually import + use them in MDX today.

  const docsContainerDir = path.join(storybookDir, 'docs');
  await safeEnsureDir(docsContainerDir);

  // Phase 5 fix — A11yStatusCard.tsx moved to src/stories/_components/
  // because Vite's import-analysis cannot resolve `../../.storybook/...`
  // imports from MDX files served out of `src/`. HelixDocsPage and
  // aurora-button.mdx both updated to import from `_components/` path.
  // CSS files stay in `.storybook/docs/` (preview.ts imports them as
  // CSS modules, that path resolves fine).
  await safeWriteFile(
    path.join(componentsDocsDir, 'A11yStatusCard.tsx'),
    `/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A11yStatusCard — surfaces helixMeta from the Custom Elements Manifest as a
 * compliance-grade status card on every component docs page.
 *
 * Rendered automatically by the autodocs template wired in
 * \`.storybook/docs/HelixDocsPage.tsx\` (Phase 3c). The card is data-driven:
 * when a component declares \`aaaCertified: true\` (with \`helixMeta.aaa.*\`
 * payload), it renders the green "AAA Certified" headline with criteria
 * chips, audit link, ARIA pattern row, keyboard contract row, and
 * capability badges. Non-certified components fall back to a neutral
 * "AAA — Pending audit" state but still surface ARIA pattern + keyboard
 * contract + capabilities when present so consumer-facing documentation
 * stays useful pre-audit.
 *
 * Source of truth: \`@helixui/library/custom-elements.json\`. Runtime
 * lookups walk all \`javascript-module\` entries → \`declarations[]\` →
 * matching \`tagName\`.
 *
 * Visual language inherits from \`helix-docs.css\` token-driven primitives
 * (no hardcoded colors / spacing). Pair with \`a11y-card.css\` (Phase 3c).
 *
 * Lookup order: local CEM (consumer-extended tags like \`\${ds}-button\`)
 * first, then Helix's upstream CEM. Resolving against Helix alone returned
 * null for every conformance page on a freshly-scaffolded local component.
 */
import * as React from 'react';
import localCustomElements from '../../../custom-elements.json';
import helixCustomElements from '@helixui/library/custom-elements.json';

interface KeyboardContract {
  activate?: readonly string[];
  navigate?: readonly string[];
  dismiss?: readonly string[];
  disabledSuppresses?: boolean;
}

interface AaaPayload {
  certified?: boolean;
  certifiedDate?: string;
  criteria?: readonly string[];
  auditUrl?: string;
}

interface HelixMeta {
  aaa?: AaaPayload;
  keyboardContract?: KeyboardContract;
  ariaPattern?: string;
  ariaPatternSource?: string;
  forcedColorsSupported?: boolean;
  stability?: string;
  since?: string;
  formAssociated?: boolean;
  themeAware?: boolean;
  brandAware?: boolean;
  drupalSdcEligible?: boolean;
  reactWrapperStatus?: string;
  priorityTier?: 'P0' | 'P1' | 'P2' | 'Exempt' | string;
  phiHandles?: boolean;
  clinicalContext?: string;
}

interface CemDeclaration {
  tagName?: string;
  aaaCertified?: boolean;
  aaaCertifiedDate?: string;
  helixMeta?: HelixMeta;
  summary?: string;
}

const declarationCache = new Map<string, CemDeclaration | null>();

function findDeclaration(tag: string): CemDeclaration | null {
  if (declarationCache.has(tag)) {
    return declarationCache.get(tag) ?? null;
  }
  // Local CEM first (consumer's own tags), then Helix.
  for (const cem of [localCustomElements, helixCustomElements] as Array<{
    modules?: Array<{ declarations?: CemDeclaration[] }>;
  }>) {
    for (const mod of cem.modules ?? []) {
      for (const decl of mod.declarations ?? []) {
        if (decl?.tagName === tag) {
          declarationCache.set(tag, decl);
          return decl;
        }
      }
    }
  }
  declarationCache.set(tag, null);
  return null;
}

const PRIORITY_TIER_TOOLTIPS: Record<string, string> = {
  P0: 'P0 — Foundational primitive. AAA-cert is mandatory before release.',
  P1: 'P1 — Common workflow component. AAA-cert is required for healthcare deploys.',
  P2: 'P2 — Convenience or composition layer. AAA-cert is recommended.',
  Exempt: 'Exempt — Component is decorative or internal-only and not subject to AAA cert.',
};

const REPO_BLOB_BASE = 'https://github.com/bookedsolidtech/helix/blob/main/packages/hx-library/';

function humanizeKeyboardContract(kc: KeyboardContract | undefined): string | null {
  if (!kc) return null;
  const parts: string[] = [];
  if (kc.activate?.length) {
    parts.push(\`\${kc.activate.join(' / ')} activates\`);
  }
  if (kc.navigate?.length) {
    parts.push(\`\${kc.navigate.join(' / ')} navigates\`);
  }
  if (kc.dismiss?.length) {
    parts.push(\`\${kc.dismiss.join(' / ')} dismisses\`);
  }
  if (kc.disabledSuppresses) {
    parts.push('disabled suppresses');
  }
  return parts.length ? parts.join(' · ') : null;
}

function formatCertDate(iso: string | undefined): string | null {
  if (!iso) return null;
  return iso;
}

interface CapabilityBadgeProps {
  label: string;
  truthy: boolean;
  valueLabel?: string;
}

function CapabilityBadge({ label, truthy, valueLabel }: CapabilityBadgeProps) {
  if (!truthy && !valueLabel) return null;
  return (
    <span className="hx-a11y-card-cap-badge">
      <span className="hx-a11y-card-cap-label">{label}</span>
      <span className="hx-a11y-card-cap-value">{valueLabel ?? '✓'}</span>
    </span>
  );
}

export interface A11yStatusCardProps {
  /** Component tag name (e.g. "${ds}-button"). */
  tag: string;
}

export function A11yStatusCard({ tag }: A11yStatusCardProps): React.ReactElement | null {
  const decl = findDeclaration(tag);
  if (!decl) return null;

  const meta = decl.helixMeta ?? {};
  const aaa = meta.aaa ?? {};
  const certified = decl.aaaCertified === true || aaa.certified === true;
  const certDate = formatCertDate(decl.aaaCertifiedDate ?? aaa.certifiedDate);
  const criteria = aaa.criteria ?? [];
  const auditUrl = aaa.auditUrl ? \`\${REPO_BLOB_BASE}\${aaa.auditUrl}\` : null;
  const tier = meta.priorityTier ?? null;
  const tierTooltip = tier
    ? (PRIORITY_TIER_TOOLTIPS[tier] ?? \`Priority tier: \${tier}\`)
    : null;
  const keyboardLine = humanizeKeyboardContract(meta.keyboardContract);

  return (
    <aside className="hx-docs hx-a11y-card" data-certified={certified ? 'true' : 'false'}>
      <header className="hx-a11y-card-header">
        <div className="hx-a11y-card-headline">
          <span className="hx-a11y-card-icon" aria-hidden="true">
            {certified ? '✓' : '◷'}
          </span>
          <div className="hx-a11y-card-title-block">
            <h3 className="hx-a11y-card-title">
              {certified ? 'AAA Certified' : 'AAA — Pending audit'}
            </h3>
            {certified && certDate ? (
              <p className="hx-a11y-card-subtitle">
                Certified <time dateTime={certDate}>{certDate}</time> · WCAG 2.1 Level AAA
              </p>
            ) : (
              <p className="hx-a11y-card-subtitle">
                Component has not yet completed the WCAG 2.1 Level AAA audit.
              </p>
            )}
          </div>
        </div>
        {tier ? (
          <span
            className="hx-a11y-card-tier"
            data-tier={tier}
            title={tierTooltip ?? undefined}
            aria-label={tierTooltip ?? \`Priority tier \${tier}\`}
          >
            {tier}
          </span>
        ) : null}
      </header>

      {certified && criteria.length ? (
        <div className="hx-a11y-card-row">
          <span className="hx-a11y-card-row-label">Success Criteria</span>
          <ul className="hx-a11y-card-criteria" aria-label="WCAG success criteria audited">
            {criteria.map((sc) => (
              <li key={sc} className="hx-a11y-card-criterion">
                <code>{sc}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {meta.ariaPattern ? (
        <div className="hx-a11y-card-row">
          <span className="hx-a11y-card-row-label">ARIA Pattern</span>
          <span className="hx-a11y-card-row-value">
            <code>{meta.ariaPattern}</code>
            {meta.ariaPatternSource ? (
              <>
                {' '}
                <a
                  className="hx-a11y-card-link"
                  href={meta.ariaPatternSource}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  W3C APG ↗
                </a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {keyboardLine ? (
        <div className="hx-a11y-card-row">
          <span className="hx-a11y-card-row-label">Keyboard</span>
          <span className="hx-a11y-card-row-value">{keyboardLine}</span>
        </div>
      ) : null}

      <div className="hx-a11y-card-row hx-a11y-card-caps-row">
        <span className="hx-a11y-card-row-label">Capabilities</span>
        <div className="hx-a11y-card-caps">
          <CapabilityBadge label="Forced colors" truthy={meta.forcedColorsSupported === true} />
          <CapabilityBadge label="Form-associated" truthy={meta.formAssociated === true} />
          <CapabilityBadge label="Theme-aware" truthy={meta.themeAware === true} />
          <CapabilityBadge label="Brand-aware" truthy={meta.brandAware === true} />
          <CapabilityBadge label="Drupal SDC" truthy={meta.drupalSdcEligible === true} />
          {meta.reactWrapperStatus ? (
            <CapabilityBadge label="React wrapper" truthy valueLabel={meta.reactWrapperStatus} />
          ) : null}
          {meta.stability ? (
            <CapabilityBadge label="Stability" truthy valueLabel={meta.stability} />
          ) : null}
          {meta.since ? <CapabilityBadge label="Since" truthy valueLabel={meta.since} /> : null}
        </div>
      </div>

      {certified && auditUrl ? (
        <footer className="hx-a11y-card-footer">
          <a
            className="hx-a11y-card-audit-link"
            href={auditUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View full AAA audit →
          </a>
        </footer>
      ) : null}
    </aside>
  );
}
`,
  );

  // ── .storybook/docs/{a11y-card,brand-overrides,helix-docs}.css ───────────
  //
  // Phase 3c — copy the 3 docs-surface CSS files from the create-helix
  // package's bundled assets/wc-storybook/storybook-docs/ directory into
  // the consumer scaffold. These files are too large for inline template-
  // literal emission (2,400 LOC total) and contain CSS custom-property
  // expressions that would require careful escaping otherwise. Static-
  // file copy avoids the escape hazard entirely.

  // Use fileURLToPath to convert import.meta.url into a real OS path.
  // `new URL(...).pathname` returns malformed paths on Windows
  // (`/C:/Users/...`) and percent-encodes spaces (`%20`), which makes
  // every fs.copy() below fail silently and ship stub CSS files. The
  // node:url helper handles platform + encoding correctly.
  const cssTemplatesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'assets',
    'wc-storybook',
    'storybook-docs',
  );
  for (const cssFile of [
    'a11y-card.css',
    'brand-overrides.css',
    'helix-docs.css',
    // Phase 5 fix v2 — narrative-MDX class library so Cover / Overview /
    // foundations / per-component conformance MDX bind through the
    // var(--hx-color-*) cascade instead of inline-styled hardcoded hex.
    // Replaces the inline style={{}} patterns the user flagged as wrong.
    'helix-narrative.css',
  ]) {
    const src = path.join(cssTemplatesDir, cssFile);
    const dest = path.join(docsContainerDir, cssFile);
    try {
      // safeCopyFile honors --dry-run by recording the entry and skipping
      // the actual write. Bare fs.copy() bypassed the dry-run contract
      // and silently wrote CSS to disk during preview commands.
      await safeCopyFile(src, dest);
    } catch {
      // CSS asset missing — emit a stub so the consumer's preview.ts import
      // does not 404. The visual treatment falls back to Storybook defaults
      // until the consumer re-installs create-helix from a build that
      // includes the bundled CSS templates.
      await safeWriteFile(
        dest,
        `/* Placeholder ${cssFile} — bundled CSS template missing from create-helix install. */\n`,
      );
    }
  }

  await safeWriteFile(
    path.join(docsContainerDir, 'HelixDocsPage.tsx'),
    `/**
 * HelixDocsPage — custom autodocs template for every component page.
 *
 * Wire into \`parameters.docs.page\` at the preview level (Phase 3c) so
 * every story tagged \`autodocs\` (which the \`Components/*\` stories use
 * via \`tags: ['autodocs']\`) renders this layout instead of Storybook's
 * default DocsPage.
 *
 * Layout:
 *   <Title />          — story metadata title
 *   <Subtitle />       — story metadata subtitle
 *   <A11yStatusCard /> — AAA cert + helixMeta surface (THE feature)
 *   <Description />    — JSDoc summary from CEM
 *   <Primary />        — primary story canvas
 *   <Controls />       — args table for primary story
 *   <Stories />        — secondary stories (excluding primary)
 *
 * Tag resolution: pulled from \`useOf('meta')\` which returns the resolved
 * meta module export. Adapted for downstream design systems — the tag
 * regex matches ANY custom-element-shaped name (one or more segments
 * separated by dashes), so \`${ds}-button\` resolves the same way
 * \`hx-button\` does upstream.
 */
import * as React from 'react';
import {
  Title,
  Subtitle,
  Description,
  Primary,
  Controls,
  Stories,
  useOf,
} from '@storybook/addon-docs/blocks';
// Phase 5 fix: A11yStatusCard now lives in src/stories/_components/
// because Vite cannot resolve imports into .storybook/ from src/ MDX.
import { A11yStatusCard } from '../../src/stories/_components/A11yStatusCard';
import helixConfig from '../../helix.storybook.config';

function useResolvedTag(): string | null {
  try {
    const meta = useOf('meta', ['meta']);
    const candidate = (meta as { preparedMeta?: { component?: unknown } } | undefined)
      ?.preparedMeta?.component;
    // Custom elements MUST contain a hyphen per the HTML spec, so any
    // string with a dash and lowercase prefix is a candidate. This is
    // the consumer-friendly variant of upstream's hx-only check.
    if (typeof candidate === 'string' && /^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(candidate)) {
      return candidate;
    }
  } catch {
    /* swallow — addon-docs context shape can shift between versions */
  }
  return null;
}

export function HelixDocsPage(): React.ReactElement {
  const tag = useResolvedTag();
  const aaaEnabled = helixConfig.aaa?.enabled !== false;
  return (
    <>
      <Title />
      <Subtitle />
      {tag && aaaEnabled ? <A11yStatusCard tag={tag} /> : null}
      <Description />
      <Primary />
      <Controls />
      <Stories />
    </>
  );
}

export default HelixDocsPage;
`,
  );

  // ── .storybook/manager-head.html + preview-head.html (FOUC scripts) ──────
  // Phase 3b — pre-paint sync scripts. These run BEFORE first paint and
  // resolve theme/brand from URL globals → localStorage → default. The
  // CSS pre-paint block tints the <html> background so dark/HC pages
  // do not flash white on reload. Compatible with the existing minimal
  // preview.ts; Phase 3c expands preview.ts to wire the persistence
  // shadow this script reads from.

  await safeWriteFile(
    path.join(storybookDir, 'manager-head.html'),
    `<meta name="robots" content="noindex, nofollow" />
<!--
  Manager FOUC prevention. The manager chrome (sidebar, toolbar) reads
  the same data-theme attribute the preview iframe uses. Without this
  block, the manager paints in light first, then snaps to dark/high-
  contrast when the manager-theme module loads. Re-uses the same
  resolution chain as the preview: URL globals → localStorage shadow
  → default light.
-->
<script>
  (function () {
    try {
      var html = document.documentElement;
      var theme = '';
      var brand = '';
      // URL globals are AUTHORITATIVE when present — partial keys fall
      // through to defaults (NOT to localStorage). Mirrors the preview-
      // head precedence rule so reload behavior is consistent across
      // manager + preview iframes.
      var urlHasGlobals = false;
      try {
        var url = new URL(window.location.href);
        urlHasGlobals = url.searchParams.has('globals');
        var raw = url.searchParams.get('globals') || '';
        raw.split(';').forEach(function (pair) {
          var idx = pair.indexOf(':');
          if (idx === -1) return;
          var k = pair.slice(0, idx).trim();
          var v = pair.slice(idx + 1).trim();
          if (k === 'theme') theme = v;
          else if (k === 'brand') brand = v;
        });
      } catch (_e) {
        urlHasGlobals = false;
      }
      if (!urlHasGlobals) {
        try {
          var stored = window.localStorage.getItem('helix:storybook:globals');
          if (stored) {
            var parsed = JSON.parse(stored);
            if (!theme && parsed && typeof parsed.theme === 'string') theme = parsed.theme;
            if (!brand && parsed && typeof parsed.brand === 'string') brand = parsed.brand;
          }
        } catch (_e) {
          /* fall through */
        }
      }
      if (!theme) theme = 'light';
      html.setAttribute('data-theme', theme);
      if (brand) html.setAttribute('data-brand', brand);
      else html.removeAttribute('data-brand');
    } catch (_e) {
      /* never throw */
    }
  })();
</script>
<style>
  :root {
    color-scheme: light dark;
  }
  :root[data-theme='dark'],
  :root[data-theme='high-contrast'] {
    color-scheme: dark;
  }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
`,
  );

  await safeWriteFile(
    path.join(storybookDir, 'preview-head.html'),
    `<!--
  FOUC prevention.

  Storybook's \`addon-themes\` decorator runs AFTER first paint, so without
  this block the preview iframe paints once at default-light tokens before
  the persisted theme/brand attributes apply. That produces a visible
  flash on dark/high-contrast pages.

  Resolution rules:
    - If the URL has a \`globals\` parameter at all, it is AUTHORITATIVE:
      we read theme/brand only from URL keys present in that string;
      missing keys default. We do NOT fall back to localStorage in this
      case — otherwise a deep link like \`?globals=theme:dark\` (omitting
      brand) would silently resurrect the previously-stored brand.
    - If the URL has NO \`globals\` parameter, fall through to the
      \`localStorage["helix:storybook:globals"]\` shadow maintained by the
      preview decorators (Phase 3c).
    - Final default: theme='light', no brand.

  The :root background-color is also primed to surface-default so the
  very first paint is at least neutral instead of stark white.
-->
<script>
  (function () {
    try {
      var html = document.documentElement;
      var theme = '';
      var brand = '';
      var urlHasGlobals = false;

      try {
        var url = new URL(window.location.href);
        urlHasGlobals = url.searchParams.has('globals');
        var raw = url.searchParams.get('globals') || '';
        raw.split(';').forEach(function (pair) {
          var idx = pair.indexOf(':');
          if (idx === -1) return;
          var k = pair.slice(0, idx).trim();
          var v = pair.slice(idx + 1).trim();
          if (k === 'theme') theme = v;
          else if (k === 'brand') brand = v;
        });
      } catch (_e) {
        urlHasGlobals = false;
      }

      if (!urlHasGlobals) {
        try {
          var stored = window.localStorage.getItem('helix:storybook:globals');
          if (stored) {
            var parsed = JSON.parse(stored);
            if (!theme && parsed && typeof parsed.theme === 'string') theme = parsed.theme;
            if (!brand && parsed && typeof parsed.brand === 'string') brand = parsed.brand;
          }
        } catch (_e) {
          /* storage disabled or JSON broken */
        }
      }

      if (!theme) theme = 'light';

      html.setAttribute('data-theme', theme);
      if (brand) html.setAttribute('data-brand', brand);
      else html.removeAttribute('data-brand');
    } catch (_e) {
      /* never throw from FOUC-prevention */
    }
  })();
</script>
<style>
  :root {
    color-scheme: light dark;
    background-color: var(--hx-color-surface-default, #ffffff);
  }
  :root[data-theme='dark'] {
    color-scheme: dark;
    background-color: var(--hx-color-surface-default, #0d1825);
  }
  :root[data-theme='high-contrast'] {
    color-scheme: dark;
    background-color: var(--hx-color-surface-default, #000000);
  }
  html,
  body {
    background-color: var(--hx-color-surface-default, #ffffff);
  }
  html[data-theme='dark'],
  html[data-theme='dark'] body {
    background-color: var(--hx-color-surface-default, #0d1825);
  }
  html[data-theme='high-contrast'],
  html[data-theme='high-contrast'] body {
    background-color: var(--hx-color-surface-default, #000000);
  }
</style>

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
`,
  );

  // ── src/stories/components/{ds}-button.mdx ───────────────────────────────
  //
  // Phase 3c — reference per-component MDX with hero scene. Demonstrates
  // the brand-storytelling layer: imports the freshly-emitted React docs
  // cards (A11yStatusCard, APGPatternCard, ConsumerObligations,
  // InlineAuditPanel), pulls the consumer's `brandTagline` (when provided)
  // into the page intro, and uses `heroScenarios[0]` if present, else a
  // cross-domain neutral default per `feedback_realistic_sample_data`.

  const referenceComponentsDir = path.join(storiesDir, 'components');
  await safeEnsureDir(referenceComponentsDir);

  const heroForButton = (options.heroScenarios ?? []).find((s) => s.componentId === `${ds}-button`);
  const heroTitle = escapeMdxText(heroForButton?.title ?? 'Sign in to your workspace');
  const heroBody = escapeMdxText(
    heroForButton?.body ??
      `A primary action lifted into a real product moment — the same ${ds}-button you compose into forms, dashboards, and toolbars.`,
  );
  const taglineLine = options.brandTagline ? `> ${escapeMdxText(options.brandTagline)}\n\n` : '';

  await safeWriteFile(
    path.join(referenceComponentsDir, `${ds}-button.mdx`),
    `import { Meta } from '@storybook/addon-docs/blocks';
import { APGPatternCard } from '../_components/APGPatternCard';
import { ConsumerObligations } from '../_components/ConsumerObligations';
import { A11yStatusCard } from '../_components/A11yStatusCard';

{/* Subroute disambiguator: the .stories.ts file owns Components/${ClassName}Button
    (auto-derived from autodocs); the conformance MDX lives at /Conformance to
    avoid the storybook indexer's "Unable to index" duplicate-title conflict. */}
<Meta title="Components/${ClassName}Button/Conformance" />

# ${ClassName} Button — AAA conformance

${taglineLine}A primary action button extending HELiX's accessible button foundation.
Use it for the dominant call-to-action on a screen.

## Hero scene — ${heroTitle}

{/*
  Hero scene uses real HELiX form atoms (hx-text-input) instead of raw
  <input> — the whole point of demonstrating ${ds}-button is showing how
  it composes with the rest of the platform. hx-text-input owns its own
  label + helper-text + validation states; the consumer doesn't need to
  rebuild that scaffolding on every form. Wrapper styling lives in
  helix-narrative.css under .hx-narrative-hero so this MDX stays clean.
*/}

<div className="hx-narrative-hero">
  <h3>${heroTitle}</h3>
  <p className="hx-narrative-hero-intro">
    ${heroBody.replace(/\n/g, '\n    ')}
  </p>
  <hx-text-input
    label="Email"
    type="email"
    placeholder="you@example.com"
    style={{ display: 'block', marginBottom: '12px' }}
  ></hx-text-input>
  <hx-text-input
    label="Password"
    type="password"
    placeholder="••••••••"
    style={{ display: 'block', marginBottom: '16px' }}
  ></hx-text-input>
  <div className="hx-narrative-hero-actions">
    <${ds}-button variant="primary">Sign in</${ds}-button>
    <${ds}-button variant="ghost">Forgot?</${ds}-button>
  </div>
</div>

## Accessibility status

<A11yStatusCard tag="${ds}-button" />

## ARIA + keyboard contract

<APGPatternCard tag="${ds}-button" />

## Consumer obligations

<ConsumerObligations
  tag="${ds}-button"
  obligations={[
    'Provide an accessible name. The button text content IS the name. Do not strip it for icon-only variants without supplying aria-label.',
    'Do not strip the focus ring. The component ships a token-driven focus ring; author CSS that sets outline:none on the button breaks the AAA-cert.',
    'Use the right semantic role. Submit actions belong inside a <form>; navigation actions should use <a href> or hx-link instead of a button.',
  ]}
/>
`,
  );

  // ── src/stories/components/{ds}-{card,checkbox,dialog,form,select,tabs,text-input}.mdx
  //
  // Phase 2 — port 7 component conformance MDXes from helix/apps/storybook/
  // stories/components/. Each is parameterized by dsName + dsClass so the
  // scaffolded `aurora` design system gets {aurora-card, aurora-form, ...}
  // pages with matching {AuroraCard, ...} class references. Healthcare-vertical
  // demo content was rewritten to cross-domain neutral flows per
  // `feedback_realistic_sample_data`. NO `?raw` AAA-AUDIT.md imports survive
  // the port (audit content is opt-in via the InlineAuditPanel stub from
  // Phase 1). Refs: shimmying-roaming-kernighan plan, Phase 2.
  const componentMdxEmissions = getComponentMdxEmissions({ dsName: ds, dsClass: ClassName });
  for (const emission of componentMdxEmissions) {
    await safeWriteFile(path.join(options.directory, emission.relativePath), emission.content);
  }

  // ── src/stories/accessibility/*.mdx + _snippets.ts ───────────────────────
  // Phase 3 — port 8 accessibility narrative MDXes from helix/apps/storybook/
  // stories/accessibility/ into the new top-level `Accessibility` namespace
  // (storySort entry above). Pages: Dashboard, AAA Story Template, Success
  // Criteria, Consumer Obligations, Keyboard Contracts, Focus Management,
  // Contrast Deep-Dive, Forced Colors. Accompanying `_snippets.ts` carries
  // the CSS / TS code-string constants the MDXes feed into <CodeBlock> /
  // <CodeTabs>. Healthcare-vertical demo content rewritten to neutral
  // SaaS / team-tool examples per `feedback_realistic_sample_data`. NO
  // `?raw` AAA-AUDIT.md imports, NO monorepo-path links survive the port.
  // Refs: shimmying-roaming-kernighan plan, Phase 3.
  await safeEnsureDir(path.join(storiesDir, 'accessibility'));
  const a11yMdxEmissions = getAccessibilityMdxEmissions({ dsName: ds, dsClass: ClassName });
  for (const emission of a11yMdxEmissions) {
    await safeWriteFile(path.join(options.directory, emission.relativePath), emission.content);
  }

  // ── helix.storybook.config.ts ────────────────────────────────────────────
  // Consumer-facing knob for hiding upstream Helix components, docs pages,
  // brand verticals, AAA scenes, and narrative pages. Phase 2 ships the
  // config shape; Phase 3 (AAA scenes) and Phase 4 (narrative IA) consume
  // it. Lives at consumer's project root so designers can edit it without
  // diving into .storybook/.
  await safeWriteFile(
    path.join(options.directory, 'helix.storybook.config.ts'),
    `/**
 * helix.storybook.config.ts
 *
 * Consumer-facing runtime controls for the wc-storybook factory's
 * generated Storybook surface. Edit this file (do NOT edit
 * \`scripts/generate-catalog.ts\` or files under \`src/stories/catalog/\`)
 * to:
 *
 *   - hide upstream Helix components from the generated catalog when
 *     you've extended them locally (e.g. omit hx-button after adding
 *     ${ds}-button) — read by scripts/generate-catalog.ts
 *   - constrain the brand toolbar dropdown to a subset of verticals —
 *     read by .storybook/preview.ts at runtime
 *   - disable the auto-injected AAA status card — read by
 *     .storybook/docs/HelixDocsPage.tsx at runtime
 *
 * Each list accepts \`'all'\` (everything in scope), an explicit allow-list
 * array, or both forms with \`exclude\` overrides. Empty arrays are valid
 * and mean "nothing in scope" — distinct from omitting the field.
 *
 * Note: foundations docs pages (\`src/stories/foundations/*.mdx\`) and
 * narrative shell pages (Cover, Overview, Patterns) are scaffold-time
 * artifacts. To remove them, delete the corresponding .mdx files; they
 * have no runtime gate.
 */

/** Brand verticals supplied at scaffold time (\`brandVerticals\` prompt). */
export type BrandKey = string;

export interface HelixStorybookConfig {
  /** Catalog filter. Drives \`scripts/generate-catalog.ts\`. */
  components: {
    include: 'all' | readonly string[];
    exclude: readonly string[];
  };
  /** Brand toolbar filter. \`'all'\` keeps every vertical from \`brandVerticals\`. */
  brand: {
    include: 'all' | readonly BrandKey[];
    exclude: readonly BrandKey[];
  };
  /** AAA conformance — when false, hides the auto-injected A11yStatusCard. */
  aaa: {
    enabled: boolean;
  };
}

/**
 * Default configuration: everything visible. Override per-key as your
 * design system grows beyond Helix's defaults.
 */
const config: HelixStorybookConfig = {
  components: { include: 'all', exclude: [] },
  brand: { include: 'all', exclude: [] },
  aaa: { enabled: true },
};

export default config;
`,
  );

  // ── scripts/generate-catalog.ts ──────────────────────────────────────────
  // Walks node_modules/@helixui/library/custom-elements.json and emits one
  // .stories.ts file per non-excluded hx-* component into src/stories/catalog/.
  // Run manually or via the \`pnpm cem:catalog\` script wired in package.json.
  //
  // Phase 2 — respects helix.storybook.config.ts \`components.include / exclude\`.
  // The HIPAA-adjacency filter still runs unconditionally (Helix-team policy);
  // consumer config narrows the post-HIPAA list further.

  await safeEnsureDir(path.join(options.directory, 'scripts'));
  await safeWriteFile(
    path.join(options.directory, 'scripts', 'generate-catalog.ts'),
    `#!/usr/bin/env tsx
/**
 * Generate per-component Storybook .stories.ts files from the installed
 * @helixui/library custom-elements manifest. Produces one file per non-
 * excluded hx-* declaration under src/stories/catalog/<tier>/.
 *
 * Invoke with: pnpm cem:catalog
 *
 * Filters (applied in order):
 *   1. HIPAA-adjacency — non-overridable. Removes patient-identifiable
 *      and healthcare-vertical-locked components. Helix-team policy.
 *   2. \`helix.storybook.config.ts\` \`components.include / components.exclude\`
 *      — consumer-facing knob. \`include: 'all'\` is the default. Specify
 *      an array to allow-list, then drop entries via \`exclude\`.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  walkCem,
  classifyTier,
  deriveArgTypes,
  deriveArgs,
  isHipaaAdjacent,
  type Cem,
  type CemDeclaration,
} from '../src/stories/_catalog-helpers.ts';
import helixConfig, { type HelixStorybookConfig } from '../helix.storybook.config.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CEM_PATH = join(ROOT, 'node_modules', '@helixui', 'library', 'custom-elements.json');
const COMPONENTS_DIR = join(ROOT, 'node_modules', '@helixui', 'library', 'dist', 'components');
const OUT_DIR = join(ROOT, 'src', 'stories', 'catalog');

function shouldIncludeTag(
  tag: string,
  components: HelixStorybookConfig['components'],
): boolean {
  if (components.exclude.includes(tag)) return false;
  if (components.include === 'all') return true;
  return components.include.includes(tag);
}

function pascal(s: string): string {
  return s
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

function kebabSafe(s: string): string {
  return s.replace(/[^a-z0-9]/gi, '_');
}

// Resolve which @helixui/library/components/* path actually has its own
// dist/components/<tag>/index.js. Child components like hx-carousel-item
// share their parent's bundle and don't have their own export path.
// Strip suffixes (-item, -row, -cell, -panel, -divider) and try the parent.
function componentImportPath(tag: string): string {
  if (existsSync(join(COMPONENTS_DIR, tag))) return tag;
  const parents: string[] = [];
  const m = tag.match(/^(hx-.+?)(-(item|row|cell|panel|divider|head|body|foot|header))$/);
  if (m) parents.push(m[1]);
  // hx-tab → hx-tabs (singular → plural)
  if (tag.endsWith('-tab')) parents.push(tag.replace(/-tab$/, '-tabs'));
  for (const p of parents) {
    if (existsSync(join(COMPONENTS_DIR, p))) return p;
  }
  // Last resort: full library import (will be tree-shaken in production
  // build, but better than throwing — the catalog story will still emit).
  return '';
}

// Per-tag default slot content for catalog stories. The universal
// "placeholder text" default reads visually wrong on components whose
// slot is non-textual (icons, avatars, images, dividers, spinners) or
// whose slot expects a specific phrase length / shape (alerts, dialogs,
// stats). Empty string drops the slot entirely — Lit just renders the
// host. Realistic generic content per the realistic-sample-data rule
// (no Lorem, no domain lock).
const CATALOG_DEFAULT_CONTENT: Record<string, string> = {
  // visual-only / shape-only — no slot text
  'hx-icon': '',
  'hx-icon-button': '',
  'hx-image': '',
  'hx-divider': '',
  'hx-spinner': '',
  'hx-skeleton': '',
  'hx-progress-bar': '',
  'hx-progress-ring': '',
  'hx-meter': '',
  'hx-color-picker': '',
  'hx-rating': '',
  'hx-slider': '',
  'hx-toggle-button': '',
  'hx-switch': '',
  'hx-pagination': '',
  'hx-number-input': '',
  'hx-date-picker': '',
  'hx-time-picker': '',
  'hx-text-input': '',
  'hx-textarea': '',
  'hx-select': '',
  'hx-combobox': '',
  'hx-file-upload': '',
  'hx-counter': '',
  'hx-format-date': '',
  'hx-visually-hidden': '',
  'hx-style-scope': '',
  'hx-theme': '',
  'hx-status-indicator': '',
  // initials / single-token labels
  'hx-avatar': 'JD',
  'hx-tag': 'Tag',
  'hx-badge': 'New',
  'hx-checkbox': 'Accept terms',
  'hx-radio': 'Option',
  'hx-link': 'Documentation',
  'hx-button': 'Button',
  'hx-split-button': 'Action',
  'hx-toggle-button': '',
  'hx-step': 'Step',
  'hx-tab': 'Overview',
  'hx-th': 'Column',
  'hx-td': 'Cell',
  'hx-tr': '',
  'hx-thead': '',
  'hx-tbody': '',
  'hx-tfoot': '',
  'hx-stat': '1,234',
  'hx-clinical-status': 'Active',
  'hx-help-text': 'Optional helper text',
  'hx-field-label': 'Label',
  // composable item-types — short noun phrase
  'hx-menu-item': 'Menu item',
  'hx-menu-divider': '',
  'hx-list-item': 'List item',
  'hx-nav-item': 'Nav item',
  'hx-tree-item': 'Tree item',
  'hx-breadcrumb-item': 'Settings',
  'hx-accordion-item': 'Section',
  'hx-carousel-item': 'Slide',
  'hx-tab-panel': 'Panel content',
  'hx-structured-list-row': '',
  // surface-style — short message
  'hx-alert': 'Your changes have been saved.',
  'hx-banner': 'Upgrade available — read the changelog.',
  'hx-toast': 'Saved.',
  'hx-tooltip': 'Helpful context',
  'hx-popover': 'Popover content',
  'hx-popup': 'Popup content',
  'hx-dialog': 'Are you sure you want to continue?',
  'hx-drawer': 'Drawer content goes here.',
  // container / layout — short demonstrative
  'hx-card': 'Card body content goes here.',
  'hx-container': 'Container',
  'hx-grid': '',
  'hx-grid-item': '',
  'hx-stack': '',
  'hx-list': '',
  'hx-menu': '',
  'hx-nav': '',
  'hx-side-nav': '',
  'hx-top-nav': '',
  'hx-tabs': '',
  'hx-accordion': '',
  'hx-breadcrumb': '',
  'hx-button-group': '',
  'hx-checkbox-group': '',
  'hx-radio-group': '',
  'hx-action-bar': '',
  'hx-form': '',
  'hx-field': '',
  'hx-overflow-menu': '',
  'hx-toast-stack': '',
  'hx-table': '',
  'hx-data-table': '',
  'hx-tree-view': '',
  'hx-carousel': '',
  'hx-steps': '',
  'hx-structured-list': '',
  'hx-split-panel': '',
  // typography
  'hx-text': 'Helix is a brand-extensible component platform.',
  'hx-prose': 'Body copy that demonstrates the prose treatment.',
  // copy-button / code-snippet — show the action
  'hx-copy-button': 'Copy',
  'hx-code-snippet': 'npm install @helixui/library',
  // patient banner — fintech/wellness scaffold won't typically use this,
  // but if rendered, give it generic vital-style copy that reads as
  // realistic without being healthcare-locked.
  'hx-patient-banner': '',
};

function renderStoryFile(decl: CemDeclaration): string {
  const tag = decl.tagName!;
  const tier = classifyTier(decl);
  const className = pascal(tag);
  const argTypes = deriveArgTypes(decl);
  const defaultContent = CATALOG_DEFAULT_CONTENT[tag] ?? 'placeholder text';
  const args = { content: defaultContent, ...deriveArgs(decl) };
  // Build an argName → HTML-attribute-name map straight from the CEM.
  // \`deriveArgs / deriveArgTypes\` key off \`fieldName\` (the JS property,
  // e.g. \`size\`) when present, but the actual DOM attribute can differ
  // (e.g. hx-button's \`size\` property is exposed as the \`hx-size\`
  // attribute). Without this map the rendered markup would emit
  // \`size="md"\` and Storybook controls would have no effect.
  const attrNameMap: Record<string, string> = {};
  for (const a of decl.attributes ?? []) {
    if (!a.name) continue;
    const argKey = a.fieldName ?? a.name;
    attrNameMap[argKey] = a.name;
  }
  const importPath = componentImportPath(tag);
  // Reference a named export so Rollup keeps the import. Bare side-effect
  // imports (\`import '@helixui/library/components/hx-button'\`) get
  // tree-shaken in production builds because the components/*/index.js
  // only re-exports the class — Rollup cannot see that the upstream
  // shared chunk has @customElement decorator side effects. Importing
  // and referencing the namespace anchors the import chain, which forces
  // the shared module (where the registration runs) to evaluate.
  const importLine = importPath
    ? \`import * as _Reg_\${kebabSafe(tag)} from '@helixui/library/components/\${importPath}';
// Reference the namespace so the import is not dropped by Rollup. The
// imported module's evaluation is the side effect we need (it triggers
// @customElement registration via Lit's decorator runtime).
void _Reg_\${kebabSafe(tag)};\`
    : \`import * as _libReg_\${kebabSafe(tag)} from '@helixui/library';
void _libReg_\${kebabSafe(tag)};\`;
  return \`// GENERATED by scripts/generate-catalog.ts — do not edit by hand.
// Regenerate with: pnpm cem:catalog
import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
\${importLine}

// argName → DOM-attribute-name from the CEM. Property names and HTML
// attribute names diverge when components rename or prefix attributes
// (for example a 'size' property may be exposed as a 'hx-size'
// attribute), so the map is the source of truth — never derive the
// attribute from the arg key alone.
const ATTR_NAMES: Record<string, string> = \${JSON.stringify(attrNameMap, null, 2)};

const meta: Meta = {
  title: 'HELiX/\${tier}/\${tag}',
  // The 'component' field anchors this story to the CEM declaration.
  // Required for HelixDocsPage's useResolvedTag() to find the tag and
  // render the A11yStatusCard, and for Storybook's web-components
  // autodocs to bind controls/args to the right element.
  component: '\${tag}',
  tags: ['autodocs'],
  argTypes: \${JSON.stringify(argTypes, null, 2)},
  args: \${JSON.stringify(args, null, 2)},
  render: (args) => {
    // Renders via lit unsafeHTML — the previous template-cloneNode +
    // bare html-template-literal pattern produced an empty fragment
    // through Storybook 10's web-components renderer. unsafeHTML
    // takes the constructed markup string and mounts it as real DOM.
    const attrs = Object.entries(args)
      .filter(([k, v]) => k !== 'content' && v !== undefined && v !== null && v !== '')
      .map(([k, v]) => {
        // CEM-driven attribute name when available, fall back to a
        // camelCase → kebab conversion for args without an attribute
        // mapping (rare — usually slots or content props).
        const attr =
          ATTR_NAMES[k] ?? k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        return typeof v === 'boolean'
          ? v ? attr : ''
          : \\\`\\\${attr}="\\\${String(v).replace(/"/g, '&quot;')}"\\\`;
      })
      .filter(Boolean)
      .join(' ');
    // Empty string when no content is configured — far cleaner than
    // "placeholder text" leaking through on a tag that wasn't covered
    // by CATALOG_DEFAULT_CONTENT yet.
    const slot = (args as Record<string, unknown>).content ?? '';
    // Some Helix tags are CHILD components — they only render inside a
    // specific parent (e.g. hx-carousel-item inside hx-carousel,
    // hx-tab/hx-tab-panel inside hx-tabs). Rendered standalone they
    // appear empty or unstructured. Wrap the child in its expected
    // parent so the catalog story shows a meaningful preview.
    const PARENT_WRAPPERS: Record<string, string> = {
      'hx-accordion-item': 'hx-accordion',
      'hx-breadcrumb-item': 'hx-breadcrumb',
      'hx-carousel-item': 'hx-carousel',
      'hx-list-item': 'hx-list',
      'hx-menu-item': 'hx-menu',
      'hx-menu-divider': 'hx-menu',
      'hx-nav-item': 'hx-nav',
      'hx-tab': 'hx-tabs',
      'hx-tab-panel': 'hx-tabs',
      'hx-tree-item': 'hx-tree-view',
      'hx-step': 'hx-steps',
      'hx-tr': 'hx-table',
      'hx-th': 'hx-table',
      'hx-td': 'hx-table',
      'hx-thead': 'hx-table',
      'hx-tbody': 'hx-table',
      'hx-tfoot': 'hx-table',
      'hx-structured-list-row': 'hx-structured-list',
    };
    const inner = \\\`<\${tag}\\\${attrs ? ' ' + attrs : ''}>\\\${slot}</\${tag}>\\\`;
    const wrapper = PARENT_WRAPPERS['\${tag}'];
    const markup = wrapper ? \\\`<\\\${wrapper}>\\\${inner}</\\\${wrapper}>\\\` : inner;
    return html\\\`\\\${unsafeHTML(markup)}\\\`;
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {};
\`;
}

async function main() {
  let raw: string;
  try {
    raw = await readFile(CEM_PATH, 'utf8');
  } catch (err) {
    console.error(\`❌ Could not read \${CEM_PATH}. Run \\\`pnpm install\\\` first.\`);
    process.exit(1);
  }
  const cem = JSON.parse(raw) as Cem;
  const decls = walkCem(cem)
    .filter((d) => d.tagName && !isHipaaAdjacent(d.tagName))
    .filter((d) => shouldIncludeTag(d.tagName!, helixConfig.components))
    .sort((a, b) => a.tagName!.localeCompare(b.tagName!));

  // Clean + recreate output directory
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  for (const decl of decls) {
    const tier = classifyTier(decl);
    const tierDir = join(OUT_DIR, tier);
    await mkdir(tierDir, { recursive: true });
    const outFile = join(tierDir, \`\${kebabSafe(decl.tagName!)}.stories.ts\`);
    await writeFile(outFile, renderStoryFile(decl), 'utf8');
  }

  console.log(\`✓ Generated \${decls.length} Storybook entries under src/stories/catalog/\`);
  console.log(\`  atoms: \${decls.filter((d) => classifyTier(d) === 'atoms').length}\`);
  console.log(\`  molecules: \${decls.filter((d) => classifyTier(d) === 'molecules').length}\`);
  console.log(\`  organisms: \${decls.filter((d) => classifyTier(d) === 'organisms').length}\`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`,
  );

  // ── Phase 4 — narrative IA: Cover + Overview + foundations + patterns ────
  //
  // Editorial flow (storySort already pinned in preview.ts):
  //   Cover → Overview → Accessibility → Foundations → Patterns → Playground
  //   → Components → *
  //
  // Cover and Brand consume brandTagline + brandVerticals from the Phase 1
  // prompts. Empty defaults degrade gracefully — Cover surfaces a neutral
  // 'Design system extending HELiX' line, the brand-vertical chip row
  // suppresses, and Brand.mdx renders a generic override example.
  //
  // All foundation pages live-bind to the consumer's tokens via
  // var(\${prefix}-*); they read whatever lands in src/tokens/tokens.css.
  // No hardcoded colors / spacing — when the consumer runs pnpm tokens:sync
  // the foundation pages refresh on the next preview build.

  const foundationsDir = path.join(storiesDir, 'foundations');
  const patternsDir = path.join(storiesDir, 'patterns');
  await safeEnsureDir(foundationsDir);
  await safeEnsureDir(patternsDir);

  // Brand-tagline + verticals chip row are now wrapped in a styled
  // hero block (\`hx-narrative-hero\`) so Cover.mdx leads with a real
  // visual identity instead of a default markdown blockquote. The
  // hero block surfaces:
  //   - eyebrow: dsTitle name in brand-primary color
  //   - tagline: large display copy (when brandTagline set)
  //   - verticals: chip row with aria-label
  //   - subtext: factory-attribution line
  // Styles live in helix-narrative.css under .hx-narrative-hero / -eyebrow
  // / -tagline / -subtext (added below).
  const taglineMarkup = options.brandTagline
    ? `\n  <p className="hx-cover-hero-tagline">${escapeMdxText(options.brandTagline)}</p>`
    : '';
  const verticalsList = (options.brandVerticals ?? [])
    .filter((v) => v.length > 0)
    .map((v) => escapeMdxText(v));
  const verticalsRowMarkup =
    verticalsList.length > 0
      ? `\n  <ul aria-label="Brand verticals" className="hx-narrative-chip-row">\n${verticalsList
          .map((v) => `    <li className="hx-narrative-chip">${v}</li>`)
          .join('\n')}\n  </ul>`
      : '';
  const heroBlockMdx = `<header className="hx-cover-hero">
  <p className="hx-cover-hero-eyebrow">${escapeMdxText(dsTitle)} Design System</p>${taglineMarkup}${verticalsRowMarkup}
  <p className="hx-cover-hero-subtext">Built on HELiX + Lit 3 + Storybook 10. Generated by <code>create-helix</code>.</p>
</header>

`;
  // Pre-existing references — keep the legacy variable names so the rest
  // of the Cover.mdx template + Brand.mdx interpolation don't churn.
  const taglineLineMdx = options.brandTagline ? `_${escapeMdxText(options.brandTagline)}_\n\n` : '';
  // Pre-existing dead variable — kept for future Brand.mdx interpolation
  // but currently unreferenced. Prefixed with `_` to satisfy
  // @typescript-eslint/no-unused-vars without churning the legacy shape.
  const _verticalsRowMdx =
    verticalsList.length > 0
      ? `<ul aria-label="Brand verticals" className="hx-narrative-chip-row">\n${verticalsList
          .map((v) => `  <li className="hx-narrative-chip">${v}</li>`)
          .join('\n')}\n</ul>\n\n`
      : '';
  void _verticalsRowMdx;

  // ── src/stories/Cover.mdx ────────────────────────────────────────────────

  await safeWriteFile(
    path.join(storiesDir, 'Cover.mdx'),
    `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Welcome/Cover" />

${heroBlockMdx}A design system extending **HELiX**, generated by \`create-helix\` and built on Lit 3 + Storybook 10. Edit \`src/tokens/tokens.css\` and the components in \`src/components/\` — the rest is yours.

## Quick start

Run the scripts with whichever package manager you installed with —
\`pnpm\`, \`npm run\`, \`yarn\`, or \`bun run\` all wire to the same
package.json scripts.

\`\`\`bash
# pnpm
pnpm storybook         # open the design system at localhost:6006
pnpm tokens:sync       # pull tokens from your Figma file (.env required)
pnpm build             # produce the publishable bundle

# npm
npm run storybook
npm run tokens:sync
npm run build
\`\`\`

## What's in this Storybook

<div className="hx-narrative-grid">
  <div className="hx-narrative-card">
    <h3 className="hx-narrative-card-title">Foundations</h3>
    <div className="hx-narrative-card-body">Tokens, color, typography, spacing, layout, brand, accessibility.</div>
  </div>
  <div className="hx-narrative-card">
    <h3 className="hx-narrative-card-title">Patterns</h3>
    <div className="hx-narrative-card-body">Form, dashboard, navigation compositions.</div>
  </div>
  <div className="hx-narrative-card">
    <h3 className="hx-narrative-card-title">Components</h3>
    <div className="hx-narrative-card-body">Every HELiX atom, plus your own ${ds}-* extensions.</div>
  </div>
</div>

## Configure what shows

Edit \`helix.storybook.config.ts\` to hide upstream HELiX components when you've extended them, opt out of foundation pages, or scope the brand toolbar to a subset of verticals. Defaults show everything.
`,
  );

  // ── src/stories/Overview.mdx ─────────────────────────────────────────────

  await safeWriteFile(
    path.join(storiesDir, 'Overview.mdx'),
    `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Welcome/Overview" />

# Overview

${dsTitle} extends HELiX through a three-tier token cascade. Every component you build resolves visual properties through the same chain — primitive ramps at the bottom, semantic aliases in the middle, component-tier overrides on top.

## The cascade

<div className="hx-narrative-grid--single">
  <div className="hx-narrative-card hx-narrative-card--raised">
    <h3 className="hx-narrative-card-title">1. Primitive ramps</h3>
    <div className="hx-narrative-card-body">
      <code>--hx-color-primary-{'{50..950}'}</code>, <code>${prefix}-color-primary-{'{50..950}'}</code> — raw color values, never bound directly to layout.
    </div>
  </div>
  <div className="hx-narrative-card">
    <h3 className="hx-narrative-card-title">2. Semantic aliases</h3>
    <div className="hx-narrative-card-body">
      <code>--hx-color-action-primary-bg</code> → <code>--hx-color-primary-600</code>. Mode-aware (light / dark / high-contrast). Bind these to layouts, not the primitives.
    </div>
  </div>
  <div className="hx-narrative-card">
    <h3 className="hx-narrative-card-title">3. Component overrides</h3>
    <div className="hx-narrative-card-body">
      <code>--hx-button-bg</code> → <code>--hx-color-action-primary-bg</code>. The escape hatch for one-off brand callouts; rarely needed, never authored at the layout level.
    </div>
  </div>
</div>

## Accessibility is a first-class output

Every published HELiX component carries a CEM \`helixMeta.aaa.*\` payload — WCAG 2.1 AAA cert status, criteria audited, ARIA pattern, keyboard contract. The **A11y Status Card** auto-injects on every component docs page so the conformance story is one click away, not buried in a separate audit document.
`,
  );

  // ── src/stories/foundations/Tokens.mdx ───────────────────────────────────

  await safeWriteFile(
    path.join(foundationsDir, 'Tokens.mdx'),
    `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Foundations/Tokens" />

# Tokens

The cascade in three lines:

\`\`\`css
/* primitive  */ --hx-color-primary-600: #0F7078;
/* semantic   */ --hx-color-action-primary-bg: var(--hx-color-primary-600);
/* component  */ --hx-button-bg: var(--hx-color-action-primary-bg);
\`\`\`

${dsTitle} adds a fourth tier on top: \`${prefix}-*\`. Use it for design-system-wide brand overrides without touching the underlying HELiX semantic layer.

\`\`\`css
/* ${dsTitle} brand override */
:root {
  ${prefix}-color-primary: var(--hx-color-primary-600); /* example override */
}
\`\`\`

The \`${prefix}-*\` rebinding flows through the cascade automatically — every HELiX semantic that resolved to \`primary-600\` now resolves to your brand's primary.
`,
  );

  // ── src/stories/foundations/Color.mdx ────────────────────────────────────

  await safeWriteFile(
    path.join(foundationsDir, 'Color.mdx'),
    `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Foundations/Color" />

# Color

Four families, one rule: bind to **semantic** tokens, never primitives.

<div className="hx-narrative-grid--family">
  <div className="hx-narrative-card">
    <h3 className="hx-narrative-card-title hx-narrative-card-title--lg">Surface</h3>
    <code>--hx-color-surface-{'{default,raised,sunken}'}</code>
    <div className="hx-narrative-card-body">Layout backgrounds. Tracks data-theme.</div>
  </div>
  <div className="hx-narrative-card">
    <h3 className="hx-narrative-card-title hx-narrative-card-title--lg">Text</h3>
    <code>--hx-color-text-{'{primary,muted,strong}'}</code>
    <div className="hx-narrative-card-body">Foreground. Always paired with a surface for AAA contrast.</div>
  </div>
  <div className="hx-narrative-card">
    <h3 className="hx-narrative-card-title hx-narrative-card-title--lg">Action</h3>
    <code>--hx-color-action-primary-bg</code>
    <div className="hx-narrative-card-body">Interactive triggers. Bind buttons / links / focus rings here.</div>
  </div>
  <div className="hx-narrative-card">
    <h3 className="hx-narrative-card-title hx-narrative-card-title--lg">Status</h3>
    <code>--hx-color-{'{success,warning,danger,info}'}-bg</code>
    <div className="hx-narrative-card-body">Outcome cues. AAA contrast guaranteed.</div>
  </div>
</div>

## Contrast pairings

All semantic surface/text pairings are pre-validated against WCAG 2.1 AAA (7:1 normal, 4.5:1 large). The **A11y Status Card** on each component page surfaces the per-criterion verdicts.

## Live swatches

Every chip below resolves through the same cascade your components use — change \`${prefix}-color-action-primary-bg\` and these update instantly.

<div className="hx-narrative-swatch-row" aria-label="Action primary states">
  <div className="hx-narrative-swatch" style={{'--swatch-bg': \`var(${prefix}-color-action-primary-bg, var(--hx-color-action-primary-bg))\`}}>
    <span className="hx-narrative-swatch-chip" />
    <span className="hx-narrative-swatch-label">Primary <code>bg</code></span>
  </div>
  <div className="hx-narrative-swatch" style={{'--swatch-bg': \`var(${prefix}-color-action-primary-bg-hover, var(--hx-color-action-primary-bg-hover))\`}}>
    <span className="hx-narrative-swatch-chip" />
    <span className="hx-narrative-swatch-label">Primary <code>bg-hover</code></span>
  </div>
  <div className="hx-narrative-swatch" style={{'--swatch-bg': \`var(${prefix}-color-action-primary-bg-active, var(--hx-color-action-primary-bg-active))\`}}>
    <span className="hx-narrative-swatch-chip" />
    <span className="hx-narrative-swatch-label">Primary <code>bg-active</code></span>
  </div>
  <div className="hx-narrative-swatch" style={{'--swatch-bg': \`var(${prefix}-color-action-secondary-bg, var(--hx-color-action-secondary-bg))\`}}>
    <span className="hx-narrative-swatch-chip" />
    <span className="hx-narrative-swatch-label">Secondary <code>bg</code></span>
  </div>
  <div className="hx-narrative-swatch" style={{'--swatch-bg': \`var(${prefix}-color-action-danger-bg, var(--hx-color-action-danger-bg))\`}}>
    <span className="hx-narrative-swatch-chip" />
    <span className="hx-narrative-swatch-label">Danger <code>bg</code></span>
  </div>
</div>

For the full primitive ramp (\`primary-{'{50..950}'}\`, neutrals, semantic groups), see **Foundations/Token Swatches/Colors** — that page renders every entry from \`tokens.json\`, grouped by family.
`,
  );

  // ── src/stories/foundations/Typography.mdx ───────────────────────────────

  await safeWriteFile(
    path.join(foundationsDir, 'Typography.mdx'),
    `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Foundations/Typography" />

# Typography

Two faces, ten stops, six weights.

- **Inter** — primary sans for prose, headings, UI labels.
- **JetBrains Mono** — engineering face for code, token names, eyebrow chips.

## Type ramp

{/* Phase 5 fix: rendered as JSX <table> rather than markdown table.
    Storybook 10's MDX parser does not enable remark-gfm by default,
    so GFM markdown-table syntax falls through and renders as inline
    pipe-and-dash text. JSX always renders. */}

<table className="hx-narrative-table">
  <thead>
    <tr>
      <th>Stop</th>
      <th>Token</th>
      <th>Sample</th>
    </tr>
  </thead>
  <tbody>
    {[
      ['xs', '--hx-font-size-xs'],
      ['sm', '--hx-font-size-sm'],
      ['base', '--hx-font-size-base'],
      ['md', '--hx-font-size-md'],
      ['lg', '--hx-font-size-lg'],
      ['xl', '--hx-font-size-xl'],
      ['2xl', '--hx-font-size-2xl'],
      ['3xl', '--hx-font-size-3xl'],
      ['4xl', '--hx-font-size-4xl'],
      ['5xl', '--hx-font-size-5xl'],
    ].map(([stop, token]) => (
      <tr key={stop}>
        <td>{stop}</td>
        <td><code>{token}</code></td>
        <td>The quick brown fox</td>
      </tr>
    ))}
  </tbody>
</table>

Every stop ships with a corresponding line-height that meets WCAG 1.4.8 (visual presentation — line-height ≥ 1.5× font-size). Don't override at the layer level; wrap in a constrained-width container if you need to change measure.
`,
  );

  // ── src/stories/foundations/Spacing.mdx ──────────────────────────────────

  await safeWriteFile(
    path.join(foundationsDir, 'Spacing.mdx'),
    `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Foundations/Spacing" />

# Spacing

A 4px-base, 15-stop linear scale (\`space/01\` → \`space/15\`). Mode-aware via density presets (\`compact\`, \`default\`, \`touch\`).

\`\`\`css
/* default density */
--hx-space-04: 16px;

/* touch density (44px tap target floor) */
[data-density='touch'] {
  --hx-space-04: 20px;
}
\`\`\`

## Why density modes

A clinical-intake tablet has different ergonomics than a laptop dashboard. The same component can surface a 32px tap target in default density and a 44px tap target in touch density, without re-authoring layouts.

## Padding rhythm

Bind padding to the same scale as gaps. \`space/02\` (8px) on small components; \`space/04\` (16px) on cards; \`space/06\` (24px) on dialogs and overlays.
`,
  );

  // ── src/stories/foundations/Layout.mdx ───────────────────────────────────

  await safeWriteFile(
    path.join(foundationsDir, 'Layout.mdx'),
    `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Foundations/Layout" />

# Layout

Eight breakpoints, one touch-target floor, one motion contract.

## Breakpoints

{/* Phase 5 fix: JSX table rather than markdown table — see Typography.mdx for context. */}

<table className="hx-narrative-table">
  <thead>
    <tr>
      <th>Token</th>
      <th>Width</th>
      <th>Type</th>
    </tr>
  </thead>
  <tbody>
    {[
      ['xs', '360px', 'mobile small'],
      ['mobile', '375px', 'mobile'],
      ['sm', '640px', 'mobile (token)'],
      ['md', '768px', 'tablet (token)'],
      ['lg', '1024px', 'desktop (token)'],
      ['xl', '1280px', 'desktop (token)'],
      ['2xl', '1536px', 'desktop (token)'],
      ['xxl', '1920px', 'ultrawide'],
    ].map(([token, width, type]) => (
      <tr key={token}>
        <td><code>{token}</code></td>
        <td>{width}</td>
        <td>{type}</td>
      </tr>
    ))}
  </tbody>
</table>

The Storybook viewport toolbar exposes all eight; the token-defined breakpoints (sm/md/lg/xl/2xl) are load-bearing.

## Touch target floor

44 × 44 px minimum for any interactive element on touch surfaces (WCAG 2.5.5 Target Size — Level AAA). The \`touch\` density preset enforces this automatically; default density preserves it on every component shipped with HELiX.

## Reduced motion

Animation respects \`prefers-reduced-motion: reduce\`. Components fall back to instant state changes when the user has reduced-motion enabled. Don't author animations that ignore the preference.
`,
  );

  // ── src/stories/foundations/Brand.mdx ────────────────────────────────────

  await safeWriteFile(
    path.join(foundationsDir, 'Brand.mdx'),
    `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Foundations/Brand" />

# Brand

${taglineLineMdx}${dsTitle} expresses your brand at the **\`${prefix}-*\`** layer — the consumer's tier on top of the HELiX cascade.

## Override pattern

\`\`\`css
/* src/tokens/tokens.css */
:root {
  ${prefix}-color-primary: var(--hx-color-primary-600); /* example override */
  ${prefix}-color-primary-fg: #ffffff;
  ${prefix}-font-family-heading: 'YourBrand Display', system-ui, sans-serif;
}

/* High-contrast suppresses brand override — accessibility wins. */
:root[data-theme='high-contrast'] {
  ${prefix}-color-primary: var(--hx-color-primary-600);
}
\`\`\`

The \`${prefix}-*\` namespace flows through the same cascade as HELiX's \`--hx-*\` tokens. When you rebind \`${prefix}-color-primary\`, every HELiX semantic that resolved to \`primary-600\` shifts at runtime — no rebuild, no per-component override, no drift.

## Voice

${
  options.brandTagline
    ? `Tagline (${escapeMdxText(options.brandTagline)}) lives in \`Cover.mdx\`. Editorial guidance — tone, vocabulary, do-and-don't phrases — belongs alongside it. Add a Voice subsection to Cover.mdx or a sibling \`Voice.mdx\` page as the brand vocabulary firms up.`
    : `Brand voice lives with you — taglines, vertical-specific copy, hero scenarios. The factory ships neutral defaults so the design system reads as a generic starter; replace them in your fork.`
}

## Do / don't

{/* Phase 5 fix: JSX table rather than markdown table — Storybook MDX no remark-gfm. */}

<table className="hx-narrative-table">
  <thead>
    <tr>
      <th>Do</th>
      <th>Don't</th>
    </tr>
  </thead>
  <tbody>
    {[
      [<>Override at <code>{'${prefix}-*'}</code> (your tier)</>, <>Override <code>--hx-*</code> directly (breaks the cascade)</>],
      ['Test all three theme modes (light / dark / high-contrast)', 'Author dark-only or light-only tokens'],
      [<>Respect <code>prefers-reduced-motion</code> and <code>forced-colors</code></>, 'Strip motion or use color-only signaling'],
      ['Keep your override list small and semantic', 'Pin every primitive to a brand-specific value'],
    ].map((row, i) => (
      <tr key={i}>
        <td>{row[0]}</td>
        <td>{row[1]}</td>
      </tr>
    ))}
  </tbody>
</table>
`,
  );

  // ── src/stories/foundations/Accessibility.mdx ────────────────────────────

  await safeWriteFile(
    path.join(foundationsDir, 'Accessibility.mdx'),
    `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Foundations/Accessibility" />

# Accessibility

WCAG 2.1 Level AA on every component. AAA on every certified component. The **A11y Status Card** on each component docs page surfaces the per-criterion verdicts pulled live from the CEM.

## What ships AA / AAA

- **AA universal** — color contrast (4.5:1 normal, 3:1 large), keyboard operability, focus visibility, target size, language, label association.
- **AAA on certified components** — enhanced contrast (7:1 / 4.5:1), context-sensitive help, error prevention on form-associated elements, line-height ≥ 1.5, dynamic-text resize without horizontal scroll.

The CEM \`helixMeta.aaa.criteria\` array lists which WCAG 2.2 success criteria a given component has audited evidence for. The A11y Status Card renders one chip per claimed criterion + a link to the audit ledger on GitHub.

## Focus rings

Two-stop focus ring: a 2px outline ring + a 2px offset against the surface. Bound to \`--hx-color-focus-ring\` (semantic). Don't \`outline: none\` author CSS that strips it; the AAA cert is conditional on the focus indicator surviving authoring.

## Forced colors

Components ship \`@media (forced-colors: active)\` rules that respect Windows High Contrast Mode and equivalents. Don't override the system colors at the component layer; bind to forced-color CSS keywords (\`CanvasText\`, \`Highlight\`, etc.) when you author your own components.

## Reduced motion

Animation respects \`prefers-reduced-motion: reduce\`. Components degrade to instant state changes when the user has reduced-motion enabled. Author your custom components the same way.
`,
  );

  // ── src/stories/patterns/Index.mdx ───────────────────────────────────────

  await safeWriteFile(
    path.join(patternsDir, 'Index.mdx'),
    `import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Welcome/Patterns" />

# Patterns

Composed examples — full forms, dashboards, navigation chrome. Patterns
demonstrate how the consumer's own \`${ds}-*\` components compose with
HELiX form atoms, layout primitives, and feedback components into
real product moments.

This page ships with one starter pattern (Sign-in form). Author
additional patterns into \`src/stories/patterns/*.mdx\` as they emerge —
typical first batch is forms, feedback, data display, and navigation.

## Sign-in form

A canonical authentication moment that exercises the full form stack:
\`hx-text-input\` for email + password, \`${ds}-button\` for the primary
action, \`hx-link\` for password recovery. Token-driven so the form
re-skins automatically when brand tokens change.

<div className="hx-narrative-hero" style={{ maxWidth: '420px', margin: '24px 0' }}>
  <h3>Sign in to your workspace</h3>
  <p className="hx-narrative-hero-intro">
    Calm finance for everyone — sign in to continue.
  </p>
  <hx-text-input
    label="Email"
    type="email"
    placeholder="you@example.com"
    style={{ display: 'block', marginBottom: '12px' }}
  ></hx-text-input>
  <hx-text-input
    label="Password"
    type="password"
    placeholder="••••••••"
    style={{ display: 'block', marginBottom: '16px' }}
  ></hx-text-input>
  <div className="hx-narrative-hero-actions">
    <${ds}-button variant="primary">Sign in</${ds}-button>
    <${ds}-button variant="ghost">Forgot?</${ds}-button>
  </div>
</div>

### Source

\`\`\`tsx
<form>
  <hx-text-input label="Email" type="email" placeholder="you@example.com" />
  <hx-text-input label="Password" type="password" />
  <${ds}-button variant="primary" type="submit">Sign in</${ds}-button>
  <${ds}-button variant="ghost">Forgot?</${ds}-button>
</form>
\`\`\`

## Author your own patterns

Drop a new \`.mdx\` file under \`src/stories/patterns/\` and Storybook will
pick it up. Use the same \`<hx-narrative-hero>\` wrapper for the live
preview, then add \`### Source\` and \`### Notes\` sections so the page
reads as a recipe, not a screenshot.

Suggested next patterns:

- **Intake form** — multi-step wizard with \`hx-stepper\` + per-step validation
- **Toast feedback** — \`hx-toast-stack\` wired to a save action
- **Data table** — \`hx-data-table\` with sort, pagination, row selection
- **Top navigation** — \`hx-top-nav\` + \`hx-breadcrumb\` + active-route handling

The \`heroScenarios\` prompt in \`create-helix\` is the easy on-ramp: the
first scenario lands as the per-component hero scene; subsequent
scenarios become the seed material for additional pattern pages.
`,
  );

  // ── src/stories/Welcome.stories.ts ───────────────────────────────────────
  // Welcome/Introduction is the canonical first story — technical
  // onboarding (commands, features, what-this-thing-is). Cover, Overview,
  // and Patterns nest as sibling MDX entries under the same Welcome
  // section, giving the sidebar a single "where to start" group at the
  // top. Earlier iterations parked this page as 'Foundations/Welcome
  // (legacy)' or 'Archive/Welcome (legacy)' — both wrong: the content is
  // accurate and useful, and burying it under another section made the
  // sidebar's intended entry point invisible.

  await safeWriteFile(
    path.join(storiesDir, 'Welcome.stories.ts'),
    `import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';

const meta: Meta = {
  title: 'Welcome/Introduction',
  parameters: {
    layout: 'fullscreen',
    docs: { page: null },
  },
};

export default meta;
type Story = StoryObj;

export const Introduction: Story = {
  render: () => html\`
    <div style="
      font-family: system-ui, sans-serif;
      max-width: 860px;
      margin: 0 auto;
      padding: 3rem 2rem;
      color: #212529;
    ">
      <div style="
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 2rem;
      ">
        <div style="
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, #0066cc, #0052a3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 1.25rem;
        ">${ClassName.charAt(0)}</div>
        <div>
          <h1 style="margin: 0; font-size: 1.75rem; font-weight: 700;">${dsTitle} Design System</h1>
          <p style="margin: 0; color: #6c757d; font-size: 0.9rem;">Built on HELiX + Lit 3 + Storybook 10</p>
        </div>
      </div>

      <p style="font-size: 1.1rem; line-height: 1.7; margin-bottom: 2rem; color: #495057;">
        Welcome to the <strong>${dsTitle}</strong> design system — a component library factory
        powered by <a href="https://lit.dev" target="_blank" rel="noopener">Lit 3</a>,
        <a href="https://helixui.dev" target="_blank" rel="noopener">HELiX</a>,
        and <a href="https://storybook.js.org" target="_blank" rel="noopener">Storybook 10</a>.
      </p>

      <div style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
        margin-bottom: 2.5rem;
      ">
        <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 1.25rem;">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🧱</div>
          <h3 style="margin: 0 0 0.5rem; font-size: 1rem;">Components</h3>
          <p style="margin: 0; font-size: 0.875rem; color: #6c757d;">
            Every HELiX component rendered under HELiX/* — plus ${ds}-button as an extension example.
          </p>
        </div>
        <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 1.25rem;">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🎨</div>
          <h3 style="margin: 0 0 0.5rem; font-size: 1rem;">Design Tokens</h3>
          <p style="margin: 0; font-size: 0.875rem; color: #6c757d;">
            Customize the <code>${prefix}-*</code> CSS custom properties in
            <code>src/tokens/tokens.css</code>.
          </p>
        </div>
        <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 1.25rem;">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🧪</div>
          <h3 style="margin: 0 0 0.5rem; font-size: 1rem;">Story Tests</h3>
          <p style="margin: 0; font-size: 0.875rem; color: #6c757d;">
            Run <code>pnpm test</code> to execute Playwright interaction tests
            for every story.
          </p>
        </div>
      </div>

      <h2 style="font-size: 1.25rem; margin-bottom: 1rem;">Quick Start</h2>
      <pre style="
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        padding: 1rem;
        font-size: 0.875rem;
        overflow: auto;
"># Start Storybook (use whichever package manager you installed with)
pnpm storybook       # or: npm run storybook  /  yarn storybook

# Run interaction tests
pnpm test            # or: npm run test  /  yarn test

# Build component library
pnpm build           # or: npm run build  /  yarn build

# Generate Custom Elements Manifest (for autodocs)
pnpm cem:analyze     # or: npm run cem:analyze  /  yarn cem:analyze</pre>

      <p style="margin-top: 2rem; font-size: 0.85rem; color: #adb5bd;">
        Scaffolded with
        <a href="https://www.npmjs.com/package/create-helix" target="_blank" rel="noopener">create-helix</a>
        — a HELiX enterprise design system factory.
      </p>
    </div>
  \`,
};
`,
  );

  // ── src/stories/design-tokens/Colors.stories.ts ──────────────────────────

  await safeWriteFile(
    path.join(designTokensStoriesDir, 'Colors.stories.ts'),
    `import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import tokens from '../../tokens/tokens.json';

// Sprint 1.5b — accept BOTH the DTCG shape (\`{$value, $type}\`, default
// from Custom Helix Exporter 0.6.0+) AND the legacy shape (\`{value}\`).
// \`tokenValue()\` is the single read site so the rest of the story stays
// shape-agnostic. The build-tokens.ts script logs a one-time deprecation
// warning when it encounters legacy leaves; stories stay quiet.
type TokenEntry = { $value: string; $type?: string } | { value: string };
type ColorScale = Record<string, TokenEntry>;
type ColorTokens = Record<string, ColorScale | TokenEntry>;

function tokenValue(t: TokenEntry): string {
  return '$value' in t ? t.$value : t.value;
}

const colorTokens = tokens.color as ColorTokens;

function colorSwatchGrid(group: string, scale: ColorScale) {
  // Defensive: the consumer's tokens.json may not include this group
  // (stub installs without @helixui/tokens, custom branches, etc.).
  // Render a polite placeholder rather than crashing the docs page
  // with "Cannot convert undefined or null to object".
  if (!scale || typeof scale !== 'object') {
    return html\`
      <div style="font-family: var(--hx-font-sans, sans-serif); margin-bottom: 2rem; padding: 16px; border: 1px dashed var(--hx-color-border-subtle, #dee2e6); border-radius: 8px; color: var(--hx-color-text-muted, #6c757d);">
        <h3 style="margin: 0 0 4px; text-transform: capitalize; color: var(--hx-color-text-primary, #0d1825);">\${group}</h3>
        <p style="margin: 0; font-size: 14px;">No tokens defined for <code>color.\${group}</code> in <code>src/tokens/tokens.json</code>. Run <code>pnpm tokens:sync</code> or edit the stub to add this group.</p>
      </div>
    \`;
  }
  const entries = Object.entries(scale).filter(
    ([, v]) =>
      typeof v === 'object' && v !== null && ('$value' in v || 'value' in v),
  );
  return html\`
    <div style="font-family: var(--hx-font-sans, sans-serif); margin-bottom: 2rem;">
      <h3 style="margin: 0 0 1rem; text-transform: capitalize; font-size: 1rem; font-weight: 600;">\${group}</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.5rem;">
        \${entries.map(([scale, token]) => {
          const cssVar = \`--hx-color-\${group}-\${scale}\`;
          const rawValue = tokenValue(token as TokenEntry);
          return html\`
            <div>
              <div style="height: 64px; border-radius: 6px; background: var(\${cssVar}, \${rawValue}); border: 1px solid rgba(0,0,0,0.1);"></div>
              <div style="margin-top: 4px; font-size: 11px; color: #666;">\${scale}</div>
              <div style="font-size: 10px; color: #999; font-family: monospace;">\${cssVar}</div>
              <div style="font-size: 10px; color: #aaa;">\${rawValue}</div>
            </div>
          \`;
        })}
      </div>
    </div>
  \`;
}

const meta: Meta = {
  title: 'Foundations/Token Swatches/Colors',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Color tokens from \`@helixui/tokens\`. Swatches use live CSS variables — update the token CSS and the swatches refresh.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

const paletteGroups = ['primary', 'secondary', 'accent', 'neutral'] as const;
const semanticGroups = ['success', 'warning', 'error', 'info'] as const;

export const Primary: Story = {
  name: 'Primary',
  render: () => colorSwatchGrid('primary', colorTokens['primary'] as ColorScale),
};

export const Secondary: Story = {
  name: 'Secondary',
  render: () => colorSwatchGrid('secondary', colorTokens['secondary'] as ColorScale),
};

export const Accent: Story = {
  name: 'Accent',
  render: () => colorSwatchGrid('accent', colorTokens['accent'] as ColorScale),
};

export const Neutral: Story = {
  name: 'Neutral',
  render: () => colorSwatchGrid('neutral', colorTokens['neutral'] as ColorScale),
};

export const Semantic: Story = {
  name: 'Semantic',
  render: () => html\`
    <div style="font-family: var(--hx-font-sans, sans-serif);">
      \${semanticGroups.map((group) => colorSwatchGrid(group, colorTokens[group] as ColorScale))}
    </div>
  \`,
};

export const Palette: Story = {
  name: 'Full Palette',
  render: () => html\`
    <div style="font-family: var(--hx-font-sans, sans-serif);">
      \${paletteGroups.map((group) => colorSwatchGrid(group, colorTokens[group] as ColorScale))}
    </div>
  \`,
};
`,
  );

  // ── src/stories/design-tokens/Borders.stories.ts ─────────────────────────

  await safeWriteFile(
    path.join(designTokensStoriesDir, 'Borders.stories.ts'),
    `import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import tokens from '../../tokens/tokens.json';

// Sprint 1.5b — accept both DTCG ({$value, $type}) and legacy ({value}).
type TokenEntry = { $value: string; $type?: string } | { value: string };
function tokenValue(t: TokenEntry): string {
  return '$value' in t ? t.$value : t.value;
}

const borderTokens = tokens.border as {
  radius: Record<string, TokenEntry>;
  width: Record<string, TokenEntry>;
};

const meta: Meta = {
  title: 'Foundations/Token Swatches/Borders',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Border radius and width tokens from \`@helixui/tokens\`. Rendered live from CSS variables.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

export const Radius: Story = {
  name: 'Border Radius',
  render: () => {
    const entries = Object.entries(borderTokens.radius);
    return html\`
      <div style="font-family: var(--hx-font-sans, sans-serif);">
        <h3 style="margin: 0 0 1.5rem; font-size: 1rem; font-weight: 600;">Border Radius</h3>
        <div style="display: flex; flex-direction: column; gap: 1.25rem;">
          \${entries.map(([key, token]) => {
            const cssVar = \`--hx-border-radius-\${key}\`;
            return html\`
              <div style="display: flex; align-items: center; gap: 1.5rem;">
                <div style="width: 80px; height: 48px; background: var(--hx-color-primary-500, #2563EB); border-radius: var(\${cssVar}, \${tokenValue(token)}); flex-shrink: 0;"></div>
                <div>
                  <div style="font-size: 13px; font-weight: 500;">\${key}</div>
                  <div style="font-size: 11px; color: #888; font-family: monospace;">\${cssVar}</div>
                  <div style="font-size: 11px; color: #aaa;">\${tokenValue(token)}</div>
                </div>
              </div>
            \`;
          })}
        </div>
      </div>
    \`;
  },
};

export const Width: Story = {
  name: 'Border Width',
  render: () => {
    const entries = Object.entries(borderTokens.width);
    return html\`
      <div style="font-family: var(--hx-font-sans, sans-serif);">
        <h3 style="margin: 0 0 1.5rem; font-size: 1rem; font-weight: 600;">Border Width</h3>
        <div style="display: flex; flex-direction: column; gap: 1.25rem;">
          \${entries.map(([key, token]) => {
            const cssVar = \`--hx-border-width-\${key}\`;
            return html\`
              <div style="display: flex; align-items: center; gap: 1.5rem;">
                <div style="width: 160px; height: 0; border-top: var(\${cssVar}, \${tokenValue(token)}) solid var(--hx-color-primary-500, #2563EB); flex-shrink: 0;"></div>
                <div>
                  <div style="font-size: 13px; font-weight: 500;">\${key}</div>
                  <div style="font-size: 11px; color: #888; font-family: monospace;">\${cssVar}</div>
                  <div style="font-size: 11px; color: #aaa;">\${tokenValue(token)}</div>
                </div>
              </div>
            \`;
          })}
        </div>
      </div>
    \`;
  },
};
`,
  );

  // ── src/stories/design-tokens/Shadows.stories.ts ─────────────────────────

  await safeWriteFile(
    path.join(designTokensStoriesDir, 'Shadows.stories.ts'),
    `import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import tokens from '../../tokens/tokens.json';

// Sprint 1.5b — accept both DTCG ({$value, $type}) and legacy ({value}).
type TokenEntry = { $value: string; $type?: string } | { value: string };
function tokenValue(t: TokenEntry): string {
  return '$value' in t ? t.$value : t.value;
}

const shadowTokens = tokens.shadow as Record<string, TokenEntry>;

const meta: Meta = {
  title: 'Foundations/Token Swatches/Shadows',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Shadow tokens from \`@helixui/tokens\`. Each card uses \`var(--hx-shadow-*)\` live from the token CSS.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

export const AllShadows: Story = {
  name: 'All Shadows',
  render: () => {
    const entries = Object.entries(shadowTokens).filter(([k]) => k !== 'none');
    return html\`
      <div style="font-family: var(--hx-font-sans, sans-serif); display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 2rem; padding: 2rem; background: #f8fafc;">
        \${entries.map(([key, token]) => {
          const cssVar = \`--hx-shadow-\${key}\`;
          return html\`
            <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
              <div style="width: 120px; height: 80px; background: white; border-radius: 8px; box-shadow: var(\${cssVar}, \${tokenValue(token)});"></div>
              <div style="text-align: center;">
                <div style="font-size: 13px; font-weight: 500;">\${key}</div>
                <div style="font-size: 11px; color: #888; font-family: monospace;">\${cssVar}</div>
              </div>
            </div>
          \`;
        })}
      </div>
    \`;
  },
};
`,
  );

  // ── src/stories/design-tokens/Spacing.stories.ts ─────────────────────────

  await safeWriteFile(
    path.join(designTokensStoriesDir, 'Spacing.stories.ts'),
    `import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';
import tokens from '../../tokens/tokens.json';

// Sprint 1.5b — accept both DTCG ({$value, $type}) and legacy ({value}).
type TokenEntry = { $value: string; $type?: string } | { value: string };
function tokenValue(t: TokenEntry): string {
  return '$value' in t ? t.$value : t.value;
}

const spaceTokens = tokens.space as Record<string, TokenEntry>;

const meta: Meta = {
  title: 'Foundations/Token Swatches/Spacing',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Spacing tokens from \`@helixui/tokens\`. Bar widths use live \`var(--hx-space-*)\` values.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

export const SpaceScale: Story = {
  name: 'Space Scale',
  render: () => {
    const entries = Object.entries(spaceTokens);
    return html\`
      <div style="font-family: var(--hx-font-sans, sans-serif); padding: 1rem;">
        <h3 style="margin: 0 0 1.5rem; font-size: 1rem; font-weight: 600;">Spacing Scale</h3>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          \${entries.map(([key, token]) => {
            const cssVar = \`--hx-space-\${key}\`;
            return html\`
              <div style="display: flex; align-items: center; gap: 1rem;">
                <div style="width: var(\${cssVar}, \${tokenValue(token)}); min-width: 4px; height: 24px; background: var(--hx-color-primary-500, #2563EB); border-radius: 3px; flex-shrink: 0;"></div>
                <div style="display: flex; gap: 1rem; align-items: baseline;">
                  <span style="font-size: 13px; font-weight: 500; min-width: 2rem;">\${key}</span>
                  <span style="font-size: 11px; color: #888; font-family: monospace;">\${cssVar}</span>
                  <span style="font-size: 11px; color: #aaa;">\${tokenValue(token)}</span>
                </div>
              </div>
            \`;
          })}
        </div>
      </div>
    \`;
  },
};
`,
  );

  // ── .storybook/vitest.setup.ts ───────────────────────────────────────────

  await safeWriteFile(
    path.join(storybookDir, 'vitest.setup.ts'),
    `import { setProjectAnnotations } from '@storybook/web-components';
import * as projectAnnotations from './preview';

// Apply project-level annotations (decorators, parameters, global types) so that
// Storybook's addon-vitest internal setup can call beforeAll on them correctly.
// https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest#setprojectannotations
setProjectAnnotations([projectAnnotations]);
`,
  );

  // ── vitest.config.ts ─────────────────────────────────────────────────────

  await safeWriteFile(
    path.join(options.directory, 'vitest.config.ts'),
    `import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    storybookTest({
      configDir: path.join(dirname, '.storybook'),
    }),
  ],
  optimizeDeps: {
    esbuildOptions: {
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true,
          useDefineForClassFields: false,
        },
      },
    },
  },
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: [path.join(dirname, '.storybook/vitest.setup.ts')],
    // Run story files sequentially to prevent browser OOM crashes
    fileParallelism: false,
    testTimeout: 30000,
    teardownTimeout: 30000,
    // Exclude the auto-generated catalog (90+ hx-* stories) from the
    // default \`pnpm test\` run. The build-tokens + cem:catalog chain
    // populates src/stories/catalog/ on every storybook boot, and
    // running browser-mode vitest across 90+ tags hits the same
    // chromium memory ceiling the build-output smoke runner has to
    // batch-rotate around. Catalog coverage is exercised separately
    // via \`pnpm test:build-smoke\`. Consumers who DO want unit-level
    // catalog tests can drop this exclude pattern.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/storybook-static/**',
      'src/stories/catalog/**',
    ],
  },
});
`,
  );

  // ── src/tokens/tokens.css — auto-generated placeholder ───────────────────

  // Written here as a stub so Vite's file graph picks it up on first start.
  // scripts/build-tokens.ts overwrites this file whenever tokens.json changes
  // and whenever \`pnpm build:tokens\` runs (chained into storybook/build/test).
  //
  // Paint-style utility classes — naming convention notes for the
  // generated output (so devs reading the source-controlled stub still
  // see the contract):
  //
  //   Figma paint style → CSS class
  //   ────────────────────────────────────────────────
  //   'Color / Surface / Default' → \`.color-surface-default\`
  //   'Color / Text / Strong'     → \`.color-text-strong\`
  //
  // Conversion: lowercase, runs of slashes + spaces collapse to a single
  // hyphen. Round-trips back to the originating Figma style name.
  await safeWriteFile(
    path.join(tokensDir, 'tokens.css'),
    `/* AUTO-GENERATED from src/tokens/tokens.json — do not edit by hand.
 *
 * Regenerate:  pnpm build:tokens
 * Watch mode:  pnpm watch:tokens   (runs during \`pnpm storybook\`)
 *
 * On first \`pnpm storybook\` / \`pnpm build\`, this file is rewritten with all
 * ${prefix}-* CSS custom properties flattened from tokens.json AND the
 * paint-style utility classes derived from the color.* token tree.
 *
 * Paint-style class naming (source: Figma paint styles):
 *   'Color / Surface / Default' → \`.color-surface-default\` + \`.bg-color-surface-default\`
 *   'Color / Text / Strong'     → \`.color-text-strong\`     + \`.bg-color-text-strong\`
 *
 * Conversion: lowercase the Figma path, collapse runs of slashes + spaces
 * to a single hyphen. The exact inverse of the Custom Helix Exporter's
 * style-name emission, so paint styles round-trip cleanly between Figma
 * and the generated CSS.
 */

@import '@helixui/tokens/tokens.css';

:root {
  /* tokens.json values will be emitted here on first build */
}
`,
  );

  // ── scripts/build-tokens.ts — the generator ──────────────────────────────

  const scriptsDir = path.join(options.directory, 'scripts');
  await safeEnsureDir(scriptsDir);
  await safeWriteFile(
    path.join(scriptsDir, 'build-tokens.ts'),
    `// Generates src/tokens/tokens.css from src/tokens/tokens.json.
//
// Walks the nested token tree ({category}.{group}?.{scale}.value) and emits
// \`${prefix}-{path}: {value};\` under \`:root\`. Imports @helixui/tokens first so
// the generated overrides win via cascade order.
//
// Usage:
//   tsx scripts/build-tokens.ts            # one-shot build
//   tsx scripts/build-tokens.ts --watch    # rebuild on tokens.json change
//
// Called by package.json scripts: \`build:tokens\` and \`watch:tokens\`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dirname, '..');
const INPUT  = path.join(ROOT, 'src/tokens/tokens.json');
const OUTPUT = path.join(ROOT, 'src/tokens/tokens.css');

const PREFIX = '${prefix}';

// Top-level keys that are theme variants — skipped; handled separately if ever.
// 'pluginVersion' is reserved by the Custom Helix Exporter envelope (S2.4)
// — never a token path, so always skip at the root.
const SKIP_ROOT: ReadonlySet<string> = new Set(['dark', 'high-contrast', 'pluginVersion']);

// Sprint 1.5b — read BOTH the DTCG shape (\`{$value, $type}\`, default
// from Custom Helix Exporter 0.6.0+) AND the legacy shape (\`{value}\`,
// pre-0.6 exporter and any tokens.json that hasn't been migrated yet).
// Single reader handles both during the 0.6.x deprecation window; the
// legacy branch emits a one-time deprecation warning so engineers see
// the migration window closing. 0.7.x will remove the legacy branch.
type DtcgLeaf = { $value: string | number; $type?: string };
type LegacyLeaf = { value: string | number };
type TokenLeaf = DtcgLeaf | LegacyLeaf;
type TokenNode = TokenLeaf | { [k: string]: TokenNode };

function isDtcgLeaf(n: unknown): n is DtcgLeaf {
  return (
    typeof n === 'object' &&
    n !== null &&
    '$value' in n &&
    (typeof (n as DtcgLeaf).$value === 'string' ||
      typeof (n as DtcgLeaf).$value === 'number')
  );
}

function isLegacyLeaf(n: unknown): n is LegacyLeaf {
  return (
    typeof n === 'object' &&
    n !== null &&
    'value' in n &&
    !('$value' in n) &&
    (typeof (n as LegacyLeaf).value === 'string' ||
      typeof (n as LegacyLeaf).value === 'number')
  );
}

function leafValue(n: TokenLeaf): string | number {
  if ('$value' in n) return n.$value;
  return n.value;
}

// One-shot deprecation warning per build — repeated warnings on every
// leaf would drown the build log without adding signal. Hoisted to module
// scope so the watch-mode rebuild path also fires it on each rebuild.
let legacyWarned = false;
function warnLegacyOnce(): void {
  if (legacyWarned) return;
  legacyWarned = true;
  console.warn(
    '[build-tokens] DEPRECATION: tokens.json uses the legacy {value} shape. ' +
      'The Custom Helix Exporter emits W3C DTCG ({$value, $type}) by default ' +
      'starting plugin 0.6.0. Legacy support will be removed in 0.7.x. ' +
      'Migrate via: \`tsx <figma-tokens>/scripts/migrate-tokens-to-dtcg.ts src/tokens/tokens.json\`',
  );
}

type CssVar = { name: string; value: string };

function walk(node: TokenNode, segments: string[], out: CssVar[]): void {
  if (isDtcgLeaf(node) || isLegacyLeaf(node)) {
    if (isLegacyLeaf(node)) warnLegacyOnce();
    const name = PREFIX + '-' + segments.join('-');
    out.push({ name, value: String(leafValue(node)) });
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  for (const [key, child] of Object.entries(node)) {
    walk(child as TokenNode, [...segments, key], out);
  }
}

function build(): { vars: number; output: string } {
  const raw = fs.readFileSync(INPUT, 'utf-8');
  const tokens = JSON.parse(raw) as Record<string, TokenNode>;

  const cssVars: CssVar[] = [];
  for (const [topKey, node] of Object.entries(tokens)) {
    if (SKIP_ROOT.has(topKey)) continue;
    walk(node, [topKey], cssVars);
  }

  // Group by top-level category for readable output
  const byCategory: Map<string, CssVar[]> = new Map();
  for (const v of cssVars) {
    const cat = v.name.slice(PREFIX.length + 1).split('-')[0];
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(v);
  }

  const lines: string[] = [];
  lines.push('/* AUTO-GENERATED from src/tokens/tokens.json — do not edit by hand.');
  lines.push(' *');
  lines.push(' * Regenerate:  pnpm build:tokens');
  lines.push(' * Watch mode:  pnpm watch:tokens   (runs during \`pnpm storybook\`)');
  lines.push(' */');
  lines.push('');
  lines.push("@import '@helixui/tokens/tokens.css';");
  lines.push('');
  lines.push(':root {');

  const categoryOrder = ['color', 'space', 'font', 'line-height', 'letter-spacing', 'border', 'shadow', 'duration', 'easing', 'transition', 'focus', 'opacity', 'size', 'button'];
  const ordered: string[] = [...categoryOrder.filter(c => byCategory.has(c)), ...Array.from(byCategory.keys()).filter(c => !categoryOrder.includes(c))];

  for (const cat of ordered) {
    lines.push(\`  /* \${cat} */\`);
    for (const v of byCategory.get(cat)!) {
      lines.push(\`  \${v.name}: \${v.value};\`);
    }
    lines.push('');
  }

  lines.push('}');
  lines.push('');

  // ── Paint-style utility classes ─────────────────────────────────────────
  //
  // Source-of-truth: Figma paint styles (slash-separated path labels —
  // e.g. \`Color / Surface / Default\`, \`Color / Text / Strong\`). The
  // Custom Helix Exporter (figma-tokens plugin) emits those style names
  // unchanged into tokens.json's nested color.* tree; we translate them
  // here into kebab-case CSS class names that round-trip back to the
  // exact paint style.
  //
  // Conversion rule (mirrors the inverse of figma-tokens' style-name
  // emission): lowercase the path and replace runs of slashes + spaces
  // with a single hyphen.
  //
  //   'Color / Surface / Default' → 'color-surface-default' → \`.color-surface-default\`
  //   'Color / Text / Strong'     → 'color-text-strong'     → \`.color-text-strong\`
  //
  // For every \`color.{path}\` token we emit two classes:
  //   - \`.color-{path}\`           — sets \`color\` (text/foreground)
  //   - \`.bg-color-{path}\`        — sets \`background-color\`
  // Both bind to the same CSS custom property generated above so paint
  // updates from Figma propagate to both layers automatically.
  const colorVars = byCategory.get('color') ?? [];
  if (colorVars.length > 0) {
    lines.push('/* Paint-style utility classes — source: Figma color paint styles.');
    lines.push(' * Conversion: \`Color / X / Y\` → \`.color-x-y\` (lowercase, slash+space → single hyphen).');
    lines.push(' * Each class binds to the matching --{prefix}-color-* var emitted above. */');
    for (const v of colorVars) {
      // v.name is like \`--bolt-color-surface-default\`. Strip the prefix
      // and the leading 'color-' segment to get the class suffix.
      const suffix = v.name.slice(PREFIX.length + 1); // 'color-surface-default'
      lines.push(\`.\${suffix} { color: var(\${v.name}); }\`);
      lines.push(\`.bg-\${suffix} { background-color: var(\${v.name}); }\`);
    }
    lines.push('');
  }

  return { vars: cssVars.length, output: lines.join('\\n') };
}

// Track the last time we wrote OUTPUT so we can ignore filesystem events
// triggered by our own write-back. INPUT and OUTPUT live in the same
// directory (\`src/tokens/\`); on macOS, fs.watch is backed by FSEvents which
// fires directory-level events, and Node has historically forwarded sibling
// writes to file-targeted watchers. Without this guard the watcher loops on
// its own output and rebuilds every ~3s.
let lastWriteTime = 0;
const SELF_WRITE_WINDOW_MS = 1000;
const REBUILD_DEBOUNCE_MS = 500;

function buildAndWrite(): void {
  const { vars, output } = build();
  fs.writeFileSync(OUTPUT, output, 'utf-8');
  lastWriteTime = Date.now();
  const rel = path.relative(ROOT, OUTPUT);
  console.log(\`[build-tokens] \${vars} CSS variables → \${rel}\`);
}

buildAndWrite();

if (process.argv.includes('--watch')) {
  const inputDir = path.dirname(INPUT);
  const inputFile = path.basename(INPUT);
  console.log(\`[build-tokens] watching \${path.relative(ROOT, INPUT)}\`);
  let rebuildTimer: NodeJS.Timeout | null = null;
  // Watch the PARENT DIRECTORY, not the file itself. Editors that save by
  // atomic rename (VS Code, JetBrains, prettier-on-save, prettier-cli)
  // replace the file, which severs an fs.watch attached to the original
  // inode — the watcher silently dies and tokens.css stops rebuilding
  // until storybook is restarted. Watching the directory and filtering
  // by filename survives atomic replaces.
  fs.watch(inputDir, (eventType, filename) => {
    // On platforms / filesystems where fs.watch delivers filename === null
    // for directory events (some Linux setups, network drives), accept
    // the event and let the rebuild run. The match is best-effort —
    // missing it means we'd silently stop regenerating tokens.css for
    // those environments, which is worse than a few extra rebuilds.
    if (filename !== null && filename !== inputFile) return;
    // Ignore events that fire within SELF_WRITE_WINDOW_MS of our own
    // OUTPUT write — without this, fs.watch on macOS loops on its own
    // sibling write to tokens.css and rebuilds every ~3s.
    if (Date.now() - lastWriteTime < SELF_WRITE_WINDOW_MS) return;
    // Debounce: editors often fire multiple events during save (atomic
    // replace = rename + change). 500ms covers the typical macOS burst
    // without making the watcher feel laggy.
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      try {
        buildAndWrite();
      } catch (err) {
        console.error('[build-tokens] error:', err instanceof Error ? err.message : err);
      }
    }, REBUILD_DEBOUNCE_MS);
  });
}
`,
  );

  // ── scripts/sync-tokens.ts — Figma REST pull + transform ─────────────────

  // Reset src/tokens/tokens.json from the upstream @helixui/tokens shape.
  // Wraps the prior inline `node -e` one-liner that crashed because
  // createRequire(__filename) under `node -e` evaluates __filename to
  // the literal "[eval]" and throws ERR_INVALID_ARG_VALUE. A real source
  // file gets a real file URL so createRequire(import.meta.url) resolves.
  await safeWriteFile(
    path.join(scriptsDir, 'refresh-tokens.ts'),
    `import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const upstream = require.resolve('@helixui/tokens/tokens.json');
copyFileSync(upstream, 'src/tokens/tokens.json');
console.log(\`tokens.json reset from \${upstream}\`);
`,
  );

  await safeWriteFile(
    path.join(scriptsDir, 'sync-tokens.ts'),
    `// Pulls design tokens from Figma via the Variables REST API, resolves
// the alias chain, and writes the nested {category.group.scale.value} shape
// this design system consumes.
//
// Requires .env with:
//   FIGMA_TOKEN                    - personal access token with file_variables:read
//   FIGMA_FILE_KEY                 - file key from the Figma URL
//   FIGMA_PRIMITIVES_COLLECTION    - (optional) variable-collection name; defaults to "HELiX Primitives"
//
// Note: Figma's Variables REST API is Enterprise-gated. If your workspace is
// not on Enterprise, use the HELiX Token Suite plugin's Custom HELiX Exporter
// command instead — it does the same work in the plugin sandbox on any plan.
//
// Usage:
//   tsx scripts/sync-tokens.ts
//
// Or via package.json:
//   pnpm tokens:sync   # runs this, then regenerates tokens.css via build:tokens

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'src/tokens/tokens.json');

const FIGMA_TOKEN         = process.env.FIGMA_TOKEN;
const FIGMA_FILE_KEY      = process.env.FIGMA_FILE_KEY;
const PRIMITIVES_NAME     = process.env.FIGMA_PRIMITIVES_COLLECTION ?? 'HELiX Primitives';

if (!FIGMA_TOKEN || !FIGMA_FILE_KEY) {
  console.error('[sync-tokens] Missing FIGMA_TOKEN or FIGMA_FILE_KEY in .env');
  console.error('[sync-tokens] Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

console.log(\`[sync-tokens] Fetching variables from Figma file \${FIGMA_FILE_KEY}\`);

const res = await fetch(
  \`https://api.figma.com/v1/files/\${FIGMA_FILE_KEY}/variables/local\`,
  { headers: { 'X-FIGMA-TOKEN': FIGMA_TOKEN } },
);

const data = (await res.json()) as Record<string, unknown>;

if (!res.ok) {
  const status = res.status;
  console.error(\`[sync-tokens] Figma API error \${status}\`);
  if (status === 403) {
    console.error('[sync-tokens] 403 typically means the workspace is not on Figma Enterprise.');
    console.error('[sync-tokens] Use the HELiX Token Suite plugin (Custom HELiX Exporter) instead.');
  }
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

interface FigmaCollection {
  name: string;
  modes: Array<{ modeId: string; name: string }>;
}
interface FigmaVariable {
  id: string;
  name: string;
  variableCollectionId: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
  valuesByMode: Record<string, unknown>;
}

const meta        = (data.meta ?? {}) as Record<string, unknown>;
const collections = (meta.variableCollections ?? {}) as Record<string, FigmaCollection>;
const variables   = (meta.variables           ?? {}) as Record<string, FigmaVariable>;

// Locate the primitives collection by name.
const primitivesEntry = Object.entries(collections).find(
  ([, c]) => c.name === PRIMITIVES_NAME,
);
if (!primitivesEntry) {
  console.error(\`[sync-tokens] Collection "\${PRIMITIVES_NAME}" not found in Figma file.\`);
  console.error(\`[sync-tokens] Available collections: \${Object.values(collections).map(c => c.name).join(', ')}\`);
  process.exit(1);
}
const [primitivesCollectionId, primitivesCollection] = primitivesEntry;
const defaultModeId = primitivesCollection.modes[0]?.modeId;
if (!defaultModeId) {
  console.error(\`[sync-tokens] Collection "\${PRIMITIVES_NAME}" has no modes.\`);
  process.exit(1);
}

// Resolve Figma's COLOR object to #rrggbb or #rrggbbaa. The 'a' channel
// is preserved when present and < 1 — otherwise common overlay/scrim
// tokens (e.g. a 70% white scrim) get serialised as opaque #ffffff and
// the generated design system renders the wrong colour.
function toHex(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as { r?: number; g?: number; b?: number; a?: number };
  if (typeof c.r !== 'number' || typeof c.g !== 'number' || typeof c.b !== 'number') return null;
  const h = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  const base = '#' + h(c.r) + h(c.g) + h(c.b);
  if (typeof c.a === 'number' && c.a < 1) return base + h(c.a);
  return base;
}

// Token name patterns that resolve to unitless numbers in CSS (font-weight,
// opacity, line-height, z-index, *-density-*). Append nothing for these —
// appending 'px' would emit invalid CSS like \`font-weight: 600px\`. Path-
// aware so it matches both flat (\`font-weight\`) and nested
// (\`font/weight/regular\`) Figma variable names.
//
// Note: \`duration\` is intentionally NOT in this list. Duration tokens
// resolve to time values and need a 'ms' suffix — see DURATION_PATTERNS.
const UNITLESS_PATTERNS: readonly RegExp[] = [
  /(?:^|[/-])font[-/]weight(?:$|[/-])/i,
  /(?:^|[/-])opacity(?:$|[/-])/i,
  /(?:^|[/-])line[-/]height(?:$|[/-])/i,
  /(?:^|[/-])z[-/]index(?:$|[/-])/i,
  /(?:^|[/-])density(?:$|[/-])/i,
];

// Token name patterns that resolve to CSS time values. These get a 'ms'
// suffix so build-tokens emits \`--…-duration-fast: 200ms\` rather than the
// invalid \`--…-duration-fast: 200\` that breaks every transition / animation
// reading the variable.
const DURATION_PATTERNS: readonly RegExp[] = [
  /(?:^|[/-])duration(?:$|[/-])/i,
  /(?:^|[/-])transition[-/]duration(?:$|[/-])/i,
  /(?:^|[/-])animation[-/]duration(?:$|[/-])/i,
];

function isUnitlessName(name: string): boolean {
  return UNITLESS_PATTERNS.some((re) => re.test(name));
}

function isDurationName(name: string): boolean {
  return DURATION_PATTERNS.some((re) => re.test(name));
}

// Walk VARIABLE_ALIAS refs until we reach a literal leaf, bounded for safety.
// \`name\` is the originating variable's full Figma path — used to decide whether
// a numeric leaf should be coerced to \`{n}px\` (default) or emitted bare (when
// the name pattern marks it as unitless).
function resolveValue(raw: unknown, name: string, depth = 0): string | null {
  if (depth > 8) return null;
  if (raw == null) return null;

  if (typeof raw === 'object' && (raw as { type?: string }).type === 'VARIABLE_ALIAS') {
    const targetId = (raw as { id: string }).id;
    const target = variables[targetId];
    if (!target) return null;
    const targetCollection = collections[target.variableCollectionId];
    const targetMode = targetCollection?.modes[0]?.modeId;
    if (!targetMode) return null;
    // Carry the originating variable's name down so the unitless decision is
    // anchored on what the consumer asked for, not the alias target's name.
    return resolveValue(target.valuesByMode[targetMode], name, depth + 1);
  }

  const hex = toHex(raw);
  if (hex) return hex;
  if (typeof raw === 'number') {
    if (isDurationName(name)) return String(raw) + 'ms';
    if (isUnitlessName(name)) return String(raw);
    return String(raw) + 'px';
  }
  if (typeof raw === 'string') return raw;
  return null;
}

type TokenLeaf = { value: string };
type TokenTree = TokenLeaf | { [k: string]: TokenTree };

function setDeep(root: { [k: string]: TokenTree }, segments: string[], leaf: TokenLeaf): void {
  let cursor = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const existing = cursor[seg];
    if (!existing || 'value' in (existing as TokenLeaf)) {
      cursor[seg] = {};
    }
    cursor = cursor[seg] as { [k: string]: TokenTree };
  }
  cursor[segments[segments.length - 1]] = leaf;
}

const output: { [k: string]: TokenTree } = {};
let emitted = 0;
let skipped = 0;

for (const v of Object.values(variables)) {
  if (v.variableCollectionId !== primitivesCollectionId) continue;
  const segments = v.name.split('/').filter(Boolean);
  if (segments.length < 2) { skipped++; continue; }

  const value = resolveValue(v.valuesByMode[defaultModeId], v.name);
  if (value === null) { skipped++; continue; }

  setDeep(output, segments, { value });
  emitted++;
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\\n', 'utf-8');

const rel = path.relative(ROOT, OUTPUT);
console.log(\`[sync-tokens] \${emitted} tokens written → \${rel}\`);
if (skipped > 0) console.log(\`[sync-tokens] \${skipped} variables skipped (unresolvable aliases or single-segment names)\`);
`,
  );

  // ── .env.example — Figma API credentials template ────────────────────────

  await safeWriteFile(
    path.join(options.directory, '.env.example'),
    `# Figma API credentials for \`pnpm tokens:sync\`.
# Copy this file to \`.env\` and fill in the values. \`.env\` is gitignored.

# Personal access token with file_variables:read scope.
# Create one at: https://www.figma.com/developers/api#access-tokens
FIGMA_TOKEN=

# File key from the Figma URL:
#   https://www.figma.com/file/<KEY>/<name>
FIGMA_FILE_KEY=

# (Optional) Name of the variable collection that holds primitive leaves.
# Defaults to "HELiX Primitives" — only override if your file names it differently.
# FIGMA_PRIMITIVES_COLLECTION=HELiX Primitives
`,
  );

  // ── src/tokens/tokens.json — local copy for Figma drop-in workflow ────────

  // Copy tokens.json from @helixui/tokens so design-token stories read from
  // a local file. Replace this file with a Figma export to see updates live.
  await (async () => {
    try {
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      const tokensJsonPath = require.resolve('@helixui/tokens/tokens.json');
      const srcTokens = await import('fs-extra');
      await srcTokens.copy(tokensJsonPath, path.join(tokensDir, 'tokens.json'));
    } catch {
      // If @helixui/tokens is not installed in the scaffolder's context, write
      // a minimal stub so the project still type-checks. Includes button.* so
      // HelixButton's font/focus fallbacks resolve without hardcoded overrides.
      //
      // Semantic groups mirror Helix 3.3.1's tokens.json shape:
      //   color.{text,border,surface,action,...}
      // Components consume `--{prefix}-color-{group}-{role}` (e.g.
      // `--{prefix}-color-text-on-primary-strong`); the build-tokens walker
      // flattens the nested tree into those CSS custom property names.
      const stub = {
        color: {
          // text.* — body, headings, on-{role}, on-{role}-strong (added in 3.2.1
          // for the white-on-darker-{role} contrast remediation).
          text: {
            'on-primary-strong': { value: 'var(--hx-color-neutral-0)' },
            'on-error-strong': { value: 'var(--hx-color-neutral-0)' },
          },
          // border.* — neutral borders + on-dark-* family for inverted surfaces.
          border: {
            'on-dark-strong': { value: 'var(--hx-color-overlay-white-70)' },
            'on-dark-default': { value: 'var(--hx-color-overlay-white-50)' },
            'on-dark-subtle': { value: 'var(--hx-color-overlay-white-30)' },
          },
          // action.* — 3.2.1 interactive-state semantic tier between the
          // primitive ramp (color.{role}.{stop}) and component-tier overrides
          // (--{prefix}-{component}-bg, etc). 4 roles × 4 states = 16 tokens.
          // Components rebind their --{prefix}-{component}-bg through these
          // semantics so theme overrides at the action.* tier propagate
          // everywhere a role is consumed.
          action: {
            primary: {
              bg: { value: 'var(--hx-color-primary-500)' },
              'bg-hover': { value: 'var(--hx-color-primary-600)' },
              'bg-active': { value: 'var(--hx-color-primary-700)' },
              'bg-inverted-hover': { value: 'var(--hx-color-primary-400)' },
            },
            secondary: {
              bg: { value: 'var(--hx-color-secondary-500)' },
              'bg-hover': { value: 'var(--hx-color-secondary-600)' },
              'bg-active': { value: 'var(--hx-color-secondary-700)' },
              'bg-inverted-hover': { value: 'var(--hx-color-secondary-400)' },
            },
            ghost: {
              bg: { value: 'transparent' },
              'bg-hover': { value: 'var(--hx-color-primary-50)' },
              'bg-active': { value: 'var(--hx-color-primary-100)' },
              'bg-inverted-hover': {
                value: 'var(--hx-color-surface-on-dark-overlay-default)',
              },
            },
            danger: {
              bg: { value: 'var(--hx-color-error-500)' },
              'bg-hover': { value: 'var(--hx-color-error-600)' },
              'bg-active': { value: 'var(--hx-color-error-700)' },
              'bg-inverted-hover': { value: 'var(--hx-color-error-400)' },
            },
          },
        },
        space: {},
        border: { radius: {}, width: {} },
        shadow: {},
        font: {
          sans: { value: 'system-ui, sans-serif' },
        },
        button: {
          'font-family': { value: 'system-ui, sans-serif' },
          'font-weight': { value: '500' },
          'focus-ring-color': { value: '#60a5fa' },
        },
        // responsive.* — starter responsive semantic mode (single-axis:
        // mobile / tablet / desktop). Per Charles Attisano (Helix design
        // lead, _brainstorm canvas 329:1199): every consumer of helix-tokens
        // must declare its own responsive mode, since upstream cannot ship
        // breakpoints — every consumer has different breakpoint needs.
        // Override these values to match your breakpoint scheme.
        responsive: {
          grid: {
            columns: {
              mobile: { value: 4 },
              tablet: { value: 8 },
              desktop: { value: 12 },
            },
          },
          stack: {
            gap: {
              mobile: { value: '8px' },
              tablet: { value: '16px' },
              desktop: { value: '24px' },
            },
          },
          'font-size-scale': {
            mobile: { value: 0.875 },
            tablet: { value: 1 },
            desktop: { value: 1 },
          },
        },
      };
      await safeWriteFile(
        path.join(tokensDir, 'tokens.json'),
        JSON.stringify(stub, null, 2) + '\n',
      );
    }
  })();

  // ── CLAUDE.md — per-project agent guidance ───────────────────────────────
  //
  // Documents the Layout Rule 13 INSTANCE_SWAP slot prop convention so any
  // downstream agent (Claude Code, Cursor, etc.) generating new compound
  // components in the scaffolded project follows the same naming algorithm
  // the figma-tokens plugin uses on the Figma side. Without this, agents
  // routinely invent semantic per-component prop names ("primaryAction") and
  // break the round-trip into Code Connect.

  await safeWriteFile(
    path.join(options.directory, 'CLAUDE.md'),
    `# ${dsTitle} Design System — agent guidance

This is a HELiX-based design system factory scaffolded by
[\`create-helix\`](https://www.npmjs.com/package/create-helix). Components are
authored in Lit 3, exposed as web components, themed via CSS custom
properties, and documented in Storybook 10.

## Tech stack

- **Lit 3** — reactive web components.
- **HELiX** (\`@helixui/library\`) — the component primitive layer this DS
  extends. The base class \`${BaseClass}\` (\`src/base/${ds}-element.ts\`)
  extends \`HelixElement\` for form-association + ARIA delegation.
- **Storybook 10** with the web-components-vite framework.
- **Playwright** (via \`@vitest/browser\`) for story interaction tests.
- **Custom Elements Manifest** (\`@custom-elements-manifest/analyzer\`) drives
  Storybook's autodocs API tables.

## Token cascade

The token chain is \`${prefix}-* → --hx-* → component CSS\`. \`scripts/build-tokens.ts\`
walks \`src/tokens/tokens.json\` and emits \`${prefix}-{path}: value;\` declarations
into \`src/tokens/tokens.css\`. Component bridges (e.g.
\`src/components/${ds}-button/${ds}-button.styles.ts\`) re-bind \`${prefix}-*\` to
the \`--hx-*\` names HELiX's shadow DOM reads internally.

Two-level var() fallback chain (do not collapse to a single level):

\`\`\`css
--hx-button-bg: var(${prefix}-button-bg, var(${prefix}-color-action-primary-bg));
\`\`\`

Setting the component-tier hook (\`${prefix}-button-bg\`) recolors only this
button. Setting the semantic-tier hook (\`${prefix}-color-action-primary-bg\`)
recolors every primary action surface across the system. The component-tier
name has to be provided as the inner fallback because HELiX's internal CSS
reads \`--hx-button-bg\` directly.

## Layout Rule 13 — INSTANCE_SWAP slot prop naming

Compound components with INSTANCE_SWAP slots in Figma map slot names to
TypeScript / Lit reactive properties via a pure string transform:

    slot-name → kebab-case → camelCase

    'Action 1'      → 'action-1'      → 'action1'
    'Item 2'        → 'item-2'        → 'item2'
    'Header Cell 3' → 'header-cell-3' → 'headerCell3'

\`src/stories/_slot-props.ts\` exports \`slotNameToProp()\` — the single source of
truth. **Always** call it when generating slot props; do **not** hand-author
names. The Figma plugin (\`figma-tokens/plugin/lib/instances.ts\`) uses the
identical algorithm via \`declareSwapSlot()\`. Round-trip integrity through
Code Connect depends on both sides agreeing.

Rejected alternatives (do not introduce):

- \`primaryAction\` — semantic per-component naming does not scale across the
  ~35 compound components in the kit and loses the positional contract Code
  Connect needs (\`figma.children('Action 1')\`).
- \`action1Slot\` — the \`Slot\` suffix is redundant in TypeScript; the prop
  type already conveys it.
- \`actions: HxButton[]\` — Figma exposes discrete \`Action 1\` / \`Action 2\`
  INSTANCE_SWAP slots; an array prop loses Code Connect's discrete mapping.

Open-slot compounds (grid, stack, container, popup, popover, tooltip —
anywhere the CEM declares an unnamed default slot) use slot name **\`Items\`**
mapping to React \`children\` / Lit default slot.

## Variant axes

Each component with variant axes ships a co-located \`variants.ts\` exporting:

\`\`\`ts
export const VARIANT_VALUES = ['primary', 'secondary', /* ... */] as const;
export type Variant = typeof VARIANT_VALUES[number];
\`\`\`

Use a **plain string union**, not a discriminated union. Storybook
\`argTypes\` MUST read from \`VARIANT_VALUES\` so Code Connect's
\`figma.enum('variant', ...)\` aligns with both runtime + story values.

## Quick start

\`\`\`bash
pnpm storybook         # dev server with token + catalog watch
pnpm test              # Playwright story interaction tests
pnpm build             # tokens + library
pnpm cem:analyze       # regenerate custom-elements.json (Storybook autodocs)
pnpm cem:catalog       # regenerate per-component HELiX catalog stories
\`\`\`

## Source-of-truth references

- \`src/stories/_slot-props.ts\` — Rule 13 algorithm (this project's authority).
- \`figma-tokens/plugin/lib/instances.ts\` (\`declareSwapSlot\`) — Figma side.
- Layout Rules — Renderer & Component Authoring Contract (\`bst-cto-kb\`).
`,
  );

  // ── src/index.ts — barrel export ─────────────────────────────────────────

  await safeWriteFile(
    path.join(srcDir, 'index.ts'),
    `// ${dsTitle} Design System — library entry point
export { ${BaseClass} } from './base/${ds}-element.js';
export { ${ClassName}Button } from './components/${ds}-button/${ds}-button.js';
export { ${ClassName}ButtonStyles } from './components/${ds}-button/${ds}-button.styles.js';
export type { ButtonVariant } from './components/${ds}-button/${ds}-button.styles.js';
`,
  );

  // ── vite.config.ts — library mode ───────────────────────────────────────

  await safeWriteFile(
    path.join(options.directory, 'vite.config.ts'),
    `import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      // Externalize Lit AND every @helixui/* package. If @helixui/library
      // gets inlined into dist/, downstream consumers that also import
      // raw hx-* components end up with two copies of the Helix runtime
      // and trip duplicate customElements.define() registrations
      // (e.g. "hx-button" already defined). Helix packages MUST stay
      // peer dependencies, declared and shared by the consumer.
      external: ['lit', /^lit\\//, /^@helixui\\//],
      output: {
        preserveModules: true,
      },
    },
  },
});
`,
  );

  // ── tsconfig.json — CRITICAL: both flags required for Lit decorators ─────
  // Missing experimentalDecorators OR useDefineForClassFields:false causes
  // components to register but render nothing (silent failure).

  await safeWriteJson(
    path.join(options.directory, 'tsconfig.json'),
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        experimentalDecorators: true,
        useDefineForClassFields: false,
        // JSX support is required because the scaffold emits .tsx React
        // helpers under src/stories/_components/ and .storybook/docs/
        // (HelixDocsPage, A11yStatusCard, etc.). Without `jsx`, both
        // `pnpm type-check` and `pnpm build`'s declaration step fail with
        // TS17004: Cannot use JSX unless the '--jsx' flag is provided.
        jsx: 'react-jsx',
      },
      include: ['src', '.storybook'],
      exclude: ['node_modules', 'dist', 'storybook-static'],
    },
    { spaces: 2 },
  );

  // ── tsconfig.build.json — declaration emit for `pnpm build` ──────────────
  // Scopes tsc to src/ only with rootDir=src so emitted .d.ts files land
  // directly under dist/ (matching package.json's "types": "./dist/index.d.ts")
  // instead of the default dist/src/ that comes from including .storybook.
  await safeWriteJson(
    path.join(options.directory, 'tsconfig.build.json'),
    {
      extends: './tsconfig.json',
      compilerOptions: {
        rootDir: 'src',
        outDir: 'dist',
        declaration: true,
        emitDeclarationOnly: true,
        noEmit: false,
      },
      // Library declaration build only walks the publishable surface:
      // base classes + components + the index barrel + tokens. Storybook
      // story files import root-level artifacts (helix.storybook.config,
      // custom-elements.json, _components/HelixDocsPage) that live
      // outside rootDir: 'src', and they're not part of the library
      // anyway — including them would error out the declaration build
      // and ship .d.ts files for stories no consumer would import.
      include: ['src/index.ts', 'src/base/**/*.ts', 'src/components/**/*.ts', 'src/tokens/**/*.ts'],
      exclude: [
        'node_modules',
        'dist',
        'storybook-static',
        '.storybook',
        'src/stories',
        'src/**/*.test.ts',
        'src/**/*.stories.ts',
        'src/**/*.stories.tsx',
        'src/**/*.mdx',
      ],
    },
    { spaces: 2 },
  );

  // ── src/vite-env.d.ts — ambient module declarations ─────────────────────
  // .storybook/preview.ts and the docs helpers import bare CSS files
  // (./docs/helix-docs.css, etc.). Vite handles these at runtime via
  // its CSS plugin, but TypeScript needs a shim to resolve the imports
  // during `pnpm type-check` and the declaration-emit step in
  // `pnpm build`. Without this, both fail with TS2307: Cannot find
  // module './docs/helix-docs.css' or its corresponding type declarations.
  await safeWriteFile(
    path.join(srcDir, 'vite-env.d.ts'),
    `/// <reference types="vite/client" />

// Vite handles CSS imports at the build layer. TypeScript needs an
// ambient module declaration to type-check the bare \`import './foo.css';\`
// pattern used throughout .storybook/ and src/stories/.
declare module '*.css';
declare module '*.json' {
  const value: unknown;
  export default value;
}
`,
  );

  // ── custom-elements.json — CEM stub (populated by pnpm run cem:analyze) ──

  await safeWriteJson(
    path.join(options.directory, 'custom-elements.json'),
    {
      schemaVersion: '1.0.0',
      readme: '',
      modules: [],
    },
    { spaces: 2 },
  );
}

async function scaffoldPreactVite(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  const componentsDir = path.join(srcDir, 'components');
  await safeEnsureDir(srcDir);
  await safeEnsureDir(componentsDir);

  // Generate unique install tracking ID
  const installId = randomBytes(8).toString('hex');

  // Copy brand assets into public/og/
  const assetsSource = path.join(new URL('.', import.meta.url).pathname, '..', 'assets', 'og');
  const publicOgDir = path.join(options.directory, 'public', 'og');
  if (await fs.pathExists(assetsSource)) {
    await safeCopyDir(assetsSource, publicOgDir);
  }

  // Override tsconfig for Preact — needs jsx: 'react-jsx' with jsxImportSource
  // pointing at preact so the JSX transform resolves to preact/jsx-runtime.
  if (options.typescript) {
    await safeWriteJson(
      path.join(options.directory, 'tsconfig.json'),
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'react-jsx',
          jsxImportSource: 'preact',
        },
        include: ['src'],
        exclude: ['node_modules'],
      },
      { spaces: 2 },
    );
  }

  // vite.config.ts
  await safeWriteFile(
    path.join(options.directory, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
});
`,
  );

  // index.html — includes OG meta tags for social sharing
  await safeWriteFile(
    path.join(options.directory, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSP_META}
    <title>${sanitizeForHtml(options.name)}</title>
    <meta name="description" content="Enterprise web components with Preact and Vite." />
    <meta property="og:title" content="${sanitizeForHtml(options.name)} — Built with HELiX" />
    <meta property="og:image" content="/og/helixui.png" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>
`,
  );

  // src/index.tsx — render mount
  await safeWriteFile(
    path.join(srcDir, 'index.tsx'),
    `import { render } from 'preact';
import { App } from './app';
${options.designTokens ? "import './helix-setup';" : "import '@helixui/library';"}
import './index.css';

render(<App />, document.getElementById('app')!);
`,
  );

  // src/helix.d.ts — JSX type declarations for hx-* custom elements
  // Preact has its own JSX namespace — augment IntrinsicElements there.
  await safeWriteFile(
    path.join(srcDir, 'helix.d.ts'),
    `/**
 * JSX type declarations for HELiX web components.
 *
 * Augments Preact's IntrinsicElements so TypeScript understands hx-* tags in JSX.
 * Properties are typed broadly for flexibility — the web component runtime handles
 * the actual attribute/property reflection.
 */
import 'preact';

type HxElement = preact.JSX.HTMLAttributes<HTMLElement> & Record<string, unknown>;

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'hx-accordion': HxElement;
      'hx-accordion-item': HxElement;
      'hx-alert': HxElement;
      'hx-avatar': HxElement;
      'hx-badge': HxElement;
      'hx-banner': HxElement;
      'hx-breadcrumb': HxElement;
      'hx-button': HxElement;
      'hx-button-group': HxElement;
      'hx-card': HxElement;
      'hx-carousel': HxElement;
      'hx-checkbox': HxElement;
      'hx-checkbox-group': HxElement;
      'hx-code-snippet': HxElement;
      'hx-color-picker': HxElement;
      'hx-combobox': HxElement;
      'hx-counter': HxElement;
      'hx-data-table': HxElement;
      'hx-date-picker': HxElement;
      'hx-dialog': HxElement;
      'hx-divider': HxElement;
      'hx-drawer': HxElement;
      'hx-dropdown': HxElement;
      'hx-field': HxElement;
      'hx-field-label': HxElement;
      'hx-file-upload': HxElement;
      'hx-grid': HxElement;
      'hx-icon': HxElement;
      'hx-icon-button': HxElement;
      'hx-menu': HxElement;
      'hx-menu-item': HxElement;
      'hx-meter': HxElement;
      'hx-nav': HxElement;
      'hx-pagination': HxElement;
      'hx-popover': HxElement;
      'hx-progress-bar': HxElement;
      'hx-progress-ring': HxElement;
      'hx-radio-group': HxElement;
      'hx-rating': HxElement;
      'hx-select': HxElement;
      'hx-skeleton': HxElement;
      'hx-slider': HxElement;
      'hx-spinner': HxElement;
      'hx-split-button': HxElement;
      'hx-split-panel': HxElement;
      'hx-stat': HxElement;
      'hx-status-indicator': HxElement;
      'hx-switch': HxElement;
      'hx-tab': HxElement;
      'hx-tab-panel': HxElement;
      'hx-tabs': HxElement;
      'hx-tag': HxElement;
      'hx-text': HxElement;
      'hx-text-input': HxElement;
      'hx-textarea': HxElement;
      'hx-theme': HxElement;
      'hx-toast': HxElement;
      'hx-tooltip': HxElement;
      'hx-top-nav': HxElement;
      'hx-tree-item': HxElement;
      'hx-tree-view': HxElement;
    }
  }
}

export {};
`,
  );

  // src/components/navbar.tsx — top navigation with dark mode toggle
  await safeWriteFile(
    path.join(componentsDir, 'navbar.tsx'),
    `import { useCallback, useEffect, useRef } from 'preact/hooks';

export function Navbar() {
  const switchRef = useRef<HTMLElement>(null);

  const applyTheme = useCallback((theme: 'light' | 'dark') => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('hx-theme').forEach((el) => {
      (el as HTMLElement & { theme: string }).theme = theme;
    });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('helix-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    applyTheme(isDark ? 'dark' : 'light');
    if (switchRef.current) {
      (switchRef.current as HTMLInputElement).checked = isDark;
    }
  }, [applyTheme]);

  const handleChange = useCallback((e: Event) => {
    const checked = (e as CustomEvent).detail?.checked ?? false;
    const theme = checked ? 'dark' : 'light';
    applyTheme(theme);
    localStorage.setItem('helix-theme', theme);
  }, [applyTheme]);

  useEffect(() => {
    const el = switchRef.current;
    el?.addEventListener('hx-change', handleChange);
    return () => el?.removeEventListener('hx-change', handleChange);
  }, [handleChange]);

  return (
    <hx-top-nav sticky label="Main navigation">
      <div slot="logo">
        <a href="/" style="display:flex;align-items:center;gap:0.75rem;text-decoration:none;color:inherit;">
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <img src="/og/bs-hx-square.png" alt="HELiX" style="height:30px;width:30px;border-radius:5px;" />
            <span style="font-weight:700;font-size:1.125rem;letter-spacing:-0.025em;">HELiX</span>
          </div>
          <span style="opacity:0.25;font-size:1.25rem;font-weight:200;">+</span>
          <span style="font-weight:600;font-size:0.95rem;opacity:0.9;">Preact</span>
        </a>
      </div>
      <div style="display:flex;gap:1.5rem;align-items:center;margin-left:2rem;">
        <a href="#components" style="color:inherit;text-decoration:none;font-size:0.875rem;opacity:0.8;">Components</a>
        <a href="#interactive" style="color:inherit;text-decoration:none;font-size:0.875rem;opacity:0.8;">Demo</a>
        <a href="#getting-started" style="color:inherit;text-decoration:none;font-size:0.875rem;opacity:0.8;">Docs</a>
      </div>
      <div slot="actions" style="display:flex;align-items:center;gap:0.75rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <span style="font-size:0.8rem;">Dark</span>
          <hx-switch ref={switchRef} size="sm" />
        </div>
        <a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer"
          style="color:inherit;display:flex;align-items:center;opacity:0.7;" title="Booked Solid on GitHub">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
        <a href="https://bookedsolid.tech" target="_blank" rel="noopener noreferrer"
          style="display:flex;align-items:center;" title="Booked Solid Technology">
          <img src="https://bookedsolid.tech/logos/bs-bs-software-square.png?utm_source=create-helix&utm_medium=scaffold&utm_id=${installId}" alt="Booked Solid" style="height:28px;width:28px;border-radius:4px;" />
        </a>
      </div>
    </hx-top-nav>
  );
}
`,
  );

  // src/components/footer.tsx
  await safeWriteFile(
    path.join(componentsDir, 'footer.tsx'),
    `export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
              <img src="/og/bs-hx-square.png" alt="HELiX" style="height:32px;width:32px;border-radius:4px;" />
              <span style="font-weight:700;font-size:1.125rem;">HELiX</span>
            </div>
            <p class="text-secondary" style="font-size:0.85rem;line-height:1.6;max-width:280px;">
              Enterprise web components built on Lit 3. Accessible, themeable, and framework-agnostic.
            </p>
          </div>
          <div>
            <h4 class="footer-heading">Product</h4>
            <ul class="footer-links">
              <li><a href="#components">Components</a></li>
              <li><a href="#interactive">Demo</a></li>
              <li><a href="#getting-started">Documentation</a></li>
            </ul>
          </div>
          <div>
            <h4 class="footer-heading">Ecosystem</h4>
            <ul class="footer-links">
              <li><a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX UI</a></li>
              <li><a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer">HELiXiR</a></li>
              <li><a href="https://bookedsolid.tech/discord-ops" target="_blank" rel="noopener noreferrer">Discord-Ops</a></li>
              <li><a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer">GitHub</a></li>
            </ul>
          </div>
          <div>
            <h4 class="footer-heading">Legal</h4>
            <ul class="footer-links">
              <li><a href="https://bookedsolid.tech/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
              <li><a href="https://bookedsolid.tech/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a></li>
              <li><a href="https://bookedsolid.tech/about" target="_blank" rel="noopener noreferrer">About</a></li>
            </ul>
          </div>
        </div>
        <hx-divider style="margin:2rem 0 1.5rem;"></hx-divider>
        <div class="footer-bottom">
          <p class="text-secondary" style="font-size:0.8rem;">
            &copy; {year} Booked Solid Technology, a d/b/a of Clarity House LLC. All rights reserved.
            Built with <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX</a> and <a href="https://preactjs.com" target="_blank" rel="noopener noreferrer">Preact</a>.
          </p>
          <div style="display:flex;gap:1rem;align-items:center;">
            <a href="https://github.com/bookedsolidtech" target="_blank" rel="noopener noreferrer"
              class="text-secondary" style="display:flex;" title="GitHub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
            <a href="https://bookedsolid.tech" target="_blank" rel="noopener noreferrer"
              style="display:flex;align-items:center;" title="Booked Solid Technology">
              <img src="/og/bs-bs-software-square.png" alt="BS" style="height:20px;width:20px;border-radius:3px;opacity:0.7;" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
`,
  );

  // src/app.tsx — Production landing page
  // Preact uses class (not className), addEventListener for custom events
  // HELiX web components work natively — no React wrappers needed
  await safeWriteFile(
    path.join(srcDir, 'app.tsx'),
    `import { useState, useRef, useEffect } from 'preact/hooks';
import { Navbar } from './components/navbar';
import { Footer } from './components/footer';

export function App() {
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const nameInputRef = useRef<HTMLElement>(null);
  const greetBtnRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const input = nameInputRef.current;
    const btn = greetBtnRef.current;

    const handleInput = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setName(detail?.value ?? '');
    };

    const handleClick = () => {
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    };

    input?.addEventListener('hx-input', handleInput);
    btn?.addEventListener('hx-click', handleClick);

    return () => {
      input?.removeEventListener('hx-input', handleInput);
      btn?.removeEventListener('hx-click', handleClick);
    };
  }, []);

  return (
    <hx-theme theme="auto">
      <Navbar />

      {/* Hero */}
      <section class="hero">
        <div class="container">
          <h1>HELiX + Preact + Vite</h1>
          <p>
            Enterprise-grade web components in a 3kB runtime.
            75+ accessible, themeable HELiX components work natively with Preact — no wrappers needed.
          </p>
          <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
            <hx-button variant="primary" size="lg">
              <a href="#components" style="color:inherit;text-decoration:none;">See Components</a>
            </hx-button>
            <hx-button variant="secondary" size="lg">
              <a href="#interactive" style="color:inherit;text-decoration:none;">Try the Demo</a>
            </hx-button>
          </div>
          <div style="display:flex;gap:0.5rem;justify-content:center;margin-top:1.5rem;flex-wrap:wrap;">
            <hx-tag>Lit 3</hx-tag>
            <hx-tag>Shadow DOM</hx-tag>
            <hx-tag>WCAG 2.1 AA</hx-tag>
            <hx-tag>3kB Preact</hx-tag>
            <hx-tag>Vite</hx-tag>
          </div>
        </div>
      </section>

      {/* Component Showcase */}
      <section id="components" class="container section">
        <div class="section-header">
          <h2>Component Showcase</h2>
          <p>A sampling of HELiX components — all rendered as native web components via Shadow DOM.</p>
        </div>

        <div class="grid-auto">
          {/* Button Variants */}
          <hx-card>
            <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Button Variants</h3>
              <hx-badge variant="success">Actions</hx-badge>
            </div>
            <p class="text-secondary" style="margin-bottom:1rem;">
              All button styles respond to the active theme.
            </p>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
              <hx-button variant="primary" size="sm">Primary</hx-button>
              <hx-button variant="secondary" size="sm">Secondary</hx-button>
              <hx-button variant="danger" size="sm">Danger</hx-button>
              <hx-button variant="ghost" size="sm">Ghost</hx-button>
            </div>
          </hx-card>

          {/* Badges & Tags */}
          <hx-card>
            <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Badges &amp; Tags</h3>
              <hx-badge variant="info">Status</hx-badge>
            </div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
              <hx-badge variant="info">Info</hx-badge>
              <hx-badge variant="success">Success</hx-badge>
              <hx-badge variant="warning">Warning</hx-badge>
              <hx-badge variant="danger">Danger</hx-badge>
            </div>
            <hx-divider style="margin:0.75rem 0;"></hx-divider>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
              <hx-tag>v1.1.2</hx-tag>
              <hx-tag>stable</hx-tag>
              <hx-tag>MIT</hx-tag>
            </div>
          </hx-card>

          {/* Data Display */}
          <hx-card>
            <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Data Display</h3>
              <hx-badge variant="warning">Metrics</hx-badge>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span>Build Status</span>
                <hx-badge variant="success">Passing</hx-badge>
              </div>
              <hx-progress-bar value={87} max={100}></hx-progress-bar>
              <div style="display:flex;gap:1rem;align-items:center;margin-top:0.5rem;">
                <hx-avatar size="sm">AB</hx-avatar>
                <hx-avatar size="md">CD</hx-avatar>
                <hx-avatar size="lg">EF</hx-avatar>
              </div>
            </div>
          </hx-card>

          {/* Why Preact */}
          <hx-card>
            <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Why Preact?</h3>
              <hx-badge variant="danger">3kB</hx-badge>
            </div>
            <ul style="line-height:2;padding-left:1.5rem;">
              <li>Same modern API as React — minimal learning curve</li>
              <li>3kB runtime vs 45kB+ for React</li>
              <li>Native web component support — no wrappers needed</li>
              <li>Vite hot-reload for rapid development</li>
            </ul>
          </hx-card>
        </div>
      </section>

      {/* Interactive Demo */}
      <section id="interactive" class="container section" style="border-top:1px solid var(--hx-page-border);">
        <div class="section-header">
          <h2>Interactive Demo</h2>
          <p>HELiX custom events work natively in Preact via addEventListener — no adapter layer needed.</p>
        </div>

        <div class="grid-auto">
          <hx-card>
            <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Say Hello</h3>
              <hx-badge variant="info">hx-input + hx-click</hx-badge>
            </div>
            <div style="display:flex;flex-direction:column;gap:1rem;">
              <hx-text-input
                ref={nameInputRef}
                label="Your name"
                placeholder="Enter your name"
              ></hx-text-input>
              <hx-button ref={greetBtnRef} variant="primary">
                Say Hello
              </hx-button>
              {submitted && (
                <hx-alert variant="success" open>
                  Hello, {name || 'World'}! HELiX components are working.
                </hx-alert>
              )}
            </div>
          </hx-card>

          <hx-card>
            <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Preact Patterns</h3>
              <hx-badge variant="warning">Architecture</hx-badge>
            </div>
            <ul style="line-height:2;padding-left:1.5rem;">
              <li><strong>useRef</strong> — attach refs to hx-* elements</li>
              <li><strong>addEventListener</strong> — listen for hx-click, hx-input etc.</li>
              <li><strong>useState</strong> — react to custom event data</li>
              <li><strong>class</strong> not className — Preact uses HTML attribute names</li>
            </ul>
          </hx-card>
        </div>
      </section>

      {/* Ecosystem Promos */}
      <section class="container section" style="border-top:1px solid var(--hx-page-border);">
        <div class="section-header">
          <h2>The Booked Solid Ecosystem</h2>
          <p>Enterprise-grade tools for modern web development and AI-powered workflows.</p>
        </div>
        <div class="promo-grid">
          <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer" class="promo-card">
            <img src="/og/helixui.png" alt="HELiX UI — 80+ enterprise web components." class="promo-card-image" />
            <div class="promo-card-body">
              <h3>HELiX UI</h3>
              <p>
                80+ enterprise web components built on Lit 3. Shadow DOM encapsulation,
                healthcare-first accessibility, and W3C DTCG design tokens. Works everywhere.
              </p>
              <span class="promo-card-cta">Explore HELiX UI &rarr;</span>
            </div>
          </a>
          <a href="https://bookedsolid.tech/helixir" target="_blank" rel="noopener noreferrer" class="promo-card">
            <img src="/og/helixir.png" alt="HELiXiR — MCP tools for web components." class="promo-card-image" />
            <div class="promo-card-body">
              <h3>HELiXiR</h3>
              <p>
                MCP server for any CEM-compliant web component library. Connect to Claude, Cursor,
                or any MCP client. Components, tokens, slots, and a11y scores — all queryable.
              </p>
              <span class="promo-card-cta">Explore HELiXiR &rarr;</span>
            </div>
          </a>
          <a href="https://bookedsolid.tech/discord-ops" target="_blank" rel="noopener noreferrer" class="promo-card">
            <img src="/og/discord-ops.png" alt="Discord-Ops — Agency-grade Discord for AI agents." class="promo-card-image" />
            <div class="promo-card-body">
              <h3>Discord-Ops</h3>
              <p>
                Agency-grade Discord MCP server for AI agents. 45 tools, 23 message templates,
                multi-guild routing, and multi-bot support.
              </p>
              <span class="promo-card-cta">Explore Discord-Ops &rarr;</span>
            </div>
          </a>
        </div>
      </section>

      {/* Getting Started */}
      <section id="getting-started" class="container section" style="border-top:1px solid var(--hx-page-border);padding-bottom:5rem;">
        <div class="section-header">
          <h2>Getting Started</h2>
          <p>Your project is ready. Here are the key files and next steps.</p>
        </div>

        <div class="grid-3">
          <hx-card>
            <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Key Files</h3>
              <hx-badge variant="info">Reference</hx-badge>
            </div>
            <ul style="line-height:2;padding-left:1.5rem;">
              <li><code>src/app.tsx</code> — Root component (this page)</li>
              <li><code>src/index.tsx</code> — Preact render mount</li>
              <li><code>src/helix.d.ts</code> — JSX type declarations</li>
              <li><code>src/helix-setup.ts</code> — HELiX library import</li>
              <li><code>src/components/navbar.tsx</code> — Navigation</li>
              <li><code>helix-tokens.css</code> — Design token overrides</li>
            </ul>
          </hx-card>

          <hx-card>
            <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Commands</h3>
              <hx-badge variant="success">CLI</hx-badge>
            </div>
            <ul style="line-height:2;padding-left:1.5rem;">
              <li><code>npm run dev</code> — Start dev server</li>
              <li><code>npm run build</code> — Production build</li>
              <li><code>npm run preview</code> — Preview build</li>
            </ul>
            <hx-divider style="margin:1rem 0;"></hx-divider>
            <p style="font-size:0.875rem;" class="text-secondary">
              Add more HELiX components by importing them in <code>helix-setup.ts</code>.
            </p>
          </hx-card>

          <hx-card>
            <div slot="header" style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;">Next Steps</h3>
              <hx-badge variant="warning">Action</hx-badge>
            </div>
            <ul style="line-height:2;padding-left:1.5rem;">
              <li>Customize your theme in <code>helix-tokens.css</code></li>
              <li>Add more components from the <a href="https://github.com/bookedsolidtech/helix" target="_blank" rel="noopener noreferrer">component library</a></li>
              <li>Use <code>useRef</code> + <code>addEventListener</code> for events</li>
              <li>Explore <a href="https://bookedsolid.tech/helixui" target="_blank" rel="noopener noreferrer">HELiX UI docs</a></li>
            </ul>
          </hx-card>
        </div>
      </section>

      <Footer />
    </hx-theme>
  );
}
`,
  );

  // src/index.css — full global styles with dark mode support
  await safeWriteFile(
    path.join(srcDir, 'index.css'),
    `@import '@helixui/tokens/tokens.css';

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  color-scheme: light dark;
}

html[data-theme="dark"] {
  color-scheme: dark;
  --hx-page-bg: #0a0a0f;
  --hx-page-text: #e4e4e7;
  --hx-page-text-secondary: #a1a1aa;
  --hx-page-surface: #18181b;
  --hx-page-surface-raised: #27272a;
  --hx-page-border: #3f3f46;
  --hx-page-code-bg: #27272a;
}

html[data-theme="light"],
html:not([data-theme]) {
  --hx-page-bg: #fafafa;
  --hx-page-text: #18181b;
  --hx-page-text-secondary: #71717a;
  --hx-page-surface: #ffffff;
  --hx-page-surface-raised: #f4f4f5;
  --hx-page-border: #e4e4e7;
  --hx-page-code-bg: #f4f4f5;
}

body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: var(--hx-page-text);
  background: var(--hx-page-bg);
  -webkit-font-smoothing: antialiased;
  transition: background 0.2s ease, color 0.2s ease;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

a {
  color: var(--hx-color-primary-500, #3b82f6);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

h1, h2, h3, h4 {
  color: var(--hx-page-text);
  letter-spacing: -0.025em;
}

code {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: 0.85em;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--hx-page-code-bg);
  color: var(--hx-page-text);
}

pre {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
  background: var(--hx-page-code-bg) !important;
  color: var(--hx-page-text);
  border: 1px solid var(--hx-page-border);
}

.hero {
  padding: 5rem 2rem;
  text-align: center;
  background: var(--hx-page-surface);
  border-bottom: 1px solid var(--hx-page-border);
}

.hero h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 800;
  margin-bottom: 1rem;
  line-height: 1.1;
}

.hero p {
  font-size: 1.125rem;
  color: var(--hx-page-text-secondary);
  max-width: 600px;
  margin: 0 auto 2rem;
}

.section {
  padding: 4rem 0;
}

.section-header {
  margin-bottom: 2rem;
}

.section-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.section-header p {
  color: var(--hx-page-text-secondary);
}

.grid-auto {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.grid-3 {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

/* hx-top-nav overrides */
hx-top-nav {
  --hx-top-nav-bg: var(--hx-page-surface);
  --hx-top-nav-color: var(--hx-page-text);
  --hx-top-nav-border-color: var(--hx-page-border);
  border-radius: 0;
  position: sticky;
  top: 0;
  z-index: 1000;
}

hx-top-nav::part(header) {
  border-radius: 0;
}

/* hx-card overrides */
hx-card {
  --hx-card-bg: var(--hx-page-surface);
  --hx-card-color: var(--hx-page-text);
  --hx-card-border-color: var(--hx-page-border);
}

hx-card::part(header) {
  background: var(--hx-page-surface-raised);
  border-bottom: 1px solid var(--hx-page-border);
  padding: 0.875rem 1.25rem;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
}

.text-secondary {
  color: var(--hx-page-text-secondary);
}

/* Promo cards */
.promo-grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.promo-card {
  position: relative;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid var(--hx-page-border);
  background: var(--hx-page-surface);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
}

.promo-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  text-decoration: none;
}

.promo-card-image {
  width: 100%;
  aspect-ratio: 1200 / 630;
  object-fit: cover;
  display: block;
  border-bottom: 1px solid var(--hx-page-border);
}

.promo-card-body {
  padding: 1.25rem 1.5rem 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.promo-card-body h3 {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--hx-page-text);
}

.promo-card-body p {
  font-size: 0.9rem;
  color: var(--hx-page-text-secondary);
  line-height: 1.5;
  flex: 1;
}

.promo-card-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--hx-color-primary-500, #3b82f6);
}

/* Footer */
.site-footer {
  background: var(--hx-page-surface);
  border-top: 1px solid var(--hx-page-border);
  padding: 3rem 0 2rem;
}

.footer-grid {
  display: grid;
  gap: 2rem;
  grid-template-columns: 1.5fr repeat(3, 1fr);
}

@media (max-width: 768px) {
  .footer-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .footer-grid {
    grid-template-columns: 1fr;
  }
}

.footer-heading {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hx-page-text);
  margin-bottom: 0.75rem;
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.footer-links li {
  margin-bottom: 0.5rem;
}

.footer-links a {
  color: var(--hx-page-text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
  transition: color 0.15s ease;
}

.footer-links a:hover {
  color: var(--hx-page-text);
}

.footer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.footer-bottom p {
  margin: 0;
}
`,
  );

  // src/components/ErrorBoundary.tsx — Preact-native error boundary
  await safeWriteFile(
    path.join(componentsDir, 'ErrorBoundary.tsx'),
    `import { Component } from 'preact';
import type { ComponentChildren } from 'preact';

interface ErrorBoundaryProps {
  children: ComponentChildren;
  fallback?: ComponentChildren;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches rendering errors in child component trees.
 *
 * Preact's Component supports getDerivedStateFromError / componentDidCatch,
 * making this functionally equivalent to a React error boundary.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error): void {
    console.error('[ErrorBoundary] Caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          style="padding:2rem;border:1px solid var(--hx-color-danger,#dc3545);border-radius:var(--hx-radius-md,0.5rem);background:var(--hx-color-danger-surface,#fff5f5);color:var(--hx-color-danger,#dc3545);"
        >
          <h2 style="margin-bottom:0.5rem;">Something went wrong</h2>
          {this.state.error && (
            <pre style="font-size:0.85rem;overflow-x:auto;margin-bottom:1rem;white-space:pre-wrap;">
              {this.state.error.message}
            </pre>
          )}
          <hx-button
            variant="secondary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </hx-button>
        </div>
      );
    }

    return this.props.children;
  }
}
`,
  );
}

async function scaffoldStencil(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  const myComponentDir = path.join(srcDir, 'components', 'my-component');
  await safeEnsureDir(myComponentDir);

  // Override tsconfig for Stencil — needs experimentalDecorators for @Component,
  // @Prop etc., plus jsx: 'react' with h as factory so IDE tooling works correctly.
  if (options.typescript) {
    await safeWriteJson(
      path.join(options.directory, 'tsconfig.json'),
      {
        compilerOptions: {
          allowSyntheticDefaultImports: true,
          declaration: true,
          experimentalDecorators: true,
          lib: ['dom', 'dom.iterable', 'esnext'],
          moduleResolution: 'node',
          module: 'esnext',
          target: 'ES2017',
          strict: true,
          skipLibCheck: true,
          jsx: 'react',
          jsxFactory: 'h',
          jsxFragmentFactory: 'Fragment',
        },
        include: ['src'],
        exclude: ['node_modules'],
      },
      { spaces: 2 },
    );
  }

  // stencil.config.ts
  await safeWriteFile(
    path.join(options.directory, 'stencil.config.ts'),
    `import { Config } from '@stencil/core';

export const config: Config = {
  namespace: '${options.name}',
  outputTargets: [
    {
      type: 'dist',
      esmLoaderPath: '../loader',
    },
    {
      type: 'dist-custom-elements',
    },
    {
      type: 'docs-readme',
    },
    {
      type: 'www',
      serviceWorker: null,
    },
  ],
  testing: {
    browserHeadless: 'shell',
  },
};
`,
  );

  // src/components/my-component/my-component.tsx
  await safeWriteFile(
    path.join(myComponentDir, 'my-component.tsx'),
    `import { Component, Prop, h } from '@stencil/core';

@Component({
  tag: 'my-component',
  styleUrl: 'my-component.css',
  shadow: true,
})
export class MyComponent {
  @Prop() name: string = 'World';

  render() {
    return (
      <div class="my-component">
        <h2>Hello, {this.name}!</h2>
        <p>Built with HELiX + Stencil web components.</p>
        <slot></slot>
      </div>
    );
  }
}
`,
  );

  // src/components/my-component/my-component.css
  await safeWriteFile(
    path.join(myComponentDir, 'my-component.css'),
    `:host {
  display: block;
  font-family: var(--hx-font-family, system-ui, sans-serif);
}

.my-component {
  padding: var(--hx-spacing-md, 1rem);
  color: var(--hx-color-text, #1a1a1a);
}
`,
  );

  // src/index.ts
  await safeWriteFile(
    path.join(srcDir, 'index.ts'),
    `export * from './components/my-component/my-component';
${options.designTokens ? "import '../helix-tokens.css';" : "import '@helixui/library';"}
`,
  );
}

// ─── Error boundary components ────────────────────────────────────────────────

async function writeVueNuxtErrorBoundary(options: ProjectOptions): Promise<void> {
  const componentsDir = path.join(options.directory, 'app', 'components');
  await safeEnsureDir(componentsDir);

  await safeWriteFile(
    path.join(componentsDir, 'ErrorBoundary.vue'),
    `<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';

/**
 * ErrorBoundary — catches errors thrown in descendant components.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 */

const error = ref<Error | null>(null);

onErrorCaptured((err: Error): boolean => {
  error.value = err;
  console.error('[ErrorBoundary] Caught error:', err);
  return false;
});

function reset(): void {
  error.value = null;
}
</script>

<template>
  <div v-if="error" role="alert" class="hx-error-boundary">
    <h2>Something went wrong</h2>
    <pre class="hx-error-boundary__message">{{ error.message }}</pre>
    <hx-button variant="danger" @hx-click="reset">Try again</hx-button>
  </div>
  <slot v-else />
</template>

<style scoped>
.hx-error-boundary {
  padding: 2rem;
  border: 1px solid var(--hx-color-danger, #dc3545);
  border-radius: var(--hx-radius-md, 0.5rem);
  background: var(--hx-color-danger-surface, #fff5f5);
  color: var(--hx-color-danger, #dc3545);
}

.hx-error-boundary__message {
  font-size: 0.85rem;
  overflow-x: auto;
  margin: 1rem 0;
  white-space: pre-wrap;
}
</style>
`,
  );
}

async function writeReactErrorBoundary(options: ProjectOptions): Promise<void> {
  const componentsDir = path.join(options.directory, 'src', 'components');
  await safeEnsureDir(componentsDir);

  await safeWriteFile(
    path.join(componentsDir, 'ErrorBoundary.tsx'),
    `import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches rendering errors in child component trees.
 *
 * Wrap any subtree to prevent an unhandled render error from crashing
 * the entire application. Shows a fallback UI with error details and
 * a retry button when an error is caught.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 *
 *   // Custom fallback:
 *   <ErrorBoundary fallback={<p>Something went wrong.</p>}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          style={{
            padding: '2rem',
            border: '1px solid var(--hx-color-danger, #dc3545)',
            borderRadius: 'var(--hx-radius-md, 0.5rem)',
            background: 'var(--hx-color-danger-surface, #fff5f5)',
            color: 'var(--hx-color-danger, #dc3545)',
          }}
        >
          <h2 style={{ marginBottom: '0.5rem' }}>Something went wrong</h2>
          {this.state.error && (
            <pre
              style={{
                fontSize: '0.85rem',
                overflowX: 'auto',
                marginBottom: '1rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              borderRadius: 'var(--hx-radius-md, 0.5rem)',
              border: '1px solid var(--hx-color-danger, #dc3545)',
              background: 'transparent',
              color: 'var(--hx-color-danger, #dc3545)',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
`,
  );
}

async function writeVueErrorBoundary(options: ProjectOptions): Promise<void> {
  const componentsDir = path.join(options.directory, 'src', 'components');
  await safeEnsureDir(componentsDir);

  await safeWriteFile(
    path.join(componentsDir, 'ErrorBoundary.vue'),
    `<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';

/**
 * ErrorBoundary — catches errors thrown in descendant components.
 *
 * Uses Vue's onErrorCaptured lifecycle hook to intercept errors bubbling
 * up through the component tree. Renders a fallback UI with error details
 * and a retry button, or falls back to the default slot when no error is active.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 */

const error = ref<Error | null>(null);

onErrorCaptured((err: Error): boolean => {
  error.value = err;
  console.error('[ErrorBoundary] Caught error:', err);
  // Return false to stop propagation up the component tree
  return false;
});

function reset(): void {
  error.value = null;
}
</script>

<template>
  <div v-if="error" role="alert" class="hx-error-boundary">
    <h2>Something went wrong</h2>
    <pre class="hx-error-boundary__message">{{ error.message }}</pre>
    <button class="hx-error-boundary__retry" @click="reset">Try again</button>
  </div>
  <slot v-else />
</template>

<style scoped>
.hx-error-boundary {
  padding: 2rem;
  border: 1px solid var(--hx-color-danger, #dc3545);
  border-radius: var(--hx-radius-md, 0.5rem);
  background: var(--hx-color-danger-surface, #fff5f5);
  color: var(--hx-color-danger, #dc3545);
}

.hx-error-boundary__message {
  font-size: 0.85rem;
  overflow-x: auto;
  margin-bottom: 1rem;
  white-space: pre-wrap;
}

.hx-error-boundary__retry {
  padding: 0.5rem 1rem;
  cursor: pointer;
  border-radius: var(--hx-radius-md, 0.5rem);
  border: 1px solid var(--hx-color-danger, #dc3545);
  background: transparent;
  color: var(--hx-color-danger, #dc3545);
}
</style>
`,
  );
}

async function scaffoldMinimal(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  await safeEnsureDir(srcDir);

  await safeWriteFile(
    path.join(srcDir, 'main.ts'),
    `import '@helixui/library';
${options.designTokens ? "import '../helix-tokens.css';" : ''}

console.log('HELiX components loaded');
`,
  );
}

async function scaffoldEmber(options: ProjectOptions): Promise<void> {
  const appDir = path.join(options.directory, 'app');
  const configDir = path.join(options.directory, 'config');
  const publicDir = path.join(options.directory, 'public');
  const testsDir = path.join(options.directory, 'tests');

  await safeEnsureDir(appDir);
  await safeEnsureDir(configDir);
  await safeEnsureDir(publicDir);
  await safeEnsureDir(testsDir);

  // ember-cli-build.js
  await safeWriteFile(
    path.join(options.directory, 'ember-cli-build.js'),
    `'use strict';

const EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function (defaults) {
  const app = new EmberApp(defaults, {
    // Add options here
  });

  return app.toTree();
};
`,
  );

  // config/environment.js
  await safeWriteFile(
    path.join(configDir, 'environment.js'),
    `'use strict';

module.exports = function (environment) {
  const ENV = {
    modulePrefix: '${options.name}',
    environment,
    rootURL: '/',
    locationType: 'history',

    EmberENV: {
      EXTEND_PROTOTYPES: false,
      FEATURES: {},
    },

    APP: {},
  };

  if (environment === 'development') {
    ENV.APP.LOG_RESOLVER = false;
    ENV.APP.LOG_ACTIVE_GENERATION = false;
    ENV.APP.LOG_TRANSITIONS = false;
    ENV.APP.LOG_TRANSITIONS_INTERNAL = false;
    ENV.APP.LOG_VIEW_LOOKUPS = false;
  }

  if (environment === 'test') {
    ENV.locationType = 'none';
    ENV.APP.LOG_ACTIVE_GENERATION = false;
    ENV.APP.LOG_VIEW_LOOKUPS = false;
    ENV.APP.rootElement = '#ember-testing';
    ENV.APP.autoboot = false;
  }

  return ENV;
};
`,
  );

  // app/app.ts — main application entry
  await safeWriteFile(
    path.join(appDir, 'app.ts'),
    `import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from '${options.name}/config/environment';
${options.designTokens ? "import './helix-setup';" : "import '@helixui/library';"}

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = \`\${config.modulePrefix}/pods\`;
  Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
`,
  );

  // app/router.ts
  await safeWriteFile(
    path.join(appDir, 'router.ts'),
    `import EmberRouter from '@ember/routing/router';
import config from '${options.name}/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  // Define your routes here
});
`,
  );

  // app/index.html
  await safeWriteFile(
    path.join(appDir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${sanitizeForHtml(options.name)}</title>
    {{content-for "head"}}
    <link rel="stylesheet" href="{{rootURL}}assets/vendor.css" />
    <link rel="stylesheet" href="{{rootURL}}assets/${sanitizeForHtml(options.name)}.css" />
    {{content-for "head-footer"}}
  </head>
  <body>
    {{content-for "body"}}
    <script src="{{rootURL}}assets/vendor.js"></script>
    <script src="{{rootURL}}assets/${sanitizeForHtml(options.name)}.js"></script>
    {{content-for "body-footer"}}
  </body>
</html>
`,
  );

  // app/templates/application.hbs — root template
  const templatesDir = path.join(appDir, 'templates');
  await safeEnsureDir(templatesDir);
  await safeWriteFile(
    path.join(templatesDir, 'application.hbs'),
    `<hx-card>
  <div slot="header"><h1>Welcome to {{this.name}}</h1></div>
  <p>Built with HELiX web components and Ember.js.</p>
  <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
    <hx-button variant="primary">Get Started</hx-button>
    <hx-button variant="secondary">Learn More</hx-button>
  </div>
</hx-card>

<RouterOutlet />
`,
  );

  // tests/test-helper.ts
  await safeWriteFile(
    path.join(testsDir, 'test-helper.ts'),
    `import Application from '${options.name}/app';
import config from '${options.name}/config/environment';
import { setApplication } from '@ember/test-helpers';
import { start } from 'ember-qunit';

setApplication(Application.create(config.APP));

start();
`,
  );
}
