const RESERVED_NAMES = new Set([
  'node_modules',
  'favicon.ico',
  '__proto__',
  'constructor',
  'prototype',
]);

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
