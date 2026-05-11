/**
 * v0.7.0 Phase C — Monorepo root orchestrator emit + idempotency.
 *
 * Asserts the 7 root artifacts (pnpm-workspace.yaml, turbo.json, root
 * package.json + tsconfig.json + README.md + .gitignore, empty
 * apps/web + packages/{design-system,types,utils} dirs) land correctly,
 * that includeDesignSystem === false drops the design-system package +
 * tsconfig reference + storybook scripts, and that a second run produces
 * byte-identical output.
 *
 * The framework-specific monorepo emitters (react-next/react-vite/
 * wc-storybook) still throw after the orchestrator runs — Phase C
 * deliberately stops at the root. Tests pre-create the target directory
 * so scaffoldProject's "rollback partial scaffold on throw" cleanup
 * (src/scaffold.ts ~line 574) doesn't wipe the orchestrator output we
 * want to inspect.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scaffold } from '../api.js';

const TEST_ROOT = path.join(tmpdir(), `create-helix-phase-c-${process.pid}`);

beforeEach(async () => {
  await fs.ensureDir(TEST_ROOT);
});

afterEach(async () => {
  await fs.remove(TEST_ROOT);
});

/**
 * Helper — runs the orchestrator via the public scaffold() API and
 * swallows the expected "app emit pending in Phase D/E/F" throw. The
 * orchestrator runs before the throw, so root files DO land.
 *
 * Pre-creates the target dir so scaffoldProject's rollback-on-throw
 * doesn't remove the emitted root artifacts.
 */
async function runOrchestrator(args: {
  dir: string;
  framework: 'react-next' | 'react-vite' | 'wc-storybook';
  name: string;
  includeDesignSystem?: boolean;
}): Promise<void> {
  await fs.ensureDir(args.dir);
  await expect(
    scaffold({
      name: args.name,
      directory: args.dir,
      framework: args.framework,
      monorepoMode: true,
      includeDesignSystem: args.includeDesignSystem,
      force: true,
      installDeps: false,
    }),
  ).rejects.toThrow(/not yet implemented/i);
}

