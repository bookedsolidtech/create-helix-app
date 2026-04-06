import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  text: vi.fn(),
  select: vi.fn(),
  multiselect: vi.fn(),
  confirm: vi.fn(),
  group: vi.fn(),
  note: vi.fn(),
  isCancel: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/scaffold.js', () => ({
  scaffoldProject: vi.fn(),
  getDryRunEntries: vi.fn(),
  getLastScaffoldTiming: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/network.js', () => ({
  detectOffline: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../src/custom-templates.js', () => ({
  loadCustomTemplates: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/generators/drupal-theme.js', () => ({
  scaffoldDrupalTheme: vi.fn(),
}));

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(),
  listProfiles: vi.fn(),
  readEnvVars: vi.fn(),
}));

vi.mock('../../src/doctor.js', () => ({
  runDoctor: vi.fn(),
  formatDoctorOutput: vi.fn(),
}));

vi.mock('../../src/commands/info.js', () => ({
  showTemplateInfo: vi.fn(),
}));

vi.mock('../../src/security/dep-audit.js', () => ({
  auditDependencies: vi.fn(),
}));

vi.mock('../../src/version-check.js', () => ({
  checkForUpdate: vi.fn(),
}));

vi.mock('../../src/args.js', () => ({
  parseArgs: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/commands/list.js', () => ({
  listAll: vi.fn(),
}));

vi.mock('../../src/commands/upgrade.js', () => ({
  runUpgrade: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      mkdirSync: vi.fn(),
      accessSync: vi.fn(),
      promises: {
        readdir: vi.fn(),
      },
    },
  };
});

// ── Imports ────────────────────────────────────────────────────────────────────

import * as p from '@clack/prompts';
import { execSync } from 'node:child_process';
import { parseArgs } from '../../src/args.js';
import { loadConfig, listProfiles, readEnvVars } from '../../src/config.js';
import { runDoctor, formatDoctorOutput } from '../../src/doctor.js';
import { showTemplateInfo } from '../../src/commands/info.js';
import { scaffoldProject, getDryRunEntries, getLastScaffoldTiming } from '../../src/scaffold.js';
import { detectOffline } from '../../src/network.js';
import { scaffoldDrupalTheme } from '../../src/generators/drupal-theme.js';
import { auditDependencies } from '../../src/security/dep-audit.js';
import { checkForUpdate } from '../../src/version-check.js';
import { listAll } from '../../src/commands/list.js';
import { runUpgrade } from '../../src/commands/upgrade.js';
import { logger } from '../../src/logger.js';
import fs from 'node:fs';
import { runInfoCommand, runListCommand, runJsonScaffold, runCLI } from '../../src/cli.js';
import type { ParsedArgs } from '../../src/args.js';
import type { Framework, ComponentBundle } from '../../src/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

class ExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
    this.name = 'ExitError';
  }
}

function makeParsedArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    showVersion: false,
    subcommand: null,
    subcommandArg: null,
    showHelp: false,
    dryRun: false,
    force: false,
    noInstall: true,
    offline: false,
    quiet: true,
    json: false,
    isDrupal: false,
    noConfig: false,
    verbose: false,
    skipAudit: true,
    template: 'react-next' as Framework,
    preset: null,
    bundles: ['core', 'forms'] as ComponentBundle[],
    outputDir: null,
    typescript: true,
    eslint: true,
    darkMode: true,
    tokens: true,
    explicitFlags: { typescript: false, eslint: false, darkMode: false, tokens: false },
    projectName: 'test-app',
    profile: null,
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default implementations
  vi.mocked(scaffoldProject).mockResolvedValue(undefined);
  vi.mocked(getDryRunEntries).mockReturnValue([]);
  vi.mocked(scaffoldDrupalTheme).mockResolvedValue(undefined);
  vi.mocked(loadConfig).mockReturnValue({ config: { defaults: {} }, configFile: null });
  vi.mocked(listProfiles).mockReturnValue([]);
  vi.mocked(readEnvVars).mockReturnValue({});
  vi.mocked(runDoctor).mockResolvedValue({ allPassed: true, checks: [] } as never);
  vi.mocked(formatDoctorOutput).mockReturnValue('Doctor report');
  vi.mocked(showTemplateInfo).mockReturnValue(undefined);
  vi.mocked(auditDependencies).mockResolvedValue({
    vulnerabilities: [],
    licenseIssues: [],
    networkError: false,
  } as never);
  vi.mocked(checkForUpdate).mockResolvedValue(null);
  vi.mocked(listAll).mockReturnValue(undefined);
  vi.mocked(runUpgrade).mockResolvedValue(undefined);
  vi.mocked(getLastScaffoldTiming).mockReturnValue(null);
  vi.mocked(detectOffline).mockResolvedValue(false);
  vi.mocked(parseArgs).mockReturnValue(makeParsedArgs());

  // Clack prompts defaults
  vi.mocked(p.text).mockResolvedValue('test-app' as never);
  vi.mocked(p.isCancel).mockReturnValue(false);
  vi.mocked(p.confirm).mockResolvedValue(false as never);
  vi.mocked(p.spinner).mockReturnValue({ start: vi.fn(), stop: vi.fn() } as never);
  // group invokes each prompt function and returns combined result
  vi.mocked(p.group).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (prompts: Record<string, () => Promise<unknown>>, _opts?: any) => {
      const result: Record<string, unknown> = {};
      for (const [key, fn] of Object.entries(prompts)) {
        result[key] = await fn();
      }
      return result as never;
    },
  );

  // process.exit throws so tests don't terminate
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code ?? 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);

  // Silence console output
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── runInfoCommand ─────────────────────────────────────────────────────────────

describe('runInfoCommand', () => {
  it('exits 1 when templateId is null', () => {
    expect(() => runInfoCommand(null, false)).toThrow(ExitError);
    expect(console.error).toHaveBeenCalledWith('Usage: create-helix info <template-or-preset-id>');
  });

  it('calls showTemplateInfo with templateId in TUI mode', () => {
    runInfoCommand('react-next', false);
    expect(showTemplateInfo).toHaveBeenCalledWith('react-next', false);
  });

  it('calls showTemplateInfo with isJson=true in JSON mode', () => {
    runInfoCommand('standard', true);
    expect(showTemplateInfo).toHaveBeenCalledWith('standard', true);
  });
});

// ── runListCommand ─────────────────────────────────────────────────────────────

describe('runListCommand', () => {
  it('prints JSON output when isJson=true', () => {
    runListCommand(true);
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as {
      templates: unknown[];
      presets: unknown[];
    };
    expect(parsed.templates).toBeDefined();
    expect(parsed.presets).toBeDefined();
  });

  it('includes configFile in JSON when provided', () => {
    runListCommand(true, '/path/to/.helixrc.json');
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { configFile?: string };
    expect(parsed.configFile).toBe('/path/to/.helixrc.json');
  });

  it('omits configFile from JSON when undefined', () => {
    runListCommand(true, undefined);
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect('configFile' in parsed).toBe(false);
  });

  it('prints TUI output when isJson=false', () => {
    runListCommand(false);
    expect(console.log).toHaveBeenCalled();
    const allOutput = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(allOutput).toContain('Framework Templates');
    expect(allOutput).toContain('Drupal Presets');
  });
});

// ── runJsonScaffold ────────────────────────────────────────────────────────────

