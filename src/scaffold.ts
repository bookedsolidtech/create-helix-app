import fs from 'fs-extra';
import path from 'node:path';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { getTemplate, getComponentsForBundles } from './templates.js';
import type { ProjectOptions, AnyTemplateConfig, ScaffoldTiming } from './types.js';
import { logger } from './logger.js';

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
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'\">";

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

// ---------------------------------------------------------------------------
// Timing instrumentation
// Module-level state is safe for a single-threaded CLI process.
// ---------------------------------------------------------------------------

let _lastTiming: ScaffoldTiming | null = null;

/**
 * Returns the timing data from the last scaffoldProject() call, or null if
 * no scaffold has run yet.
 */
export function getLastScaffoldTiming(): ScaffoldTiming | null {
  return _lastTiming;
}

/**
 * Track bytes written during scaffold (used alongside file-write tracking).
 */
let _bytesWritten = 0;

function _trackWrite(content: string): void {
  _bytesWritten += Buffer.byteLength(content, 'utf8');
}

function _trackWriteJson(data: unknown, spaces = 2): void {
  _bytesWritten += Buffer.byteLength(JSON.stringify(data, null, spaces), 'utf8');
}

async function safeWriteFile(filePath: string, content: string): Promise<void> {
  _trackWrite(content);
  if (_dryRunActive) {
    _dryRunEntries.push({ path: filePath, size: Buffer.byteLength(content, 'utf8') });
    return;
  }
  await fs.writeFile(filePath, content);
}

