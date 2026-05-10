/**
 * wc-storybook React-helper emitters.
 *
 * Each exported function returns the source string that scaffold.ts writes
 * into the consumer's `src/stories/_components/` directory. Lifted verbatim
 * from `helix/apps/storybook/stories/_components/` (MIT, same copyright
 * holder — Clarity House LLC). Refs: shimmying-roaming-kernighan plan,
 * Phase 1.
 *
 * Hardcoded `--hx-color-` prefixes are intentional: those reference the
 * upstream HelixUI token namespace which the consumer's brand layer
 * cascades through, NOT the consumer's own `tokenPrefix`.
 *
 * TokenRef is included alongside the seven plan-listed helpers because
 * ContrastMatrix imports it; it is small, pure, and shares the same
 * docs-surface scope.
 */

export function contrastSrc(): string {
  return `/**
 * WCAG 2.1 relative-luminance contrast computation. Used by the docs
 * MDX components to print inline contrast ratios on surface cards and
 * AAA cert badges.
 *
 * The formula is the standard sRGB-relative-luminance computation from
 * WCAG 2.x §1.4.3 / §1.4.6:
 *   L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * where each channel is gamma-decoded to linear-light first.
 *
 * Returns 1.0 (no contrast) for malformed input rather than throwing —
 * docs MDX should never crash because a single token reference resolved
 * to something unparsable.
 */

function parseHex(input: string): { r: number; g: number; b: number } | null {
  const clean = input.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16);
    const g = parseInt(clean[1]! + clean[1]!, 16);
    const b = parseInt(clean[2]! + clean[2]!, 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b };
  }
  if (clean.length === 6 || clean.length === 8) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b };
  }
  return null;
}

function parseRgb(input: string): { r: number; g: number; b: number } | null {
  // Browsers normalize getComputedStyle color values to either
  //   rgb(R, G, B)
  //   rgba(R, G, B, A)
  //   rgb(R G B)              (color-4 syntax in newer engines)
  //   rgb(R G B / A)          (color-4 syntax in newer engines)
  // Match all four with a permissive regex, bytes only (we ignore alpha
  // because contrast computation here assumes opaque foreground/background;
  // tokens are designed against opaque surfaces).
  const match = /rgba?\\(\\s*(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/i.exec(input.trim());
  if (!match) return null;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  if ([r, g, b].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return { r, g, b };
}

/**
 * Normalize an arbitrary CSS color string to an uppercase \`#RRGGBB\` hex
 * value. Accepts hex (\`#RGB\`, \`#RRGGBB\`, \`#RRGGBBAA\`) and rgb()/rgba()
 * forms — the two shapes \`getComputedStyle\` produces for resolved tokens
 * across every browser we care about. Returns the empty string when the
 * value cannot be parsed; callers must handle that path explicitly.
 */
export function cssColorToHex(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const rgb = trimmed.startsWith('#') ? parseHex(trimmed) : parseRgb(trimmed);
  if (!rgb) return '';
  const toHex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
  return \`#\${toHex(rgb.r)}\${toHex(rgb.g)}\${toHex(rgb.b)}\`;
}

function channelLuminance(byte: number): number {
  const c = byte / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(value: string): number {
  const trimmed = value.trim();
  const rgb = trimmed.startsWith('#')
    ? parseHex(trimmed)
    : (parseRgb(trimmed) ?? parseHex(trimmed));
  if (!rgb) return 0;
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/**
 * WCAG contrast ratio between two CSS color values. Accepts hex
 * (\`#RGB\`, \`#RRGGBB\`) or \`rgb()\`/\`rgba()\` strings — both shapes are
 * produced by \`getComputedStyle\` when reading resolved CSS custom
 * properties. Returns 1.0 when either value cannot be parsed.
 */
export function contrastRatio(colorA: string, colorB: string): number {
  const a = relativeLuminance(colorA);
  const b = relativeLuminance(colorB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Classify a contrast ratio against WCAG 2.1 thresholds:
 *   AAA       — ≥ 7.0 (normal text)
 *   AA        — ≥ 4.5 (normal text)
 *   AA-large  — ≥ 3.0 (large text / non-text UI)
 *   Fail      — below 3.0
 */
export function gradeRatio(ratio: number): 'AAA' | 'AA' | 'AA-large' | 'Fail' {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'Fail';
}
`;
}

