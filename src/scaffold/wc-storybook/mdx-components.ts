/**
 * wc-storybook component-conformance MDX emitters.
 *
 * Adapts `helix/apps/storybook/stories/components/{hx-card,hx-checkbox,
 * hx-dialog,hx-form,hx-select,hx-tabs,hx-text-input}.mdx` into emitter
 * functions parameterized by the consumer's `dsName` (e.g. `aurora`) and
 * `dsClass` (PascalCase, e.g. `AuroraCard`).
 *
 * Adaptation rules (per shimmying-roaming-kernighan plan, Phase 2; round-7
 * codex-review correction):
 *
 * 1. Live tags in code/JSX examples stay as upstream `hx-*` literals —
 *    `@helixui/library` registers those tags via its `customElements`
 *    sideEffects, so the rendered demo elements are real. The scaffolder
 *    only ships ONE wrapper component (`${ds}-button`); the other six
 *    component pages (card, checkbox, dialog, form, select, tabs,
 *    text-input) would render undefined custom elements if we substituted
 *    `<${ds}-card>` here. The pattern users follow when they later ship
 *    matching wrappers is documented prose, not a live demo.
 * 2. Titles (`Components/${dsClass}Card/Conformance`), filenames
 *    (`${dsName}-card.mdx`), and conceptual class-name references
 *    (`${dsClass}Card` in prose/heading) stay parameterized — they
 *    describe the consumer's eventual extension, not the demo tag.
 * 3. NO `?raw` imports of `AAA-AUDIT.md` — the InlineAuditPanel from
 *    Phase 1 renders null without a `markdown` prop. Audit content is
 *    opt-in via consumer wiring.
 * 4. NO `<AAAConformanceCard>` — dropped in the prior phase.
 * 5. NO `<SectionHead>` import — that helper was not lifted in Phase 1.
 *    The MDXes here use plain `###` headings instead.
 * 6. Composition: `<APGPatternCard>` + `<ConsumerObligations>` only.
 *    `<A11yStatusCard>` is auto-injected by HelixDocsPage at runtime;
 *    DO NOT add explicit JSX for it. `APGPatternCard` reads CEM by tag
 *    name, so it must reference the registered `hx-*` tag.
 * 7. Cross-domain-neutral copy per `feedback_realistic_sample_data` —
 *    healthcare-vertical demo content (patient charts, MRN, consent,
 *    medication lists) was rewritten to generic SaaS / team-tool /
 *    settings flows.
 *
 * Each emitter returns an `{ relativePath, content }` pair so scaffold.ts
 * can simply iterate and call `safeWriteFile`. relativePath is rooted at
 * the project directory.
 */

export interface ComponentMdxEmission {
  /** Path relative to the consumer's project directory. */
  relativePath: string;
  /** Full MDX file body (frontmatter + imports + content). */
  content: string;
}

export interface MdxEmissionContext {
  /** Lowercase tag prefix, e.g. `aurora` (`<aurora-card>`). */
  dsName: string;
  /** PascalCase class form, e.g. `Aurora` (`AuroraCard`). */
  dsClass: string;
}

// ---------------------------------------------------------------------------
// Shared imports block
//
// Every conformance MDX uses the same import surface; centralizing it here
// keeps the emitters small. NO InlineAuditPanel import — Phase 1 stub
// renders null without a markdown prop, and we explicitly do NOT pass one.
// ---------------------------------------------------------------------------

const SHARED_IMPORTS = `import { Meta } from '@storybook/addon-docs/blocks';
import { APGPatternCard } from '../_components/APGPatternCard';
import { ConsumerObligations } from '../_components/ConsumerObligations';`;

// ---------------------------------------------------------------------------
// hx-card → {ds}-card
// ---------------------------------------------------------------------------

