import { describe, it, expect, vi, afterEach } from 'vitest';
import { auditDependencies, APPROVED_LICENSES } from '../../src/security/dep-audit.js';
import { parseArgs } from '../../src/args.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFetchMock(responses: Array<{ ok: boolean; json: () => Promise<unknown> }>) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[callIndex];
    callIndex = Math.min(callIndex + 1, responses.length - 1);
    return Promise.resolve(resp);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 1. Vulnerability detection with mocked advisory data ────────────────────

describe('auditDependencies — vulnerability detection', () => {
  it('returns vulnerability warnings when advisory API reports issues', async () => {
    const advisoryData = {
      react: [{ severity: 'moderate', title: 'Some vulnerability' }],
    };
    const registryData = {
      'dist-tags': { latest: '18.2.0' },
      versions: { '18.2.0': { license: 'MIT' } },
    };

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(advisoryData),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(registryData),
      } as unknown as Response);

    const result = await auditDependencies({ react: '^18.2.0' });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.vulnerabilities[0]).toMatchObject({
      package: 'react',
      version: '^18.2.0',
      severity: 'moderate',
      count: 1,
    });
    expect(result.networkError).toBe(false);
  });

  it('reports the worst severity when a package has multiple advisories', async () => {
    const advisoryData = {
      lodash: [
        { severity: 'low', title: 'Minor issue' },
        { severity: 'high', title: 'Serious issue' },
        { severity: 'moderate', title: 'Moderate issue' },
      ],
    };
    const registryData = {
      'dist-tags': { latest: '4.17.21' },
      versions: { '4.17.21': { license: 'MIT' } },
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(advisoryData),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(registryData),
      } as unknown as Response);

    const result = await auditDependencies({ lodash: '^4.17.0' });

    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.vulnerabilities[0].severity).toBe('high');
    expect(result.vulnerabilities[0].count).toBe(1);
  });

  it('returns empty vulnerabilities when advisory API finds nothing', async () => {
    const registryData = {
      'dist-tags': { latest: '18.2.0' },
      versions: { '18.2.0': { license: 'MIT' } },
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(registryData),
      } as unknown as Response);

    const result = await auditDependencies({ react: '^18.2.0' });

    expect(result.vulnerabilities).toHaveLength(0);
    expect(result.networkError).toBe(false);
  });

  it('returns empty results for empty dependency map', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const result = await auditDependencies({});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.vulnerabilities).toHaveLength(0);
    expect(result.licenseIssues).toHaveLength(0);
    expect(result.networkError).toBe(false);
  });
});

// ─── 2. License warning ───────────────────────────────────────────────────────

describe('auditDependencies — license compliance', () => {
  it('warns when a dependency uses a copyleft (GPL) license', async () => {
    const registryData = {
      'dist-tags': { latest: '1.0.0' },
      versions: { '1.0.0': { license: 'GPL-3.0' } },
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}), // no advisories
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(registryData),
      } as unknown as Response);

    const result = await auditDependencies({ 'bad-dep': '^1.0.0' });

    expect(result.licenseIssues).toHaveLength(1);
    expect(result.licenseIssues[0]).toMatchObject({
      package: 'bad-dep',
      version: '^1.0.0',
      license: 'GPL-3.0',
    });
  });

  it('does not warn when all dependencies use approved licenses', async () => {
    const makeRegistryData = (license: string) => ({
      'dist-tags': { latest: '1.0.0' },
      versions: { '1.0.0': { license } },
    });

    const fetch = vi.spyOn(globalThis, 'fetch');
    // First call: advisory bulk (returns empty)
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as unknown as Response);
    // Subsequent calls: individual registry lookups
    for (const license of ['MIT', 'ISC', 'Apache-2.0']) {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeRegistryData(license)),
      } as unknown as Response);
    }

    const result = await auditDependencies({
      'pkg-a': '^1.0.0',
      'pkg-b': '^2.0.0',
      'pkg-c': '^3.0.0',
    });

    expect(result.licenseIssues).toHaveLength(0);
  });

  it('treats UNKNOWN license as non-compliant', async () => {
    const registryData = {
      'dist-tags': { latest: '1.0.0' },
      versions: { '1.0.0': {} }, // no license field
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(registryData),
      } as unknown as Response);

    const result = await auditDependencies({ 'mystery-pkg': '^1.0.0' });

    expect(result.licenseIssues).toHaveLength(1);
    expect(result.licenseIssues[0].license).toBe('UNKNOWN');
  });

  it('APPROVED_LICENSES set contains all required permissive licenses', () => {
    expect(APPROVED_LICENSES.has('MIT')).toBe(true);
    expect(APPROVED_LICENSES.has('Apache-2.0')).toBe(true);
    expect(APPROVED_LICENSES.has('BSD-2-Clause')).toBe(true);
    expect(APPROVED_LICENSES.has('BSD-3-Clause')).toBe(true);
    expect(APPROVED_LICENSES.has('ISC')).toBe(true);
    expect(APPROVED_LICENSES.has('0BSD')).toBe(true);
  });

  it('APPROVED_LICENSES set does not include copyleft licenses', () => {
    const copyleft = ['GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'AGPL-3.0'];
    for (const lic of copyleft) {
      expect(APPROVED_LICENSES.has(lic)).toBe(false);
    }
  });
});

// ─── 3. --skip-audit flag bypasses audit ─────────────────────────────────────

describe('--skip-audit flag parsing', () => {
  it('parseArgs returns skipAudit: false by default', () => {
    const result = parseArgs(['my-app']);
    expect(result.skipAudit).toBe(false);
  });

  it('parseArgs returns skipAudit: true when --skip-audit is present', () => {
    const result = parseArgs(['my-app', '--skip-audit']);
    expect(result.skipAudit).toBe(true);
  });

  it('parseArgs returns skipAudit: true even when other flags are present', () => {
    const result = parseArgs(['my-app', '--skip-audit', '--dry-run', '--no-install']);
    expect(result.skipAudit).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.noInstall).toBe(true);
  });
});

// ─── 4. Network failure degrades gracefully ───────────────────────────────────

describe('auditDependencies — network failure graceful degradation', () => {
  it('sets networkError: true when advisory API fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'));

    const result = await auditDependencies({ react: '^18.2.0' });

    expect(result.networkError).toBe(true);
    expect(result.vulnerabilities).toHaveLength(0);
  });

  it('returns empty results and networkError: true on connection refused', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    );

    const result = await auditDependencies({ lodash: '^4.17.0' });

    expect(result.networkError).toBe(true);
    expect(result.vulnerabilities).toHaveLength(0);
    expect(result.licenseIssues).toHaveLength(0);
  });

  it('does not throw when the registry is unreachable for license checks', async () => {
    // Advisory API succeeds; individual registry lookups fail
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      } as unknown as Response)
      .mockRejectedValue(new Error('registry timeout'));

    const result = await auditDependencies({ react: '^18.2.0', lodash: '^4.17.0' });

    expect(result.networkError).toBe(false);
    // License issues are silently skipped when registry is unreachable
    expect(result.licenseIssues).toHaveLength(0);
  });

  it('handles non-ok advisory API response gracefully', async () => {
    const registryData = {
      'dist-tags': { latest: '18.2.0' },
      versions: { '18.2.0': { license: 'MIT' } },
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(registryData),
      } as unknown as Response);

    const result = await auditDependencies({ react: '^18.2.0' });

    expect(result.networkError).toBe(false);
    expect(result.vulnerabilities).toHaveLength(0);
  });
});
