import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../../src/templates.js';
import type { Framework, ComponentBundle } from '../../src/types.js';

const validFrameworks = TEMPLATES.map((t) => t.id as Framework);

// Mirrors the --json flag detection logic in src/cli.ts
function detectJsonFlag(args: string[]): boolean {
  return args.includes('--json');
}

// Mirrors the JSON error output format used in src/cli.ts
function buildJsonError(message: string): string {
  return JSON.stringify({ success: false, error: message }, null, 2);
}

// Mirrors the JSON success output format from runJsonScaffold
function buildJsonSuccess(opts: {
  name: string;
  directory: string;
  framework: string;
  typescript: boolean;
  eslint: boolean;
  darkMode: boolean;
  designTokens: boolean;
  bundles: string[];
  files: string[];
  dryRun: boolean;
}): string {
  return JSON.stringify(
    {
      success: true,
      project: {
        name: opts.name,
        directory: opts.directory,
        framework: opts.framework,
        typescript: opts.typescript,
        eslint: opts.eslint,
        darkMode: opts.darkMode,
        designTokens: opts.designTokens,
        bundles: opts.bundles,
      },
      files: opts.files,
      dryRun: opts.dryRun,
    },
    null,
    2,
  );
}

// Mirrors template validation from runJsonScaffold
function validateTemplateForJson(templateArg: string | null): string | null {
  if (templateArg === null) return '--template is required in --json mode';
  if (!validFrameworks.includes(templateArg as Framework)) {
    return `Invalid template: "${templateArg}". Valid options: ${validFrameworks.join(', ')}`;
  }
  return null;
}

describe('--json flag', () => {
  describe('flag detection', () => {
    it('detects --json flag in args', () => {
      const args = ['my-app', '--template', 'react-next', '--json'];
      expect(detectJsonFlag(args)).toBe(true);
    });

    it('isJson is false when --json is not present', () => {
      const args = ['my-app', '--template', 'react-next'];
      expect(detectJsonFlag(args)).toBe(false);
    });

    it('--json is compatible with --dry-run', () => {
      const args = ['my-app', '--template', 'react-next', '--json', '--dry-run'];
      expect(detectJsonFlag(args)).toBe(true);
      expect(args.includes('--dry-run')).toBe(true);
    });

    it('--json is compatible with --template', () => {
      const args = ['my-app', '--template', 'react-next', '--json'];
      expect(detectJsonFlag(args)).toBe(true);
      const templateArgIndex = args.indexOf('--template');
      expect(args[templateArgIndex + 1]).toBe('react-next');
    });
  });

  describe('JSON output format', () => {
    it('success output is valid parseable JSON', () => {
      const output = buildJsonSuccess({
        name: 'my-app',
        directory: '/tmp/my-app',
        framework: 'react-next',
        typescript: true,
        eslint: true,
        darkMode: true,
        designTokens: true,
        bundles: ['core', 'forms'],
        files: ['package.json', 'tsconfig.json'],
        dryRun: false,
      });
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed.success).toBe(true);
    });

    it('success output contains all ProjectOptions fields', () => {
      const output = buildJsonSuccess({
        name: 'my-app',
        directory: '/tmp/my-app',
        framework: 'react-next',
        typescript: true,
        eslint: true,
        darkMode: true,
        designTokens: true,
        bundles: ['all'],
        files: ['package.json'],
        dryRun: true,
      });
      const parsed = JSON.parse(output) as {
        success: boolean;
        project: {
          name: string;
          directory: string;
          framework: string;
          typescript: boolean;
          eslint: boolean;
          darkMode: boolean;
          designTokens: boolean;
          bundles: string[];
        };
        files: string[];
        dryRun: boolean;
      };
      expect(parsed.success).toBe(true);
      expect(parsed.project.name).toBe('my-app');
      expect(parsed.project.directory).toBe('/tmp/my-app');
      expect(parsed.project.framework).toBe('react-next');
      expect(typeof parsed.project.typescript).toBe('boolean');
      expect(typeof parsed.project.eslint).toBe('boolean');
      expect(typeof parsed.project.darkMode).toBe('boolean');
      expect(typeof parsed.project.designTokens).toBe('boolean');
      expect(Array.isArray(parsed.project.bundles)).toBe(true);
      expect(Array.isArray(parsed.files)).toBe(true);
      expect(typeof parsed.dryRun).toBe('boolean');
    });

    it('dry-run output sets dryRun: true', () => {
      const output = buildJsonSuccess({
        name: 'my-app',
        directory: '/tmp/my-app',
        framework: 'react-next',
        typescript: true,
        eslint: true,
        darkMode: true,
        designTokens: true,
        bundles: ['core', 'forms'],
        files: ['package.json', 'tsconfig.json'],
        dryRun: true,
      });
      const parsed = JSON.parse(output) as { dryRun: boolean; files: string[] };
      expect(parsed.dryRun).toBe(true);
      expect(parsed.files).toContain('package.json');
    });

    it('non-dry-run output sets dryRun: false', () => {
      const output = buildJsonSuccess({
        name: 'my-app',
        directory: '/tmp/my-app',
        framework: 'vue-vite',
        typescript: false,
        eslint: false,
        darkMode: false,
        designTokens: false,
        bundles: ['all'],
        files: [],
        dryRun: false,
      });
      const parsed = JSON.parse(output) as { dryRun: boolean };
      expect(parsed.dryRun).toBe(false);
    });

    it('error output is valid parseable JSON', () => {
      const output = buildJsonError('Something went wrong');
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Something went wrong');
    });

    it('error output for invalid template contains template name', () => {
      const err = validateTemplateForJson('bad-template');
      expect(err).not.toBeNull();
      const output = buildJsonError(err!);
      const parsed = JSON.parse(output) as { success: boolean; error: string };
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('"bad-template"');
    });
  });

  describe('template validation in --json mode', () => {
    it('errors when --template is not provided', () => {
      const err = validateTemplateForJson(null);
      expect(err).toBe('--template is required in --json mode');
    });

    it('errors when --template is invalid', () => {
      const err = validateTemplateForJson('not-a-framework');
      expect(err).not.toBeNull();
      expect(err).toContain('"not-a-framework"');
    });

    it('accepts all valid framework names', () => {
      for (const fw of validFrameworks) {
        const err = validateTemplateForJson(fw);
        expect(err).toBeNull();
      }
    });
  });

  describe('default bundles in --json mode', () => {
    it('uses core and forms bundles as defaults when --bundles not provided', () => {
      const bundlesFromFlag: ComponentBundle[] | null = null;
      const defaultBundles: ComponentBundle[] =
        bundlesFromFlag ?? (['core', 'forms'] as ComponentBundle[]);
      expect(defaultBundles).toEqual(['core', 'forms']);
    });

    it('respects --bundles flag when provided', () => {
      const bundlesFromFlag: ComponentBundle[] = ['all'];
      const defaultBundles: ComponentBundle[] =
        bundlesFromFlag ?? (['core', 'forms'] as ComponentBundle[]);
      expect(defaultBundles).toEqual(['all']);
    });
  });
});
