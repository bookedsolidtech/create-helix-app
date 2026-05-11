/**
 * react-vite monorepo scaffolder — emits into apps/web/ inside a
 * pnpm-workspace + turbo monorepo, referencing @{scope}/design-system
 * via workspace:* rather than @helixui/library directly.
 *
 * v0.7.0 Phase A: STUB. The dispatch in src/scaffold.ts routes
 * options.monorepoMode === true to this function, which throws to
 * surface the not-yet-implemented state during the phased rollout.
 * Phase E will replace this stub with the real monorepo emit by
 * adapting the shared emitters in _shared.ts to write under apps/web/
 * and swapping the design-system import surface.
 */
import type { ProjectOptions } from '../../types.js';

export async function scaffoldReactViteMonorepo(_options: ProjectOptions): Promise<void> {
  throw new Error('react-vite monorepo scaffolder not yet implemented — runs in v0.7.0 Phase E.');
}