function emitCardMdx({ dsName, dsClass }: MdxEmissionContext): ComponentMdxEmission {
  return {
    relativePath: `src/stories/components/${dsName}-card.mdx`,
    content: `${SHARED_IMPORTS}

{/* ${dsName}-card.mdx — AAA conformance documentation for the ${dsClass}Card pattern */}

<Meta title="Components/${dsClass}Card/Conformance" />

# ${dsClass} Card — AAA conformance

A surface container with optional header, body, and footer slots. The
default elevated variant ships a token-driven shadow (\`--hx-shadow-card\`)
and a 1px border in \`--hx-color-border-default\`. Cards are the canonical
container for grouped content — settings sections, list items, dashboard
widgets, and call-to-action blocks.

When you create your own \`${dsClass}Card\` extension (mirroring how
\`${dsClass}Button\` extends \`HelixButton\` in this scaffold), it will
inherit the contract documented here. Until then, the live demos below
render the upstream \`hx-card\` element that \`@helixui/library\` already
registers.

## Hero scene — workspace overview

A primary use of hx-card: a dashboard summary block. The card owns its
own elevation, padding, and slot composition; consumers control only the
inner content.

<div className="hx-narrative-hero">
  <h3>Your workspace at a glance</h3>
  <hx-card>
    <h4 slot="heading">Recent activity</h4>
    <p>3 new comments on your latest project, 2 pending invitations, and 1 unread message from your team lead.</p>
    <div slot="footer">
      <hx-button variant="primary">Open inbox</hx-button>
    </div>
  </hx-card>
</div>

## ARIA + keyboard contract

<APGPatternCard tag="hx-card" />

## Consumer obligations

<ConsumerObligations
  tag="hx-card"
  obligations={[
    'Provide a heading inside the header slot when the card represents a discrete content region. The heading establishes the card as a landmark for screen-reader navigation; without one, the card is just a styled div.',
    'Use semantic heading levels matching the document outline. A card inside a section under <h2> should use <h3> in its header slot, not <h2>. The card does not enforce a level — that is your responsibility.',
    'Do not nest interactive content (links, buttons) inside a card whose entire surface is itself clickable. Nested interactives break the screen-reader contract for the outer click target.',
    'Keep the elevation / shadow tokens. The component ships an AAA-compliant border that holds up under forced-colors and high-contrast OS themes; replacing it with a hand-rolled shadow can drop the contrast below 3:1.',
  ]}
/>

## Variant gallery

The full enumeration of variants — elevated / outlined / flat, padding
scales, header & footer compositions, and integration with form atoms —
lives in the \`Components/${dsClass}Card\` story tree generated from the
\`@helixui/library\` custom-elements manifest.
`,
  };
}

// ---------------------------------------------------------------------------
// hx-checkbox → {ds}-checkbox
// ---------------------------------------------------------------------------

function emitCheckboxMdx({ dsName, dsClass }: MdxEmissionContext): ComponentMdxEmission {
  return {
    relativePath: `src/stories/components/${dsName}-checkbox.mdx`,
    content: `${SHARED_IMPORTS}

{/* ${dsName}-checkbox.mdx — AAA conformance documentation for the ${dsClass}Checkbox pattern */}

<Meta title="Components/${dsClass}Checkbox/Conformance" />

# ${dsClass} Checkbox — AAA conformance

> WCAG 2.2 Level AAA target. The canonical APG \`checkbox\` pattern: <kbd>Space</kbd> toggles, focus is visible, target ≥ 44 × 44 px, and the indeterminate state is communicated via \`aria-checked="mixed"\`.

When you ship a \`${dsClass}Checkbox\` wrapper (extending the upstream
\`HelixCheckbox\` the same way \`${dsClass}Button\` extends \`HelixButton\`
in this scaffold), it will inherit every behaviour documented below. The
live demos below render the upstream \`hx-checkbox\` that
\`@helixui/library\` already registers.

## Hero scene — terms acknowledgement

A required-acknowledgement pattern at sign-up. Every checkbox is at AAA
target size, the focus order matches visual order, and the submit button
remains disabled until all required acknowledgements are checked.

<div className="hx-narrative-hero">
  <h3>Confirm your account</h3>
  <div role="group" aria-label="Sign-up acknowledgements" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <hx-checkbox name="tos" required>
      I agree to the Terms of Service and Privacy Policy.
    </hx-checkbox>
    <hx-checkbox name="updates">
      Email me product updates and release notes.
    </hx-checkbox>
    <hx-checkbox name="research">
      Include my account in anonymized usage research.
    </hx-checkbox>
  </div>
  <div className="hx-narrative-hero-actions">
    <hx-button variant="ghost">Cancel</hx-button>
    <hx-button variant="primary" type="submit">Create account</hx-button>
  </div>
</div>

## ARIA + keyboard contract

<APGPatternCard tag="hx-checkbox" />

## Consumer obligations

<ConsumerObligations
  tag="hx-checkbox"
  obligations={[
    'Provide a visible label via slot content. The label is clickable (the entire label region activates the checkbox), which expands the AAA target-size surface beyond the box itself.',
    'For groups of related checkboxes, wrap them in a role="group" + aria-label container (or use the matching checkbox-group component). Group context is essential for screen-reader navigation.',
    'Use the indeterminate state only when it represents a "some-but-not-all" parent state. Do not use it as a third value — that breaks the APG checkbox contract.',
    'Do not strip the focus ring. The component ships a token-driven focus ring; author CSS that sets outline:none breaks the AAA-cert.',
    'For required-by-attribute checkboxes, render a visible required indicator (asterisk in label, "required" text, or both). aria-required alone does not meet WCAG 3.3.2 Labels or Instructions.',
  ]}
/>

## Variant gallery

The full enumeration of sizes, label slot patterns, indeterminate
transitions, error states, and grouping patterns lives in the
\`Components/${dsClass}Checkbox\` story tree.
`,
  };
}

