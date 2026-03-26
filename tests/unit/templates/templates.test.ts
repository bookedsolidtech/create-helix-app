import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../../../src/templates.js';
import type { Framework } from '../../../src/types.js';

const FRAMEWORK_IDS: Framework[] = [
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

describe('TEMPLATES — structure', () => {
  it.each(TEMPLATES)(
    '$id has non-empty name, description, and hint',
    ({ name, description, hint }) => {
      expect(name.length).toBeGreaterThan(0);
      expect(description.length).toBeGreaterThan(0);
      expect(hint.length).toBeGreaterThan(0);
    },
  );

  it.each(TEMPLATES)('$id has a color function that returns a string', ({ color }) => {
    expect(typeof color).toBe('function');
    expect(typeof color('test')).toBe('string');
  });

  it.each(TEMPLATES)(
    '$id has dependencies and devDependencies as objects',
    ({ dependencies, devDependencies }) => {
      expect(typeof dependencies).toBe('object');
      expect(Array.isArray(dependencies)).toBe(false);
      expect(typeof devDependencies).toBe('object');
      expect(Array.isArray(devDependencies)).toBe(false);
    },
  );

  it.each(TEMPLATES)('$id has a non-empty features array', ({ features }) => {
    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBeGreaterThan(0);
  });
});

describe('TEMPLATES — IDs', () => {
  it('all Framework union members have a corresponding template config', () => {
    const templateIds = TEMPLATES.map((t) => t.id);
    for (const frameworkId of FRAMEWORK_IDS) {
      expect(templateIds).toContain(frameworkId);
    }
  });

  it('no duplicate template IDs exist', () => {
    const ids = TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every template ID is a valid Framework type', () => {
    for (const template of TEMPLATES) {
      expect(FRAMEWORK_IDS).toContain(template.id);
    }
  });
});
