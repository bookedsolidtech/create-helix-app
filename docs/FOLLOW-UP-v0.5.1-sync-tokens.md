# Follow-up: sync-tokens.ts hardening for v0.5.1

Two P1 codex findings on `scripts/sync-tokens.ts` emit were deferred from
v0.5.0 to focus the release on the helix-lift work it advertised. Neither
breaks the core scaffold output — both affect the opt-in Figma REST pull
path that consumers invoke explicitly via `pnpm tokens:sync`.

## Finding 1 — Preserve non-primitive branches during sync

**File:** `src/scaffold.ts` (sync-tokens.ts emit) around the JSON rewrite.

The current emit replaces `src/tokens/tokens.json` from scratch with only
entries from `FIGMA_PRIMITIVES_COLLECTION`. In a default scaffold this
drops:

- `responsive.*` branches the scaffold itself seeded
- Any locally-authored semantic / component tiers like
  `--{prefix}-color-action-*` that the bridge CSS reads at runtime

After `tokens:sync && build:tokens`, those layers vanish and Storybook
loses its responsive mode + component fallbacks.

**Fix sketch:** read the existing tokens.json first, deep-merge the
Figma-pulled primitives into it (preserving sibling branches), then
write back. Keep the warning when a primitive value drifts so the
sync still surfaces upstream changes.

## Finding 2 — Emit dark/high-contrast Figma modes

**File:** `src/scaffold.ts` (sync-tokens.ts emit) around
`primitivesCollection.modes[0]`.

Hardcodes mode index 0 (light), so multi-mode Figma collections collapse
to a single mode on sync. The build-tokens walker now emits
`:root[data-theme="<branch>"]` blocks for each top-level mode key
(`dark`, `high-contrast`), so sync needs to emit each Figma mode under
its corresponding top-level key.

**Fix sketch:** iterate `primitivesCollection.modes`, map each to its
top-level key (mode 0 → flat top-level, mode 1+ → `dark` /
`high-contrast` based on mode name or scaffold-time map), and walk the
collection per-mode.

## Why deferred

- v0.5.0 already contains the build-tokens.ts side (consumes
  `dark` / `high-contrast` branches correctly via `walkScoped`).
- Sync is an opt-in advanced workflow; consumers wire `FIGMA_TOKEN` +
  `FIGMA_FILE_KEY` explicitly. The default no-sync experience is
  unaffected by either finding.
- Round 13 of an iterative codex review surface — boundary set per the
  release brief authority.

## Trigger

Land in v0.5.1 (patch) within 1-2 weeks of v0.5.0, before consumer
Figma-sync usage scales beyond the early adopters who can patch around
it manually.
