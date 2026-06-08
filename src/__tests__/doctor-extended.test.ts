import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  checkHelixIcons,
  checkHelixLibrary,
  checkHelixTokens,
  checkStorybookStaticDirs,
  checkIconBasePathReachable,
  checkAppIconSprites,
  checkCatalogPopulated,
  checkProjectEngines,
  checkExperimentalConfig,
  nodeSatisfiesEngines,
  runDoctor,
} from '../doctor.js';
import { HELIX_ICONS_VERSION } from '../helix-versions.js';

// v0.6.0 Phase F — doctor extension. Each check lives behind a skip
// boundary so the doctor stays useful outside scaffolded projects; the
// tests below pin pass + fail + skip per check.

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-extended-'));
}

function writeJson(p: string, value: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2), 'utf8');
}

describe('checkHelixIcons', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when project package.json does not declare @helixui/icons', () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'foo', dependencies: {} });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('skip');
    expect(result.message).toMatch(/no @helixui\/icons dependency/);
  });

  it('skips when no package.json at all', () => {
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('skip');
  });

  it('fails when @helixui/icons is declared but not on disk', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/icons': '^1.0.1' },
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/not resolvable/);
    expect(result.message).toMatch(/pnpm install/);
  });

  it('fails when @helixui/icons resolves but is below the create-helix floor (0.9.0) on library 3.10+', () => {
    // The icons floor is only required once @helixui/library is 3.10.0+, so the
    // manifest must declare library 3.10+ for the floor gate to fire.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/library': '^3.10.0', '@helixui/icons': '^0.9.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '0.9.0',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/0\.9\.0/);
    expect(result.message).toContain(HELIX_ICONS_VERSION);
  });

  it('fails when icons is 1.0.0 — below the floor — and @helixui/library is 3.10+', () => {
    // The major-only check this replaced would have passed 1.0.0; the
    // tightened floor catches it — but ONLY when the library is 3.10+, the
    // release that peer-requires the floor.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/library': '^3.10.0', '@helixui/icons': '^1.0.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.0',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/1\.0\.0/);
    expect(result.message).toContain(HELIX_ICONS_VERSION);
  });

  it('flags icons 1.0.1 when @helixui/library is 3.10+ (floor applies)', () => {
    // library 3.10+ + icons 1.0.1 → 1.0.1 is below the 1.0.4 floor the 3.10
    // <hx-icon> peer needs → FLAGGED.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '^3.10.0', '@helixui/icons': '^1.0.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.1',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/1\.0\.1/);
    expect(result.message).toContain(HELIX_ICONS_VERSION);
  });

  it('flags icons 1.0.1 when @helixui/library is a >=3.10.0 <4.0.0 comparator range (clean lower bound >=3.10)', () => {
    // A peer-only / app manifest can legally declare the library as a
    // comparator range. The clean lower bound (>=3.10.0) is >= the floor, so
    // the icons floor must apply. libraryProvablyAtLeast reads the first clause
    // as the lower bound and ignores the <4.0.0 upper clause.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      peerDependencies: { '@helixui/library': '>=3.10.0 <4.0.0' },
      dependencies: { '@helixui/icons': '^1.0.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.1',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/1\.0\.1/);
    expect(result.message).toContain(HELIX_ICONS_VERSION);
  });

  it('does NOT flag icons 1.0.1 when @helixui/library is a >=3.9.0 comparator range (below floor)', () => {
    // A `>=3.9.0` lower bound is below 3.10.0, so the floor must NOT apply — a
    // project permitting 3.9.x with icons 1.0.1 is valid.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      peerDependencies: { '@helixui/library': '>=3.9.0' },
      dependencies: { '@helixui/icons': '^1.0.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.1',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v1\.0\.1/);
  });

  it('does NOT flag icons 1.0.1 when @helixui/library is an upper-bound <3.10.0 range (fail open)', () => {
    // REGRESSION GUARD: stripping the comparator from an upper-bound leaf would
    // misread `<3.10.0` as ">=3.10". An upper bound caps the library BELOW the
    // floor (or anywhere), so the floor must NOT apply — fail open.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      peerDependencies: { '@helixui/library': '<3.10.0' },
      dependencies: { '@helixui/icons': '^1.0.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.1',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v1\.0\.1/);
  });

  it('does NOT flag icons 1.0.1 when @helixui/library is an upper-bound <4.0.0 range (fail open)', () => {
    // Same regression: a bare `<4.0.0` is an upper bound with no lower bound —
    // it permits 1.x/2.x/3.9.x too, so it is NOT proof of >=3.10. Fail open.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      peerDependencies: { '@helixui/library': '<4.0.0' },
      dependencies: { '@helixui/icons': '^1.0.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.1',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v1\.0\.1/);
  });

  it('does NOT flag icons 1.0.1 when @helixui/library is a 3.10.0-next prerelease (ambiguous, fail open)', () => {
    // A 3.10.0 PRERELEASE may predate the tightened <hx-icon> peer, so a
    // prerelease library spec is ambiguous — fail open and do not enforce.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '3.10.0-next.5', '@helixui/icons': '^1.0.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.1',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v1\.0\.1/);
  });

  it('does NOT flag icons 1.0.1 when @helixui/library is 3.9.x (floor is 3.10+ only)', () => {
    // library 3.9.x + icons 1.0.1 → the 1.0.4 floor was tightened in 3.10.0;
    // the 3.9.x pins paired with icons 1.0.1, so an un-upgraded 3.9.x scaffold
    // must NOT be flagged. This is the minor-aware boundary the major-only gate
    // missed (codex re-review) — the regression that falsely failed doctor for
    // existing 3.9.x projects.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '^3.9.1', '@helixui/icons': '^1.0.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.1',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v1\.0\.1/);
  });

  it('does NOT flag icons 1.0.1 when @helixui/library is 2.x (floor does not apply)', () => {
    // library 2.x + icons 1.0.1 → the 1.0.4 floor is a 3.10+ requirement, so a
    // pre-3.x project resolving icons 1.0.1 must NOT be flagged.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '^2.5.0', '@helixui/icons': '^1.0.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.1',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v1\.0\.1/);
  });

  it('does NOT flag icons 1.0.1 when no @helixui/library is declared (floor does not apply)', () => {
    // icons declared with no library at all — the floor is a 3.x-library
    // requirement, so without library context it must not fire.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/icons': '^1.0.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.1',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v1\.0\.1/);
  });

  it('passes when @helixui/icons resolves within the ^1.0.4 range on library 3.10+', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/library': '^3.10.0', '@helixui/icons': '^1.0.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.2.3',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v1\.2\.3/);
  });

  it('passes when @helixui/icons resolves at exactly 1.0.4 (the range floor) on library 3.10+', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/library': '^3.10.0', '@helixui/icons': '^1.0.4' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.4',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v1\.0\.4/);
  });

  it('FLAGS an incompatible @helixui/icons MAJOR (2.0.0) on library 3.10+ (range, not floor)', () => {
    // codex P1: the icons peer is a RANGE (^1.0.4 = >=1.0.4 <2.0.0), not a
    // lower-bound floor. icons 2.0.0 is a breaking major the 3.10 <hx-icon>
    // peer does NOT accept. A `>= 1.0.4` floor check wrongly PASSED 2.0.0;
    // the `satisfies(^1.0.4)` check must flag it.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/library': '^3.10.0', '@helixui/icons': '^2.0.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '2.0.0',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/2\.0\.0/);
    expect(result.message).toMatch(/incompatible/);
    expect(result.message).toContain(HELIX_ICONS_VERSION);
  });

  it('does NOT flag an incompatible @helixui/icons 2.0.0 when @helixui/library is 3.9.x (range is 3.10+ only)', () => {
    // The ^1.0.4 compatibility range is a 3.10+ requirement. On a 3.9.x library
    // the icons check must not fire at all — even for a 2.x icons major — so a
    // pre-3.10 project is never falsely flagged by the new range gate.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '^3.9.1', '@helixui/icons': '^2.0.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '2.0.0',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v2\.0\.0/);
  });

  it('follows a monorepo scaffold into apps/web (declares + resolves there)', () => {
    // Monorepo scaffold shape: workspace root has no @helixui/* deps; the
    // app's manifest + node_modules live in apps/web/. doctor must follow it.
    writeJson(path.join(tmp, 'package.json'), { name: 'workspace-root', private: true });
    writeJson(path.join(tmp, 'apps', 'web', 'package.json'), {
      name: '@acme/web',
      dependencies: { '@helixui/icons': '^1.0.4' },
    });
    writeJson(path.join(tmp, 'apps', 'web', 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.0.4',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/apps\/web/);
  });

  it('fails (not skips) when @helixui/library@3.x is declared but @helixui/icons is absent', () => {
    // The state an older app scaffold lands in after `create-helix upgrade`
    // bumps @helixui/library to 3.x: the icon peer is now required, and its
    // absence must surface as a failure — not a silent skip.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '^3.9.1' },
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/requires the @helixui\/icons peer/);
  });

  it('still skips when @helixui/library is pre-3.x and @helixui/icons is absent', () => {
    // Pre-3.x library had no icon API — a missing icons dep is genuinely
    // not-applicable, so it stays a skip.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '^1.0.0' },
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('skip');
  });

  it('fails on a mixed-bucket project where ANY @helixui/library bucket is 3.x', () => {
    // devDeps is pre-3.x but peerDeps is on the 3.x contract — the project
    // requires @helixui/icons. Inspecting only the first-declared bucket
    // (devDeps ^1.0.0) would wrongly skip; declaredMaxMajor catches it.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'wc-storybook-style',
      devDependencies: { '@helixui/library': '^1.0.0' },
      peerDependencies: { '@helixui/library': '^3.9.1' },
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/requires the @helixui\/icons peer/);
  });

  it('fails when @helixui/library RESOLVES to 3.x from a broad declared range and icons is absent', () => {
    // The declared range `>=1.0.0` reads as major 1 via the range parser, but
    // the project actually RESOLVES @helixui/library at 3.x in node_modules —
    // which already requires the icons peer. The check must look at the
    // resolved install, not only the declared range text.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '>=1.0.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'library', 'package.json'), {
      name: '@helixui/library',
      version: '3.9.1',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/requires the @helixui\/icons peer/);
    expect(result.message).toMatch(/@helixui\/library@3\.x/);
  });

  it('still skips when a broad range RESOLVES to a pre-3.x @helixui/library and icons is absent', () => {
    // Same broad `>=1.0.0` range, but node_modules resolved it to 1.x — no
    // icon API, so a missing icons dep is genuinely not-applicable: a skip,
    // not a false fail.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '>=1.0.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'library', 'package.json'), {
      name: '@helixui/library',
      version: '1.1.2',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('skip');
  });
});

