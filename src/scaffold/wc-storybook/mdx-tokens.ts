/**
 * wc-storybook token deep-dive MDX emitters.
 *
 * Adapts `helix/apps/storybook/stories/tokens/{Borders,Shadows}.mdx` into
 * emitter functions. The pages are intentionally editorial — they iterate
 * over the upstream `@helixui/tokens` `tokensByCategory` index to render
 * radius / width / shadow swatches with hero banners and reference tables.
 *
 * Adaptation rules (per shimmying-roaming-kernighan plan, Phase 4):
 *
 * 1. **Title taxonomy** — the existing `Foundations/Tokens` page (emitted
 *    directly from scaffold.ts at `src/stories/foundations/Tokens.mdx`)
 *    becomes the INDEX. The two new deep-dives nest UNDER it via the
 *    title path:
 *      `Foundations/Tokens/Borders`
 *      `Foundations/Tokens/Shadows`
 *
 *    Storybook resolves nested titles to sidebar nesting automatically.
 *
 * 2. **Tag substitution N/A** — these MDXes don't render any custom
 *    elements; they iterate over tokens and apply them to inline-styled
 *    `<div>` swatches. Nothing to rewrite.
 *
 * 3. **Cross-domain-neutral copy** — upstream's Shadows.mdx interactive
 *    demo card uses `Patient Summary` / `Outpatient` content. Rewritten
 *    to a generic SaaS card (`Project handoff` / pills `On track` +
 *    `Frontend`) per `feedback_realistic_sample_data`.
 *
 * 4. **No `?raw` imports / monorepo paths** — these pages were already
 *    clean of those.
 *
 * 5. **`--hx-*` token names stay** — they reference the published
 *    `@helixui/tokens` package the consumer pulls in. The consumer's own
 *    `{tokenPrefix}-*` layer is documented separately on the Brand and
 *    Tokens (index) pages emitted from scaffold.ts.
 *
 * Each emitter returns `{ relativePath, content }` so scaffold.ts can
 * iterate and call `safeWriteFile`. relativePath is rooted at the
 * consumer's project directory.
 */

export interface TokenMdxEmission {
  /** Path relative to the consumer's project directory. */
  relativePath: string;
  /** Full MDX file body (imports + frontmatter + style + content). */
  content: string;
}

export interface TokenEmissionContext {
  /** Lowercase tag prefix, e.g. `aurora`. Unused by the deep-dives — token
   *  swatches read directly from `--hx-*` published values — but kept on
   *  the signature for symmetry with the sibling emitters. */
  dsName: string;
  /** PascalCase class form. Unused for the same reason. */
  dsClass: string;
}

// ---------------------------------------------------------------------------
// Borders.mdx — corner-radius + border-width token reference
// ---------------------------------------------------------------------------

