import { describe, it, expect } from 'vitest';
import { parseArgs } from '../args.js';

// ---------------------------------------------------------------------------
// v0.6.0 Phase C — friendly error when --template selects a hidden
// experimental template. The error MUST name --show-experimental inline
// (DXA Q3 triple-discoverability point #2) so the consumer doesn't have to
// hunt through --help to find the escape valve.
// ---------------------------------------------------------------------------

describe('parseArgs — --template with hidden experimental template', () => {
  it('throws a friendly error including --show-experimental for svelte-kit', () => {
    expect(() => parseArgs(['--template', 'svelte-kit'])).toThrow(/--show-experimental/);
  });

  it('error message names the experimental template id explicitly', () => {
    expect(() => parseArgs(['--template', 'svelte-kit'])).toThrow(/svelte-kit/);
    expect(() => parseArgs(['--template', 'ember'])).toThrow(/ember/);
    expect(() => parseArgs(['--template', 'stencil'])).toThrow(/stencil/);
  });

  it('error message lists the production fallback templates', () => {
    // The friendly redirect spells out the 3 production options inline so
    // the consumer can pick one without re-running `create-helix list`.
    expect(() => parseArgs(['--template', 'svelte-kit'])).toThrow(/wc-storybook/);
    expect(() => parseArgs(['--template', 'svelte-kit'])).toThrow(/react-next/);
    expect(() => parseArgs(['--template', 'svelte-kit'])).toThrow(/react-vite/);
  });

  it('every experimental template trips the friendly error path', () => {
    const experimentalIds = [
      'svelte-kit',
      'ember',
      'qwik-vite',
      'lit-vite',
      'preact-vite',
      'angular',
      'stencil',
      'vue-nuxt',
      'vue-vite',
      'remix',
      'astro',
      'solid-vite',
      'vanilla',
    ];
    for (const id of experimentalIds) {
      expect(() => parseArgs(['--template', id])).toThrow(/--show-experimental/);
    }
  });

  it('uses "experimental" (not just "hidden") so the term shows up in error logs', () => {
    expect(() => parseArgs(['--template', 'astro'])).toThrow(/experimental/);
  });

  it('production templates still parse cleanly (no false-positive error)', () => {
    expect(parseArgs(['--template', 'wc-storybook']).template).toBe('wc-storybook');
    expect(parseArgs(['--template', 'react-next']).template).toBe('react-next');
    expect(parseArgs(['--template', 'react-vite']).template).toBe('react-vite');
  });

  it('experimental template + --show-experimental flag parses cleanly', () => {
    // The flag is the documented escape valve. With it on, parseArgs must
    // accept the hidden template without the friendly redirect kicking in.
    expect(parseArgs(['--show-experimental', '--template', 'svelte-kit']).template).toBe(
      'svelte-kit',
    );
    expect(parseArgs(['--show-experimental', '--template', 'ember']).template).toBe('ember');
  });

  it('totally-bogus template ids still produce the legacy "Invalid template" error', () => {
    // Existing test surface from args.test.ts — the new friendly redirect
    // applies ONLY to known-but-hidden template ids; gibberish still falls
    // through to the original error so behavior for typos is unchanged.
    expect(() => parseArgs(['--template', 'django'])).toThrow(/Invalid template/);
    expect(() => parseArgs(['--template', 'django'])).not.toThrow(/--show-experimental/);
  });
});
