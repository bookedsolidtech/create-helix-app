import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { scaffoldProject } from '../../src/scaffold.js';
import type { ProjectOptions } from '../../src/types.js';
import {
  makeTmpRoot,
  removeTempDir,
  assertFileExists,
  readText,
  readJson,
} from '../integration/setup.js';

const ROOT = makeTmpRoot('editor-config');

function opts(name: string, overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name,
    directory: path.join(ROOT, name),
    framework: 'react-vite',
    componentBundles: ['core'],
    typescript: true,
    eslint: true,
    designTokens: false,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

afterAll(async () => {
  await removeTempDir(ROOT);
});

describe('.editorconfig generation', () => {
  it('react-vite scaffold creates .editorconfig', async () => {
    const o = opts('rv-editorconfig');
    await scaffoldProject(o);
    await assertFileExists(o.directory, '.editorconfig');
  });

  it('.editorconfig contains "root = true"', async () => {
    const o = opts('rv-editorconfig-root');
    await scaffoldProject(o);
    const content = await readText(o.directory, '.editorconfig');
    expect(content).toContain('root = true');
  });

  it('.editorconfig has indent_style = space', async () => {
    const o = opts('rv-editorconfig-indent');
    await scaffoldProject(o);
    const content = await readText(o.directory, '.editorconfig');
    expect(content).toContain('indent_style = space');
  });

  it('.editorconfig has indent_size = 2', async () => {
    const o = opts('rv-editorconfig-size');
    await scaffoldProject(o);
    const content = await readText(o.directory, '.editorconfig');
    expect(content).toContain('indent_size = 2');
  });

  it('.editorconfig has end_of_line = lf', async () => {
    const o = opts('rv-editorconfig-eol');
    await scaffoldProject(o);
    const content = await readText(o.directory, '.editorconfig');
    expect(content).toContain('end_of_line = lf');
  });

  it('.editorconfig has insert_final_newline = true', async () => {
    const o = opts('rv-editorconfig-newline');
    await scaffoldProject(o);
    const content = await readText(o.directory, '.editorconfig');
    expect(content).toContain('insert_final_newline = true');
  });
});

describe('.prettierrc generation', () => {
  it('react-vite scaffold creates .prettierrc', async () => {
    const o = opts('rv-prettierrc');
    await scaffoldProject(o);
    await assertFileExists(o.directory, '.prettierrc');
  });

  it('.prettierrc is valid JSON with singleQuote: true', async () => {
    const o = opts('rv-prettierrc-json');
    await scaffoldProject(o);
    const config = await readJson<{ singleQuote: boolean }>(o.directory, '.prettierrc');
    expect(config.singleQuote).toBe(true);
  });

  it('.prettierrc has semi: true', async () => {
    const o = opts('rv-prettierrc-semi');
    await scaffoldProject(o);
    const config = await readJson<{ semi: boolean }>(o.directory, '.prettierrc');
    expect(config.semi).toBe(true);
  });

  it('.prettierrc has tabWidth: 2', async () => {
    const o = opts('rv-prettierrc-tabwidth');
    await scaffoldProject(o);
    const config = await readJson<{ tabWidth: number }>(o.directory, '.prettierrc');
    expect(config.tabWidth).toBe(2);
  });

  it('.prettierrc has trailingComma: "all"', async () => {
    const o = opts('rv-prettierrc-trailing');
    await scaffoldProject(o);
    const config = await readJson<{ trailingComma: string }>(o.directory, '.prettierrc');
    expect(config.trailingComma).toBe('all');
  });

  it('.prettierrc has printWidth: 100', async () => {
    const o = opts('rv-prettierrc-printwidth');
    await scaffoldProject(o);
    const config = await readJson<{ printWidth: number }>(o.directory, '.prettierrc');
    expect(config.printWidth).toBe(100);
  });

  it('.prettierrc is written even when eslint option is false', async () => {
    const o = opts('rv-prettierrc-noeslint', { eslint: false });
    await scaffoldProject(o);
    await assertFileExists(o.directory, '.prettierrc');
  });
});

describe('cross-framework .editorconfig and .prettierrc', () => {
  it('vue-vite scaffold creates .editorconfig', async () => {
    const o = opts('vv-editorconfig', { framework: 'vue-vite' });
    await scaffoldProject(o);
    await assertFileExists(o.directory, '.editorconfig');
  });

  it('vue-vite scaffold creates .prettierrc', async () => {
    const o = opts('vv-prettierrc', { framework: 'vue-vite' });
    await scaffoldProject(o);
    await assertFileExists(o.directory, '.prettierrc');
  });

  it('angular scaffold creates .editorconfig', async () => {
    const o = opts('ng-editorconfig', { framework: 'angular' });
    await scaffoldProject(o);
    await assertFileExists(o.directory, '.editorconfig');
  });

  it('angular scaffold creates .prettierrc', async () => {
    const o = opts('ng-prettierrc', { framework: 'angular' });
    await scaffoldProject(o);
    await assertFileExists(o.directory, '.prettierrc');
  });

  it('.editorconfig is written even when eslint option is false', async () => {
    const o = opts('rv-editorconfig-noeslint', { eslint: false });
    await scaffoldProject(o);
    await assertFileExists(o.directory, '.editorconfig');
  });
});
