import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listAll } from '../commands/list.js';
import { TEMPLATES } from '../templates.js';

// ---------------------------------------------------------------------------
// v0.6.0 Phase C — `create-helix list` splits Production vs Experimental
// templates when --show-experimental is passed; otherwise prints only
// Production and appends a footer pointing at the flag (DXA Q3
// triple-discoverability point #1). Tests run against the REAL TEMPLATES
// registry — the existing list.test.ts mocks a 2-entry list which can't
// exercise the experimental partition.
// ---------------------------------------------------------------------------

describe('listAll — default (showExperimental=false)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderTui = (): string => {
    listAll(false);
    return consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
  };

  it('lists all 3 production templates by default', () => {
    const output = renderTui();
    expect(output).toContain('wc-storybook');
    expect(output).toContain('react-next');
    expect(output).toContain('react-vite');
  });

  it('hides every experimental template by default', () => {
    const output = renderTui();
    const experimentalIds = TEMPLATES.filter((t) => t.experimental).map((t) => t.id);
    for (const id of experimentalIds) {
      // Each experimental template id MUST NOT appear in the default list.
      // The footer line counts them but doesn't enumerate.
      expect(output).not.toContain(`  ${id.padEnd(18)}`);
    }
  });

  it('appends a footer mentioning --show-experimental with the hidden count', () => {
    const output = renderTui();
    expect(output).toMatch(/13 experimental templates hidden/);
    expect(output).toContain('--show-experimental');
  });

  it('does not emit a separate Production / Experimental section heading in default mode', () => {
    const output = renderTui();
    // The split-section headings are only for --show-experimental output;
    // default mode keeps the legacy "Framework Templates" single heading
    // so existing consumer expectations stay stable.
    expect(output).not.toContain('— Experimental');
    expect(output).toContain('Framework Templates');
  });

  it('still emits the Drupal Presets section', () => {
    const output = renderTui();
    expect(output).toContain('Drupal Presets');
  });
});

describe('listAll — --show-experimental', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderTui = (): string => {
    listAll(false, true);
    return consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
  };

  it('splits into Production and Experimental sections with distinct headings', () => {
    const output = renderTui();
    expect(output).toContain('Framework Templates — Production');
    expect(output).toContain('Framework Templates — Experimental');
  });

  it('emits the Production section BEFORE the Experimental section', () => {
    const output = renderTui();
    const productionIdx = output.indexOf('— Production');
    const experimentalIdx = output.indexOf('— Experimental');
    expect(productionIdx).toBeGreaterThanOrEqual(0);
    expect(experimentalIdx).toBeGreaterThan(productionIdx);
  });

  it('lists all 3 production templates in the Production section', () => {
    const output = renderTui();
    expect(output).toContain('wc-storybook');
    expect(output).toContain('react-next');
    expect(output).toContain('react-vite');
  });

  it('lists all 13 experimental templates in the Experimental section', () => {
    const output = renderTui();
    const experimentalIds = TEMPLATES.filter((t) => t.experimental).map((t) => t.id);
    expect(experimentalIds).toHaveLength(13);
    for (const id of experimentalIds) {
      expect(output).toContain(id);
    }
  });

  it('does NOT append the "X experimental templates hidden" footer (gate is open)', () => {
    const output = renderTui();
    expect(output).not.toMatch(/experimental templates hidden/);
  });
});

describe('listAll — JSON mode partitioning', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('JSON default omits experimental templates and reports experimentalHidden count', () => {
    listAll(true, false);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as {
      frameworks: Array<{ id: string; experimental?: boolean }>;
      experimentalHidden?: number;
    };
    expect(parsed.frameworks).toHaveLength(3);
    expect(parsed.experimentalHidden).toBe(13);
    // None of the visible entries should be marked experimental.
    expect(parsed.frameworks.every((f) => f.experimental !== true)).toBe(true);
  });

  it('JSON with --show-experimental includes all 16 templates and tags the 13 experimental ones', () => {
    listAll(true, true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as {
      frameworks: Array<{ id: string; experimental?: boolean }>;
      experimentalHidden?: number;
    };
    expect(parsed.frameworks).toHaveLength(16);
    expect(parsed.experimentalHidden).toBeUndefined();
    const taggedCount = parsed.frameworks.filter((f) => f.experimental === true).length;
    expect(taggedCount).toBe(13);
  });
});