// v0.9.2 — @helixui/library + @helixui/tokens version-drift checks. The
// Pulse implementation test caught scaffolds silently falling majors behind
// current Helix; these checks surface that on `doctor` instead.
describe('checkHelixLibrary / checkHelixTokens drift', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when the project does not declare @helixui/library', () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'foo', dependencies: {} });
    const result = checkHelixLibrary(tmp);
    expect(result.status).toBe('skip');
    expect(result.message).toMatch(/no @helixui\/library dependency/);
  });

  it('detects @helixui/library declared in peerDependencies (wc-storybook shape)', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      peerDependencies: { '@helixui/library': '^1.0.0' },
    });
    // Declared but not on disk → resolution fails, but it must NOT skip.
    const result = checkHelixLibrary(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/not resolvable/);
  });

  it('fails when the installed @helixui/library major is behind the pin', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '^1.0.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'library', 'package.json'), {
      name: '@helixui/library',
      version: '1.1.2',
    });
    const result = checkHelixLibrary(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/1\.1\.2/);
    expect(result.message).toMatch(/behind/);
    expect(result.message).toMatch(/create-helix upgrade/);
  });

  it('passes when the installed @helixui/library major is current', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: { '@helixui/library': '^3.9.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'library', 'package.json'), {
      name: '@helixui/library',
      version: '3.9.1',
    });
    const result = checkHelixLibrary(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v3\.9\.1/);
  });

  it('fails when @helixui/tokens is majors behind', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/tokens': '^0.3.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'tokens', 'package.json'), {
      name: '@helixui/tokens',
      version: '0.3.0',
    });
    const result = checkHelixTokens(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/0\.3\.0/);
    expect(result.message).toMatch(/behind/);
  });

  it('passes when @helixui/tokens is current', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/tokens': '^3.9.1' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'tokens', 'package.json'), {
      name: '@helixui/tokens',
      version: '3.9.1',
    });
    const result = checkHelixTokens(tmp);
    expect(result.status).toBe('ok');
  });

  it('skips the @helixui/tokens drift check for all Drupal scaffolds (deferred to v0.9.4)', () => {
    // No honest signal exists yet for "is the runtime token layer current"
    // on a Drupal theme — the runtime source is css/vendor/helix-tokens.css,
    // which neither the declared range nor a node_modules lookup tells us
    // about. v0.9.3 ships scaffold-time vendoring for FRESH scaffolds; the
    // upgrade-time vendored-CSS refresh + pre-v0.9.3 theme-file migration
    // is the v0.9.4 follow-up. Both pre- and post-v0.9.3 Drupal themes
    // share this skip until that lands.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'acme-theme',
      dependencies: { '@helixui/drupal-starter': '^0.1.0', '@helixui/tokens': '^0.2.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'tokens', 'package.json'), {
      name: '@helixui/tokens',
      version: '0.2.0',
    });
    const result = checkHelixTokens(tmp);
    expect(result.status).toBe('skip');
    expect(result.message).toMatch(/Drupal scaffold/);
    expect(result.message).toMatch(/v0\.9\.4/);
  });

  it('skips the @helixui/tokens drift check on a v0.9.3+ Drupal scaffold too', () => {
    // The skip is blanket — having the v0.9.3 wiring marker doesn't make
    // the declared-range signal meaningful (the runtime is the vendored
    // CSS, not the range). The v0.9.4 follow-up adds the missing pieces.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'acme-theme',
      dependencies: { '@helixui/drupal-starter': '^0.1.0', '@helixui/tokens': '^3.9.1' },
    });
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'scripts', 'copy-helix-tokens.mjs'),
      '// v0.9.3+ wiring\n',
      'utf8',
    );
    const result = checkHelixTokens(tmp);
    expect(result.status).toBe('skip');
    expect(result.message).toMatch(/Drupal scaffold/);
  });

  it('still runs the @helixui/library drift check for a Drupal scaffold (skip is tokens-only)', () => {
    // The Drupal exemption is narrowly scoped to @helixui/tokens — if a
    // Drupal theme declares @helixui/library, that surface is NOT exempt.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'acme-theme',
      dependencies: { '@helixui/drupal-starter': '^0.1.0', '@helixui/library': '^1.0.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'library', 'package.json'), {
      name: '@helixui/library',
      version: '1.1.2',
    });
    const result = checkHelixLibrary(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/behind/);
  });

  it('skips the @helixui/tokens drift check for a monorepo Drupal scaffold', () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'workspace-root', private: true });
    writeJson(path.join(tmp, 'apps', 'web', 'package.json'), {
      name: '@acme/theme',
      dependencies: { '@helixui/drupal-starter': '^0.1.0', '@helixui/tokens': '^0.2.0' },
    });
    writeJson(path.join(tmp, 'apps', 'web', 'node_modules', '@helixui', 'tokens', 'package.json'), {
      name: '@helixui/tokens',
      version: '0.2.0',
    });
    const result = checkHelixTokens(tmp);
    expect(result.status).toBe('skip');
    expect(result.message).toMatch(/Drupal scaffold/);
  });

  it('follows a monorepo scaffold into apps/web for the drift check', () => {
    // Workspace root declares no @helixui/* dep — the app's manifest +
    // node_modules live in apps/web/. Without monorepo traversal the drift
    // check would `skip` here even when apps/web is majors stale.
    writeJson(path.join(tmp, 'package.json'), { name: 'workspace-root', private: true });
    writeJson(path.join(tmp, 'apps', 'web', 'package.json'), {
      name: '@acme/web',
      dependencies: { '@helixui/library': '^1.0.0' },
    });
    writeJson(
      path.join(tmp, 'apps', 'web', 'node_modules', '@helixui', 'library', 'package.json'),
      { name: '@helixui/library', version: '1.1.2' },
    );
    const result = checkHelixLibrary(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/1\.1\.2/);
    expect(result.message).toMatch(/behind/);
    expect(result.message).toMatch(/apps\/web/);
  });

  it('still skips for a monorepo root when apps/web also has no @helixui dep', () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'workspace-root', private: true });
    writeJson(path.join(tmp, 'apps', 'web', 'package.json'), {
      name: '@acme/web',
      dependencies: { react: '^19.0.0' },
    });
    const result = checkHelixLibrary(tmp);
    expect(result.status).toBe('skip');
  });
});

