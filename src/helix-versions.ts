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

import semver from 'semver';

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
 * The `@helixui/icons` COMPATIBILITY RANGE the library@3.10+ peer accepts —
 * `^1.0.4` = `>=1.0.4 <2.0.0`. This is a RANGE, not a floor: the peer was
 * tightened to icons 1.0.4 in library 3.10, and a 2.x major is a breaking
 * change that is NOT compatible. A lower-bound-only check (`>= 1.0.4`) wrongly
 * accepts `@helixui/icons@2.0.0`; every icons-compatibility decision (doctor's
 * resolved-version check, `upgrade`'s peer-only seed) must instead ask whether
 * a version `satisfies` this range, or whether a declared range is a `subset`
 * of it. Derived from `HELIX_ICONS_VERSION` so the `^1.0.4` source of truth
 * lives in one place.
 */
export const ICONS_RANGE = HELIX_ICONS_VERSION;

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
 * Shared, fail-OPEN "does this range's MINIMUM satisfy `floor`?" predicate —
 * the single gate behind every LIBRARY-version decision.
 *
 * The `@helixui/icons@^1.0.4` peer is only required once `@helixui/library` is
 * a stable release >= 3.10.0 (the release that tightened the `<hx-icon>` peer).
 * This predicate answers ONLY "is the LIBRARY provably >= 3.10?" — the gate
 * that decides whether the icons requirement applies at all. Both library gates
 * route through this ONE predicate so they can't drift: `doctor`'s
 * `checkHelixIcons` (library spec vs 3.10.0) and `upgrade`'s `libraryMeetsFloor`
 * (library spec vs 3.10.0). The ICONS-version decision itself is a RANGE check,
 * NOT this floor — `iconsVersionCompatible` / `iconsRangeWithinCompat` test
 * membership in `^1.0.4` so a 2.x major is rejected, which a lower-bound floor
 * would wrongly accept. Backed by the `semver` library — NOT hand-rolled range
 * parsing, which leaked a new real edge (`=3.10.0`, `<3.10.0`, prereleases,
 * comparator ranges) every review round.
 *
 * `semver.minVersion(spec)` yields the lowest version a range can resolve to,
 * then `semver.gte(min, floor)` decides enforcement. This correctly handles
 * exact/`^`/`~`/`>=`/`>`/compound (`>=3.10.0 <4.0.0` → min 3.10.0) and
 * treats prereleases as below their stable release (`3.10.0-next.5` → not
 * enforced). Any spec semver can't reduce to a concrete minimum — `workspace:*`,
 * `catalog:`, an `npm:` alias, garbage — makes `minVersion` return null or
 * throw; both fail OPEN (return false → do NOT enforce/synthesize). This
 * deliberately accepts false-NEGATIVES (an exotic-but-valid >= 3.10 range may
 * not warn) to eliminate false-POSITIVES that break valid manifests.
 *
 * `spec` is a single `||`-free range leaf (callers pre-split unions). `floor`
 * is a stable `M.m.p` (e.g. `3.10.0`).
 */
export function libraryProvablyAtLeast(spec: string, floor: string): boolean {
  try {
    const min = semver.minVersion(spec);
    return min != null && semver.gte(min, floor);
  } catch {
    // minVersion throws on non-range specs (workspace:*, catalog:, aliases) —
    // fail open.
    return false;
  }
}

/**
 * True when the CONCRETE `version` (e.g. an installed `package.json` version,
 * or a registry "latest") is >= the minimum of the `floor` range. The companion
 * to `libraryProvablyAtLeast` for when you hold an exact version rather than a
 * declared range. `semver.coerce` tolerates a leading `v`/loose form; any
 * unparseable input fails open to false. Used by `upgrade`'s
 * registry-latest-vs-floor override (deciding whether to substitute the
 * create-helix pin when the registry has no acceptable "latest"). NOT for the
 * icons COMPATIBILITY check — that is a range membership test
 * (`iconsVersionCompatible`), since a lower bound alone would accept a 2.x major.
 */
export function versionMeetsFloor(version: string, floor: string): boolean {
  try {
    const coerced = semver.coerce(version);
    const floorMin = semver.minVersion(floor);
    return coerced != null && floorMin != null && semver.gte(coerced, floorMin);
  } catch {
    return false;
  }
}

/**
 * True when `spec` is a SINGLE range leaf `semver` can reduce to a concrete
 * minimum — i.e. a usable npm version range that can be copied verbatim as ONE
 * installable dependency pin. False for `workspace:*`, `catalog:`, npm aliases,
 * and unparseable specs (`minVersion`/`new Range` throw), AND for `||` unions
 * (`^1.0.0 || ^2.0.0`): a union has no single pin and `minVersion` collapses it
 * to the lowest branch's minimum, which would silently seed an installable
 * devDependency below the range the project actually declared. Used by
 * `upgrade`'s peer-only seed to decide whether a below-floor (pre-3.10) peer
 * range can be copied verbatim or must fall back to the known-good floor pin.
 */
export function isResolvableRange(spec: string): boolean {
  try {
    // A `||` union (Range.set.length > 1) can't be seeded as a single pin.
    if (new semver.Range(spec).set.length !== 1) return false;
    return semver.minVersion(spec) != null;
  } catch {
    // new Range / minVersion throw on non-range specs (workspace:*, catalog:,
    // aliases) — fail to the floor pin.
    return false;
  }
}

/**
 * Does a CONCRETE, RESOLVED `version` (an installed `package.json` version)
 * satisfy the `@helixui/icons` compatibility RANGE (`^1.0.4` =
 * `>=1.0.4 <2.0.0`)? Unlike a lower-bound floor check, this REJECTS an
 * incompatible major: `2.0.0` → false (flagged), `1.0.5`/`1.9.0` → true (ok),
 * `1.0.1` (below the patch floor) → false (flagged). `semver.coerce` tolerates
 * a leading `v`/loose form; any unparseable input fails CLOSED to false (an
 * un-checkable version can't be proven compatible). Drives doctor's resolved
 * icons-version gate.
 */
export function iconsVersionCompatible(version: string): boolean {
  try {
    const coerced = semver.coerce(version);
    return coerced != null && semver.satisfies(coerced, ICONS_RANGE);
  } catch {
    return false;
  }
}

/**
 * Is a DECLARED `range` entirely contained within the `@helixui/icons`
 * compatibility range (`^1.0.4`)? True only when EVERY version `range` permits
 * is compatible — `semver.subset(range, '^1.0.4')`. So `^1.0.4` / `^1.5.0` /
 * `~1.0.4` / `1.0.5` → true (preserve verbatim); `^1.0.1` (dips below the patch
 * floor), `^2.0.0` / `>=2.0.0` / `*` / `1.x` (admit a 2.x major or below floor),
 * a `||` union with an out-of-range branch → false (seed the known-good pin).
 * `workspace:*` / `catalog:` / aliases make `subset` throw → false. Drives
 * `upgrade`'s peer-only devDependency seed for a library already at 3.10+.
 */
export function iconsRangeWithinCompat(range: string): boolean {
  try {
    return semver.subset(range, ICONS_RANGE);
  } catch {
    return false;
  }
}
