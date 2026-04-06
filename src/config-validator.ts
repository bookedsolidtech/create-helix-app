import type { Framework, ComponentBundle } from './types.js';

export interface ValidationError {
  line: number;
  key: string;
  message: string;
  suggestion?: string;
}

export interface ValidationWarning {
  line: number;
  key: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const VALID_FRAMEWORKS: Framework[] = [
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
];

const VALID_BUNDLES: ComponentBundle[] = [
  'all',
  'core',
  'forms',
  'navigation',
  'data-display',
  'feedback',
  'layout',
];

const KNOWN_TOP_LEVEL_KEYS = new Set(['defaults']);

const KNOWN_DEFAULTS_KEYS = new Set([
  'template',
  'typescript',
  'eslint',
  'darkMode',
  'tokens',
  'bundles',
]);

/**
 * Finds the 1-indexed line number of the first occurrence of `key` in raw JSON.
 * When `afterKey` is provided, searches only within the section after that key.
 */
function findLineNumber(raw: string, key: string, afterKey?: string): number {
  const lines = raw.split('\n');
  const searchFor = `"${key}"`;

  let startLine = 0;
  if (afterKey !== undefined) {
    const afterSearch = `"${afterKey}"`;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(afterSearch)) {
        startLine = i;
        break;
      }
    }
  }

  for (let i = startLine; i < lines.length; i++) {
    if (lines[i].includes(searchFor)) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Validates a parsed .helixrc.json config against the HELiX schema.
 * Takes the raw JSON string to enable line-number reporting.
 */
export function validateHelixConfig(raw: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      errors: [{ line: 1, key: '', message: 'Invalid JSON syntax' }],
      warnings: [],
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      errors: [{ line: 1, key: '', message: 'Config must be a JSON object' }],
      warnings: [],
    };
  }

  const config = parsed as Record<string, unknown>;

  // Check for unknown top-level keys
  for (const key of Object.keys(config)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push({
        line: findLineNumber(raw, key),
        key,
        message: `Unknown key "${key}" — only "defaults" is valid at the top level`,
      });
    }
  }

  // Validate defaults
  if ('defaults' in config) {
    const defaults = config['defaults'];

    if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
      errors.push({
        line: findLineNumber(raw, 'defaults'),
        key: 'defaults',
        message: '"defaults" must be an object',
        suggestion: 'Example: "defaults": { "template": "react-next" }',
      });
      return { valid: false, errors, warnings };
    }

    const defs = defaults as Record<string, unknown>;

    // Check for unknown keys inside defaults
    for (const key of Object.keys(defs)) {
      if (!KNOWN_DEFAULTS_KEYS.has(key)) {
        warnings.push({
          line: findLineNumber(raw, key, 'defaults'),
          key: `defaults.${key}`,
          message: `Unknown key "defaults.${key}" — valid keys are: ${[...KNOWN_DEFAULTS_KEYS].join(', ')}`,
        });
      }
    }

    // Validate template
    if ('template' in defs) {
      const template = defs['template'];
      if (typeof template !== 'string') {
        errors.push({
          line: findLineNumber(raw, 'template', 'defaults'),
          key: 'defaults.template',
          message: '"defaults.template" must be a string',
          suggestion: `Valid values: ${VALID_FRAMEWORKS.join(', ')}`,
        });
      } else if (!(VALID_FRAMEWORKS as string[]).includes(template)) {
        const similar = VALID_FRAMEWORKS.find((fw) => fw.startsWith(template.split('-')[0]));
        errors.push({
          line: findLineNumber(raw, 'template', 'defaults'),
          key: 'defaults.template',
          message: `"defaults.template" value "${template}" is not a valid framework ID`,
          suggestion: similar
            ? `Did you mean "${similar}"? Valid values: ${VALID_FRAMEWORKS.join(', ')}`
            : `Valid values: ${VALID_FRAMEWORKS.join(', ')}`,
        });
      }
    }

    // Validate boolean fields
    for (const boolKey of ['typescript', 'eslint', 'darkMode', 'tokens'] as const) {
      if (boolKey in defs && typeof defs[boolKey] !== 'boolean') {
        errors.push({
          line: findLineNumber(raw, boolKey, 'defaults'),
          key: `defaults.${boolKey}`,
          message: `"defaults.${boolKey}" must be a boolean (true or false), got ${JSON.stringify(defs[boolKey])}`,
          suggestion: `Example: "${boolKey}": true`,
        });
      }
    }

    // Validate bundles
    if ('bundles' in defs) {
      const bundles = defs['bundles'];
      if (!Array.isArray(bundles)) {
        errors.push({
          line: findLineNumber(raw, 'bundles', 'defaults'),
          key: 'defaults.bundles',
          message: '"defaults.bundles" must be an array',
          suggestion: `Example: "bundles": ["core", "forms"]`,
        });
      } else {
        for (const bundle of bundles) {
          if (typeof bundle !== 'string') {
            errors.push({
              line: findLineNumber(raw, 'bundles', 'defaults'),
              key: 'defaults.bundles',
              message: '"defaults.bundles" must contain only strings',
              suggestion: `Valid values: ${VALID_BUNDLES.join(', ')}`,
            });
          } else if (!(VALID_BUNDLES as string[]).includes(bundle)) {
            errors.push({
              line: findLineNumber(raw, 'bundles', 'defaults'),
              key: 'defaults.bundles',
              message: `"defaults.bundles" contains invalid value "${bundle}"`,
              suggestion: `Valid values: ${VALID_BUNDLES.join(', ')}`,
            });
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
