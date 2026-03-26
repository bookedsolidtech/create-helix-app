import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../../../src/scaffold.js';
import type { ProjectOptions } from '../../../src/types.js';

const TEST_DIR = '/tmp/helix-edge-names-test';

function makeOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name: 'test-app',
    directory: path.join(TEST_DIR, overrides.name ?? 'test-app'),
    framework: 'vanilla',
    componentBundles: ['core'],
    typescript: false,
    eslint: false,
    designTokens: false,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(TEST_DIR);
});

afterAll(async () => {
  await fs.remove(TEST_DIR);
});

describe('edge cases — project name variants', () => {
  it('scaffolds a project with a hyphenated name', async () => {
    const opts = makeOptions({ name: 'my-helix-project' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.name).toBe('my-helix-project');
  });

  it('scaffolds a project with underscores in name', async () => {
    const opts = makeOptions({ name: 'my_helix_project' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.name).toBe('my_helix_project');
  });

  it('scaffolds a project with numeric suffix', async () => {
    const opts = makeOptions({ name: 'project-2' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.name).toBe('project-2');
  });

  it('scaffolds a project with a single-character name', async () => {
    const opts = makeOptions({ name: 'a' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.name).toBe('a');
  });

  it('scaffolds a project name with mixed hyphens and numbers', async () => {
    const opts = makeOptions({ name: 'app-v2-helix' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.name).toBe('app-v2-helix');
  });

  it('writes any provided name string to package.json', async () => {
    // scaffoldProject writes name as-is; CLI handles validation before calling scaffold
    const opts = makeOptions({ name: 'my.project' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.name).toBe('my.project');
  });
});

describe('edge cases — existing directories', () => {
  it('scaffolds into a pre-existing empty directory', async () => {
    const opts = makeOptions({ name: 'pre-existing' });
    await fs.ensureDir(opts.directory); // create directory before scaffolding
    await expect(scaffoldProject(opts)).resolves.not.toThrow();
    expect(await fs.pathExists(path.join(opts.directory, 'package.json'))).toBe(true);
  });

  it('scaffolds into a directory that already has files (overwrite)', async () => {
    const opts = makeOptions({ name: 'with-existing-files' });
    await fs.ensureDir(opts.directory);
    await fs.writeFile(path.join(opts.directory, 'existing-file.txt'), 'content');

    await scaffoldProject(opts);

    // Scaffold should succeed and generate expected files
    expect(await fs.pathExists(path.join(opts.directory, 'package.json'))).toBe(true);
    // Existing file should still be there (scaffold doesn't delete)
    expect(await fs.pathExists(path.join(opts.directory, 'existing-file.txt'))).toBe(true);
  });

  it('does not delete existing non-conflicting files when scaffolding', async () => {
    const opts = makeOptions({ name: 'preserve-files' });
    await fs.ensureDir(opts.directory);
    await fs.writeFile(path.join(opts.directory, 'notes.txt'), 'keep me');

    await scaffoldProject(opts);

    const content = await fs.readFile(path.join(opts.directory, 'notes.txt'), 'utf-8');
    expect(content).toBe('keep me');
  });
});

describe('edge cases — very long project names', () => {
  it('handles a 50-character project name', async () => {
    const longName = 'a'.repeat(40) + '-project'; // 48 chars
    const opts = makeOptions({ name: longName });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.name).toBe(longName);
  });

  it('handles a project name at the npm max length (214 chars)', async () => {
    // npm enforces 214 char max; we test that scaffold handles it gracefully
    const longName = 'a'.repeat(210) + '-pkg'; // 214 chars
    const opts = makeOptions({
      name: longName,
      directory: path.join(TEST_DIR, 'long-name-test'), // use fixed dir to avoid path issues
    });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.name).toBe(longName);
  });
});