describe('runJsonScaffold', () => {
  const baseOpts = {
    isDryRun: false,
    isForce: false,
    isNoInstall: true,
    isVerbose: false,
    typescriptFlag: true,
    eslintFlag: true,
    darkModeFlag: true,
    tokensFlag: true,
    bundlesFromFlag: ['core', 'forms'] as ComponentBundle[],
    outputDirArg: null,
  };

  it('exits 1 with JSON error for invalid template', async () => {
    await expect(runJsonScaffold('my-app', 'not-a-framework', baseOpts)).rejects.toThrow(ExitError);
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('"not-a-framework"');
  });

  it('scaffolds and returns JSON success result', async () => {
    vi.mocked(fs.promises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await runJsonScaffold('my-app', 'react-next', baseOpts);
    expect(scaffoldProject).toHaveBeenCalled();
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { success: boolean };
    expect(parsed.success).toBe(true);
  });

  it('uses getDryRunEntries when isDryRun=true', async () => {
    vi.mocked(getDryRunEntries).mockReturnValue([{ path: '/tmp/my-app/package.json' } as never]);
    await runJsonScaffold('my-app', 'react-next', { ...baseOpts, isDryRun: true });
    expect(getDryRunEntries).toHaveBeenCalled();
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { dryRun: boolean };
    expect(parsed.dryRun).toBe(true);
  });

  it('uses default bundles (core, forms) when bundlesFromFlag is null', async () => {
    vi.mocked(fs.promises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await runJsonScaffold('my-app', 'vue-vite', { ...baseOpts, bundlesFromFlag: null });
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { project: { bundles: string[] } };
    expect(parsed.project.bundles).toEqual(['core', 'forms']);
  });

  it('exits 1 with JSON error when scaffoldProject throws', async () => {
    vi.mocked(scaffoldProject).mockRejectedValue(new Error('write failed'));
    await expect(runJsonScaffold('my-app', 'react-next', baseOpts)).rejects.toThrow(ExitError);
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('write failed');
  });

  it('uses custom outputDir when provided', async () => {
    vi.mocked(fs.promises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await runJsonScaffold('my-app', 'react-next', { ...baseOpts, outputDirArg: './custom' });
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { project: { directory: string } };
    expect(parsed.project.directory).toContain('custom');
  });

  it('includes timing data in JSON result when getLastScaffoldTiming returns non-null', async () => {
    vi.mocked(getLastScaffoldTiming).mockReturnValue({
      totalMs: 500,
      bytesWritten: 1024,
      fileCount: 5,
      dependencyCount: 3,
      phases: {
        validationMs: 50,
        templateResolutionMs: 100,
        fileGenerationMs: 200,
        fileWritingMs: 150,
      },
    } as never);
    vi.mocked(fs.promises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await runJsonScaffold('my-app', 'react-next', baseOpts);
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as {
      success: boolean;
      timing: {
        totalMs: number;
        fileCount: number;
        bytesWritten: number;
        dependencyCount: number;
        phases: {
          validationMs: number;
          templateResolutionMs: number;
          fileGenerationMs: number;
          fileWritingMs: number;
        };
      };
    };
    expect(parsed.success).toBe(true);
    expect(parsed.timing).toBeDefined();
    expect(parsed.timing.totalMs).toBe(500);
    expect(parsed.timing.fileCount).toBe(5);
    expect(parsed.timing.bytesWritten).toBe(1024);
    expect(parsed.timing.dependencyCount).toBe(3);
    expect(parsed.timing.phases.validationMs).toBe(50);
    expect(parsed.timing.phases.templateResolutionMs).toBe(100);
    expect(parsed.timing.phases.fileGenerationMs).toBe(200);
    expect(parsed.timing.phases.fileWritingMs).toBe(150);
  });
});

// ── runCLI — parseArgs errors ─────────────────────────────────────────────────

describe('runCLI — parseArgs errors', () => {
  it('outputs JSON error and exits 1 when parseArgs throws in --json mode', async () => {
    vi.mocked(parseArgs).mockImplementation(() => {
      // Simulate process.argv having --json when error is thrown
      process.argv = ['node', 'cli', '--json'];
      throw new Error('bad arg');
    });
    // Override argv so isJsonMode is detected
    Object.defineProperty(process, 'argv', {
      value: ['node', 'cli', '--json'],
      writable: true,
    });
    await expect(runCLI()).rejects.toThrow(ExitError);
  });

  it('outputs plain error and exits 1 when parseArgs throws without --json', async () => {
    Object.defineProperty(process, 'argv', {
      value: ['node', 'cli', 'bad-arg'],
      writable: true,
    });
    vi.mocked(parseArgs).mockImplementation(() => {
      throw new Error('invalid arg');
    });
    await expect(runCLI()).rejects.toThrow(ExitError);
    expect(console.error).toHaveBeenCalledWith('invalid arg');
  });
});

// ── runCLI — --version ────────────────────────────────────────────────────────

describe('runCLI — --version', () => {
  it('prints version and exits 0', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ showVersion: true }));
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
    const logOutput = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(logOutput).toMatch(/create-helix v\d+\.\d+\.\d+/);
  });
});

