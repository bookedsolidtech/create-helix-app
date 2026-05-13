/**
 * v0.9.0 Phase A — SvelteKit flat (single-app) scaffolder.
 *
 * Re-exports the existing scaffoldSvelteKit body from src/scaffold.ts.
 * The flat path is being deprecated per user direction (2026-05-12) —
 * the monorepo path becomes the supported shipping target on the same
 * release. This file exists for symmetry with
 * react-next/react-vite/astro/wc-storybook forks and to preserve API
 * compatibility for scaffoldProject({framework: 'svelte-kit',
 * monorepoMode: false}) callers during the deprecation window.
 */
export { scaffoldSvelteKit as scaffoldSvelteKitFlat } from '../../scaffold.js';
