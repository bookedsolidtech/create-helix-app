const RESERVED_NAMES = new Set([
  'node_modules',
  'favicon.ico',
  '__proto__',
  'constructor',
  'prototype',
]);

/** Canonical list of valid framework IDs. The Framework type in types.ts derives from this. */
export const VALID_FRAMEWORKS = [
  'react-next',
  'react-vite',
  'remix',
  'vue-nuxt',
  'vue-vite',
  'solid-vite',
  'qwik-vite',
  'svelte-kit',
  'angular',
  'astro',
  'vanilla',
  'lit-vite',
  'wc-storybook',
  'preact-vite',
  'stencil',
  'ember',
] as const;

/** Canonical list of valid Drupal preset IDs. The DrupalPreset type in types.ts derives from this. */
export const VALID_PRESETS = ['standard', 'blog', 'healthcare', 'intranet', 'ecommerce'] as const;

/** Canonical list of valid component bundle IDs. */
export const VALID_BUNDLES = [
  'all',
  'core',
  'forms',
  'navigation',
  'data-display',
  'feedback',
  'layout',
] as const;

/**
 * Validates a project name for npm compatibility and filesystem safety.
 * Returns an error message string on failure, or undefined if valid.
 */
export function validateProjectName(value: string): string | undefined {
  // Reject empty strings and whitespace-only strings
  if (!value || !value.trim()) return 'Project name is required';

  // Reject backslash separators (Windows path traversal vector). Forward
  // slash is allowed only as part of an npm scope: `@scope/name`.
  if (value.includes('\\'))
    return 'Project name cannot contain backslash path separators';

  // Reject names starting with . or ..
  if (value.startsWith('.')) return 'Project name cannot start with a dot';

  // Reject names longer than 214 characters (npm limit)
  if (value.length > 214) return 'Project name must be 214 characters or fewer (npm limit)';

  // Reject reserved names
  if (RESERVED_NAMES.has(value)) return `"${value}" is a reserved name and cannot be used`;

  // Allow npm scoped names (@scope/name) so library publishers can
  // scaffold packages like @acme/design-system. Both halves must
  // independently match the unscoped name pattern. Scope and name are
  // each validated to prevent `@/x`, `@a/.x`, etc. from sneaking through.
  if (value.startsWith('@')) {
    const m = value.match(/^@([a-z0-9][a-z0-9-_]*)\/([a-z0-9][a-z0-9-_]*)$/);
    if (!m) {
      return 'Scoped names must follow @scope/name with lowercase letters, numbers, hyphens, and underscores';
    }
    // The basename (the part after `/`) becomes the directory name and
    // dsName fallback, so reserved-name checks must run against it too.
    // Without this, @acme/node_modules or @acme/__proto__ would pass
    // even though the basename alone would be rejected.
    const basename = m[2];
    if (RESERVED_NAMES.has(basename)) {
      return `"${basename}" is a reserved name and cannot be used (within @${m[1]}/...)`;
    }
    return undefined;
  }

  // Unscoped: only a-z, 0-9, hyphens, underscores allowed
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(value))
    return 'Use only lowercase letters, numbers, hyphens, and underscores (must start with a letter or digit)';

  return undefined;
}

/**
 * Returns the unscoped portion of an npm-style name. Use this for any
 * filesystem-derived value (directory name, dsName fallback, etc.)
 * because path separators in `@scope/pkg` would otherwise traverse.
 *   unscope('@acme/design-system') → 'design-system'
 *   unscope('aurora-kit')          → 'aurora-kit'
 */
export function unscopeName(name: string): string {
  if (!name.startsWith('@')) return name;
  const slash = name.indexOf('/');
  return slash === -1 ? name : name.slice(slash + 1);
}

/**
 * Validates a directory path for filesystem safety.
 * Rejects path traversal sequences, null bytes, and non-printable characters.
 * Returns an error message string on failure, or undefined if valid.
 */