// ── runCLI — list subcommand ──────────────────────────────────────────────────

describe('runCLI — list subcommand', () => {
  it('calls listAll and exits 0', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ subcommand: 'list' }));
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
    expect(listAll).toHaveBeenCalledWith(false);
  });

  it('calls listAll with isJson=true when --json flag set', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ subcommand: 'list', json: true }));
    await runCLI().catch(() => {});
    expect(listAll).toHaveBeenCalledWith(true);
  });
});

// ── runCLI — info subcommand ──────────────────────────────────────────────────

describe('runCLI — info subcommand', () => {
  it('calls showTemplateInfo and exits 0', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ subcommand: 'info', subcommandArg: 'react-next' }),
    );
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
    expect(showTemplateInfo).toHaveBeenCalledWith('react-next', false);
  });
});

// ── runCLI — doctor subcommand ────────────────────────────────────────────────

describe('runCLI — doctor subcommand', () => {
  it('runs doctor, prints TUI output, exits 0 when all checks pass', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ subcommand: 'doctor' }));
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
    expect(formatDoctorOutput).toHaveBeenCalled();
  });

  it('exits 1 when doctor checks fail', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ subcommand: 'doctor' }));
    vi.mocked(runDoctor).mockResolvedValue({ allPassed: false, checks: [] } as never);
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
  });

  it('outputs JSON when doctor is run with --json flag', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ subcommand: 'doctor', json: true }));
    vi.mocked(runDoctor).mockResolvedValue({ allPassed: true, checks: [] } as never);
    await runCLI().catch(() => {});
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { allPassed: boolean };
    expect(parsed.allPassed).toBe(true);
  });
});

// ── runCLI — upgrade subcommand ───────────────────────────────────────────────

describe('runCLI — upgrade subcommand', () => {
  it('calls runUpgrade and exits 0', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ subcommand: 'upgrade' }));
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
    expect(runUpgrade).toHaveBeenCalledWith(
      process.cwd(),
      expect.objectContaining({ dryRun: false }),
    );
  });

  it('passes dryRun flag to runUpgrade', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ subcommand: 'upgrade', dryRun: true }));
    await runCLI().catch(() => {});
    expect(runUpgrade).toHaveBeenCalledWith(
      process.cwd(),
      expect.objectContaining({ dryRun: true }),
    );
  });
});

// ── runCLI — config subcommand ────────────────────────────────────────────────

describe('runCLI — config subcommand', () => {
  it('prints "No profiles defined" when list-profiles is empty', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ subcommand: 'config', subcommandArg: 'list-profiles' }),
    );
    vi.mocked(listProfiles).mockReturnValue([]);
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
    expect(console.log).toHaveBeenCalledWith('No profiles defined in .helixrc.json');
  });

  it('prints each profile name when list-profiles returns profiles', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ subcommand: 'config', subcommandArg: 'list-profiles' }),
    );
    vi.mocked(listProfiles).mockReturnValue(['prod', 'staging']);
    await runCLI().catch(() => {});
    expect(console.log).toHaveBeenCalledWith('prod');
    expect(console.log).toHaveBeenCalledWith('staging');
  });

  it('exits 1 for unknown config subcommand', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ subcommand: 'config', subcommandArg: 'bad-command' }),
    );
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown config subcommand'),
    );
  });
});

// ── runCLI — --help ───────────────────────────────────────────────────────────

