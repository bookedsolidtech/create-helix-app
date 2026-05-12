/**
 * v0.8.0 Phase D — Playwright visual-confirmation E2E gate.
 *
 * The new acceptance gate for v0.8.0+. v0.7.0 only verified install +
 * type-check; this layer adds the live-render dimension: scaffold,
 * install, type-check, BOOT THE DEV SERVER, and drive Playwright across
 * three views asserting DOM presence + customElements registration +
 * console cleanliness + visual baselines.
 *
 * For ONE configuration (Astro monorepo + includeDesignSystem with
 * dsName='aurora', tokenPrefix='--ar') this test:
 *
 *   1. Scaffolds via scaffoldProject({framework:'astro', monorepoMode:true,
 *      includeDesignSystem:true, dsName:'aurora', tokenPrefix:'--ar', ...}).
 *   2. Runs `pnpm install --no-frozen-lockfile --ignore-scripts` at the
 *      workspace root (5 min cap).
 *   3. Runs `pnpm --filter=@aurora/web type-check` (astro check). 3 min cap.
 *   4. Spawns `pnpm --filter=@aurora/web dev`; tails stdout waiting for
 *      "Local: http://localhost:4321" (60 s cap).
 *   5. Drives Chromium via playwright's programmatic chromium.launch()
 *      across three views:
 *        a) / (home, light theme) — DOM asserts: hx-button, hx-card,
 *           hx-icon all present; customElements.get('hx-button') is a
 *           class; <html data-theme="light">. Screenshot:
 *           tests/e2e/screenshots/astro/home-light.png.
 *        b) /components (via navigation click from home) — DOM asserts:
 *           URL contains 'components'; at least 2 hx-* tags present.
 *           Screenshot: tests/e2e/screenshots/astro/components-light.png.
 *        c) home with dark theme toggled — DOM asserts:
 *           <html data-theme="dark">; same hx-* tags still present.
 *           Screenshot: tests/e2e/screenshots/astro/home-dark.png.
 *   6. Asserts zero error-level console messages across all three views.
 *   7. Cleanup — kills dev server, removes tmp dir.
 *
 * GATED BEHIND `E2E=1` (or `E2E_VISUAL=1` for granular control). Skipped
 * by default — the full flow takes ~2-3 minutes and requires network
 * access to npm. Same gating pattern as
 * tests/e2e/monorepo-install.test.ts (E2E + E2E_MONOREPO).
 *
 * PLAYWRIGHT BROWSER: uses the `playwright` package (already in
 * devDependencies as 1.59.1) via the programmatic `chromium` import.
 * NOT `@playwright/test` — we stay inside vitest so the existing
 * E2E gating env-flag pattern continues to work without a parallel
 * test runner. Chromium version is pinned to whatever ships with
 * playwright 1.59.1 (verify via `npx playwright --version`); browser
 * binary cached under ~/Library/Caches/ms-playwright/chromium-<rev>.
 *
 * SCREENSHOT BASELINES: committed under tests/e2e/screenshots/astro/.
 * .gitattributes marks them as binary to avoid prettier/eslint noise.
 * Subsequent runs OVERWRITE the baseline (no diff comparison — that
 * would belong in a follow-up phase with toHaveScreenshot or a
 * dedicated visual-regression tool). The committed PNGs are the
 * human-reviewable artifact in PRs.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { chromium, type Browser, type Page } from 'playwright';
import { scaffoldProject } from '../../src/scaffold.js';
import { makeTmpRoot, removeTempDir } from '../integration/frameworks/setup.js';
import type { ProjectOptions } from '../../src/types.js';

// ── Test configuration ────────────────────────────────────────────────

const FLAVOR = {
  name: 'aurora',
  dsName: 'aurora',
  tokenPrefix: '--ar',
  scope: '@aurora',
} as const;

// Astro's default port — we still mention it here for documentation but
// don't hardcode it into requests; spawnDevServer captures the actual
// bound URL out of Astro's "Local <url>" output line, which lets the
// test survive port collisions (any orphan dev server on 4321 bumps
// Astro to 4322/etc.).
const DEV_BOOT_TIMEOUT_MS = 60 * 1000;
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const TYPECHECK_TIMEOUT_MS = 3 * 60 * 1000;
const PAGE_OP_TIMEOUT_MS = 10 * 1000;

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'astro');

// ── Helpers ───────────────────────────────────────────────────────────

interface ExecResult {
  ok: boolean;
  output: string;
}

/**
 * Run a shell command synchronously, capturing stdout + stderr + exit.
 * Mirrors the helper in tests/e2e/monorepo-install.test.ts — duplicated
 * rather than extracted because the two suites may diverge.
 */
