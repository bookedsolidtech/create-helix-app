import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../../src/templates.js';
import { PRESETS } from '../../src/presets/loader.js';

// ---------------------------------------------------------------------------
// Lightweight caret-range satisfier (all ranges in templates/presets use ^)
// ---------------------------------------------------------------------------
function parseVersion(v: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function satisfiesCaret(version: string, range: string): boolean {
  const cleanRange = range.replace(/^[\^~>=<\s]+/, '');
  const parsed = parseVersion(version);
  const target = parseVersion(cleanRange);
  if (!parsed || !target) return false;

  const [major, minor, patch] = parsed;
  const [tMajor, tMinor, tPatch] = target;

  if (range.startsWith('^')) {
    // ^x.y.z: >=x.y.z <(x+1).0.0 when x>0, >=0.y.z <0.(y+1).0 when x=0,y>0
    if (tMajor > 0) {
      return major === tMajor && (minor > tMinor || (minor === tMinor && patch >= tPatch));
    }
    if (tMinor > 0) {
      return major === 0 && minor === tMinor && patch >= tPatch;
    }
    return major === 0 && minor === 0 && patch === tPatch;
  }
  if (range.startsWith('~')) {
    // ~x.y.z: >=x.y.z <x.(y+1).0
    return major === tMajor && minor === tMinor && patch >= tPatch;
  }
  // Fallback: exact or >=
  return major === tMajor && minor === tMinor && patch >= tPatch;
}

// ---------------------------------------------------------------------------
// Registry lookup cache — avoids duplicate requests for the same package
// ---------------------------------------------------------------------------
interface RegistryResult {
  exists: boolean;
  versions: string[];
}

const registryCache = new Map<string, Promise<RegistryResult>>();

async function queryRegistry(packageName: string): Promise<RegistryResult> {
  const cached = registryCache.get(packageName);
  if (cached) return cached;

  const promise = (async (): Promise<RegistryResult> => {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const res = await fetch(url);
    if (res.status !== 200) {
      return { exists: false, versions: [] };
    }
    const json = (await res.json()) as { versions?: Record<string, unknown> };
    const versions = json.versions ? Object.keys(json.versions) : [];
    return { exists: true, versions };
  })();

  registryCache.set(packageName, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Collect all unique (package, versionRange) pairs and track which
// template/preset references each one
// ---------------------------------------------------------------------------
interface DepEntry {
  packageName: string;
  versionRange: string;
  sources: string[]; // e.g. ["react-next (dep)", "react-vite (dep)"]
}

function collectDeps(): DepEntry[] {
  const map = new Map<string, DepEntry>();

  function addDep(pkg: string, range: string, source: string): void {
    const key = `${pkg}@${range}`;
    const existing = map.get(key);
    if (existing) {
      existing.sources.push(source);
    } else {
      map.set(key, { packageName: pkg, versionRange: range, sources: [source] });
    }
  }

  for (const tpl of TEMPLATES) {
    for (const [pkg, range] of Object.entries(tpl.dependencies)) {
      addDep(pkg, range, `template:${tpl.id} (dependencies)`);
    }
    for (const [pkg, range] of Object.entries(tpl.devDependencies)) {
      addDep(pkg, range, `template:${tpl.id} (devDependencies)`);
    }
  }

  for (const preset of PRESETS) {
    for (const [pkg, range] of Object.entries(preset.dependencies)) {
      addDep(pkg, range, `preset:${preset.id} (dependencies)`);
    }
  }

  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Build test data
// ---------------------------------------------------------------------------
const allDeps = collectDeps();

// Unique package names for existence checks
const uniquePackages = [...new Set(allDeps.map((d) => d.packageName))].map((name) => {
  const sources = allDeps.filter((d) => d.packageName === name).flatMap((d) => d.sources);
  return { name, sources };
});

// ---------------------------------------------------------------------------
// Known missing packages — tracked via GitHub issues, skip instead of fail.
// Remove entries once the package is published to npm.
// ---------------------------------------------------------------------------
const KNOWN_MISSING: Record<string, string> = {
  '@helixui/commerce': 'https://github.com/bookedsolidtech/helix/issues/1299',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('dependency registry validation', () => {
  describe.each(uniquePackages)('$name', ({ name, sources }) => {
    const knownIssue = KNOWN_MISSING[name];
    const testFn = knownIssue ? it.skip : it;
    testFn(
      `exists on the npm registry${knownIssue ? ` (KNOWN MISSING — ${knownIssue})` : ''}`,
      async () => {
        const result = await queryRegistry(name);
        expect(
          result.exists,
          `Package "${name}" not found on npm registry. Referenced by: ${sources.join(', ')}`,
        ).toBe(true);
      },
      30_000,
    );
  });

  describe.each(allDeps)('$packageName@$versionRange', ({ packageName, versionRange, sources }) => {
    it('has published versions satisfying the specified range', async () => {
      const result = await queryRegistry(packageName);
      if (!result.exists) {
        // The existence test above will catch this; skip range check
        return;
      }
      const satisfying = result.versions.filter((v) => satisfiesCaret(v, versionRange));
      expect(
        satisfying.length,
        `No published version of "${packageName}" satisfies range "${versionRange}". ` +
          `Referenced by: ${sources.join(', ')}. ` +
          `Latest versions: ${result.versions.slice(-5).join(', ')}`,
      ).toBeGreaterThan(0);
    }, 30_000);
  });
});
