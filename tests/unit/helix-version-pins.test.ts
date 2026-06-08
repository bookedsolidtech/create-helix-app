import { describe, it, expect } from 'vitest';
import {
  HELIX_LIBRARY_VERSION,
  HELIX_TOKENS_VERSION,
  HELIX_ICONS_VERSION,
  HELIX_LIBRARY_MAJOR,
  HELIX_TOKENS_MAJOR,
  HELIX_ICONS_MAJOR,
  libraryProvablyAtLeast,
  isResolvableRange,
  iconsVersionCompatible,
  iconsRangeWithinCompat,
  ICONS_RANGE,
} from '../../src/helix-versions.js';
import { TEMPLATES } from '../../src/templates.js';

/**
 * Pin-coherence guard for the centralized HELiX version constants.
 *
 * The 3.10 release introduced a real trap: `@helixui/library@3.10.0` exists and
 * depends on `@helixui/tokens` `3.9.4` EXACTLY — but `@helixui/tokens@3.10.0`
 * was never published. A naive "bump everything to 3.10" would pin the tokens
 * floor at `^3.10.0`, which is unsatisfiable and breaks a fresh install. These
 * assertions fail fast if a future bump reintroduces that incoherence (or lets
 * the floors drift stale), instead of letting it slip through to a scaffolded
 * project's first `pnpm install`.
 *
 * Verified against npm on 2026-06-07:
 *   - @helixui/library@3.10.0  → deps { @helixui/tokens: "3.9.4" },
 *                                 peerDeps { @helixui/icons: "1.0.4" }
 *   - @helixui/tokens@3.9.4     → published; @helixui/tokens@3.10.0 → NOT published
 *   - @helixui/icons@1.0.4      → published
 */