export function validateDirectory(dir: string): string | undefined {
  if (!dir || !dir.trim()) return 'Directory path is required';

  // Reject null bytes — they can be used to truncate strings at the OS layer
  if (dir.includes('\0')) return 'Directory path cannot contain null bytes';

  // Reject non-printable ASCII characters (0x01–0x1F, 0x7F)
  // eslint-disable-next-line no-control-regex
  if (/[\x01-\x1f\x7f]/.test(dir)) return 'Directory path cannot contain non-printable characters';

  // Reject path traversal sequences (both forward and backslash variants)
  if (dir.includes('../') || dir.includes('..\\'))
    return 'Directory path cannot contain path traversal sequences (../)';

  // Reject a bare ".." which is itself a traversal to the parent directory
  if (dir === '..') return 'Directory path cannot be ".."';

  // Reject segments that are ".." when the path is split by separators
  const segments = dir.split(/[\\/]/);
  if (segments.includes('..')) return 'Directory path cannot contain path traversal sequences (..)';

  return undefined;
}

/**
 * Type guard: returns true when `fw` is a known Framework ID.
 */
export function validateFramework(fw: string): fw is (typeof VALID_FRAMEWORKS)[number] {
  return (VALID_FRAMEWORKS as readonly string[]).includes(fw);
}

/**
 * Type guard: returns true when `preset` is a known DrupalPreset ID.
 */
export function validatePreset(preset: string): preset is (typeof VALID_PRESETS)[number] {
  return (VALID_PRESETS as readonly string[]).includes(preset);
}

/**
 * Validates a wc-storybook design system codename (the `dsName` slot).
 * Allows lowercase letters, digits, and hyphens; must start with a letter.
 * Returns an error message string on failure, or undefined if valid.
 *
 * Hoisted out of the interactive prompt so the same rule applies when
 * dsName arrives via --ds-name flag or JSON-mode input. Without this,
 * inputs like `../../tmp` or `123_app` interpolated verbatim into
 * scaffold output paths and class names — a path-traversal hazard plus
 * an invalid-identifier hazard.
 */
export function validateDsName(name: string): string | undefined {
  if (!name) return 'Required';
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    return 'Lowercase letters, numbers, and hyphens only (must start with a letter)';
  return undefined;
}

/**
 * Validates a wc-storybook CSS token prefix (the `tokenPrefix` slot).
 * Must start with `--` followed by a lowercase identifier (e.g. `--bolt`).
 * Returns an error message string on failure, or undefined if valid.
 *
 * Hoisted for the same reason as validateDsName — flag/JSON paths used
 * to skip the regex applied in the interactive prompt.
 */
export function validateTokenPrefix(prefix: string): string | undefined {
  if (!prefix) return 'Required';
  if (!/^--[a-z][a-z0-9-]*$/.test(prefix))
    return 'Must start with -- followed by a lowercase identifier (e.g. --bolt)';
  // Reject --hx specifically for wc-storybook. The factory emits a bridge
  // layer like `--{prefix}-button-bg: var(--{prefix}-button-bg, var(--hx-…))`
  // — when {prefix} === --hx the declaration becomes a cyclic
  // self-reference that CSS parsing silently drops, killing the entire
  // override surface. Helix's namespace is reserved for the upstream
  // platform; consumer brands need a unique prefix.
  if (prefix === '--hx')
    return '--hx is reserved for the upstream HELiX platform and would create cyclic bridge declarations. Pick a brand-specific prefix (e.g. --acme, --bolt).';
  return undefined;
}

/**
 * Validates a Drupal theme machine name.
 * Allows lowercase letters, digits, hyphens, and underscores; max 128 chars.
 * Returns an error message string on failure, or undefined if valid.
 */
export function validateThemeName(name: string): string | undefined {
  if (!name || !name.trim()) return 'Theme name is required';

  if (name.length > 128) return 'Theme name must be 128 characters or fewer';

  // Reject null bytes and non-printable characters
  if (name.includes('\0')) return 'Theme name cannot contain null bytes';

  // Whitelist: lowercase letters, digits, hyphens, underscores only
  if (!/^[a-z][a-z0-9_-]*$/.test(name))
    return 'Use only lowercase letters, numbers, hyphens, and underscores (must start with a letter)';

  return undefined;
}
