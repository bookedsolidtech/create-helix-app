/**
 * wc-storybook flat (standalone design-system) scaffolder — v0.6.x
 * behavior preserved.
 *
 * v0.7.0 Phase A: re-exports the existing scaffoldWcStorybook function
 * from src/scaffold.ts under the new fork name. The 5366-LOC body
 * stays in scaffold.ts in Phase A to keep the diff mechanical and the
 * golden snapshot (tests/golden/wc-storybook-scaffold/golden.test.ts)
 * byte-identical. Phase F will inline the body, parameterize the
 * baseDir, and emit into packages/design-system/ when monorepoMode.
 *
 * Per PE P1 (fork-don't-branch): flat.ts and monorepo.ts only differ
 * in OUTPUT-ROOT logic. Threading monorepoMode through the existing
 * 5366-LOC scaffoldWcStorybook would create a future bug class.
 */
export { scaffoldWcStorybook as scaffoldWcStorybookFlat } from '../../scaffold.js';