describe('v0.7.0 Phase C — scaffoldMonorepoRoot emits the 7 root artifacts', () => {
  it('writes pnpm-workspace.yaml with apps/* and packages/* globs', async () => {
    const dir = path.join(TEST_ROOT, 'rn-workspace');
    await runOrchestrator({ dir, framework: 'react-next', name: 'phase-c-rn' });

    const content = await fs.readFile(path.join(dir, 'pnpm-workspace.yaml'), 'utf8');
    expect(content).toContain("- 'apps/*'");
    expect(content).toContain("- 'packages/*'");
  });

  it('writes turbo.json with turbo 2.x schema (tasks, not pipeline)', async () => {
    const dir = path.join(TEST_ROOT, 'rn-turbo');
    await runOrchestrator({ dir, framework: 'react-next', name: 'phase-c-rn' });

    const turbo = await fs.readJson(path.join(dir, 'turbo.json'));
    expect(turbo.$schema).toBe('https://turbo.build/schema.json');
    expect(turbo.ui).toBe('tui');
    // 2.x schema — tasks, NOT pipeline.
    expect(turbo.tasks).toBeDefined();
    expect(turbo.pipeline).toBeUndefined();
    expect(turbo.tasks.build.dependsOn).toEqual(['^build']);
    expect(turbo.tasks.build.outputs).toContain('dist/**');
    expect(turbo.tasks.dev.persistent).toBe(true);
    expect(turbo.tasks.dev.cache).toBe(false);
    expect(turbo.tasks.storybook.persistent).toBe(true);
  });

  it('writes root package.json with workspaces array + turbo devDep + expected scripts', async () => {
    const dir = path.join(TEST_ROOT, 'rn-pkg');
    await runOrchestrator({
      dir,
      framework: 'react-next',
      name: 'phase-c-rn',
      includeDesignSystem: true,
    });

    const pkg = await fs.readJson(path.join(dir, 'package.json'));
    expect(pkg.name).toBe('phase-c-rn');
    expect(pkg.private).toBe(true);
    expect(pkg.workspaces).toEqual(['apps/*', 'packages/*']);
    expect(pkg.scripts.build).toBe('turbo run build');
    expect(pkg.scripts.dev).toBe('turbo run dev');
    expect(pkg.scripts['type-check']).toBe('turbo run type-check');
    expect(pkg.scripts.storybook).toContain('--filter=@phase-c-rn/design-system');
    expect(pkg.scripts['build-storybook']).toContain('--filter=@phase-c-rn/design-system');
    expect(pkg.scripts.format).toContain('prettier --write');
    expect(pkg.devDependencies.turbo).toMatch(/^\^2\./);
    expect(pkg.devDependencies.typescript).toBeDefined();
    expect(pkg.devDependencies.prettier).toBeDefined();
    expect(pkg.packageManager).toMatch(/^pnpm@/);
  });

  it('writes root tsconfig.json with composite references to every existing package', async () => {
    const dir = path.join(TEST_ROOT, 'rn-tsconfig');
    await runOrchestrator({
      dir,
      framework: 'react-next',
      name: 'phase-c-rn',
      includeDesignSystem: true,
    });

    const tsconfig = await fs.readJson(path.join(dir, 'tsconfig.json'));
    expect(tsconfig.files).toEqual([]);
    const refPaths = (tsconfig.references as Array<{ path: string }>).map((r) => r.path);
    expect(refPaths).toContain('./apps/web');
    expect(refPaths).toContain('./packages/design-system');
    expect(refPaths).toContain('./packages/types');
    expect(refPaths).toContain('./packages/utils');
  });

  it('writes a README.md and a workspace-aware .gitignore', async () => {
    const dir = path.join(TEST_ROOT, 'rn-readme');
    await runOrchestrator({
      dir,
      framework: 'react-next',
      name: 'phase-c-rn',
      includeDesignSystem: true,
    });

    const readme = await fs.readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('# phase-c-rn');
    expect(readme).toContain('apps/web/');
    expect(readme).toContain('packages/design-system/');
    expect(readme).toContain('Turborepo');
    expect(readme).toContain('MIGRATING.md');

    const gitignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.turbo/');
    expect(gitignore).toContain('.next/');
    expect(gitignore).toContain('storybook-static/');
    expect(gitignore).toContain('.DS_Store');
  });

  it('creates empty apps/web/ + packages/{design-system,types,utils}/ dirs', async () => {
    const dir = path.join(TEST_ROOT, 'rn-dirs');
    await runOrchestrator({
      dir,
      framework: 'react-next',
      name: 'phase-c-rn',
      includeDesignSystem: true,
    });

    expect(await fs.pathExists(path.join(dir, 'apps', 'web'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'types'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'utils'))).toBe(true);
  });
});

describe('v0.7.0 Phase C — includeDesignSystem === false drops the DS package', () => {
  it('omits packages/design-system dir, tsconfig reference, and storybook scripts', async () => {
    const dir = path.join(TEST_ROOT, 'rn-no-ds');
    await runOrchestrator({
      dir,
      framework: 'react-next',
      name: 'phase-c-rn-no-ds',
      includeDesignSystem: false,
    });

    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(false);
    // types + utils still emitted regardless of DS choice.
    expect(await fs.pathExists(path.join(dir, 'packages', 'types'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'utils'))).toBe(true);

    const tsconfig = await fs.readJson(path.join(dir, 'tsconfig.json'));
    const refPaths = (tsconfig.references as Array<{ path: string }>).map((r) => r.path);
    expect(refPaths).not.toContain('./packages/design-system');
    expect(refPaths).toContain('./apps/web');
    expect(refPaths).toContain('./packages/types');

    const pkg = await fs.readJson(path.join(dir, 'package.json'));
    expect(pkg.scripts.storybook).toBeUndefined();
    expect(pkg.scripts['build-storybook']).toBeUndefined();
    // Non-DS-gated scripts still present.
    expect(pkg.scripts.build).toBe('turbo run build');
    expect(pkg.scripts.dev).toBe('turbo run dev');
  });
});

