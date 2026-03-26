import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadCustomTemplates } from '../../src/custom-templates.js';
import { mergeWithCustomTemplates } from '../../src/templates.js';
import { TEMPLATES } from '../../src/templates.js';
import type { CustomTemplateConfig } from '../../src/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'helix-custom-templates-'));
}

function writeTemplateJson(dir: string, filename: string, content: unknown): void {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(content, null, 2), 'utf-8');
}

const validTemplateFixture = {
  id: 'my-custom',
  name: 'My Custom Framework',
  description: 'A custom enterprise template',
  hint: 'custom enterprise setup',
  dependencies: { 'my-lib': '^1.0.0' },
  devDependencies: { typescript: '^5.0.0' },
  features: ['custom-feature', 'enterprise'],
};

const reactNextOverrideFixture = {
  id: 'react-next',
  name: 'React + Next.js 15 (Enterprise)',
  description: 'Enterprise-hardened Next.js template',
  hint: 'enterprise next.js',
  dependencies: {
    next: '^15.3.0',
    react: '^19.1.0',
    'react-dom': '^19.1.0',
    '@helixui/library': '^2.0.0',
  },
  devDependencies: { typescript: '^5.7.0' },
  features: ['ssr', 'enterprise-auth', 'monitoring'],
};

// ─── loadCustomTemplates ──────────────────────────────────────────────────────

