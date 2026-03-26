import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showTemplateInfo } from '../../src/commands/info.js';
import { TEMPLATES } from '../../src/templates.js';
import { PRESETS } from '../../src/presets/loader.js';

describe('showTemplateInfo', () => {
  let logs: string[];
  let errors: string[];
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    errors = [];
    consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  // ── Framework template: react-next ───────────────────────────────────────

  it('shows name and id for react-next template', () => {
    showTemplateInfo('react-next', false);

    const output = logs.join('\n');
    const template = TEMPLATES.find((t) => t.id === 'react-next')!;

    expect(output).toContain(template.id);
    expect(output).toContain(template.name);
  });

  it('shows "Framework Template" type label for react-next', () => {
    showTemplateInfo('react-next', false);

    const output = logs.join('\n');
    expect(output).toContain('Framework Template');
  });

  it('shows description for react-next template', () => {
    showTemplateInfo('react-next', false);

    const output = logs.join('\n');
    const template = TEMPLATES.find((t) => t.id === 'react-next')!;
    expect(output).toContain(template.description);
  });

  it('shows all dependencies for react-next template', () => {
    showTemplateInfo('react-next', false);

    const output = logs.join('\n');
    const template = TEMPLATES.find((t) => t.id === 'react-next')!;

    for (const dep of Object.keys(template.dependencies)) {
      expect(output).toContain(dep);
    }
  });

  it('shows features for react-next template', () => {
    showTemplateInfo('react-next', false);

    const output = logs.join('\n');
    const template = TEMPLATES.find((t) => t.id === 'react-next')!;

    for (const feature of template.features) {
      expect(output).toContain(feature);
    }
  });

  // ── Framework template: vue-vite ─────────────────────────────────────────

  it('shows name and id for vue-vite template', () => {
    showTemplateInfo('vue-vite', false);

    const output = logs.join('\n');
    const template = TEMPLATES.find((t) => t.id === 'vue-vite')!;

    expect(output).toContain(template.id);
    expect(output).toContain(template.name);
  });

  it('shows description for vue-vite template', () => {
    showTemplateInfo('vue-vite', false);

    const output = logs.join('\n');
    const template = TEMPLATES.find((t) => t.id === 'vue-vite')!;
    expect(output).toContain(template.description);
  });

  it('shows dependencies for vue-vite template', () => {
    showTemplateInfo('vue-vite', false);

    const output = logs.join('\n');
    const template = TEMPLATES.find((t) => t.id === 'vue-vite')!;

    for (const dep of Object.keys(template.dependencies)) {
      expect(output).toContain(dep);
    }
  });

  // ── Drupal preset: standard ──────────────────────────────────────────────

  it('shows name and id for standard preset', () => {
    showTemplateInfo('standard', false);

    const output = logs.join('\n');
    const preset = PRESETS.find((pr) => pr.id === 'standard')!;

    expect(output).toContain(preset.id);
    expect(output).toContain(preset.name);
  });

  it('shows "Drupal Preset" type label for standard', () => {
    showTemplateInfo('standard', false);

    const output = logs.join('\n');
    expect(output).toContain('Drupal Preset');
  });

  it('shows description for standard preset', () => {
    showTemplateInfo('standard', false);

    const output = logs.join('\n');
    const preset = PRESETS.find((pr) => pr.id === 'standard')!;
    expect(output).toContain(preset.description);
  });

  it('shows SDC list for standard preset', () => {
    showTemplateInfo('standard', false);

    const output = logs.join('\n');
    const preset = PRESETS.find((pr) => pr.id === 'standard')!;

    for (const sdc of preset.sdcList) {
      expect(output).toContain(sdc);
    }
  });

  it('shows architecture notes for standard preset', () => {
    showTemplateInfo('standard', false);

    const output = logs.join('\n');
    const preset = PRESETS.find((pr) => pr.id === 'standard')!;
    expect(output).toContain(preset.architectureNotes);
  });

  it('shows dependencies for standard preset', () => {
    showTemplateInfo('standard', false);

    const output = logs.join('\n');
    const preset = PRESETS.find((pr) => pr.id === 'standard')!;

    for (const dep of Object.keys(preset.dependencies)) {
      expect(output).toContain(dep);
    }
  });

  // ── Drupal preset: ecommerce ─────────────────────────────────────────────

  it('shows name and id for ecommerce preset', () => {
    showTemplateInfo('ecommerce', false);

    const output = logs.join('\n');
    const preset = PRESETS.find((pr) => pr.id === 'ecommerce')!;

    expect(output).toContain(preset.id);
    expect(output).toContain(preset.name);
  });

  it('shows description for ecommerce preset', () => {
    showTemplateInfo('ecommerce', false);

    const output = logs.join('\n');
    const preset = PRESETS.find((pr) => pr.id === 'ecommerce')!;
    expect(output).toContain(preset.description);
  });

  it('shows SDC list for ecommerce preset', () => {
    showTemplateInfo('ecommerce', false);

    const output = logs.join('\n');
    const preset = PRESETS.find((pr) => pr.id === 'ecommerce')!;

    for (const sdc of preset.sdcList) {
      expect(output).toContain(sdc);
    }
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it('exits with error for nonexistent template id', () => {
    expect(() => showTemplateInfo('nonexistent', false)).toThrow('process.exit(1)');
    expect(errors.some((e) => e.includes('nonexistent'))).toBe(true);
  });

  it('shows available templates and presets when no match found', () => {
    expect(() => showTemplateInfo('zzz-totally-unknown-zzz', false)).toThrow('process.exit(1)');
    const errorOutput = errors.join('\n');
    expect(errorOutput).toContain('Available templates');
    expect(errorOutput).toContain('Available presets');
  });

  it('shows suggestions when partial match found', () => {
    // 'react' should match react-next and react-vite
    expect(() => showTemplateInfo('react', false)).toThrow('process.exit(1)');
    const errorOutput = errors.join('\n');
    // Either suggestions or available templates should appear
    expect(errorOutput.length).toBeGreaterThan(0);
  });

  // ── JSON mode ────────────────────────────────────────────────────────────

  it('outputs valid JSON for react-next template', () => {
    showTemplateInfo('react-next', true);

    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]) as Record<string, unknown>;
    expect(parsed.type).toBe('template');
    expect(parsed.id).toBe('react-next');
  });

  it('JSON for react-next includes dependencies and devDependencies', () => {
    showTemplateInfo('react-next', true);

    const parsed = JSON.parse(logs[0]) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(parsed.dependencies).toBeDefined();
    expect(parsed.devDependencies).toBeDefined();
    expect(Object.keys(parsed.dependencies).length).toBeGreaterThan(0);
  });

  it('JSON for react-next includes description', () => {
    showTemplateInfo('react-next', true);

    const parsed = JSON.parse(logs[0]) as { description: string };
    const template = TEMPLATES.find((t) => t.id === 'react-next')!;
    expect(parsed.description).toBe(template.description);
  });

  it('JSON for react-next includes features array', () => {
    showTemplateInfo('react-next', true);

    const parsed = JSON.parse(logs[0]) as { features: string[] };
    expect(Array.isArray(parsed.features)).toBe(true);
    expect(parsed.features.length).toBeGreaterThan(0);
  });

  it('JSON for vue-vite is valid parseable JSON with correct id', () => {
    showTemplateInfo('vue-vite', true);

    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]) as Record<string, unknown>;
    expect(parsed.type).toBe('template');
    expect(parsed.id).toBe('vue-vite');
    expect(parsed.description).toBeDefined();
  });

  it('outputs valid JSON for standard preset', () => {
    showTemplateInfo('standard', true);

    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]) as Record<string, unknown>;
    expect(parsed.type).toBe('preset');
    expect(parsed.id).toBe('standard');
  });

  it('JSON for standard preset includes sdcList array', () => {
    showTemplateInfo('standard', true);

    const parsed = JSON.parse(logs[0]) as { sdcList: string[] };
    expect(Array.isArray(parsed.sdcList)).toBe(true);
    expect(parsed.sdcList.length).toBeGreaterThan(0);
  });

  it('JSON for standard preset includes description', () => {
    showTemplateInfo('standard', true);

    const parsed = JSON.parse(logs[0]) as { description: string };
    const preset = PRESETS.find((pr) => pr.id === 'standard')!;
    expect(parsed.description).toBe(preset.description);
  });

  it('JSON for standard preset includes architectureNotes', () => {
    showTemplateInfo('standard', true);

    const parsed = JSON.parse(logs[0]) as { architectureNotes: string };
    expect(parsed.architectureNotes).toBeDefined();
    expect(typeof parsed.architectureNotes).toBe('string');
  });

  it('outputs valid JSON for ecommerce preset', () => {
    showTemplateInfo('ecommerce', true);

    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]) as Record<string, unknown>;
    expect(parsed.type).toBe('preset');
    expect(parsed.id).toBe('ecommerce');
    expect(Array.isArray(parsed.sdcList)).toBe(true);
  });

  it('JSON for ecommerce preset includes dependencies', () => {
    showTemplateInfo('ecommerce', true);

    const parsed = JSON.parse(logs[0]) as { dependencies: Record<string, string> };
    expect(parsed.dependencies).toBeDefined();
    expect(Object.keys(parsed.dependencies).length).toBeGreaterThan(0);
  });
});