export function useResolvedTokenSrc(): string {
  return `import * as React from 'react';

/**
 * React hooks for reading resolved CSS custom property values from the
 * active cascade.
 *
 * These hooks exist because the docs MDX components (TokenSwatchGrid,
 * SurfaceCard, ContrastMatrix) used to read tokens at module-evaluation
 * time from \`@helixui/tokens\`'s static \`tokenEntries\`/\`tokenMap\`. That
 * shape only reflects the Apex/light defaults — when the Storybook
 * toolbar flips brand→Meridian or theme→dark, the *swatch backgrounds*
 * change (because the underlying \`var(--hx-color-*)\` is reactive in CSS)
 * but the *displayed hex labels* and *computed contrast ratios* stay
 * frozen at the build-time defaults.
 *
 * Reading from \`getComputedStyle(document.documentElement)\` instead
 * lets the labels follow the toolbar live. A MutationObserver on the
 * \`data-theme\` and \`data-brand\` attributes (which the preview / manager
 * head scripts toggle on \`<html>\`) is the cheapest way to be notified
 * when the cascade has changed, without polling on every paint.
 *
 * SSR / build-time:
 *   Storybook's MDX docs render is client-only, but the Vite build still
 *   evaluates these modules during prerender. All DOM access is guarded
 *   by \`typeof window === 'undefined'\` and lazy-initialized so the hook
 *   never reaches for \`document\`/\`window\` outside the browser.
 */

const CASCADE_ATTRS = ['data-theme', 'data-brand'];

/**
 * Heuristic: a token name that looks like a color reference. Aliased color
 * tokens (e.g. \`--hx-color-primary-500: var(--apex-primary-500)\`) require
 * the render-and-measure probe below — \`getPropertyValue\` returns the literal
 * \`var(...)\` chain, not the resolved color. Non-color tokens (spacing,
 * radius, font-size, …) are scalar lengths/strings and read fine via
 * \`getPropertyValue\`.
 */
function isColorToken(tokenName: string): boolean {
  // Three rules:
  //   1. \`color-…\` namespace tokens (semantic + primitive ramps).
  //   2. \`bg-…\` / \`fg-…\` shorthand tokens — these are always color values.
  //   3. Any token containing \`-color-\` (e.g. \`--hx-border-color-default\`,
  //      \`--hx-shadow-color-strong\`).
  // The previous broad alternation \`(bg|fg|border|shadow|outline)-\` was wrong:
  // \`--hx-shadow-md\` resolves to a box-shadow string, \`--hx-border-width-thin\`
  // to a length — both invalid as \`color: var(--…)\`. The probe path silently
  // falls back to the inherited \`color\` and returns the wrong rgb() triplet.
  return (
    /(^|--hx-)color-/i.test(tokenName) ||
    /(^|-)(bg|fg)-/i.test(tokenName) ||
    /-color-/i.test(tokenName)
  );
}

/**
 * Resolve an aliased CSS custom property to its computed \`rgb(...)\` value
 * by mounting a hidden probe element, applying \`color: var(<token>)\`, and
 * reading \`getComputedStyle(probe).color\`. Browsers fully resolve var()
 * chains for actual rendered properties, so even multi-hop aliases come
 * back as \`rgb(r, g, b)\` (or \`rgba(...)\`) — directly consumable by the
 * \`parseRgb\` helper in \`contrast.ts\`.
 *
 * The probe is mounted under \`target\` (default \`document.body\`) so it
 * inherits the same cascade as the consuming element, then removed
 * synchronously in a \`finally\` block.
 */
function probeColorToken(tokenName: string, target: HTMLElement | null): string {
  if (typeof window === 'undefined') return '';
  const host = target ?? document.body;
  if (!host) return '';
  const probe = document.createElement('span');
  probe.style.color = \`var(\${tokenName})\`;
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.width = '0';
  probe.style.height = '0';
  host.appendChild(probe);
  try {
    return getComputedStyle(probe).color || '';
  } finally {
    probe.remove();
  }
}

function readToken(tokenName: string, target: HTMLElement | null): string {
  if (typeof window === 'undefined') return '';
  if (isColorToken(tokenName)) {
    const resolved = probeColorToken(tokenName, target);
    if (resolved) return resolved;
    // Fall through if probe failed (e.g. document.body not yet available).
  }
  const el = target ?? document.documentElement;
  return getComputedStyle(el).getPropertyValue(tokenName).trim();
}

/**
 * Subscribe to the resolved value of a single CSS custom property in
 * the active cascade. Returns the empty string during SSR.
 */
export function useResolvedToken(tokenName: string, target?: HTMLElement | null): string {
  const [value, setValue] = React.useState<string>(() => readToken(tokenName, target ?? null));

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      setValue(readToken(tokenName, target ?? null));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: CASCADE_ATTRS,
    });
    return () => observer.disconnect();
  }, [tokenName, target]);

  return value;
}

/**
 * Subscribe to a stable list of CSS custom properties. Returns a frozen
 * array of resolved values whose indexes mirror the input. Re-reads on
 * every \`data-theme\` / \`data-brand\` mutation on \`<html>\`.
 *
 * Pass a referentially stable token list (via \`useMemo\` in the caller)
 * to avoid re-subscribing on every render.
 */
export function useResolvedTokens(
  tokenNames: readonly string[],
  target?: HTMLElement | null,
): readonly string[] {
  const [values, setValues] = React.useState<readonly string[]>(() =>
    tokenNames.map((name) => readToken(name, target ?? null)),
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      setValues(tokenNames.map((name) => readToken(name, target ?? null)));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: CASCADE_ATTRS,
    });
    return () => observer.disconnect();
    // tokenNames is a readonly array; callers are expected to memoize it.
  }, [tokenNames, target]);

  return values;
}

/**
 * One-shot synchronous read for non-React call sites that already know
 * they're inside an effect. Returns the empty string during SSR.
 */
export function readResolvedToken(tokenName: string, target?: HTMLElement | null): string {
  return readToken(tokenName, target ?? null);
}
`;
}