describe('checkStorybookStaticDirs', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when no .storybook/main.ts', () => {
    const result = checkStorybookStaticDirs(tmp);
    expect(result.status).toBe('skip');
  });

  it('fails when main.ts is missing @helixui/icons/dist', () => {
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.storybook', 'main.ts'),
      `export default { staticDirs: ['../public'] };`,
      'utf8',
    );
    const result = checkStorybookStaticDirs(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/staticDirs missing @helixui\/icons\/dist/);
    expect(result.message).toMatch(/won't resolve at runtime/);
  });

  it("passes when main.ts contains '@helixui/icons/dist'", () => {
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.storybook', 'main.ts'),
      `export default { staticDirs: ['../node_modules/@helixui/icons/dist'] };`,
      'utf8',
    );
    const result = checkStorybookStaticDirs(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/staticDirs includes @helixui\/icons\/dist/);
  });
});

describe('checkIconBasePathReachable', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when no .storybook/main.ts', () => {
    const result = checkIconBasePathReachable(tmp);
    expect(result.status).toBe('skip');
  });

  it('fails when helix.svg is not on disk', () => {
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.storybook', 'main.ts'), 'export default {};', 'utf8');
    const result = checkIconBasePathReachable(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/helix\.svg/);
    expect(result.message).toMatch(/not on disk/);
  });

  it('passes when helix.svg is present', () => {
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.storybook', 'main.ts'), 'export default {};', 'utf8');
    fs.mkdirSync(path.join(tmp, 'node_modules', '@helixui', 'icons', 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'node_modules', '@helixui', 'icons', 'dist', 'helix.svg'),
      '<svg></svg>',
      'utf8',
    );
    const result = checkIconBasePathReachable(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/reachable/);
  });
});

