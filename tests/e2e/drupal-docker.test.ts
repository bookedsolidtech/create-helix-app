/**
 * Docker E2E tests: scaffold a Drupal theme, boot Drupal 11 via Docker Compose,
 * enable the theme with drush, and verify the site is reachable.
 *
 * Gated behind HELIX_DOCKER_TESTS=true — skipped in normal CI.
 * Timeout: 300s per test (Docker pull + Drupal install is slow on first run).
 *
 * Usage:
 *   HELIX_DOCKER_TESTS=true pnpm test -- --testPathPattern=drupal-docker
 */

import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import { scaffoldDrupalTheme } from '../../src/generators/drupal-theme.js';
import { makeTmpRoot, removeTempDir } from '../integration/frameworks/setup.js';
import type { DrupalPreset } from '../../src/types.js';

const DOCKER_ENABLED = process.env['HELIX_DOCKER_TESTS'] === 'true';

// ---------------------------------------------------------------------------
// Helper: run a shell command, return { ok, output }
// ---------------------------------------------------------------------------

function run(cmd: string, cwd: string, timeoutMs = 120_000): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    }).toString();
    return { ok: true, output };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const stdout = e.stdout?.toString() ?? '';
    const stderr = e.stderr?.toString() ?? '';
    return { ok: false, output: `${stdout}\n${stderr}\n${e.message ?? ''}` };
  }
}

// ---------------------------------------------------------------------------
// Helper: poll until Drupal responds or timeout
// ---------------------------------------------------------------------------

async function waitForDrupal(
  url: string,
  timeoutMs = 240_000,
  intervalMs = 5_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = run(`curl -sf ${url}`, process.cwd(), 8_000);
    if (result.ok) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Test matrix
// ---------------------------------------------------------------------------

const PRESETS: DrupalPreset[] = ['standard'];

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((d) => removeTempDir(d)));
});

if (!DOCKER_ENABLED) {
  describe('drupal docker E2E (skipped — set HELIX_DOCKER_TESTS=true to enable)', () => {
    it.skip('docker tests disabled', () => {});
  });
} else {
  describe.each(PRESETS)('drupal docker E2E: %s preset', (presetId) => {
    const tmpRoot = makeTmpRoot(`e2e-drupal-docker-${presetId}`);
    const themeDir = path.join(tmpRoot, `test_${presetId}`);
    const dockerDir = path.join(themeDir, 'docker');
    tempDirs.push(tmpRoot);

    it(`scaffolds ${presetId} theme and boots Drupal 11 via Docker`, async () => {
      // Step 1: scaffold
      await fs.ensureDir(tmpRoot);
      await scaffoldDrupalTheme({
        themeName: `test_${presetId}`,
        directory: themeDir,
        preset: presetId,
      });

      expect(
        fs.existsSync(path.join(dockerDir, 'docker-compose.yml')),
        'docker-compose.yml must exist',
      ).toBe(true);

      // Step 2: boot Docker stack
      const upResult = run('docker compose up -d', dockerDir, 60_000);
      expect(upResult.ok, `docker compose up failed:\n${upResult.output}`).toBe(true);

      try {
        // Step 3: wait for Drupal to respond
        const ready = await waitForDrupal('http://localhost:8080/');
        expect(ready, 'Drupal never responded at http://localhost:8080/').toBe(true);

        // Step 4: run setup script
        const setupCmd = [
          'docker compose exec -T drupal bash',
          `/opt/drupal/web/themes/custom/test_${presetId}/docker/scripts/setup-drupal.sh`,
        ].join(' ');
        const setupResult = run(setupCmd, dockerDir, 120_000);
        expect(setupResult.ok, `setup-drupal.sh failed:\n${setupResult.output}`).toBe(true);

        // Step 5: verify HTTP response contains HTML
        const response = run('curl -sf http://localhost:8080/', dockerDir, 10_000);
        expect(response.ok, 'GET / failed after theme install').toBe(true);
        expect(response.output.toLowerCase()).toMatch(/html/);
      } finally {
        // Always tear down
        run('docker compose down -v', dockerDir, 60_000);
      }
    }, 300_000);
  });
}
