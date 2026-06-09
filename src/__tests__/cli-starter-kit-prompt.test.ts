/**
 * v0.7.0 Phase B — "Pick a starter kit" two-step prompt assertions.
 *
 * Pins the interactive-prompt shape consumers see:
 *   Q1: framework — wc-storybook (default) | react-next | react-vite
 *   Q2 (only when Q1 ∈ {react-next, react-vite}): includeDesignSystem
 *       confirm, default true. Skipped by --monorepo / --no-design-system.
 *
 * These tests pin the consumer-visible string + branching shape so
 * downstream rewording surfaces as a regression. The dispatch routing
 * tests live in api-monorepo-options.test.ts.
 */
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

vi.mock('../scaffold.js', () => ({
  scaffoldProject: vi.fn(),
  getDryRunEntries: vi.fn().mockReturnValue([]),
  getLastScaffoldTiming: vi.fn().mockReturnValue(null),
}));

vi.mock('../network.js', () => ({
  detectOffline: vi.fn().mockResolvedValue(false),
}));

vi.mock('../custom-templates.js', () => ({
  loadCustomTemplates: vi.fn().mockReturnValue([]),
}));

vi.mock('../generators/drupal-theme.js', () => ({
  scaffoldDrupalTheme: vi.fn(),
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
  listProfiles: vi.fn(),
  readEnvVars: vi.fn(),
}));

vi.mock('../doctor.js', () => ({
  runDoctor: vi.fn(),
  formatDoctorOutput: vi.fn(),
}));

vi.mock('../commands/info.js', () => ({
  showTemplateInfo: vi.fn(),
}));

vi.mock('../security/dep-audit.js', () => ({
  auditDependencies: vi.fn(),
}));

vi.mock('../version-check.js', () => ({
  checkForUpdate: vi.fn(),
  getCachedLatestVersion: vi.fn(() => null),
}));

vi.mock('../args.js', () => ({
  parseArgs: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../commands/list.js', () => ({
  listAll: vi.fn(),
}));

vi.mock('../commands/upgrade.js', () => ({
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
        readdir: vi.fn().mockResolvedValue([]),
      },
    },
  };
});

// ── Imports ────────────────────────────────────────────────────────────────────

import * as p from '@clack/prompts';
import { parseArgs } from '../args.js';
import { loadConfig, listProfiles, readEnvVars } from '../config.js';
import { runDoctor } from '../doctor.js';
import { scaffoldProject } from '../scaffold.js';
import { auditDependencies } from '../security/dep-audit.js';
import { checkForUpdate } from '../version-check.js';
import { runCLI } from '../cli.js';
import type { ParsedArgs } from '../args.js';
import type { Framework, ComponentBundle } from '../types.js';

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
    // template:null forces the interactive Q1 prompt to fire.
    template: null,
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
    showExperimental: false,
    monorepo: false,
    noDesignSystem: false,
    doctorQuick: false,
    dsName: null,
    tokenPrefix: null,
    brandTagline: null,
    brandVerticals: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(scaffoldProject).mockResolvedValue(undefined);
  vi.mocked(loadConfig).mockReturnValue({ config: { defaults: {} }, configFile: null });
  vi.mocked(listProfiles).mockReturnValue([]);
  vi.mocked(readEnvVars).mockReturnValue({});
  vi.mocked(runDoctor).mockResolvedValue({ allPassed: true, checks: [] } as never);
  vi.mocked(auditDependencies).mockResolvedValue({
    vulnerabilities: [],
    licenseIssues: [],
    networkError: false,
  } as never);
  vi.mocked(checkForUpdate).mockResolvedValue(null);
  vi.mocked(parseArgs).mockReturnValue(makeParsedArgs());
  vi.mocked(p.text).mockResolvedValue('test-app' as never);
  vi.mocked(p.isCancel).mockReturnValue(false);
  vi.mocked(p.multiselect).mockResolvedValue(['core'] as never);
  vi.mocked(p.spinner).mockReturnValue({ start: vi.fn(), stop: vi.fn() } as never);
  vi.mocked(p.group).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (prompts: Record<string, (ctx: any) => Promise<unknown>>, _opts?: any) => {
      // Match @clack/prompts' real semantics: each prompt fn receives a
      // `{ results }` context populated with prior prompts' resolved
      // values. Without this, downstream prompts (includeDesignSystem,
      // dsName, tokenPrefix, etc.) that branch on ctx.results.framework
      // all see undefined and follow the wrong branch.
      const result: Record<string, unknown> = {};
      for (const [key, fn] of Object.entries(prompts)) {
        result[key] = await fn({ results: { ...result } });
      }
      return result as never;
    },
  );

  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code ?? 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('v0.7.0 Phase B — "Pick a starter kit" Q1 prompt', () => {
  it('Q1 default value is wc-storybook', async () => {
    vi.mocked(p.select).mockResolvedValue('wc-storybook' as never);
    await runCLI();
    const selectCalls = vi.mocked(p.select).mock.calls;
    // The framework select is the only p.select used in interactive
    // mode (componentBundles uses multiselect). Pin its initialValue.
    expect(selectCalls.length).toBeGreaterThan(0);
    const firstCall = selectCalls[0][0] as { initialValue: Framework; message: string };
    expect(firstCall.initialValue).toBe('wc-storybook');
  });

  it('Q1 message is "What does this project build?"', async () => {
    vi.mocked(p.select).mockResolvedValue('wc-storybook' as never);
    await runCLI();
    const firstCall = vi.mocked(p.select).mock.calls[0][0] as { message: string };
    expect(firstCall.message).toBe('What does this project build?');
  });

  it('Q1 surfaces the three production starter kits with friendly hints', async () => {
    vi.mocked(p.select).mockResolvedValue('wc-storybook' as never);
    await runCLI();
    const firstCall = vi.mocked(p.select).mock.calls[0][0] as {
      options: { value: Framework; hint: string }[];
    };
    const byValue = new Map(firstCall.options.map((o) => [o.value, o.hint]));
    expect(byValue.get('wc-storybook')).toContain('Design system');
    expect(byValue.get('react-next')).toBe('Next.js app');
    expect(byValue.get('react-vite')).toBe('Vite SPA');
  });
});