// ---------------------------------------------------------------------------
// hx-dialog → {ds}-dialog
// ---------------------------------------------------------------------------

function emitDialogMdx({ dsName, dsClass }: MdxEmissionContext): ComponentMdxEmission {
  return {
    relativePath: `src/stories/components/${dsName}-dialog.mdx`,
    content: `${SHARED_IMPORTS}

{/* ${dsName}-dialog.mdx — AAA conformance documentation for the ${dsClass}Dialog pattern */}

<Meta title="Components/${dsClass}Dialog/Conformance" />

# ${dsClass} Dialog — AAA conformance

> WCAG 2.2 Level AAA target. Implements the WAI-ARIA APG \`dialog (modal)\` pattern with focus trap, initial-focus management, return-focus on close, and \`aria-modal="true"\` semantics. The ground-truth canonical modal overlay for the design system.

When you ship a \`${dsClass}Dialog\` wrapper that extends the upstream
\`HelixDialog\` (mirroring how \`${dsClass}Button\` extends \`HelixButton\`
in this scaffold), it inherits the focus-trap and APG contract documented
here. Until then, the live demo below renders the upstream \`hx-dialog\`
that \`@helixui/library\` already registers.

## Hero scene — confirm a destructive action

The most consequential deployment of hx-dialog: a destructive
confirmation. Focus traps inside the dialog, <kbd>Tab</kbd> cycles
between the two action buttons, <kbd>Escape</kbd> closes the dialog
and returns focus to the trigger.

<div className="hx-narrative-hero">
  <h3>Delete this project?</h3>
  <p className="hx-narrative-hero-intro">
    Deleting the project removes all its data, members, and integrations. This action cannot be undone. The dialog below demonstrates the dismiss-then-return-focus contract.
  </p>
  <hx-dialog open aria-labelledby="delete-project-title" aria-describedby="delete-project-desc">
    <h2 id="delete-project-title" slot="header">Delete &ldquo;Onboarding revamp&rdquo;?</h2>
    <p id="delete-project-desc">This will permanently remove 24 documents, 8 boards, and 132 comments. Members will lose access immediately.</p>
    <div slot="footer" className="hx-narrative-hero-actions">
      <hx-button variant="ghost">Cancel</hx-button>
      <hx-button variant="danger">Delete project</hx-button>
    </div>
  </hx-dialog>
</div>

## ARIA + keyboard contract

<APGPatternCard tag="hx-dialog" />

## Consumer obligations

<ConsumerObligations
  tag="hx-dialog"
  obligations={[
    'Provide an accessible name via aria-labelledby pointing at the dialog header. The screen reader announces this name on open. A dialog without a name is announced as just "dialog" — that is hostile to non-sighted users.',
    'Set initial focus deliberately. Default is the first focusable element; for destructive actions, prefer the cancel button so a stray Enter does not destroy data. Use the initial-focus property if your component supports it.',
    'Ensure Escape closes the dialog. The component handles this by default; do not preventDefault on Escape unless you absolutely must, and if you do, provide an alternate dismiss path that meets 2.1.1 Keyboard.',
    'Return focus to the trigger element on close. The component handles this when opened programmatically with the trigger as the active element; if you open the dialog from a non-trigger context, set returnFocusTo manually.',
    'Do not nest dialogs. Nested modals break focus-trap accounting and the screen-reader announcement order. Use a wizard / stepper pattern inside a single dialog instead.',
  ]}
/>

## Variant gallery

The full enumeration of sizes, header / footer compositions, scrollable
body patterns, and async-loading states lives in the
\`Components/${dsClass}Dialog\` story tree.
`,
  };
}

