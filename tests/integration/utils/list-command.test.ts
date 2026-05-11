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

  it('outputs all 16 framework names in table format when --show-experimental is passed', () => {
    // v0.6.0 Phase C — default list filters to 3 production templates;
    // every-template assertions now ride the showExperimental escape valve
    // so this integration suite stays meaningful without re-listing each
    // experimental id by hand.
    runListCommand(false, null, true);

    const output = logs.join('\n');
    expect(TEMPLATES).toHaveLength(16);

    for (const t of TEMPLATES) {
      expect(output).toContain(t.id);
    }
  });

  it('default (no --show-experimental) outputs only the 3 production templates + footer hint', () => {
    runListCommand(false);

    const output = logs.join('\n');
    // Production triad — order tracked by the templates.ts registry.
    expect(output).toContain('react-next');
    expect(output).toContain('react-vite');
    expect(output).toContain('wc-storybook');
    // Footer (DXA Q3 triple-discoverability point #1) — count + flag name.
    expect(output).toMatch(/13 experimental templates hidden/);
    expect(output).toContain('--show-experimental');
  });

  it('outputs all 4 drupal preset ids in table format', () => {
    runListCommand(false);

    const output = logs.join('\n');
    for (const pr of PRESETS) {
      expect(output).toContain(pr.id);
    }
  });

  it('outputs valid JSON with templates and presets arrays when --json flag is used (default = production only)', () => {
    runListCommand(true);

    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]) as {
      templates: { id: string; name: string; hint: string }[];
      presets: { id: string; name: string; description: string }[];
      experimentalHidden?: number;
    };

    expect(Array.isArray(parsed.templates)).toBe(true);
    expect(Array.isArray(parsed.presets)).toBe(true);
    // 3 production templates by default; experimentalHidden reports the count.
    expect(parsed.templates).toHaveLength(3);
    expect(parsed.experimentalHidden).toBe(13);
    expect(parsed.presets).toHaveLength(5);
  });

  it('JSON output with --show-experimental contains every template id (all 16)', () => {
    runListCommand(true, null, true);

    const parsed = JSON.parse(logs[0]) as {
      templates: { id: string; name: string; hint: string }[];
      presets: { id: string; name: string; description: string }[];
    };

    const templateIds = parsed.templates.map((t) => t.id);
    expect(templateIds).toHaveLength(16);
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