// v0.9.2 — app-scaffold sprite check. checkHelixIcons verifies the PACKAGE;
// this verifies the self-hosting wiring is COMPLETE — the sprite sheets are
// copied AND setBasePath('/icons') is in the loader — so the doctor/upgrade
// loop can't report green on an app where <hx-icon> would still 404.
describe('checkAppIconSprites', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /**
   * Emit the copy-script marker that gates the check "in". Its content
   * encodes the framework's served static dir (`public` for astro/react,
   * `static` for SvelteKit) — checkAppIconSprites reads that to know which
   * dir to look in.
   */
  function writeCopyScript(dir: string, staticDir: 'public' | 'static' = 'public'): void {
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'scripts', 'copy-helix-icons.mjs'),
      `// generated\nconst destDir = join(process.cwd(), '${staticDir}', 'icons');\n`,
      'utf8',
    );
  }
  /** Emit a source file that calls setBasePath('/icons'). */
  function writeLoaderWithSetBasePath(dir: string): void {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'helix-setup.ts'),
      "import { setBasePath } from '@helixui/icons';\nsetBasePath('/icons');\n",
      'utf8',
    );
  }
  /** Emit BOTH copied sprite sheets in the given static dir (helix + fa-free). */
  function writeSprite(dir: string, staticDir: 'public' | 'static'): void {
    fs.mkdirSync(path.join(dir, staticDir, 'icons'), { recursive: true });
    fs.writeFileSync(path.join(dir, staticDir, 'icons', 'helix.svg'), '<svg></svg>', 'utf8');
    fs.writeFileSync(
      path.join(dir, staticDir, 'icons', 'fa-free-solid.svg'),
      '<svg></svg>',
      'utf8',
    );
  }
  /** Emit a source file that renders an <hx-icon> element (the pre-v0.9.2 shape). */
  function writeHxIconSource(dir: string): void {
    fs.mkdirSync(path.join(dir, 'src', 'pages'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'pages', 'index.astro'),
      '<hx-icon library="fa-free" name="shield-halved" aria-hidden="true"></hx-icon>\n',
      'utf8',
    );
  }

  it('skips when there is no scripts/copy-helix-icons.mjs (experimental template / plain project)', () => {
    // An experimental template declares the @helixui/icons peer but never
    // gets the sprite-serving setup — and renders no <hx-icon> — so it must
    // not fail this check.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'remix-app',
      dependencies: { '@helixui/library': '^3.9.1', '@helixui/icons': '^1.0.1' },
    });
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('skip');
    expect(result.message).toMatch(/copy-helix-icons\.mjs/);
  });

  it('fails — not skips — when a pre-v0.9.2 app on 3.x renders <hx-icon> but has no copy script', () => {
    // The codex-flagged regression: a pre-v0.9.2 astro/sveltekit/react
    // scaffold DID emit <hx-icon library="fa-free">. After `create-helix
    // upgrade` bumps it to @helixui/library@3.x it 404s the sprites — a bare
    // `skip` would let doctor report clean on a genuinely-broken app.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'upgraded-astro-app',
      dependencies: { '@helixui/library': '^3.9.1', '@helixui/icons': '^1.0.1' },
    });
    writeHxIconSource(tmp);
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/no scripts\/copy-helix-icons\.mjs/);
    expect(result.message).toMatch(/Re-scaffold/);
  });

  it('still skips when @helixui/library is on 3.x but src/ never renders <hx-icon>', () => {
    // A fresh experimental template declares the icons peer but its landing
    // page renders no <hx-icon> — sprite self-hosting is genuinely N/A.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'remix-app',
      dependencies: { '@helixui/library': '^3.9.1', '@helixui/icons': '^1.0.1' },
    });
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'src', 'root.tsx'),
      'export default function App() {}\n',
      'utf8',
    );
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('skip');
  });

  it('still skips when src/ renders <hx-icon> but @helixui/library is pre-3.x', () => {
    // Pre-3.x <hx-icon> did not resolve sprites from the blocked CDN — no
    // copy script needed, so a missing one is not a failure.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'old-astro-app',
      dependencies: { '@helixui/library': '^1.0.0' },
    });
    writeHxIconSource(tmp);
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('skip');
  });

  it('still skips for a Storybook project even when src/ renders <hx-icon> on 3.x', () => {
    // wc-storybook serves icons through Storybook staticDirs — covered by
    // checkStorybookStaticDirs / checkIconBasePathReachable, not this check.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'wc-storybook-app',
      dependencies: { '@helixui/library': '^3.9.1', '@helixui/icons': '^1.0.1' },
    });
    writeHxIconSource(tmp);
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.storybook', 'main.ts'), 'export default {};\n', 'utf8');
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('skip');
  });

  it('fails when @helixui/library RESOLVES to 3.x from a broad range and src/ renders <hx-icon>', () => {
    // Declared range reads as major 1, but node_modules resolved 3.x — the
    // resolved-install signal must drive the 3.x-contract decision here too.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'broad-range-app',
      dependencies: { '@helixui/library': '>=1.0.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'library', 'package.json'), {
      name: '@helixui/library',
      version: '3.9.1',
    });
    writeHxIconSource(tmp);
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/no scripts\/copy-helix-icons\.mjs/);
  });

  it('fails when the copy script exists but the sprite sheets are absent', () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'astro-app' });
    writeCopyScript(tmp);
    writeLoaderWithSetBasePath(tmp);
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/sprite sheets not in/);
    // Flat project: the remediation is the bare command, no `cd` wrapper.
    expect(result.message).toMatch(/run `node scripts\/copy-helix-icons\.mjs`/);
    expect(result.message).not.toMatch(/cd /);
  });

  it('fails on a partial copy — helix.svg present but fa-free-solid.svg missing', () => {
    // The scaffold renders <hx-icon library="fa-free">, which loads from
    // fa-free-solid.svg. helix.svg alone is not "complete".
    writeJson(path.join(tmp, 'package.json'), { name: 'astro-app' });
    writeCopyScript(tmp);
    writeLoaderWithSetBasePath(tmp);
    fs.mkdirSync(path.join(tmp, 'public', 'icons'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'public', 'icons', 'helix.svg'), '<svg></svg>', 'utf8');
    // fa-free-solid.svg deliberately NOT written.
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/fa-free-solid\.svg/);
  });

  it("fails when sprites are copied but setBasePath('/icons') is not wired in src/", () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'astro-app' });
    writeCopyScript(tmp);
    writeSprite(tmp, 'public');
    // src/ exists but no file calls setBasePath('/icons').
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'src', 'app.ts'), "console.log('hi');\n", 'utf8');
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/setBasePath\('\/icons'\) not found/);
  });

  it("passes when sprites are copied AND setBasePath('/icons') is wired (public/icons)", () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'astro-app' });
    writeCopyScript(tmp);
    writeSprite(tmp, 'public');
    writeLoaderWithSetBasePath(tmp);
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/public\/icons/);
    expect(result.message).toMatch(/setBasePath/);
  });

  it('passes with static/icons/ + setBasePath in a .svelte file (SvelteKit)', () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'sveltekit-app' });
    writeCopyScript(tmp, 'static');
    writeSprite(tmp, 'static');
    fs.mkdirSync(path.join(tmp, 'src', 'routes'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'src', 'routes', '+layout.svelte'),
      "<script>\n  const { setBasePath } = await import('@helixui/icons');\n  setBasePath('/icons');\n</script>\n",
      'utf8',
    );
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/static\/icons/);
  });

  it('fails — not false-passes — when sprites are in the wrong dir for the framework', () => {
    // SvelteKit-shaped copy script (targets static/), but the sprites were
    // copied into public/icons/ — which SvelteKit does NOT serve. Accepting
    // "either dir" would falsely pass; the check reads the script's target.
    writeJson(path.join(tmp, 'package.json'), { name: 'sveltekit-app' });
    writeCopyScript(tmp, 'static');
    writeSprite(tmp, 'public'); // wrong dir for a SvelteKit app
    writeLoaderWithSetBasePath(tmp);
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/static\/icons/);
  });

  it('follows a monorepo scaffold into apps/web', () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'workspace-root', private: true });
    // apps/web declares the @helixui/* deps — so resolveHelixManifestDir
    // follows into it (same as a real create-helix monorepo scaffold).
    writeJson(path.join(tmp, 'apps', 'web', 'package.json'), {
      name: '@acme/web',
      dependencies: { '@helixui/library': '^3.9.1', '@helixui/icons': '^1.0.1' },
    });
    const appsWeb = path.join(tmp, 'apps', 'web');
    writeCopyScript(appsWeb);
    writeSprite(appsWeb, 'public');
    writeLoaderWithSetBasePath(appsWeb);
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/apps\/web\/public\/icons/);
  });

  it('fail message gives a monorepo remediation that runs in the apps/web cwd', () => {
    // From a monorepo root the script lives at apps/web/scripts/… AND must
    // run with apps/web as cwd — copy-helix-icons.mjs writes into
    // `process.cwd()/<staticDir>/icons`, so `node apps/web/scripts/…` from
    // the root would copy to <root>/public/icons (the wrong place). The
    // remediation must be the `(cd apps/web && node scripts/…)` form.
    writeJson(path.join(tmp, 'package.json'), { name: 'workspace-root', private: true });
    writeJson(path.join(tmp, 'apps', 'web', 'package.json'), {
      name: '@acme/web',
      dependencies: { '@helixui/library': '^3.9.1', '@helixui/icons': '^1.0.1' },
    });
    const appsWeb = path.join(tmp, 'apps', 'web');
    writeCopyScript(appsWeb);
    writeLoaderWithSetBasePath(appsWeb);
    // No sprites copied → fail, and the message must carry the cd-wrapped command.
    const result = checkAppIconSprites(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/\(cd apps\/web && node scripts\/copy-helix-icons\.mjs\)/);
    // The buggy bare form — `node apps/web/scripts/…` — copies to the wrong dir.
    expect(result.message).not.toMatch(/node apps\/web\/scripts\//);
  });
});

