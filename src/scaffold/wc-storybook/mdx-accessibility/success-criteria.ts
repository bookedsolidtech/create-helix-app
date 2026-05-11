import type { AccessibilityMdxEmission } from '../mdx-accessibility.js';

// IMPORTS_BASE / SHARED constants kept in the parent module.
const IMPORTS_BASE = `import { Meta } from '@storybook/addon-docs/blocks';`;

// ---------------------------------------------------------------------------
// SuccessCriteria.mdx — WCAG SC ledger + 7-gate release quality bar.
// Mostly copy-faithful; no healthcare content to rewrite.
// ---------------------------------------------------------------------------

export function emitSuccessCriteriaMdx(): AccessibilityMdxEmission {
  return {
    relativePath: 'src/stories/accessibility/SuccessCriteria.mdx',
    content: `{/* Accessibility / Success Criteria.mdx — WCAG SC ledger + release-quality bar */}

${IMPORTS_BASE}
import { EyebrowHeading } from '../_components/EyebrowHeading';
import { SectionHead } from '../_components/SectionHead';
import { StatCard } from '../_components/StatCard';
import { DocsCard } from '../_components/DocsCard';

<Meta
  title="Accessibility/Success Criteria"
  parameters={{ controls: { disable: true }, actions: { disable: true } }}
/>

<div className="hx-docs">

<EyebrowHeading
  eyebrow="Accessibility · Conformance bar"
  title="How we know we're AAA — the success criteria + the release gate."
  lede={
    <>
      Two ledgers, one bar. The <strong>WCAG success criteria</strong> below enumerate every
      conformance row this design system commits to — Level A, AA, and the AAA targets we hit on
      the P0 surface. The <strong>release quality bar</strong> further down lists the build-time
      gates that block any merge below the floor. A criterion without a test is a marketing
      claim. Every row here cites both.
    </>
  }
/>

<section>
  <SectionHead title="At a glance" meta="WCAG 2.1 · evidence-backed" />
  <div className="hx-docs-stats">
    <StatCard num="21" label="Success criteria tracked" sub="A · AA · AAA highlights" />
    <StatCard num="7" label="Release-quality gates" sub="all green or no merge" />
    <StatCard num="0" unit=" gaps" label="Untested SCs in P0" sub="every row has a method" />
    <StatCard num="2.1" label="WCAG version" sub="2.2 audit pending" />
  </div>
</section>

<section>
  <SectionHead
    title="WCAG success criteria — the ledger"
    meta="A & AA committed across all components · AAA on P0"
  />
  <p className="hx-docs-card-body">
    Each row pairs a WCAG success criterion with the test that proves it. Status reflects the
    P0 surface; non-P0 components are committed to A/AA but may have AAA work pending. Cited
    methods are the primary evidence path — most rows have multiple corroborating signals.
  </p>

  <div className="hx-docs-sc-table">
    {[
      ['1.1.1', 'Non-text content', 'A', 'pass', 'axe-core: image-alt, role-img-alt'],
      ['1.3.1', 'Info & relationships', 'A', 'pass', 'axe-core: aria-* + landmarks'],
      ['1.3.2', 'Meaningful sequence', 'A', 'pass', 'play(): tab-order assertion'],
      ['1.4.1', 'Use of colour', 'A', 'pass', 'manual + design-token review'],
      ['1.4.3', 'Contrast (minimum) >= 4.5:1', 'AA', 'pass', 'contrast report (CI)'],
      ['1.4.4', 'Resize text to 200%', 'AA', 'pass', 'rem-only typography · VRT'],
      ['1.4.6', 'Contrast (enhanced) >= 7:1', 'AAA', 'in-progress', 'contrast report (P0)'],
      ['1.4.10', 'Reflow at 320px', 'AA', 'pass', 'VRT viewport matrix'],
      ['1.4.11', 'Non-text contrast >= 3:1', 'AA', 'pass', 'contrast report (UI)'],
      ['1.4.12', 'Text spacing', 'AA', 'pass', 'logical-property author rules'],
      ['1.4.13', 'Content on hover/focus', 'AA', 'pass', 'play(): dismissible · persistent · hoverable'],
      ['2.1.1', 'Keyboard', 'A', 'pass', 'play(): keydown matrix per pattern'],
      ['2.1.2', 'No keyboard trap', 'A', 'pass', 'play(): tab cycles + escape'],
      ['2.4.3', 'Focus order', 'A', 'pass', 'play(): expected sequence'],
      ['2.4.7', 'Focus visible', 'AA', 'pass', 'VRT :focus-visible specimens'],
      ['2.5.5', 'Target size (enhanced) >= 44x44', 'AAA', 'pass', 'CSS min-height + VRT'],
      ['3.3.1', 'Error identification', 'A', 'pass', 'aria-invalid + aria-describedby'],
      ['3.3.3', 'Error suggestion', 'AA', 'pass', 'doc-required field + axe label-content-name-mismatch'],
      ['3.3.4', 'Error prevention (legal)', 'AA', 'manual', 'destructive-confirm pattern review'],
      ['4.1.2', 'Name, role, value', 'A', 'pass', 'axe-core: aria-required-attr · aria-valid-attr-value'],
      ['4.1.3', 'Status messages', 'AA', 'pass', 'live-region pattern · play() reader-text assertion'],
    ].map(([num, name, grade, status, method]) => (
      <div key={num} className="hx-docs-sc-row" data-status={status}>
        <span className="hx-docs-sc-num">{num}</span>
        <span className="hx-docs-sc-name"><strong>{name}</strong></span>
        <span className="hx-docs-sc-grade" data-status={status}>{grade}</span>
        <span className="hx-docs-sc-method">{method}</span>
      </div>
    ))}
  </div>

  <p className="hx-docs-card-body" style={{ fontSize: 12 }}>
    Methods key: <strong>axe-core</strong> = rule run in the per-story a11y addon;{' '}
    <strong>play()</strong> = Storybook interaction test (Vitest browser mode);{' '}
    <strong>VRT</strong> = visual regression snapshot; <strong>contrast report</strong> = the
    cached output of your tokens-build contrast scan; <strong>manual</strong> = expert review,
    no automated rule covers this SC reliably. Per industry research, axe-core surfaces roughly
    half of accessibility issues found in real-world audits — but only the subset of WCAG SCs
    whose violations have a deterministic machine signature.
  </p>
</section>

<section>
  <SectionHead
    title="Release quality bar — seven gates"
    meta="all green · or no merge · enforced in CI"
  />
  <p className="hx-docs-card-body">
    The success criteria above describe the goal; these seven gates describe how every PR is
    measured against it. The pipeline blocks merge on any failure — there is no override path
    for accessibility regressions.
  </p>

  <div className="hx-docs-card-grid">
    <DocsCard title="1 · TypeScript strict" tag="automated">
      <p className="hx-docs-card-body">
        <code>npm run type-check</code> — zero errors, no <code>any</code>, no
        <code>{'@' + 'ts-ignore'}</code>.
      </p>
    </DocsCard>
    <DocsCard title="2 · Test suite" tag="automated">
      <p className="hx-docs-card-body">
        <code>npm run test</code> — 100% pass; coverage floor on changed surface.
      </p>
    </DocsCard>
    <DocsCard title="3 · Accessibility" tag="automated">
      <p className="hx-docs-card-body">
        axe-core (per-story) + play() assertions — zero critical / serious axe violations.
      </p>
    </DocsCard>
    <DocsCard title="4 · Storybook coverage" tag="review">
      <p className="hx-docs-card-body">
        Stories for every variant + state. Reviewer checks the catalog tree before approving.
      </p>
    </DocsCard>
    <DocsCard title="5 · CEM accuracy" tag="automated">
      <p className="hx-docs-card-body">
        <code>npm run cem</code> — manifest matches actual public API; drift fails CI.
      </p>
    </DocsCard>
    <DocsCard title="6 · Bundle size" tag="automated">
      <p className="hx-docs-card-body">
        Per-component size analysis with a budget per component (min+gz) and a total cap.
      </p>
    </DocsCard>
    <DocsCard title="7 · Code review" tag="review">
      <p className="hx-docs-card-body">
        Tiered review (component author → senior → chief reviewer) plus an automated reviewer
        bot, all green before merge.
      </p>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="What we do not claim — yet" meta="honest gaps · upgrade path documented" />
  <div className="hx-docs-card-grid">
    <DocsCard title="WCAG 2.2" tag="audit pending">
      <p className="hx-docs-card-body">
        This design system targets WCAG 2.1. The 2.2 additions (Focus Not Obscured, Dragging
        Movements, Target Size minimum) are tracked but not formally claimed until the audit
        artefacts ship. Several 2.2 SCs (notably 2.5.8 Target Size minimum 24x24) are already
        met via the AAA 2.5.5 >=44x44 rule we hit today.
      </p>
    </DocsCard>
    <DocsCard title="Cognitive AAA SCs" tag="3.1.5 · 3.1.6 · scope-limited">
      <p className="hx-docs-card-body">
        Reading-level (3.1.5) and Pronunciation (3.1.6) are content-side SCs. The component
        library provides the primitives (plain-language defaults, ruby support); the consuming
        app owns the content that fulfills them.
      </p>
    </DocsCard>
    <DocsCard title="VPAT 2.5" tag="scaffolded · publish on P0 cert">
      <p className="hx-docs-card-body">
        A formal VPAT 2.5 (ITI ICT Accessibility Testing Initiative template) is scaffolded for
        the P0 surface and publishes when the P0 components reach AAA evidence in production.
        Until then, the SC ledger above is the machine-checkable substitute and is updated on
        every release.
      </p>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="Cross-references" meta="related deep-dives" />
  <ul className="hx-docs-link-list">
    <li>
      <a href="/?path=/docs/accessibility-dashboard--docs">Accessibility · Dashboard (overview + headline numbers)</a>
    </li>
    <li>
      <a href="/?path=/docs/accessibility-consumer-obligations--docs">Consumer Obligations (partial-AAA SC contracts)</a>
    </li>
    <li>
      <a href="/?path=/docs/accessibility-contrast-deep-dive--docs">Contrast Deep-Dive (per-mode pair table)</a>
    </li>
    <li>
      <a href="/?path=/docs/accessibility-keyboard-contracts--docs">Keyboard Contracts (per-pattern keydown maps)</a>
    </li>
    <li>
      <a href="/?path=/docs/accessibility-focus-management--docs">Focus Management (trap · restore · roving tabindex)</a>
    </li>
    <li>
      <a href="/?path=/docs/accessibility-forced-colors--docs">Forced Colors (Windows HC + system keywords)</a>
    </li>
  </ul>
</section>

</div>
`,
  };
}