export function ratioCardSrc(): string {
  return `import * as React from 'react';

/**
 * Contrast ratio card — pair label, big numeric ratio, color-coded grade pill.
 *
 * Wrap in \`<div className="hx-docs-ratio-grid">…</div>\` for the auto-fit grid.
 */
export type ContrastGrade = 'AAA' | 'AA' | 'AA-large' | 'Fail';

export interface RatioCardProps {
  /** Token pair label (e.g. \`text.primary on surface.default\`). */
  pair: string;
  /** Computed contrast ratio (e.g. \`19.6\`). */
  ratio: number;
  /** WCAG grade — drives the pill color. */
  grade: ContrastGrade;
  /** Optional context line below the ratio (e.g. \`body text · 14px\`). */
  context?: string;
}

export function RatioCard({ pair, ratio, grade, context }: RatioCardProps) {
  return (
    <div className="hx-docs-ratio-card">
      <span className="hx-docs-grade-pill" data-grade={grade}>
        {grade}
      </span>
      <div className="hx-docs-ratio-num">
        {ratio.toFixed(ratio >= 10 ? 1 : 2)}
        <small>:1</small>
      </div>
      <div className="hx-docs-ratio-pair">{pair}</div>
      {context ? <div className="hx-docs-ratio-pair">{context}</div> : null}
    </div>
  );
}
`;
}

export function tokenSwatchGridSrc(): string {
  return `import * as React from 'react';
import { cssColorToHex } from './contrast';
import { useResolvedTokens } from './useResolvedToken';

/**
 * 11-stop ramp grid. Reads tokens from the *active CSS cascade* via
 * \`getComputedStyle(document.documentElement)\` and renders one swatch
 * per stop with click-to-copy of the var() reference and computed-contrast
 * legibility (light text on dark stops, dark text on light stops).
 *
 * The hex values displayed in each swatch are resolved live whenever the
 * Storybook toolbar flips \`data-theme\` or \`data-brand\` on \`<html>\`, so
 * brand→Meridian and theme→dark both update the printed labels in step
 * with the swatch backgrounds. Earlier revisions read tokenEntries at
 * build time and showed Apex/light defaults regardless of the active
 * cascade, which made the AAA-cert color page misleading.
 */

const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const LIGHT_STOPS = new Set<number>([50, 100, 200, 300, 400]);

export interface TokenSwatchGridProps {
  /** Ramp role (e.g. \`primary\`, \`neutral\`, \`success\`). */
  ramp: string;
  /** Override the displayed label (defaults to capitalized ramp). */
  label?: string;
}

function copyToken(tokenName: string, swatchEl: HTMLElement | null) {
  const value = \`var(\${tokenName})\`;
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(value).catch(() => {});
  }
  if (swatchEl) {
    swatchEl.classList.add('is-copied');
    window.setTimeout(() => swatchEl.classList.remove('is-copied'), 800);
  }
}

export function TokenSwatchGrid({ ramp, label }: TokenSwatchGridProps) {
  const tokenNames = React.useMemo(() => STOPS.map((stop) => \`--hx-color-\${ramp}-\${stop}\`), [ramp]);
  // Live-cascade read: updates on data-theme / data-brand mutation.
  const resolvedValues = useResolvedTokens(tokenNames);
  const displayLabel = label ?? ramp.charAt(0).toUpperCase() + ramp.slice(1);

  return (
    <div className="hx-docs-ramp-row">
      <div className="hx-docs-ramp-label">
        {displayLabel}
        <small>--hx-color-{ramp}-*</small>
      </div>
      {STOPS.map((stop, index) => {
        const tokenName = tokenNames[index]!;
        const resolved = resolvedValues[index] ?? '';
        const hex = cssColorToHex(resolved);
        const isLight = LIGHT_STOPS.has(stop);
        return (
          <button
            key={stop}
            type="button"
            className="hx-docs-swatch"
            data-light={isLight ? 'true' : 'false'}
            style={{ background: \`var(\${tokenName})\` }}
            title={\`Copy var(\${tokenName})\`}
            onClick={(event) => copyToken(tokenName, event.currentTarget)}
          >
            <div>
              <div className="hx-docs-swatch-step">{stop}</div>
              <div className="hx-docs-swatch-hex">{hex || '—'}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
`;
}

export function tokenRefSrc(): string {
  return `import * as React from 'react';

/**
 * TokenRef — inline click-to-copy chip for a token reference.
 *
 * Renders as a button styled to look like inline code. Click copies
 * \`var(<token>)\` (default) or the literal \`value\` prop to the clipboard
 * and flashes a "copied" affordance for 800ms.
 *
 * Use this anywhere a token name appears in prose, code blocks, or
 * tables so every token reference on the docs surface is copy-affordable
 * — not just swatches.
 *
 *   <TokenRef token="--hx-color-primary-600" />
 *     → button labelled "--hx-color-primary-600"; copies "var(--hx-color-primary-600)"
 *
 *   <TokenRef token="--hx-color-primary-600" copyValue="--hx-color-primary-600" />
 *     → copies the bare token name (no \`var(...)\` wrapping).
 *
 *   <TokenRef token="hx-button[variant='primary']" copyValue="hx-button[variant='primary']" />
 *     → renders + copies an arbitrary string (selector, snippet).
 */

export interface TokenRefProps {
  /** Token name or arbitrary string to display (e.g. \`--hx-color-primary-600\`). */
  token: string;
  /**
   * Optional override for the clipboard payload. Defaults to \`var(<token>)\`
   * when \`token\` starts with \`--\`, otherwise the bare \`token\` string.
   */
  copyValue?: string;
  /** Optional element variant — \`'inline'\` (default) or \`'block'\` for full-width chip. */
  variant?: 'inline' | 'block';
}

export function TokenRef({ token, copyValue, variant = 'inline' }: TokenRefProps) {
  const [copied, setCopied] = React.useState(false);
  const payload = copyValue ?? (token.startsWith('--') ? \`var(\${token})\` : token);

  const handleCopy = React.useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(payload).catch(() => {});
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 800);
  }, [payload]);

  return (
    <button
      type="button"
      className={\`hx-docs-token-ref\${variant === 'block' ? ' hx-docs-token-ref--block' : ''}\${
        copied ? ' is-copied' : ''
      }\`}
      onClick={handleCopy}
      title={\`Copy \${payload}\`}
      aria-label={\`Copy \${payload} to clipboard\`}
    >
      <span className="hx-docs-token-ref-label">{token}</span>
      <span className="hx-docs-token-ref-state" aria-hidden="true">
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  );
}
`;
}

