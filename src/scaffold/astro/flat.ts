/**
 * v0.8.0 Phase A — Astro flat (single-app) scaffolder.
 *
 * Re-exports the existing scaffoldAstro body from src/scaffold.ts. The
 * flat path is being deprecated per user direction (2026-05-11) — the
 * existing template is tagged experimental in v0.8.0 Phase F and the
 * monorepo path becomes the supported shipping target. This file
 * exists for symmetry with react-next/react-vite/wc-storybook forks
 * (v0.7.0 Phase A) and to preserve API compatibility for
 * scaffoldProject({framework: 'astro', monorepoMode: false}) callers
 * during the deprecation window.
 */
export { scaffoldAstro as scaffoldAstroFlat } from '../../scaffold.js';
