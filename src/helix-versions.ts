/**
 * Single source of truth for the HELiX package version pins every template,
 * scaffolder, and the `upgrade` command emits.
 *
 * Why this file exists: before v0.9.2 each template hardcoded its own
 * `@helixui/library` / `@helixui/tokens` range. The pins were set once and
 * never tracked HELiX's releases, so every scaffold was born ~2 majors stale
 * (the Pulse implementation test surfaced this — see the create-helix
 * feedback doc). Centralizing the pins here makes a HELiX bump a one-line
 * change and lets `doctor` compare an installed version against the major we
 * actually pin/test against.
 *
 * BUMP PROCEDURE when HELiX ships a new major/minor:
 *   1. Update the three *_VERSION ranges below.
 *   2. Update *_MAJOR if the major changed (drives the doctor drift check).
 *   3. Update the `^X.Y.Z` assertions in the test suite (a `grep` for the
 *      old range finds them).
 *
 * Pinned-constant — NOT live-fetched at scaffold time — on purpose: scaffold
 * output must stay byte-deterministic for the golden-snapshot idempotency
 * contract, and scaffolding must work offline. The freshness guarantee comes
 * from the `doctor` drift check + the `upgrade` command, not from a network
 * call during `create-helix`.
 */

/** `@helixui/library` range emitted into scaffolded package.json files. */
export const HELIX_LIBRARY_VERSION = '^3.10.0';

/**
 * `@helixui/tokens` range emitted into scaffolded package.json files.
 *
 * Floor is `^3.9.4`, NOT `^3.10.0`: `@helixui/tokens@3.10.0` does not exist on
 * npm, and `@helixui/library@3.10.0` depends on `@helixui/tokens` `3.9.4`
 * exactly. A `^3.10.0` floor here would be unsatisfiable and break a fresh
 * install. `^3.9.4` resolves to the published 3.9.4 the library expects while
 * leaving room for future 3.x token patches.
 */
export const HELIX_TOKENS_VERSION = '^3.9.4';

/**
 * `@helixui/icons` range. `@helixui/library@3.x` peer-requires `1.0.4`
 * exactly; `^1.0.4` satisfies that while leaving room for 1.x patches.
 */
export const HELIX_ICONS_VERSION = '^1.0.4';

/**
 * Major version `@helixui/library` is pinned/tested against. The `doctor`
 * drift check fails when an installed copy's major is below this.
 */
export const HELIX_LIBRARY_MAJOR = 3;

/** Major version `@helixui/tokens` is pinned/tested against. */
export const HELIX_TOKENS_MAJOR = 3;

/** Major version `@helixui/icons` is pinned/tested against. */
export const HELIX_ICONS_MAJOR = 1;