describe('runCLI — --help', () => {
  it('prints help text and exits 0', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ showHelp: true }));
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
    const output = vi.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).toContain('create-helix v');
    expect(output).toContain('Usage:');
    expect(output).toContain('--template');
    expect(output).toContain('--drupal');
    expect(output).toContain('--dry-run');
    expect(output).toContain('--json');
    expect(output).toContain('--verbose');
    expect(output).toContain('--bundles');
    expect(output).toContain('--preset');
    expect(output).toContain('doctor');
    expect(output).toContain('upgrade');
  });

  it('help text lists all environment variables', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ showHelp: true }));
    await runCLI().catch(() => {});
    const output = vi.mocked(console.log).mock.calls.flat().join('\n');
    expect(output).toContain('HELIX_TEMPLATE');
    expect(output).toContain('HELIX_TYPESCRIPT');
    expect(output).toContain('HELIX_OFFLINE');
  });
});

// ── runCLI — outputDir validation ─────────────────────────────────────────────

describe('runCLI — outputDir validation', () => {
  it('exits 1 with error when outputDir has path traversal', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ outputDir: '../../../etc' }));
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid output directory'));
  });

  it('exits 1 with error when outputDir is not writable', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ outputDir: './valid-dir' }));
    vi.mocked(fs.mkdirSync).mockImplementation(() => {
      throw new Error('EACCES');
    });
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Output directory is not writable'),
    );
  });
});

// ── runCLI — Drupal / preset path ─────────────────────────────────────────────

describe('runCLI — Drupal / preset path', () => {
  it('runs Drupal CLI when isDrupal=true', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ isDrupal: true, preset: 'standard' as never }),
    );
    await runCLI();
    expect(scaffoldDrupalTheme).toHaveBeenCalled();
  });

  it('exits 1 when invalid preset is passed to runDrupalCLI', async () => {
    // Bypass parseArgs validation by injecting directly via loadConfig path
    // and triggering runDrupalCLI with an invalid preset via presetArg from env
    vi.mocked(readEnvVars).mockReturnValue({ preset: 'invalid' as never });
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ isDrupal: true, preset: null }));
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
  });

  it('prompts for preset when not pre-selected', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ isDrupal: true, preset: null }));
    vi.mocked(p.text).mockResolvedValue('my_theme' as never);
    vi.mocked(p.select).mockResolvedValue('standard' as never);
    vi.mocked(p.isCancel).mockReturnValue(false);
    await runCLI();
    expect(p.select).toHaveBeenCalled();
    expect(scaffoldDrupalTheme).toHaveBeenCalledWith(
      expect.objectContaining({ themeName: 'my_theme', preset: 'standard' }),
    );
  });

  it('exits 0 when theme name prompt is cancelled', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ isDrupal: true, preset: 'standard' as never }),
    );
    vi.mocked(p.text).mockResolvedValue(Symbol('cancel') as never);
    vi.mocked(p.isCancel).mockImplementation((val) => typeof val === 'symbol');
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
  });

  it('exits 0 when preset select is cancelled', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ isDrupal: true, preset: null }));
    vi.mocked(p.text).mockResolvedValue('my_theme' as never);
    const cancelSymbol = Symbol('cancel');
    vi.mocked(p.isCancel).mockImplementation((val) => val === cancelSymbol);
    vi.mocked(p.select).mockResolvedValue(cancelSymbol as never);
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
  });

  it('runs Drupal CLI with quiet=false and shows TUI elements', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ isDrupal: true, preset: 'blog' as never, quiet: false }),
    );
    vi.mocked(p.text).mockResolvedValue('my_blog_theme' as never);
    vi.mocked(p.isCancel).mockReturnValue(false);
    await runCLI();
    expect(p.intro).toHaveBeenCalled();
    expect(scaffoldDrupalTheme).toHaveBeenCalled();
  });
});

// ── runCLI — JSON mode ────────────────────────────────────────────────────────

describe('runCLI — JSON mode', () => {
  it('exits 1 with JSON error when no project name in --json mode', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ json: true, projectName: null }));
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Project name is required');
  });

  it('exits 1 with JSON error when no template in --json mode', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ json: true, template: null }));
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('--template is required');
  });

  it('runs runJsonScaffold when projectName and template are present', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ json: true, projectName: 'my-app', template: 'react-next' as Framework }),
    );
    vi.mocked(fs.promises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalled();
  });
});

