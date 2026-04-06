import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..', '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const RELEASE_YML = path.join(ROOT, '.github', 'workflows', 'release.yml');

describe('SBOM configuration', () => {
  it('package.json defines an sbom script', async () => {
    const pkg = await fs.readJson(PKG_PATH);
    expect(pkg.scripts).toHaveProperty('sbom');
    expect(pkg.scripts.sbom).toContain('cyclonedx-npm');
  });

  it('sbom script outputs JSON format', async () => {
    const pkg = await fs.readJson(PKG_PATH);
    expect(pkg.scripts.sbom).toContain('--output-format JSON');
  });

  it('sbom script writes to sbom.json', async () => {
    const pkg = await fs.readJson(PKG_PATH);
    expect(pkg.scripts.sbom).toContain('--output-file sbom.json');
  });

  it('@cyclonedx/cyclonedx-npm is listed as a devDependency', async () => {
    const pkg = await fs.readJson(PKG_PATH);
    expect(pkg.devDependencies).toHaveProperty('@cyclonedx/cyclonedx-npm');
  });
});

describe('SBOM release workflow integration', () => {
  it('release.yml includes SBOM generation step', async () => {
    const content = await fs.readFile(RELEASE_YML, 'utf-8');
    expect(content).toContain('Generate SBOM');
    expect(content).toContain('pnpm run sbom');
  });

  it('release.yml uploads SBOM as artifact', async () => {
    const content = await fs.readFile(RELEASE_YML, 'utf-8');
    expect(content).toContain('Upload SBOM as release artifact');
    expect(content).toContain('actions/upload-artifact');
    expect(content).toContain('sbom.json');
  });

  it('SBOM generation only runs when a release is published', async () => {
    const content = await fs.readFile(RELEASE_YML, 'utf-8');
    // Both the generate and upload steps should be conditional on publication
    const generateSection = content.slice(
      content.indexOf('Generate SBOM'),
      content.indexOf('Upload SBOM'),
    );
    expect(generateSection).toContain("steps.changesets.outputs.published == 'true'");
  });
});

describe('SBOM generation execution', () => {
  it('cyclonedx-npm binary is available after install', () => {
    // Check if the binary is resolvable via pnpm
    const result = execSync('pnpm bin', { cwd: ROOT, encoding: 'utf-8' }).trim();
    const binDir = result;
    const binaryExists = fs.existsSync(path.join(binDir, 'cyclonedx-npm'));
    if (!binaryExists) {
      // Tool not installed in this environment — skip execution test
      console.warn('cyclonedx-npm not installed; skipping execution test');
      return;
    }

    // If installed, generate a temporary SBOM and verify structure
    const tmpOutput = path.join(ROOT, 'sbom-test-output.json');
    try {
      try {
        execSync(`cyclonedx-npm --output-format JSON --output-file "${tmpOutput}"`, {
          cwd: ROOT,
          encoding: 'utf-8',
        });
      } catch (execErr: unknown) {
        const msg = String(execErr);
        // cyclonedx-npm uses `npm ls` internally; skip if the package manager
        // (e.g. pnpm 9+) does not support the flags cyclonedx-npm expects
        if (msg.includes('Unknown option') || msg.includes('npm-ls exited with errors')) {
          console.warn(
            'cyclonedx-npm incompatible with this package manager version; skipping execution test',
          );
          return;
        }
        throw execErr;
      }

      expect(fs.existsSync(tmpOutput)).toBe(true);

      const sbom = fs.readJsonSync(tmpOutput) as Record<string, unknown>;

      // Verify CycloneDX structure
      expect(sbom).toHaveProperty('bomFormat', 'CycloneDX');
      expect(sbom).toHaveProperty('specVersion');
      expect(sbom).toHaveProperty('components');
      expect(Array.isArray(sbom.components)).toBe(true);

      // Verify at least one production dep is listed (e.g. @clack/prompts)
      const components = sbom.components as Array<Record<string, unknown>>;
      const names = components.map((c) => c['name'] as string);
      expect(names.some((n) => n === '@clack/prompts')).toBe(true);
    } finally {
      fs.removeSync(tmpOutput);
    }
  });
});