// ---------------------------------------------------------------------------
// {ds}-form file — live demo uses upstream hx-form + sibling atoms
//
// hx-form coordinates child atoms (hx-text-input, hx-select, hx-checkbox,
// hx-button). All of them stay as the registered hx-* tags in the live
// demos; only the file path and conceptual class name use the consumer's
// dsName / dsClass.
// ---------------------------------------------------------------------------

function emitFormMdx({ dsName, dsClass }: MdxEmissionContext): ComponentMdxEmission {
  return {
    relativePath: `src/stories/components/${dsName}-form.mdx`,
    content: `${SHARED_IMPORTS}

{/* ${dsName}-form.mdx — AAA conformance documentation for the ${dsClass}Form pattern */}

<Meta title="Components/${dsClass}Form/Conformance" />

# ${dsClass} Form — AAA conformance

> WCAG 2.2 Level AAA target including 3.3.6 Error Prevention (All). Coordinates the validity state of its child form atoms (hx-text-input, hx-select, hx-checkbox), emits aggregated submit / reset / change events, and surfaces a single accessible error summary above the field list when validation fails.

When you ship a \`${dsClass}Form\` wrapper that extends the upstream
\`HelixForm\` (the same way \`${dsClass}Button\` extends \`HelixButton\` in
this scaffold), it inherits the validity-aggregation contract documented
here. The live demo renders the upstream \`hx-form\` + its sibling form
atoms that \`@helixui/library\` already registers.

## Hero scene — account setup

The canonical multi-field form: an account-creation flow. Required fields
are marked, error messages are individually associated with their fields
via aria-describedby, and the submit button stays available so users can
attempt submission to surface server-side errors.

<div className="hx-narrative-hero">
  <h3>Create your account</h3>
  <hx-form>
    <hx-text-input
      label="Full name"
      name="name"
      required
      autocomplete="name"
      style={{ display: 'block', marginBottom: '12px' }}
    ></hx-text-input>
    <hx-text-input
      label="Work email"
      name="email"
      type="email"
      required
      autocomplete="email"
      style={{ display: 'block', marginBottom: '12px' }}
    ></hx-text-input>
    <hx-select
      label="Team size"
      name="team_size"
      required
      style={{ display: 'block', marginBottom: '12px' }}
    >
      <option value="">Select…</option>
      <option value="solo">Just me</option>
      <option value="small">2–10</option>
      <option value="medium">11–50</option>
      <option value="large">51+</option>
    </hx-select>
    <hx-checkbox name="tos" required style={{ display: 'block', marginBottom: '16px' }}>
      I agree to the Terms of Service.
    </hx-checkbox>
    <div className="hx-narrative-hero-actions">
      <hx-button variant="ghost" type="reset">Reset</hx-button>
      <hx-button variant="primary" type="submit">Create account</hx-button>
    </div>
  </hx-form>
</div>

## ARIA + keyboard contract

<APGPatternCard tag="hx-form" />

## Consumer obligations

<ConsumerObligations
  tag="hx-form"
  obligations={[
    'Use the form atoms (hx-text-input, hx-select, hx-checkbox) as children, not raw <input> / <select>. Each atom owns its own label / helper-text / error-message scaffolding wired to the parent form via ElementInternals; raw inputs break the validity aggregation.',
    'Provide a name attribute on every field. The form serializes by name on submit; an unnamed field is silently dropped from the submission payload, which is the worst kind of bug — works in development, breaks in production with no error.',
    'Surface server-side errors back into the form via the field-level errorMessage property. Do not render a separate error block; the per-field association via aria-describedby is what makes screen readers announce the error in context.',
    'Do not disable the submit button on validity. The form-validity APG pattern requires submission to be attemptable so failure messages render; disabling the submit button is the most common way to fail 3.3.6 Error Prevention (All) — non-sighted users have no way to discover what is wrong.',
    'Use autocomplete attributes for known field types (name, email, tel, address, etc.). 1.3.5 Identify Input Purpose is a Level AA criterion that costs nothing to satisfy and meaningfully improves form completion rates.',
  ]}
/>

## Variant gallery

The full enumeration of layouts (single-column, two-column, inline),
loading states, server-error patterns, and integration with
hx-dialog (form-in-modal) lives in the \`Components/${dsClass}Form\`
story tree.
`,
  };
}

