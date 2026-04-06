import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readEnvVars } from '../config.js';

// Capture logger.warn calls
vi.mock('../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../logger.js';

describe('readEnvVars — HELIX_TEMPLATE', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env['HELIX_TEMPLATE'];
    delete process.env['HELIX_PRESET'];
    delete process.env['HELIX_BUNDLES'];
  });

  afterEach(() => {
    delete process.env['HELIX_TEMPLATE'];
    delete process.env['HELIX_PRESET'];
    delete process.env['HELIX_BUNDLES'];
  });

  it('accepts a valid framework', () => {
    process.env['HELIX_TEMPLATE'] = 'react-next';
    const result = readEnvVars();
    expect(result.template).toBe('react-next');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('ignores an invalid framework and warns', () => {
    process.env['HELIX_TEMPLATE'] = 'invalid-framework';
    const result = readEnvVars();
    expect(result.template).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('HELIX_TEMPLATE="invalid-framework"'),
    );
  });
});

describe('readEnvVars — HELIX_PRESET', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env['HELIX_TEMPLATE'];
    delete process.env['HELIX_PRESET'];
    delete process.env['HELIX_BUNDLES'];
  });

  afterEach(() => {
    delete process.env['HELIX_TEMPLATE'];
    delete process.env['HELIX_PRESET'];
    delete process.env['HELIX_BUNDLES'];
  });

  it('accepts a valid preset', () => {
    process.env['HELIX_PRESET'] = 'blog';
    const result = readEnvVars();
    expect(result.preset).toBe('blog');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('ignores an invalid preset and warns', () => {
    process.env['HELIX_PRESET'] = 'not-a-preset';
    const result = readEnvVars();
    expect(result.preset).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('HELIX_PRESET="not-a-preset"'),
    );
  });
});

describe('readEnvVars — HELIX_BUNDLES', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env['HELIX_TEMPLATE'];
    delete process.env['HELIX_PRESET'];
    delete process.env['HELIX_BUNDLES'];
  });

  afterEach(() => {
    delete process.env['HELIX_TEMPLATE'];
    delete process.env['HELIX_PRESET'];
    delete process.env['HELIX_BUNDLES'];
  });

  it('accepts valid bundles', () => {
    process.env['HELIX_BUNDLES'] = 'core,forms';
    const result = readEnvVars();
    expect(result.bundles).toEqual(['core', 'forms']);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('filters out invalid bundles and warns', () => {
    process.env['HELIX_BUNDLES'] = 'core,invalid-bundle,forms';
    const result = readEnvVars();
    expect(result.bundles).toEqual(['core', 'forms']);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('"invalid-bundle"'));
  });

  it('returns undefined bundles when all values are invalid', () => {
    process.env['HELIX_BUNDLES'] = 'bad1,bad2';
    const result = readEnvVars();
    expect(result.bundles).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('trims whitespace from bundle values', () => {
    process.env['HELIX_BUNDLES'] = ' core , forms ';
    const result = readEnvVars();
    expect(result.bundles).toEqual(['core', 'forms']);
  });
});