describe('v0.7.0 Phase C — orchestrator runs across all three monorepo entry points', () => {
  it('react-vite + monorepo emits the same root structure', async () => {
    const dir = path.join(TEST_ROOT, 'rv');
    await runOrchestrator({ dir, framework: 'react-vite', name: 'phase-c-rv' });
    expect(await fs.pathExists(path.join(dir, 'pnpm-workspace.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'turbo.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'apps', 'web'))).toBe(true);
  });

  it('wc-storybook + monorepo still emits the root structure even though api.ts coerces monorepoMode→false on the public surface', async () => {
    // The public scaffold() API silently coerces monorepoMode → false for
    // wc-storybook (the DS scaffold isn't itself a monorepo). To exercise
    // the wc-storybook monorepo entry point directly we go through
    // scaffoldProject, which honors the dispatch as-passed.
    const { scaffoldProject } = await import('../scaffold.js');
    const dir = path.join(TEST_ROOT, 'wcs');
    await fs.ensureDir(dir);
    await expect(
      scaffoldProject({
        name: 'phase-c-wcs',
        directory: dir,
        framework: 'wc-storybook',
        componentBundles: ['all'],
        typescript: true,
        eslint: true,
        designTokens: true,
        darkMode: false,
        installDeps: false,
        force: true,
        monorepoMode: true,
        includeDesignSystem: true,
      }),
    ).rejects.toThrow(/wc-storybook monorepo scaffolder not yet implemented/i);
    expect(await fs.pathExists(path.join(dir, 'pnpm-workspace.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'turbo.json'))).toBe(true);
    expect(await fs.pathExists(path.join(dir, 'packages', 'design-system'))).toBe(true);
  });
});

describe('v0.7.0 Phase C — idempotency', () => {
  it('running the orchestrator twice produces byte-identical root files', async () => {
    const dir = path.join(TEST_ROOT, 'idempotent');

    await runOrchestrator({
      dir,
      framework: 'react-next',
      name: 'phase-c-idem',
      includeDesignSystem: true,
    });

    const firstSnapshot: Record<string, string> = {};
    for (const file of [
      'pnpm-workspace.yaml',
      'turbo.json',
      'package.json',
      'tsconfig.json',
      'README.md',
      '.gitignore',
    ]) {
      firstSnapshot[file] = await fs.readFile(path.join(dir, file), 'utf8');
    }

    // Second pass — same args, same dir.
    await runOrchestrator({
      dir,
      framework: 'react-next',
      name: 'phase-c-idem',
      includeDesignSystem: true,
    });

    for (const [file, before] of Object.entries(firstSnapshot)) {
      const after = await fs.readFile(path.join(dir, file), 'utf8');
      expect(after, `${file} drifted between idempotent runs`).toBe(before);
    }
  });
});

describe('v0.7.0 Phase C — scoped project name derives scope correctly', () => {
  it('@acme/foo → scope "acme" → @acme/design-system in storybook script', async () => {
    // wc-storybook is the only framework that accepts scoped names (per
    // validateScopedNameForFramework), so we drive the test through
    // scaffoldProject directly with monorepoMode:true.
    const { scaffoldProject } = await import('../scaffold.js');
    const dir = path.join(TEST_ROOT, 'scoped');
    await fs.ensureDir(dir);
    await expect(
      scaffoldProject({
        name: '@acme/design-system',
        directory: dir,
        framework: 'wc-storybook',
        componentBundles: ['all'],
        typescript: true,
        eslint: true,
        designTokens: true,
        darkMode: false,
        installDeps: false,
        force: true,
        monorepoMode: true,
        includeDesignSystem: true,
      }),
    ).rejects.toThrow(/not yet implemented/i);

    const pkg = await fs.readJson(path.join(dir, 'package.json'));
    expect(pkg.scripts.storybook).toContain('--filter=@acme/design-system');
  });
});