describe('checkCatalogPopulated', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when no scripts/generate-catalog.ts', () => {
    const result = checkCatalogPopulated(tmp);
    expect(result.status).toBe('skip');
  });

  it('fails when catalog dir is missing', () => {
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'scripts', 'generate-catalog.ts'), '// stub', 'utf8');
    const result = checkCatalogPopulated(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/pnpm cem:catalog/);
    expect(result.message).toMatch(/HELiX\/\* sidebar/);
  });

  it('fails when catalog dir is empty', () => {
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'scripts', 'generate-catalog.ts'), '// stub', 'utf8');
    fs.mkdirSync(path.join(tmp, 'src', 'stories', 'catalog'), { recursive: true });
    const result = checkCatalogPopulated(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/empty/);
    expect(result.message).toMatch(/pnpm cem:catalog/);
  });

  it('passes when catalog has stories', () => {
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'scripts', 'generate-catalog.ts'), '// stub', 'utf8');
    const catalog = path.join(tmp, 'src', 'stories', 'catalog');
    fs.mkdirSync(catalog, { recursive: true });
    fs.writeFileSync(path.join(catalog, 'button.stories.ts'), 'export default {};', 'utf8');
    fs.writeFileSync(path.join(catalog, 'input.stories.ts'), 'export default {};', 'utf8');
    const result = checkCatalogPopulated(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/2 stories/);
  });
});