async function safeWriteJson(
  filePath: string,
  data: unknown,
  opts?: { spaces: number },
): Promise<void> {
  _trackWriteJson(data, opts?.spaces ?? 2);
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
    throw new Error(
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
  const logVerbose = (msg: string): void => {
    if (options.verbose) {
      logger.debug(msg);
    }
  };

  // Reset timing state for this run
  _lastTiming = null;
  _bytesWritten = 0;
  const totalStart = performance.now();

  // ── Phase 1: Validation ──────────────────────────────────────────────────
  const validationStart = performance.now();

  // Check custom templates first (they take precedence over built-ins with the same ID)
  const template: AnyTemplateConfig | undefined =
    options.customTemplates?.find((t) => t.id === options.framework) ??
    getTemplate(options.framework);
  if (!template) {
    throw new Error(`Unknown framework: ${options.framework}`);
  }

  // SECURITY: Validate the output directory path before writing any files.
  // Defense-in-depth: CLI validates project names via /^[a-z0-9-_]+$/i, making
  // traversal sequences impossible through normal usage. This check protects
  // programmatic API callers that may not apply the same sanitization.
  assertNoPathTraversal(options.directory);

  // Check if directory exists and is non-empty
  const dirExists = await fs.pathExists(options.directory);
  if (dirExists) {
    const entries = await fs.readdir(options.directory);
    if (entries.length > 0) {
      if (!options.force) {
        logger.error(`Directory exists and is not empty: ${options.directory}`);
        process.exit(1);
      }
      logger.warn(`Overwriting existing files in ${options.directory}`);
    }
  }

  const validationMs = performance.now() - validationStart;

  logVerbose(`[timing] validation: ${validationMs.toFixed(1)}ms`);

  // Activate dry-run collection if requested
  if (options.dryRun) {
    _dryRunActive = true;
    _dryRunEntries = [];
  }

  // Track whether the directory existed before scaffolding, for cleanup on failure.
  const dirExistedBefore = await fs.pathExists(options.directory);

  // ── Phase 2: Template resolution ────────────────────────────────────────
  const templateResolutionStart = performance.now();

  logVerbose(`Template: ${template.id} (${template.name})`);
  logVerbose(`Directory: ${options.directory}`);

  // Check if template directory exists (bundled with package)
  const templateDir = path.join(
    new URL('.', import.meta.url).pathname,
    '..',
    'templates',
    options.framework,
  );
  const hasTemplate = await fs.pathExists(templateDir);

  const templateResolutionMs = performance.now() - templateResolutionStart;

  logVerbose(`[timing] template resolution: ${templateResolutionMs.toFixed(1)}ms`);

  // Count dependencies for timing summary
  const dependencyCount =
    Object.keys(template.dependencies ?? {}).length +
    Object.keys(template.devDependencies ?? {}).length;

  // ── Phases 3 & 4: File generation and file writing ───────────────────────
  // These phases are interleaved in practice; we track them together under
  // "file generation" (framework-specific logic) and "file writing" (I/O).
  const fileGenerationStart = performance.now();

  let fileWritingMs = 0;

  try {
    await safeEnsureDir(options.directory);

    if (hasTemplate) {
      const writeStart = performance.now();
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
          _bytesWritten += stat.size;
        }
      } else {
        // Copy the full template
        await fs.copy(templateDir, options.directory, { overwrite: true });
      }
      fileWritingMs += performance.now() - writeStart;
    }

    logVerbose(`Component bundles: ${options.componentBundles.join(', ')}`);
    logVerbose(
      `Features: typescript=${String(options.typescript)}, eslint=${String(options.eslint)}, tokens=${String(options.designTokens)}, darkMode=${String(options.darkMode)}`,
    );

    // Generate/overwrite core files based on options
    const writeStart2 = performance.now();

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

    fileWritingMs += performance.now() - writeStart2;

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

    const writeStart3 = performance.now();

    // Write the HELiX integration helper
    logVerbose(`Writing ${path.join(options.directory, 'src', 'helix-setup.ts')}`);
    await writeHelixSetup(options);

    // Write .gitignore
    logVerbose(`Writing ${path.join(options.directory, '.gitignore')}`);
    await writeGitignore(options);

    fileWritingMs += performance.now() - writeStart3;
  } catch (err) {
    _dryRunActive = false;

    // Clean up any partially created files if the directory was created by this scaffold run.
    if (!dirExistedBefore && (await fs.pathExists(options.directory))) {
      await fs.remove(options.directory);
    }

    const friendlyMessage = getScaffoldErrorMessage(err);
    if (friendlyMessage) {
      p.log.error(friendlyMessage);
      throw new Error(friendlyMessage);
    }
    throw err;
  } finally {
    _dryRunActive = false;
  }

  const fileGenerationMs = performance.now() - fileGenerationStart;

  logVerbose(`[timing] file generation+writing: ${fileGenerationMs.toFixed(1)}ms`);

  const totalMs = performance.now() - totalStart;

  // Collect file count
  let fileCount = 0;
  if (options.dryRun) {
    fileCount = _dryRunEntries.length;
  } else {
    try {
      const allFiles = await walkDirRecursive(options.directory);
      fileCount = allFiles.length;
    } catch {
      fileCount = 0;
    }
  }

  // Store timing summary
  _lastTiming = {
    totalMs,
    phases: {
      validationMs,
      templateResolutionMs,
      fileGenerationMs,
      fileWritingMs,
    },
    fileCount,
    bytesWritten: _bytesWritten,
    dependencyCount,
  };

  // Always log timing at debug level
  logger.debug('scaffold timing', {
    totalMs: Math.round(totalMs),
    validationMs: Math.round(validationMs),
    templateResolutionMs: Math.round(templateResolutionMs),
    fileGenerationMs: Math.round(fileGenerationMs),
    fileWritingMs: Math.round(fileWritingMs),
    fileCount,
    bytesWritten: _bytesWritten,
    dependencyCount,
  });

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
  const pkg = {
    name: options.name,
    version: '0.1.0',
    private: true,
    ...(useEsm ? { type: 'module' } : {}),
    scripts: getScripts(options),
    dependencies: {
      ...template.dependencies,
      ...(options.designTokens ? { '@helixui/tokens': '^0.3.0' } : {}),
    },
    devDependencies: {
      ...template.devDependencies,
    },
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
  if (options.framework === 'react-next' || options.framework === 'remix') {
    // These frameworks manage their own tsconfig
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
  const content = `node_modules/
dist/
.next/
.nuxt/
.svelte-kit/
.astro/
.env
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

// ─── Framework-specific scaffolding ───────────────────────────────────────────

async function scaffoldReactNext(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  const appDir = path.join(srcDir, 'app');
  await safeEnsureDir(appDir);

  // next.config.ts
  await safeWriteFile(
    path.join(options.directory, 'next.config.ts'),
    `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Web components need client-side hydration
  // No special config needed — Next.js 15 handles custom elements natively
  reactStrictMode: true,
};

export default nextConfig;
`,
  );

  // tsconfig.json for Next.js
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

// Type declarations for the custom elements
// These map to the actual Lit component classes

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'hx-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-card': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-text-input': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-select': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-checkbox': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-switch': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-dialog': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-alert': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-badge': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-tabs': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-tab': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-tab-panel': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-avatar': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-divider': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-tooltip': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-textarea': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      'hx-data-table': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
    }
  }
}

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
import { useEffect, useState, type ReactNode } from 'react';

interface HelixProviderProps {
  children: ReactNode;
  /** Explicit theme — avoids window.matchMedia SSR error from hx-theme */
  theme?: 'light' | 'dark' | 'system';
}

export function HelixProvider({ children, theme }: HelixProviderProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Dynamic import ensures HELiX only loads on the client
    import('@helixui/library').then(() => {
      // Set explicit theme to avoid hx-theme's matchMedia SSR issue
      if (theme && theme !== 'system') {
        document.documentElement.setAttribute('data-theme', theme);
      }
      setReady(true);
    }).catch(() => setReady(true));
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
      'hx-toast': HxElement;
      'hx-tooltip': HxElement;
      'hx-tree-item': HxElement;
      'hx-tree-view': HxElement;
    }
  }
}

export {};
`,
  );

  // Layout with provider
  await safeWriteFile(
    path.join(appDir, 'layout.tsx'),
    `import type { Metadata } from 'next';
import { HelixProvider } from '@/components/helix/provider';
${options.designTokens ? "import '../../helix-tokens.css';" : ''}
import './globals.css';

export const metadata: Metadata = {
  title: '${sanitizeForHtml(options.name)}',
  description: 'Built with HELiX web components',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en"${options.darkMode ? ' suppressHydrationWarning' : ''}>
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

  // Global styles
  await safeWriteFile(
    path.join(appDir, 'globals.css'),
    `@import '@helixui/tokens/tokens.css';

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
`,
  );

  // Main page — interactive demo using custom elements directly
  await safeWriteFile(
    path.join(appDir, 'page.tsx'),
    `'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * HELiX + Next.js — Interactive Demo
 *
 * This page demonstrates using HELiX web components directly in React/Next.js.
 * Web components work in JSX — you just need to handle events via refs or addEventListener.
 *
 * Three patterns shown:
 * 1. Direct custom elements in JSX (simplest)
 * 2. Event handling via useRef + addEventListener
 * 3. @lit/react wrappers (see src/components/helix/wrappers.tsx for type-safe approach)
 */
export default function Home() {
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const nameInputRef = useRef<HTMLElement>(null);
  const greetBtnRef = useRef<HTMLElement>(null);

  // Pattern: addEventListener for custom events from web components
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
    <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>
            Welcome to HELiX
          </h1>
          <p style={{ color: '#666' }}>
            Enterprise web components, running in Next.js 15.
          </p>
        </div>
      </div>

      <hx-divider></hx-divider>

      <hx-tabs style={{ marginTop: '2rem' }}>
        <hx-tab slot="nav">Interactive Demo</hx-tab>
        <hx-tab slot="nav">Theming</hx-tab>
        <hx-tab slot="nav">Patterns</hx-tab>

        <hx-tab-panel>
          <div style={{ padding: '2rem 0', display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <hx-card>
              <div slot="header">
                <h3>Quick Start</h3>
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
                    Hello, {name || 'World'}! HELiX components are working in React.
                  </hx-alert>
                )}
              </div>
            </hx-card>

            <hx-card>
              <div slot="header">
                <h3>Button Variants</h3>
                <hx-badge variant="info">Shadow DOM</hx-badge>
              </div>
              <p style={{ marginBottom: '1rem', color: '#666' }}>
                HELiX components use Shadow DOM. Style them via CSS custom properties
                and ::part() selectors.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <hx-button variant="primary" size="sm">Primary</hx-button>
                <hx-button variant="secondary" size="sm">Secondary</hx-button>
                <hx-button variant="danger" size="sm">Danger</hx-button>
                <hx-button variant="ghost" size="sm">Ghost</hx-button>
              </div>
            </hx-card>

            <hx-card>
              <div slot="header">
                <h3>Event Handling</h3>
              </div>
              <p style={{ color: '#666' }}>
                Use <code>useRef</code> + <code>addEventListener</code> for custom events,
                or use the @lit/react wrappers in <code>src/components/helix/wrappers.tsx</code>
                for a more React-native experience.
              </p>
              <pre style={{
                marginTop: '1rem',
                padding: '1rem',
                borderRadius: '0.5rem',
                background: '#f5f5f5',
                fontSize: '0.8rem',
                overflow: 'auto',
              }}>
{String.raw\`// Option 1: useRef + addEventListener
const ref = useRef(null);
useEffect(() => {
  ref.current?.addEventListener(
    'hx-click', handler
  );
}, []);

// Option 2: @lit/react wrappers
import { HxButton } from './wrappers';
<HxButton onHxClick={handler} />\`}
              </pre>
            </hx-card>
          </div>
        </hx-tab-panel>

        <hx-tab-panel>
          <div style={{ padding: '2rem 0' }}>
            <hx-card>
              <div slot="header"><h3>CSS Custom Properties</h3></div>
              <p>Override design tokens to match your brand:</p>
              <pre style={{ marginTop: '1rem', padding: '1rem', background: '#f5f5f5', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
{String.raw\`:root {
  --hx-color-primary: #0066cc;
  --hx-spacing-md: 1rem;
  --hx-radius-md: 0.5rem;
}

/* ::part() for internal elements */
hx-button::part(button) {
  font-weight: 700;
}\`}
              </pre>
            </hx-card>
          </div>
        </hx-tab-panel>

        <hx-tab-panel>
          <div style={{ padding: '2rem 0' }}>
            <hx-card>
              <div slot="header"><h3>Next.js Patterns</h3></div>
              <ul style={{ lineHeight: '2' }}>
                <li><strong>Client Components:</strong> Web components need <code>&apos;use client&apos;</code> — they require DOM</li>
                <li><strong>HelixProvider:</strong> Wraps your layout to initialize components client-side</li>
                <li><strong>Dynamic Import:</strong> HELiX loads via <code>import(&apos;@helixui/library&apos;)</code> in useEffect</li>
                <li><strong>SSR:</strong> Components render as empty custom elements server-side, hydrate on client</li>
              </ul>
            </hx-card>
          </div>
        </hx-tab-panel>
      </hx-tabs>
    </main>
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

/**
 * Form Participation Example
 *
 * HELiX form components use ElementInternals to participate in native HTML forms.
 * This means they work with FormData, form validation, and submit/reset events.
 *
 * Key patterns demonstrated:
 * 1. Native form submission with FormData
 * 2. Custom event handling for real-time validation
 * 3. Form reset behavior
 * 4. Accessible error states
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
    <main className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Form Participation</h1>
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
        <ul style={{ lineHeight: '2' }}>
          <li><strong>ElementInternals:</strong> Each HELiX form component calls <code>this.internals.setFormValue()</code></li>
          <li><strong>FormData:</strong> Values appear in <code>new FormData(form)</code> automatically</li>
          <li><strong>Validation:</strong> Components report validity via <code>internals.setValidity()</code></li>
          <li><strong>Reset:</strong> Forms reset web components via <code>formResetCallback()</code></li>
          <li><strong>No wrappers needed:</strong> This is native browser behavior, not framework-specific</li>
        </ul>
      </hx-card>
    </main>
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

/**
 * Dashboard Example
 *
 * Shows data display components, layout patterns, and theming with CSS custom properties.
 */
export default function DashboardExample() {
  return (
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

      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '2rem' }}>
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

      <hx-card style={{ marginTop: '1.5rem' }}>
        <div slot="header"><h3>Styling Web Components</h3></div>
        <p>All components above are styled via CSS custom properties. Override them in your globals.css:</p>
        <pre style={{ marginTop: '1rem', padding: '1rem', background: 'var(--hx-color-surface-hover, #f5f5f5)', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
{String.raw\`/* Override design tokens globally */
:root {
  --hx-color-primary: #0066cc;
  --hx-color-success: #22c55e;
}

/* Style specific component internals via ::part() */
hx-card::part(card) {
  border: 1px solid var(--hx-color-border);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

hx-button::part(button) {
  font-weight: 600;
  letter-spacing: 0.025em;
}\`}
        </pre>
      </hx-card>
    </main>
  );
}
`,
  );

  // Examples layout with navigation
  await safeWriteFile(
    path.join(examplesDir, 'layout.tsx'),
    `'use client';

export default function ExamplesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <nav style={{
        padding: '0.75rem 2rem',
        borderBottom: '1px solid var(--hx-color-border, #eee)',
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
      }}>
        <a href="/" style={{ textDecoration: 'none', fontWeight: 600 }}>HELiX</a>
        <hx-divider vertical style={{ height: '1.5rem' }}></hx-divider>
        <a href="/examples/forms" style={{ textDecoration: 'none', color: 'var(--hx-color-text-secondary, #666)' }}>Forms</a>
        <a href="/examples/dashboard" style={{ textDecoration: 'none', color: 'var(--hx-color-text-secondary, #666)' }}>Dashboard</a>
      </nav>
      {children}
    </div>
  );
}
`,
  );

  await writeReactErrorBoundary(options);
}

async function scaffoldReactVite(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  await safeEnsureDir(srcDir);

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

  // main.tsx
  await safeWriteFile(
    path.join(srcDir, 'main.tsx'),
    `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
${options.designTokens ? "import './helix-setup';" : "import '@helixui/library';"}
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  );

  // helix.d.ts — JSX type declarations for HELiX custom elements
  await safeWriteFile(
    path.join(srcDir, 'helix.d.ts'),
    `/**
 * JSX type declarations for HELiX web components.
 *
 * This allows TypeScript to understand hx-* elements in JSX without errors.
 * For fully type-safe React wrappers (properties, events, refs), see the
 * @lit/react wrappers pattern used in the react-next template.
 */
import 'react';

type HxElement = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;

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
      'hx-toast': HxElement;
      'hx-tooltip': HxElement;
      'hx-tree-item': HxElement;
      'hx-tree-view': HxElement;
    }
  }
}

