/**
 * Programmatic API for create-helix.
 *
 * Provides pure functions with no process.exit calls and no TUI output,
 * suitable for use in CI/CD pipelines and build tools.
 *
 * @example
 * ```ts
 * import { scaffold, listTemplates, validate } from 'create-helix/api';
 *
 * const result = await scaffold({ name: 'my-app', directory: './my-app', framework: 'react-vite' });
 * ```
 */

import fs from 'fs-extra';
import { scaffoldProject, getDryRunEntries } from './scaffold.js';
import { TEMPLATES, COMPONENT_BUNDLES } from './templates.js';
import { PRESETS } from './presets/loader.js';
import {
  validateProjectName,
  validateDirectory,
  validateFramework,
  validatePreset,
} from './validation.js';
import type { Framework, ComponentBundle, TemplateConfig, PresetConfig } from './types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type { Framework, ComponentBundle };

/**
 * Options for the scaffold() function.
 */
export interface ScaffoldOptions {
  /** npm-compatible project name */
  name: string;
  /** Output directory path */
  directory: string;
  /** Framework template identifier */
  framework: Framework;
  /** Component bundles to include (defaults to ['all']) */
  componentBundles?: ComponentBundle[];
  /** Include TypeScript configuration (default: true) */
  typescript?: boolean;
  /** Include ESLint configuration (default: true) */
  eslint?: boolean;
  /** Include design tokens (default: true) */
  designTokens?: boolean;
  /** Include dark mode support (default: false) */
  darkMode?: boolean;
  /** Install dependencies after scaffolding (default: false) */
  installDeps?: boolean;
  /** Dry-run mode — report files that would be written without writing them (default: false) */
  dryRun?: boolean;
  /** Overwrite existing non-empty directory (default: false) */
  force?: boolean;
}

/**
 * Result returned by the scaffold() function.
 */
export interface ScaffoldResult {
  success: boolean;
  projectName: string;
  directory: string;
  framework: string;
  dryRun: boolean;
  /** Files that would be created (only populated when dryRun is true) */
  files?: { path: string; size: number }[];
}

/**
 * A template definition without CLI-specific properties (e.g. color functions).
 */
export interface TemplateDefinition {
  id: Framework;
  name: string;
  description: string;
  hint: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  features: string[];
}

/**
 * A Drupal preset definition.
 */
export type PresetDefinition = PresetConfig;

/**
 * Result of the validate() function.
 */
export interface ValidationResult {
  valid: boolean;
  /** Field-keyed error messages. Empty when valid is true. */
  errors: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toTemplateDefinition(t: TemplateConfig): TemplateDefinition {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    hint: t.hint,
    dependencies: t.dependencies,
    devDependencies: t.devDependencies,
    features: t.features,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scaffold a new HELiX project programmatically.
 *
 * Throws an Error if validation fails or if the target directory is non-empty
 * and `force` is not set. Does not call process.exit.
 */
export async function scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const validation = validate(options);
  if (!validation.valid) {
    const messages = Object.entries(validation.errors)
      .map(([field, msg]) => `${field}: ${msg}`)
      .join('; ');
    throw new Error(`Validation failed — ${messages}`);
  }

  // Guard: directory exists and is non-empty (scaffoldProject calls process.exit in this case).
  // We pre-check and throw instead.
  if (!options.force) {
    const dirExists = await fs.pathExists(options.directory);
    if (dirExists) {
      const entries = await fs.readdir(options.directory);
      if (entries.length > 0) {
        throw new Error(
          `Directory already exists and is not empty: ${options.directory}. Use force: true to overwrite.`,
        );
      }
    }
  }

  await scaffoldProject({
    name: options.name,
    directory: options.directory,
    framework: options.framework,
    componentBundles: options.componentBundles ?? ['all'],
    typescript: options.typescript ?? true,
    eslint: options.eslint ?? true,
    designTokens: options.designTokens ?? true,
    darkMode: options.darkMode ?? false,
    installDeps: options.installDeps ?? false,
    dryRun: options.dryRun ?? false,
    force: options.force ?? false,
  });

  const result: ScaffoldResult = {
    success: true,
    projectName: options.name,
    directory: options.directory,
    framework: options.framework,
    dryRun: options.dryRun ?? false,
  };

  if (options.dryRun) {
    result.files = getDryRunEntries();
  }

  return result;
}

/**
 * Returns all available framework templates.
 * Safe to call without side effects.
 */
export function listTemplates(): TemplateDefinition[] {
  return TEMPLATES.map(toTemplateDefinition);
}

/**
 * Returns all available Drupal presets.
 * Safe to call without side effects.
 */
export function listPresets(): PresetDefinition[] {
  return PRESETS.map((p) => ({
    ...p,
    sdcList: [...p.sdcList],
    dependencies: { ...p.dependencies },
    templateVars: { ...p.templateVars },
  }));
}

/**
 * Returns a single template definition by ID, or undefined if not found.
 * Safe to call without side effects.
 */
export function getTemplate(id: string): TemplateDefinition | undefined {
  const t = TEMPLATES.find((tmpl) => tmpl.id === id);
  return t ? toTemplateDefinition(t) : undefined;
}

/**
 * Validates scaffold options without performing any filesystem operations.
 * Returns a ValidationResult with field-level error messages.
 */
export function validate(options: Partial<ScaffoldOptions>): ValidationResult {
  const errors: Record<string, string> = {};

  if (options.name !== undefined) {
    const nameError = validateProjectName(options.name);
    if (nameError) errors['name'] = nameError;
  } else {
    errors['name'] = 'Project name is required';
  }

  if (options.directory !== undefined) {
    const dirError = validateDirectory(options.directory);
    if (dirError) errors['directory'] = dirError;
  } else {
    errors['directory'] = 'Directory path is required';
  }

  if (options.framework !== undefined) {
    if (!validateFramework(options.framework)) {
      errors['framework'] = `Unknown framework: "${options.framework}"`;
    }
  } else {
    errors['framework'] = 'Framework is required';
  }

  if (options.componentBundles !== undefined) {
    const validBundleIds = COMPONENT_BUNDLES.map((b) => b.id);
    const invalid = options.componentBundles.filter((b) => !validBundleIds.includes(b));
    if (invalid.length > 0) {
      errors['componentBundles'] = `Unknown component bundle(s): ${invalid.join(', ')}`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Re-export preset validator for convenience.
 */
export { validatePreset };