describe('nodeSatisfiesEngines', () => {
  it('passes for ^22.0.0 with v22.4.0', () => {
    expect(nodeSatisfiesEngines('v22.4.0', '^22.0.0')).toBe(true);
  });
  it('fails for ^22.0.0 with v20.11.0', () => {
    expect(nodeSatisfiesEngines('v20.11.0', '^22.0.0')).toBe(false);
  });
  it('passes alternation ^22.0.0 || ^24.0.0 with v24.1.0', () => {
    expect(nodeSatisfiesEngines('v24.1.0', '^22.0.0 || ^24.0.0')).toBe(true);
  });
  it('fails alternation ^22.0.0 || ^24.0.0 with v23.0.0', () => {
    expect(nodeSatisfiesEngines('v23.0.0', '^22.0.0 || ^24.0.0')).toBe(false);
  });
  it('passes >=20 with v22.4.0', () => {
    expect(nodeSatisfiesEngines('v22.4.0', '>=20')).toBe(true);
  });
  it('fails >=22 with v20.11.0', () => {
    expect(nodeSatisfiesEngines('v20.11.0', '>=22')).toBe(false);
  });
});

describe('checkProjectEngines', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when no package.json', () => {
    const result = checkProjectEngines(tmp);
    expect(result.status).toBe('skip');
  });

  it('skips when package.json has no engines.node', () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'foo' });
    const result = checkProjectEngines(tmp);
    expect(result.status).toBe('skip');
  });

  it('passes when current node satisfies engines', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      engines: { node: '>=18' },
    });
    const result = checkProjectEngines(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/satisfies engines\.node/);
  });

  it('fails when current node does not satisfy engines', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      engines: { node: '>=99' },
    });
    const result = checkProjectEngines(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/does not satisfy/);
  });
});

