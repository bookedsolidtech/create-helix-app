import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runListCommand } from '../../../src/cli.js';
import { TEMPLATES } from '../../../src/templates.js';
import { PRESETS } from '../../../src/presets/loader.js';

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

  it('outputs all 14 framework names in table format', () => {
    runListCommand(false);

    const output = logs.join('\n');
    expect(TEMPLATES).toHaveLength(14);

    for (const t of TEMPLATES) {
      expect(output).toContain(t.id);
    }
  });

  it('outputs all 4 drupal preset ids in table format', () => {
    runListCommand(false);

    const output = logs.join('\n');
    for (const pr of PRESETS) {
      expect(output).toContain(pr.id);
    }
  });

  it('outputs valid JSON with templates and presets arrays when --json flag is used', () => {
    runListCommand(true);

    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]) as {
      templates: { id: string; name: string; hint: string }[];
      presets: { id: string; name: string; description: string }[];
    };

    expect(Array.isArray(parsed.templates)).toBe(true);
    expect(Array.isArray(parsed.presets)).toBe(true);
    expect(parsed.templates).toHaveLength(14);
    expect(parsed.presets).toHaveLength(5);
  });

  it('JSON output contains correct template ids', () => {
    runListCommand(true);

    const parsed = JSON.parse(logs[0]) as {
      templates: { id: string; name: string; hint: string }[];
      presets: { id: string; name: string; description: string }[];
    };

    const templateIds = parsed.templates.map((t) => t.id);
    for (const t of TEMPLATES) {
      expect(templateIds).toContain(t.id);
    }
  });

  it('JSON output contains correct preset ids', () => {
    runListCommand(true);

    const parsed = JSON.parse(logs[0]) as {
      templates: { id: string; name: string; hint: string }[];
      presets: { id: string; name: string; description: string }[];
    };

    const presetIds = parsed.presets.map((pr) => pr.id);
    expect(presetIds).toEqual(['standard', 'blog', 'healthcare', 'intranet', 'ecommerce']);
  });
});
