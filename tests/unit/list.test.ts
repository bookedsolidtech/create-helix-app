import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listAll } from '../../src/commands/list.js';
import { TEMPLATES } from '../../src/templates.js';
import { PRESETS } from '../../src/presets/loader.js';

describe('list command', () => {
  let logs: string[];
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('normal (TUI) mode', () => {
    it('outputs all 15 framework templates', () => {
      listAll(false);
      const output = logs.join('\n');
      expect(TEMPLATES).toHaveLength(15);
      for (const t of TEMPLATES) {
        expect(output).toContain(t.id);
      }
    });

    it('outputs all 5 Drupal presets', () => {
      listAll(false);
      const output = logs.join('\n');
      expect(PRESETS).toHaveLength(5);
      const expectedPresets = ['standard', 'blog', 'healthcare', 'intranet', 'ecommerce'];
      for (const id of expectedPresets) {
        expect(output).toContain(id);
      }
    });

    it('includes framework descriptions', () => {
      listAll(false);
      const output = logs.join('\n');
      for (const t of TEMPLATES) {
        expect(output).toContain(t.description);
      }
    });

    it('includes preset descriptions', () => {
      listAll(false);
      const output = logs.join('\n');
      for (const pr of PRESETS) {
        expect(output).toContain(pr.description);
      }
    });

    it('includes framework names', () => {
      listAll(false);
      const output = logs.join('\n');
      for (const t of TEMPLATES) {
        expect(output).toContain(t.name);
      }
    });

    it('includes preset names', () => {
      listAll(false);
      const output = logs.join('\n');
      for (const pr of PRESETS) {
        expect(output).toContain(pr.name);
      }
    });
  });

  describe('JSON mode', () => {
    it('outputs valid JSON', () => {
      listAll(true);
      expect(logs).toHaveLength(1);
      expect(() => JSON.parse(logs[0])).not.toThrow();
    });

    it('JSON output has frameworks and presets keys', () => {
      listAll(true);
      const parsed = JSON.parse(logs[0]) as Record<string, unknown>;
      expect(Array.isArray(parsed.frameworks)).toBe(true);
      expect(Array.isArray(parsed.presets)).toBe(true);
    });

    it('JSON frameworks array contains all 14 templates', () => {
      listAll(true);
      const parsed = JSON.parse(logs[0]) as {
        frameworks: { id: string; name: string; description: string }[];
      };
      expect(parsed.frameworks).toHaveLength(TEMPLATES.length);
    });

    it('JSON presets array contains all 5 Drupal presets', () => {
      listAll(true);
      const parsed = JSON.parse(logs[0]) as {
        presets: { id: string; name: string; description: string; sdcCount: number }[];
      };
      expect(parsed.presets).toHaveLength(5);
      const ids = parsed.presets.map((p) => p.id);
      expect(ids).toContain('standard');
      expect(ids).toContain('blog');
      expect(ids).toContain('healthcare');
      expect(ids).toContain('intranet');
      expect(ids).toContain('ecommerce');
    });

    it('JSON framework entries have id, name, and description', () => {
      listAll(true);
      const parsed = JSON.parse(logs[0]) as {
        frameworks: { id: string; name: string; description: string }[];
      };
      for (const fw of parsed.frameworks) {
        expect(typeof fw.id).toBe('string');
        expect(typeof fw.name).toBe('string');
        expect(typeof fw.description).toBe('string');
      }
    });

    it('JSON preset entries have id, name, description, and sdcCount', () => {
      listAll(true);
      const parsed = JSON.parse(logs[0]) as {
        presets: { id: string; name: string; description: string; sdcCount: number }[];
      };
      for (const pr of parsed.presets) {
        expect(typeof pr.id).toBe('string');
        expect(typeof pr.name).toBe('string');
        expect(typeof pr.description).toBe('string');
        expect(typeof pr.sdcCount).toBe('number');
        expect(pr.sdcCount).toBeGreaterThan(0);
      }
    });

    it('JSON framework ids match TEMPLATES', () => {
      listAll(true);
      const parsed = JSON.parse(logs[0]) as {
        frameworks: { id: string; name: string; description: string }[];
      };
      const jsonIds = parsed.frameworks.map((f) => f.id);
      const templateIds = TEMPLATES.map((t) => t.id);
      expect(jsonIds).toEqual(templateIds);
    });

    it('JSON descriptions match TEMPLATES', () => {
      listAll(true);
      const parsed = JSON.parse(logs[0]) as {
        frameworks: { id: string; name: string; description: string }[];
      };
      for (const fw of parsed.frameworks) {
        const template = TEMPLATES.find((t) => t.id === fw.id);
        expect(template).toBeDefined();
        expect(fw.description).toBe(template!.description);
      }
    });

    it('JSON sdcCount matches actual sdcList length for each preset', () => {
      listAll(true);
      const parsed = JSON.parse(logs[0]) as {
        presets: { id: string; sdcCount: number }[];
      };
      for (const pr of parsed.presets) {
        const preset = PRESETS.find((p) => p.id === pr.id);
        expect(preset).toBeDefined();
        expect(pr.sdcCount).toBe(preset!.sdcList.length);
      }
    });

    it('outputs only one console.log call (no extra noise)', () => {
      listAll(true);
      expect(logs).toHaveLength(1);
    });
  });
});
