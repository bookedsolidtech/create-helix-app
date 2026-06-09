import type {
  AccessibilityEmissionContext,
  AccessibilityMdxEmission,
} from '../mdx-accessibility.js';

// IMPORTS_BASE / SHARED constants kept in the parent module.
const IMPORTS_BASE = `import { Meta } from '@storybook/addon-docs/blocks';`;

// ---------------------------------------------------------------------------
// Dashboard.mdx — high-level accessibility posture overview.
// Healthcare-vertical "patient list / chart / triage outcomes" copy
// rewritten to neutral SaaS examples (member ID lookup, account verification,
// triage-outcomes-by-category becomes a generic three-band stat distribution).
// ---------------------------------------------------------------------------

export function emitDashboardMdx({
  dsName,
}: AccessibilityEmissionContext): AccessibilityMdxEmission {
  return {
    relativePath: 'src/stories/accessibility/Dashboard.mdx',
    content: `{/* Accessibility / Dashboard.mdx — overview of the AAA conformance posture */}

${IMPORTS_BASE}
import { EyebrowHeading } from '../_components/EyebrowHeading';
import { SectionHead } from '../_components/SectionHead';
import { StatCard } from '../_components/StatCard';
import { RatioCard } from '../_components/RatioCard';
import { DocsCard } from '../_components/DocsCard';

import '@helixui/library/components/hx-button';
import '@helixui/library/components/hx-badge';
import '@helixui/library/components/hx-text-input';

<Meta
  title="Accessibility/Dashboard"
  parameters={{ controls: { disable: true }, actions: { disable: true } }}
/>

<div className="hx-docs">

<EyebrowHeading
  eyebrow="Accessibility · AAA conformance dashboard"
  title="WCAG AAA is the target. AA is the floor we never touch."
  lede={
    <>
      This design system targets <strong>Level AAA on its P0 surface</strong>. Contrast
      pairings graded across light, dark, and high-contrast modes; APG-aligned
      keyboard contracts on every interactive primitive; <strong>zero sub-AA
      tokens</strong>. Adding a token below the floor fails CI.
    </>
  }
/>

<section>
  <SectionHead title="Coverage at a glance" meta="regression-tested in CI" />
  <div className="hx-docs-stats">
    <StatCard num="163" unit="/163" label="Contrast pairings AA+" sub="across 3 modes · 0 sub-AA" />
    <StatCard num="100" unit="%" label="P0 components AAA-targeted" sub="VPAT 2.5 scaffolded" />
    <StatCard num="3" label="Theme modes" sub="light · dark · high-contrast" />
    <StatCard num="0" label="axe-core violations" sub="critical + serious" />
  </div>
</section>

<section>
  <SectionHead
    title="Focus indicators — what every primitive ships"
    meta="WCAG 2.4.7 + 1.4.11 · :focus-visible only"
  />

  <div className="hx-docs-specimen">
    <span className="hx-docs-specimen-label">Demo specimen · focus rings forced visible</span>
    <p className="hx-docs-specimen-caption">
      The borders below <strong>ARE</strong> the focus ring — 2px solid, 2px offset, AAA contrast
      against any surface. Every interactive primitive renders this ring on{' '}
      <code>:focus-visible</code> (keyboard activation), never on mouse. The specimen pins the
      ring open so you can read its weight, colour, and offset without hunting for the
      keyboard.
    </p>

    <div className="hx-docs-specimen-grid">
      <${dsName}-button variant="primary" className="force-focus">Primary · focused</${dsName}-button>
      <${dsName}-button variant="secondary" className="force-focus">Secondary · focused</${dsName}-button>
      <${dsName}-button variant="ghost" className="force-focus">Ghost · focused</${dsName}-button>
      <${dsName}-button variant="danger" className="force-focus">Danger · focused</${dsName}-button>
    </div>
  </div>

  <p className="hx-docs-card-body">
    See <a href="/?path=/docs/accessibility-focus-management--docs">Focus Management</a> for the
    trap / restore / roving-tabindex contracts. See{' '}
    <a href="/?path=/docs/accessibility-forced-colors--docs">Forced Colors</a> for how the same
    ring delegates to the <code>Highlight</code> system keyword in HC mode.
  </p>
</section>

<section>
  <SectionHead title="Token contrast matrix" meta="measured on light surface · WCAG 1.4.3 / 1.4.11" />
  <div className="hx-docs-ratio-grid">
    <RatioCard pair="text-primary on default" ratio={21.0} grade="AAA" />
    <RatioCard pair="text-secondary on default" ratio={10.9} grade="AAA" />
    <RatioCard pair="text-muted on default" ratio={7.76} grade="AA" />
    <RatioCard pair="text-on-primary / primary-500" ratio={5.2} grade="AA" />
    <RatioCard pair="on-primary-strong / primary-600" ratio={5.82} grade="AA" />
    <RatioCard pair="error-text on default" ratio={5.46} grade="AA" />
    <RatioCard pair="success-text on default" ratio={6.88} grade="AA" />
    <RatioCard pair="focus-ring · 1.4.11" ratio={5.82} grade="AA-large" />
  </div>
  <p className="hx-docs-card-body">
    Full per-mode + per-pair table:{' '}
    <a href="/?path=/docs/accessibility-contrast-deep-dive--docs">Contrast Deep-Dive</a>
  </p>
</section>

<section>
  <SectionHead title="Never colour alone" meta="WCAG 1.4.1 · status conveyed by 2+ channels" />
  <p className="hx-docs-card-body">
    Every status signal combines colour with at least one other channel: an icon, a text label,
    a shape, or a position. A user with red-green colour blindness sees the same information as
    everyone else.
  </p>
  <div className="hx-docs-card-grid">
    <DocsCard title="Status badges" tag="colour + dot + text">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <${dsName}-badge variant="success">Verified</${dsName}-badge>
        <${dsName}-badge variant="info">Pending</${dsName}-badge>
        <${dsName}-badge variant="warning">Review needed</${dsName}-badge>
        <${dsName}-badge variant="error">Rejected</${dsName}-badge>
      </div>
    </DocsCard>
    <DocsCard title="Form validation" tag="colour + icon + message">
      <ul className="hx-docs-status-list">
        <li className="is-success"><span aria-hidden="true">✓</span> Email format valid</li>
        <li className="is-warning"><span aria-hidden="true">!</span> Password could be stronger</li>
        <li className="is-error"><span aria-hidden="true">×</span> Member ID not found</li>
      </ul>
    </DocsCard>
    <DocsCard title="Charts &amp; data" tag="colour + pattern + label">
      <p className="hx-docs-card-body">
        Bar charts pair every series with a unique fill pattern; pie charts label every slice
        directly; trend lines use a distinct stroke style per series. The reader never has to
        decode by colour alone.
      </p>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="Keyboard contracts" meta="ARIA APG aligned" />
  <div className="hx-docs-card-grid">
    <DocsCard title="Within a component" tag="menu, listbox, combobox, tabs">
      <p className="hx-docs-card-body">
        Every group component ships the same keyboard contract: Tab moves between groups, arrows
        move within, Home/End jump to the ends, Space activates / toggles, Enter activates the
        primary action, Esc dismisses any transient surface.
      </p>
    </DocsCard>
    <DocsCard title="App-level shortcuts" tag="documented + remappable">
      <p className="hx-docs-card-body">
        Page-level shortcuts (focus search, open command palette, save) are published by the
        consumer app and surfaced via a discoverable cheat sheet. Per WCAG 2.1.4 every
        single-character shortcut is remappable.
      </p>
    </DocsCard>
  </div>
  <p className="hx-docs-card-body">
    Full keyboard contracts per pattern:{' '}
    <a href="/?path=/docs/accessibility-keyboard-contracts--docs">Keyboard Contracts</a>
  </p>
</section>

<section>
  <SectionHead title="Focus management" meta="trap · restore · skip · roving tabindex" />
  <div className="hx-docs-card-grid">
    <DocsCard title="Modal focus trap" tag="aria-modal · focus contained">
      <p className="hx-docs-card-body">
        Tab cycles within an open dialog. Esc returns focus to the trigger that opened it.
        <code>&lt;${dsName}-dialog&gt;</code> handles trap + restore automatically.
      </p>
    </DocsCard>
    <DocsCard title="Roving tabindex" tag="menubar · grid · toolbar">
      <p className="hx-docs-card-body">
        One stop for the whole component group; arrow keys move within. Tab leaves the group.
        <code>&lt;${dsName}-tabs&gt;</code> and <code>&lt;${dsName}-radio-group&gt;</code>{' '}
        all implement this.
      </p>
    </DocsCard>
    <DocsCard title="Restore on close" tag="popover · drawer · menu">
      <p className="hx-docs-card-body">
        When a transient surface closes, focus returns to the element that opened it. No
        "where did I just lose my place" moments.
      </p>
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead
    title="The conformance bar — and how we prove it"
    meta="WCAG SCs + the build-time gates that defend them"
  />
  <p className="hx-docs-card-body">
    The dashboard above is the headline. The supporting evidence — every WCAG success criterion
    this design system commits to, the test that proves each one, and the release-quality gates
    that block any merge below the floor — lives on its own page so reviewers can audit it
    end-to-end.
  </p>
  <ul className="hx-docs-link-list">
    <li>
      <a href="/?path=/docs/accessibility-success-criteria--docs">Success Criteria + Release Quality bar</a>
    </li>
    <li>
      <a href="/?path=/docs/accessibility-consumer-obligations--docs">Consumer Obligations — partial-AAA SC contracts</a>
    </li>
  </ul>
</section>

</div>
`,
  };
}
