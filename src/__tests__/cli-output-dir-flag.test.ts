import { describe, it, expect } from 'vitest';
import path from 'node:path';

function parseOutputDirArg(args: string[]): string | null {
  const outputDirArgIndex =
    args.indexOf('--output-dir') !== -1 ? args.indexOf('--output-dir') : args.indexOf('-o');
  return outputDirArgIndex !== -1 ? (args[outputDirArgIndex + 1] ?? null) : null;
}

function resolveDirectory(args: string[], projectName: string, cwd: string = '/base'): string {
  const outputDirArg = parseOutputDirArg(args);
  return outputDirArg !== null ? path.resolve(cwd, outputDirArg) : path.resolve(cwd, projectName);
}

describe('--output-dir flag argument parsing', () => {
  it('parses --output-dir flag', () => {
    const result = parseOutputDirArg(['my-app', '--output-dir', './projects/my-app']);
    expect(result).toBe('./projects/my-app');
  });

  it('parses -o short flag', () => {
    const result = parseOutputDirArg(['my-app', '-o', './custom/path']);
    expect(result).toBe('./custom/path');
  });

  it('returns null when flag is not provided', () => {
    const result = parseOutputDirArg(['my-app', '--template', 'react-next']);
    expect(result).toBeNull();
  });

  it('returns null when flag has no value', () => {
    const result = parseOutputDirArg(['my-app', '--output-dir']);
    expect(result).toBeNull();
  });

  it('uses output-dir as directory when provided', () => {
    const dir = resolveDirectory(['my-app', '--output-dir', './projects'], 'my-app');
    expect(dir).toBe('/base/projects');
  });

  it('uses project name as directory when output-dir not provided', () => {
    const dir = resolveDirectory(['my-app'], 'my-app');
    expect(dir).toBe('/base/my-app');
  });

  it('uses -o short flag as directory', () => {
    const dir = resolveDirectory(['my-app', '-o', './out'], 'my-app');
    expect(dir).toBe('/base/out');
  });

  it('resolves absolute output-dir path correctly', () => {
    const dir = resolveDirectory(['my-app', '--output-dir', '/tmp/custom'], 'my-app');
    expect(dir).toBe('/tmp/custom');
  });
});
