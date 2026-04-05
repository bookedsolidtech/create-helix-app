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
      hint: 'recommended for new projects',
      dependencies: {
        next: '^16.0.0',
        react: '^19.1.0',
      },
      devDependencies: {
        '@types/react': '^19.1.0',
        typescript: '^5.7.0',
      },
      features: ['ssr', 'app-router'],
    },
    {
      id: 'react-vite',
      name: 'React + Vite',
      description: 'Lightning fast dev, SPA-first',
      hint: 'best DX for SPAs',
      dependencies: {
        react: '^19.1.0',
        vite: '^6.4.0',
      },
      devDependencies: {},
      features: [],
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
      dependencies: {
        '@helixui/library': '^1.0.0',
      },
      architectureNotes: 'Uses Layout Builder with HELiX SDC components.',
    },
    {
      id: 'blog',
      name: 'Blog Preset',
      description: 'Blog-optimized Drupal setup',
      sdcList: [],
      dependencies: {},
      architectureNotes: undefined,
    },
  ],
}));

import { showTemplateInfo } from '../commands/info.js';

// ---------------------------------------------------------------------------
// showTemplateInfo — template lookup
// ---------------------------------------------------------------------------

describe('showTemplateInfo — template (TUI mode)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs the template name to stdout', () => {
    showTemplateInfo('react-next', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('React + Next.js 16');
  });

  it('outputs the template ID to stdout', () => {
    showTemplateInfo('react-next', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('react-next');
  });

  it('outputs the template description to stdout', () => {
    showTemplateInfo('react-next', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('App Router, SSR-ready');
  });

  it('outputs dependencies when present', () => {
    showTemplateInfo('react-next', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('next');
    expect(output).toContain('react');
  });

  it('outputs devDependencies when present', () => {
    showTemplateInfo('react-next', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('typescript');
  });

  it('outputs features when present', () => {
    showTemplateInfo('react-next', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('ssr');
    expect(output).toContain('app-router');
  });

  it('does not output a dependencies section when dependencies are empty', () => {
    showTemplateInfo('react-vite', false);
    const allCalls = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    // react-vite has empty devDependencies — no Dev Dependencies header should appear
    expect(allCalls).not.toContain('Dev Dependencies');
  });

  it('does not output a features section when features array is empty', () => {
    showTemplateInfo('react-vite', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).not.toContain('Features');
  });

  it('outputs "Framework Template" as the type label', () => {
    showTemplateInfo('react-next', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('Framework Template');
  });
});

// ---------------------------------------------------------------------------
// showTemplateInfo — template (JSON mode)
// ---------------------------------------------------------------------------

describe('showTemplateInfo — template (JSON mode)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs valid JSON when json=true', () => {
    showTemplateInfo('react-next', true);
    expect(consoleSpy).toHaveBeenCalledOnce();
    const jsonStr = consoleSpy.mock.calls[0][0] as string;
    expect(() => JSON.parse(jsonStr)).not.toThrow();
  });

  it('sets type to "template" in JSON output', () => {
    showTemplateInfo('react-next', true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.type).toBe('template');
  });

  it('includes id, name, and description in JSON output', () => {
    showTemplateInfo('react-next', true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.id).toBe('react-next');
    expect(parsed.name).toBe('React + Next.js 16');
    expect(parsed.description).toBe('App Router, SSR-ready, full HELiX integration');
  });

  it('includes dependencies and devDependencies in JSON output', () => {
    showTemplateInfo('react-next', true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.dependencies).toBeDefined();
    expect(parsed.devDependencies).toBeDefined();
  });

  it('includes features array in JSON output', () => {
    showTemplateInfo('react-next', true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(Array.isArray(parsed.features)).toBe(true);
    expect(parsed.features).toContain('ssr');
  });
});

// ---------------------------------------------------------------------------
// showTemplateInfo — preset lookup (TUI mode)
// ---------------------------------------------------------------------------

describe('showTemplateInfo — preset (TUI mode)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs the preset name to stdout', () => {
    showTemplateInfo('standard', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('Standard Drupal');
  });

  it('outputs the preset ID to stdout', () => {
    showTemplateInfo('standard', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('standard');
  });

  it('outputs "Drupal Preset" as the type label', () => {
    showTemplateInfo('standard', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('Drupal Preset');
  });

  it('outputs SDC components when present', () => {
    showTemplateInfo('standard', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('node-teaser');
    expect(output).toContain('hero-banner');
  });

  it('outputs architecture notes when present', () => {
    showTemplateInfo('standard', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).toContain('Layout Builder');
  });

  it('does not output SDC section when sdcList is empty', () => {
    showTemplateInfo('blog', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).not.toContain('SDC Components');
  });

  it('does not output architecture notes section when architectureNotes is absent', () => {
    showTemplateInfo('blog', false);
    const output = consoleSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(output).not.toContain('Architecture Notes');
  });
});

// ---------------------------------------------------------------------------
// showTemplateInfo — preset (JSON mode)
// ---------------------------------------------------------------------------

describe('showTemplateInfo — preset (JSON mode)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs valid JSON for a preset', () => {
    showTemplateInfo('standard', true);
    expect(consoleSpy).toHaveBeenCalledOnce();
    const jsonStr = consoleSpy.mock.calls[0][0] as string;
    expect(() => JSON.parse(jsonStr)).not.toThrow();
  });

  it('sets type to "preset" in JSON output', () => {
    showTemplateInfo('standard', true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.type).toBe('preset');
  });

  it('includes sdcList in JSON output', () => {
    showTemplateInfo('standard', true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(Array.isArray(parsed.sdcList)).toBe(true);
  });

  it('includes dependencies in JSON output', () => {
    showTemplateInfo('standard', true);
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.dependencies).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// showTemplateInfo — not found
// ---------------------------------------------------------------------------

describe('showTemplateInfo — not found', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs an error when the ID is not found', () => {
    expect(() => showTemplateInfo('nonexistent-id', false)).toThrow('process.exit(1)');
    const errorOutput = consoleErrorSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(errorOutput).toContain('not found');
    expect(errorOutput).toContain('"nonexistent-id"');
  });

  it('calls process.exit(1) when the ID is not found', () => {
    expect(() => showTemplateInfo('nonexistent-id', false)).toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('suggests similar IDs when partial match found', () => {
    // 'react' is a partial match prefix for 'react-next' and 'react-vite'
    expect(() => showTemplateInfo('react', false)).toThrow('process.exit(1)');
    const errorOutput = consoleErrorSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(errorOutput).toContain('Did you mean:');
  });

  it('lists all available IDs when no suggestions found', () => {
    expect(() => showTemplateInfo('zzz-no-match', false)).toThrow('process.exit(1)');
    const errorOutput = consoleErrorSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(errorOutput).toContain('Available templates:');
    expect(errorOutput).toContain('Available presets:');
  });
});
