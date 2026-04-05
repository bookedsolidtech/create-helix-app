import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock module dependencies before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../templates.js', () => ({
  TEMPLATES: [
    {
      id: 'react-next',
      name: 'React + Next.js 16',
      description: 'App Router, SSR-ready, full HELiX integration',
    },
    {
      id: 'react-vite',
      name: 'React + Vite',
      description: 'Lightning fast dev, SPA-first',
    },
  ],
}));

vi.mock('../presets/loader.js', () => ({
  PRESETS: [
    {
      id: 'standard',
      name: 'Standard Drupal',
      description: 'Standard Drupal site with HELiX SDC components',
      sdcList: ['node-teaser', 'hero-banner', 'site-header'],
    },
    {
      id: 'blog',
      name: 'Blog Preset',
      description: 'Blog-optimized Drupal setup',
      sdcList: [],
    },
  ],
}));

import { listAll } from '../commands/list.js';

// ---------------------------------------------------------------------------
// listAll — TUI mode
// ---------------------------------------------------------------------------

describe('listAll — TUI mode', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs a "Framework Templates" header', () => {
    listAll(false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('Framework Templates');
  });

  it('outputs a "Drupal Presets" header', () => {
    listAll(false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('Drupal Presets');
  });

  it('lists all template IDs', () => {
    listAll(false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('react-next');
    expect(output).toContain('react-vite');
  });

  it('lists all template names', () => {
    listAll(false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('React + Next.js 16');
    expect(output).toContain('React + Vite');
  });

  it('lists all template descriptions', () => {
    listAll(false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('App Router, SSR-ready');
    expect(output).toContain('Lightning fast dev');
  });

  it('lists all preset IDs', () => {
    listAll(false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('standard');
    expect(output).toContain('blog');
  });

  it('lists all preset names', () => {
    listAll(false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('Standard Drupal');
    expect(output).toContain('Blog Preset');
  });

  it('shows the SDC count for each preset', () => {
    listAll(false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    // standard preset has 3 SDCs
    expect(output).toContain('3 SDCs');
    // blog preset has 0 SDCs
    expect(output).toContain('0 SDCs');
  });

  it('calls console.log at least once', () => {
    listAll(false);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('does not call console.log with JSON', () => {
    listAll(false);
    // In TUI mode, no single call should produce parseable top-level JSON
    const calls = consoleSpy.mock.calls.map((args) => String(args[0]));
    const hasJsonObject = calls.some((line) => {
      try {
        const parsed = JSON.parse(line);
        return typeof parsed === 'object' && parsed !== null;
      } catch {
        return false;
      }
    });
    expect(hasJsonObject).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listAll — JSON mode
// ---------------------------------------------------------------------------

describe('listAll — JSON mode', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs valid JSON when json=true', () => {
    listAll(true);
    expect(consoleSpy).toHaveBeenCalledOnce();
    const jsonStr = consoleSpy.mock.calls[0][0] as string;
    expect(() => JSON.parse(jsonStr)).not.toThrow();
  });

  it('JSON output has a "frameworks" array', () => {
    listAll(true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(Array.isArray(parsed.frameworks)).toBe(true);
  });

  it('JSON output has a "presets" array', () => {
    listAll(true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(Array.isArray(parsed.presets)).toBe(true);
  });

  it('frameworks array contains all template entries', () => {
    listAll(true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as {
      frameworks: Array<{ id: string; name: string; description: string }>;
    };
    expect(parsed.frameworks).toHaveLength(2);
    const ids = parsed.frameworks.map((f) => f.id);
    expect(ids).toContain('react-next');
    expect(ids).toContain('react-vite');
  });

  it('presets array contains all preset entries', () => {
    listAll(true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as {
      presets: Array<{ id: string; name: string; description: string; sdcCount: number }>;
    };
    expect(parsed.presets).toHaveLength(2);
    const ids = parsed.presets.map((p) => p.id);
    expect(ids).toContain('standard');
    expect(ids).toContain('blog');
  });

  it('each framework entry has id, name, and description fields', () => {
    listAll(true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as {
      frameworks: Array<{ id: string; name: string; description: string }>;
    };
    for (const fw of parsed.frameworks) {
      expect(fw.id).toBeDefined();
      expect(fw.name).toBeDefined();
      expect(fw.description).toBeDefined();
    }
  });

  it('each preset entry has id, name, description, and sdcCount fields', () => {
    listAll(true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as {
      presets: Array<{ id: string; name: string; description: string; sdcCount: number }>;
    };
    for (const preset of parsed.presets) {
      expect(preset.id).toBeDefined();
      expect(preset.name).toBeDefined();
      expect(preset.description).toBeDefined();
      expect(typeof preset.sdcCount).toBe('number');
    }
  });

  it('sdcCount reflects the length of sdcList', () => {
    listAll(true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as {
      presets: Array<{ id: string; sdcCount: number }>;
    };
    const standard = parsed.presets.find((p) => p.id === 'standard');
    const blog = parsed.presets.find((p) => p.id === 'blog');
    expect(standard?.sdcCount).toBe(3);
    expect(blog?.sdcCount).toBe(0);
  });

  it('JSON output does not include per-template dependencies (only summary fields)', () => {
    listAll(true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as {
      frameworks: Array<Record<string, unknown>>;
    };
    for (const fw of parsed.frameworks) {
      expect(fw.dependencies).toBeUndefined();
      expect(fw.devDependencies).toBeUndefined();
    }
  });
});