export function codeBlockSrc(): string {
  return `import * as React from 'react';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

/**
 * Supported Shiki languages for the helix docs surface. Bundle is pinned to
 * the languages we actually author against — every additional grammar adds
 * to the preview iframe weight.
 *
 * If you need to render a language outside this list, add it to the union
 * AND verify it loads correctly via Shiki's \`bundledLanguages\` map (see
 * https://shiki.style/languages).
 */
export type CodeBlockLanguage =
  | 'html'
  | 'js'
  | 'jsx'
  | 'ts'
  | 'tsx'
  | 'css'
  | 'mdx'
  | 'bash'
  | 'json';

/**
 * Theme: github-dark-dimmed (Shiki bundled). Picked over vitesse-dark and
 * tokyo-night because it tracks the de-facto VS Code default for the
 * majority of helix's enterprise audience and produces the lowest-saturation
 * tokens — which keeps focus on prose.
 *
 * Background: #22272e (pulled directly from the theme JSON). The editor
 * chrome below mirrors this hex so Shiki's inline \`background-color\`
 * style aligns with the wrapping header / tab strip.
 */
export const CODE_BLOCK_THEME = 'github-dark-dimmed' as const;
export const CODE_BLOCK_BACKGROUND = '#22272e' as const;

/**
 * Lazy-initialized Shiki highlighter pinned to ONLY the languages/themes we
 * actually use. This avoids pulling Shiki's full bundle (which would ship
 * grammars for wolfram, cpp, emacs-lisp, etc. into the Storybook iframe).
 *
 * Stored as a module-level promise so concurrent CodeBlock mounts share a
 * single highlighter instance (Shiki's grammar registry is expensive).
 *
 * Recovery semantics: if \`createHighlighterCore\` rejects — for instance
 * because the grammar/theme/wasm bundle could not be fetched — we clear
 * the cached promise so the NEXT call retries from scratch rather than
 * handing every future caller the same rejected promise. The catch only
 * resets the cache; it does not swallow the rejection, so the original
 * \`await getHighlighter()\` at the call site still sees the error and
 * falls through to the plain-text fallback in \`CodeBlock\`.
 */
let highlighterPromise: Promise<HighlighterCore> | null = null;
function getHighlighter(): Promise<HighlighterCore> {
  if (highlighterPromise) return highlighterPromise;
  const pending = createHighlighterCore({
    themes: [import('@shikijs/themes/github-dark-dimmed')],
    langs: [
      import('@shikijs/langs/html'),
      import('@shikijs/langs/javascript'),
      import('@shikijs/langs/jsx'),
      import('@shikijs/langs/typescript'),
      import('@shikijs/langs/tsx'),
      import('@shikijs/langs/css'),
      import('@shikijs/langs/mdx'),
      import('@shikijs/langs/bash'),
      import('@shikijs/langs/json'),
    ],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
  highlighterPromise = pending;
  // Clear the cache on rejection so the next mount retries initialization.
  // Use a detached \`.catch\` (not chained back into \`highlighterPromise\`)
  // so callers awaiting the original promise still observe the rejection
  // and fall through to their fallback path.
  pending.catch(() => {
    if (highlighterPromise === pending) {
      highlighterPromise = null;
    }
  });
  // Return the local \`pending\` rather than re-reading \`highlighterPromise\`:
  // the .catch() closure above writes to the outer \`let\`, which invalidates
  // TS strict-mode narrowing — the read would resolve to
  // \`Promise<HighlighterCore> | null\`, not the function's declared return.
  return pending;
}

/**
 * Map our public \`language\` prop union to the underlying Shiki grammar id.
 * \`js\` and \`ts\` are aliases (Shiki ships them under \`javascript\` / \`typescript\`).
 */
const LANG_ALIAS: Record<CodeBlockLanguage, string> = {
  html: 'html',
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  css: 'css',
  mdx: 'mdx',
  bash: 'bash',
  json: 'json',
};

export interface CodeBlockProps {
  /** Source string to highlight. Whitespace preserved verbatim. */
  code: string;
  /** Shiki grammar id. Defaults to \`tsx\` when omitted. */
  language?: CodeBlockLanguage;
  /** Optional filename rendered flush-left in the editor chrome header. */
  filename?: string;
  /** Toggles the copy button. Defaults \`true\`. */
  showCopy?: boolean;
  /**
   * When provided, Shiki output is rendered immediately during SSR/initial
   * paint via this prebuilt HTML string. Reserved for the autodoc Source
   * integration which has access to a synchronous highlighter; MDX consumers
   * can leave this undefined and rely on the async client-side path.
   */
  prerenderedHtml?: string;
}

/**
 * Helix Storybook code-display primitive. Async-renders Shiki output into a
 * dark editor surface with header chrome (filename · language pill · copy).
 * Theme is locked to \`github-dark-dimmed\` regardless of the active Storybook
 * theme — code blocks are always dark, matching Stripe / Vercel / MDN docs.
 *
 * Accessibility:
 * - The copy button has an accessible name ("Copy code") via aria-label and
 *   announces state via aria-live polite region (sr-only span).
 * - \`role="region"\` on the wrapper is ONLY applied when an accessible name
 *   is available (a filename, which becomes the labelledby target). Regions
 *   without an accessible name pollute the AT landmarks tree with anonymous
 *   entries, so we omit the role entirely in that case. When a filename is
 *   present, the labelled region lets AT users skip past code blocks via
 *   landmark navigation.
 * - In \`forced-colors\` mode the chrome reverts to system colors so high-
 *   contrast users still see distinct surfaces; Shiki token colors are
 *   overridden by the UA, which is correct.
 */
export function CodeBlock({
  code,
  language = 'tsx',
  filename,
  showCopy = true,
  prerenderedHtml,
}: CodeBlockProps) {
  const [html, setHtml] = React.useState<string | null>(prerenderedHtml ?? null);
  const [copied, setCopied] = React.useState(false);
  const copyTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (prerenderedHtml) {
      setHtml(prerenderedHtml);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const highlighter = await getHighlighter();
        const out = highlighter.codeToHtml(code, {
          lang: LANG_ALIAS[language],
          theme: CODE_BLOCK_THEME,
        });
        if (!cancelled) setHtml(out);
      } catch {
        // Shiki failed to load grammar/theme — fall back to a plain <pre>
        // so users still see the source rather than a blank skeleton.
        if (!cancelled) {
          setHtml(\`<pre class="shiki" tabindex="0"><code>\${escapeHtml(code)}</code></pre>\`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, language, prerenderedHtml]);

  // Tear down the "copied" state timer on unmount so React state updates
  // don't fire after the component is gone.
  React.useEffect(
    () => () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard write blocked (insecure context, permissions). Silent
      // failure is acceptable here — users can still select the code.
    }
  }, [code]);

  // Wrapper provides the dark surface, header bar, and rounded corners.
  // Shiki's inline \`background-color\` matches CODE_BLOCK_BACKGROUND so the
  // header bar and code surface read as one unit.
  const headerLabelId = React.useId();
  const labelledById = filename ? headerLabelId : undefined;
  // Only assert role="region" when we actually have an accessible name to
  // anchor it to. A region without aria-labelledby / aria-label is an
  // unlabelled landmark — WCAG 2.4.6 / ARIA practice both flag those as
  // noise in the accessibility tree.
  const wrapperRole = labelledById ? 'region' : undefined;

  return (
    <div
      className="hx-docs-code-editor"
      role={wrapperRole}
      aria-labelledby={labelledById}
      data-language={language}
    >
      <div className="hx-docs-code-editor-header">
        <div className="hx-docs-code-editor-filename" id={labelledById}>
          {filename ?? <span className="hx-docs-code-editor-filename-placeholder" aria-hidden />}
        </div>
        <div className="hx-docs-code-editor-meta">
          <span className="hx-docs-code-editor-language">{language}</span>
          {showCopy ? (
            <button
              type="button"
              className="hx-docs-code-editor-copy"
              onClick={onCopy}
              aria-label={copied ? 'Code copied to clipboard' : 'Copy code'}
              data-copied={copied || undefined}
            >
              <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>
              <span className="hx-docs-sr-only" aria-live="polite">
                {copied ? 'Code copied to clipboard' : ''}
              </span>
            </button>
          ) : null}
        </div>
      </div>
      <div
        className="hx-docs-code-editor-body"
        // Shiki output is server-trusted (we own the input string and the
        // grammar). dangerouslySetInnerHTML is the documented integration
        // path — the rendered HTML is a deliberately limited <pre><code>
        // tree with span class names for token colors.
        dangerouslySetInnerHTML={
          html
            ? { __html: html }
            : { __html: \`<pre class="shiki shiki-loading"><code>\${escapeHtml(code)}</code></pre>\` }
        }
      />
    </div>
  );
}

/**
 * Minimal HTML entity escape for the loading-state fallback. Shiki's own
 * output is already escaped — this only covers the pre-highlighter paint.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
`;
}

