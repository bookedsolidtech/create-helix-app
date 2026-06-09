import type { AccessibilityMdxEmission } from '../mdx-accessibility.js';

// IMPORTS_BASE / SHARED constants kept in the parent module.
const IMPORTS_BASE = `import { Meta } from '@storybook/addon-docs/blocks';`;

// ---------------------------------------------------------------------------
// ContrastDeepDive.mdx — per-mode contrast rationale + the math.
// ---------------------------------------------------------------------------

export function emitContrastDeepDiveMdx(): AccessibilityMdxEmission {
  return {
    relativePath: 'src/stories/accessibility/ContrastDeepDive.mdx',
    content: `{/* Accessibility / Contrast Deep-Dive.mdx — per-mode contrast rationale + the math */}

${IMPORTS_BASE}
import { EyebrowHeading } from '../_components/EyebrowHeading';
import { SectionHead } from '../_components/SectionHead';
import { StatCard } from '../_components/StatCard';
import { DocsCard } from '../_components/DocsCard';
import { ContrastMatrix } from '../_components/ContrastMatrix';
import { CodeBlock } from '../_components/CodeBlock';
import { CONTRAST_RATIO_TS, REGENERATE_CONTRAST_BASH } from './_snippets';

<Meta
  title="Accessibility/Contrast Deep-Dive"
  parameters={{ controls: { disable: true }, actions: { disable: true } }}
/>

<div className="hx-docs">

<EyebrowHeading
  eyebrow="Accessibility · contrast deep-dive"
  title="163 pairings, 3 modes, 0 below the floor — and we show our work."
  lede={
    <>
      The Dashboard reports the headline numbers; this page is the underlying ledger. Every
      text-on-surface pair across light, dark, and high-contrast — the measured ratio, the WCAG
      threshold, the classification, and (where AA only) the rationale for not pushing to AAA.
      Regenerate any time via your tokens-build contrast script.
    </>
  }
/>

<section>
  <SectionHead title="Roll-up by mode" meta="0 sub-AA across the cascade" />
  <div className="hx-docs-stats">
    <StatCard num="59" label="Light pairs" sub="29 AAA · 30 AA · 0 sub-AA" />
    <StatCard num="58" label="Dark pairs" sub="31 AAA · 27 AA · 0 sub-AA" />
    <StatCard num="46" label="HC pairs" sub="43 AAA · 3 AA · 0 sub-AA" />
    <StatCard num="163" label="Total · 0 sub-AA" sub="103 AAA · 60 AA" />
  </div>
</section>

<section>
  <SectionHead title="The thresholds" meta="WCAG 2.1 · 1.4.3, 1.4.6, 1.4.11" />
  <p className="hx-docs-card-body">
    The system classifies every pair against three thresholds. The matrix below colour-codes
    each pair against these bands.
  </p>

  <div className="hx-docs-card-grid">
    <DocsCard title="AA · normal text" tag="4.5 : 1">
      <p className="hx-docs-card-body">WCAG 1.4.3 — minimum text contrast.</p>
    </DocsCard>
    <DocsCard title="AA · large text" tag="3.0 : 1">
      <p className="hx-docs-card-body">>=18pt regular or >=14pt bold.</p>
    </DocsCard>
    <DocsCard title="AA · UI components" tag="3.0 : 1">
      <p className="hx-docs-card-body">WCAG 1.4.11 — borders, focus, icon affordances.</p>
    </DocsCard>
    <DocsCard title="AAA · normal text" tag="7.0 : 1">
      <p className="hx-docs-card-body">WCAG 1.4.6 — enhanced contrast (system target).</p>
    </DocsCard>
    <DocsCard title="AAA · large text" tag="4.5 : 1">
      <p className="hx-docs-card-body">WCAG 1.4.6 — enhanced large text.</p>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="Light mode matrix" meta="59 pairs · surface.{default,raised,sunken} backgrounds" />
  <p className="hx-docs-card-body">
    Body text on every published surface, every status colour on its semantic surface, every
    interactive border. Each row's ratio is computed with WCAG's relative-luminance formula on
    the resolved hex value of both tokens.
  </p>
  <ContrastMatrix mode="light" />
</section>

<section>
  <SectionHead title="Dark mode matrix" meta="58 pairs · re-graded for the dark surface palette" />
  <p className="hx-docs-card-body">
    Dark mode is not a colour invert — every text-on-surface pair is re-tuned. Some semantic
    roles (success-text, warning-text) shift up the ramp in dark mode to maintain the AA floor;
    the matrix shows the result.
  </p>
  <ContrastMatrix mode="dark" />
</section>

<section>
  <SectionHead title="High-contrast matrix" meta="46 pairs · 91% AAA, 0 sub-AA" />
  <p className="hx-docs-card-body">
    High-contrast mode targets AAA on the structural surfaces and tightens the AA floor for
    everything else. This is the mode to inspect when validating that HC consumers — including
    Windows users on a forced-colors theme that defers to author CSS — get full readability.
  </p>
  <ContrastMatrix mode="high-contrast" />
</section>

<section>
  <SectionHead title="Why some pairs sit at AA, not AAA" meta="the rationale" />
  <p className="hx-docs-card-body">
    A small number of pairs sit at AA (>=4.5 : 1) without crossing the AAA threshold (>=7 : 1).
    In every case, the pair is one of the four categories below. None of them ship below the AA
    floor.
  </p>

  <div className="hx-docs-card-grid">
    <DocsCard title="Status accent text" tag="success / warning / error">
      <p className="hx-docs-card-body">
        Status colours sit on a chromatic ramp (green / amber / red) that is hue-bound by
        convention. Pushing to AAA would desaturate the cue past the point of recognition. We
        hold AA + pair the colour with an icon and a text label so the cue is >=3 channels.
      </p>
    </DocsCard>
    <DocsCard title="Action button text" tag="primary on accent">
      <p className="hx-docs-card-body">
        White text on the brand accent (e.g. <code>action.primary.bg</code>) is AA. Lifting to
        AAA would force every brand to a near-black accent — incompatible with the white-label
        contract. Brands extending beyond the AAA floor opt in via the brand registry.
      </p>
    </DocsCard>
    <DocsCard title="UI component borders" tag=">=3:1 floor, AAA N/A">
      <p className="hx-docs-card-body">
        WCAG 1.4.11 sets the bar at 3 : 1 for non-text UI components — there is no AAA tier for
        borders, focus rings, or icon affordances. We measure them in the matrix anyway so the
        floor is visible.
      </p>
    </DocsCard>
    <DocsCard title="Muted secondary text" tag="metadata · 4.5 : 1+ floor">
      <p className="hx-docs-card-body">
        Tertiary metadata (timestamps, "12 results", trailing labels) sits between AA and AAA so
        primary content reads first. Pushing all secondary text to AAA flattens the hierarchy.
      </p>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="The math, briefly" meta="WCAG 2.1 relative-luminance formula" />
  <p className="hx-docs-card-body">
    The contrast generator turns each token's resolved hex into the WCAG 2.1 contrast ratio.
    Below is the canonical implementation it uses — pure, deterministic, no dependency on a
    colour library. Reproduce the matrix locally with this and the cached contrast report.
  </p>

  <CodeBlock language="ts" filename="contrast.ts" code={CONTRAST_RATIO_TS} />
</section>

<section>
  <SectionHead title="Regenerating the matrix" meta="single command, deterministic output" />
  <CodeBlock
    language="bash"
    filename="regenerate-contrast-report.sh"
    code={REGENERATE_CONTRAST_BASH}
  />
</section>

<section>
  <SectionHead title="Cross-references" meta="dig deeper" />
  <div className="hx-docs-card-grid">
    <DocsCard title="Foundations / Color" tag="three-tier cascade">
      <p className="hx-docs-card-body">
        How the primitive ramps anchor the semantic surfaces that this matrix grades.
      </p>
    </DocsCard>
    <DocsCard title="Forced colors" tag="Accessibility / Forced Colors">
      <p className="hx-docs-card-body">
        The matrix above is the author-mode ledger. Forced-colors mode delegates to the user
        palette — see the forced-colors page for that contract.
      </p>
    </DocsCard>
    <DocsCard title="Dashboard" tag="Accessibility / Dashboard">
      <p className="hx-docs-card-body">
        The roll-up of all the numbers above plus the rest of the AAA conformance posture.
      </p>
    </DocsCard>
  </div>
</section>

</div>
`,
  };
}
