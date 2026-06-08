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

/**
 * Shared, fail-OPEN gate for the `@helixui/icons@^1.0.4` peer floor.
 *
 * The 1.0.4 icons peer is only required once `@helixui/library` is a STABLE
 * release >= 3.10.0 (the release that tightened the `<hx-icon>` peer). Both
 * `doctor` (`checkHelixIcons`) and `upgrade` (`libraryMeetsFloor`) gate on this
 * ONE predicate so the two paths can't drift — every earlier round drifted by
 * re-parsing version strings two different (and both buggy) ways.
 *
 * The rule is correct-by-construction: enforce ONLY on an UNAMBIGUOUS signal
 * that the library is a stable >= 3.10.0. Anything ambiguous fails open (returns
 * false → do not enforce/synthesize), deliberately trading false-NEGATIVES (we
 * may not warn on an exotic-but-valid >= 3.10 range) to eliminate
 * false-POSITIVES (breaking valid manifests).
 *
 * Accepted (→ true) — a single clean LOWER-bound form, no prerelease, no upper
 * bound, whose minimum is >= `floor`:
 *   - exact / bare:  `3.10.0`, `3.11.2`, `v3.10.0`
 *   - caret / tilde: `^3.10.0`, `^3.10`, `~3.10.0`, `~3.10`
 *   - gte / gt:      `>=3.10.0`, `>3.10.0`
 *
 * Rejected (→ false, stay silent):
 *   - any upper-bound-bearing leaf:  `<3.10.0`, `<=3.10.0`, `<4.0.0`,
 *     and compound ranges' upper clause is ignored — only a clean leading
 *     lower bound counts (`>=3.10.0 <4.0.0` is accepted via its first clause)
 *   - any prerelease tag:            `3.10.0-next.5`, `^3.10.0-next.1`
 *   - lower bound below `floor`:     `^3.9.1`, `>=3.9.0`, `2.x`
 *   - workspace / catalog / alias / wildcard / unparseable:
 *     `workspace:*`, `catalog:`, `npm:@x/y@3.10.0`, `3.x`, `*`, `latest`
 *
 * `spec` may be a single version OR a whitespace-separated compound range
 * (`>=3.10.0 <4.0.0`); only its FIRST clause is read as the lower bound. Callers
 * pre-split `||` unions and pass each leaf. `floor` is a stable `M.m.p`
 * (e.g. `3.10.0`); its own prefix (`^`) is tolerated.
 */
export function libraryProvablyAtLeast(spec: string, floor: string): boolean {
  const floorTuple = parseStableCore(floor);
  if (floorTuple === null) return false;

  // Only the FIRST whitespace clause is the lower bound. If ANY later clause is
  // an upper bound (`<`/`<=`), the range is still fine — we read the lower
  // bound — but a leaf that LEADS with an upper bound is ambiguous → reject.
  const clauses = spec.trim().split(/\s+/);
  const lower = clauses[0] ?? '';

  // A leading upper-bound operator means there is no usable lower bound here.
  if (/^<=?/.test(lower)) return false;

  // Strip exactly one accepted lower-bound operator: `^`, `~`, `>=`, `>`, `v`,
  // or none (bare/exact). Anything else (`<`, `<=`, `=`, `npm:`, `workspace:`,
  // `catalog:`, wildcards) is not an accepted form.
  const opMatch = /^(>=|>|\^|~|v|)(.*)$/.exec(lower);
  if (opMatch === null) return false;
  const core = opMatch[2];

  // The core must be a CLEAN stable version with NO prerelease/build metadata.
  // parseStableCore rejects `3.10.0-next.5`, `3.x`, `*`, `npm:...`, `catalog:`.
  const tuple = parseStableCore(core);
  if (tuple === null) return false;

  // Minor-aware >= comparison of the lower bound against the floor.
  for (let i = 0; i < 3; i++) {
    if (tuple[i] > floorTuple[i]) return true;
    if (tuple[i] < floorTuple[i]) return false;
  }
  return true; // exactly equal
}

/**
 * Parse a CLEAN stable semver core into `[major, minor, patch]`, or null.
 *
 * Strict on purpose: accepts only fully-numeric `M`, `M.m`, or `M.m.p` (a
 * missing minor/patch defaults to 0, so `^3.10` reads as 3.10.0). REJECTS any
 * prerelease/build metadata (`-`/`+`), wildcards (`x`/`*`), comparator/alias
 * prefixes, and empty input. A leading `v` is NOT handled here — callers strip
 * operators first.
 */
function parseStableCore(core: string): [number, number, number] | null {
  const trimmed = core.trim();
  if (trimmed === '') return null;
  // Reject prerelease/build metadata and any non [digit.] character outright.
  if (!/^\d+(\.\d+){0,2}$/.test(trimmed)) return null;
  const parts = trimmed.split('.');
  const major = Number(parts[0]);
  const minor = parts.length > 1 ? Number(parts[1]) : 0;
  const patch = parts.length > 2 ? Number(parts[2]) : 0;
  return [major, minor, patch];
}