function emitBordersMdx(_ctx: TokenEmissionContext): TokenMdxEmission {
  return {
    relativePath: 'src/stories/foundations/tokens/Borders.mdx',
    content: `{/* Borders.mdx — HELIX Design Token: Border Radius & Width */}

import { Meta } from '@storybook/addon-docs/blocks';
import { tokensByCategory } from '@helixui/tokens';
import { getTokensByPrefix } from '@helixui/tokens/utils';

<Meta
  title="Foundations/Tokens/Borders"
  parameters={{ controls: { disable: true }, actions: { disable: true } }}
/>

export const borderTokens = tokensByCategory['border'] ?? [];
export const radiusTokens = getTokensByPrefix(borderTokens, '--hx-border-radius-');
export const widthTokens = getTokensByPrefix(borderTokens, '--hx-border-width-');

<style>
  {\`
  .hx-token-borders {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 1rem 3rem;
    font-family: var(--hx-font-family-sans, 'Inter', -apple-system, BlinkMacSystemFont, sans-serif);
    color: var(--hx-color-neutral-800, #1E293B);
    line-height: 1.5;
  }

  .hx-token-borders *,
  .hx-token-borders *::before,
  .hx-token-borders *::after {
    box-sizing: border-box;
  }

  .hx-token-borders h2,
  .hx-token-borders h3,
  .hx-token-borders p,
  .hx-token-borders span,
  .hx-token-borders div,
  .hx-token-borders code,
  .hx-token-borders table,
  .hx-token-borders thead,
  .hx-token-borders tbody,
  .hx-token-borders tr,
  .hx-token-borders th,
  .hx-token-borders td {
    all: unset;
    box-sizing: border-box;
    display: block;
  }

  .hx-token-borders span,
  .hx-token-borders code {
    display: inline;
  }

  .hx-token-borders table { display: table; }
  .hx-token-borders thead { display: table-header-group; }
  .hx-token-borders tbody { display: table-row-group; }
  .hx-token-borders tr { display: table-row; }
  .hx-token-borders th,
  .hx-token-borders td { display: table-cell; }

  .hx-token-borders .hx-borders-hero {
    background: linear-gradient(135deg, var(--hx-color-secondary-50, #ECFEFF) 0%, var(--hx-color-neutral-50, #F8FAFC) 100%) !important;
    border-radius: 0.75rem !important;
    padding: 2.5rem 2rem !important;
    margin-bottom: 2.5rem !important;
    border: 1px solid var(--hx-color-secondary-100, #CFFAFE) !important;
    position: relative !important;
    overflow: hidden !important;
  }

  .hx-token-borders .hx-borders-hero-title {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 2rem !important;
    font-weight: 800 !important;
    color: var(--hx-color-neutral-900, #0F172A) !important;
    margin: 0 0 0.5rem 0 !important;
    letter-spacing: -0.025em !important;
    line-height: 1.2 !important;
  }

  .hx-token-borders .hx-borders-hero-desc {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 1rem !important;
    color: var(--hx-color-neutral-500, #64748B) !important;
    margin: 0 0 1rem 0 !important;
    line-height: 1.6 !important;
    max-width: 600px !important;
  }

  .hx-token-borders .hx-borders-hero-badges {
    display: flex !important;
    gap: 0.5rem !important;
    flex-wrap: wrap !important;
  }

  .hx-token-borders .hx-borders-hero-badge {
    display: inline-flex !important;
    align-items: center !important;
    gap: 0.375rem !important;
    background: var(--hx-color-secondary-100, #CFFAFE) !important;
    color: var(--hx-color-secondary-700, #155E75) !important;
    padding: 4px 12px !important;
    border-radius: 9999px !important;
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.75rem !important;
    font-weight: 600 !important;
    letter-spacing: 0.01em !important;
  }

  .hx-token-borders .hx-borders-section-desc {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.9375rem !important;
    color: var(--hx-color-neutral-500, #64748B) !important;
    margin: 0 0 1.5rem 0 !important;
    line-height: 1.6 !important;
    max-width: 640px !important;
  }

  .hx-token-borders .hx-borders-radius-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)) !important;
    gap: 24px !important;
  }

  .hx-token-borders .hx-borders-radius-item {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 12px !important;
    transition: transform 0.2s ease !important;
  }

  .hx-token-borders .hx-borders-radius-shape {
    width: 110px !important;
    height: 110px !important;
    background: linear-gradient(135deg, var(--hx-color-primary-50, #EFF6FF) 0%, var(--hx-color-primary-100, #DBEAFE) 100%) !important;
    border: 2px solid var(--hx-color-primary-300, #93C5FD) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
  }

  .hx-token-borders .hx-borders-radius-key {
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.875rem !important;
    color: var(--hx-color-primary-700, #1E40AF) !important;
    font-weight: 600 !important;
  }

  .hx-token-borders .hx-borders-radius-name {
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.75rem !important;
    color: var(--hx-color-neutral-600, #475569) !important;
    text-align: center !important;
  }

  .hx-token-borders .hx-borders-radius-value {
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.6875rem !important;
    color: var(--hx-color-neutral-400, #94A3B8) !important;
    margin-top: -6px !important;
    text-align: center !important;
  }

  .hx-token-borders .hx-borders-width-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
    gap: 20px !important;
  }

  .hx-token-borders .hx-borders-width-card {
    padding: 1.5rem !important;
    background: var(--hx-color-neutral-0, #FFFFFF) !important;
    border-style: solid !important;
    border-color: var(--hx-color-primary-500, #2563EB) !important;
    border-radius: 0.5rem !important;
    transition: transform 0.2s ease, box-shadow 0.2s ease !important;
  }

  .hx-token-borders .hx-borders-width-header {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    margin-bottom: 0.5rem !important;
  }

  .hx-token-borders .hx-borders-width-key {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 1.125rem !important;
    font-weight: 700 !important;
    color: var(--hx-color-neutral-800, #1E293B) !important;
    text-transform: capitalize !important;
  }

  .hx-token-borders .hx-borders-width-value-badge {
    display: inline-block !important;
    padding: 2px 8px !important;
    background: var(--hx-color-primary-50, #EFF6FF) !important;
    color: var(--hx-color-primary-700, #1E40AF) !important;
    border-radius: 9999px !important;
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.75rem !important;
    font-weight: 600 !important;
  }

  .hx-token-borders .hx-borders-width-name {
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.8125rem !important;
    color: var(--hx-color-neutral-500, #64748B) !important;
    margin-top: 0.25rem !important;
  }

  .hx-token-borders .hx-borders-width-desc {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.8125rem !important;
    color: var(--hx-color-neutral-400, #94A3B8) !important;
    margin-top: 0.5rem !important;
    line-height: 1.5 !important;
  }

  .hx-token-borders .hx-borders-matrix-wrap {
    overflow-x: auto !important;
    padding: 24px !important;
    background: var(--hx-color-neutral-50, #F8FAFC) !important;
    border-radius: 0.75rem !important;
    border: 1px solid var(--hx-color-neutral-100, #F1F5F9) !important;
  }

  .hx-token-borders .hx-borders-matrix-table {
    border-collapse: separate !important;
    border-spacing: 12px !important;
    margin: 0 auto !important;
  }

  .hx-token-borders .hx-borders-matrix-th {
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.6875rem !important;
    color: var(--hx-color-neutral-500, #64748B) !important;
    font-weight: 500 !important;
    padding: 0 4px 8px !important;
    white-space: nowrap !important;
    text-align: center !important;
  }

  .hx-token-borders .hx-borders-matrix-row-label {
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.6875rem !important;
    color: var(--hx-color-neutral-500, #64748B) !important;
    font-weight: 500 !important;
    white-space: nowrap !important;
    vertical-align: middle !important;
    padding-right: 8px !important;
    text-align: right !important;
  }

  .hx-token-borders .hx-borders-matrix-cell {
    padding: 0 !important;
    vertical-align: middle !important;
  }

  .hx-token-borders .hx-borders-matrix-shape {
    width: 72px !important;
    height: 72px !important;
    background: var(--hx-color-neutral-0, #FFFFFF) !important;
    border-style: solid !important;
    border-color: var(--hx-color-primary-400, #60A5FA) !important;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease !important;
    margin: 0 auto !important;
  }

  .hx-token-borders .hx-borders-usage-card {
    background: var(--hx-color-neutral-0, #FFFFFF) !important;
    border: 1px solid var(--hx-color-neutral-200, #E2E8F0) !important;
    border-radius: 0.75rem !important;
    padding: 1.5rem !important;
    box-shadow: var(--hx-shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05)) !important;
  }

  .hx-token-borders .hx-borders-usage-title {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 1rem !important;
    font-weight: 600 !important;
    color: var(--hx-color-neutral-800, #1E293B) !important;
    margin: 0 0 0.75rem 0 !important;
  }

  .hx-token-borders .hx-borders-code-block {
    background: var(--hx-color-neutral-900, #0F172A) !important;
    border-radius: 0.5rem !important;
    padding: 1rem 1.25rem !important;
    overflow-x: auto !important;
  }

  .hx-token-borders .hx-borders-code-line {
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.8125rem !important;
    line-height: 1.7 !important;
    color: var(--hx-color-neutral-300, #CBD5E1) !important;
    white-space: pre !important;
  }

  .hx-token-borders .hx-borders-code-comment { color: var(--hx-color-neutral-500, #64748B) !important; }
  .hx-token-borders .hx-borders-code-prop { color: var(--hx-color-secondary-400, #22D3EE) !important; }
  .hx-token-borders .hx-borders-code-value { color: var(--hx-color-accent-400, #FBBF24) !important; }

  .hx-token-borders .hx-borders-footer {
    margin-top: 3rem !important;
    padding-top: 1.5rem !important;
    border-top: 1px solid var(--hx-color-neutral-200, #E2E8F0) !important;
    text-align: center !important;
  }

  .hx-token-borders .hx-borders-footer-text {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.8125rem !important;
    color: var(--hx-color-neutral-400, #94A3B8) !important;
  }
\`}
</style>

export const widthDescriptions = {
  thin: 'Default for most element borders, input fields, and dividers.',
  medium: 'Emphasis borders and active state indicators.',
  thick: 'High-impact emphasis, section dividers, and brand accents.',
  focus: ':focus-visible ring weight — paired with --hx-color-focus-ring.',
};

<div className="hx-token-borders">

<div className="hx-borders-hero">
  <div className="hx-borders-hero-title">Borders</div>
  <div className="hx-borders-hero-desc">
    Border tokens control corner rounding and stroke width across the design system. A consistent
    border language ensures visual cohesion from subtle input fields to prominent card containers.
  </div>
  <div className="hx-borders-hero-badges">
    <div className="hx-borders-hero-badge">{radiusTokens.length} radius tokens</div>
    <div className="hx-borders-hero-badge">{widthTokens.length} width tokens</div>
  </div>
</div>

## Border Radius

<div className="hx-borders-section-desc">
  Border radius tokens control the rounding of corners. The scale ranges from none (sharp, 0)
  through subtle rounding (sm) to fully circular (full). Each shape below demonstrates the token
  applied to a 110px square.
</div>

<div className="hx-borders-radius-grid">
  {radiusTokens.map((token) => (
    <div className="hx-borders-radius-item" key={token.name}>
      <div className="hx-borders-radius-shape" style={{ borderRadius: \`var(\${token.name})\` }}>
        <span className="hx-borders-radius-key">{token.key}</span>
      </div>
      <div className="hx-borders-radius-name">{token.name}</div>
      <div className="hx-borders-radius-value">{token.value}</div>
    </div>
  ))}
</div>

## Border Widths

<div className="hx-borders-section-desc">
  Four border width tokens are available. Thin (1px) covers most element borders. Medium (2px) is
  suited to focus rings and emphasis. Thick (3px) is for high-impact emphasis and brand accents.
  Focus is reserved for the <code>:focus-visible</code> ring contract — themed across light, dark,
  and high-contrast modes alongside its paired colour token.
</div>

<div className="hx-borders-width-grid">
  {widthTokens.map((token) => (
    <div
      className="hx-borders-width-card"
      key={token.name}
      style={{ borderWidth: \`var(\${token.name})\` }}
    >
      <div className="hx-borders-width-header">
        <span className="hx-borders-width-key">{token.key}</span>
        <span className="hx-borders-width-value-badge">{token.value}</span>
      </div>
      <div className="hx-borders-width-name">{token.name}</div>
      <div className="hx-borders-width-desc">
        {widthDescriptions[token.key] || 'General purpose border width.'}
      </div>
    </div>
  ))}
</div>

## Radius + Width Combinations

<div className="hx-borders-section-desc">
  The matrix below shows every combination of border radius and border width, giving a comprehensive
  feel for how these tokens interact.
</div>

<div className="hx-borders-matrix-wrap">
  <table className="hx-borders-matrix-table">
    <thead>
      <tr>
        <th className="hx-borders-matrix-th"></th>
        {radiusTokens.map((br) => (
          <th className="hx-borders-matrix-th" key={br.name}>
            radius-{br.key}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {widthTokens.map((bw) => (
        <tr key={bw.name}>
          <td className="hx-borders-matrix-row-label">width-{bw.key}</td>
          {radiusTokens.map((br) => (
            <td className="hx-borders-matrix-cell" key={\`\${bw.name}-\${br.name}\`}>
              <div
                className="hx-borders-matrix-shape"
                style={{
                  borderWidth: \`var(\${bw.name})\`,
                  borderRadius: \`var(\${br.name})\`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
</div>

## Usage

<div className="hx-borders-usage-card">
  <div className="hx-borders-usage-title">Using border tokens in CSS</div>
  <div className="hx-borders-code-block">
    <div className="hx-borders-code-line">
      <span className="hx-borders-code-comment">{'/* Border radius */'}</span>
    </div>
    <div className="hx-borders-code-line">
      <span className="hx-borders-code-prop">{'border-radius'}</span>
      {': var('}
      <span className="hx-borders-code-value">{'--hx-border-radius-lg'}</span>
      {');'}
    </div>
    <div className="hx-borders-code-line">&nbsp;</div>
    <div className="hx-borders-code-line">
      <span className="hx-borders-code-comment">{'/* Border width */'}</span>
    </div>
    <div className="hx-borders-code-line">
      <span className="hx-borders-code-prop">{'border'}</span>
      {': var('}
      <span className="hx-borders-code-value">{'--hx-border-width-thin'}</span>
      {') solid var('}
      <span className="hx-borders-code-value">{'--hx-color-neutral-200'}</span>
      {');'}
    </div>
  </div>
</div>

<div className="hx-borders-footer">
  <div className="hx-borders-footer-text">
    HELiX Design Tokens · Borders · {radiusTokens.length + widthTokens.length} tokens
  </div>
</div>

</div>
`,
  };
}

