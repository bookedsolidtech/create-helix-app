/**
 * helixBanner — TUI banner helper (v0.6.0 Phase D).
 *
 * Returns an array of fully-styled lines (ANSI escapes included). Caller
 * decides how to render — typically `helixBanner(...).forEach(console.log)`.
 *
 * Suppression contract:
 *   - `opts.asJson === true`           → return []
 *   - `opts.suppressed === true`       → return []   (e.g. --quiet)
 *   - `!process.stdout.isTTY`          → return []   (pipes, CI, redirects)
 *
 * Dimensional invariants (pinned in src/__tests__/cli-banner.test.ts):
 *   1. Every emitted line has the same visual width after stripping ANSI
 *      escapes — equal-width box drawing across the whole banner.
 *   2. No trailing whitespace on any line.
 *   3. Max visual width is ≤ 80 cols (default width is 56).
 *   4. Suppression returns [] exactly.
 *
 * Branding: the `HELiX` wordmark gets an ANSI 256 cyan-blue gradient
 * (51 → 27) when `process.stdout.hasColors(256)` is true, otherwise it
 * falls back to a single-color bold cyan. The gradient is inlined — no
 * extra dependency.
 */

import pc from 'picocolors';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
const pkg = _require('../../package.json') as { version: string };
const HELIX_VERSION = pkg.version;

const DEFAULT_WIDTH = 56;
const MAX_WIDTH = 80;
const INNER_PAD = 2; // spaces on each side inside the box

// Tagline alternatives. If the long form would overflow the inner content
// width (innerWidth - 4 columns of breathing room), we fall back to the
// short form. The short form fits comfortably in a 56-col box.
const TAGLINE_LONG = 'Design-system factory + Storybook + every-framework starter';
const TAGLINE_SHORT = 'Design-system factory + every-framework starter';

// ANSI 256 cyan-blue gradient sampled for HELiX wordmark (5 glyphs).
// Bright cyan → deeper blue. Each entry is a foreground 256-color code.
const HELIX_GRADIENT_256 = [51, 45, 39, 33, 27] as const;

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;

function color256(code: number): string {
  return `${ESC}[38;5;${code}m`;
}

/** Visible-character length, ignoring ANSI CSI escape sequences. */
function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function repeat(ch: string, n: number): string {
  return n > 0 ? ch.repeat(n) : '';
}

/**
 * Detect 256-color terminal support. Wrapped in try/catch because
 * `process.stdout.hasColors` is optional on older runtimes and the call
 * itself can throw under some test harnesses that stub stdout.
 */
function supports256Color(): boolean {
  try {
    const stdout = process.stdout as NodeJS.WriteStream & {
      hasColors?: (count?: number) => boolean;
    };
    if (typeof stdout.hasColors === 'function') {
      return stdout.hasColors(256) === true;
    }
  } catch {
    // fall through
  }
  return false;
}

/** Render the HELiX wordmark with a 256-color gradient or single-color fallback. */
function renderWordmark(): string {
  const text = 'HELiX';
  if (supports256Color()) {
    let out = BOLD;
    for (let i = 0; i < text.length; i += 1) {
      out += color256(HELIX_GRADIENT_256[i] ?? 51) + text[i];
    }
    out += RESET;
    return out;
  }
  return pc.cyan(pc.bold(text));
}

/**
 * Construct a single box line, padding the styled content to the exact
 * inner width with trailing spaces, then wrapping in cyan │ borders.
 *
 * `content` may include ANSI escapes; we measure visible width and pad
 * accordingly so the closing │ aligns.
 */
function boxLine(content: string, innerWidth: number): string {
  const visible = visibleLength(content);
  const padRight = Math.max(0, innerWidth - visible);
  return pc.cyan('│') + content + repeat(' ', padRight) + pc.cyan('│');
}

export interface BannerOptions {
  /** Visual columns of the box (outer width). Default 56. Clamped to ≤80. */
  width?: number;
  /** When true, suppress entirely (JSON-mode output). */
  asJson?: boolean;
  /** Explicit suppress (--quiet). */
  suppressed?: boolean;
  /**
   * When set and strictly greater than the current package version, an
   * "Update available" footer is appended below the box.
   */
  latestNpmVersion?: string;
}

/** Simple semver `latest > current` comparison (MAJOR.MINOR.PATCH only). */
function isStrictlyNewer(current: string, latest: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const parts = v
      .replace(/^v/, '')
      .split('.')
      .map((n) => Number.parseInt(n, 10));
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [cMaj, cMin, cPat] = parse(current);
  const [lMaj, lMin, lPat] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

/**
 * Compose the banner. Returns [] when suppressed; otherwise returns the
 * lines (including the trailing empty line below the box and, when
 * applicable, the version-check footer).
 */
export function helixBanner(opts: BannerOptions = {}): string[] {
  if (opts.asJson === true) return [];
  if (opts.suppressed === true) return [];
  if (!process.stdout.isTTY) return [];

  const requestedWidth = opts.width ?? DEFAULT_WIDTH;
  const outerWidth = Math.min(Math.max(requestedWidth, 16), MAX_WIDTH);
  // Inner width = outer minus the two │ border columns.
  const innerWidth = outerWidth - 2;
  // Content width = inner width minus left/right padding.
  const contentWidth = innerWidth - INNER_PAD * 2;

  // Border lines.
  const top = pc.cyan('╭' + repeat('─', innerWidth) + '╮');
  const bottom = pc.cyan('╰' + repeat('─', innerWidth) + '╯');
  const empty = boxLine(repeat(' ', innerWidth), innerWidth);

  // Wordmark centered.
  const wordmark = renderWordmark();
  const wmVisible = visibleLength(wordmark);
  const wmLeftPad = Math.max(0, Math.floor((contentWidth - wmVisible) / 2));
  const wordmarkInner = repeat(' ', INNER_PAD) + repeat(' ', wmLeftPad) + wordmark;

  // Tagline (fall back to short form if long form would overflow).
  const taglineRaw = TAGLINE_LONG.length <= contentWidth ? TAGLINE_LONG : TAGLINE_SHORT;
  const tagline = pc.dim(taglineRaw);
  // Centered as well.
  const tagVisible = taglineRaw.length;
  const tagLeftPad = Math.max(0, Math.floor((contentWidth - tagVisible) / 2));
  const taglineInner = repeat(' ', INNER_PAD) + repeat(' ', tagLeftPad) + tagline;

  // Version line — left-aligned at content start.
  const versionText = `v${HELIX_VERSION}`;
  const versionInner = repeat(' ', INNER_PAD) + pc.dim(versionText);

  const lines: string[] = [
    top,
    empty,
    boxLine(wordmarkInner, innerWidth),
    boxLine(taglineInner, innerWidth),
    boxLine(versionInner, innerWidth),
    empty,
    bottom,
    '',
  ];

  // Version-check footer (only when latest is strictly newer).
  if (
    typeof opts.latestNpmVersion === 'string' &&
    opts.latestNpmVersion.length > 0 &&
    isStrictlyNewer(HELIX_VERSION, opts.latestNpmVersion)
  ) {
    const footer = pc.yellow(
      `  Update available: ${HELIX_VERSION} → ${opts.latestNpmVersion} (${pc.dim(
        'npm i -g create-helix',
      )})`,
    );
    lines.push(footer);
  }

  // Trim trailing whitespace on every line as a safety belt. The padding
  // logic should never produce trailing spaces, but if a future edit slips
  // a stray space past the closing border we want the test to surface it
  // — not paper over it here. So instead of trimming, we ASSERT in tests.
  return lines;
}
