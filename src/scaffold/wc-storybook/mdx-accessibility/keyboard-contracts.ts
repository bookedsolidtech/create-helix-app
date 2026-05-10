import type {
  AccessibilityEmissionContext,
  AccessibilityMdxEmission,
} from '../mdx-accessibility.js';

// IMPORTS_BASE / SHARED constants kept in the parent module.
const IMPORTS_BASE = `import { Meta } from '@storybook/addon-docs/blocks';`;

// ---------------------------------------------------------------------------
// KeyboardContracts.mdx — APG-aligned keyboard contracts per category.
// ---------------------------------------------------------------------------

export function emitKeyboardContractsMdx({
  dsName,
}: AccessibilityEmissionContext): AccessibilityMdxEmission {
  return {
    relativePath: 'src/stories/accessibility/KeyboardContracts.mdx',
    content: `{/* Accessibility / Keyboard Contracts.mdx — APG-aligned keyboard contracts per category */}

${IMPORTS_BASE}
import { EyebrowHeading } from '../_components/EyebrowHeading';
import { SectionHead } from '../_components/SectionHead';
import { StatCard } from '../_components/StatCard';
import { DocsCard } from '../_components/DocsCard';
import { CodeBlock } from '../_components/CodeBlock';
import { TABS_KEYDOWN_TS } from './_snippets';

import '@helixui/library/components/hx-button';

export const KeyTable = ({ rows }) => (
  <div className="hx-docs-key-table">
    {rows.map(([keys, desc]) => (
      <div key={keys} className="hx-docs-key-row">
        <kbd>{keys}</kbd>
        <span>{desc}</span>
      </div>
    ))}
  </div>
);

<Meta
  title="Accessibility/Keyboard Contracts"
  parameters={{ controls: { disable: true }, actions: { disable: true } }}
/>

<div className="hx-docs">

<EyebrowHeading
  eyebrow="Accessibility · keyboard contracts"
  title="Every component has a keyboard contract. We borrowed it from APG."
  lede={
    <>
      The W3C ARIA Authoring Practices Guide (APG) defines the canonical keyboard interaction
      pattern for every common UI primitive. The system implements those contracts verbatim —
      Tab walks the page, Arrow keys walk inside a widget, Enter / Space activate, Escape
      dismisses. No bespoke keymaps. No "design-system special".
    </>
  }
/>

<section>
  <SectionHead title="At a glance" meta="WCAG 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.13" />
  <div className="hx-docs-stats">
    <StatCard num="7" label="Pattern categories" sub="all APG-aligned" />
    <StatCard num="0" label="Keyboard traps" sub="WCAG 2.1.2 enforced" />
    <StatCard num="100" unit="%" label="Tab-reachable" sub="every interactive element" />
    <StatCard num="44" unit="px" label="Hit-target floor" sub="WCAG 2.5.5" />
  </div>
</section>

<section>
  <SectionHead title="Page-level keys" meta="apply everywhere, not per component" />
  <p className="hx-docs-card-body">
    These keys carry the user across the whole document — they are user-agent behaviour, not
    component behaviour. Components must not capture them unless they are the canonical owner
    (a dialog owns Escape; a modal owns Tab cycling).
  </p>

  <div className="hx-docs-card-grid">
    <DocsCard title="Navigation" tag="user-agent">
      <KeyTable
        rows={[
          ['Tab', 'Move focus to next interactive element'],
          ['Shift + Tab', 'Move focus to previous interactive element'],
          ['F6 / Shift + F6', 'Cycle landmark regions (browser-dependent)'],
        ]}
      />
    </DocsCard>
    <DocsCard title="Activation" tag="primary action">
      <KeyTable
        rows={[
          ['Enter', 'Activate primary action of focused element'],
          ['Space', 'Activate buttons, toggle checkboxes / switches'],
          ['Esc', 'Dismiss / cancel current transient surface'],
        ]}
      />
    </DocsCard>
  </div>
</section>

<section>
  <SectionHead title="Per-category contracts" meta="7 categories · APG aligned" />

  <h3>Buttons &amp; toggles</h3>
  <p className="hx-docs-card-body">
    <code>&lt;${dsName}-button&gt;</code>, <code>&lt;${dsName}-icon-button&gt;</code>,{' '}
    <code>&lt;${dsName}-switch&gt;</code>, <code>&lt;${dsName}-checkbox&gt;</code>.
    Native HTML semantics — keyboard handled by the user agent.
  </p>
  <KeyTable
    rows={[
      ['Tab', 'Focus the control'],
      ['Space', 'Activate / toggle'],
      ['Enter', 'Activate (button only — Space is canonical for toggle)'],
    ]}
  />

  <h3>Single-select listbox</h3>
  <p className="hx-docs-card-body">
    <code>&lt;${dsName}-select&gt;</code> (closed combobox + open listbox),{' '}
    <code>&lt;${dsName}-radio-group&gt;</code>. Roving tabindex inside the group; arrow
    keys move within, Tab leaves.
  </p>
  <KeyTable
    rows={[
      ['Tab', 'Move into / out of the group'],
      ['Up / Down', 'Move within the listbox / radio group'],
      ['Home / End', 'Jump to first / last option'],
      ['Enter', 'Activate the focused option (combobox only)'],
      ['Space', 'Toggle the focused option (radio only)'],
      ['Esc', 'Close listbox without committing (combobox only)'],
      ['A-Z', 'Type-ahead — focus first option starting with the letter'],
    ]}
  />

  <h3>Tabs</h3>
  <p className="hx-docs-card-body">
    <code>&lt;${dsName}-tabs&gt;</code>. Manual activation by default — Arrow moves focus,
    Enter / Space activates. APG's "automatic activation" variant is opt-in via attribute.
  </p>
  <KeyTable
    rows={[
      ['Tab', 'Move into the tablist, then into the active panel'],
      ['Left / Right', 'Move focus between tabs (manual activation)'],
      ['Home / End', 'Jump to first / last tab'],
      ['Enter / Space', 'Activate the focused tab'],
    ]}
  />

  <h3>Menu / menubar</h3>
  <p className="hx-docs-card-body">
    <code>&lt;${dsName}-menu&gt;</code>, <code>&lt;${dsName}-menu-item&gt;</code>,{' '}
    <code>&lt;${dsName}-overflow-menu&gt;</code>. Roving tabindex; submenu opens with
    Right / Enter, closes with Left / Esc.
  </p>
  <KeyTable
    rows={[
      ['Down / Up', 'Move focus between items'],
      ['Right', 'Open submenu of focused item'],
      ['Left', 'Close submenu and return focus to parent item'],
      ['Enter / Space', 'Activate focused item'],
      ['Esc', 'Close menu and restore focus to trigger'],
      ['Home / End', 'Jump to first / last item'],
      ['A-Z', 'Type-ahead'],
    ]}
  />

  <h3>Dialog / drawer</h3>
  <p className="hx-docs-card-body">
    <code>&lt;${dsName}-dialog&gt;</code>, <code>&lt;${dsName}-drawer&gt;</code>.
    Modal focus trap; Escape closes; focus restores to the trigger.
  </p>
  <KeyTable
    rows={[
      ['Tab / Shift + Tab', 'Cycle within the dialog (focus trapped)'],
      ['Esc', 'Dismiss the dialog'],
      ['Enter', 'Activate primary button if focused'],
    ]}
  />

  <h3>Disclosure / accordion</h3>
  <p className="hx-docs-card-body">
    <code>&lt;${dsName}-accordion&gt;</code>, <code>&lt;${dsName}-disclosure&gt;</code>.
    The trigger is a button; the panel is a sibling region. Multiple panels may be open at once
    unless single-select is enabled.
  </p>
  <KeyTable
    rows={[
      ['Tab', 'Move between accordion headers'],
      ['Enter / Space', 'Toggle the focused panel'],
      ['Down / Up', 'Move between accordion headers (within group)'],
      ['Home / End', 'Jump to first / last header'],
    ]}
  />

  <h3>Form field with popup</h3>
  <p className="hx-docs-card-body">
    <code>&lt;${dsName}-date-picker&gt;</code>,{' '}
    <code>&lt;${dsName}-time-picker&gt;</code>,{' '}
    <code>&lt;${dsName}-color-picker&gt;</code>. The field stays focusable; the popup is
    opened with Down / Alt+Down and dismissed with Esc.
  </p>
  <KeyTable
    rows={[
      ['Down / Alt + Down', 'Open the popup'],
      ['Esc', 'Close the popup without committing'],
      ['Enter', 'Commit the focused value and close'],
      ['Arrow keys', 'Navigate within the popup grid (date) or scale (time)'],
      ['Page Up / Down', 'Jump by larger unit (month / hour)'],
    ]}
  />

  <h3>Application shortcuts</h3>
  <p className="hx-docs-card-body">
    Page-level shortcuts published by the consumer app. The system's command-menu primitive
    opens via <kbd>Cmd K</kbd> / <kbd>Ctrl K</kbd> and exposes a registry consumers populate.
    All shortcuts must be discoverable via a cheat sheet (typically <kbd>?</kbd>) and
    user-remappable per WCAG 2.1.4.
  </p>
  <KeyTable
    rows={[
      ['/', 'Focus global search (consumer-defined)'],
      ['?', 'Open keyboard cheat sheet'],
      ['Cmd + K / Ctrl + K', 'Open command palette'],
      ['Esc', 'Close any open command surface'],
    ]}
  />
</section>

<section>
  <SectionHead title="The contract in code" meta="roving tabindex pattern" />
  <p className="hx-docs-card-body">
    Below is the canonical roving-tabindex implementation the system uses for tablists, menus,
    and radio groups. The active item carries <code>tabindex="0"</code>; siblings carry{' '}
    <code>tabindex="-1"</code>. Arrow keys shift the active index; Tab leaves the group.
  </p>

  <CodeBlock language="ts" filename="${dsName}-tabs.ts" code={TABS_KEYDOWN_TS} />
</section>

<section>
  <SectionHead title="What we never do" meta="anti-patterns" />
  <ul>
    <li>
      <strong>Trap Tab inside a non-modal widget.</strong> Tab must always leave any non-modal
      group; only modal dialogs trap. WCAG 2.1.2.
    </li>
    <li>
      <strong>Reinvent Enter / Space.</strong> The activation key for a button is Space
      (canonical) and Enter (form-submit semantics). Both must work.
    </li>
    <li>
      <strong>Hide focus.</strong> No <code>outline: none</code> without a visible replacement —
      ever. SC 2.4.7.
    </li>
    <li>
      <strong>Mouse-only state.</strong> Hover-only menus, drag-only reordering — every gesture
      has a keyboard equivalent.
    </li>
    <li>
      <strong>Single-character shortcuts that are not remappable.</strong> SC 2.1.4 requires a
      way to turn off, remap, or activate-only-on-focus.
    </li>
  </ul>
</section>

<section>
  <SectionHead title="Cross-references" meta="dig deeper" />
  <div className="hx-docs-card-grid">
    <DocsCard title="Focus management" tag="Accessibility / Focus Management">
      <p className="hx-docs-card-body">
        How focus is contained, restored, and ringed across modal and roving-tabindex widgets.
      </p>
    </DocsCard>
    <DocsCard title="W3C APG" tag="external · authoritative">
      <p className="hx-docs-card-body">
        The patterns here are direct ports of <code>w3c.github.io/aria-practices</code>. Treat
        APG as the source of truth when adding a new component.
      </p>
    </DocsCard>
  </div>
</section>

</div>
`,
  };
}
