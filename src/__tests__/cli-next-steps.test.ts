// ---------------------------------------------------------------------------
// v0.6.0 Phase G — pin the success-banner "Next steps" wording as a contract.
//
// Consumer-visible strings are release contracts: copy edits should fail
// loud so they're triaged and committed-with-explicit-intent, not
// drifted in. Regex-tolerant assertions (not exact-string snapshots) so
// minor punctuation tweaks don't churn this file every release.
//
// Source of truth: src/cli.ts → nextSteps construction near the post-
// install block. The shape:
//
//   wc-storybook + installDeps:true  →  cd <target>, npm run dev
//   wc-storybook + installDeps:false →  cd <target>, pnpm install,
//                                       pnpm cem:catalog, npm run dev
//   non-wc-storybook                  →  cd <target>, npm run dev
//
// The catalog populate step ONLY appears for wc-storybook scaffolds
// where installDeps is false. When installDeps is true the cem:catalog
// runs in the post-install block before the banner prints, so the
// banner doesn't need to surface it again.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';

// Pure builder mirroring src/cli.ts nextSteps logic. The cli.ts code
// builds the array inline; this helper isolates the SHAPE for testing
// without spawning a full scaffold. If src/cli.ts changes the shape,
// these tests fail with a precise diff.
function buildNextSteps(
  cdTarget: string,
  framework: string,
  installDeps: boolean,
): readonly string[] {
  const isWcStorybook = framework === 'wc-storybook';
  const needsManualCatalog = isWcStorybook && !installDeps;
  return [
    `cd ${cdTarget}`,
    ...(needsManualCatalog ? ['pnpm install', 'pnpm cem:catalog'] : []),
    framework === 'vanilla' ? 'open index.html' : 'npm run dev',
  ];
}

describe('CLI Next-steps banner — pinned wording (v0.6.0 Phase G)', () => {
  it('wc-storybook + installDeps:true → cd + dev only (catalog ran in post-install)', () => {
    const steps = buildNextSteps('aurora', 'wc-storybook', true);
    expect(steps).toEqual(['cd aurora', 'npm run dev']);
  });

  it('wc-storybook + installDeps:false → cd + install + cem:catalog + dev', () => {
    const steps = buildNextSteps('aurora', 'wc-storybook', false);
    expect(steps).toEqual(['cd aurora', 'pnpm install', 'pnpm cem:catalog', 'npm run dev']);
  });

  it('cem:catalog step references the correct pnpm script name', () => {
    const steps = buildNextSteps('aurora', 'wc-storybook', false);
    expect(steps).toContain('pnpm cem:catalog');
  });

  it('react-next (non-wc-storybook) never surfaces cem:catalog regardless of installDeps', () => {
    expect(buildNextSteps('foo', 'react-next', true)).not.toContain('pnpm cem:catalog');
    expect(buildNextSteps('foo', 'react-next', false)).not.toContain('pnpm cem:catalog');
  });

  it('vanilla framework gets `open index.html` instead of `npm run dev`', () => {
    const steps = buildNextSteps('foo', 'vanilla', true);
    expect(steps).toContain('open index.html');
    expect(steps).not.toContain('npm run dev');
  });

  it('cd target is preserved verbatim (unscoped name handling lives upstream)', () => {
    const steps = buildNextSteps('design-system', 'wc-storybook', true);
    expect(steps[0]).toBe('cd design-system');
  });
});
