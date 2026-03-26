import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInfoCommand } from '../../src/cli.js';
import { TEMPLATES } from '../../src/templates.js';
import { PRESETS } from '../../src/presets/loader.js';

describe('info command', () => {
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

  describe('template info', () => {
    it('shows correct data for react-next template', () => {
      runInfoCommand('react-next', false);

      const output = logs.join('\n');
      const template = TEMPLATES.find((t) => t.id === 'react-next')!;

      expect(output).toContain(template.id);
      expect(output).toContain(template.name);
      expect(output).toContain('Framework Template');
    });

    it('shows dependencies for react-next template', () => {
      runInfoCommand('react-next', false);

      const output = logs.join('\n');
      const template = TEMPLATES.find((t) => t.id === 'react-next')!;

      for (const dep of Object.keys(template.dependencies)) {
        expect(output).toContain(dep);
      }
    });

    it('shows features for react-next template', () => {
      runInfoCommand('react-next', false);

      const output = logs.join('\n');
      const template = TEMPLATES.find((t) => t.id === 'react-next')!;

      for (const feature of template.features) {
        expect(output).toContain(feature);
      }
    });
  });

  describe('preset info', () => {
    it('shows correct data for blog preset', () => {
      runInfoCommand('blog', false);

      const output = logs.join('\n');
      const preset = PRESETS.find((pr) => pr.id === 'blog')!;

      expect(output).toContain(preset.id);
      expect(output).toContain(preset.name);
      expect(output).toContain('Drupal Preset');
    });

    it('shows SDC list for blog preset', () => {
      runInfoCommand('blog', false);

      const output = logs.join('\n');
      const preset = PRESETS.find((pr) => pr.id === 'blog')!;

      for (const sdc of preset.sdcList) {
        expect(output).toContain(sdc);
      }
    });

    it('shows architecture notes for blog preset', () => {
      runInfoCommand('blog', false);

      const output = logs.join('\n');
      const preset = PRESETS.find((pr) => pr.id === 'blog')!;

      expect(output).toContain(preset.architectureNotes);
    });
  });

  describe('error handling', () => {
    it('exits with error for unknown template id', () => {
      expect(() => runInfoCommand('invalid-name', false)).toThrow('process.exit(1)');
      expect(errors.some((e) => e.includes('invalid-name'))).toBe(true);
    });

    it('exits with error when no template id is provided', () => {
      expect(() => runInfoCommand(null, false)).toThrow('process.exit(1)');
    });

    it('shows available templates/presets when no close match found', () => {
      expect(() => runInfoCommand('zzz-unknown-zzz', false)).toThrow('process.exit(1)');
      const errorOutput = errors.join('\n');
      expect(errorOutput).toContain('Available templates');
    });
  });

  describe('JSON output', () => {
    it('outputs valid JSON for react-next template', () => {
      runInfoCommand('react-next', true);

      expect(logs).toHaveLength(1);
      const parsed = JSON.parse(logs[0]) as Record<string, unknown>;
      expect(parsed.type).toBe('template');
      expect(parsed.id).toBe('react-next');
      expect(parsed.dependencies).toBeDefined();
      expect(parsed.devDependencies).toBeDefined();
      expect(Array.isArray(parsed.features)).toBe(true);
    });

    it('outputs valid JSON for blog preset', () => {
      runInfoCommand('blog', true);

      expect(logs).toHaveLength(1);
      const parsed = JSON.parse(logs[0]) as Record<string, unknown>;
      expect(parsed.type).toBe('preset');
      expect(parsed.id).toBe('blog');
      expect(Array.isArray(parsed.sdcList)).toBe(true);
      expect(parsed.architectureNotes).toBeDefined();
    });

    it('JSON output for react-next includes correct dependency keys', () => {
      runInfoCommand('react-next', true);

      const parsed = JSON.parse(logs[0]) as { dependencies: Record<string, string> };
      const template = TEMPLATES.find((t) => t.id === 'react-next')!;

      for (const dep of Object.keys(template.dependencies)) {
        expect(parsed.dependencies).toHaveProperty(dep);
      }
    });
  });
});