describe('loadCustomTemplates', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Custom template discovery ──────────────────────────────────────────────

  describe('custom template discovery', () => {
    it('returns an empty array for an empty directory', () => {
      const result = loadCustomTemplates(tmpDir);
      expect(result).toEqual([]);
    });

    it('loads a single valid custom template from a JSON file', () => {
      writeTemplateJson(tmpDir, 'my-custom.json', validTemplateFixture);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('my-custom');
      expect(result[0]!.name).toBe('My Custom Framework');
      expect(result[0]!.description).toBe('A custom enterprise template');
      expect(result[0]!.hint).toBe('custom enterprise setup');
      expect(result[0]!.isCustom).toBe(true);
    });

    it('loads multiple valid custom templates from multiple JSON files', () => {
      writeTemplateJson(tmpDir, 'template-a.json', {
        ...validTemplateFixture,
        id: 'template-a',
        name: 'Template A',
      });
      writeTemplateJson(tmpDir, 'template-b.json', {
        ...validTemplateFixture,
        id: 'template-b',
        name: 'Template B',
      });

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(2);
      const ids = result.map((t) => t.id);
      expect(ids).toContain('template-a');
      expect(ids).toContain('template-b');
    });

    it('ignores non-.json files in the directory', () => {
      fs.writeFileSync(path.join(tmpDir, 'template.ts'), 'export const x = 1;', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Templates', 'utf-8');
      writeTemplateJson(tmpDir, 'valid.json', validTemplateFixture);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('my-custom');
    });

    it('sets isCustom: true on all loaded templates', () => {
      writeTemplateJson(tmpDir, 'a.json', { ...validTemplateFixture, id: 'a' });
      writeTemplateJson(tmpDir, 'b.json', { ...validTemplateFixture, id: 'b' });

      const result = loadCustomTemplates(tmpDir);

      for (const t of result) {
        expect(t.isCustom).toBe(true);
      }
    });

    it('correctly maps dependencies and devDependencies from JSON', () => {
      const fixture = {
        ...validTemplateFixture,
        dependencies: { 'custom-lib': '^2.0.0', 'another-dep': '^1.5.0' },
        devDependencies: { typescript: '^5.7.0', vitest: '^3.0.0' },
      };
      writeTemplateJson(tmpDir, 'custom.json', fixture);

      const result = loadCustomTemplates(tmpDir);

      expect(result[0]!.dependencies).toEqual({
        'custom-lib': '^2.0.0',
        'another-dep': '^1.5.0',
      });
      expect(result[0]!.devDependencies).toEqual({
        typescript: '^5.7.0',
        vitest: '^3.0.0',
      });
    });

    it('provides a color function that returns a string', () => {
      writeTemplateJson(tmpDir, 'custom.json', validTemplateFixture);

      const result = loadCustomTemplates(tmpDir);

      expect(typeof result[0]!.color).toBe('function');
      expect(typeof result[0]!.color('test')).toBe('string');
    });
  });

  // ─── Invalid directory handling ─────────────────────────────────────────────

  describe('invalid custom template error handling', () => {
    it('returns empty array and warns when directory does not exist', () => {
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      const result = loadCustomTemplates(nonExistent);
      expect(result).toEqual([]);
    });

    it('skips files with invalid JSON', () => {
      fs.writeFileSync(path.join(tmpDir, 'invalid.json'), '{ not valid json', 'utf-8');
      writeTemplateJson(tmpDir, 'valid.json', validTemplateFixture);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('my-custom');
    });

    it('skips templates missing required "id" field', () => {
      const { id: _id, ...noId } = validTemplateFixture;
      writeTemplateJson(tmpDir, 'missing-id.json', noId);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(0);
    });

    it('skips templates where id is empty string', () => {
      writeTemplateJson(tmpDir, 'empty-id.json', { ...validTemplateFixture, id: '' });

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(0);
    });

    it('skips templates missing required "name" field', () => {
      const { name: _name, ...noName } = validTemplateFixture;
      writeTemplateJson(tmpDir, 'missing-name.json', noName);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(0);
    });

    it('skips templates missing required "description" field', () => {
      const { description: _desc, ...noDesc } = validTemplateFixture;
      writeTemplateJson(tmpDir, 'missing-desc.json', noDesc);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(0);
    });

    it('skips templates missing required "hint" field', () => {
      const { hint: _hint, ...noHint } = validTemplateFixture;
      writeTemplateJson(tmpDir, 'missing-hint.json', noHint);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(0);
    });

    it('skips templates missing required "dependencies" field', () => {
      const { dependencies: _deps, ...noDeps } = validTemplateFixture;
      writeTemplateJson(tmpDir, 'missing-deps.json', noDeps);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(0);
    });

    it('skips templates where "dependencies" is an array instead of object', () => {
      writeTemplateJson(tmpDir, 'array-deps.json', {
        ...validTemplateFixture,
        dependencies: ['dep-a'],
      });

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(0);
    });

    it('skips templates missing required "devDependencies" field', () => {
      const { devDependencies: _devDeps, ...noDevDeps } = validTemplateFixture;
      writeTemplateJson(tmpDir, 'missing-devdeps.json', noDevDeps);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(0);
    });

    it('skips templates missing required "features" field', () => {
      const { features: _features, ...noFeatures } = validTemplateFixture;
      writeTemplateJson(tmpDir, 'missing-features.json', noFeatures);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(0);
    });

    it('skips templates where "features" is an empty array', () => {
      writeTemplateJson(tmpDir, 'empty-features.json', {
        ...validTemplateFixture,
        features: [],
      });

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(0);
    });

    it('skips templates where the root value is not an object', () => {
      fs.writeFileSync(path.join(tmpDir, 'array-root.json'), '["not", "an", "object"]', 'utf-8');
      writeTemplateJson(tmpDir, 'valid.json', validTemplateFixture);

      const result = loadCustomTemplates(tmpDir);

      // Only the valid one should load
      expect(result).toHaveLength(1);
    });

    it('skips invalid templates but still loads valid ones in the same directory', () => {
      writeTemplateJson(tmpDir, 'invalid.json', { id: 'bad' }); // missing fields
      writeTemplateJson(tmpDir, 'valid.json', validTemplateFixture);

      const result = loadCustomTemplates(tmpDir);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('my-custom');
    });
  });
});

// ─── mergeWithCustomTemplates ─────────────────────────────────────────────────

