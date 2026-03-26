import { describe, it, expect } from 'vitest';
import { PRESETS, VALID_PRESETS } from '../../src/presets/loader.js';
import type { DrupalPreset } from '../../src/types.js';

describe('drupal preset configs — shape', () => {
  it.each(PRESETS)('$id preset has a valid id matching DrupalPreset type', (preset) => {
    const validIds: DrupalPreset[] = ['standard', 'blog', 'healthcare', 'intranet'];
    expect(validIds).toContain(preset.id);
  });

  it.each(PRESETS)('$id preset has non-empty name', (preset) => {
    expect(preset.name).toBeTruthy();
    expect(preset.name.length).toBeGreaterThan(0);
  });

  it.each(PRESETS)('$id preset has non-empty description', (preset) => {
    expect(preset.description).toBeTruthy();
    expect(preset.description.length).toBeGreaterThan(0);
  });

  it.each(PRESETS)('$id preset has non-empty architectureNotes', (preset) => {
    expect(preset.architectureNotes).toBeTruthy();
    expect(preset.architectureNotes.length).toBeGreaterThan(0);
  });

  it.each(PRESETS)('$id preset has non-empty sdcList array', (preset) => {
    expect(Array.isArray(preset.sdcList)).toBe(true);
    expect(preset.sdcList.length).toBeGreaterThan(0);
  });

  it.each(PRESETS)('$id preset has dependencies as an object', (preset) => {
    expect(preset.dependencies).toBeDefined();
    expect(typeof preset.dependencies).toBe('object');
    expect(Array.isArray(preset.dependencies)).toBe(false);
  });

  it.each(PRESETS)('$id preset has templateVars as an object', (preset) => {
    expect(preset.templateVars).toBeDefined();
    expect(typeof preset.templateVars).toBe('object');
    expect(Array.isArray(preset.templateVars)).toBe(false);
  });
});

describe('drupal preset configs — completeness', () => {
  it('all DrupalPreset union members have a corresponding preset config', () => {
    const validIds: DrupalPreset[] = ['standard', 'blog', 'healthcare', 'intranet'];
    const configIds = PRESETS.map((p) => p.id);
    for (const id of validIds) {
      expect(configIds).toContain(id);
    }
  });

  it('VALID_PRESETS matches the preset config ids', () => {
    const configIds = PRESETS.map((p) => p.id).sort();
    const sortedValid = [...VALID_PRESETS].sort();
    expect(configIds).toEqual(sortedValid);
  });
});

describe('drupal preset configs — no duplicates', () => {
  it('no duplicate preset IDs exist', () => {
    const ids = PRESETS.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