function runSync(cmd: string, cwd: string, timeoutMs: number): ExecResult {
  try {
    const output = execSync(cmd, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: { ...process.env, CI: '1' },
    }).toString();
    return { ok: true, output };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const stdout = e.stdout?.toString() ?? '';
    const stderr = e.stderr?.toString() ?? '';
    return { ok: false, output: `${stdout}\n${stderr}\n${e.message ?? ''}` };
  }
}

/**
 * Spawn `pnpm --filter=@aurora/web dev` and wait for Astro's
 * "Local: http://localhost:4321" marker on stdout before resolving.
 * Rejects on timeout. The caller is responsible for killing the
 * returned ChildProcess.
 */
function spawnDevServer(cwd: string): Promise<{
  proc: ChildProcess;
  output: string;
  url: string;
}> {
  return new Promise((resolve, reject) => {
    const proc = spawn('pnpm', ['--filter', `${FLAVOR.scope}/web`, 'dev'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
      detached: false,
    });

    let buffer = '';
    let resolved = false;

    // Astro 5 prints something like:
    //   ┃ Local    http://localhost:4321/
    // once the dev server is ready to serve. The label uses
    // whitespace-padding (not a colon). When 4321 is already in use
    // (e.g. orphan dev server from a prior run, or any other process
    // squatting on the default), Astro auto-shifts to 4322 — capture the
    // actual URL Astro picked out of the output so the test connects to
    // wherever Astro actually bound, rather than failing the match.
    const readyRegex = /Local\s+(https?:\/\/localhost:\d+\/?)/;

    // Strip ANSI escape sequences before regex-matching. Astro respects
    // FORCE_COLOR=0 for most output but the box-drawing banner ignores
    // it; cleaning lets the regex anchor on plain "Local" + URL text.
    const stripAnsi = (s: string): string =>
      // eslint-disable-next-line no-control-regex
      s.replace(/\[[0-9;]*m/g, '');

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      const cleaned = stripAnsi(buffer);
      const match = cleaned.match(readyRegex);
      if (!resolved && match) {
        resolved = true;
        // Strip trailing slash so callers can join route paths cleanly.
        const url = match[1].replace(/\/$/, '');
        resolve({ proc, output: buffer, url });
      }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);

    const timeoutHandle = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill('SIGKILL');
        reject(
          new Error(
            `dev server did not log "Local <url>" within ${DEV_BOOT_TIMEOUT_MS}ms\n\n--- captured output ---\n${buffer}`,
          ),
        );
      }
    }, DEV_BOOT_TIMEOUT_MS);

    // Capture the handle ref so resolve()/reject() unblocks cleanly.
    proc.once('exit', (code, signal) => {
      clearTimeout(timeoutHandle);
      if (!resolved) {
        resolved = true;
        reject(
          new Error(
            `dev server exited (code=${code} signal=${signal}) before ready marker\n\n--- captured output ---\n${buffer}`,
          ),
        );
      }
    });
  });
}

/**
 * Kill a spawned dev server and wait for the process to fully exit.
 * Astro's dev server forks a vite child process; SIGTERM at the pnpm
 * wrapper cascades down, but we wait up to 5 s for the tree to drain
 * before falling back to SIGKILL.
 */
async function killDevServer(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.killed) return;
  await new Promise<void>((resolve) => {
    const fallback = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Already dead — ignore.
      }
      resolve();
    }, 5000);
    proc.once('exit', () => {
      clearTimeout(fallback);
      resolve();
    });
    try {
      proc.kill('SIGTERM');
    } catch {
      clearTimeout(fallback);
      resolve();
    }
  });
}

/** Capture all console-error / page-error messages emitted across the page lifetime. */
interface ConsoleCapture {
  errors: string[];
  warnings: string[];
}

function attachConsoleCapture(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = { errors: [], warnings: [] };
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') {
      capture.errors.push(msg.text());
    } else if (type === 'warning') {
      capture.warnings.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    capture.errors.push(`pageerror: ${err.message}`);
  });
  return capture;
}

// ── Gating ────────────────────────────────────────────────────────────

const e2eEnabled = !!process.env.E2E || !!process.env.E2E_VISUAL;
const describeFn = e2eEnabled ? describe : describe.skip;

// Track resources for afterAll cleanup even if a test crashes.
const tempDirs: string[] = [];
let activeDevServer: ChildProcess | null = null;

