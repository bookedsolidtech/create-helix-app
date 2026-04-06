import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:fs before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
}));

import fs from 'node:fs';
import {
  validateHelixConfig,
  runConfigValidate,
  runConfigValidateCommand,
  type ConfigValidationError,
  type ConfigValidationResult,
} from '../commands/config-validate.js';

// ---------------------------------------------------------------------------
// validateHelixConfig — pure validation logic
// ---------------------------------------------------------------------------

describe('validateHelixConfig — valid configs', () => {
  it('returns no errors for an empty config object', () => {
    const errors = validateHelixConfig({});
    expect(errors).toHaveLength(0);
  });

  it('returns no errors for a config with valid defaults', () => {
    const config = {
      defaults: {
        template: 'react-next',
        typescript: true,
        eslint: false,
        darkMode: true,
        tokens: false,
        bundles: ['core', 'forms'],
      },
    };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('returns no errors for a config with valid profiles', () => {
    const config = {
      profiles: {
        ci: { template: 'react-vite', typescript: true },
        staging: { preset: 'standard' },
      },
    };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('returns no errors for a config with only templateDir', () => {
    const config = { templateDir: './custom-templates' };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('returns no errors for a fully-populated valid config', () => {
    const config = {
      defaults: {
        template: 'vue-nuxt',
        typescript: true,
        bundles: ['all'],
      },
      profiles: {
        dev: { template: 'solid-vite' },
      },
      templateDir: '/some/path',
    };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(0);
  });
});

describe('validateHelixConfig — invalid config root', () => {
  it('returns an error when config is an array', () => {
    const errors = validateHelixConfig([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('root');
  });

  it('returns an error when config is null', () => {
    const errors = validateHelixConfig(null);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('root');
  });

  it('returns an error when config is a string', () => {
    const errors = validateHelixConfig('not-an-object');
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('root');
  });
});

describe('validateHelixConfig — invalid defaults', () => {
  it('returns an error for an invalid framework template', () => {
    const config = { defaults: { template: 'not-a-framework' } };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('defaults.template');
    expect(errors[0].message).toContain('"not-a-framework"');
  });

  it('returns an error when typescript is not a boolean', () => {
    const config = { defaults: { typescript: 'yes' } };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('defaults.typescript');
  });

  it('returns an error when eslint is not a boolean', () => {
    const config = { defaults: { eslint: 1 } };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('defaults.eslint');
  });

  it('returns an error when darkMode is not a boolean', () => {
    const config = { defaults: { darkMode: 'true' } };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('defaults.darkMode');
  });

  it('returns an error when tokens is not a boolean', () => {
    const config = { defaults: { tokens: 0 } };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('defaults.tokens');
  });

  it('returns an error when bundles is not an array', () => {
    const config = { defaults: { bundles: 'core' } };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('defaults.bundles');
  });

  it('returns an error for invalid bundle values', () => {
    const config = { defaults: { bundles: ['core', 'invalid-bundle'] } };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('defaults.bundles');
    expect(errors[0].message).toContain('"invalid-bundle"');
  });

  it('returns multiple errors for multiple invalid fields', () => {
    const config = {
      defaults: {
        template: 'bad-template',
        typescript: 'yes',
      },
    };
    const errors = validateHelixConfig(config);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const fields = errors.map((e: ConfigValidationError) => e.field);
    expect(fields).toContain('defaults.template');
    expect(fields).toContain('defaults.typescript');
  });

  it('returns an error when defaults is not an object', () => {
    const config = { defaults: 'invalid' };
    const errors = validateHelixConfig(config);
    expect(errors.some((e: ConfigValidationError) => e.field === 'defaults')).toBe(true);
  });
});

describe('validateHelixConfig — invalid profiles', () => {
  it('returns an error for an invalid framework in a profile', () => {
    const config = { profiles: { dev: { template: 'bad-fw' } } };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('profiles.dev.template');
  });

  it('returns an error for an invalid preset in a profile', () => {
    const config = { profiles: { prod: { preset: 'not-a-preset' } } };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('profiles.prod.preset');
    expect(errors[0].message).toContain('"not-a-preset"');
  });

  it('returns an error when a profile entry is not an object', () => {
    const config = { profiles: { bad: 'not-an-object' } };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('profiles.bad');
  });

  it('returns an error when profiles is not an object', () => {
    const config = { profiles: 'not-an-object' };
    const errors = validateHelixConfig(config);
    expect(errors.some((e: ConfigValidationError) => e.field === 'profiles')).toBe(true);
  });
});

describe('validateHelixConfig — invalid templateDir', () => {
  it('returns an error when templateDir is not a string', () => {
    const config = { templateDir: 42 };
    const errors = validateHelixConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('templateDir');
  });
});

// ---------------------------------------------------------------------------
// runConfigValidate — file I/O behaviour
// ---------------------------------------------------------------------------

describe('runConfigValidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid=true when the config file is valid JSON with no errors', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ defaults: { typescript: true } }) as never,
    );

    const result = runConfigValidate('/project/.helixrc.json');

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.configFile).toBe('/project/.helixrc.json');
  });

  it('returns valid=false with a file error when the file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
    });

    const result = runConfigValidate('/missing/.helixrc.json');

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('file');
    expect(result.errors[0].message).toContain('not found');
  });

  it('returns valid=false with errors when the file has invalid JSON', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{ not valid json' as never);

    const result = runConfigValidate('/project/.helixrc.json');

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('file');
    expect(result.errors[0].message).toContain('invalid JSON');
  });

  it('returns valid=false with validation errors for a config with invalid template', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ defaults: { template: 'invalid-fw' } }) as never,
    );

    const result = runConfigValidate('/project/.helixrc.json');

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].field).toBe('defaults.template');
  });

  it('returns valid=true for an empty config object', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never);

    const result = runConfigValidate('/project/.helixrc.json');

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('includes the configFile path in the result', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never);

    const result: ConfigValidationResult = runConfigValidate('/some/path/.helixrc.json');

    expect(result.configFile).toBe('/some/path/.helixrc.json');
  });

  it('returns valid=false with a file error when a read error other than ENOENT occurs', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    });

    const result = runConfigValidate('/locked/.helixrc.json');

    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('file');
    expect(result.errors[0].message).toContain('Could not read');
  });
});

// ---------------------------------------------------------------------------
// runConfigValidateCommand — CLI output and exit codes
// ---------------------------------------------------------------------------

describe('runConfigValidateCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error(`process.exit(${String(_code)})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a success message when config is valid and does not call process.exit', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never);

    runConfigValidateCommand('/project');

    expect(consoleSpy).toHaveBeenCalledOnce();
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('valid');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('calls process.exit(1) when config file is missing', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
    });

    expect(() => runConfigValidateCommand('/missing')).toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('prints each validation error to stderr when config is invalid', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ defaults: { template: 'not-a-real-framework' } }) as never,
    );

    expect(() => runConfigValidateCommand('/project')).toThrow('process.exit(1)');

    const errorLines = consoleErrorSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(errorLines).toContain('defaults.template');
  });

  it('calls process.exit(1) when config contains validation errors', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ defaults: { template: 'bad-fw' } }) as never,
    );

    expect(() => runConfigValidateCommand('/project')).toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('uses the correct config file path based on the dir argument', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('{}' as never);

    runConfigValidateCommand('/my/project');

    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('.helixrc.json'),
      'utf-8',
    );
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('my/project'),
      'utf-8',
    );
  });
});