/** Parse the leading semver from a range like `^3.10.0` → [3, 10, 0]. */
function parseRange(range: string): [number, number, number] {
  const match = range.match(/^[\^~]?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`unparseable version range: ${range}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

describe('HELiX version pin coherence', () => {
  it('all three floors are caret ranges with a parseable semver', () => {
    for (const range of [HELIX_LIBRARY_VERSION, HELIX_TOKENS_VERSION, HELIX_ICONS_VERSION]) {
      expect(range).toMatch(/^\^\d+\.\d+\.\d+$/);
    }
  });

  it('library floor tracks 3.10 (major 3)', () => {
    const [major, minor] = parseRange(HELIX_LIBRARY_VERSION);
    expect(major).toBe(3);
    expect(major).toBe(HELIX_LIBRARY_MAJOR);
    // Floor must be at least 3.10 so the scaffold tracks the current release.
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(3 * 1000 + 10);
  });

  it('tokens floor is 3.9.4 and NOT a nonexistent 3.10.x (the 3.10 trap)', () => {
    const [major, minor, patch] = parseRange(HELIX_TOKENS_VERSION);
    expect(major).toBe(3);
    expect(major).toBe(HELIX_TOKENS_MAJOR);
    // @helixui/tokens@3.10.0 was never published — library@3.10.0 depends on
    // tokens 3.9.4 exactly. A 3.10.x tokens floor is unsatisfiable.
    expect(`${major}.${minor}`).not.toBe('3.10');
    expect(HELIX_TOKENS_VERSION).toBe('^3.9.4');
    expect(patch).toBeGreaterThanOrEqual(4);
  });

  it('icons floor is 1.0.4 (the exact peer library@3.x requires) at major 1', () => {
    const [major, minor, patch] = parseRange(HELIX_ICONS_VERSION);
    expect(major).toBe(1);
    expect(major).toBe(HELIX_ICONS_MAJOR);
    // library@3.x peer-requires @helixui/icons 1.0.4 exactly.
    expect(minor).toBe(0);
    expect(patch).toBeGreaterThanOrEqual(4);
  });

  it('every template emits the centralized constants, never a hardcoded HELiX pin', () => {
    const buckets = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
    let assertions = 0;
    for (const template of TEMPLATES) {
      for (const bucket of buckets) {
        const deps = template[bucket];
        if (!deps) continue;
        if ('@helixui/library' in deps) {
          expect(deps['@helixui/library']).toBe(HELIX_LIBRARY_VERSION);
          assertions++;
        }
        if ('@helixui/tokens' in deps) {
          expect(deps['@helixui/tokens']).toBe(HELIX_TOKENS_VERSION);
          assertions++;
        }
        if ('@helixui/icons' in deps) {
          expect(deps['@helixui/icons']).toBe(HELIX_ICONS_VERSION);
          assertions++;
        }
      }
    }
    // Guard the guard: at least one template must declare a HELiX pin, otherwise
    // a refactor that stops emitting them would make this test vacuously pass.
    expect(assertions).toBeGreaterThan(0);
  });
});

describe('libraryProvablyAtLeast — fail-open icons-floor gate', () => {
  const FLOOR = '3.10.0';

  it.each([
    // Clean lower-bound forms whose minimum is >= 3.10.0 → ENFORCE.
    '3.10.0',
    '3.11.2',
    'v3.10.0',
    '^3.10.0',
    '^3.10',
    '~3.10.0',
    '~3.10',
    '>=3.10.0',
    '>3.10.0',
    // Compound intersection ranges — semver computes the TRUE minimum of the
    // intersection regardless of clause order, so both forms resolve to 3.10.0.
    '>=3.10.0 <4.0.0',
    '<4.0.0 >=3.10.0',
  ])('enforces for the provable >=3.10 form %j', (spec) => {
    expect(libraryProvablyAtLeast(spec, FLOOR)).toBe(true);
  });

  it.each([
    // Below the floor.
    '^3.9.1',
    '>=3.9.0',
    '~3.9',
    '3.9.4',
    '^2.5.0',
    '2.x',
    // Upper-bound-only / no lower bound at/above 3.10 → minimum < floor.
    '<3.10.0',
    '<=3.10.0',
    '<4.0.0',
    // Prerelease tag → semver treats it as below the stable release → not
    // enforced (may predate the tightened peer).
    '3.10.0-next.5',
    '^3.10.0-next.1',
    // Non-version specs / wildcards / unparseable → minVersion null or throws.
    'workspace:*',
    'catalog:',
    'npm:@x/y@3.10.0',
    '3.x',
    '*',
    'latest',
    '',
  ])('fails open (returns false) for the ambiguous/below-floor form %j', (spec) => {
    expect(libraryProvablyAtLeast(spec, FLOOR)).toBe(false);
  });

  it('returns false when the floor itself is not a clean version', () => {
    // Defensive: a malformed floor must never enforce.
    expect(libraryProvablyAtLeast('3.11.0', 'not-a-version')).toBe(false);
  });
});

describe('isResolvableRange — single-pin seed predicate', () => {
  it.each([
    // Clean single range leaves with a concrete minimum → seedable verbatim.
    '^1.0.1',
    '^1.0.4',
    '^1.2.0',
    '>=1.0.4',
    '~1.0.0',
    '1.0.0',
    '*',
    '1.x',
    '<2.0.0',
  ])('treats the single resolvable range %j as seedable', (spec) => {
    expect(isResolvableRange(spec)).toBe(true);
  });

  it.each([
    // `||` unions have no single installable pin — minVersion would collapse
    // them to the lowest branch, so they must NOT be copied verbatim.
    '^1.0.0 || ^2.0.0',
    '^1.0.0 || ^1.5.0 || ^2.0.0',
    // Non-version specs `new Range`/`minVersion` can't reduce → fall back.
    'workspace:*',
    'catalog:',
    'npm:@scope/pkg@1.0.0',
    'not-a-range',
  ])('rejects the non-seedable spec %j', (spec) => {
    expect(isResolvableRange(spec)).toBe(false);
  });
});

describe('icons compatibility range (^1.0.4 = >=1.0.4 <2.0.0)', () => {
  it('ICONS_RANGE is the ^1.0.4 caret range, derived from HELIX_ICONS_VERSION', () => {
    expect(ICONS_RANGE).toBe('^1.0.4');
    expect(ICONS_RANGE).toBe(HELIX_ICONS_VERSION);
  });

  describe('iconsVersionCompatible — resolved-version satisfies(^1.0.4)', () => {
    it.each(['1.0.4', '1.0.5', '1.2.3', '1.9.0', 'v1.0.4'])(
      'accepts a resolved version %j inside the range',
      (v) => {
        expect(iconsVersionCompatible(v)).toBe(true);
      },
    );

    it.each([
      // Below the patch floor.
      '1.0.0',
      '1.0.1',
      '1.0.3',
      '0.9.0',
      // INCOMPATIBLE MAJOR — a `>= 1.0.4` floor check wrongly accepts these.
      '2.0.0',
      '2.1.0',
      '3.0.0',
      // Unparseable → fail closed.
      'not-a-version',
    ])('rejects an out-of-range / unparseable version %j', (v) => {
      expect(iconsVersionCompatible(v)).toBe(false);
    });
  });

  describe('iconsRangeWithinCompat — declared-range subset of ^1.0.4', () => {
    it.each(['^1.0.4', '^1.2.0', '^1.5.0', '~1.0.4', '1.0.5'])(
      'preserves a range %j entirely within ^1.0.4',
      (r) => {
        expect(iconsRangeWithinCompat(r)).toBe(true);
      },
    );

    it.each([
      // Dips below the patch floor.
      '^1.0.1',
      // Admits a 2.x major — NOT a subset of ^1.0.4 (codex P1/P2).
      '^2.0.0',
      '>=2.0.0',
      '>=1.0.4',
      '*',
      '1.x',
      '<2.0.0',
      // Union / non-range specs → subset throws or is false → fall back.
      '^1.0.0 || ^2.0.0',
      'workspace:*',
      'catalog:',
    ])('rejects a range %j that escapes ^1.0.4', (r) => {
      expect(iconsRangeWithinCompat(r)).toBe(false);
    });
  });
});
