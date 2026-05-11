/**
 * Shared emit helpers for the react-vite scaffolder that don't care
 * about output root (flat single-app vs monorepo apps/web).
 *
 * v0.7.0 Phase A — placeholder. Phase E will pull page/component/test
 * emitters out of src/scaffold.ts (scaffoldReactVite, ~line 3157) into
 * this module so flat.ts and monorepo.ts can share them. Per PE P1
 * (fork-don't-branch): only OUTPUT-ROOT logic forks; everything else
 * lives here.
 *
 * Phase A keeps the existing scaffoldReactVite body intact in scaffold.ts
 * and re-exports it from flat.ts. _shared.ts is intentionally empty in
 * this phase — it establishes the import surface for Phase E.
 */
export {};
