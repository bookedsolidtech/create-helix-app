/**
 * react-next flat (single-app) scaffolder — v0.6.x behavior preserved.
 *
 * v0.7.0 Phase A: re-exports the existing scaffoldReactNext function
 * from src/scaffold.ts under the new fork name. The body stays in
 * scaffold.ts in Phase A to keep the diff mechanical and the golden
 * snapshot byte-identical. Phase D will inline the body and move
 * shared emitters into _shared.ts.
 *
 * Per PE P1 (fork-don't-branch): flat.ts and monorepo.ts only differ
 * in OUTPUT-ROOT logic. Threading monorepoMode through the existing
 * 1900+ LOC scaffoldReactNext would create a future bug class.
 */
export { scaffoldReactNext as scaffoldReactNextFlat } from '../../scaffold.js';
