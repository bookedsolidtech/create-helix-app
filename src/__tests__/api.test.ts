import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import {
  scaffold,
  listTemplates,
  listPresets,
  getTemplate,
  validate,
  validatePreset,
} from '../api.js';
import type {
  ScaffoldOptions,
  ScaffoldResult,
  TemplateDefinition,
  PresetDefinition,
  ValidationResult,
} from '../api.js';

const TEST_DIR = '/tmp/helix-test-api';

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(TEST_DIR);
});

afterAll(async () => {
  await fs.remove(TEST_DIR);
});

// ─── listTemplates ────────────────────────────────────────────────────────────

describe('listTemplates', () => {
  it('returns an array of TemplateDefinition objects', () => {
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

  it('does not expose the color function (CLI-only property)', () => {
    const templates = listTemplates();
    for (const t of templates) {
      expect((t as Record<string, unknown>)['color']).toBeUndefined();
    }
  });

  it('returns a new array on each call (no shared reference)', () => {
    const first = listTemplates();
    const second = listTemplates();
    expect(first).not.toBe(second);
  });

  it('includes react-next and react-vite templates', () => {
    const ids = listTemplates().map((t) => t.id);
    expect(ids).toContain('react-next');
    expect(ids).toContain('react-vite');
  });
});

// ─── listPresets ──────────────────────────────────────────────────────────────

describe('listPresets', () => {
  it('returns an array of PresetDefinition objects', () => {
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
      expect(typeof p.templateVars).toBe('object');
    }
  });

  it('includes standard and healthcare presets', () => {
    const ids = listPresets().map((p) => p.id);
    expect(ids).toContain('standard');
    expect(ids).toContain('healthcare');
  });

  it('returns a deep copy — mutations do not affect the source', () => {
    const presets = listPresets();
    const first = presets[0];
    first.sdcList.push('mutated-entry');
    // Re-fetch should not contain the mutation
    const fresh = listPresets();
    expect(fresh[0].sdcList).not.toContain('mutated-entry');
  });
});

// ─── getTemplate ──────────────────────────────────────────────────────────────

describe('getTemplate', () => {
  it('returns a TemplateDefinition for a valid id', () => {
    const t = getTemplate('react-next');
    expect(t).toBeDefined();
    expect(t!.id).toBe('react-next');
    expect(t!.name).toBe('React + Next.js 15');
  });

  it('returns undefined for an unknown id', () => {
    expect(getTemplate('not-a-framework')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getTemplate('')).toBeUndefined();
  });

  it('does not expose the color function', () => {
    const t = getTemplate('vue-vite');
    expect(t).toBeDefined();
    expect((t as Record<string, unknown>)['color']).toBeUndefined();
  });
});

// ─── validate ─────────────────────────────────────────────────────────────────

describe('validate', () => {
  it('returns valid: true for a complete valid options object', () => {
    const result = validate({
      name: 'my-app',
      directory: './my-app',
      framework: 'react-vite',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('returns valid: false when name is missing', () => {
    const result = validate({ directory: './app', framework: 'react-vite' });
    expect(result.valid).toBe(false);
    expect(result.errors['name']).toBeTruthy();
  });

  it('returns valid: false when directory is missing', () => {
    const result = validate({ name: 'my-app', framework: 'react-vite' });
    expect(result.valid).toBe(false);
    expect(result.errors['directory']).toBeTruthy();
  });

  it('returns valid: false when framework is missing', () => {
    const result = validate({ name: 'my-app', directory: './app' });
    expect(result.valid).toBe(false);
    expect(result.errors['framework']).toBeTruthy();
  });

  it('returns error for invalid framework', () => {
    const result = validate({
      name: 'my-app',
      directory: './app',
      framework: 'not-a-framework' as ScaffoldOptions['framework'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors['framework']).toMatch(/unknown framework/i);
  });

  it('returns error for invalid project name', () => {
    const result = validate({
      name: 'My App With Spaces',
      directory: './app',
      framework: 'react-vite',
    });
    expect(result.valid).toBe(false);
    expect(result.errors['name']).toBeTruthy();
  });

  it('returns error for invalid component bundles', () => {
    const result = validate({
      name: 'my-app',
      directory: './app',
      framework: 'react-vite',
      componentBundles: ['not-a-bundle' as ScaffoldOptions['componentBundles'][0]],
    });
    expect(result.valid).toBe(false);
    expect(result.errors['componentBundles']).toBeTruthy();
  });

  it('does not perform filesystem operations', async () => {
    const nonExistentDir = path.join(TEST_DIR, 'non-existent-dir');
    const result = validate({
      name: 'my-app',
      directory: nonExistentDir,
      framework: 'react-vite',
    });
    // validate() should succeed even if the directory doesn't exist
    expect(result.valid).toBe(true);
    // directory should not have been created
    expect(await fs.pathExists(nonExistentDir)).toBe(false);
  });
});

// ─── validatePreset ───────────────────────────────────────────────────────────

describe('validatePreset', () => {
  it('returns true for valid preset IDs', () => {
    expect(validatePreset('standard')).toBe(true);
    expect(validatePreset('healthcare')).toBe(true);
    expect(validatePreset('blog')).toBe(true);
  });

  it('returns false for invalid preset IDs', () => {
    expect(validatePreset('nonexistent')).toBe(false);
    expect(validatePreset('')).toBe(false);
  });
});

// ─── scaffold (dry run) ───────────────────────────────────────────────────────

describe('scaffold — dry run', () => {
  it('returns a successful result with dryRun: true', async () => {
    const opts: ScaffoldOptions = {
      name: 'dry-run-app',
      directory: path.join(TEST_DIR, 'dry-run-app'),
      framework: 'react-vite',
      dryRun: true,
    };
    const result = await scaffold(opts);
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.projectName).toBe('dry-run-app');
    expect(result.framework).toBe('react-vite');
  });

  it('returns a files array in dry-run mode', async () => {
    const opts: ScaffoldOptions = {
      name: 'dry-run-files',
      directory: path.join(TEST_DIR, 'dry-run-files'),
      framework: 'react-vite',
      dryRun: true,
    };
    const result = await scaffold(opts);
    expect(result.files).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.files!.length).toBeGreaterThan(0);
    for (const f of result.files!) {
      expect(typeof f.path).toBe('string');
      expect(typeof f.size).toBe('number');
    }
  });

  it('does not write files in dry-run mode', async () => {
    const dir = path.join(TEST_DIR, 'dry-run-no-write');
    const opts: ScaffoldOptions = {
      name: 'dry-run-no-write',
      directory: dir,
      framework: 'react-vite',
      dryRun: true,
    };
    await scaffold(opts);
    // Directory should not have been created
    expect(await fs.pathExists(dir)).toBe(false);
  });
});

// ─── scaffold — validation errors ─────────────────────────────────────────────

describe('scaffold — validation errors', () => {
  it('throws an Error when name is invalid', async () => {
    await expect(
      scaffold({
        name: 'Invalid Name!!',
        directory: path.join(TEST_DIR, 'invalid'),
        framework: 'react-vite',
      }),
    ).rejects.toThrow(/validation failed/i);
  });

  it('throws an Error when framework is unknown', async () => {
    await expect(
      scaffold({
        name: 'valid-name',
        directory: path.join(TEST_DIR, 'unknown-fw'),
        framework: 'unknown-framework' as ScaffoldOptions['framework'],
      }),
    ).rejects.toThrow(/validation failed/i);
  });

  it('throws when directory is non-empty and force is not set', async () => {
    const dir = path.join(TEST_DIR, 'non-empty-dir');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'existing-file.txt'), 'content');

    await expect(
      scaffold({
        name: 'my-app',
        directory: dir,
        framework: 'react-vite',
      }),
    ).rejects.toThrow(/already exists and is not empty/i);
  });
});

// ─── scaffold — real (no-install) ─────────────────────────────────────────────

describe('scaffold — real scaffolding', () => {
  it('creates the project directory and returns success', async () => {
    const dir = path.join(TEST_DIR, 'real-scaffold');
    const result = await scaffold({
      name: 'real-scaffold',
      directory: dir,
      framework: 'react-vite',
      installDeps: false,
    });

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.files).toBeUndefined();
    expect(await fs.pathExists(dir)).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'package.json'))).toBe(true);
  });
});

// ─── TypeScript type exports ──────────────────────────────────────────────────

describe('TypeScript type exports', () => {
  it('ScaffoldOptions, ScaffoldResult, TemplateDefinition, PresetDefinition, ValidationResult are exported as types', () => {
    // This test verifies at the TypeScript level that the types are usable.
    // If any type is missing, TypeScript compilation will fail.
    const _opts: ScaffoldOptions = {
      name: 'test',
      directory: '.',
      framework: 'react-vite',
    };
    const _result: Partial<ScaffoldResult> = { success: true };
    const _tmpl: Partial<TemplateDefinition> = { id: 'react-vite' };
    const _preset: Partial<PresetDefinition> = { id: 'standard' };
    const _vr: ValidationResult = { valid: true, errors: {} };

    // Just reference them so TS doesn't complain about unused vars
    expect(_opts.name).toBe('test');
    expect(_result.success).toBe(true);
    expect(_tmpl.id).toBe('react-vite');
    expect(_preset.id).toBe('standard');
    expect(_vr.valid).toBe(true);
  });
});