// ---------------------------------------------------------------------------
// hx-select → {ds}-select
// ---------------------------------------------------------------------------

function emitSelectMdx({ dsName, dsClass }: MdxEmissionContext): ComponentMdxEmission {
  return {
    relativePath: `src/stories/components/${dsName}-select.mdx`,
    content: `${SHARED_IMPORTS}

{/* ${dsName}-select.mdx — AAA conformance documentation for the ${dsClass}Select pattern */}

<Meta title="Components/${dsClass}Select/Conformance" />

# ${dsClass} Select — AAA conformance

> WCAG 2.2 Level AAA target. Implements the WAI-ARIA APG \`combobox\` pattern (single-select listbox variant): <kbd>ArrowDown</kbd> opens the listbox, <kbd>ArrowUp</kbd> / <kbd>ArrowDown</kbd> move the visual cursor, <kbd>Enter</kbd> selects, <kbd>Escape</kbd> closes without selecting, and <kbd>Home</kbd> / <kbd>End</kbd> jump to the first / last option.

When you ship a \`${dsClass}Select\` wrapper that extends the upstream
\`HelixSelect\` (the same way \`${dsClass}Button\` extends \`HelixButton\`
in this scaffold), it inherits the combobox APG contract documented
here. The live demo renders the upstream \`hx-select\` that
\`@helixui/library\` already registers.

## Hero scene — workspace settings

A typical deployment: a settings select for time-zone preference. The
options list is searchable by typing the first character of an option
label, focus stays inside the listbox while open, and the value commits
on <kbd>Enter</kbd>.

<div className="hx-narrative-hero">
  <h3>Set your time zone</h3>
  <hx-select label="Time zone" name="tz" required>
    <option value="">Select a time zone…</option>
    <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
    <option value="America/Denver">Mountain (Denver)</option>
    <option value="America/Chicago">Central (Chicago)</option>
    <option value="America/New_York">Eastern (New York)</option>
    <option value="Europe/London">London</option>
    <option value="Europe/Berlin">Berlin</option>
    <option value="Asia/Tokyo">Tokyo</option>
    <option value="Asia/Sydney">Sydney</option>
  </hx-select>
</div>

## ARIA + keyboard contract

<APGPatternCard tag="hx-select" />

## Consumer obligations

<ConsumerObligations
  tag="hx-select"
  obligations={[
    'Provide a label via the label property or an external <label for> element. The select inherits the label as its accessible name; an unlabeled select is announced as just "combobox" by screen readers.',
    'Use real <option> elements (or the matching hx-option child if your component shape requires it) — do not render a generic <div> menu. Native option semantics provide selection-state announcements, type-ahead, and APG combobox roles for free.',
    'Do not put more than ~12 options in the inline list before paginating, virtualizing, or switching to a search-driven combobox. Long lists hostile-to navigate by keyboard; APG itself recommends the autocomplete combobox pattern past that threshold.',
    'For required selects, provide a placeholder option with empty value (e.g. value=""). The component treats empty-string as "no selection" and produces the right validity state on submit; a non-empty default option silently passes validation.',
    'Do not strip the dropdown chevron. The chevron is a visual affordance signaling "this opens"; without it the field is indistinguishable from a text input and fails 3.3.2 Labels or Instructions.',
  ]}
/>

## Variant gallery

The full enumeration of sizes, multi-select / single-select variants,
disabled-option patterns, and integration with hx-form lives in
the \`Components/${dsClass}Select\` story tree.
`,
  };
}

