import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { helixBanner } from '../cli/banner.js';

const _require = createRequire(import.meta.url);
const pkg = _require('../../package.json') as { version: string };

/** Strip ANSI CSI escape sequences for visual-width measurement. */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Force `process.stdout.isTTY` to true for the duration of a test so the
 * banner renders. The CLI suppresses the banner outside a TTY (pipes, CI,
 * file redirects) — vitest itself usually runs without a TTY.
 */
function withTty<T>(fn: () => T): T {
  const original = process.stdout.isTTY;
  Object.defineProperty(process.stdout, 'isTTY', {
    value: true,
    configurable: true,
    writable: true,
  });
  try {
    return fn();
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: original,
      configurable: true,
      writable: true,
    });
  }
}

describe('helixBanner — suppression contract', () => {
  it('returns [] when asJson is true (even in a TTY)', () => {
    withTty(() => {
      expect(helixBanner({ asJson: true })).toEqual([]);
    });
  });

  it('returns [] when suppressed is true (e.g. --quiet)', () => {
    withTty(() => {
      expect(helixBanner({ suppressed: true })).toEqual([]);
    });
  });

  it('returns [] when stdout is not a TTY (pipe / CI / redirect)', () => {
    // Default vitest environment has isTTY=undefined which is falsy. Force
    // it explicitly to false in case the runner ever sets it.
    const original = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
      writable: true,
    });
    try {
      expect(helixBanner()).toEqual([]);
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: original,
        configurable: true,
        writable: true,
      });
    }
  });

  it('returns lines when in a TTY with no suppression flags', () => {
    withTty(() => {
      const lines = helixBanner();
      expect(lines.length).toBeGreaterThan(0);
    });
  });
});

describe('helixBanner — dimensional invariants', () => {
  // The banner emits a box (top + content + bottom borders) followed by an
  // empty trailer line. The box lines share equal visual width; the
  // trailer line is empty by design. The optional update-footer (when
  // latestNpmVersion is newer) lives below the box and is exempt from the
  // equal-width invariant — see the dedicated tests below.

  it('all box lines have equal visual width after stripping ANSI', () => {
    withTty(() => {
      const lines = helixBanner();
      // Discard the trailing empty line(s) — only box lines participate.
      const boxLines = lines.filter((l) => stripAnsi(l).length > 0);
      expect(boxLines.length).toBeGreaterThan(0);
      const widths = boxLines.map((l) => stripAnsi(l).length);
      const first = widths[0];
      for (const w of widths) {
        expect(w).toBe(first);
      }
    });
  });

  it('no line has trailing whitespace', () => {
    withTty(() => {
      const lines = helixBanner();
      for (const line of lines) {
        const stripped = stripAnsi(line);
        // Empty lines are fine; check that non-empty lines do not end in
        // ASCII space.
        if (stripped.length > 0) {
          expect(stripped.endsWith(' ')).toBe(false);
        }
      }
    });
  });

  it('max visual width is ≤ 80 columns at default size', () => {
    withTty(() => {
      const lines = helixBanner();
      for (const line of lines) {
        expect(stripAnsi(line).length).toBeLessThanOrEqual(80);
      }
    });
  });

  it('respects a custom width option (clamped to ≤80)', () => {
    withTty(() => {
      const lines = helixBanner({ width: 64 });
      const boxLines = lines.filter((l) => stripAnsi(l).length > 0);
      const firstWidth = stripAnsi(boxLines[0]).length;
      // outer width = 64 → every box line should be 64.
      expect(firstWidth).toBe(64);
    });
  });
});

describe('helixBanner — content', () => {
  it('contains the HELiX wordmark', () => {
    withTty(() => {
      const lines = helixBanner();
      const joined = lines.map(stripAnsi).join('\n');
      expect(joined).toContain('HELiX');
    });
  });

  it(`contains the current version v${pkg.version}`, () => {
    withTty(() => {
      const lines = helixBanner();
      const joined = lines.map(stripAnsi).join('\n');
      expect(joined).toContain(`v${pkg.version}`);
    });
  });

  it('contains the design-system-factory tagline', () => {
    withTty(() => {
      const lines = helixBanner();
      const joined = lines.map(stripAnsi).join('\n');
      expect(joined).toMatch(/Design-system factory/);
    });
  });
});

describe('helixBanner — update-available footer', () => {
  it('includes the "Update available" footer when latestNpmVersion is newer', () => {
    withTty(() => {
      const lines = helixBanner({ latestNpmVersion: '99.0.0' });
      const joined = lines.map(stripAnsi).join('\n');
      expect(joined).toContain('Update available');
      expect(joined).toContain('99.0.0');
      expect(joined).toContain('npm i -g create-helix');
    });
  });

  it('does NOT include the footer when latestNpmVersion is older', () => {
    withTty(() => {
      const lines = helixBanner({ latestNpmVersion: '0.0.1' });
      const joined = lines.map(stripAnsi).join('\n');
      expect(joined).not.toContain('Update available');
    });
  });

  it('does NOT include the footer when latestNpmVersion equals current', () => {
    withTty(() => {
      const lines = helixBanner({ latestNpmVersion: pkg.version });
      const joined = lines.map(stripAnsi).join('\n');
      expect(joined).not.toContain('Update available');
    });
  });

  it('does NOT include the footer when latestNpmVersion is omitted', () => {
    withTty(() => {
      const lines = helixBanner();
      const joined = lines.map(stripAnsi).join('\n');
      expect(joined).not.toContain('Update available');
    });
  });
});