describe('v0.7.0 Phase B — Q2 DS-include prompt branching', () => {
  it('Q2 is NOT shown when Q1 is wc-storybook', async () => {
    vi.mocked(p.select).mockResolvedValue('wc-storybook' as never);
    await runCLI();
    // p.confirm is reserved for Q2 + the installDeps confirm. With
    // noInstall:true in default args, installDeps doesn't prompt
    // (returns Promise.resolve(false) inline). So zero confirm calls
    // = Q2 was skipped.
    expect(p.confirm).not.toHaveBeenCalled();
  });

  it('Q2 IS shown when Q1 is react-next', async () => {
    vi.mocked(p.select).mockResolvedValue('react-next' as never);
    vi.mocked(p.confirm).mockResolvedValue(true as never);
    await runCLI();
    expect(p.confirm).toHaveBeenCalled();
    const firstConfirm = vi.mocked(p.confirm).mock.calls[0][0] as {
      message: string;
      initialValue: boolean;
    };
    expect(firstConfirm.message).toContain('design-system');
  });

  it('Q2 IS shown when Q1 is react-vite', async () => {
    vi.mocked(p.select).mockResolvedValue('react-vite' as never);
    vi.mocked(p.confirm).mockResolvedValue(true as never);
    await runCLI();
    expect(p.confirm).toHaveBeenCalled();
  });

  it('Q2 default is yes (initialValue: true)', async () => {
    vi.mocked(p.select).mockResolvedValue('react-vite' as never);
    vi.mocked(p.confirm).mockResolvedValue(true as never);
    await runCLI();
    const firstConfirm = vi.mocked(p.confirm).mock.calls[0][0] as { initialValue: boolean };
    expect(firstConfirm.initialValue).toBe(true);
  });

  it('Q2 answer Yes wires monorepoMode:true into ProjectOptions', async () => {
    vi.mocked(p.select).mockResolvedValue('react-vite' as never);
    vi.mocked(p.confirm).mockResolvedValue(true as never);
    // The monorepo stub throws — catch the error and inspect the
    // call args via the mock. Phase A's stub is the routing proof.
    vi.mocked(scaffoldProject).mockResolvedValue(undefined);
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({ framework: 'react-vite', monorepoMode: true }),
    );
  });

  it('Q2 answer No wires monorepoMode:false into ProjectOptions', async () => {
    vi.mocked(p.select).mockResolvedValue('react-vite' as never);
    vi.mocked(p.confirm).mockResolvedValue(false as never);
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({ framework: 'react-vite', monorepoMode: false }),
    );
  });
});

describe('v0.7.0 Phase B — flag plumbing', () => {
  it('--monorepo skips Q2 and forces monorepoMode:true', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ monorepo: true }));
    vi.mocked(p.select).mockResolvedValue('react-next' as never);
    await runCLI();
    expect(p.confirm).not.toHaveBeenCalled();
    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({ framework: 'react-next', monorepoMode: true }),
    );
  });

  it('--no-design-system skips Q2 and forces monorepoMode:false', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ noDesignSystem: true }));
    vi.mocked(p.select).mockResolvedValue('react-next' as never);
    await runCLI();
    expect(p.confirm).not.toHaveBeenCalled();
    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({ framework: 'react-next', monorepoMode: false }),
    );
  });

  it('framework=wc-storybook ignores --monorepo (coerces to false)', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ monorepo: true }));
    vi.mocked(p.select).mockResolvedValue('wc-storybook' as never);
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({ framework: 'wc-storybook', monorepoMode: false }),
    );
  });

  it('framework=wc-storybook ignores --no-design-system (coerces to false)', async () => {
    vi.mocked(parseArgs).mockReturnValue(makeParsedArgs({ noDesignSystem: true }));
    vi.mocked(p.select).mockResolvedValue('wc-storybook' as never);
    await runCLI();
    expect(scaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({ framework: 'wc-storybook', monorepoMode: false }),
    );
  });
});
