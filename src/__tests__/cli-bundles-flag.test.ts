import { describe, it, expect } from 'vitest';
import { COMPONENT_BUNDLES } from '../templates.js';
import type { ComponentBundle } from '../types.js';

const validBundles = COMPONENT_BUNDLES.map((b) => b.id as ComponentBundle);

function parseBundlesArg(args: string[]): {
  bundlesArg: string | null;
  bundlesFromFlag: ComponentBundle[] | null;
  error: string | null;
} {
  const bundlesArgIndex = args.indexOf('--bundles');
  const bundlesArg = bundlesArgIndex !== -1 ? (args[bundlesArgIndex + 1] ?? null) : null;

  if (bundlesArg === null) {
    return { bundlesArg: null, bundlesFromFlag: null, error: null };
  }

  const requested = bundlesArg.split(',').map((s) => s.trim()) as ComponentBundle[];
  const invalid = requested.filter((b) => !validBundles.includes(b));

  if (invalid.length > 0) {
    return {
      bundlesArg,
      bundlesFromFlag: null,
      error: `Invalid bundle(s): ${invalid.map((b) => `"${b}"`).join(', ')}. Valid options: ${validBundles.join(', ')}`,
    };
  }

  return { bundlesArg, bundlesFromFlag: requested, error: null };
}

describe('--bundles flag argument parsing', () => {
  it('parses --bundles all', () => {
    const { bundlesFromFlag, error } = parseBundlesArg(['my-app', '--bundles', 'all']);
    expect(error).toBeNull();
    expect(bundlesFromFlag).toEqual(['all']);
  });

  it('parses --bundles core,forms', () => {
    const { bundlesFromFlag, error } = parseBundlesArg(['my-app', '--bundles', 'core,forms']);
    expect(error).toBeNull();
    expect(bundlesFromFlag).toEqual(['core', 'forms']);
  });

  it('parses --bundles core,forms,navigation', () => {
    const { bundlesFromFlag, error } = parseBundlesArg([
      'my-app',
      '--bundles',
      'core,forms,navigation',
    ]);
    expect(error).toBeNull();
    expect(bundlesFromFlag).toEqual(['core', 'forms', 'navigation']);
  });

  it('parses all valid bundles', () => {
    const allBundles = validBundles.join(',');
    const { bundlesFromFlag, error } = parseBundlesArg(['my-app', '--bundles', allBundles]);
    expect(error).toBeNull();
    expect(bundlesFromFlag).toEqual(validBundles);
  });

  it('returns error for invalid bundle name', () => {
    const { bundlesFromFlag, error } = parseBundlesArg(['my-app', '--bundles', 'invalid']);
    expect(bundlesFromFlag).toBeNull();
    expect(error).toContain('"invalid"');
    expect(error).toContain('Valid options:');
  });

  it('returns error listing all invalid bundles', () => {
    const { bundlesFromFlag, error } = parseBundlesArg(['my-app', '--bundles', 'bad1,bad2,core']);
    expect(bundlesFromFlag).toBeNull();
    expect(error).toContain('"bad1"');
    expect(error).toContain('"bad2"');
    expect(error).not.toContain('"core"');
  });

  it('returns null when --bundles is not provided', () => {
    const { bundlesArg, bundlesFromFlag } = parseBundlesArg(['my-app', '--template', 'react-next']);
    expect(bundlesArg).toBeNull();
    expect(bundlesFromFlag).toBeNull();
  });

  it('returns null when --bundles has no value', () => {
    const { bundlesArg, bundlesFromFlag } = parseBundlesArg(['my-app', '--bundles']);
    expect(bundlesArg).toBeNull();
    expect(bundlesFromFlag).toBeNull();
  });

  it('trims whitespace from comma-separated values', () => {
    const { bundlesFromFlag, error } = parseBundlesArg([
      'my-app',
      '--bundles',
      'core, forms, navigation',
    ]);
    expect(error).toBeNull();
    expect(bundlesFromFlag).toEqual(['core', 'forms', 'navigation']);
  });
});
