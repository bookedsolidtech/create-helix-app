import { describe, it, expect } from 'vitest';
import {
  listTemplates,
  listPresets,
  getTemplate,
  validate,
  type ScaffoldOptions,
  type TemplateDefinition,
  type PresetDefinition,
  type ValidationResult,
} from '../../src/api.js';

describe('listTemplates()', () => {
  it('returns an array of template definitions', () => {
    const templates = listTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('each template has required fields', () => {
    const templates = listTemplates();
    for (const t of templates) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.hint).toBe('string');
      expect(typeof t.dependencies).toBe('object');
      expect(typeof t.devDependencies).toBe('object');
      expect(Array.isArray(t.features)).toBe(true);
    }
  });

  it('does not expose color functions (no TUI-specific properties)', () => {
    const templates = listTemplates();
    for (const t of templates) {
      expect(t).not.toHaveProperty('color');
    }
  });

  it('includes react-next and react-vite templates', () => {
    const templates = listTemplates();
    const ids = templates.map((t) => t.id);
    expect(ids).toContain('react-next');
    expect(ids).toContain('react-vite');
  });

  it('returns a fresh copy (no mutation of internal state)', () => {
    const t1 = listTemplates();
    const t2 = listTemplates();
    expect(t1).not.toBe(t2);
  });
});

describe('listPresets()', () => {
  it('returns an array of preset definitions', () => {
    const presets = listPresets();
    expect(Array.isArray(presets)).toBe(true);
    expect(presets.length).toBeGreaterThan(0);
  });

  it('each preset has required fields', () => {
    const presets = listPresets();
    for (const p of presets) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.description).toBe('string');
      expect(Array.isArray(p.sdcList)).toBe(true);
      expect(typeof p.dependencies).toBe('object');
    }
  });

  it('includes standard, blog, healthcare, intranet, ecommerce presets', () => {
    const presets = listPresets();
    const ids = presets.map((p) => p.id);
    expect(ids).toContain('standard');
    expect(ids).toContain('blog');
    expect(ids).toContain('healthcare');
    expect(ids).toContain('intranet');
    expect(ids).toContain('ecommerce');
  });

  it('returns a fresh copy (no mutation of internal state)', () => {
    const p1 = listPresets();
    const p2 = listPresets();
    expect(p1).not.toBe(p2);
  });
});

describe('getTemplate()', () => {
  it('returns a template definition for a known id', () => {
    const t = getTemplate('react-vite');
    expect(t).toBeDefined();
    expect(t?.id).toBe('react-vite');
  });

  it('returns undefined for an unknown id', () => {
    const t = getTemplate('unknown-framework');
    expect(t).toBeUndefined();
  });

  it('does not expose color functions', () => {
    const t = getTemplate('angular');
    expect(t).toBeDefined();
    expect(t).not.toHaveProperty('color');
  });

  it('returns correct template data for stencil', () => {
    const t = getTemplate('stencil');
    expect(t).toBeDefined();
    expect(t?.name).toContain('Stencil');
    expect(t?.features).toContain('web-components');
  });
});

describe('validate()', () => {
  it('returns valid for correct minimal options', () => {
    const result = validate({ name: 'my-app', directory: './output', framework: 'react-vite' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('returns errors when name is missing', () => {
    const result = validate({ directory: './output', framework: 'react-vite' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });

  it('returns errors when directory is missing', () => {
    const result = validate({ name: 'my-app', framework: 'react-vite' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('directory');
  });

  it('returns errors when framework is missing', () => {
    const result = validate({ name: 'my-app', directory: './output' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('framework');
  });

  it('returns error for invalid project name (uppercase)', () => {
    const result = validate({ name: 'MyApp', directory: './output', framework: 'react-vite' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('name');
  });

  it('returns error for unknown framework', () => {
    const result = validate({
      name: 'my-app',
      directory: './output',
      framework: 'not-a-framework' as Parameters<typeof validate>[0]['framework'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('framework');
  });

  it('returns error for path traversal in directory', () => {
    const result = validate({
      name: 'my-app',
      directory: '../../../etc/passwd',
      framework: 'react-vite',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('directory');
  });

  it('returns error for invalid component bundles', () => {
    const result = validate({
      name: 'my-app',
      directory: './output',
      framework: 'react-vite',
      componentBundles: ['invalid-bundle' as Parameters<typeof validate>[0]['componentBundles'][0]],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveProperty('componentBundles');
  });

  it('returns valid for all known component bundles', () => {
    const result = validate({
      name: 'my-app',
      directory: './output',
      framework: 'react-vite',
      componentBundles: ['core', 'forms', 'navigation'],
    });
    expect(result.valid).toBe(true);
  });

  it('returns a ValidationResult with valid and errors fields', () => {
    const result: ValidationResult = validate({
      name: 'my-app',
      directory: './output',
      framework: 'vue-vite',
    });
    expect(typeof result.valid).toBe('boolean');
    expect(typeof result.errors).toBe('object');
  });
});

describe('TypeScript type exports', () => {
  it('ScaffoldOptions type is usable', () => {
    const opts: ScaffoldOptions = {
      name: 'my-app',
      directory: './output',
      framework: 'svelte-kit',
      typescript: true,
      eslint: true,
      dryRun: true,
    };
    expect(opts.name).toBe('my-app');
  });

  it('TemplateDefinition type is usable', () => {
    const t: TemplateDefinition = {
      id: 'astro',
      name: 'Astro',
      description: 'test',
      hint: 'hint',
      dependencies: {},
      devDependencies: {},
      features: ['islands'],
    };
    expect(t.id).toBe('astro');
  });

  it('PresetDefinition type is usable', () => {
    const presets = listPresets();
    const p: PresetDefinition = presets[0];
    expect(p.id).toBeDefined();
  });
});

describe('no side effects', () => {
  it('listTemplates() does not mutate the original template data', () => {
    const templates = listTemplates();
    const first = templates[0];
    const originalName = first.name;
    // Mutate the returned object
    (first as Record<string, unknown>)['name'] = 'MUTATED';
    // Calling again should return original data
    const fresh = listTemplates();
    expect(fresh[0].name).toBe(originalName);
  });

  it('listPresets() does not mutate the original preset data', () => {
    const presets = listPresets();
    const first = presets[0];
    const originalName = first.name;
    (first as Record<string, unknown>)['name'] = 'MUTATED';
    const fresh = listPresets();
    expect(fresh[0].name).toBe(originalName);
  });
});