describe('mergeWithCustomTemplates', () => {
  function makeCustom(partial: Partial<CustomTemplateConfig> & { id: string }): CustomTemplateConfig {
    return {
      name: 'Test Template',
      description: 'A test template',
      hint: 'test hint',
      color: (s: string) => s,
      dependencies: {},
      devDependencies: {},
      features: ['test'],
      isCustom: true,
      ...partial,
    };
  }

  // ─── Custom template discovery / ordering ───────────────────────────────────

  it('returns all built-in templates when no custom templates are provided', () => {
    const result = mergeWithCustomTemplates([]);
    expect(result).toHaveLength(TEMPLATES.length);
  });

  it('appends new custom templates after built-ins', () => {
    const custom = makeCustom({ id: 'totally-new-framework' });
    const result = mergeWithCustomTemplates([custom]);

    expect(result).toHaveLength(TEMPLATES.length + 1);
    expect(result[result.length - 1]).toStrictEqual(custom);
  });

  it('appends multiple new custom templates in order', () => {
    const customA = makeCustom({ id: 'custom-a' });
    const customB = makeCustom({ id: 'custom-b' });
    const result = mergeWithCustomTemplates([customA, customB]);

    expect(result).toHaveLength(TEMPLATES.length + 2);
    expect(result[result.length - 2]).toStrictEqual(customA);
    expect(result[result.length - 1]).toStrictEqual(customB);
  });

  // ─── Override behavior ──────────────────────────────────────────────────────

  it('replaces a built-in template when custom has the same ID', () => {
    const custom = makeCustom({
      id: 'react-next',
      name: 'React + Next.js (Enterprise)',
      description: 'Enterprise override',
    });
    const result = mergeWithCustomTemplates([custom]);

    // Same total count — no new template was added
    expect(result).toHaveLength(TEMPLATES.length);

    const found = result.find((t) => t.id === 'react-next');
    expect(found).toBeDefined();
    expect(found!.name).toBe('React + Next.js (Enterprise)');
    expect('isCustom' in found! && found!.isCustom).toBe(true);
  });

  it('preserves the position of the overridden built-in template', () => {
    const builtInIndex = TEMPLATES.findIndex((t) => t.id === 'react-vite');
    const custom = makeCustom({ id: 'react-vite', name: 'Custom Vite' });

    const result = mergeWithCustomTemplates([custom]);

    expect(result[builtInIndex]!.id).toBe('react-vite');
    expect(result[builtInIndex]!.name).toBe('Custom Vite');
  });

  it('can override multiple built-in templates simultaneously', () => {
    const customNext = makeCustom({ id: 'react-next', name: 'Enterprise Next' });
    const customVue = makeCustom({ id: 'vue-nuxt', name: 'Enterprise Vue' });

    const result = mergeWithCustomTemplates([customNext, customVue]);

    expect(result).toHaveLength(TEMPLATES.length);
    expect(result.find((t) => t.id === 'react-next')!.name).toBe('Enterprise Next');
    expect(result.find((t) => t.id === 'vue-nuxt')!.name).toBe('Enterprise Vue');
  });

  it('can both override a built-in and add a new template at the same time', () => {
    const override = makeCustom({ id: 'react-next', name: 'Enterprise Next' });
    const newTemplate = makeCustom({ id: 'my-brand-new-template' });

    const result = mergeWithCustomTemplates([override, newTemplate]);

    // One override replaces, one appends
    expect(result).toHaveLength(TEMPLATES.length + 1);
    expect(result.find((t) => t.id === 'react-next')!.name).toBe('Enterprise Next');
    expect(result.find((t) => t.id === 'my-brand-new-template')).toBeDefined();
  });

  // ─── TUI display with mixed templates ───────────────────────────────────────

  it('custom templates have isCustom: true for badge display', () => {
    const custom = makeCustom({ id: 'my-enterprise-template' });
    const result = mergeWithCustomTemplates([custom]);

    const found = result.find((t) => t.id === 'my-enterprise-template');
    expect(found).toBeDefined();
    expect('isCustom' in found! && found!.isCustom).toBe(true);
  });

  it('built-in templates do NOT have isCustom property after merge', () => {
    const custom = makeCustom({ id: 'new-custom' });
    const result = mergeWithCustomTemplates([custom]);

    for (const t of result) {
      if (t.id !== 'new-custom') {
        expect('isCustom' in t).toBe(false);
      }
    }
  });

  it('the override template carries isCustom: true when replacing a built-in', () => {
    const custom = makeCustom({ id: 'react-next' });
    const result = mergeWithCustomTemplates([custom]);
    const found = result.find((t) => t.id === 'react-next');

    expect('isCustom' in found! && found!.isCustom).toBe(true);
  });
});

// ─── HELIX_TEMPLATE_DIR env var ──────────────────────────────────────────────

describe('HELIX_TEMPLATE_DIR env var', () => {
  afterEach(() => {
    delete process.env['HELIX_TEMPLATE_DIR'];
  });

  it('readEnvVars captures HELIX_TEMPLATE_DIR', async () => {
    process.env['HELIX_TEMPLATE_DIR'] = '/custom/templates';
    const { readEnvVars } = await import('../../src/config.js');
    const result = readEnvVars();
    expect(result.templateDir).toBe('/custom/templates');
  });

  it('readEnvVars returns no templateDir when env var is absent', async () => {
    delete process.env['HELIX_TEMPLATE_DIR'];
    const { readEnvVars } = await import('../../src/config.js');
    const result = readEnvVars();
    expect(result.templateDir).toBeUndefined();
  });
});
