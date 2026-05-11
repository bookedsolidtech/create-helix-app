/**
 * wc-storybook Iconography MDX emitter.
 *
 * Adapts `helix/apps/storybook/stories/foundations/Iconography.mdx` (603 LOC)
 * into a single emitter function. The upstream page documents the
 * `@helixui/icons` registry pattern: two bundled libraries (`helix`,
 * `fa-free`), a 5-size showcase via `hx-size`, registry-pattern code
 * examples (FA Pro / Iconify / Phosphor / brand sprite), accessibility
 * audit, and anti-pattern callouts.
 *
 * Adaptation rules (per shimmying-roaming-kernighan plan, v0.6.0 Phase B):
 *
 * 1. **Title taxonomy** — emitted at `Foundations/Iconography`, sibling to
 *    `Foundations/Color`, `Foundations/Typography`, etc. Slots above
 *    `Foundations/Tokens` in storySort.
 *
 * 2. **Helper imports re-pathed** — upstream uses `from '../_components'`
 *    (barrel re-export); the scaffolded factory writes each helper to its
 *    own file under `src/stories/_components/<Helper>.tsx` (no barrel), so
 *    each helper is imported from its module path. Mirrors the pattern
 *    used by Phase 3 accessibility MDXes.
 *
 * 3. **No `?raw` / monorepo imports** — upstream Iconography.mdx has
 *    `import '@helixui/library/components/hx-icon';` to register the tag.
 *    The scaffolded preview.ts already registers `hx-icon` via the
 *    side-effect import wave near the top, so we drop that import — MDX
 *    pages run inside the preview iframe and inherit the registration.
 *
 * 4. **Healthcare-locked copy** — upstream uses "Add patient" in the
 *    leading-icon-in-control example. Rewritten to a generic "Add member"
 *    per `feedback_realistic_sample_data`.
 *
 * 5. **Phase-5-migration phrasing** — upstream says "Phase 5 of the icons
 *    epic migrates internal components"; this is monorepo-internal language.
 *    Rewritten to consumer-facing copy.
 *
 * 6. **Status banner** — the upstream "Status — landing in 3.9.0" banner
 *    is dropped. The scaffold ships against shipped `@helixui/icons@1.0.0`
 *    + helix-ui 3.3.1+, so the registry is already live for the consumer.
 *
 * 7. **Brand-vertical-neutral examples** — `library="acme-medical"` is
 *    renamed to a generic `library="brand"` in code samples; the registered
 *    name `acme-medical` is healthcare-coded.
 *
 * The emitter returns `{ relativePath, content }` so scaffold.ts can call
 * `safeWriteFile` against it the same way it iterates `getTokenMdxEmissions`
 * and `getSceneEmissions`. `relativePath` is rooted at the consumer's
 * project directory.
 */

export interface IconographyMdxEmission {
  /** Path relative to the consumer's project directory. */
  relativePath: string;
  /** Full MDX file body (imports + frontmatter + content). */
  content: string;
}

export interface IconographyEmissionContext {
  /** Lowercase tag prefix, e.g. `aurora`. Unused — the page documents
   *  the upstream `hx-icon` tag + `@helixui/icons` registry, both of which
   *  the consumer inherits verbatim. Kept on the signature for symmetry. */
  dsName: string;
  /** PascalCase class form. Unused for the same reason. */
  dsClass: string;
}

