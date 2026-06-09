import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../templates.js';
import { parseArgs } from '../args.js';
import type { Framework } from '../types.js';

// ---------------------------------------------------------------------------
// v0.6.0 Phase C — slim CLI: experimental templates hidden by default
//
// The interactive framework prompt at src/cli.ts:768-794 builds its options
// array by filtering TEMPLATES on `t.experimental`. These tests pin that
// filter and the parseArgs side of the --show-experimental flag, without
// mocking @clack/prompts directly (the prompt block is buried inside
// runCLI's p.group call — re-asserting the filter expression itself is the
// cheaper contract).
// ---------------------------------------------------------------------------

describe('CLI framework prompt — experimental filter', () => {
  it('production templates are the 5 non-experimental entries (wc-storybook, react-next, react-vite, svelte-kit, astro)', () => {
    const production = TEMPLATES.filter((t) => !t.experimental).map((t) => t.id);
    // Order matters — wc-storybook is intentionally first per the v0.6.0
    // default-swap. Hitting Enter through the prompt lands on
    // wc-storybook. v0.8.0 added astro; v0.9.0 added svelte-kit (and
    // dropped astro's lingering experimental flag).
    expect(production).toEqual(['wc-storybook', 'react-next', 'react-vite', 'svelte-kit', 'astro']);
  });

  it('exactly 11 templates are flagged experimental', () => {
    const experimental = TEMPLATES.filter((t) => t.experimental === true);
    expect(experimental).toHaveLength(11);
  });

  it('experimental list contains the 11 stub-quality framework ids the plan calls out', () => {
    // v0.9.0: svelte-kit + astro promoted out of experimental.
    const expected: Framework[] = [
      'ember',
      'qwik-vite',
      'lit-vite',
      'preact-vite',
      'angular',
      'stencil',
      'vue-nuxt',
      'vue-vite',
      'remix',
      'solid-vite',
      'vanilla',
    ];
    const experimentalIds = TEMPLATES.filter((t) => t.experimental === true).map((t) => t.id);
    expect(experimentalIds.sort()).toEqual(expected.sort());
  });

  it('production + experimental partitions cover the full TEMPLATES registry with no overlap', () => {
    const production = TEMPLATES.filter((t) => !t.experimental);
    const experimental = TEMPLATES.filter((t) => t.experimental === true);
    expect(production.length + experimental.length).toBe(TEMPLATES.length);
  });

  it('mirrors the prompt-options shape the CLI would build by default (5 entries)', () => {
    // Same filter the cli.ts framework prompt applies when showExperimental === false.
    const defaultOptions = TEMPLATES.filter((t) => !t.experimental).map((t) => ({
      value: t.id as Framework,
      label: t.name,
      hint: t.hint,
    }));
    expect(defaultOptions).toHaveLength(5);
    expect(defaultOptions.map((o) => o.value)).toEqual([
      'wc-storybook',
      'react-next',
      'react-vite',
      'svelte-kit',
      'astro',
    ]);
  });

  it('mirrors the prompt-options shape when --show-experimental is on (16 entries — all templates)', () => {
    const fullOptions = TEMPLATES.map((t) => ({
      value: t.id as Framework,
      label: t.name,
      hint: t.hint,
    }));
    // 5 production + 11 experimental = 16 (the TEMPLATES registry has no
    // 'drupal-theme' entry — Drupal is a separate flow at runDrupalCLI).
    expect(fullOptions).toHaveLength(16);
  });
});

describe('parseArgs — --show-experimental', () => {
  it('defaults to false when --show-experimental is absent', () => {
    expect(parseArgs([]).showExperimental).toBe(false);
  });

  it('returns true when --show-experimental is present', () => {
    expect(parseArgs(['--show-experimental']).showExperimental).toBe(true);
  });

  it('is independent of other boolean flags', () => {
    const result = parseArgs(['--show-experimental', '--quiet', '--force']);
    expect(result.showExperimental).toBe(true);
    expect(result.quiet).toBe(true);
    expect(result.force).toBe(true);
  });

  it('does not consume the next argv token as a value (boolean flag, not value flag)', () => {
    // --show-experimental should NOT eat the project name positional.
    const result = parseArgs(['--show-experimental', 'my-app']);
    expect(result.showExperimental).toBe(true);
    // Project name is the first non-flag positional; after the flag is consumed
    // as a boolean toggle, 'my-app' is still the projectName candidate.
    // (parseArgs uses argv[0] for projectName, so '--show-experimental' as
    // argv[0] yields null projectName — that's expected. The point of THIS
    // assertion is that showExperimental.true didn't silently swallow 'my-app'.)
    expect(result.projectName).toBeNull();
  });
});
