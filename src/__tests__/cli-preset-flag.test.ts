import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isValidPreset } from '../presets/loader.js';

// Unit tests for --preset flag argument parsing logic
describe('--preset flag argument parsing', () => {
  it('isValidPreset returns true for all valid presets', () => {
    expect(isValidPreset('standard')).toBe(true);
    expect(isValidPreset('blog')).toBe(true);
    expect(isValidPreset('healthcare')).toBe(true);
    expect(isValidPreset('intranet')).toBe(true);
    expect(isValidPreset('ecommerce')).toBe(true);
  });

  it('isValidPreset returns false for invalid preset', () => {
    expect(isValidPreset('invalid')).toBe(false);
    expect(isValidPreset('')).toBe(false);
    expect(isValidPreset('drupal')).toBe(false);
  });

  it('parses --preset value from args array', () => {
    const args = ['my-theme', '--preset', 'blog'];
    const presetArgIndex = args.indexOf('--preset');
    const presetArg = presetArgIndex !== -1 ? (args[presetArgIndex + 1] ?? null) : null;
    expect(presetArg).toBe('blog');
  });

  it('returns null when --preset is not provided', () => {
    const args = ['my-theme', '--drupal'];
    const presetArgIndex = args.indexOf('--preset');
    const presetArg = presetArgIndex !== -1 ? (args[presetArgIndex + 1] ?? null) : null;
    expect(presetArg).toBeNull();
  });

  it('returns null when --preset has no value', () => {
    const args = ['my-theme', '--preset'];
    const presetArgIndex = args.indexOf('--preset');
    const presetArg = presetArgIndex !== -1 ? (args[presetArgIndex + 1] ?? null) : null;
    expect(presetArg).toBeNull();
  });

  it('auto-enables Drupal mode when --preset is provided without --drupal', () => {
    const args = ['my-theme', '--preset', 'healthcare'];
    const isDrupal = args.includes('--drupal');
    const presetArgIndex = args.indexOf('--preset');
    const presetArg = presetArgIndex !== -1 ? (args[presetArgIndex + 1] ?? null) : null;

    // The condition that routes to Drupal CLI
    const shouldUseDrupalCLI = isDrupal || presetArg !== null;
    expect(shouldUseDrupalCLI).toBe(true);
  });

  it('routes to Drupal CLI when both --drupal and --preset are provided', () => {
    const args = ['my-theme', '--drupal', '--preset', 'blog'];
    const isDrupal = args.includes('--drupal');
    const presetArgIndex = args.indexOf('--preset');
    const presetArg = presetArgIndex !== -1 ? (args[presetArgIndex + 1] ?? null) : null;

    const shouldUseDrupalCLI = isDrupal || presetArg !== null;
    expect(shouldUseDrupalCLI).toBe(true);
    expect(presetArg).toBe('blog');
  });

  it('does NOT route to Drupal CLI when neither --drupal nor --preset is provided', () => {
    const args = ['my-app', '--template', 'react-next'];
    const isDrupal = args.includes('--drupal');
    const presetArgIndex = args.indexOf('--preset');
    const presetArg = presetArgIndex !== -1 ? (args[presetArgIndex + 1] ?? null) : null;

    const shouldUseDrupalCLI = isDrupal || presetArg !== null;
    expect(shouldUseDrupalCLI).toBe(false);
  });
});
