import type {
  AccessibilityEmissionContext,
  AccessibilityMdxEmission,
} from '../mdx-accessibility.js';

// IMPORTS_BASE / SHARED constants kept in the parent module.
const IMPORTS_BASE = `import { Meta } from '@storybook/addon-docs/blocks';`;

// ---------------------------------------------------------------------------
// ConsumerObligations.mdx — partial-applicability AAA SC contracts.
// Heavily rewritten: upstream uses healthcare-specific examples (patient
// records, MRN, advance directives, clinical glossaries, glucose readings).
// Replaced with generic SaaS examples (account creation, team admin, settings,
// account-deletion flows). Title carries a space (`Consumer Obligations`) to
// disambiguate from the ConsumerObligations TSX component imported by Phase 2.
// ---------------------------------------------------------------------------

export function emitConsumerObligationsMdx({
  dsName,
}: AccessibilityEmissionContext): AccessibilityMdxEmission {
  return {
    relativePath: 'src/stories/accessibility/ConsumerObligations.mdx',
    content: `{/* Accessibility / Consumer Obligations.mdx — partial-applicability AAA SC contracts */}

${IMPORTS_BASE}
import { EyebrowHeading } from '../_components/EyebrowHeading';
import { SectionHead } from '../_components/SectionHead';
import { StatCard } from '../_components/StatCard';
import { DocsCard } from '../_components/DocsCard';
import { CodeBlock } from '../_components/CodeBlock';

<Meta
  title="Accessibility/Consumer Obligations"
  parameters={{ controls: { disable: true }, actions: { disable: true } }}
/>

<div className="hx-docs">

<EyebrowHeading
  eyebrow="Accessibility · Conformance contract"
  title="What the design system provides — and what you must fulfil."
  lede={
    <>
      Some WCAG AAA success criteria are <strong>partially applicable</strong> to a component
      library: the system exposes the surface (an attribute, a slot, a token, an event) and the
      consumer application fulfils the substantive obligation (the autocomplete value, the
      heading hierarchy, the help-text content, the timeout policy). This page is the explicit
      handshake. Each row below names a partial-AAA SC, the contract the system provides, and
      the example a consumer ships to close the conformance gap.
    </>
  }
/>

<section>
  <SectionHead title="At a glance" meta="WCAG 2.1 · 7 partial-applicability SCs" />
  <div className="hx-docs-stats">
    <StatCard num="7" label="Partial-AAA contracts" sub="component exposes · consumer fulfils" />
    <StatCard num="9" label="Fully-applicable AAA SCs" sub="design-system engineering owns" />
    <StatCard num="14" label="Out-of-scope AAA SCs" sub="content-creator obligations" />
    <StatCard num="28" label="WCAG 2.1 AAA total" sub="A · AA · AAA stack" />
  </div>
</section>

<section>
  <SectionHead title="Why partial applicability is honest" meta="component vs application boundary" />
  <p className="hx-docs-card-body">
    A component library cannot single-handedly ship AAA conformance. WCAG defines accessibility
    against a <em>web page</em>, not a button or a dialog in isolation. For 7 of the 28 AAA
    success criteria, the system's contribution is real but partial: we expose the API, you
    populate it. Calling these "done" without naming the consumer's share would be marketing —
    so we publish both ledgers. If a consumer ships a product without fulfilling these
    contracts, the page is not AAA, even if every component is.
  </p>
  <p className="hx-docs-card-body">
    See <a href="/?path=/docs/accessibility-success-criteria--docs">Success Criteria</a> for
    the fully-applicable AAA SCs the system owns end-to-end, and the "What we do not claim"
    section for the 14 not-applicable AAA SCs (sign language, reading level, pronunciation,
    audio description) that fall outside any component-library scope.
  </p>
</section>

<section>
  <SectionHead title="1.3.6 Identify Purpose" meta="AAA · partial · consumer fulfils" />

  <DocsCard title="What WCAG 2.1 1.3.6 requires" tag="user-agent identifies purpose">
    <p>
      In content implemented using markup languages, the purpose of UI components, icons, and
      regions can be programmatically determined. This lets assistive tech and personalisation
      tools surface the right meaning (e.g. recolour "cancel" vs "submit", replace icons with
      words, autofill a name field correctly).
    </p>
  </DocsCard>

  <DocsCard title="What the system provides" tag="component contract">
    <p>
      <code>&lt;${dsName}-text-input&gt;</code>, <code>&lt;${dsName}-textarea&gt;</code>,{' '}
      <code>&lt;${dsName}-select&gt;</code>, and <code>&lt;${dsName}-combobox&gt;</code>{' '}
      forward the native <code>autocomplete</code> attribute through ElementInternals; consumers
      populate it from the WCAG-defined token list (Section 7 of WCAG 2.1). Buttons and links
      accept <code>aria-label</code> + <code>aria-roledescription</code> for semantic intent
      beyond visible text. Icon components honour <code>title</code> and{' '}
      <code>aria-labelledby</code>.
    </p>
  </DocsCard>

  <DocsCard title="What you fulfil" tag="consumer code">
    <p>
      Populate <code>autocomplete</code> on every form control whose purpose matches Section 7's
      input-purpose tokens. A signup form should look like:
    </p>
    <CodeBlock
      language="html"
      code={\`<${dsName}-text-input name="given-name" autocomplete="given-name" label="First name"></${dsName}-text-input>
<${dsName}-text-input name="family-name" autocomplete="family-name" label="Last name"></${dsName}-text-input>
<${dsName}-text-input name="email" type="email" autocomplete="email" label="Email"></${dsName}-text-input>
<${dsName}-text-input name="tel" type="tel" autocomplete="tel-national" label="Phone"></${dsName}-text-input>\`}
    />
  </DocsCard>
</section>

<section>
  <SectionHead title="1.4.8 Visual Presentation" meta="AAA · partial · consumer fulfils" />

  <DocsCard title="What WCAG 2.1 1.4.8 requires" tag="user-controllable presentation">
    <ul>
      <li>Select foreground and background colours</li>
      <li>Limit width to 80 characters or less</li>
      <li>Avoid full justification (no fully-justified text)</li>
      <li>Set line-spacing to at least 1.5 within paragraphs</li>
      <li>Set paragraph spacing to at least 1.5x line-spacing</li>
      <li>Resize text to 200% without horizontal scroll</li>
    </ul>
  </DocsCard>

  <DocsCard title="What the system provides" tag="component contract">
    <p>
      <code>&lt;${dsName}-prose&gt;</code> defaults to a 1.6 line-height on body text and
      paragraph spacing equal to 1.5em (clears the 1.5x line-spacing rule). Width is bounded by{' '}
      <code>max-inline-size: var(--hx-prose-measure, 70ch)</code> — under the 80-char ceiling.
      Text alignment is <code>start</code> by default; we never emit{' '}
      <code>text-align: justify</code>. Colour tokens are user-overridable at the semantic tier —
      set them once on the consumer's root and every component recolours via cascade.
    </p>
  </DocsCard>

  <DocsCard title="What you fulfil" tag="consumer code">
    <p>
      Do not override prose defaults to make text denser. If you do override typography globally,
      preserve the line-height and paragraph-spacing minimums. Do not apply{' '}
      <code>text-align: justify</code> to body content.
    </p>
    <CodeBlock
      language="css"
      code={[
        '/* OK: narrows measure but stays under the 80ch ceiling */',
        \`${dsName}-prose { --hx-prose-measure: 60ch; }\`,
        '',
        '/* OK: global type-scale override that preserves AAA minimums */',
        ':root {',
        '  --hx-text-line-height: 1.6;       /* >= 1.5 */',
        '  --hx-text-paragraph-spacing: 1em; /* >= 0.5 * line-height */',
        '}',
        '',
        '/* NOT OK: kills the line-height floor */',
        \`${dsName}-prose { line-height: 1.2 !important; }\`,
        '',
        '/* NOT OK: full justification fails 1.4.8 */',
        \`${dsName}-prose { text-align: justify; }\`,
      ].join('\\n')}
    />
  </DocsCard>
</section>

<section>
  <SectionHead title="2.2.4 Interruptions" meta="AAA · partial · consumer fulfils" />

  <DocsCard title="What WCAG 2.1 2.2.4 requires" tag="user can suppress">
    <p>
      Interruptions (alerts, banners, toasts, system notifications) can be postponed or
      suppressed by the user, except interruptions involving an emergency.
    </p>
  </DocsCard>

  <DocsCard title="What the system provides" tag="component contract">
    <p>
      <code>&lt;${dsName}-toast&gt;</code>, <code>&lt;${dsName}-banner&gt;</code>, and{' '}
      <code>&lt;${dsName}-alert&gt;</code> all fire dismissible events and accept a{' '}
      <code>persistent</code> attribute that disables auto-dismiss. The toast component exposes
      a <code>duration</code> property (any positive number, or <code>Infinity</code> for "until
      dismissed"). The library reads <code>data-hx-no-interruptions</code> on the document root:
      when set, non-emergency toasts stay queued instead of rendering until cleared.
      Emergency-priority toasts (severity "error" with <code>persistent</code>) bypass the
      suppression.
    </p>
  </DocsCard>

  <DocsCard title="What you fulfil" tag="consumer code">
    <p>
      Wire a user-controllable preference (settings page, OS-level preference) to{' '}
      <code>data-hx-no-interruptions</code>. Do not auto-dismiss <em>error</em> alerts about
      destructive or safety-critical conditions without an explicit user action.
    </p>
    <CodeBlock
      language="html"
      code={\`<!-- Consumer settings UI toggles this attribute -->
<html data-hx-no-interruptions>
  <body>
    <!-- routine toast queues silently until cleared -->
    <${dsName}-toast variant="info" duration="3000">Settings saved</${dsName}-toast>

    <!-- emergency toast still surfaces -->
    <${dsName}-toast variant="error" persistent>
      Account deletion in progress — confirm before continuing.
    </${dsName}-toast>
  </body>
</html>\`}
    />
  </DocsCard>
</section>

<section>
  <SectionHead title="2.2.6 Timeouts" meta="AAA · partial · consumer fulfils" />

  <DocsCard title="What WCAG 2.1 2.2.6 requires" tag="user warned of data loss">
    <p>
      Users are warned of the duration of any user inactivity that could cause data loss, unless
      the data is preserved for more than 20 hours when the user does not take any actions.
    </p>
  </DocsCard>

  <DocsCard title="What the system provides" tag="component contract">
    <p>
      <code>&lt;${dsName}-dialog&gt;</code> accepts a <code>persistent</code> attribute
      that disables click-outside and Escape dismissal — useful for unsaved-form-state warnings.
      The toast component exposes <code>duration</code> + <code>persistent</code> for the
      inverse case (notifications that should not auto-disappear). The system honours{' '}
      <code>prefers-reduced-motion: reduce</code> across timed transitions and auto-dismiss
      timers. The library does not impose session timeouts — those are the consumer
      application's concern.
    </p>
  </DocsCard>

  <DocsCard title="What you fulfil" tag="consumer code">
    <p>
      Surface a warning before any session-timeout-driven data loss. Use a persistent dialog
      with a countdown to give the user a chance to extend, save, or discard.
    </p>
    <CodeBlock
      language="html"
      code={\`<${dsName}-dialog persistent open id="session-timeout">
  <h2 slot="header">Your session is about to expire</h2>
  <p>
    You will be signed out in 2 minutes. Unsaved changes to your account
    settings will be lost.
  </p>
  <${dsName}-button slot="footer" variant="primary" onclick="extendSession()">
    Stay signed in
  </${dsName}-button>
  <${dsName}-button slot="footer" variant="ghost" onclick="saveDraftAndSignOut()">
    Save draft and sign out
  </${dsName}-button>
</${dsName}-dialog>\`}
    />
  </DocsCard>
</section>

<section>
  <SectionHead title="2.4.10 Section Headings" meta="AAA · partial · consumer fulfils" />

  <DocsCard title="What WCAG 2.1 2.4.10 requires" tag="content structure">
    <p>
      Section headings are used to organise the content. Headings should follow a logical
      hierarchy (no skipped levels) and describe the section that follows.
    </p>
  </DocsCard>

  <DocsCard title="What the system provides" tag="component contract">
    <p>
      <code>&lt;${dsName}-prose&gt;</code> renders consumer-supplied{' '}
      <code>{'<h1>'}</code>—<code>{'<h6>'}</code> with the correct visual hierarchy and clear
      margin rhythm, but it does <em>not</em> auto-determine heading levels — that is the
      consumer's page-structure decision. <code>&lt;${dsName}-text&gt;</code> exposes a{' '}
      <code>level</code> attribute for visual heading sizes that are <em>not</em>{' '}
      document-outline headings (e.g. a card title that visually looks like an h3 but is not
      part of the page outline). Component slots like card / dialog / drawer headers accept any
      heading element so the consumer chooses the level.
    </p>
  </DocsCard>

  <DocsCard title="What you fulfil" tag="consumer code">
    <p>
      Author your page's heading hierarchy explicitly. Do not skip levels. Use{' '}
      <code>&lt;${dsName}-text level="h3"&gt;</code> for visual-only heading sizes that are
      not part of the outline.
    </p>
    <CodeBlock
      language="html"
      code={\`<main>
  <h1>Workspace overview</h1>

  <section>
    <h2>Recent activity</h2>
    <${dsName}-card>
      {/* Card heading IS part of the outline -> real h3 */}
      <h3 slot="heading">Latest comments</h3>
      <p>3 new replies on your shared documents.</p>
    </${dsName}-card>

    <${dsName}-card>
      {/* Decorative subheading not in outline -> ${dsName}-text level="h4" */}
      <${dsName}-text slot="heading" level="h4">Last sync</${dsName}-text>
      <p>2026-05-07 08:31 UTC</p>
    </${dsName}-card>
  </section>

  <section>
    <h2>Active integrations</h2>
    {/* ... */}
  </section>
</main>\`}
    />
  </DocsCard>
</section>

<section>
  <SectionHead title="3.1.4 Abbreviations" meta="AAA · partial · consumer fulfils" />

  <DocsCard title="What WCAG 2.1 3.1.4 requires" tag="expansion available">
    <p>
      A mechanism for identifying the expanded form or meaning of abbreviations is available. In
      practice this is the <code>{'<abbr title="...">'}</code> element on first use, or a
      glossary linked from the page.
    </p>
  </DocsCard>

  <DocsCard title="What the system provides" tag="component contract">
    <p>
      <code>&lt;${dsName}-prose&gt;</code> styles native <code>{'<abbr>'}</code> with a
      subtle dotted-underline affordance and surfaces the <code>title</code> via the browser's
      native tooltip plus <code>aria-label</code> when consumers attach one.{' '}
      <code>&lt;${dsName}-tooltip&gt;</code> provides a richer surface for explanations
      longer than a single phrase. The library does not own content — we do not auto-detect
      abbreviations.
    </p>
  </DocsCard>

  <DocsCard title="What you fulfil" tag="consumer code">
    <p>
      Wrap every abbreviation in <code>{'<abbr>'}</code> on first occurrence per page or per
      section. For domain-heavy content (legal, technical), maintain a glossary route the
      abbreviation links to.
    </p>
    <CodeBlock
      language="html"
      code={\`<${dsName}-prose>
  <p>
    Account migrations rely on a stable <abbr title="Universally Unique Identifier">UUID</abbr>
    per workspace and emit a signed <abbr title="JSON Web Token">JWT</abbr>
    on every API request. Inspect the audit log for any <abbr title="Single Sign-On">SSO</abbr>
    handshake failure.
  </p>
</${dsName}-prose>

{/* For a richer explanation, the tooltip wraps the abbr */}
<${dsName}-tooltip>
  <abbr slot="anchor" title="Service Level Objective">SLO</abbr>
  <p>
    A target reliability level expressed as a percentage of successful requests
    over a rolling window. 99.9% SLO leaves a 43-minute monthly error budget.
  </p>
</${dsName}-tooltip>\`}
    />
  </DocsCard>
</section>

<section>
  <SectionHead title="3.3.5 Help" meta="AAA · partial · consumer fulfils" />

  <DocsCard title="What WCAG 2.1 3.3.5 requires" tag="context-sensitive help">
    <p>
      Context-sensitive help is available for any component that requires user input. For forms
      in regulated contexts (legal, financial), help should explain what the input is for and
      the format expected.
    </p>
  </DocsCard>

  <DocsCard title="What the system provides" tag="component contract">
    <p>
      Every form component accepts a <code>helpText</code> attribute and a{' '}
      <code>help-text</code> slot for richer markup.{' '}
      <code>&lt;${dsName}-help-text&gt;</code> is the canonical primitive — it wires{' '}
      <code>aria-describedby</code> through ElementInternals so the help text is announced after
      the field label by every screen reader.{' '}
      <code>&lt;${dsName}-tooltip&gt;</code> +{' '}
      <code>&lt;${dsName}-popover&gt;</code> surface longer explanations on demand.
      Field-level <code>&lt;${dsName}-field-label&gt;</code> renders the required-marker
      and links the label-input pair via Shadow-DOM-internal <code>for/id</code>.
    </p>
  </DocsCard>

  <DocsCard title="What you fulfil" tag="consumer code">
    <p>
      Populate <code>help-text</code> with substantive content — what the field is for, the
      format expected, and where to find more information. Do not leave help text empty on
      compliance-critical fields.
    </p>
    <CodeBlock
      language="html"
      code={\`{/* OK — substantive help that meets 3.3.5 */}
<${dsName}-text-input
  name="workspace-slug"
  label="Workspace URL"
  autocomplete="off"
  required
>
  <span slot="help-text">
    3-32 lowercase letters, numbers, and dashes. This becomes the URL
    everyone in your team uses to sign in — choose something stable.
  </span>
</${dsName}-text-input>

{/* For long-form help, the popover keeps the field uncluttered */}
<${dsName}-text-input name="api-rate-limit" label="API requests per minute">
  <${dsName}-popover slot="help-text">
    <button slot="anchor" type="button" aria-label="What is this?">?</button>
    <p>
      Calls above this threshold receive a 429 response with a Retry-After
      header. See the
      <a href="/help/api-rate-limits">rate-limit help page</a> for details.
    </p>
  </${dsName}-popover>
</${dsName}-text-input>\`}
    />
  </DocsCard>
</section>

<section>
  <SectionHead title="Cross-references" meta="related ledgers" />
  <div className="hx-docs-card-grid">
    <DocsCard title="Success Criteria" tag="WCAG ledger · A · AA · AAA P0">
      <p className="hx-docs-card-body">
        The full WCAG ledger — A and AA committed across every component, AAA on the P0 surface,
        plus the seven release-quality gates that block any merge below the floor.{' '}
        <a href="/?path=/docs/accessibility-success-criteria--docs">Open the ledger</a>
      </p>
    </DocsCard>
    <DocsCard title="Accessibility Dashboard" tag="overview · contracts">
      <p className="hx-docs-card-body">
        High-level accessibility posture, contract summary, and entry points to every deep-dive.{' '}
        <a href="/?path=/docs/accessibility-dashboard--docs">Open the dashboard</a>
      </p>
    </DocsCard>
    <DocsCard title="Keyboard Contracts" tag="2.1.1 · 2.1.3">
      <p className="hx-docs-card-body">
        Per-component keyboard interaction matrix. The other half of the partial-applicability
        story for 2.4.3 Focus Order and 2.4.7 Focus Visible.{' '}
        <a href="/?path=/docs/accessibility-keyboard-contracts--docs">Open keyboard contracts</a>
      </p>
    </DocsCard>
    <DocsCard title="Focus Management" tag="2.4.3 · 2.4.7 · 2.4.13">
      <p className="hx-docs-card-body">
        Focus delegation, restoration on dialog/drawer/popover dismissal, and the focus-ring
        token contract.{' '}
        <a href="/?path=/docs/accessibility-focus-management--docs">Open focus management</a>
      </p>
    </DocsCard>
  </div>
</section>

</div>
`,
  };
}