export function codeTabsSrc(): string {
  return `import * as React from 'react';
import { CodeBlock, type CodeBlockLanguage } from './CodeBlock';

/**
 * One entry in a \`<CodeTabs>\` strip. Mirrors \`CodeBlockProps\` with the
 * label that drives the tab UI.
 */
export interface CodeTab {
  /** Visible label on the tab pill (e.g. "React", "HTML", "Web Component"). */
  label: string;
  /** Shiki language id for syntax highlighting. */
  language: CodeBlockLanguage;
  /** Source string for this tab. */
  code: string;
  /** Optional filename, rendered in the editor chrome below the tab strip. */
  filename?: string;
}

export interface CodeTabsProps {
  /** Tabs to render. Order is the visual tab strip order. */
  tabs: CodeTab[];
  /** Index of the tab to show on first render. Clamped to a valid range. */
  defaultTab?: number;
  /**
   * When provided, the active tab is persisted to localStorage and reflected
   * in the URL via \`?codetab-{persistKey}=…\`. Cross-page tabs sharing the
   * same key sync — e.g. a "React vs HTML" preference applies everywhere.
   */
  persistKey?: string;
  /** Toggles the copy button on the active tab's CodeBlock. */
  showCopy?: boolean;
}

/**
 * Resolve the initial tab index using (URL > localStorage > defaultTab > 0).
 * SSR-safe: returns the default during the first render and the effect
 * below promotes the persisted value once the client has hydrated.
 */
function resolveInitialIndex(
  tabs: CodeTab[],
  defaultTab: number | undefined,
  persistKey: string | undefined,
): number {
  const fallback = clampIndex(defaultTab ?? 0, tabs.length);
  if (typeof window === 'undefined' || !persistKey) return fallback;

  // 1. URL query param wins (deep links should override stored prefs).
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get(\`codetab-\${persistKey}\`);
    if (fromUrl != null) {
      const idx = matchTabByLabel(tabs, fromUrl);
      if (idx >= 0) return idx;
    }
  } catch {
    /* ignore — fall through */
  }

  // 2. localStorage shadow.
  try {
    const stored = window.localStorage.getItem(\`helix:storybook:codetab:\${persistKey}\`);
    if (stored != null) {
      const idx = matchTabByLabel(tabs, stored);
      if (idx >= 0) return idx;
    }
  } catch {
    /* storage disabled — fall through */
  }
  return fallback;
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

function matchTabByLabel(tabs: CodeTab[], label: string): number {
  const target = label.toLowerCase();
  return tabs.findIndex((t) => t.label.toLowerCase() === target);
}

/**
 * \`<CodeTabs>\` — multi-syntax code display with a tab strip above a single
 * \`<CodeBlock>\`. The tab strip shares the dark editor chrome with the body
 * so the entire unit reads as one editor.
 *
 * Accessibility: implements the WAI-ARIA tabs pattern (manual activation).
 * Tabs are keyboard navigable via Left/Right arrows; Home/End jump to ends.
 * Activation is on click or Space/Enter — arrow keys move focus only,
 * matching the "manual activation" pattern preferred when activation has
 * a noticeable cost (here, re-running Shiki).
 */
export function CodeTabs({ tabs, defaultTab, persistKey, showCopy = true }: CodeTabsProps) {
  const [active, setActive] = React.useState<number>(() =>
    resolveInitialIndex(tabs, defaultTab, persistKey),
  );
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const groupId = React.useId();

  // Persist active tab when it changes (after first render — initial value
  // already came from storage, this writes back any user action).
  React.useEffect(() => {
    if (!persistKey || typeof window === 'undefined') return;
    const label = tabs[active]?.label;
    if (!label) return;
    try {
      window.localStorage.setItem(\`helix:storybook:codetab:\${persistKey}\`, label);
    } catch {
      /* storage disabled */
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(\`codetab-\${persistKey}\`, label.toLowerCase());
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore */
    }
  }, [active, persistKey, tabs]);

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const last = tabs.length - 1;
      let next = index;
      switch (event.key) {
        case 'ArrowRight':
          next = index === last ? 0 : index + 1;
          break;
        case 'ArrowLeft':
          next = index === 0 ? last : index - 1;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = last;
          break;
        default:
          return;
      }
      event.preventDefault();
      tabRefs.current[next]?.focus();
    },
    [tabs.length],
  );

  if (tabs.length === 0) return null;
  const safeActive = clampIndex(active, tabs.length);
  const current = tabs[safeActive];
  // Defensive: clampIndex guarantees the index is in-range when tabs.length > 0,
  // but the array-access return type is still \`T | undefined\` under
  // \`noUncheckedIndexedAccess\`. Bail rather than non-null-assert.
  if (!current) return null;

  return (
    <div
      className="hx-docs-code-editor hx-docs-code-editor--tabbed"
      data-language={current.language}
    >
      <div role="tablist" aria-label="Code language" className="hx-docs-code-editor-tabs">
        {tabs.map((tab, idx) => {
          const isActive = idx === safeActive;
          const tabId = \`\${groupId}-tab-\${idx}\`;
          const panelId = \`\${groupId}-panel-\${idx}\`;
          return (
            <button
              key={\`\${tab.label}-\${idx}\`}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              id={tabId}
              role="tab"
              type="button"
              aria-controls={panelId}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className="hx-docs-code-editor-tab"
              data-active={isActive || undefined}
              onClick={() => setActive(idx)}
              onKeyDown={(e) => onKeyDown(e, idx)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, idx) => {
        const isActivePanel = idx === safeActive;
        // Render ALL panels in the DOM so every tab's \`aria-controls\`
        // resolves to a real element (APG manual-activation tabs pattern).
        // Inactive panels are hidden via the \`hidden\` attribute, which both
        // visually hides them and removes them from the AT tree. We still
        // gate the inner CodeBlock to the active panel so Shiki only
        // highlights the visible source — the empty placeholder keeps the
        // aria-controls reference valid without paying the highlighter cost.
        return (
          <div
            key={\`panel-\${idx}\`}
            role="tabpanel"
            id={\`\${groupId}-panel-\${idx}\`}
            aria-labelledby={\`\${groupId}-tab-\${idx}\`}
            className="hx-docs-code-editor-tabpanel"
            hidden={!isActivePanel}
          >
            {isActivePanel && (
              <CodeBlock
                code={tab.code}
                language={tab.language}
                filename={tab.filename}
                showCopy={showCopy}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
`;
}

