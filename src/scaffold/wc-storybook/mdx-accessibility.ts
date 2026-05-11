/**
 * wc-storybook accessibility-narrative MDX emitters — orchestrator.
 *
 * Adapts `helix/apps/storybook/stories/accessibility/*.mdx` (8 pages +
 * `_snippets.ts`) into emitter functions parameterized by the consumer's
 * `dsName` and `dsClass`. The page-emitter implementations live in the
 * sibling `mdx-accessibility/*.ts` files — split per upstream page so each
 * file stays grep-friendly (per the principal-engineer "<300 LOC for
 * grep-ability" rule and the explicit shimmying-roaming-kernighan plan
 * hold condition: "If module exceeds 1500 LOC → split per page into
 * mdx-accessibility/{Dashboard,SuccessCriteria,...}.ts").
 *
 * Adaptation rules (per shimmying-roaming-kernighan plan, Phase 3):
 *
 * 1. Tag substitution — every literal `hx-*` in body content is replaced
 *    with `{ds}-*`. The consumer's design system extends `@helixui/library`
 *    under their own namespace; `<hx-*>` references would point to tags
 *    they have not registered.
 * 2. Strip monorepo paths — references to `packages/hx-library/`,
 *    `apps/storybook/scripts/`, `aaa-standards.json`, and `?raw` imports
 *    of AAA-AUDIT.md are dropped. Replaced with package-relative or
 *    generic guidance ("regenerate via your tokens build").
 * 3. Cross-domain-neutral copy — healthcare examples (intake, patient,
 *    clinic, MRN, provider, advance-directive, glucose) rewritten to
 *    neutral SaaS examples (account creation, team dashboards, admin
 *    settings, account-deletion confirmation). Per
 *    `feedback_realistic_sample_data`.
 * 4. ConsumerObligations name collision — the Accessibility/Consumer
 *    Obligations PAGE coexists with the ConsumerObligations TSX
 *    COMPONENT (Phase 1, src/stories/_components/ConsumerObligations.tsx).
 *    The page title carries a space (`Consumer Obligations`) while the
 *    TSX component remains importable as before. Component MDXes
 *    (Phase 2) still import the TSX as `<ConsumerObligations>` — no
 *    runtime conflict, only a sidebar-label distinction.
 * 5. AAAConformanceCard imports stay STRIPPED (per Phase 1/2 decision).
 *    InlineAuditPanel imports allowed but never with a `markdown` prop
 *    — the Phase 1 stub renders null without one.
 * 6. `_snippets.ts` ports verbatim apart from one healthcare-tinted
 *    fixture (`REGENERATE_CONTRAST_BASH` references the helix monorepo
 *    command); rewritten to neutral guidance.
 *
 * Each emitter returns an `{ relativePath, content }` pair so scaffold.ts
 * can iterate and call `safeWriteFile`. relativePath is rooted at the
 * consumer's project directory.
 */

export interface AccessibilityMdxEmission {
  /** Path relative to the consumer's project directory. */
  relativePath: string;
  /** Full file body (frontmatter + imports + content for MDX; module body for _snippets.ts). */
  content: string;
}

export interface AccessibilityEmissionContext {
  /** Lowercase tag prefix, e.g. `aurora` (`<aurora-button>`). */
  dsName: string;
  /** PascalCase class form, e.g. `Aurora` (`AuroraButton`). */
  dsClass: string;
}

import { emitSnippetsTs } from './mdx-accessibility/snippets.js';
import { emitAaaStoryTemplate } from './mdx-accessibility/aaa-story-template.js';
import { emitDashboardMdx } from './mdx-accessibility/dashboard.js';
import { emitSuccessCriteriaMdx } from './mdx-accessibility/success-criteria.js';
import { emitConsumerObligationsMdx } from './mdx-accessibility/consumer-obligations.js';
import { emitKeyboardContractsMdx } from './mdx-accessibility/keyboard-contracts.js';
import { emitFocusManagementMdx } from './mdx-accessibility/focus-management.js';
import { emitContrastDeepDiveMdx } from './mdx-accessibility/contrast-deep-dive.js';
import { emitForcedColorsMdx } from './mdx-accessibility/forced-colors.js';

/**
 * Returns all 9 accessibility-namespace emissions in a deterministic order.
 * scaffold.ts iterates and writes each via `safeWriteFile`.
 */
export function getAccessibilityMdxEmissions(
  ctx: AccessibilityEmissionContext,
): AccessibilityMdxEmission[] {
  return [
    emitSnippetsTs(ctx),
    emitAaaStoryTemplate(ctx),
    emitDashboardMdx(ctx),
    emitSuccessCriteriaMdx(),
    emitConsumerObligationsMdx(ctx),
    emitKeyboardContractsMdx(ctx),
    emitFocusManagementMdx(ctx),
    emitContrastDeepDiveMdx(),
    emitForcedColorsMdx(ctx),
  ];
}
