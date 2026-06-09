/**
 * Dependency audit module — checks template dependencies for known
 * vulnerabilities and license compliance before scaffolding.
 *
 * Network failures degrade gracefully: if the advisory API or registry is
 * unreachable, the audit result reports `networkError: true` and scaffolding
 * continues uninterrupted.
 */

/** SPDX-approved permissive licenses for enterprise projects */
export const APPROVED_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
]);

const ADVISORIES_API = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const REGISTRY_API = 'https://registry.npmjs.org';

/** Severity ranking for choosing the worst advisory per package */
const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low'];

// ─── Public types ─────────────────────────────────────────────────────────────

export interface VulnerabilityWarning {
  package: string;
  version: string;
  severity: string;
  count: number;
}

export interface LicenseWarning {
  package: string;
  version: string;
  license: string;
}

export interface AuditResult {
  vulnerabilities: VulnerabilityWarning[];
  licenseIssues: LicenseWarning[];
  networkError: boolean;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface NpmAdvisory {
  severity: string;
}

interface NpmVersionMeta {
  license?: string;
  licenses?: Array<{ type: string }>;
}

interface NpmPackageMeta {
  'dist-tags'?: { latest?: string };
  versions?: Record<string, NpmVersionMeta>;
}

type AdvisoriesResponse = Record<string, NpmAdvisory[]>;

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Audits a map of `{ packageName: versionRange }` for:
 * - Known vulnerabilities via the npm registry advisory API
 * - Non-approved (e.g. copyleft) licenses via the npm registry metadata API
 *
 * Both checks degrade gracefully on network failure.
 */
export async function auditDependencies(deps: Record<string, string>): Promise<AuditResult> {
  const packageNames = Object.keys(deps);

  if (packageNames.length === 0) {
    return { vulnerabilities: [], licenseIssues: [], networkError: false };
  }

  const vulnerabilities: VulnerabilityWarning[] = [];
  const licenseIssues: LicenseWarning[] = [];
  let networkError = false;

  // Build advisory request body: { "package-name": ["version-range"], … }
  const advisoryBody: Record<string, string[]> = {};
  for (const [name, version] of Object.entries(deps)) {
    advisoryBody[name] = [version];
  }

  // ── 1. Vulnerability check ────────────────────────────────────────────────
  try {
    const advisoryResponse = await fetch(ADVISORIES_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(advisoryBody),
      signal: AbortSignal.timeout(10000),
    });

    if (advisoryResponse.ok) {
      const data = (await advisoryResponse.json()) as AdvisoriesResponse;

      for (const [pkgName, advisories] of Object.entries(data)) {
        if (advisories.length > 0) {
          const version = deps[pkgName] ?? 'unknown';

          // Tally by severity, then report the worst one
          const severityCounts = new Map<string, number>();
          for (const adv of advisories) {
            severityCounts.set(adv.severity, (severityCounts.get(adv.severity) ?? 0) + 1);
          }

          for (const sev of SEVERITY_ORDER) {
            const count = severityCounts.get(sev) ?? 0;
            if (count > 0) {
              vulnerabilities.push({ package: pkgName, version, severity: sev, count });
              break;
            }
          }
        }
      }
    }
  } catch {
    networkError = true;
  }

  // ── 2. License check ──────────────────────────────────────────────────────
  // Runs independently — individual failures silently degrade per-package.
  await Promise.all(
    packageNames.map(async (name) => {
      try {
        const regResponse = await fetch(`${REGISTRY_API}/${encodeURIComponent(name)}`, {
          signal: AbortSignal.timeout(10000),
        });

        if (!regResponse.ok) return;

        const meta = (await regResponse.json()) as NpmPackageMeta;
        const latestVersion = meta['dist-tags']?.latest;
        if (latestVersion === undefined) return;

        const versionMeta = meta.versions?.[latestVersion];
        if (versionMeta === undefined) return;

        const license = versionMeta.license ?? versionMeta.licenses?.[0]?.type ?? 'UNKNOWN';

        if (!APPROVED_LICENSES.has(license)) {
          licenseIssues.push({
            package: name,
            version: deps[name] ?? 'unknown',
            license,
          });
        }
      } catch {
        // Individual package lookup failure — skip silently
      }
    }),
  );

  return { vulnerabilities, licenseIssues, networkError };
}