export function contrastMatrixSrc(): string {
  return `import * as React from 'react';
/*
 * Contrast telemetry imported from \`@helixui/tokens/contrast-data\` — a
 * committed, strongly-typed module emitted by the contrast:report script
 * alongside the gitignored \`.cache/contrast-report.json\` inspection
 * artefact. Importing the committed TS module (instead of the cache JSON)
 * means Storybook builds in CI work without first running the generator,
 * which is the only way the docs site can reliably ship.
 *
 * Regenerate via \`pnpm --filter=@helixui/tokens run contrast:report\` —
 * the script writes both \`src/__generated__/contrast-report.ts\` (committed)
 * and \`.cache/contrast-report.json\` (ad-hoc inspection only) in lockstep.
 *
 * This static report is the *extraction-quality contract* downstream
 * consumers depend on — it's deterministic for a given (tokens.json,
 * contrast-helpers.ts) tuple and lives in the published package. When
 * the matrix is rendered in \`live\` mode the static report is still used
 * as the *pair list*, but every pair's \`surfaceHex\`, \`textHex\`, \`ratio\`,
 * and \`classification\` is recomputed against the active CSS cascade so
 * brand swaps in the Storybook toolbar reflect immediately.
 */
import { contrastReport } from '@helixui/tokens/contrast-data';
import { TokenRef } from './TokenRef';
import { contrastRatio, cssColorToHex } from './contrast';
import { useResolvedTokens } from './useResolvedToken';

/**
 * ContrastMatrix — renders the Phase 1 contrast-report data as a
 * styled table, color-graded with AAA / AA / sub-AA pills.
 *
 * Source:
 *   @helixui/tokens/contrast-data — committed TS module
 *   (regenerate via \`pnpm --filter=@helixui/tokens run contrast:report\`)
 *
 * Each row pairs a text token with a surface token across the active
 * mode. The classification field comes from the generator and reflects
 * the WCAG 2.1 thresholds:
 *   aaa     — ratio >= 7.0
 *   aa      — ratio >= 4.5
 *   subAA   — below 4.5 (none ship; presence here is a defect signal)
 *
 * Two render modes:
 *   static (default) — all modes side by side, values from the committed
 *     report. This is the contract published with the tokens package.
 *   live             — only the currently active mode (read from
 *     \`data-theme\` on \`<html>\`), pairs recomputed from \`getComputedStyle\`
 *     so brand swaps in the toolbar reflect immediately.
 */

type Classification = 'aaa' | 'aa' | 'subAA';

interface Pair {
  text: string;
  surface: string;
  label: string;
  textHex: string;
  surfaceHex: string;
  ratio: number;
  threshold: number;
  aaaThreshold: number;
  classification: Classification;
}

interface ModeData {
  summary: { aaa: number; aa: number; subAA: number; total: number };
  pairs: Pair[];
}

interface Report {
  generatedAt: string;
  tokenVersion: string;
  modes: { light: ModeData; dark: ModeData; 'high-contrast': ModeData };
}

const report = contrastReport as unknown as Report;

const MODE_LABELS: Record<keyof Report['modes'], string> = {
  light: 'Light',
  dark: 'Dark',
  'high-contrast': 'High contrast',
};

const ALL_MODES: Array<keyof Report['modes']> = ['light', 'dark', 'high-contrast'];

function gradeForClassification(c: Classification): 'AAA' | 'AA' | 'Fail' {
  if (c === 'aaa') return 'AAA';
  if (c === 'aa') return 'AA';
  return 'Fail';
}

function classifyRatio(ratio: number, aaaThreshold: number, threshold: number): Classification {
  if (ratio >= aaaThreshold) return 'aaa';
  if (ratio >= threshold) return 'aa';
  return 'subAA';
}

/**
 * Read the active theme/brand attributes from <html>, with SSR guards
 * and a MutationObserver subscription so the component re-renders when
 * the toolbar flips them.
 */
function useActiveCascade(): { theme: keyof Report['modes']; brand: string } {
  const [state, setState] = React.useState<{ theme: keyof Report['modes']; brand: string }>(() => {
    if (typeof window === 'undefined') return { theme: 'light', brand: 'apex' };
    const html = document.documentElement;
    const theme = (html.getAttribute('data-theme') as keyof Report['modes'] | null) ?? 'light';
    const brand = html.getAttribute('data-brand') ?? 'apex';
    return { theme, brand };
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const html = document.documentElement;
    const update = () => {
      const theme = (html.getAttribute('data-theme') as keyof Report['modes'] | null) ?? 'light';
      const brand = html.getAttribute('data-brand') ?? 'apex';
      setState((prev) => (prev.theme === theme && prev.brand === brand ? prev : { theme, brand }));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme', 'data-brand'] });
    return () => observer.disconnect();
  }, []);

  return state;
}

export interface ContrastMatrixProps {
  /**
   * Mode to show in static rendering. Defaults to all three rendered as
   * separate sections. Ignored when \`live\` is true.
   */
  mode?: keyof Report['modes'];
  /**
   * When true, render only the currently active mode and recompute each
   * pair's hex values, ratio, and classification from the live CSS
   * cascade. Defaults to false (static / extraction-quality contract).
   */
  live?: boolean;
}

interface MatrixSectionProps {
  modeKey: keyof Report['modes'];
  modeLabel: string;
  data: ModeData;
  badge?: React.ReactNode;
}

function MatrixSection({ modeKey, modeLabel, data, badge }: MatrixSectionProps) {
  return (
    <section className="hx-docs-matrix-section" data-mode={modeKey}>
      <header className="hx-docs-matrix-header">
        <h3 className="hx-docs-matrix-title">{modeLabel}</h3>
        <div className="hx-docs-matrix-summary">
          <span className="hx-docs-grade-pill" data-grade="AAA">
            AAA · {data.summary.aaa}
          </span>
          <span className="hx-docs-grade-pill" data-grade="AA">
            AA · {data.summary.aa}
          </span>
          {data.summary.subAA > 0 ? (
            <span className="hx-docs-grade-pill" data-grade="Fail">
              sub-AA · {data.summary.subAA}
            </span>
          ) : null}
          <span className="hx-docs-matrix-total">{data.summary.total} pairs</span>
          {badge}
        </div>
      </header>
      <div className="hx-docs-matrix-table-wrap">
        <table className="hx-docs-matrix-table">
          <thead>
            <tr>
              <th scope="col">Pair</th>
              <th scope="col">Text</th>
              <th scope="col">Surface</th>
              <th scope="col">Ratio</th>
              <th scope="col">Grade</th>
            </tr>
          </thead>
          <tbody>
            {data.pairs.map((p) => {
              const grade = gradeForClassification(p.classification);
              return (
                <tr key={\`\${p.text}__\${p.surface}\`}>
                  <td className="hx-docs-matrix-pair-cell">
                    <span
                      className="hx-docs-matrix-swatch"
                      style={{ background: p.surfaceHex, color: p.textHex }}
                      aria-hidden="true"
                    >
                      Aa
                    </span>
                    <span className="hx-docs-matrix-pair-label">{p.label}</span>
                  </td>
                  <td>
                    <TokenRef token={p.text} />
                  </td>
                  <td>
                    <TokenRef token={p.surface} />
                  </td>
                  <td className="hx-docs-matrix-ratio">
                    {p.ratio.toFixed(p.ratio >= 10 ? 1 : 2)}
                    <small>:1</small>
                  </td>
                  <td>
                    <span className="hx-docs-grade-pill" data-grade={grade}>
                      {grade}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface LiveMatrixSectionProps {
  modeKey: keyof Report['modes'];
  brand: string;
  baselinePairs: readonly Pair[];
}

function LiveMatrixSection({ modeKey, brand, baselinePairs }: LiveMatrixSectionProps) {
  // Build a stable, deduped list of every token referenced across the
  // baseline pairs (text + surface) so we can subscribe with a single
  // useResolvedTokens call. The order is referentially stable across
  // renders for a fixed pair list, which is what the hook expects.
  const tokenList = React.useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const p of baselinePairs) {
      if (!seen.has(p.text)) {
        seen.add(p.text);
        list.push(p.text);
      }
      if (!seen.has(p.surface)) {
        seen.add(p.surface);
        list.push(p.surface);
      }
    }
    return list;
  }, [baselinePairs]);

  const resolvedValues = useResolvedTokens(tokenList);

  const livePairs = React.useMemo<Pair[]>(() => {
    const lookup = new Map<string, string>();
    tokenList.forEach((name, i) => lookup.set(name, resolvedValues[i] ?? ''));
    return baselinePairs.map((p) => {
      const surfaceRaw = lookup.get(p.surface) ?? '';
      const textRaw = lookup.get(p.text) ?? '';
      const surfaceHex = cssColorToHex(surfaceRaw) || p.surfaceHex;
      const textHex = cssColorToHex(textRaw) || p.textHex;
      const ratio = contrastRatio(surfaceRaw, textRaw);
      const safeRatio = Number.isFinite(ratio) && ratio >= 1 ? ratio : p.ratio;
      const classification = classifyRatio(safeRatio, p.aaaThreshold, p.threshold);
      return {
        ...p,
        surfaceHex,
        textHex,
        ratio: safeRatio,
        classification,
      };
    });
  }, [baselinePairs, resolvedValues, tokenList]);

  const summary = React.useMemo(() => {
    let aaa = 0;
    let aa = 0;
    let subAA = 0;
    for (const p of livePairs) {
      if (p.classification === 'aaa') aaa++;
      else if (p.classification === 'aa') aa++;
      else subAA++;
    }
    return { aaa, aa, subAA, total: livePairs.length };
  }, [livePairs]);

  const badge = (
    <span
      className="hx-docs-matrix-total"
      title="Recomputed from getComputedStyle on the active cascade"
    >
      Live · {brand}
    </span>
  );

  return (
    <MatrixSection
      modeKey={modeKey}
      modeLabel={\`\${MODE_LABELS[modeKey]} (live)\`}
      data={{ summary, pairs: livePairs }}
      badge={badge}
    />
  );
}

export function ContrastMatrix({ mode, live = false }: ContrastMatrixProps) {
  const cascade = useActiveCascade();

  if (live) {
    // Live mode: only the active theme is reflected in the cascade, so
    // pin to it. The baseline pair list still comes from the committed
    // report so the row identity / token contract stays stable.
    const activeMode: keyof Report['modes'] = report.modes[cascade.theme] ? cascade.theme : 'light';
    const baselinePairs = report.modes[activeMode].pairs;
    return (
      <div className="hx-docs-matrix-stack">
        <LiveMatrixSection
          modeKey={activeMode}
          brand={cascade.brand}
          baselinePairs={baselinePairs}
        />
      </div>
    );
  }

  const modes = mode ? ([mode] as Array<keyof Report['modes']>) : ALL_MODES;
  return (
    <div className="hx-docs-matrix-stack">
      {modes.map((m) => (
        <MatrixSection key={m} modeKey={m} modeLabel={MODE_LABELS[m]} data={report.modes[m]} />
      ))}
    </div>
  );
}
`;
}
