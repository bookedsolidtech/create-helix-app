/**
 * wc-storybook scene-story emitters — orchestrator.
 *
 * Ports the 4 Helix scene/playground story files into cross-domain-neutral
 * SaaS examples. Each scene is emitted as its own `.stories.ts` (or
 * `.stories.tsx` for the playground) and lands in the consumer's
 * `src/stories/patterns/scenes/` (or `src/stories/foundations/tokens/`
 * for the Tokens playground) tree. Per-scene implementations live in the
 * sibling `scenes/*.ts` files — split because the combined output exceeds
 * the 1500-LOC grep-friendly threshold (per the principal-engineer rule
 * + the shimmying-roaming-kernighan plan hold condition).
 *
 * Helix → renamed mapping:
 *
 *   patient-intake.stories.ts       → account-setup.stories.ts
 *     (full rewrite: SaaS sign-up flow)
 *   provider-dashboard.stories.ts   → team-dashboard.stories.ts
 *     (full rewrite: generic team-admin overview)
 *   settings.stories.ts             → settings.stories.ts
 *     (label neutralization — kept the tab structure)
 *   playground/Tokens.stories.tsx   → Tokens.stories.tsx
 *     (verbatim port — content already domain-neutral)
 *
 * Adaptation rules (per shimmying-roaming-kernighan plan, Phase 4):
 *
 * 1. Tag substitution — every literal `hx-*` body reference (in the Lit
 *    `html\`…\`` render functions, in `data-testid` lookups, in
 *    `tagName.toLowerCase()` assertions) is rewritten to the consumer's
 *    `{ds}-*`. Component imports from `@helixui/library/components/hx-*`
 *    stay literal — the consumer's `{ds}-*` tags extend those upstream
 *    classes via their scaffolded `client-element.ts`.
 *
 * 2. Cross-domain-neutral copy — patient/MRN/clinic/chart/provider/
 *    intake/appointment/prescription/medication/consent-form references
 *    are forbidden. Grep tests enforce zero matches. Replacement copy
 *    sticks to generic SaaS / team-admin / settings flows.
 *
 * 3. Story shape preserved — `Meta` + `StoryObj` types, `render: ()`
 *    arrow fns returning Lit `html\`…\``, `play: async ({ canvasElement
 *    }) => { ... }` blocks using `expect()` + `userEvent` + `within`
 *    from `storybook/test` (NOT the deprecated `@storybook/jest`).
 *
 * 4. Healthcare-tinted Helix `tagName` assertions — `hx-form`,
 *    `hx-tabs`, etc. — get rewritten to `{ds}-form`, `{ds}-tabs` etc.
 *    so the assertion matches the consumer's rendered tags.
 *
 * Each emitter returns `{ relativePath, content }` so scaffold.ts can
 * iterate and call `safeWriteFile`. relativePath is rooted at the
 * consumer's project directory.
 */

export interface SceneEmission {
  /** Path relative to the consumer's project directory. */
  relativePath: string;
  /** Full file body. */
  content: string;
}

export interface SceneEmissionContext {
  /** Lowercase tag prefix, e.g. `aurora` (`<aurora-button>`). */
  dsName: string;
  /** PascalCase class form, e.g. `Aurora`. Unused by the scenes (tag
   *  substitution operates on the lowercase form) — kept on the signature
   *  for symmetry with the sibling emitters. */
  dsClass: string;
}

import { emitAccountSetupScene } from './scenes/account-setup.js';
import { emitTeamDashboardScene } from './scenes/team-dashboard.js';
import { emitSettingsScene } from './scenes/settings.js';
import { emitTokensPlaygroundScene } from './scenes/tokens-playground.js';

/**
 * Returns all 4 Phase-4 scene emissions in a deterministic order.
 * scaffold.ts iterates and writes each via `safeWriteFile`.
 */
export function getSceneEmissions(ctx: SceneEmissionContext): SceneEmission[] {
  return [
    emitAccountSetupScene(ctx),
    emitTeamDashboardScene(ctx),
    emitSettingsScene(ctx),
    emitTokensPlaygroundScene(ctx),
  ];
}
