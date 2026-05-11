/**
 * wc-storybook monorepo scaffolder — emits into packages/design-system/
 * inside a pnpm-workspace + turbo monorepo, with package.json
 * `name: @{scope}/design-system` and `"private": true` (workspace-internal,
 * NOT publishable in v0.7.0 per DXA Q4).
 *
 * v0.7.0 Phase C: the shared root orchestrator (scaffoldMonorepoRoot) is
 * now called BEFORE the still-pending DS emit. After Phase C, this path
 * lands the 7 root artifacts + empty package dirs, then throws to signal
 * that the packages/design-system content is still pending in Phase F.
 *
 * NOTE on dispatch coherence: the public API (src/api.ts) coerces
 * monorepoMode → false for wc-storybook because the DS-only scaffold
 * isn't itself a monorepo, so in practice this entry point is never hit
 * from `scaffold({ framework: 'wc-storybook' })`. The scaffolder is kept
 * symmetric with react-next / react-vite so the dispatch shape in
 * scaffoldProject() stays uniform and so Phase F has somewhere to live.
 *
 * Phase F will introduce emitWcStorybookEmissions({ baseDir, ...options })
 * in _shared.ts and call it with baseDir = packages/design-system, then
 * remove the trailing throw.
 */
import type { ProjectOptions } from '../../types.js';
import { scaffoldMonorepoRoot } from '../monorepo.js';

export async function scaffoldWcStorybookMonorepo(options: ProjectOptions): Promise<void> {
  await scaffoldMonorepoRoot({ options });
  throw new Error(
    'wc-storybook monorepo scaffolder not yet implemented — DS emit pending in v0.7.0 Phase F.',
  );
}