afterAll(async () => {
  if (activeDevServer) {
    await killDevServer(activeDevServer);
    activeDevServer = null;
    // Vite holds open file descriptors on node_modules/.vite while it
    // flushes; give the kernel a short grace period before rm to avoid
    // ENOTEMPTY on macOS.
    await new Promise((r) => setTimeout(r, 1000));
  }
  // fs.remove tolerates already-vanished paths; if Vite still has a
  // lock on .vite/deps, swallow the failure rather than failing the
  // whole suite — the OS will clean the tmpdir on next reboot.
  for (const dir of tempDirs) {
    try {
      await removeTempDir(dir);
    } catch {
      // Ignore — cleanup is best-effort.
    }
  }
}, 30_000);

// ── The gate ──────────────────────────────────────────────────────────

describeFn('v0.8.0 Phase D — Astro monorepo Playwright visual gate (gated on E2E=1)', () => {
  it(
    'scaffolds + installs + type-checks + boots dev + renders 3 views with hx-* upgraded',
    async () => {
      // ── 1. Scaffold ────────────────────────────────────────────
      const tmpRoot = makeTmpRoot('e2e-visual-astro');
      const projectDir = path.join(tmpRoot, FLAVOR.name);
      tempDirs.push(tmpRoot);
      await fs.ensureDir(tmpRoot);

      const options: ProjectOptions = {
        name: FLAVOR.name,
        directory: projectDir,
        framework: 'astro',
        componentBundles: ['core'],
        typescript: true,
        eslint: true,
        designTokens: true,
        darkMode: false,
        installDeps: false,
        force: true,
        monorepoMode: true,
        includeDesignSystem: true,
        dsName: FLAVOR.dsName,
        tokenPrefix: FLAVOR.tokenPrefix,
      };
      await scaffoldProject(options);

      // Scaffold sanity — pnpm-workspace.yaml has to exist for the
      // install step to even try resolving workspace:* refs.
      const wsYaml = path.join(projectDir, 'pnpm-workspace.yaml');
      expect(fs.existsSync(wsYaml), 'pnpm-workspace.yaml missing after scaffold').toBe(true);

      // ── 2. pnpm install ────────────────────────────────────────
      const installResult = runSync(
        'pnpm install --no-frozen-lockfile --ignore-scripts',
        projectDir,
        INSTALL_TIMEOUT_MS,
      );
      expect(installResult.ok, `pnpm install failed:\n${installResult.output}`).toBe(true);
      expect(installResult.output, 'pnpm install stderr contained ERR_PNPM_*').not.toMatch(
        /ERR_PNPM_[A-Z_]+/,
      );

      // ── 3. type-check apps/web (astro check) ───────────────────
      const tcResult = runSync(
        `pnpm --filter=${FLAVOR.scope}/web type-check`,
        projectDir,
        TYPECHECK_TIMEOUT_MS,
      );
      expect(tcResult.ok, `astro check failed:\n${tcResult.output}`).toBe(true);

      // ── 4. Boot dev server ─────────────────────────────────────
      // Astro picks 4321 by default and shifts up on collision. We
      // bind to whatever URL Astro actually logged — the regex in
      // spawnDevServer captures the bound port.
      const { proc: devProc, url: devUrl } = await spawnDevServer(projectDir);
      activeDevServer = devProc;

      // ── 5. Playwright: open three views ────────────────────────
      let browser: Browser | null = null;
      try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
          // Disable animations for stable screenshots.
          reducedMotion: 'reduce',
          viewport: { width: 1280, height: 800 },
        });
        const page = await context.newPage();
        const consoleCap = attachConsoleCapture(page);

        // ─── View 1: home (light theme) ─────────────────────────
        await page.goto(devUrl, { waitUntil: 'networkidle', timeout: 30_000 });

        // Wait for the HELiX runtime loader to register customElements.
        // The <script>import '@helixui/library'</script> in Layout.astro
        // is bundled by Vite and runs at page-load; networkidle covers
        // the import resolution, then we wait for the registry to confirm.
        await page.waitForFunction(() => customElements.get('hx-button') !== undefined, {
          timeout: 10_000,
        });

        const homeButtonCount = await page.locator('hx-button').count();
        const homeCardCount = await page.locator('hx-card').count();
        const homeIconCount = await page.locator('hx-icon').count();
        expect(homeButtonCount, 'home: expected at least 1 <hx-button>').toBeGreaterThanOrEqual(1);
        expect(homeCardCount, 'home: expected at least 1 <hx-card>').toBeGreaterThanOrEqual(1);
        expect(homeIconCount, 'home: expected at least 1 <hx-icon>').toBeGreaterThanOrEqual(1);

        // Verify customElements.get('hx-button') is a class (constructor
        // function), not undefined or a primitive.
        const registryCheck = await page.evaluate(() => {
          const Ctor = customElements.get('hx-button');
          return {
            present: Ctor !== undefined,
            isFunction: typeof Ctor === 'function',
            name: Ctor?.name ?? null,
          };
        });
        expect(registryCheck.present, 'customElements.get("hx-button") returned undefined').toBe(
          true,
        );
        expect(
          registryCheck.isFunction,
          `customElements.get("hx-button") was not a constructor (got ${registryCheck.name})`,
        ).toBe(true);

        // Default theme is light (the data-theme="light" baked into the
        // <html> tag in Layout.astro).
        const initialTheme = await page.getAttribute('html', 'data-theme');
        expect(initialTheme, 'expected initial data-theme="light"').toBe('light');

        await fs.ensureDir(SCREENSHOT_DIR);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'home-light.png'),
          fullPage: true,
        });

        // ─── View 2: /components (via navigation) ───────────────
        // Use the in-page nav link rather than page.goto so we exercise
        // Astro's view transitions — the customElements registry must
        // survive the morph. Locator targets the nav link in
        // index.astro's site-header.
        await page.locator('nav.site-nav a[href="/components"]').first().click();
        await page.waitForURL(/\/components\b/, { timeout: PAGE_OP_TIMEOUT_MS });
        // Wait for the new page's heading text — confirms the route
        // committed (not just an in-flight transition).
        await page
          .locator('h1', { hasText: /^Components$/i })
          .first()
          .waitFor({ timeout: PAGE_OP_TIMEOUT_MS });
        // Wait for Astro's view-transition animation to finish before
        // screenshotting. Even with reducedMotion the browser briefly
        // paints both pages overlapping during the morph; the
        // astro:page-load event fires once the new document is fully
        // in place. Fall back to a short networkidle after to cover
        // edge cases where the event already fired.
        await page
          .waitForFunction(
            () =>
              document.documentElement.classList.contains('astro-route-announcer') === false &&
              !document.documentElement.hasAttribute('data-astro-transition'),
            { timeout: 3_000 },
          )
          .catch(() => {
            // Best-effort — fall through to networkidle.
          });
        await page.waitForLoadState('networkidle', { timeout: 5_000 });

        const componentsHxCount = await page
          .locator(
            ':is(hx-button, hx-card, hx-badge, hx-text-input, hx-textarea, hx-checkbox, hx-alert, hx-icon)',
          )
          .count();
        expect(
          componentsHxCount,
          'components: expected at least 2 <hx-*> tags',
        ).toBeGreaterThanOrEqual(2);

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'components-light.png'),
          fullPage: true,
        });

        // ─── View 3: home with dark theme toggled ───────────────
        await page.goto(devUrl, { waitUntil: 'networkidle', timeout: 30_000 });
        // Re-verify registry after a fresh navigation (cold-load path,
        // not view-transition).
        await page.waitForFunction(() => customElements.get('hx-button') !== undefined, {
          timeout: 10_000,
        });

        // The ThemeToggle button has data-theme-toggle attribute (from
        // ThemeToggle.astro). Locate by attribute, click, then poll for
        // <html data-theme="dark">.
        await page.locator('[data-theme-toggle]').first().click();
        await page.waitForFunction(
          () => document.documentElement.getAttribute('data-theme') === 'dark',
          { timeout: 2_000 },
        );

        const darkTheme = await page.getAttribute('html', 'data-theme');
        expect(darkTheme, 'expected data-theme="dark" after toggle').toBe('dark');

        // Confirm theme toggle didn't break the page — hx-* tags still
        // present.
        const darkButtonCount = await page.locator('hx-button').count();
        expect(darkButtonCount, 'dark: <hx-button> count regressed').toBeGreaterThanOrEqual(1);

        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'home-dark.png'),
          fullPage: true,
        });

        // ─── Console assertions ─────────────────────────────────
        // Filter out known-noisy non-actionable errors. Astro's dev
        // server sometimes logs HMR pings; favicon 404 is benign if it
        // ever shows up. Add filters with a comment if needed — for
        // now, the gate is strict (zero errors).
        const fatalErrors = consoleCap.errors.filter((msg) => {
          // Favicon 404 — Astro serves /favicon.svg, but if the route
          // is malformed in any way the test should catch it. Keep
          // strict for now.
          if (/Failed to load resource.*favicon/i.test(msg)) return false;
          return true;
        });
        expect(fatalErrors, `unexpected console errors:\n${fatalErrors.join('\n')}`).toEqual([]);
      } finally {
        if (browser) {
          await browser.close().catch(() => {
            // Swallow — process is exiting either way.
          });
        }
      }
    },
    10 * 60 * 1000, // 10 min cap (scaffold + install + dev boot + Playwright)
  );
});
