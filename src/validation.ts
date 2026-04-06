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

  // Reject names with path separators
  if (value.includes('/') || value.includes('\\'))
    return 'Project name cannot contain path separators (/ or \\)';

  // Reject names starting with . or ..
  if (value.startsWith('.')) return 'Project name cannot start with a dot';

  // Reject names longer than 214 characters (npm limit)
  if (value.length > 214) return 'Project name must be 214 characters or fewer (npm limit)';

  // Reject reserved names
  if (RESERVED_NAMES.has(value)) return `"${value}" is a reserved name and cannot be used`;

  // Reject uppercase, spaces, and special characters — only a-z, 0-9, hyphens, underscores allowed
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(value))
    return 'Use only lowercase letters, numbers, hyphens, and underscores (must start with a letter or digit)';

  return undefined;
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
