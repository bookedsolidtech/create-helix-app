/**
 * react-vite monorepo scaffolder — emits into apps/web/ inside a
 * pnpm-workspace + turbo monorepo, referencing @{scope}/design-system
 * via workspace:* rather than @helixui/library directly.
 *
 * v0.7.0 Phase C: the shared root orchestrator (scaffoldMonorepoRoot) is
 * now called BEFORE the still-pending app emit. After Phase C, this path
 * lands the 7 root artifacts and the empty package dirs, then throws so
 * the root structure can be tested independently of the Vite-specific
 * apps/web content.
 *
 * Phase E will replace the trailing throw with the real apps/web/ Vite
 * emit by adapting the shared emitters in _shared.ts and swapping the
 * design-system import surface to workspace:*.
 */
import type { ProjectOptions } from '../../types.js';
import { scaffoldMonorepoRoot } from '../monorepo.js';

export async function scaffoldReactViteMonorepo(options: ProjectOptions): Promise<void> {
  await scaffoldMonorepoRoot({ options });
  throw new Error(
    'react-vite monorepo scaffolder not yet implemented — app emit pending in v0.7.0 Phase E.',
  );
}