// ---------------------------------------------------------------------------
// Shadows.mdx — elevation token reference
// ---------------------------------------------------------------------------

function emitShadowsMdx(_ctx: TokenEmissionContext): TokenMdxEmission {
  return {
    relativePath: 'src/stories/foundations/tokens/Shadows.mdx',
    content: `{/* Shadows.mdx — HELIX Design Token: Elevation & Shadows */}

import { Meta } from '@storybook/addon-docs/blocks';
import { tokensByCategory } from '@helixui/tokens';

<Meta
  title="Foundations/Tokens/Shadows"
  parameters={{ controls: { disable: true }, actions: { disable: true } }}
/>

export const shadowTokens = tokensByCategory['shadow'] ?? [];

export const shadowUseCases = {
  none: 'Flat elements with no visual lift. Used for inline or flush elements.',
  sm: 'Subtle elevation for cards at rest, input fields, and static containers.',
  md: 'Moderate depth for dropdowns, popovers, and floating action elements.',
  lg: 'Prominent elevation for modals, dialogs, and active focus states.',
  xl: 'High elevation for toast notifications and slide-over panels.',
  '2xl': 'Maximum depth for full-screen overlays and critical alert dialogs.',
  inner: 'Inset shadow for pressed states, active inputs, and recessed surfaces.',
};

<style>
  {\`
  .hx-token-shadows {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 1rem 3rem;
    font-family: var(--hx-font-family-sans, 'Inter', -apple-system, BlinkMacSystemFont, sans-serif);
    color: var(--hx-color-neutral-800, #1E293B);
    line-height: 1.5;
  }

  .hx-token-shadows *,
  .hx-token-shadows *::before,
  .hx-token-shadows *::after {
    box-sizing: border-box;
  }

  .hx-token-shadows h2,
  .hx-token-shadows h3,
  .hx-token-shadows p,
  .hx-token-shadows span,
  .hx-token-shadows div,
  .hx-token-shadows code {
    all: unset;
    box-sizing: border-box;
    display: block;
  }

  .hx-token-shadows span,
  .hx-token-shadows code { display: inline; }

  .hx-token-shadows .hx-shadows-hero {
    background: linear-gradient(135deg, var(--hx-color-neutral-100, #F1F5F9) 0%, var(--hx-color-neutral-50, #F8FAFC) 100%) !important;
    border-radius: 0.75rem !important;
    padding: 2.5rem 2rem !important;
    margin-bottom: 2.5rem !important;
    border: 1px solid var(--hx-color-neutral-200, #E2E8F0) !important;
    position: relative !important;
    overflow: hidden !important;
  }

  .hx-token-shadows .hx-shadows-hero-title {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 2rem !important;
    font-weight: 800 !important;
    color: var(--hx-color-neutral-900, #0F172A) !important;
    margin: 0 0 0.5rem 0 !important;
    letter-spacing: -0.025em !important;
    line-height: 1.2 !important;
  }

  .hx-token-shadows .hx-shadows-hero-desc {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 1rem !important;
    color: var(--hx-color-neutral-500, #64748B) !important;
    margin: 0 0 1rem 0 !important;
    line-height: 1.6 !important;
    max-width: 600px !important;
  }

  .hx-token-shadows .hx-shadows-hero-badge {
    display: inline-flex !important;
    align-items: center !important;
    gap: 0.375rem !important;
    background: var(--hx-color-neutral-200, #E2E8F0) !important;
    color: var(--hx-color-neutral-700, #334155) !important;
    padding: 4px 12px !important;
    border-radius: 9999px !important;
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.75rem !important;
    font-weight: 600 !important;
    letter-spacing: 0.01em !important;
  }

  .hx-token-shadows .hx-shadows-section-desc {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.9375rem !important;
    color: var(--hx-color-neutral-500, #64748B) !important;
    margin: 0 0 1.5rem 0 !important;
    line-height: 1.6 !important;
    max-width: 640px !important;
  }

  .hx-token-shadows .hx-shadows-elevation-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) !important;
    gap: 24px !important;
    padding: 24px !important;
    background: var(--hx-color-neutral-50, #F8FAFC) !important;
    border-radius: 0.75rem !important;
    border: 1px solid var(--hx-color-neutral-100, #F1F5F9) !important;
  }

  .hx-token-shadows .hx-shadows-elevation-card {
    background: var(--hx-color-neutral-0, #FFFFFF) !important;
    border-radius: 0.75rem !important;
    padding: 2rem 1.5rem !important;
    transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s ease !important;
  }

  .hx-token-shadows .hx-shadows-elevation-card--bordered {
    border: 1px solid var(--hx-color-neutral-200, #E2E8F0) !important;
  }

  .hx-token-shadows .hx-shadows-card-name {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 1.125rem !important;
    font-weight: 700 !important;
    color: var(--hx-color-neutral-800, #1E293B) !important;
    margin: 0 0 0.375rem 0 !important;
  }

  .hx-token-shadows .hx-shadows-card-usecase {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.875rem !important;
    color: var(--hx-color-neutral-500, #64748B) !important;
    margin: 0 0 1rem 0 !important;
    line-height: 1.5 !important;
  }

  .hx-token-shadows .hx-shadows-card-token-badge {
    display: inline-block !important;
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.75rem !important;
    color: var(--hx-color-neutral-600, #475569) !important;
    padding: 6px 10px !important;
    background: var(--hx-color-neutral-50, #F8FAFC) !important;
    border-radius: 0.375rem !important;
    border: 1px solid var(--hx-color-neutral-200, #E2E8F0) !important;
    word-break: break-all !important;
    line-height: 1.4 !important;
  }

  .hx-token-shadows .hx-shadows-comparison-row {
    display: flex !important;
    align-items: flex-start !important;
    gap: 20px !important;
    flex-wrap: wrap !important;
    padding: 32px 24px !important;
    background: var(--hx-color-neutral-50, #F8FAFC) !important;
    border-radius: 0.75rem !important;
    border: 1px solid var(--hx-color-neutral-100, #F1F5F9) !important;
  }

  .hx-token-shadows .hx-shadows-comparison-item {
    flex: 0 0 auto !important;
    text-align: center !important;
  }

  .hx-token-shadows .hx-shadows-comparison-box {
    width: 120px !important;
    height: 90px !important;
    background: var(--hx-color-neutral-0, #FFFFFF) !important;
    border-radius: 0.5rem !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: transform 0.2s ease !important;
  }

  .hx-token-shadows .hx-shadows-comparison-box--bordered {
    border: 1px solid var(--hx-color-neutral-200, #E2E8F0) !important;
  }

  .hx-token-shadows .hx-shadows-comparison-label {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.875rem !important;
    color: var(--hx-color-neutral-600, #475569) !important;
    font-weight: 500 !important;
  }

  .hx-token-shadows .hx-shadows-comparison-name {
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.6875rem !important;
    color: var(--hx-color-neutral-400, #94A3B8) !important;
    margin-top: 8px !important;
  }

  .hx-token-shadows .hx-shadows-demo-area {
    padding: 48px 32px !important;
    background: var(--hx-color-neutral-50, #F8FAFC) !important;
    border-radius: 0.75rem !important;
    border: 1px solid var(--hx-color-neutral-100, #F1F5F9) !important;
    display: flex !important;
    justify-content: center !important;
  }

  .hx-token-shadows .hx-shadows-interactive-card {
    background: var(--hx-color-neutral-0, #FFFFFF) !important;
    border-radius: 0.75rem !important;
    padding: 2rem !important;
    max-width: 380px !important;
    width: 100% !important;
    box-shadow: var(--hx-shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05)) !important;
    transition: box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1) !important;
    cursor: pointer !important;
  }

  .hx-token-shadows .hx-shadows-interactive-card:hover {
    box-shadow: var(--hx-shadow-xl, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)) !important;
    transform: translateY(-4px) !important;
  }

  .hx-token-shadows .hx-shadows-demo-title {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 1.125rem !important;
    font-weight: 700 !important;
    color: var(--hx-color-neutral-800, #1E293B) !important;
    margin: 0 0 0.5rem 0 !important;
  }

  .hx-token-shadows .hx-shadows-demo-body {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.875rem !important;
    color: var(--hx-color-neutral-500, #64748B) !important;
    line-height: 1.6 !important;
    margin: 0 0 1.25rem 0 !important;
  }

  .hx-token-shadows .hx-shadows-demo-pills {
    display: flex !important;
    gap: 8px !important;
    flex-wrap: wrap !important;
  }

  .hx-token-shadows .hx-shadows-demo-pill {
    display: inline-block !important;
    padding: 4px 12px !important;
    border-radius: 9999px !important;
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.75rem !important;
    font-weight: 500 !important;
  }

  .hx-token-shadows .hx-shadows-demo-pill--success {
    background: var(--hx-color-success-100, #DCFCE7) !important;
    color: var(--hx-color-success-700, #15803D) !important;
  }

  .hx-token-shadows .hx-shadows-demo-pill--primary {
    background: var(--hx-color-primary-50, #EFF6FF) !important;
    color: var(--hx-color-primary-700, #1E40AF) !important;
  }

  .hx-token-shadows .hx-shadows-demo-hint {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.8125rem !important;
    color: var(--hx-color-neutral-400, #94A3B8) !important;
    text-align: center !important;
    margin-top: 1rem !important;
    font-style: italic !important;
  }

  .hx-token-shadows .hx-shadows-ref-row {
    display: grid !important;
    grid-template-columns: 180px 1fr !important;
    gap: 16px !important;
    padding: 12px 16px !important;
    align-items: center !important;
  }

  .hx-token-shadows .hx-shadows-ref-row:not(:last-child) {
    border-bottom: 1px solid var(--hx-color-neutral-100, #F1F5F9) !important;
  }

  .hx-token-shadows .hx-shadows-ref-name {
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.8125rem !important;
    color: var(--hx-color-neutral-700, #334155) !important;
    font-weight: 500 !important;
  }

  .hx-token-shadows .hx-shadows-ref-value {
    font-family: var(--hx-font-family-mono, 'JetBrains Mono', monospace) !important;
    font-size: 0.75rem !important;
    color: var(--hx-color-neutral-400, #94A3B8) !important;
    word-break: break-all !important;
  }

  .hx-token-shadows .hx-shadows-footer {
    margin-top: 3rem !important;
    padding-top: 1.5rem !important;
    border-top: 1px solid var(--hx-color-neutral-200, #E2E8F0) !important;
    text-align: center !important;
  }

  .hx-token-shadows .hx-shadows-footer-text {
    font-family: var(--hx-font-family-sans, 'Inter', sans-serif) !important;
    font-size: 0.8125rem !important;
    color: var(--hx-color-neutral-400, #94A3B8) !important;
  }
\`}
</style>

<div className="hx-token-shadows">

<div className="hx-shadows-hero">
  <div className="hx-shadows-hero-title">Shadows</div>
  <div className="hx-shadows-hero-desc">
    Shadow tokens create visual depth and establish the elevation hierarchy in your UI. The scale
    progresses from flat to dramatic, with an inner shadow for pressed and inset states.
  </div>
  <div className="hx-shadows-hero-badge">{shadowTokens.length} tokens</div>
</div>

## Elevation Scale

<div className="hx-shadows-section-desc">
  Each card below is rendered with a different shadow token applied. White cards on a neutral
  background highlight the progressive depth from flat (none) to maximum elevation (2xl), plus an
  inset shadow for recessed surfaces.
</div>

<div className="hx-shadows-elevation-grid">
  {shadowTokens.map((token) => (
    <div
      className={\`hx-shadows-elevation-card \${token.key === 'none' ? 'hx-shadows-elevation-card--bordered' : ''}\`}
      key={token.name}
      style={{ boxShadow: \`var(\${token.name})\` }}
    >
      <div className="hx-shadows-card-name">shadow-{token.key}</div>
      <div className="hx-shadows-card-usecase">
        {shadowUseCases[token.key] || token.description || 'General purpose shadow.'}
      </div>
      <span className="hx-shadows-card-token-badge">{token.name}</span>
    </div>
  ))}
</div>

## Side-by-Side Comparison

<div className="hx-shadows-section-desc">
  Identical cards rendered with each shadow level, arranged in a compact horizontal strip to
  highlight the visual progression from no shadow through maximum elevation.
</div>

<div className="hx-shadows-comparison-row">
  {shadowTokens.map((token) => (
    <div className="hx-shadows-comparison-item" key={token.name}>
      <div
        className={\`hx-shadows-comparison-box \${token.key === 'none' ? 'hx-shadows-comparison-box--bordered' : ''}\`}
        style={{ boxShadow: \`var(\${token.name})\` }}
      >
        <span className="hx-shadows-comparison-label">{token.key}</span>
      </div>
      <div className="hx-shadows-comparison-name">{token.name}</div>
    </div>
  ))}
</div>

## Interactive Demo

<div className="hx-shadows-section-desc">
  Hover over the card below to see a smooth elevation transition from shadow-sm to shadow-xl. This
  demonstrates how shadow tokens can be combined with CSS transitions to create interactive depth
  cues that guide user attention.
</div>

<div className="hx-shadows-demo-area">
  <div className="hx-shadows-interactive-card">
    <div className="hx-shadows-demo-title">Project handoff</div>
    <div className="hx-shadows-demo-body">
      This card rests at shadow-sm for a subtle lift. On hover, it transitions to shadow-xl with a
      gentle upward movement, indicating interactivity and drawing focus to the content.
    </div>
    <div className="hx-shadows-demo-pills">
      <span className="hx-shadows-demo-pill hx-shadows-demo-pill--success">On track</span>
      <span className="hx-shadows-demo-pill hx-shadows-demo-pill--primary">Frontend</span>
    </div>
  </div>
</div>
<div className="hx-shadows-demo-hint">Hover over the card to see the shadow transition</div>

## Value Reference

<div className="hx-shadows-section-desc">
  The raw CSS values for each shadow token. These can be inspected in DevTools or referenced when
  building custom components that need to match the elevation system.
</div>

<div>
  {shadowTokens.map((token) => (
    <div className="hx-shadows-ref-row" key={token.name}>
      <span className="hx-shadows-ref-name">{token.name}</span>
      <span className="hx-shadows-ref-value">{token.value}</span>
    </div>
  ))}
</div>

<div className="hx-shadows-footer">
  <div className="hx-shadows-footer-text">
    HELiX Design Tokens · Elevation & Shadows · {shadowTokens.length} tokens
  </div>
</div>

</div>
`,
  };
}

/**
 * Returns both token deep-dive emissions (Borders + Shadows) in a
 * deterministic order. scaffold.ts iterates and writes each.
 */
export function getTokenMdxEmissions(ctx: TokenEmissionContext): TokenMdxEmission[] {
  return [emitBordersMdx(ctx), emitShadowsMdx(ctx)];
}