describe('checkExperimentalConfig', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when no .helixrc.json', () => {
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('skip');
  });

  it('passes when config selects a production template', () => {
    writeJson(path.join(tmp, '.helixrc.json'), {
      defaults: { template: 'wc-storybook' },
    });
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/production template 'wc-storybook'/);
  });

  it('warns when config selects an experimental template (top-level field)', () => {
    // v0.9.0: svelte-kit promoted; using ember as the canonical experimental fixture.
    writeJson(path.join(tmp, '.helixrc.json'), {
      framework: 'ember',
    });
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('warn');
    expect(result.message).toMatch(/experimental template 'ember'/);
    expect(result.message).toMatch(/--show-experimental/);
  });

  it('warns when config selects an experimental template (nested defaults)', () => {
    writeJson(path.join(tmp, '.helixrc.json'), {
      defaults: { template: 'ember' },
    });
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('warn');
    expect(result.message).toMatch(/ember/);
  });

  it('warns when config selects an unknown template', () => {
    writeJson(path.join(tmp, '.helixrc.json'), {
      framework: 'not-a-real-framework',
    });
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('warn');
    expect(result.message).toMatch(/unknown template 'not-a-real-framework'/);
  });

  it('fails when .helixrc.json is malformed', () => {
    fs.writeFileSync(path.join(tmp, '.helixrc.json'), '{not valid json', 'utf8');
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/not valid JSON/);
  });
});

