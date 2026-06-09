import type {
  AccessibilityEmissionContext,
  AccessibilityMdxEmission,
} from '../mdx-accessibility.js';

// IMPORTS_BASE — shared across the accessibility MDX emitters.
const IMPORTS_BASE = `import { Meta } from '@storybook/addon-docs/blocks';`;

// ---------------------------------------------------------------------------
// AAAStoryTemplate.mdx — canonical pattern for an AAA story page.
// ---------------------------------------------------------------------------

export function emitAaaStoryTemplate({
  dsName,
  dsClass,
}: AccessibilityEmissionContext): AccessibilityMdxEmission {
  return {
    relativePath: 'src/stories/accessibility/AAAStoryTemplate.mdx',
    content: `{/* AAAStoryTemplate.mdx — canonical pattern for an AAA-graded component story page */}

${IMPORTS_BASE}
import { APGPatternCard } from '../_components/APGPatternCard';
import { ConsumerObligations } from '../_components/ConsumerObligations';
import { SectionHead } from '../_components/SectionHead';

<Meta title="Accessibility/AAA Story Template" />

<div className="hx-docs">

# AAA Story Template

This page is the canonical reference for documenting a component that has earned **WCAG 2.2 Level AAA + peer-standards** evidence. Story files for graded components follow this pattern so the public-facing docs page reads as **conformance documentation**, not as a CEM control enumeration.

The pattern surfaces evidence in priority order: real-world usage first, conformance evidence second, ARIA / keyboard contract third, consumer obligations fourth, the audit fifth, and CEM-driven variant gallery last.

---

## Section order (top → bottom)

1. **Hero usage scenario** — hand-authored Lit template inside a component story (e.g. an account-setup form, a workspace-summary widget). The first thing a reader sees must be the component working in real context.
2. **A11yStatusCard** — auto-rendered by \`HelixDocsPage\` (the Storybook autodocs template). Pulls \`helixMeta.aaa.*\` from CEM. No author action required.
3. **APG Pattern Card** — the \`APGPatternCard\` component. Cites the W3C APG pattern, renders the keyboard contract as \`<kbd>\` clusters, and documents the expected screen-reader announcement.
4. **Consumer obligations** — the \`ConsumerObligations\` component. Hand-curated from the AAA review notes a project keeps for each graded component.
5. **Live state demos** — hand-authored stories for focus, hover, disabled, error, and loading states with annotated descriptions.
6. **Inline audit panel** — an opt-in \`InlineAuditPanel\` slot. The scaffolded factory ships the panel as a no-op; consumers pass their own audit content (e.g. a markdown string) via the \`markdown\` prop when they want the inline-evidence treatment.
7. **Variant gallery** — at the bottom, smaller. CEM-driven control iteration belongs here, not at the top of the page.

---

## Reference template

This is the canonical MDX scaffold. Copy it verbatim, then customize the hero scenario, screen-reader announcement, and consumer obligations for the target component. The \`{ds}\` placeholders below resolve to your design system's tag prefix (\`${dsName}\` in this scaffold).

\`\`\`mdx
{/* ${dsName}-foo.mdx — graded story page for ${dsName}-foo */}

import { Meta } from '@storybook/addon-docs/blocks';
import { APGPatternCard } from '../_components/APGPatternCard';
import { ConsumerObligations } from '../_components/ConsumerObligations';

<Meta title="Components/${dsClass}Foo/Conformance" />

<div className="hx-docs">

## ${dsName}-foo — sign-in form context

[Hero usage scenario goes here — show the component WORKING, not enumerated.]

## How to read the badges

The AAA badge above is rendered by the autodocs template from \\\`helixMeta.aaa.*\\\` in
\\\`custom-elements.json\\\`. Each criterion chip is expanded into the row-level evidence
below.

<APGPatternCard tag="${dsName}-foo" screenReaderAnnouncement="Submit, button" />

<ConsumerObligations
  tag="${dsName}-foo"
  obligations={[
    'Provide an accessible name (slot content or aria-label) on every instance.',
    'Do not strip the focus ring via author CSS — use the --hx-focus-ring-* tokens to customise.',
    'Render the component on a page that respects WCAG page-level criteria (landmarks, language, page title).',
  ]}
/>

[Hand-authored interactive state demos go here — focus, hover, error, disabled.]

## Variant gallery

[CEM-driven enumeration goes here — last, smaller.]

</div>
\`\`\`

---

## Why this order

<SectionHead title="Documentation, not enumeration" meta="--editorial-priority" />

A docs page that opens with \`<${dsName}-button variant="primary">…</${dsName}-button>\` followed by 24 variant tiles is a CEM regurgitation. A docs page that opens with a real account-setup form, then proves the component clears AAA on every applicable Success Criterion, then walks through the keyboard contract, then warns the consumer about author-CSS footguns, is **conformance documentation**.

Procurement teams in regulated industries make purchase decisions on conformance documentation. The variant gallery is reference material; the conformance evidence is the differentiator.

<SectionHead title="Live data, never hand-typed" meta="--source-of-truth" />

The \`A11yStatusCard\` and \`APGPatternCard\` components pull live from \`@helixui/library/custom-elements.json\` and your local \`custom-elements.json\`. There is no scenario where a docs page can drift from the cert payload — if the component loses its grade, the badge flips and the rows go Unknown.

<SectionHead title="Consumer obligations are editorial" meta="--curated" />

The only hand-curated section is \`<ConsumerObligations>\`. Obligations reflect editorial judgment about which footguns to flag for the target audience and live in story source so they evolve with the component contract.

</div>
`,
  };
}