// ── runCLI — interactive mode ─────────────────────────────────────────────────

describe('runCLI — interactive mode', () => {
  it('runs full interactive flow with mocked prompts', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ quiet: true, template: 'react-next' as Framework }),
    );
    await runCLI();
    expect(p.group).toHaveBeenCalled();
    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'test-app',
        framework: 'react-next',
      }),
    );
  });

  it('suppresses banner and TUI when quiet=true', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: true }));
    await runCLI();
    expect(p.intro).not.toHaveBeenCalled();
    expect(p.outro).not.toHaveBeenCalled();
  });

  it('shows banner and TUI when quiet=false', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: false }));
    await runCLI();
    expect(p.intro).toHaveBeenCalled();
    expect(p.outro).toHaveBeenCalled();
  });

  it('exits 0 when group is cancelled via onCancel', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: true }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(p.group).mockImplementation((_prompts: any, opts: any) => {
      opts?.onCancel?.();
      return Promise.resolve({} as never);
    });
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(0);
    expect(p.cancel).toHaveBeenCalledWith('Operation cancelled.');
  });

  it('runs audit when skipAudit=false and not dryRun', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ quiet: true, skipAudit: false, dryRun: false }),
    );
    await runCLI();
    expect(auditDependencies).toHaveBeenCalled();
  });

  it('shows audit warnings for vulnerabilities', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ quiet: false, skipAudit: false, dryRun: false }),
    );
    vi.mocked(auditDependencies).mockResolvedValue({
      vulnerabilities: [{ package: 'lodash', version: '4.0.0', count: 2, severity: 'high' }],
      licenseIssues: [],
      networkError: false,
    } as never);
    await runCLI();
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('lodash@4.0.0'));
  });

  it('shows license warnings when license issues found', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ quiet: false, skipAudit: false, dryRun: false }),
    );
    vi.mocked(auditDependencies).mockResolvedValue({
      vulnerabilities: [],
      licenseIssues: [{ package: 'pkg', version: '1.0.0', license: 'AGPL-3.0' }],
      networkError: false,
    } as never);
    await runCLI();
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('non-standard license'));
  });

  it('skips audit when networkError=true', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ quiet: false, skipAudit: false, dryRun: false }),
    );
    vi.mocked(auditDependencies).mockResolvedValue({
      vulnerabilities: [],
      licenseIssues: [],
      networkError: true,
    } as never);
    await runCLI();
    expect(p.log.warn).not.toHaveBeenCalled();
  });

  it('runs dry-run scaffold path', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: true, dryRun: true }));
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });

  it('shows update warning when available and not quiet', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ quiet: false, noInstall: false, json: false }),
    );
    vi.mocked(checkForUpdate).mockResolvedValue('New version 2.0.0 available!');
    vi.mocked(p.confirm).mockResolvedValue(false as never);
    await runCLI();
    expect(logger.warn).toHaveBeenCalledWith('New version 2.0.0 available!');
  });

  it('does not show update warning when quiet=true', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ quiet: true, noInstall: false, json: false }),
    );
    vi.mocked(checkForUpdate).mockResolvedValue('New version 2.0.0 available!');
    vi.mocked(p.confirm).mockResolvedValue(false as never);
    await runCLI();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('prompts for framework when template not pre-selected', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: true, template: null }));
    vi.mocked(p.select).mockResolvedValue('vue-vite' as never);
    vi.mocked(p.multiselect).mockResolvedValue(['core'] as never);
    await runCLI();
    expect(p.select).toHaveBeenCalled();
    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({ framework: 'vue-vite' }),
    );
  });

  it('prompts for component bundles when not pre-selected', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: true, bundles: null }));
    vi.mocked(p.multiselect).mockResolvedValue(['core', 'forms'] as never);
    await runCLI();
    expect(p.multiselect).toHaveBeenCalled();
  });

  it('uses outputDir for project directory when specified', async () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.accessSync).mockReturnValue(undefined);
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ quiet: true, outputDir: './custom-output' }),
    );
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({ directory: expect.stringContaining('custom-output') }),
    );
  });

  it('outputs project summary with all fields', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({ quiet: false, template: 'react-next' as Framework }),
    );
    await runCLI();
    const output = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(output).toContain('test-app');
  });
});

