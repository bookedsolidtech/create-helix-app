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
  validateDsName,
  validateTokenPrefix,
  validateScopedNameForFramework,
} from './validation.js';
import type {
  Framework,
  ComponentBundle,
  TemplateConfig,
  PresetConfig,
  HeroScenario,
} from './types.js';

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
  /**
   * Design system codename. Becomes the custom-element tag prefix and class
   * name root (e.g. dsName='aurora' → <aurora-button>, AuroraButton).
   * Defaults to the project name when valid as a dsName, else 'my-ds'.
   * wc-storybook only — ignored by other framework templates.
   */
  dsName?: string;
  /**
   * CSS custom property prefix for the brand token layer (e.g. '--aurora').
   * Defaults to `--{dsName}` so the consumer's brand layer gets a unique
   * namespace. Cannot be `--hx` (reserved for upstream HELiX, would create
   * cyclic bridge declarations). wc-storybook only.
   */
  tokenPrefix?: string;
  /** Brand tagline rendered on the Cover page. wc-storybook only. */
  brandTagline?: string;
  /** Brand verticals — populates the Storybook brand toolbar. wc-storybook only. */
  brandVerticals?: string[];
  /** Per-component hero scenes. wc-storybook only. */
  heroScenarios?: HeroScenario[];
  /**
   * v0.7.0 Phase B: route the scaffolder to its monorepo-shape variant
   * (apps/web + packages/design-system, pnpm + turbo). Defaults:
   *  - `framework === 'wc-storybook'`: coerced to `false` (a DS-only
   *    scaffold isn't a monorepo; this is NOT an error — passing `true`
   *    is silently ignored).
   *  - `framework ∈ {react-next, react-vite}` with `monorepoMode`
   *    omitted: defaults to `true`, matching the interactive prompt's
   *    "Include @{scope}/design-system?" default-Yes. Pass `false`
   *    explicitly to get the flat single-app shape (v0.6.x behavior).
   *  - Other frameworks: ignored (no monorepo emitter yet).
   */
  monorepoMode?: boolean;
  /**
   * v0.7.0 Phase B: whether the monorepo includes a
   * `packages/design-system` workspace alongside `apps/web`. Reserved
   * for future combos (`monorepoMode:true, includeDesignSystem:false`
   * → monorepo with just apps/web). Phase B does NOT ship that combo:
   * the value tracks `monorepoMode` for the react-next / react-vite
   * paths and is coerced to `false` for wc-storybook.
   */
  includeDesignSystem?: boolean;
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
  /**
   * Peer dependencies the consumer host must satisfy. Populated for
   * library templates (wc-storybook today) where the published package
   * documents a contract version of @helixui/library / @helixui/tokens.
   * Omitted for app-style templates that declare no peers. Tooling that
   * audits or pre-installs template requirements should read this when
   * present.
   */
  peerDependencies?: Record<string, string>;
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
    // Forward peerDependencies when populated so api.ts consumers can
    // discover the consumer-host contract surface (wc-storybook's
    // @helixui/library + @helixui/tokens 3.3.1 pin). App-style templates
    // declare no peers — omit the field rather than emit an empty object.
    ...(t.peerDependencies && Object.keys(t.peerDependencies).length > 0
      ? { peerDependencies: t.peerDependencies }
      : {}),
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

  // wc-storybook is a Lit + TypeScript + token-pipeline factory that
  // ALWAYS emits TypeScript and the token build pipeline. Honoring a
  // caller-supplied typescript:false / designTokens:false would put the
  // pre-pass into JS-mode (non-TS eslint config, no token files) while
  // the wc-storybook generator still wrote .ts components — `npm run
  // lint` and `pnpm type-check` would break immediately. Force both
  // modes on for this template, matching what cli.ts does for the
  // interactive path.
  const wcStorybookForce = options.framework === 'wc-storybook';
  // v0.7.0 Phase B — monorepoMode defaulting:
  //  - wc-storybook: coerced to false (DS-only scaffold isn't a monorepo;
  //    silently ignored, NOT an error — callers may pass `true` from a
  //    generic config without paying attention to framework).
  //  - react-next / react-vite: undefined → true (matches the interactive
  //    prompt's "Include @{scope}/design-system?" default-Yes). Explicit
  //    `false` opts into the flat single-app shape (v0.6.x behavior).
  //  - other frameworks: respected as-is (no monorepo emitter yet, so a
  //    truthy value will fall through dispatch and the flat scaffolder
  //    runs — the unbuilt frameworks see no behavior change in Phase B).
  const isAppFramework =
    options.framework === 'react-next' ||
    options.framework === 'react-vite' ||
    options.framework === 'astro';
  const resolvedMonorepoMode = wcStorybookForce
    ? false
    : isAppFramework
      ? (options.monorepoMode ?? true)
      : (options.monorepoMode ?? false);
  // includeDesignSystem currently tracks monorepoMode 1:1 — Phase B does
  // not ship the "monorepo without DS" combo. wc-storybook coerces to
  // false (the scaffold IS the DS).
  const resolvedIncludeDesignSystem = wcStorybookForce
    ? false
    : (options.includeDesignSystem ?? resolvedMonorepoMode);
  await scaffoldProject({
    name: options.name,
    directory: options.directory,
    framework: options.framework,
    componentBundles: options.componentBundles ?? ['all'],
    typescript: wcStorybookForce ? true : (options.typescript ?? true),
    eslint: options.eslint ?? true,
    designTokens: wcStorybookForce ? true : (options.designTokens ?? true),
    darkMode: options.darkMode ?? false,
    installDeps: options.installDeps ?? false,
    dryRun: options.dryRun ?? false,
    force: options.force ?? false,
    // wc-storybook naming + brand fields. Forwarded as-is so the
    // scaffolder's own defaults (dsName ← project name, tokenPrefix ←
    // --{ds}, brand prompts ← cross-domain neutral) apply when omitted.
    dsName: options.dsName,
    tokenPrefix: options.tokenPrefix,
    brandTagline: options.brandTagline,
    brandVerticals: options.brandVerticals,
    heroScenarios: options.heroScenarios,
    monorepoMode: resolvedMonorepoMode,
    includeDesignSystem: resolvedIncludeDesignSystem,
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
    } else if (options.name !== undefined && !errors['name']) {
      // Scoped names are only valid for library templates. Stencil and
      // Ember interpolate the project name into namespace fields and
      // asset URLs that can't contain `/` or `@`. Run this gate after
      // the basic name + framework checks pass.
      const scopeErr = validateScopedNameForFramework(options.name, options.framework);
      if (scopeErr) errors['name'] = scopeErr;
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

  // wc-storybook naming validation. dsName + tokenPrefix get interpolated
  // into directory paths and class names — programmatic callers must not
  // be able to pass values that traverse outside options.directory or
  // emit cyclic bridge declarations. Both fields are wc-storybook-only;
  // for other frameworks they're documented as ignored, so validation
  // is gated on the selected framework to avoid rejecting shared
  // options objects like `{ framework: 'react-vite', tokenPrefix: '--hx' }`.
  if (options.framework === 'wc-storybook') {
    if (options.dsName !== undefined) {
      const err = validateDsName(options.dsName);
      if (err) errors['dsName'] = err;
    }
    if (options.tokenPrefix !== undefined) {
      const err = validateTokenPrefix(options.tokenPrefix);
      if (err) errors['tokenPrefix'] = err;
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