export {};
`,
  );

  // src/components/Navbar.tsx — responsive navbar with dark mode toggle
  await safeEnsureDir(path.join(srcDir, 'components'));
  await safeWriteFile(
    path.join(srcDir, 'components', 'Navbar.tsx'),
    `import { useEffect, useRef } from 'react';

interface NavbarProps {
  /** Current colour scheme applied to <html data-theme> */
  theme: 'light' | 'dark';
  /** Toggle callback — parent owns the state */
  onToggleTheme: () => void;
}

/**
 * Navbar — top navigation bar with HELiX branding and dark-mode toggle.
 *
 * Uses HELiX icon-button for the theme toggle so the component stays
 * consistent with the rest of the design system.
 */
export function Navbar({ theme, onToggleTheme }: NavbarProps) {
  const toggleRef = useRef<HTMLElement>(null);

  // HELiX emits 'hx-click' — wire it up once
  useEffect(() => {
    const el = toggleRef.current;
    const handler = () => onToggleTheme();
    el?.addEventListener('hx-click', handler);
    return () => el?.removeEventListener('hx-click', handler);
  }, [onToggleTheme]);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <a href="/" className="navbar-brand" aria-label="Home">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" fill="currentColor">
            <rect x="2" y="6" width="24" height="4" rx="2" />
            <rect x="2" y="12" width="16" height="4" rx="2" />
            <rect x="2" y="18" width="20" height="4" rx="2" />
          </svg>
          <span>HELiX</span>
        </a>

        <nav className="navbar-links" aria-label="Main navigation">
          <a href="#components">Components</a>
          <a href="#ecosystem">Ecosystem</a>
          <a
            href="https://github.com/bookedsolidtech/helix"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </nav>

        <hx-icon-button
          ref={toggleRef}
          aria-label={\`Switch to \${theme === 'light' ? 'dark' : 'light'} mode\`}
          title={\`Switch to \${theme === 'light' ? 'dark' : 'light'} mode\`}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </hx-icon-button>
      </div>
    </header>
  );
}
`,
  );

  // src/components/FeatureCard.tsx — reusable feature/showcase card
  await safeWriteFile(
    path.join(srcDir, 'components', 'FeatureCard.tsx'),
    `interface FeatureCardProps {
  /** Short emoji or icon shown at the top of the card */
  icon: string;
  /** Card heading */
  title: string;
  /** Descriptive text below the heading */
  description: string;
  /** Optional badge label (e.g. "New", "Beta") */
  badge?: string;
}

/**
 * FeatureCard — lightweight showcase card built on hx-card.
 *
 * Demonstrates how to compose HELiX web components inside a typed
 * React functional component.
 */
export function FeatureCard({ icon, title, description, badge }: FeatureCardProps) {
  return (
    <hx-card className="feature-card">
      <div slot="header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.25rem' }} aria-hidden="true">{icon}</span>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
        {badge && (
          <hx-badge variant="info" style={{ marginLeft: 'auto' }}>
            {badge}
          </hx-badge>
        )}
      </div>
      <p style={{ margin: 0, color: 'var(--hx-color-text-secondary, #555)', lineHeight: 1.6 }}>
        {description}
      </p>
    </hx-card>
  );
}
`,
  );

  // App.tsx — high-quality landing page matching react-next quality standard
  await safeWriteFile(
    path.join(srcDir, 'App.tsx'),
    `import { useState, useRef, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { FeatureCard } from './components/FeatureCard';

/**
 * HELiX + React + Vite — Landing Page
 *
 * Demonstrates:
 * 1. Dark / light mode toggle using data-theme on <html>
 * 2. HELiX web components used directly in JSX
 * 3. Custom event handling via useRef + addEventListener
 * 4. Responsive grid layout using CSS custom properties
 */
export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Respect OS preference on first load
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const [name, setName] = useState('');
  const [greeted, setGreeted] = useState(false);
  const nameInputRef = useRef<HTMLElement>(null);
  const greetBtnRef = useRef<HTMLElement>(null);

  // Apply theme to <html> whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Wire up HELiX custom events for the interactive demo
  useEffect(() => {
    const input = nameInputRef.current;
    const btn = greetBtnRef.current;

    const handleInput = (e: Event) => {
      const detail = (e as CustomEvent<{ value: string }>).detail;
      setName(detail?.value ?? '');
    };
    const handleClick = () => {
      setGreeted(true);
      setTimeout(() => setGreeted(false), 3000);
    };

    input?.addEventListener('hx-input', handleInput);
    btn?.addEventListener('hx-click', handleClick);

    return () => {
      input?.removeEventListener('hx-input', handleInput);
      btn?.removeEventListener('hx-click', handleClick);
    };
  }, []);

  const handleToggleTheme = () => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  };

  return (
    <>
      <Navbar theme={theme} onToggleTheme={handleToggleTheme} />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="hero">
          <div className="container">
            <hx-badge variant="success" style={{ marginBottom: '1rem' }}>
              React 19 · Vite 6 · TypeScript
            </hx-badge>
            <h1 className="hero-title">
              Build faster with<br />
              <span className="hero-accent">HELiX&nbsp;+&nbsp;React&nbsp;+&nbsp;Vite</span>
            </h1>
            <p className="hero-subtitle">
              Enterprise-grade web components, hot-reload DX, and design tokens —
              everything you need to ship production UIs at speed.
            </p>
            <div className="hero-actions">
              <hx-button variant="primary" size="lg" onClick={() => {
                document.getElementById('components')?.scrollIntoView({ behavior: 'smooth' });
              }}>
                Explore Components
              </hx-button>
              <hx-button variant="ghost" size="lg" onClick={() => {
                window.open('https://github.com/bookedsolidtech/helix', '_blank', 'noopener,noreferrer');
              }}>
                View on GitHub
              </hx-button>
            </div>
          </div>
        </section>

        {/* ── Component Showcase ────────────────────────────────────── */}
        <section id="components" className="section">
          <div className="container">
            <h2 className="section-title">Component Showcase</h2>
            <p className="section-subtitle">
              HELiX ships 60+ accessible web components. Here are a few to get you started.
            </p>

            <div className="feature-grid">
              <FeatureCard
                icon="⚡"
                title="Instant Hot Reload"
                description="Vite's native ESM dev server gives you sub-50ms HMR. Edit a component and see it live without losing state."
                badge="Vite 6"
              />
              <FeatureCard
                icon="🎨"
                title="Design Tokens"
                description="Override any visual property — colour, spacing, radius, typography — via CSS custom properties. No CSS-in-JS required."
              />
              <FeatureCard
                icon="♿"
                title="Accessible by Default"
                description="Every HELiX component ships with full ARIA support, keyboard navigation, and screen-reader announcements built in."
              />
              <FeatureCard
                icon="🔒"
                title="Shadow DOM Encapsulation"
                description="Component styles live inside Shadow DOM. Your global CSS never leaks in — and their internals never leak out."
              />
              <FeatureCard
                icon="📋"
                title="Form Participation"
                description="HELiX form controls use ElementInternals to participate in native HTML forms — no wrappers, no hacks."
                badge="React 19"
              />
              <FeatureCard
                icon="🌙"
                title="Built-in Dark Mode"
                description="Flip data-theme='dark' on <html> and every component adapts automatically. Toggle it above to see it in action."
              />
            </div>

            {/* Interactive demo */}
            <hx-divider style={{ margin: '3rem 0 2rem' }}></hx-divider>
            <h3 style={{ marginBottom: '1.5rem' }}>Interactive Demo</h3>
            <div className="demo-grid">
              <hx-card>
                <div slot="header"><h4 style={{ margin: 0 }}>Quick Start</h4></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <hx-text-input
                    ref={nameInputRef}
                    label="Your name"
                    placeholder="Enter your name"
                  ></hx-text-input>
                  <hx-button ref={greetBtnRef} variant="primary">
                    Say Hello
                  </hx-button>
                  {greeted && (
                    <hx-alert variant="success" open>
                      Hello, {name || 'World'}! HELiX components are working in React.
                    </hx-alert>
                  )}
                </div>
              </hx-card>

              <hx-card>
                <div slot="header">
                  <h4 style={{ margin: 0 }}>Button Variants</h4>
                  <hx-badge variant="info">Shadow DOM</hx-badge>
                </div>
                <p style={{ marginBottom: '1rem', color: 'var(--hx-color-text-secondary, #666)' }}>
                  Style via CSS custom properties and <code>::part()</code> selectors.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <hx-button variant="primary" size="sm">Primary</hx-button>
                  <hx-button variant="secondary" size="sm">Secondary</hx-button>
                  <hx-button variant="danger" size="sm">Danger</hx-button>
                  <hx-button variant="ghost" size="sm">Ghost</hx-button>
                </div>
              </hx-card>

              <hx-card>
                <div slot="header"><h4 style={{ margin: 0 }}>Event Handling</h4></div>
                <p style={{ color: 'var(--hx-color-text-secondary, #666)', marginBottom: '1rem' }}>
                  Two patterns for wiring HELiX events in React:
                </p>
                <pre className="code-block">
{String.raw\`// Pattern 1 — useRef + addEventListener
const ref = useRef(null);
useEffect(() => {
  ref.current?.addEventListener(
    'hx-click', handler
  );
}, []);

// Pattern 2 — @lit/react wrappers
import { HxButton } from './wrappers';
<HxButton onHxClick={handler} />\`}
                </pre>
              </hx-card>
            </div>
          </div>
        </section>

        {/* ── Ecosystem ────────────────────────────────────────────── */}
        <section id="ecosystem" className="section section-alt">
          <div className="container">
            <h2 className="section-title">Ecosystem</h2>
            <p className="section-subtitle">
              Everything you need to build production-ready applications.
            </p>
            <div className="ecosystem-grid">
              {[
                { name: 'React 19', href: 'https://react.dev', desc: 'Concurrent rendering, Actions, improved hooks' },
                { name: 'Vite 6', href: 'https://vite.dev', desc: 'Lightning-fast bundler with native ESM HMR' },
                { name: 'TypeScript 5', href: 'https://typescriptlang.org', desc: 'Type-safe development with zero config' },
                { name: 'HELiX Library', href: 'https://github.com/bookedsolidtech/helix', desc: '60+ accessible, design-token-driven components' },
                { name: 'HELiX Tokens', href: 'https://github.com/bookedsolidtech/helix', desc: 'CSS custom properties for every visual decision' },
                { name: '@lit/react', href: 'https://lit.dev/docs/frameworks/react/', desc: 'Type-safe React wrappers for web components' },
              ].map(({ name, href, desc }) => (
                <a key={name} href={href} target="_blank" rel="noopener noreferrer" className="ecosystem-link">
                  <strong>{name}</strong>
                  <span>{desc}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── Developer Guidance ────────────────────────────────────── */}
        <section className="section">
          <div className="container">
            <h2 className="section-title">Get Started</h2>
            <div className="guide-grid">
              <hx-card>
                <div slot="header"><h3 style={{ margin: 0 }}>Project Structure</h3></div>
                <pre className="code-block">
{String.raw\`src/
  App.tsx          # Landing page (this file)
  main.tsx         # Entry point
  index.css        # Global styles + dark mode
  helix.d.ts       # JSX types for hx-* elements
  helix-setup.ts   # HELiX library initialisation
  components/
    Navbar.tsx     # Top navigation + theme toggle
    FeatureCard.tsx # Showcase card component
    ErrorBoundary.tsx\`}
                </pre>
              </hx-card>

              <hx-card>
                <div slot="header"><h3 style={{ margin: 0 }}>Customise Design Tokens</h3></div>
                <pre className="code-block">
{String.raw\`/* src/index.css */
:root {
  --hx-color-primary: #0066cc;
  --hx-spacing-md: 1rem;
  --hx-radius-md: 0.5rem;
}

/* Target component internals */
hx-button::part(button) {
  font-weight: 700;
  letter-spacing: 0.025em;
}\`}
                </pre>
              </hx-card>

              <hx-card>
                <div slot="header"><h3 style={{ margin: 0 }}>Available Commands</h3></div>
                <pre className="code-block">
{String.raw\`# Start development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview\`}
                </pre>
              </hx-card>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <p>
            Built with <strong>HELiX</strong> · <a href="https://github.com/bookedsolidtech/helix" target="_blank" rel="noopener noreferrer">GitHub</a>
          </p>
        </div>
      </footer>
    </>
  );
}
`,
  );

  // index.css — global styles with dark/light mode via CSS custom properties
  await safeWriteFile(
    path.join(srcDir, 'index.css'),
    `@import '@helixui/tokens/tokens.css';

/* ── Reset ───────────────────────────────────────────────────────────── */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* ── Base ────────────────────────────────────────────────────────────── */
:root {
  color-scheme: light dark;
}

body {
  font-family: var(--hx-font-family, system-ui, -apple-system, sans-serif);
  line-height: var(--hx-line-height-base, 1.5);
  color: var(--hx-color-text, #1a1a1a);
  background: var(--hx-color-surface, #ffffff);
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--hx-color-primary, #0066cc);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}

code {
  font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
  font-size: 0.9em;
  background: var(--hx-color-surface-hover, #f5f5f5);
  padding: 0.15em 0.35em;
  border-radius: 4px;
}

/* ── Layout ──────────────────────────────────────────────────────────── */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--hx-spacing-lg, 1.5rem);
}

/* ── Navbar ──────────────────────────────────────────────────────────── */
.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--hx-color-surface, #fff);
  border-bottom: 1px solid var(--hx-color-border, #e5e7eb);
  backdrop-filter: blur(8px);
}

.navbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--hx-spacing-lg, 1.5rem);
  height: 56px;
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--hx-color-text, #1a1a1a);
  text-decoration: none;
}
.navbar-brand:hover {
  text-decoration: none;
  opacity: 0.8;
}

.navbar-links {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  margin-left: auto;
  margin-right: 0.75rem;
}

.navbar-links a {
  font-size: 0.9rem;
  color: var(--hx-color-text-secondary, #555);
}
.navbar-links a:hover {
  color: var(--hx-color-text, #1a1a1a);
  text-decoration: none;
}

/* ── Hero ────────────────────────────────────────────────────────────── */
.hero {
  padding: 5rem 0 4rem;
  text-align: center;
}

.hero-title {
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 1.25rem;
  color: var(--hx-color-text, #1a1a1a);
}

.hero-accent {
  color: var(--hx-color-primary, #0066cc);
}

.hero-subtitle {
  font-size: 1.15rem;
  color: var(--hx-color-text-secondary, #555);
  max-width: 600px;
  margin: 0 auto 2rem;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

/* ── Sections ────────────────────────────────────────────────────────── */
.section {
  padding: 4rem 0;
}

.section-alt {
  background: var(--hx-color-surface-hover, #f9fafb);
}

.section-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.section-subtitle {
  color: var(--hx-color-text-secondary, #555);
  margin-bottom: 2.5rem;
}

/* ── Feature grid ────────────────────────────────────────────────────── */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.25rem;
}

.feature-card {
  height: 100%;
}

/* ── Demo grid ───────────────────────────────────────────────────────── */
.demo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.25rem;
}

/* ── Ecosystem grid ──────────────────────────────────────────────────── */
.ecosystem-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

.ecosystem-link {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 1.25rem;
  border: 1px solid var(--hx-color-border, #e5e7eb);
  border-radius: var(--hx-radius-md, 0.5rem);
  background: var(--hx-color-surface, #fff);
  color: var(--hx-color-text, #1a1a1a);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ecosystem-link:hover {
  border-color: var(--hx-color-primary, #0066cc);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--hx-color-primary, #0066cc) 15%, transparent);
  text-decoration: none;
}
.ecosystem-link strong {
  font-size: 0.95rem;
}
.ecosystem-link span {
  font-size: 0.82rem;
  color: var(--hx-color-text-secondary, #666);
}

/* ── Guide grid ──────────────────────────────────────────────────────── */
.guide-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.25rem;
}

/* ── Code block ──────────────────────────────────────────────────────── */
.code-block {
  font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
  font-size: 0.78rem;
  line-height: 1.6;
  background: var(--hx-color-surface-hover, #f5f5f5);
  border-radius: var(--hx-radius-sm, 0.375rem);
  padding: 1rem;
  overflow-x: auto;
  white-space: pre;
}

/* ── Footer ──────────────────────────────────────────────────────────── */
.footer {
  padding: 2rem 0;
  border-top: 1px solid var(--hx-color-border, #e5e7eb);
  text-align: center;
  color: var(--hx-color-text-secondary, #666);
  font-size: 0.875rem;
}

/* ── Dark mode ───────────────────────────────────────────────────────── */
:root[data-theme='dark'],
.dark {
  color-scheme: dark;
  --hx-color-surface: #0f0f11;
  --hx-color-surface-hover: #1c1c20;
  --hx-color-text: #f0f0f0;
  --hx-color-text-secondary: #a0a0ab;
  --hx-color-border: #2e2e35;
}

/* ── Responsive ──────────────────────────────────────────────────────── */
@media (max-width: 600px) {
  .navbar-links {
    display: none;
  }

  .hero {
    padding: 3rem 0 2.5rem;
  }
}
`,
  );

  // src/components/helix/wrappers.tsx — @lit/react wrappers for key HELiX components
  await safeEnsureDir(path.join(srcDir, 'components', 'helix'));
  await safeWriteFile(
    path.join(srcDir, 'components', 'helix', 'wrappers.tsx'),
    `/**
 * React wrappers for HELiX web components.
 *
 * @lit/react creates type-safe React components that properly bridge:
 * - Properties (not just attributes)
 * - Events (CustomEvent → React callbacks)
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

export const HxBadge = createComponent({
  tagName: 'hx-badge',
  elementClass: customElements.get('hx-badge') as CustomElementConstructor,
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
`,
  );

  // src/components/helix/provider.tsx — HelixProvider initialises HELiX on the client
  await safeWriteFile(
    path.join(srcDir, 'components', 'helix', 'provider.tsx'),
    `/**
 * HelixProvider — initialises HELiX web components on the client.
 *
 * Wrap your app root with this provider to ensure all custom elements
 * are registered before any child component renders.
 *
 * In a Vite SPA this is straightforward — there is no SSR to worry about.
 * For SSR environments see the react-next template instead.
 */
import React, { useEffect, useState, type ReactNode } from 'react';

interface HelixProviderProps {
  children: ReactNode;
  /** Explicit theme — synced to <html data-theme> */
  theme?: 'light' | 'dark';
}

export function HelixProvider({ children, theme }: HelixProviderProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Dynamic import keeps the initial bundle small
    import('@helixui/library').then(() => {
      if (theme) {
        document.documentElement.setAttribute('data-theme', theme);
      }
      setReady(true);
    });
  }, [theme]);

  // Render children immediately — HELiX registers elements asynchronously
  // but the DOM placeholders are painted right away, avoiding layout shift.
  return <>{ready ? children : children}</>;
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

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: globalsStyles },
];

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

  // app/routes/_index.tsx
  await safeWriteFile(
    path.join(routesDir, '_index.tsx'),
    `import type { MetaFunction } from 'react-router';
import { useState } from 'react';
import { HxButton, HxCard, HxBadge } from '../components/helix/wrappers';

export const meta: MetaFunction = () => {
  return [
    { title: '${sanitizeForHtml(options.name)}' },
    { name: 'description', content: 'Built with HELiX + React Router' },
  ];
};

export default function Index() {
  const [count, setCount] = useState(0);

  return (
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
      </HxCard>
    </div>
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
  await safeEnsureDir(pagesDir);

  // astro.config.mjs
  await safeWriteFile(
    path.join(options.directory, 'astro.config.mjs'),
    `import { defineConfig } from 'astro/config';

export default defineConfig({});
`,
  );

  // Main page
  await safeWriteFile(
    path.join(pagesDir, 'index.astro'),
    `---
// HELiX components load client-side
---
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${CSP_META}
    <title>${sanitizeForHtml(options.name)}</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        margin: 0;
        padding: 2rem;
      }
      .container { max-width: 800px; margin: 0 auto; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>HELiX + Astro</h1>
      <p>Zero JS by default. Components hydrate as islands.</p>

      <hx-card>
        <div slot="header"><h2>Astro Islands</h2></div>
        <p>HELiX components are custom elements — they self-register and work without a framework runtime.</p>
        <hx-button variant="primary">Interactive Button</hx-button>
      </hx-card>
    </div>

    <script>
      import '@helixui/library';
    </script>
  </body>
</html>
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
  const pluginsDir = path.join(options.directory, 'plugins');
  await safeEnsureDir(pagesDir);
  await safeEnsureDir(pluginsDir);

  // nuxt.config.ts
  await safeWriteFile(
    path.join(options.directory, 'nuxt.config.ts'),
    `export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },
  vue: {
    compilerOptions: {
      // Tell Vue to treat hx-* tags as custom elements
      isCustomElement: (tag: string) => tag.startsWith('hx-'),
    },
  },
${options.designTokens ? `  css: ['~/helix-tokens.css'],` : ''}
});
`,
  );

  // HELiX plugin (client-only)
  await safeWriteFile(
    path.join(pluginsDir, 'helix.client.ts'),
    `export default defineNuxtPlugin(async () => {
  await import('@helixui/library');
});
`,
  );

  // app.vue
  await safeWriteFile(
    path.join(appDir, 'app.vue'),
    `<template>
  <NuxtPage />
</template>
`,
  );

  // index page
  await safeWriteFile(
    path.join(pagesDir, 'index.vue'),
    `<script setup lang="ts">
import { ref } from 'vue';

const name = ref('');
const submitted = ref(false);

function handleSubmit() {
  submitted.value = true;
  setTimeout(() => { submitted.value = false; }, 3000);
}

function handleInput(e: Event) {
  const detail = (e as CustomEvent).detail;
  name.value = detail?.value ?? '';
}
</script>

<template>
  <div class="container">
    <h1>HELiX + Nuxt 4</h1>
    <p>Full-stack Vue with SSR. Web components auto-hydrate on the client.</p>

    <hx-card>
      <div slot="header"><h2>Interactive Form</h2></div>
      <hx-text-input
        label="Your name"
        placeholder="Enter your name"
        :value="name"
        @hx-input="handleInput"
      />
      <hx-button variant="primary" style="margin-top: 1rem" @hx-click="handleSubmit">
        Say Hello
      </hx-button>
      <hx-alert v-if="submitted" variant="success" open style="margin-top: 1rem">
        Hello, {{ name || 'World' }}!
      </hx-alert>
    </hx-card>

    <hx-card style="margin-top: 1.5rem">
      <div slot="header"><h2>Component Showcase</h2></div>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <hx-button variant="primary">Primary</hx-button>
        <hx-button variant="secondary">Secondary</hx-button>
        <hx-button variant="danger">Danger</hx-button>
        <hx-badge variant="info">Badge</hx-badge>
        <hx-badge variant="success">Success</hx-badge>
      </div>
    </hx-card>
  </div>
</template>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
</style>
`,
  );

  await writeVueErrorBoundary(options);
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
  await safeEnsureDir(srcDir);

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

  // App.tsx
  await safeWriteFile(
    path.join(srcDir, 'App.tsx'),
    `import { createSignal, createEffect } from 'solid-js';

export default function App() {
  const [count, setCount] = createSignal(0);

  createEffect(() => {
    // Runs whenever count() changes — fine-grained reactivity
    console.log('count changed:', count());
  });

  return (
    <div class="container">
      <h1>HELiX + Solid.js + Vite</h1>
      <hx-card>
        <div slot="header"><h2>Counter Demo</h2></div>
        <p>Count: {count()}</p>
        <hx-button variant="primary" onClick={() => setCount((c) => c + 1)}>
          Increment
        </hx-button>
        <hx-button
          variant="secondary"
          style="margin-left: 0.5rem"
          onClick={() => setCount(0)}
        >
          Reset
        </hx-button>
      </hx-card>

      <hx-card style="margin-top: 1.5rem">
        <div slot="header">
          <h2>Solid.js + Web Components</h2>
          <hx-badge variant="info">Native Support</hx-badge>
        </div>
        <p>Solid.js renders directly to the DOM — no virtual DOM — making it
        ideal for web components. Properties and events bind natively.</p>
        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <hx-button variant="primary" size="sm">Primary</hx-button>
          <hx-button variant="secondary" size="sm">Secondary</hx-button>
          <hx-button variant="danger" size="sm">Danger</hx-button>
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
}

async function scaffoldQwikVite(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  const routesDir = path.join(srcDir, 'routes');
  await safeEnsureDir(srcDir);
  await safeEnsureDir(routesDir);

  // vite.config.ts
  await safeWriteFile(
    path.join(options.directory, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';

export default defineConfig({
  plugins: [qwikVite()],
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
    <script type="module" src="/src/entry.dev.tsx"></script>
  </body>
</html>
`,
  );

  // src/root.tsx — resumable root component
  await safeWriteFile(
    path.join(srcDir, 'root.tsx'),
    `import { component$ } from '@builder.io/qwik';
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city';
${options.designTokens ? "import './helix-setup';" : "import '@helixui/library';"}
import './index.css';

export default component$(() => {
  return (
    <QwikCityProvider>
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" />
        <title>${sanitizeForHtml(options.name)}</title>
      </head>
      <body>
        <RouterOutlet />
      </body>
    </QwikCityProvider>
  );
});
`,
  );

  // src/entry.dev.tsx
  await safeWriteFile(
    path.join(srcDir, 'entry.dev.tsx'),
    `import { render } from '@builder.io/qwik';
import Root from './root';

render(document.getElementById('app')!, <Root />);
`,
  );

  // src/routes/layout.tsx
  await safeWriteFile(
    path.join(routesDir, 'layout.tsx'),
    `import { component$, Slot } from '@builder.io/qwik';

export default component$(() => {
  return (
    <div class="container">
      <header>
        <h1>${sanitizeForHtml(options.name)}</h1>
      </header>
      <main>
        <Slot />
      </main>
    </div>
  );
});
`,
  );

  // src/routes/index.tsx
  await safeWriteFile(
    path.join(routesDir, 'index.tsx'),
    `import { component$, useSignal } from '@builder.io/qwik';

export default component$(() => {
  const count = useSignal(0);

  return (
    <div>
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

async function scaffoldPreactVite(options: ProjectOptions): Promise<void> {
  const srcDir = path.join(options.directory, 'src');
  await safeEnsureDir(srcDir);

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

  // src/app.tsx — Preact component
  await safeWriteFile(
    path.join(srcDir, 'app.tsx'),
    `import { useState } from 'preact/hooks';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div class="container">
      <h1>HELiX + Preact + Vite</h1>
      <hx-card>
        <div slot="header"><h2>Counter Demo</h2></div>
        <p>Count: {count}</p>
        <hx-button variant="primary" onClick={() => setCount((c) => c + 1)}>
          Increment
        </hx-button>
        <hx-button
          variant="secondary"
          style="margin-left: 0.5rem"
          onClick={() => setCount(0)}
        >
          Reset
        </hx-button>
      </hx-card>

      <hx-card style="margin-top: 1.5rem">
        <div slot="header">
          <h2>Preact + Web Components</h2>
          <hx-badge variant="info">3kB Runtime</hx-badge>
        </div>
        <p>Preact is a fast 3kB alternative to React with the same modern API.
        It renders directly to the DOM with minimal overhead, making it ideal
        for lightweight web component integration.</p>
        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <hx-button variant="primary" size="sm">Primary</hx-button>
          <hx-button variant="secondary" size="sm">Secondary</hx-button>
          <hx-button variant="danger" size="sm">Danger</hx-button>
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

  await writeReactErrorBoundary(options);
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