// ── runCLI — loadConfig error ─────────────────────────────────────────────────

describe('runCLI — loadConfig error', () => {
  it('exits 1 when loadConfig throws', async () => {
    vi.mocked(loadConfig).mockImplementation(() => {
      throw new Error('config parse error');
    });
    const err = await runCLI().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect((err as ExitError).code).toBe(1);
    expect(console.error).toHaveBeenCalledWith('config parse error');
  });
});

// ── runCLI — flag combinations ────────────────────────────────────────────────

describe('runCLI — flag combinations', () => {
  it('--verbose flag is passed through to scaffoldProject', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ verbose: true }));
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(expect.objectContaining({ verbose: true }));
  });

  it('--force flag is passed through to scaffoldProject', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ force: true }));
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
  });

  it('--no-typescript disables typescript in scaffold options', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({
        typescript: false,
        explicitFlags: { typescript: true, eslint: false, darkMode: false, tokens: false },
      }),
    );
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(expect.objectContaining({ typescript: false }));
  });

  it('--no-eslint disables eslint in scaffold options', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({
        eslint: false,
        explicitFlags: { typescript: false, eslint: true, darkMode: false, tokens: false },
      }),
    );
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(expect.objectContaining({ eslint: false }));
  });

  it('--no-install skips dependency installation', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ noInstall: true, quiet: true }));
    await runCLI();
    // scaffoldProject called with installDeps false
    expect(scaffoldProject).toHaveBeenCalledWith(expect.objectContaining({ installDeps: false }));
  });

  it('--offline (via env) sets noInstall', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ noInstall: false }));
    vi.mocked(readEnvVars).mockReturnValue({ offline: true });
    vi.mocked(p.confirm).mockResolvedValue(false as never);
    await runCLI();
    // checkForUpdate should not be called when offline
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it('env var template overrides when no CLI template', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ template: null }));
    vi.mocked(readEnvVars).mockReturnValue({ template: 'svelte-kit' as Framework });
    vi.mocked(p.multiselect).mockResolvedValue(['core'] as never);
    await runCLI();
    // framework should come from env var - resolved via templateArg in group
    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({ framework: 'svelte-kit' }),
    );
  });

  it('--no-dark-mode explicit flag disables darkMode', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({
        darkMode: false,
        explicitFlags: { typescript: false, eslint: false, darkMode: true, tokens: false },
      }),
    );
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(expect.objectContaining({ darkMode: false }));
  });

  it('--no-tokens explicit flag disables tokens', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({
        tokens: false,
        explicitFlags: { typescript: false, eslint: false, darkMode: false, tokens: true },
      }),
    );
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(expect.objectContaining({ designTokens: false }));
  });

  it('shows "all" bundles label in output when bundles includes all', async () => {
    vi.mocked(parseArgs).mockReturnValue(
      makeParsedArgs({
        quiet: false,
        bundles: ['all'] as ComponentBundle[],
      }),
    );
    await runCLI();
    const output = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(output).toContain('98 components');
  });
});

// ── runCLI — installDeps ──────────────────────────────────────────────────────

describe('runCLI — installDeps', () => {
  beforeEach(() => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: false, noInstall: false }));
    vi.mocked(p.confirm).mockResolvedValue(true as never);
  });

  it('runs pnpm install when installDeps=true', async () => {
    vi.mocked(execSync).mockReturnValue(undefined as never);
    await runCLI();
    expect(execSync).toHaveBeenCalledWith('pnpm install', expect.any(Object));
  });

  it('falls back to npm install when pnpm fails', async () => {
    vi.mocked(execSync)
      .mockImplementationOnce(() => {
        throw new Error('pnpm not found');
      })
      .mockReturnValue(undefined as never);
    await runCLI();
    expect(execSync).toHaveBeenCalledWith('npm install', expect.any(Object));
  });

  it('continues gracefully when both pnpm and npm fail', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });
    // Should not throw — shows warning instead
    await expect(runCLI()).resolves.not.toThrow();
  });
});

