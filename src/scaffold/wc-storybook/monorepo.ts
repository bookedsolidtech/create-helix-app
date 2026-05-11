/**
 * wc-storybook monorepo scaffolder — emits into packages/design-system/
 * inside a pnpm-workspace + turbo monorepo, with package.json
 * `name: @{scope}/design-system` and `"private": true` (workspace-internal,
 * NOT publishable in v0.7.0 per DXA Q4).
 *
 * v0.7.0 Phase A: STUB. The dispatch in src/scaffold.ts routes
 * options.monorepoMode === true to this function, which throws to
 * surface the not-yet-implemented state during the phased rollout.
 * Phase F will replace this stub with the real monorepo emit by
 * introducing emitWcStorybookEmissions({ baseDir, ...options }) in
 * _shared.ts and calling it with baseDir = packages/design-system.
 */
import type { ProjectOptions } from '../../types.js';

export async function scaffoldWcStorybookMonorepo(_options: ProjectOptions): Promise<void> {
  throw new Error('wc-storybook monorepo scaffolder not yet implemented — runs in v0.7.0 Phase F.');
}
