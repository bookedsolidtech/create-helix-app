/**
 * v0.9.0 Phase D — SvelteKit monorepo Playwright visual-confirmation E2E gate.
 *
 * Mirrors v0.8.0's Astro Phase D gate (tests/e2e/astro-monorepo-visual.test.ts):
 * scaffold → install → type-check → boot dev server → drive Chromium across
 * three views asserting DOM presence + customElements registration + console
 * cleanliness + visual baselines.
 *
 * For ONE configuration (SvelteKit monorepo + includeDesignSystem with
 * dsName='aurora', tokenPrefix='--ar') this test:
 *
 *   1. Scaffolds via scaffoldProject({framework:'svelte-kit',
 *      monorepoMode:true, includeDesignSystem:true, dsName:'aurora',
 *      tokenPrefix:'--ar', ...}).
 *   2. Runs `pnpm install --no-frozen-lockfile --ignore-scripts` at the
 *      workspace root (5 min cap).
 *   3. Runs `pnpm --filter=@aurora/web type-check` (svelte-check after
 *      svelte-kit sync). 3 min cap.
 *   4. Spawns `pnpm --filter=@aurora/web dev`; tails stdout waiting for
 *      Vite's "Local: http://localhost:5173" marker (60 s cap).
 *   5. Drives Chromium across three views:
 *        a) / (home, light theme) — DOM asserts: hx-button, hx-card,
 *           hx-icon all present; customElements.get('hx-button') is a
 *           class; <html data-theme="light">.
 *           Screenshot: tests/e2e/screenshots/sveltekit/home-light.png.
 *        b) /components (via SvelteKit nav click — exercises the
 *           onNavigate hook + browser-native view transitions) — DOM
 *           asserts: URL contains 'components'; at least 2 hx-* tags.
 *           Screenshot: tests/e2e/screenshots/sveltekit/components-light.png.
 *        c) home with dark theme toggled — DOM asserts:
 *           <html data-theme="dark">; same hx-* tags still present.
 *           Screenshot: tests/e2e/screenshots/sveltekit/home-dark.png.
 *   6. Asserts zero error-level console messages across all three views.
 *   7. Cleanup — kills dev server, removes tmp dir.
 *
 * GATED BEHIND `E2E=1` (or `E2E_VISUAL=1` for granular control). Skipped
 * by default — the full flow takes ~2-3 minutes and requires network
 * access to npm. Same gating pattern as the Astro Phase D gate.
 *
 * PLAYWRIGHT BROWSER: uses the `playwright` package (already in
 * devDependencies as 1.59.1) via the programmatic `chromium` import.
 * NOT `@playwright/test` — we stay inside vitest so the existing E2E
 * gating env-flag pattern continues to work without a parallel runner.
 *
 * SCREENSHOT BASELINES: committed under tests/e2e/screenshots/sveltekit/.
 * Subsequent runs OVERWRITE the baseline (no diff comparison). The
 * committed PNGs are the human-reviewable artifact in PRs.
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

// SvelteKit / Vite default to 5173. On collision Vite shifts to 5174,
// 5175, ... — spawnDevServer captures the actual bound URL out of the
// "Local: <url>" marker line so the test survives port squatting.
const DEV_BOOT_TIMEOUT_MS = 60 * 1000;
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const TYPECHECK_TIMEOUT_MS = 3 * 60 * 1000;
const PAGE_OP_TIMEOUT_MS = 10 * 1000;

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots', 'sveltekit');

// ── Helpers ───────────────────────────────────────────────────────────

interface ExecResult {
  ok: boolean;
  output: string;
}

/**
 * Run a shell command synchronously, capturing stdout + stderr + exit.
 * Same helper shape as the Astro Phase D gate.
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
 * Spawn `pnpm --filter=@aurora/web dev` and wait for Vite's "Local:
 * http://localhost:5173" marker on stdout before resolving. Rejects on
 * timeout. The caller is responsible for killing the returned
 * ChildProcess.
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

    // Vite logs something like:
    //   ➜  Local:   http://localhost:5173/
    // once dev is ready. We just match any localhost URL in the buffer
    // — Vite is the only thing printing one in this child process, so
    // the URL itself is the unique marker. Avoids needing to anchor on
    // "Local:" through ANSI noise.
    const readyRegex = /(https?:\/\/localhost:\d+)/;

    // Strip ANSI escape sequences before regex-matching. Vite respects
    // FORCE_COLOR=0 for plain logging but the framework banner still
    // contains decorative codes. The full sequence is ESC + [ + params
    // + final byte; the ESC prefix (\x1B) is the part naive strippers
    // miss.
    const stripAnsi = (s: string): string =>
      // eslint-disable-next-line no-control-regex
      s.replace(/\x1B?\[[0-9;]*m/g, '');

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
            `dev server did not log "Local: <url>" within ${DEV_BOOT_TIMEOUT_MS}ms\n\n--- captured output ---\n${buffer}`,
          ),
        );
      }
    }, DEV_BOOT_TIMEOUT_MS);

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
 * Same cascade SIGTERM → SIGKILL pattern as the Astro gate.
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
  for (const dir of tempDirs) {
    try {
      await removeTempDir(dir);
    } catch {
      // Cleanup is best-effort.
    }
  }
}, 30_000);

// ── The gate ──────────────────────────────────────────────────────────

describeFn('v0.9.0 Phase D — SvelteKit monorepo Playwright visual gate (gated on E2E=1)', () => {
  it(
    'scaffolds + installs + type-checks + boots dev + renders 3 views with hx-* upgraded',
    async () => {
      // ── 1. Scaffold ────────────────────────────────────────────
      const tmpRoot = makeTmpRoot('e2e-visual-sveltekit');
      const projectDir = path.join(tmpRoot, FLAVOR.name);
      tempDirs.push(tmpRoot);
      await fs.ensureDir(tmpRoot);

      const options: ProjectOptions = {
        name: FLAVOR.name,
        directory: projectDir,
        framework: 'svelte-kit',
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

      // ── 2b. Run the @helixui/icons sprite-copy postinstall ─────
      // The install above passes --ignore-scripts (so a flaky lifecycle
      // script in a transitive dep can't hang the suite), which also
      // skips apps/web's own `postinstall`. A real consumer's
      // `npm install` runs it; mirror that here by invoking the script
      // directly. It copies @helixui/icons' sprite SVGs into
      // apps/web/static/icons/ so <hx-icon> resolves them same-origin —
      // without it the page 404s on /icons/*.svg and the strict
      // console-error gate below (correctly) fails.
      const iconsResult = runSync(
        `pnpm --filter=${FLAVOR.scope}/web exec node scripts/copy-helix-icons.mjs`,
        projectDir,
        TYPECHECK_TIMEOUT_MS,
      );
      expect(iconsResult.ok, `copy-helix-icons.mjs failed:\n${iconsResult.output}`).toBe(true);
      expect(
        fs.existsSync(path.join(projectDir, 'apps', 'web', 'static', 'icons', 'helix.svg')),
        'copy-helix-icons.mjs did not emit apps/web/static/icons/helix.svg',
      ).toBe(true);

      // ── 3. svelte-kit sync (generates .svelte-kit/tsconfig.json
      //       which apps/web/tsconfig.json extends — without this the
      //       svelte-check call in the next step fails on cold checkout)
      const syncResult = runSync(
        `pnpm --filter=${FLAVOR.scope}/web exec svelte-kit sync`,
        projectDir,
        TYPECHECK_TIMEOUT_MS,
      );
      expect(syncResult.ok, `svelte-kit sync failed:\n${syncResult.output}`).toBe(true);

      // ── 4. type-check apps/web (svelte-check) ──────────────────
      const tcResult = runSync(
        `pnpm --filter=${FLAVOR.scope}/web type-check`,
        projectDir,
        TYPECHECK_TIMEOUT_MS,
      );
      expect(tcResult.ok, `svelte-check failed:\n${tcResult.output}`).toBe(true);

      // ── 5. Boot dev server ─────────────────────────────────────
      // Vite picks 5173 by default; shifts up on collision. spawnDevServer
      // captures whatever URL Vite actually logged.
      const { proc: devProc, url: devUrl } = await spawnDevServer(projectDir);
      activeDevServer = devProc;

      // ── 6. Playwright: open three views ────────────────────────
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
        // +layout.svelte's onMount fires the dynamic
        // `import('@helixui/library')` after hydration; networkidle covers
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
        // <html> tag in app.html, restored by the inline boot script).
        const initialTheme = await page.getAttribute('html', 'data-theme');
        expect(initialTheme, 'expected initial data-theme="light"').toBe('light');

        await fs.ensureDir(SCREENSHOT_DIR);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'home-light.png'),
          fullPage: true,
        });

        // ─── View 2: /components (via SvelteKit nav) ─────────────
        // Use the in-page nav link rather than page.goto so we exercise
        // SvelteKit's onNavigate hook + the browser-native View
        // Transitions API. The customElements registry must survive
        // the morph.
        await page.locator('nav.site-nav a[href="/components"]').first().click();
        await page.waitForURL(/\/components\b/, { timeout: PAGE_OP_TIMEOUT_MS });
        // Wait for the new page's heading text — confirms the route
        // committed (not just an in-flight transition).
        await page
          .locator('h1', { hasText: /^Components$/i })
          .first()
          .waitFor({ timeout: PAGE_OP_TIMEOUT_MS });
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

        // The ThemeToggle button has class="theme-toggle" (from
        // ThemeToggle.svelte). Click, then poll for <html data-theme="dark">.
        await page.locator('button.theme-toggle').first().click();
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
        // Filter known-noisy non-actionable errors. Vite HMR pings +
        // favicon-related 404s are benign; everything else fails the gate.
        const fatalErrors = consoleCap.errors.filter((msg) => {
          if (/Failed to load resource.*favicon/i.test(msg)) return false;
          // SvelteKit's HMR client occasionally logs a benign HMR
          // protocol message on the first reconnection.
          if (/\[vite\] (connecting|connected)/i.test(msg)) return false;
          return true;
        });
        expect(fatalErrors, `unexpected console errors:\n${fatalErrors.join('\n')}`).toEqual([]);
      } finally {
        if (browser) {
          await browser.close().catch(() => {
            // Process is exiting either way.
          });
        }
      }
    },
    10 * 60 * 1000, // 10 min cap (scaffold + install + dev boot + Playwright)
  );
});