export function getIconographyMdxEmission(
  _ctx: IconographyEmissionContext,
): IconographyMdxEmission {
  return {
    relativePath: 'src/stories/foundations/Iconography.mdx',
    content: `{/* Iconography.mdx — Foundations / Iconography */}

import { Meta } from '@storybook/addon-docs/blocks';
import { EyebrowHeading } from '../_components/EyebrowHeading';
import { SectionHead } from '../_components/SectionHead';
import { DocsCard } from '../_components/DocsCard';
import { StatCard } from '../_components/StatCard';
import { CodeBlock } from '../_components/CodeBlock';
import { CodeTabs } from '../_components/CodeTabs';

<Meta
  title="Foundations/Iconography"
  parameters={{ controls: { disable: true }, actions: { disable: true } }}
/>

export const HELIX_GLYPHS = [
  'arrow-down',
  'arrow-flat',
  'arrow-up',
  'calendar',
  'check',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'chevron-up',
  'chevrons-left',
  'chevrons-right',
  'clock',
  'close',
  'copy',
  'dash',
  'dot',
  'ellipsis',
  'error',
  'external-link',
  'eye',
  'eye-off',
  'file',
  'info',
  'lock',
  'menu',
  'plus',
  'star-filled',
  'star-outline',
  'success',
  'trash',
  'upload',
  'warning',
];

export const FA_FREE_SAMPLE = [
  'address-book',
  'bell',
  'bookmark',
  'calendar',
  'chart-line',
  'circle-check',
  'circle-exclamation',
  'circle-info',
  'circle-question',
  'circle-xmark',
  'clipboard',
  'clock',
  'cloud',
  'comment',
  'envelope',
  'eye',
  'file',
  'filter',
  'gear',
  'heart',
  'house',
  'magnifying-glass',
  'pen',
  'star',
  'trash',
  'user',
];

export const SIZES = [
  { name: 'xs', label: '12px' },
  { name: 'sm', label: '16px' },
  { name: 'md', label: '24px' },
  { name: 'lg', label: '32px' },
  { name: 'xl', label: '40px' },
];

<div className="hx-docs">

<EyebrowHeading
  eyebrow="Iconography"
  title="A registry, not an icon set."
  lede={
    <>
      <code>hx-icon</code> resolves names through registered libraries — the same pattern Shoelace
      established and that the WC ecosystem has converged on. <strong>FA Free</strong> is the
      out-of-the-box default. <strong>helix</strong> is the curated internal glyph set powering
      every checkmark, chevron, and status indicator across the library.{' '}
      <strong>Bring your own</strong> — Font Awesome Pro, Phosphor, Heroicons, Material Symbols,
      Iconify, or a brand-internal set — via a one-call registration. Powered by{' '}
      <code>@helixui/icons</code>, a peer dependency required like <code>@helixui/tokens</code>.
    </>
  }
/>

<section>
  <SectionHead title="At a glance" meta="three libraries, one resolution path" />
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: 16,
    }}
  >
    <StatCard
      label="Default library"
      num="fa-free"
      sub="2,000 FA Free Solid v7"
    />
    <StatCard
      label="System library"
      num="helix"
      sub="32 curated internal glyphs"
    />
    <StatCard label="Bring-your-own" num="∞" sub="register any resolver" />
    <StatCard label="Conformance" num="AAA" sub="non-text contrast 1.4.11" />
  </div>
</section>

<section>
  <SectionHead title="The shape" meta="hx-icon library=… name=…" />
  <CodeBlock
    language="html"
    code={\`<!-- Default library — no attribute needed -->
<hx-icon name="heart" hx-size="md"></hx-icon>

<!-- Explicit FA Free -->
<hx-icon library="fa-free" name="user-doctor" hx-size="md"></hx-icon>

<!-- helix system glyph -->
<hx-icon library="helix" name="check" hx-size="sm"></hx-icon>

<!-- Brand-registered library -->
<hx-icon library="brand" name="logo" hx-size="lg"></hx-icon>\`}
  />
</section>

<section>
  <SectionHead title="Live: helix library" meta="32 curated glyphs · paint-mode fill · MIT" />
  <p style={{ marginBottom: 16, maxWidth: '70ch' }}>
    The internal glyph vocabulary every HELiX component renders through. Hand-drawn at 24×24, filled
    silhouettes (no strokes), <code>currentColor</code> only. AAA-validated for WCAG 1.4.11 non-text
    contrast at 16px+ render sizes. Re-register <code>helix</code> with your own resolver to
    override the entire system glyph surface for your brand.
  </p>
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
      gap: 12,
      padding: 20,
      background: 'var(--hx-color-surface-raised)',
      border: '1px solid var(--hx-color-border-default)',
      borderRadius: 12,
    }}
  >
    {HELIX_GLYPHS.map((name) => (
      <div
        key={name}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: 12,
          background: 'var(--hx-color-surface-default)',
          border: '1px solid var(--hx-color-border-subtle, var(--hx-color-border-default))',
          borderRadius: 8,
          color: 'var(--hx-color-text-primary)',
        }}
      >
        <hx-icon library="helix" name={name} hx-size="lg" label={name}></hx-icon>
        <code
          style={{
            fontFamily: 'var(--hx-font-family-mono)',
            fontSize: 11,
            color: 'var(--hx-color-text-muted)',
            textAlign: 'center',
            wordBreak: 'break-word',
          }}
        >
          {name}
        </code>
      </div>
    ))}
  </div>
</section>

<section>
  <SectionHead title="Live: fa-free sample" meta="26 of 2,000 · paint-mode fill · CC BY 4.0" />
  <p style={{ marginBottom: 16, maxWidth: '70ch' }}>
    A representative slice of the bundled <code>fa-free</code> library (Font Awesome Free Solid v7).
    The full set ships 2,000 glyphs at <code>/icons/fa-free-solid.svg</code>; this grid covers
    common UI categories. Browse the full set at{' '}
    <a href="https://fontawesome.com/search?ic=free&o=r&s=solid" target="_blank" rel="noreferrer">
      fontawesome.com
    </a>{' '}
    — every solid glyph is addressable via <code>{'<hx-icon library="fa-free" name="…">'}</code>.
  </p>
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
      gap: 12,
      padding: 20,
      background: 'var(--hx-color-surface-raised)',
      border: '1px solid var(--hx-color-border-default)',
      borderRadius: 12,
    }}
  >
    {FA_FREE_SAMPLE.map((name) => (
      <div
        key={name}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: 12,
          background: 'var(--hx-color-surface-default)',
          border: '1px solid var(--hx-color-border-subtle, var(--hx-color-border-default))',
          borderRadius: 8,
          color: 'var(--hx-color-text-primary)',
        }}
      >
        <hx-icon library="fa-free" name={name} hx-size="lg" label={name}></hx-icon>
        <code
          style={{
            fontFamily: 'var(--hx-font-family-mono)',
            fontSize: 11,
            color: 'var(--hx-color-text-muted)',
            textAlign: 'center',
            wordBreak: 'break-word',
          }}
        >
          {name}
        </code>
      </div>
    ))}
  </div>
</section>

<section>
  <SectionHead title="Bring your own library" meta="registerIconLibrary()" />
  <p style={{ marginBottom: 16, maxWidth: '70ch' }}>
    The same wire-compatible registry pattern Shoelace established. Register a resolver once at app
    bootstrap; every <code>{'<hx-icon library="…">'}</code> call resolves through it. Optional{' '}
    <code>mutator</code> hook lets you enforce <code>fill="currentColor"</code> or strip stroke
    widths for AAA cert needs. Optional <code>spriteSheet: true</code> switches the resolver to
    sprite-href mode for SSR-friendly rendering. Optional{' '}
    <code>paintMode: 'fill' | 'stroke' | 'mixed'</code> tells the AAA harness how to validate the
    library's glyphs.
  </p>

  <CodeTabs
    tabs={[
      {
        label: 'FA Pro',
        language: 'ts',
        code: \`// Font Awesome Pro (paid tier — your license, your assets)
import { registerIconLibrary } from '@helixui/icons';

registerIconLibrary('fa-pro', {
  resolver: (name) => \\\`/assets/fa-pro/svgs/solid/\\\${name}.svg\\\`,
  paintMode: 'fill',
});

// Use:
// <hx-icon library="fa-pro" name="stethoscope"></hx-icon>\`,
      },
      {
        label: 'Iconify',
        language: 'ts',
        code: \`// Iconify — 200,000+ icons across 150+ sets via API
import { registerIconLibrary } from '@helixui/icons';

registerIconLibrary('iconify', {
  resolver: (name) => \\\`https://api.iconify.design/\\\${name}.svg\\\`,
  mutator: (svg) => svg.setAttribute('fill', 'currentColor'),
  paintMode: 'mixed',
});

// Use:
// <hx-icon library="iconify" name="mdi:account-heart"></hx-icon>\`,
      },
      {
        label: 'Phosphor',
        language: 'ts',
        code: \`// Phosphor — 9,000+ icons across 6 weights
import { registerIconLibrary } from '@helixui/icons';

registerIconLibrary('phosphor', {
  resolver: (name) =>
    \\\`https://unpkg.com/@phosphor-icons/core/assets/regular/\\\${name}.svg\\\`,
  paintMode: 'stroke',
});

// Use:
// <hx-icon library="phosphor" name="heart"></hx-icon>\`,
      },
      {
        label: 'Brand sprite',
        language: 'ts',
        code: \`// Self-hosted brand sprite — one fetch, all icons cached
import { registerIconLibrary } from '@helixui/icons';

registerIconLibrary('brand', {
  resolver: (name) => \\\`/assets/brand-sprite.svg#\\\${name}\\\`,
  spriteSheet: true,
  paintMode: 'fill',
});

// Use:
// <hx-icon library="brand" name="logo"></hx-icon>\`,
      },
    ]}
  />
</section>

<section>
  <SectionHead title="Sizes" meta="hx-size · 12 · 16 · 24 · 32 · 40 px" />
  <div
    style={{
      display: 'flex',
      gap: 24,
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      padding: 24,
      background: 'var(--hx-color-surface-raised)',
      border: '1px solid var(--hx-color-border-default)',
      borderRadius: 12,
    }}
  >
    {SIZES.map((s) => (
      <div
        key={s.name}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <hx-icon library="helix" name="check" hx-size={s.name} label={\`Check \${s.name}\`}></hx-icon>
        <div
          style={{
            fontFamily: 'var(--hx-font-family-mono)',
            fontSize: 11,
            color: 'var(--hx-color-text-muted)',
            textAlign: 'center',
          }}
        >
          {s.name}
          <br />
          {s.label}
        </div>
      </div>
    ))}
  </div>
</section>

<section>
  <SectionHead title="Pairing with text" meta="--hx-icon-color: currentColor" />
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 16,
    }}
  >
    <DocsCard title="Inline with body text" tag="hx-icon + p">
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--hx-color-text-success, var(--hx-color-text-primary))',
          marginBottom: 12,
        }}
      >
        <hx-icon library="helix" name="success" hx-size="sm"></hx-icon>
        <span>Records uploaded successfully</span>
      </div>
      <p>
        Icon picks up <code>currentColor</code> by default — pair semantically with{' '}
        <code>--hx-color-text-success</code> or <code>--hx-color-text-error</code> to signal status.
      </p>
    </DocsCard>
    <DocsCard title="Leading icon in a control" tag="hx-button + hx-icon">
      <button
        style={{
          appearance: 'none',
          border: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 16px',
          minHeight: 44,
          borderRadius: 'var(--hx-border-radius-md, 6px)',
          background: 'var(--hx-color-action-primary-bg, #0F7078)',
          color: '#fff',
          fontWeight: 500,
          font: 'inherit',
          marginBottom: 12,
        }}
        type="button"
      >
        <hx-icon library="helix" name="plus" hx-size="sm"></hx-icon>
        Add member
      </button>
      <p>
        Always pair an icon-only control with an <code>aria-label</code>; for text+icon controls
        keep the icon decorative so the label is not announced twice.
      </p>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="Accessibility" meta="WCAG 2.2 AAA · forced-colors · 1.4.11" />
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 16,
    }}
  >
    <DocsCard title="Decorative by default" tag="aria-hidden">
      <code style={{ fontSize: 13 }}>{'<hx-icon name="check"></hx-icon>'}</code>
      <p>
        With no <code>label</code>, <code>aria-hidden="true"</code> is applied and the SVG is hidden
        from assistive technology. This is the right default — the surrounding text is the
        accessible name.
      </p>
    </DocsCard>
    <DocsCard title="Labeled when standalone" tag="role=img + aria-label">
      <code style={{ fontSize: 13 }}>{'<hx-icon name="error" label="Critical"></hx-icon>'}</code>
      <p>
        A non-empty <code>label</code> opts into <code>role="img"</code> + <code>aria-label</code> +{' '}
        <code>{'<title>'}</code>. Use only when the icon carries meaning that no adjacent text
        conveys.
      </p>
    </DocsCard>
    <DocsCard title="Forced-colors safe" tag="System Colors via currentColor">
      <code style={{ fontSize: 13 }}>{'fill: currentColor; stroke: currentColor;'}</code>
      <p>
        Every glyph in the <code>helix</code> library uses <code>currentColor</code> exclusively.
        FA Free Solid is normalized to <code>currentColor</code> at sprite-build time. High-contrast
        and forced-colors modes flow through the parent's text token automatically.
      </p>
    </DocsCard>
    <DocsCard title="Non-text contrast 1.4.11" tag="≥3:1 against background">
      <code style={{ fontSize: 13 }}>{'iconLibraryAaaVerdict("helix")'}</code>
      <p>
        Both built-in libraries are validated against WCAG 2.2 1.4.11 at minimum render size.
        Custom libraries inherit the same harness — call <code>iconLibraryAaaVerdict(name)</code>{' '}
        to verify before claiming AAA on icon glyphs.
      </p>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="Escape hatches" meta="when the registry isn't right" />
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: 16,
    }}
  >
    <DocsCard title="Explicit sprite URL" tag="sprite-url + name">
      <code style={{ fontSize: 13 }}>
        {'<hx-icon name="logo" sprite-url="/brand.svg"></hx-icon>'}
      </code>
      <p>
        Skip registry entirely — point at a self-hosted sprite, render{' '}
        <code>{'<svg><use href="/brand.svg#logo">'}</code>. Useful for single-page brand assets
        where registering a library is overkill.
      </p>
    </DocsCard>
    <DocsCard title="Inline fetch + sanitize" tag="src=URL">
      <code style={{ fontSize: 13 }}>{'<hx-icon src="/icons/foo.svg"></hx-icon>'}</code>
      <p>
        Fetch + DOMParser sanitize + inject. Strips <code>{'<script>'}</code>,{' '}
        <code>{'<foreignObject>'}</code>, SMIL animations, <code>on*</code> handlers,{' '}
        <code>javascript:</code>/<code>data:</code> URIs. Same-origin by default; explicit allowlist
        via <code>allowed-origins</code>.
      </p>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="Don't" meta="anti-patterns" />
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 16,
    }}
  >
    <DocsCard title="Don't bundle FA Pro" tag="license + bundle">
      <p>
        Register a resolver pointing at your own CDN or static assets — never inline FA Pro SVGs
        into your application bundle. The license requires their distribution to flow from you, not
        through us.
      </p>
    </DocsCard>
    <DocsCard title="Don't scale below 12px" tag="contrast breaks">
      <p>
        Below 12px, glyph fills alias against pixel boundaries and 1.4.11 non-text contrast becomes
        unreliable. Use <code>hx-size="xs"</code> as the floor.
      </p>
    </DocsCard>
    <DocsCard title="Don't pair filled with stroked" tag="visual weight">
      <p>
        Mixing fill and stroke styles in the same composition reads as inconsistency. The built-in{' '}
        <code>helix</code> + <code>fa-free</code> libraries are both fill-only and mix cleanly.
        Stroke-style libraries (Lucide, Phosphor regular) declare <code>paintMode: 'stroke'</code>{' '}
        at registration so the harness can validate them.
      </p>
    </DocsCard>
    <DocsCard title="Don't hardcode color" tag="forced-colors">
      <p>
        Always set <code>--hx-icon-color</code> via a token reference. Hardcoded fills break
        forced-colors mode and prevent <code>currentColor</code> inheritance from the parent text
        token.
      </p>
    </DocsCard>
  </div>
</section>

</div>
`,
  };
}
