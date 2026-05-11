/**
 * react-next monorepo scaffolder — emits into apps/web/ inside a
 * pnpm-workspace + turbo monorepo, referencing @{scope}/design-system
 * via workspace:* rather than @helixui/library directly.
 *
 * v0.7.0 Phase C: the shared root orchestrator (scaffoldMonorepoRoot) is
 * now called BEFORE the still-pending app emit. After Phase C, this path
 * lands the 7 root artifacts (pnpm-workspace.yaml, turbo.json, root
 * package.json + tsconfig + README + .gitignore, empty apps/web +
 * packages/* dirs) and then throws to signal that the apps/web/ Next.js
 * content is still pending. That lets the root structure be tested in
 * isolation while Phase D iterates on the Next.js emit.
 *
 * Phase D will replace the trailing throw with the real apps/web/ emit
 * by adapting the shared emitters in _shared.ts to write under
 * options.directory/apps/web and swapping the design-system import
 * surface from @helixui/library → workspace:*.
 */
import type { ProjectOptions } from '../../types.js';
import { scaffoldMonorepoRoot } from '../monorepo.js';

export async function scaffoldReactNextMonorepo(options: ProjectOptions): Promise<void> {
  await scaffoldMonorepoRoot({ options });
  throw new Error(
    'react-next monorepo scaffolder not yet implemented — app emit pending in v0.7.0 Phase D.',
  );
}
