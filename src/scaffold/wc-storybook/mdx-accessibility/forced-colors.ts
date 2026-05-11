import type {
  AccessibilityEmissionContext,
  AccessibilityMdxEmission,
} from '../mdx-accessibility.js';

// IMPORTS_BASE / SHARED constants kept in the parent module.
const IMPORTS_BASE = `import { Meta } from '@storybook/addon-docs/blocks';`;

// ---------------------------------------------------------------------------
// ForcedColors.mdx — Windows High Contrast contract.
// ---------------------------------------------------------------------------

export function emitForcedColorsMdx({
  dsName,
}: AccessibilityEmissionContext): AccessibilityMdxEmission {
  return {
    relativePath: 'src/stories/accessibility/ForcedColors.mdx',
    content: `{/* Accessibility / Forced Colors.mdx — forced-colors mode contract for the design system surface */}

${IMPORTS_BASE}
import { EyebrowHeading } from '../_components/EyebrowHeading';
import { SectionHead } from '../_components/SectionHead';
import { StatCard } from '../_components/StatCard';
import { DocsCard } from '../_components/DocsCard';
import { CodeBlock } from '../_components/CodeBlock';
import { CodeTabs } from '../_components/CodeTabs';
import {
  FORCED_COLORS_BUTTON_CSS,
  FORCED_COLORS_DONT_CSS,
  FORCED_COLORS_DO_CSS,
} from './_snippets';

import '@helixui/library/components/hx-button';
import '@helixui/library/components/hx-badge';

<Meta
  title="Accessibility/Forced Colors"
  parameters={{ controls: { disable: true }, actions: { disable: true } }}
/>

<div className="hx-docs">

<EyebrowHeading
  eyebrow="Accessibility · forced-colors"
  title="Windows High Contrast is a first-class mode, not a fallback."
  lede={
    <>
      When a user enables Windows High Contrast (or any other forced-colors theme), the browser
      overrides author colours with a small palette of <strong>system color keywords</strong>.
      Components honour that contract: every interactive surface remains identifiable, every
      focus ring stays visible, every state stays distinguishable — without leaking author
      colours that would defeat the user's stylesheet.
    </>
  }
/>

<section>
  <SectionHead title="The forced-colors contract" meta="WCAG 2.1 · 1.4.1, 1.4.11, 2.4.7, 2.4.13" />
  <div className="hx-docs-stats">
    <StatCard num="100" unit="%" label="Components covered" sub="every interactive primitive" />
    <StatCard num="7" label="System keywords used" sub="CanvasText · Canvas · Highlight · ..." />
    <StatCard
      num="scoped"
      label="forced-color-adjust: none"
      sub="opt-outs preserve focus rings + status indicators"
    />
    <StatCard num="2" unit="px" label="Focus ring preserved" sub="renders as Highlight" />
  </div>
</section>

<section>
  <SectionHead title="System color keywords we rely on" meta="CSS Color Module 4" />
  <p className="hx-docs-card-body">
    Forced-colors mode swaps your declared colours for one of seven user-controlled keywords.
    Component CSS selects the right keyword by role inside an{' '}
    <code>@media (forced-colors: active)</code> block, so the component still communicates
    structure even when the author palette is gone.
  </p>

  <div className="hx-docs-card-grid">
    <DocsCard title="CanvasText" tag="Default text colour">
      <p className="hx-docs-card-body">Body copy, labels, headings.</p>
    </DocsCard>
    <DocsCard title="Canvas" tag="Default background">
      <p className="hx-docs-card-body">Surfaces, panels, page background.</p>
    </DocsCard>
    <DocsCard title="LinkText" tag="Unvisited link">
      <p className="hx-docs-card-body">Anchor text, action links.</p>
    </DocsCard>
    <DocsCard title="VisitedText" tag="Visited link">
      <p className="hx-docs-card-body">Anchors after navigation.</p>
    </DocsCard>
    <DocsCard title="ButtonText" tag="Button label">
      <p className="hx-docs-card-body">Button + form-control text.</p>
    </DocsCard>
    <DocsCard title="ButtonFace" tag="Button background">
      <p className="hx-docs-card-body">Button + form-control surfaces.</p>
    </DocsCard>
    <DocsCard title="Highlight" tag="Selection / focus accent">
      <p className="hx-docs-card-body">Focus rings, selected items, active states.</p>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="What a component looks like in forced-colors" meta="${dsName}-button, lit" />
  <p className="hx-docs-card-body">
    The pattern below is the canonical{' '}
    <code>@media (forced-colors: active)</code> block. The author CSS still resolves all the
    design-token cascading; the forced-colors block layers on top, mapping the resolved roles to
    system keywords. Notice we never reach for{' '}
    <code>forced-color-adjust: none</code> — every keyword is supplied by the user agent, so the
    user's stylesheet wins.
  </p>

  <CodeBlock language="css" filename="${dsName}-button.styles.ts" code={FORCED_COLORS_BUTTON_CSS} />
</section>

<section>
  <SectionHead title="Live preview" meta="emulate to see it" />
  <p className="hx-docs-card-body">
    The buttons below render with the standard token palette. To verify the forced-colors
    mapping, use Chrome DevTools <strong>Rendering panel → Emulate CSS media feature
    forced-colors: active</strong>, or enable <strong>Settings → Accessibility → High Contrast
    mode</strong> on Windows. In forced-colors mode the buttons render with the user's chosen
    palette; the focus ring stays at <code>Highlight</code> with 2px offset.
  </p>

  <div className="hx-docs-specimen">
    <span className="hx-docs-specimen-label">Demo specimen · standard mode</span>
    <p className="hx-docs-specimen-caption">
      Buttons below render with the standard token palette. Toggle the DevTools forced-colors
      emulator (or your OS HC theme) to see the same elements re-render against{' '}
      <code>ButtonFace</code> / <code>Highlight</code> — the contract holds in both directions.
    </p>
    <div className="hx-docs-specimen-grid">
      <${dsName}-button variant="primary">Primary action</${dsName}-button>
      <${dsName}-button variant="secondary">Secondary</${dsName}-button>
      <${dsName}-button variant="ghost">Ghost</${dsName}-button>
      <${dsName}-button variant="danger">Danger</${dsName}-button>
      <${dsName}-button variant="primary" disabled>Disabled</${dsName}-button>
      <${dsName}-button variant="primary" className="force-focus">Focused</${dsName}-button>
    </div>
  </div>
</section>

<section>
  <SectionHead title="How to test" meta="three reliable paths" />
  <div className="hx-docs-card-grid">
    <DocsCard title="Chrome / Edge DevTools" tag="fastest, cross-platform">
      <ol>
        <li>Open DevTools → <em>Rendering</em> tab</li>
        <li>Find <em>Emulate CSS media feature forced-colors</em></li>
        <li>Switch to <strong>active</strong></li>
        <li>Combine with <em>prefers-color-scheme: dark</em> for HC dark</li>
      </ol>
    </DocsCard>
    <DocsCard title="Windows High Contrast" tag="real palette, real users">
      <ol>
        <li>Settings → Accessibility → Contrast themes</li>
        <li>Pick <strong>Aquatic</strong>, <strong>Desert</strong>, <strong>Dusk</strong>, or <strong>Night sky</strong></li>
        <li>Components inherit the chosen theme's keywords</li>
        <li>Verify all interactive elements stay distinguishable</li>
      </ol>
    </DocsCard>
    <DocsCard title="Firefox" tag="prefers-contrast: more">
      <ol>
        <li>about:config → <code>ui.systemUsesDarkTheme = 1</code></li>
        <li>Enable <strong>Always use system colors</strong> in Settings</li>
        <li>Pair with the OS HC theme for full coverage</li>
      </ol>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="Anti-patterns we never ship" meta="things that defeat the user's stylesheet" />
  <CodeTabs
    tabs={[
      { label: "Don't", language: 'css', filename: 'never-do-this.css', code: FORCED_COLORS_DONT_CSS },
      { label: 'Do', language: 'css', filename: 'pattern.css', code: FORCED_COLORS_DO_CSS },
    ]}
    persistKey="forced-colors-pattern"
  />
</section>

<section>
  <SectionHead title="Cross-references" meta="dig deeper" />
  <div className="hx-docs-card-grid">
    <DocsCard title="Dashboard" tag="Accessibility / Dashboard">
      <p className="hx-docs-card-body">
        Roll-up of the conformance posture, contrast pairings, and success-criteria coverage.
      </p>
    </DocsCard>
    <DocsCard title="Contrast deep-dive" tag="Accessibility / Contrast Deep-Dive">
      <p className="hx-docs-card-body">
        Every text-on-surface pair, per mode, with the math and the rationale for AA-only pairs.
      </p>
    </DocsCard>
    <DocsCard title="Focus management" tag="Accessibility / Focus Management">
      <p className="hx-docs-card-body">
        How the 2px focus ring contract interacts with <code>Highlight</code> in forced-colors.
      </p>
    </DocsCard>
  </div>
</section>

</div>
`,
  };
}