// ── collectFiles via runJsonScaffold ──────────────────────────────────────────

describe('collectFiles — via runJsonScaffold', () => {
  const baseOpts = {
    isDryRun: false,
    isForce: false,
    isNoInstall: true,
    isVerbose: false,
    typescriptFlag: true,
    eslintFlag: true,
    darkModeFlag: true,
    tokensFlag: true,
    bundlesFromFlag: ['core'] as ComponentBundle[],
    outputDirArg: null,
  };

  it('collects files from directory including subdirectory entries', async () => {
    vi.mocked(fs.promises.readdir as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { name: 'package.json', isDirectory: () => false },
        { name: 'src', isDirectory: () => true },
      ])
      .mockResolvedValueOnce([{ name: 'index.ts', isDirectory: () => false }])
      .mockResolvedValue([]);

    await runJsonScaffold('my-app', 'react-next', baseOpts);

    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { files: string[] };
    expect(parsed.files).toContain('package.json');
  });

  it('handles readdir errors gracefully (returns empty array)', async () => {
    vi.mocked(fs.promises.readdir as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ENOENT'),
    );
    await runJsonScaffold('my-app', 'react-next', baseOpts);
    const output = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .join('');
    const parsed = JSON.parse(output) as { files: string[] };
    expect(parsed.files).toEqual([]);
  });
});

// ── runCLI — scaffold timing block ───────────────────────────────────────────

describe('runCLI — scaffold timing display', () => {
  const mockTiming = {
    totalMs: 500,
    bytesWritten: 2048,
    fileCount: 10,
    dependencyCount: 5,
    phases: {
      validationMs: 50,
      templateResolutionMs: 100,
      fileGenerationMs: 200,
      fileWritingMs: 150,
    },
  };

  it('shows timing summary when scaffoldTiming is non-null and not quiet', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: false }));
    vi.mocked(getLastScaffoldTiming).mockReturnValue(mockTiming as never);
    await runCLI();
    const output = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(output).toContain('500ms');
    expect(output).toContain('10 files');
  });

  it('shows timing in KB when bytesWritten is between 1024 and 1MB', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: false }));
    vi.mocked(getLastScaffoldTiming).mockReturnValue({
      ...mockTiming,
      bytesWritten: 2048,
    } as never);
    await runCLI();
    const output = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(output).toMatch(/\d+\.\d+ KB/);
  });

  it('shows timing in bytes when bytesWritten < 1024', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: false }));
    vi.mocked(getLastScaffoldTiming).mockReturnValue({ ...mockTiming, bytesWritten: 512 } as never);
    await runCLI();
    const output = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(output).toContain('512 B');
  });

  it('shows timing in MB when bytesWritten >= 1MB', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: false }));
    vi.mocked(getLastScaffoldTiming).mockReturnValue({
      ...mockTiming,
      bytesWritten: 2 * 1024 * 1024,
    } as never);
    await runCLI();
    const output = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(output).toMatch(/\d+\.\d+ MB/);
  });

  it('shows per-phase timing when verbose=true and scaffoldTiming non-null', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: false, verbose: true }));
    vi.mocked(getLastScaffoldTiming).mockReturnValue(mockTiming as never);
    await runCLI();
    const output = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(output).toContain('Per-phase timing');
  });

  it('does not show timing when quiet=true even with non-null scaffoldTiming', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ quiet: true }));
    vi.mocked(getLastScaffoldTiming).mockReturnValue(mockTiming as never);
    await runCLI();
    const output = vi.mocked(console.log).mock.calls.flat().join(' ');
    expect(output).not.toContain('Performance:');
  });
});
