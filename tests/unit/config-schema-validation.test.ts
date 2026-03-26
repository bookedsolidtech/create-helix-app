import { describe, it, expect } from 'vitest';
import { validateHelixConfig } from '../../src/config-validator.js';

// ─── Valid configs ────────────────────────────────────────────────────────────

describe('validateHelixConfig — valid configs', () => {
  it('accepts an empty object', () => {
    const result = validateHelixConfig('{}');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('accepts a config with empty defaults', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: {} }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts all known frameworks as template values', () => {
    const frameworks = [
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

    for (const fw of frameworks) {
      const result = validateHelixConfig(JSON.stringify({ defaults: { template: fw } }));
      expect(result.valid, `framework "${fw}" should be valid`).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('accepts all valid boolean combinations', () => {
    const config = {
      defaults: {
        template: 'angular',
        typescript: true,
        eslint: false,
        darkMode: true,
        tokens: false,
      },
    };
    const result = validateHelixConfig(JSON.stringify(config));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts valid bundles array', () => {
    const config = { defaults: { bundles: ['core', 'forms', 'navigation'] } };
    const result = validateHelixConfig(JSON.stringify(config));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts all valid bundle values', () => {
    const config = {
      defaults: {
        bundles: ['all', 'core', 'forms', 'navigation', 'data-display', 'feedback', 'layout'],
      },
    };
    const result = validateHelixConfig(JSON.stringify(config));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts a fully-specified valid config', () => {
    const config = {
      defaults: {
        template: 'react-next',
        typescript: true,
        eslint: true,
        darkMode: true,
        tokens: true,
        bundles: ['core', 'forms'],
      },
    };
    const result = validateHelixConfig(JSON.stringify(config));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ─── Invalid field types ──────────────────────────────────────────────────────

describe('validateHelixConfig — invalid field types', () => {
  it('reports error when template is not a string', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { template: 42 } }));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('defaults.template');
    expect(result.errors[0].message).toContain('"defaults.template" must be a string');
  });

  it('reports error when template is not a valid framework ID', () => {
    const result = validateHelixConfig(
      JSON.stringify({ defaults: { template: 'not-a-framework' } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('defaults.template');
    expect(result.errors[0].message).toContain('"defaults.template" value "not-a-framework"');
  });

  it('includes suggestion for invalid template value', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { template: 'invalid' } }));
    expect(result.valid).toBe(false);
    expect(result.errors[0].suggestion).toBeDefined();
    expect(result.errors[0].suggestion).toContain('Valid values:');
  });

  it('reports error when typescript is not a boolean', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { typescript: 'true' } }));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('defaults.typescript');
    expect(result.errors[0].message).toContain('"defaults.typescript" must be a boolean');
  });

  it('reports error when eslint is not a boolean', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { eslint: 1 } }));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('defaults.eslint');
    expect(result.errors[0].message).toContain('"defaults.eslint" must be a boolean');
  });

  it('reports error when darkMode is not a boolean', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { darkMode: 'yes' } }));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('defaults.darkMode');
    expect(result.errors[0].message).toContain('"defaults.darkMode" must be a boolean');
  });

  it('reports error when tokens is not a boolean', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { tokens: 0 } }));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('defaults.tokens');
    expect(result.errors[0].message).toContain('"defaults.tokens" must be a boolean');
  });

  it('reports error when bundles is not an array', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { bundles: 'core' } }));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('defaults.bundles');
    expect(result.errors[0].message).toContain('"defaults.bundles" must be an array');
  });

  it('reports error when bundles contains an invalid value', () => {
    const result = validateHelixConfig(
      JSON.stringify({ defaults: { bundles: ['core', 'invalid-bundle'] } }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('defaults.bundles');
    expect(result.errors[0].message).toContain('"invalid-bundle"');
  });

  it('reports error when bundles contains non-string items', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { bundles: [42] } }));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('defaults.bundles');
    expect(result.errors[0].message).toContain('only strings');
  });

  it('reports error when defaults is not an object', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: 'invalid' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].key).toBe('defaults');
    expect(result.errors[0].message).toContain('"defaults" must be an object');
  });

  it('reports error for invalid JSON', () => {
    const result = validateHelixConfig('{ invalid json }');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Invalid JSON syntax');
  });

  it('reports error when root is not an object', () => {
    const result = validateHelixConfig('"just a string"');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Config must be a JSON object');
  });

  it('includes line numbers in errors', () => {
    const raw = `{\n  "defaults": {\n    "typescript": "not-a-bool"\n  }\n}`;
    const result = validateHelixConfig(raw);
    expect(result.valid).toBe(false);
    expect(result.errors[0].line).toBeGreaterThan(0);
  });

  it('includes suggestions with boolean errors', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { eslint: 'true' } }));
    expect(result.errors[0].suggestion).toBeDefined();
    expect(result.errors[0].suggestion).toContain('Example:');
  });
});

// ─── Unknown keys (warnings) ──────────────────────────────────────────────────

describe('validateHelixConfig — unknown keys', () => {
  it('warns about unknown top-level keys', () => {
    const result = validateHelixConfig(JSON.stringify({ unknownKey: true }));
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].key).toBe('unknownKey');
    expect(result.warnings[0].message).toContain('"unknownKey"');
  });

  it('warns about multiple unknown top-level keys', () => {
    const result = validateHelixConfig(JSON.stringify({ foo: 1, bar: 2 }));
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(2);
  });

  it('warns about unknown keys inside defaults', () => {
    const result = validateHelixConfig(
      JSON.stringify({ defaults: { template: 'angular', unknownOption: 'value' } }),
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].key).toBe('defaults.unknownOption');
    expect(result.warnings[0].message).toContain('defaults.unknownOption');
  });

  it('config is still valid when only unknown keys are present (warnings, not errors)', () => {
    const result = validateHelixConfig(
      JSON.stringify({ defaults: { template: 'react-vite', future: 'feature' } }),
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('includes line number in warnings', () => {
    const raw = `{\n  "unknownKey": true\n}`;
    const result = validateHelixConfig(raw);
    expect(result.warnings[0].line).toBeGreaterThan(0);
  });
});

// ─── Validate subcommand output ───────────────────────────────────────────────

describe('validateHelixConfig — output shape for validate subcommand', () => {
  it('returns valid:true with empty errors and warnings for valid config', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { template: 'vue-vite' } }));
    expect(result).toMatchObject({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it('returns valid:false with populated errors for invalid config', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { template: 123 } }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toHaveProperty('line');
    expect(result.errors[0]).toHaveProperty('key');
    expect(result.errors[0]).toHaveProperty('message');
  });

  it('each error has line, key, and message fields', () => {
    const result = validateHelixConfig(JSON.stringify({ defaults: { typescript: 'yes' } }));
    const err = result.errors[0];
    expect(typeof err.line).toBe('number');
    expect(typeof err.key).toBe('string');
    expect(typeof err.message).toBe('string');
  });

  it('each warning has line, key, and message fields', () => {
    const result = validateHelixConfig(JSON.stringify({ unknownThing: true }));
    const warn = result.warnings[0];
    expect(typeof warn.line).toBe('number');
    expect(typeof warn.key).toBe('string');
    expect(typeof warn.message).toBe('string');
  });
});