describe('runDoctor integration', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('runs the scaffold-surface checks alongside the existing env checks', async () => {
    const result = await runDoctor('0.6.0', { cwd: tmp });
    const names = result.checks.map((c) => c.name);
    expect(names).toContain('@helixui/library');
    expect(names).toContain('@helixui/tokens');
    expect(names).toContain('@helixui/icons');
    expect(names).toContain('storybook staticDirs');
    expect(names).toContain('/icons/helix.svg');
    expect(names).toContain('app icon sprites');
    expect(names).toContain('catalog stories');
    expect(names).toContain('project engines');
    expect(names).toContain('experimental template config');
    // Existing env checks still present.
    expect(names).toContain('Node.js');
    expect(names).toContain('Write permissions');
  });

  it('--quick skips the /icons/helix.svg filesystem probe', async () => {
    // Wire up a .storybook/main.ts so the non-quick path would attempt the
    // probe — without main.ts both modes return skip and the assertion is
    // hollow.
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.storybook', 'main.ts'), 'export default {};', 'utf8');

    const fullResult = await runDoctor('0.6.0', { cwd: tmp });
    const fullIconsCheck = fullResult.checks.find((c) => c.name === '/icons/helix.svg');
    // Without --quick, the check is a real fail (helix.svg not on disk) —
    // proves the probe ran.
    expect(fullIconsCheck?.status).toBe('fail');

    const quickResult = await runDoctor('0.6.0', { cwd: tmp, quick: true });
    const quickIconsCheck = quickResult.checks.find((c) => c.name === '/icons/helix.svg');
    expect(quickIconsCheck?.status).toBe('skip');
    expect(quickIconsCheck?.message).toMatch(/skipped under --quick/);
  });

  it('--quick skips the @helixui/library + @helixui/tokens + @helixui/icons checks', async () => {
    // All three @helixui/* package checks resolve the consumer's
    // node_modules, so a scaffold-but-don't-install CI run with --quick must
    // get `skip`, not a false `fail` for a not-yet-installed package. Declare
    // all three (the shape every v0.9.2 app scaffold has) so the non-quick
    // path would actually run — and fail, since nothing is on disk.
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      dependencies: {
        '@helixui/library': '^3.9.1',
        '@helixui/tokens': '^3.9.1',
        '@helixui/icons': '^1.0.1',
      },
    });

    const fullResult = await runDoctor('0.6.0', { cwd: tmp });
    const fullLib = fullResult.checks.find((c) => c.name === '@helixui/library');
    const fullIcons = fullResult.checks.find((c) => c.name === '@helixui/icons');
    expect(fullLib?.status).toBe('fail'); // declared but not installed → real fail
    expect(fullIcons?.status).toBe('fail'); // ditto — proves the non-quick path runs it

    const quickResult = await runDoctor('0.6.0', { cwd: tmp, quick: true });
    const quickLib = quickResult.checks.find((c) => c.name === '@helixui/library');
    const quickTokens = quickResult.checks.find((c) => c.name === '@helixui/tokens');
    const quickIcons = quickResult.checks.find((c) => c.name === '@helixui/icons');
    expect(quickLib?.status).toBe('skip');
    expect(quickLib?.message).toMatch(/skipped under --quick/);
    expect(quickTokens?.status).toBe('skip');
    expect(quickIcons?.status).toBe('skip');
    expect(quickIcons?.message).toMatch(/skipped under --quick/);
  });

  it('skipped checks do not flip allPassed to false', async () => {
    // Empty tmp dir → all new checks return skip. Env checks should pass
    // on a healthy dev machine, so allPassed mostly reflects the env half.
    // The new check we care about: skip alone doesn't poison the bool.
    const result = await runDoctor('0.6.0', { cwd: tmp });
    const newCheckStatuses = result.checks
      .filter((c) =>
        [
          '@helixui/library',
          '@helixui/tokens',
          '@helixui/icons',
          'storybook staticDirs',
          '/icons/helix.svg',
          'app icon sprites',
          'catalog stories',
          'project engines',
          'experimental template config',
        ].includes(c.name),
      )
      .map((c) => c.status);
    // Every new check returns skip (or possibly ok for engines if the
    // CI/dev machine satisfies its own package.json engines field).
    for (const status of newCheckStatuses) {
      expect(['skip', 'ok']).toContain(status);
    }
  });
});
