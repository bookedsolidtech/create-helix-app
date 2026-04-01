import fs from 'fs-extra';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { getTemplate, getComponentsForBundles } from './templates.js';
import type { ProjectOptions } from './types.js';
import { HelixError, ErrorCode } from './errors.js';
import { HookManager, buildHookContext } from './plugins/hooks.js';
import { loadHelixRcHooks } from './plugins/config-loader.js';
import { discoverPlugins } from './plugins/plugin-discovery.js';

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

async function safeWriteFile(filePath: string, content: string): Promise<void> {
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
  const logVerbose = (msg: string): void => {
    if (options.verbose) console.log(pc.dim(`  [verbose] ${msg}`));
  };

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
  for (const { lifecycle, hook, source } of rcHooks) {
    hookManager.register(lifecycle, hook, source);
  }

  // Auto-discover plugins from node_modules (warnings logged; never fatal)
  const pluginHooks = await discoverPlugins(projectRoot);
  for (const { name, lifecycle, hook } of pluginHooks) {
    hookManager.register(lifecycle, hook, name);
  }

  // Build initial hook context
  let hookCtx = buildHookContext(options.name, options.framework, options.directory, options);

  // Fire pre-scaffold
  hookCtx = await hookManager.run('pre-scaffold', hookCtx);

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
    hookCtx = await hookManager.run('pre-write', hookCtx);

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
    hookCtx = await hookManager.run('post-write', hookCtx);

    // Fire post-scaffold after everything is done
    await hookManager.run('post-scaffold', hookCtx);
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
  template: ReturnType<typeof getTemplate> & object,
): Promise<void> {
  const pkg = {
    name: options.name,
    version: '0.1.0',
    private: true,
    type: 'module',
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

  // Generate unique install tracking ID
  const installId = randomBytes(8).toString('hex');

  // Copy brand assets into public/og/
  const assetsSource = path.join(new URL('.', import.meta.url).pathname, '..', 'assets', 'og');
  const publicOgDir = path.join(options.directory, 'public', 'og');
  if (await fs.pathExists(assetsSource)) {
    await fs.copy(assetsSource, publicOgDir);
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

  // App.tsx
  await safeWriteFile(
    path.join(srcDir, 'App.tsx'),
    `import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      <h1>HELiX + React + Vite</h1>
      <hx-card>
        <div slot="header"><h2>Counter Demo</h2></div>
        <p>Count: {count}</p>
        <hx-button variant="primary" onClick={() => setCount(c => c + 1)}>
          Increment
        </hx-button>
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
}

.container {
  max-width: 800px;
  margin: 0 auto;
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
  await safeEnsureDir(routesDir);

  // svelte.config.js
  await safeWriteFile(
    path.join(options.directory, 'svelte.config.js'),
    `import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
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

  // +page.svelte
  await safeWriteFile(
    path.join(routesDir, '+page.svelte'),
    `<script lang="ts">
  import { onMount } from 'svelte';

  let name = $state('');
  let submitted = $state(false);

  onMount(async () => {
    await import('@helixui/library');
  });

  function handleSubmit() {
    submitted = true;
    setTimeout(() => { submitted = false; }, 3000);
  }
</script>

<svelte:head>
  <title>${sanitizeForHtml(options.name)}</title>
</svelte:head>

<div class="container">
  <h1>HELiX + SvelteKit</h1>
  <p>Svelte has the best native custom element support of any framework.</p>

  <hx-card>
    <div slot="header"><h2>Interactive Demo</h2></div>
    <hx-text-input
      label="Your name"
      placeholder="Enter your name"
      value={name}
      on:hx-input={(e) => name = e.detail?.value ?? ''}
    />
    <hx-button variant="primary" style="margin-top: 1rem" on:hx-click={handleSubmit}>
      Say Hello
    </hx-button>
    {#if submitted}
      <hx-alert variant="success" open style="margin-top: 1rem">
        Hello, {name || 'World'}!
      </hx-alert>
    {/if}
  </hx-card>
</div>

<style>
  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }
</style>
`,
  );

  // +layout.svelte
  await safeWriteFile(
    path.join(routesDir, '+layout.svelte'),
    `<script>
  import '@helixui/tokens/tokens.css';
</script>

<slot />
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