// ---------------------------------------------------------------------------
// hx-tabs → {ds}-tabs
// ---------------------------------------------------------------------------

function emitTabsMdx({ dsName, dsClass }: MdxEmissionContext): ComponentMdxEmission {
  return {
    relativePath: `src/stories/components/${dsName}-tabs.mdx`,
    content: `${SHARED_IMPORTS}

{/* ${dsName}-tabs.mdx — AAA conformance documentation for the ${dsClass}Tabs pattern */}

<Meta title="Components/${dsClass}Tabs/Conformance" />

# ${dsClass} Tabs — AAA conformance

> WCAG 2.2 Level AAA target. Implements the WAI-ARIA APG \`tabs\` pattern (manual activation): <kbd>Arrow</kbd> keys move the visual focus between tabs without immediately activating, <kbd>Enter</kbd> or <kbd>Space</kbd> activates, and <kbd>Home</kbd> / <kbd>End</kbd> jump to the first / last tab. Each panel associates with its tab via \`aria-controls\` + \`aria-labelledby\`.

When you ship a \`${dsClass}Tabs\` wrapper that extends the upstream
\`HelixTabs\` (the same way \`${dsClass}Button\` extends \`HelixButton\` in
this scaffold), it inherits the roving-tabindex + APG contract documented
here. The live demo renders the upstream \`hx-tabs\` + its sibling
\`hx-tab\` / \`hx-tab-panel\` elements that \`@helixui/library\` already
registers.

## Hero scene — settings navigation

A canonical use of hx-tabs: settings-panel navigation. Three peer panels,
each with a clear name and a focused tab indicator. Tab into the tablist
and use <kbd>ArrowRight</kbd> / <kbd>ArrowLeft</kbd> to move the cursor,
<kbd>Enter</kbd> to switch panels.

<div className="hx-narrative-hero">
  <h3>Account settings</h3>
  <hx-tabs>
    <hx-tab slot="tab" panel="profile">Profile</hx-tab>
    <hx-tab slot="tab" panel="notifications">Notifications</hx-tab>
    <hx-tab slot="tab" panel="security">Security</hx-tab>
    <hx-tab-panel name="profile">
      <p>Display name, avatar, time zone, and language.</p>
    </hx-tab-panel>
    <hx-tab-panel name="notifications">
      <p>Email digests, in-app alerts, and push preferences.</p>
    </hx-tab-panel>
    <hx-tab-panel name="security">
      <p>Password, two-factor authentication, and active sessions.</p>
    </hx-tab-panel>
  </hx-tabs>
</div>

This is the contract: tab-key roving (one tab stop for the entire
tablist, arrow keys move the inner cursor), manual activation (consumer
chooses when the panel switches), and \`aria-selected\` + \`aria-controls\`
wired through the shadow DOM so screen readers announce the panel
relationship correctly.

## ARIA + keyboard contract

<APGPatternCard tag="hx-tabs" />

## Consumer obligations

<ConsumerObligations
  tag="hx-tabs"
  obligations={[
    'Provide a meaningful name on every hx-tab via slot text. The accessible name is the tab label, and the screen-reader announcement is the only navigation aid for non-sighted users moving between panels.',
    'Match every hx-tab\\'s panel attribute to an hx-tab-panel\\'s name attribute. The component wires aria-controls + aria-labelledby automatically, but only if the names match — a typo silently breaks the screen-reader association.',
    'Do not nest one tablist inside another. The roving-tabindex model assumes a single tablist on a page surface; nested tabs break the composite-widget keyboard contract.',
    'Use hx-tabs for peer-content navigation (settings categories, dashboard sections), not for primary site navigation. For site nav, use an hx-top-nav or hx-side-nav component — those expose the URL-route + visited-state surface tabs do not.',
    'Keep tab labels short (1–3 words). Long labels truncate, the truncation reduces the AAA target hit area, and the truncated label may not match the screen-reader announcement.',
  ]}
/>

## Variant gallery

The full enumeration of orientation variants (horizontal, vertical),
size modifiers, scrollable tablists, and integration with hx-card and
hx-form lives in the \`Components/${dsClass}Tabs\` story tree.
`,
  };
}

// ---------------------------------------------------------------------------
// hx-text-input → {ds}-text-input
// ---------------------------------------------------------------------------

function emitTextInputMdx({ dsName, dsClass }: MdxEmissionContext): ComponentMdxEmission {
  return {
    relativePath: `src/stories/components/${dsName}-text-input.mdx`,
    content: `${SHARED_IMPORTS}

{/* ${dsName}-text-input.mdx — AAA conformance documentation for the ${dsClass}TextInput pattern */}

<Meta title="Components/${dsClass}TextInput/Conformance" />

# ${dsClass} Text Input — AAA conformance

> WCAG 2.2 Level AAA target including 3.3.6 Error Prevention (All). Form-associated via \`ElementInternals\` so it participates in \`<form>\` validity, submission, and reset. Owns its own label, helper text, and error-message scaffolding so consumers do not rebuild that surface on every form.

When you ship a \`${dsClass}TextInput\` wrapper that extends the upstream
\`HelixTextInput\` (the same way \`${dsClass}Button\` extends \`HelixButton\`
in this scaffold), it inherits the form-associated contract documented
here. The live demo renders the upstream \`hx-text-input\` that
\`@helixui/library\` already registers.

## Hero scene — sign-in flow

A canonical use of hx-text-input: the sign-in form. Two fields, each
with explicit labels, autocomplete hints, and helper text where it adds
value. Required-field indication is the \`required\` attribute plus a
visible asterisk in the label — aria-required alone does not meet WCAG
3.3.2.

<div className="hx-narrative-hero">
  <h3>Sign in to your workspace</h3>
  <hx-text-input
    label="Work email"
    name="email"
    type="email"
    required
    autocomplete="email"
    helper-text="The email you used when you joined the workspace."
    style={{ display: 'block', marginBottom: '12px' }}
  ></hx-text-input>
  <hx-text-input
    label="Password"
    name="password"
    type="password"
    required
    autocomplete="current-password"
    style={{ display: 'block', marginBottom: '16px' }}
  ></hx-text-input>
  <div className="hx-narrative-hero-actions">
    <hx-button variant="ghost">Forgot password?</hx-button>
    <hx-button variant="primary" type="submit">Sign in</hx-button>
  </div>
</div>

## ARIA + keyboard contract

<APGPatternCard tag="hx-text-input" />

## Consumer obligations

<ConsumerObligations
  tag="hx-text-input"
  obligations={[
    'Provide a label via the label property. The component renders a real <label for> element wired to the input id; do not duplicate the label in surrounding markup. An unlabeled text input is announced as just "edit" by screen readers.',
    'Use autocomplete attributes for known field types (name, email, tel, current-password, new-password, etc.). 1.3.5 Identify Input Purpose is a Level AA criterion that meaningfully improves form completion rates and password-manager support.',
    'Surface server-side errors via errorMessage / aria-invalid. The component wires aria-describedby to the error region automatically so screen readers announce the error in context; a separate error block above the form does not satisfy 3.3.1 Error Identification at the field level.',
    'Use type="password" for password fields. Browsers expose password fields to password managers and ignore them in autofill heuristics; type="text" with a manual mask defeats both behaviors.',
    'Do not strip the focus ring. The component ships a token-driven focus ring; author CSS that sets outline:none on the input breaks the AAA-cert.',
  ]}
/>

## Variant gallery

The full enumeration of types (text, email, tel, url, password, number),
sizes, prefix / suffix slots, and helper-text patterns lives in the
\`Components/${dsClass}TextInput\` story tree.
`,
  };
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Returns one emission per component conformance MDX. scaffold.ts iterates
 * the array and writes each `relativePath` (project-rooted) with `content`.
 *
 * Order is deterministic (alphabetical by component) so golden-snapshot
 * tests in `tests/golden/wc-storybook-scaffold/` produce stable diffs.
 */
export function getComponentMdxEmissions(ctx: MdxEmissionContext): ComponentMdxEmission[] {
  return [
    emitCardMdx(ctx),
    emitCheckboxMdx(ctx),
    emitDialogMdx(ctx),
    emitFormMdx(ctx),
    emitSelectMdx(ctx),
    emitTabsMdx(ctx),
    emitTextInputMdx(ctx),
  ];
}
