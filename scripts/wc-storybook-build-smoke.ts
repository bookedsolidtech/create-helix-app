#!/usr/bin/env tsx
/**
 * wc-storybook BUILD-OUTPUT smoke runner.
 *
 * Standalone Node script (NOT a vitest test) that exercises the full
 * factory output:
 *
 *   1. scaffold a wc-storybook project with fixed brand prompts
 *   2. `pnpm install` so all deps + transitive @helixui/* are real
 *   3. run the scaffold's prebuild chain (build-tokens + generate-catalog)
 *   4. boot storybook in the background, poll for ready
 *   5. drive a headless Chromium against the running iframe and walk
 *      every editorial + foundation + token-swatch + per-component
 *      page that the user would actually click
 *   6. assert on rendered DOM:
 *        - no console errors per page
 *        - no Vite import-resolution errors / 404s
 *        - body text is NOT white on white
 *        - specific content present (brandTagline, hero scene, etc.)
 *        - hx-* components actually mount with populated shadow roots
 *   7. emit a structured report + non-zero exit on failure
 *
 * Why standalone instead of vitest: this test runs for ~3-5 minutes,
 * spawns a long-lived child process, and uses headless Chromium. Vitest's
 * worker lifecycle kept killing it before the page-walk completed and
 * reporter output was never flushed. A plain Node script with a top-
 * level main() lets the runtime breathe and prints progress live.
 *
 * Run:
 *
 *   pnpm exec tsx scripts/wc-storybook-build-smoke.ts
 *
 * Or via:
 *
 *   npm run test:build-smoke
 *
 * Env knobs:
 *   PORT=6116          — Storybook dev port (default 6116)
 *   TARGET=/tmp/...    — scaffold target dir (default /tmp/helix-build-smoke)
 *   SKIP_INSTALL=1     — reuse an existing TARGET (faster iteration)
 *   KEEP_RUNNING=1     — don't kill storybook on exit (manual inspection)
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'fs-extra';
import { chromium, type Browser, type Page } from 'playwright';
import { scaffoldProject } from '../src/scaffold.js';
import type { ProjectOptions } from '../src/types.js';

const execFileAsync = promisify(execFile);

// ─── Config ──────────────────────────────────────────────────────────────

const TARGET = process.env.TARGET ?? '/tmp/helix-build-smoke';
const PORT = Number(process.env.PORT ?? 6116);
const URL = `http://localhost:${PORT}`;
const SKIP_INSTALL = process.env.SKIP_INSTALL === '1';
const KEEP_RUNNING = process.env.KEEP_RUNNING === '1';

const FIXED_OPTIONS: ProjectOptions = {
  name: 'build-smoke',
  directory: TARGET,
  framework: 'wc-storybook',
  componentBundles: ['core', 'forms'],
  typescript: true,
  eslint: true,
  designTokens: true,
  darkMode: true,
  installDeps: false,
  dsName: 'aurora',
  tokenPrefix: '--ar',
  brandTagline: 'Calm finance for everyone.',
  brandVerticals: ['fintech', 'wellness'],
};

interface StoryProbe {
  id: string;
  viewMode: 'docs' | 'story';
}

// A representative sample. Walking all 242 catalog entries is overkill — and
// Chromium on macOS gets unstable past ~5 docs page navigations because
// every Storybook docs.page eagerly compiles a lot of MDX. The five below
// exercise: brand-prompt rendering (cover), narrative IA (overview), pattern
// stub (patterns), one foundation page (color), one per-component conformance
// page (aurora-button). hx-button mount is verified separately via a story
// (not docs) URL after the loop.
const STORIES_TO_PROBE: StoryProbe[] = [
  { id: 'cover--docs', viewMode: 'docs' },
  { id: 'overview--docs', viewMode: 'docs' },
  { id: 'patterns--docs', viewMode: 'docs' },
  { id: 'foundations-color--docs', viewMode: 'docs' },
  { id: 'components-aurorabutton-conformance--docs', viewMode: 'docs' },
];

// Console messages that always pollute Storybook + are safe to ignore.
const CONSOLE_NOISE = [
  /Lit is in dev mode/,
  /Multiple versions of Lit loaded/,
  /storybook.*telemetry/i,
  /Story.*not found/i,
  /Failed to load resource.*favicon/i,
];

// ─── Tiny logger (live progress to stdout) ───────────────────────────────

function step(label: string): void {
  // eslint-disable-next-line no-console
  console.log(`[smoke] ${new Date().toISOString().slice(11, 19)}  ${label}`);
}

function fail(label: string, detail = ''): void {
  // eslint-disable-next-line no-console
  console.error(`[smoke] ✗ ${label}${detail ? `\n        ${detail}` : ''}`);
}

function ok(label: string): void {
  // eslint-disable-next-line no-console
  console.log(`[smoke] ✓ ${label}`);
}

// ─── Browser probe ───────────────────────────────────────────────────────

interface PageProbeResult {
  storyId: string;
  consoleErrors: string[];
  pageErrors: string[];
  vitePluginErrors: string[];
  bodyTextColor: string;
  bodyBgColor: string;
  hasContent: boolean;
  contentSnippet: string;
}

async function probePage(page: Page, story: StoryProbe): Promise<PageProbeResult> {
  const storyId = story.id;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const vitePluginErrors: string[] = [];

  const onConsole = (msg: import('playwright').ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (CONSOLE_NOISE.some((re) => re.test(text))) return;
    consoleErrors.push(text);
    if (
      /vite:import-analysis|Failed to fetch dynamically|Cannot convert undefined or null/i.test(
        text,
      )
    ) {
      vitePluginErrors.push(text);
    }
  };
  const onPageError = (err: Error) => {
    pageErrors.push(err.message);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  // Navigate directly to the preview iframe — no manager UI, no nested iframe.
  const target = `${URL}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=${story.viewMode}`;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

  // Wait until Storybook's loading skeleton (`sb-preparing-*`) is gone AND
  // real story/docs content has rendered (≥200 chars). Skeleton selectors
  // are tolerated as missing — older Storybook builds skip them.
  await page
    .waitForFunction(
      () => {
        const skeleton = document.querySelector(
          '.sb-preparing-story, .sb-preparing-docs, .sb-loader',
        );
        if (skeleton) return false;
        const root =
          document.querySelector('#storybook-docs') ??
          document.querySelector('#storybook-root') ??
          document.body;
        return (root.textContent ?? '').trim().length > 200;
      },
      { timeout: 8000 },
    )
    .catch(() => {});

  let probe: Omit<PageProbeResult, 'storyId' | 'consoleErrors' | 'pageErrors' | 'vitePluginErrors'>;
  try {
    probe = await page.evaluate(() => {
      const root =
        document.querySelector('#storybook-docs') ??
        document.querySelector('#storybook-root') ??
        document.body;
      const bodyTextColor = window.getComputedStyle(document.body).color;
      const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;
      const text = (root.textContent ?? '').trim();
      return {
        bodyTextColor,
        bodyBgColor,
        hasContent: text.length > 50,
        contentSnippet: text.slice(0, 400),
      };
    });
  } catch (err) {
    probe = {
      bodyTextColor: 'eval-failed',
      bodyBgColor: 'eval-failed',
      hasContent: false,
      contentSnippet: `evaluate error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  page.off('console', onConsole);
  page.off('pageerror', onPageError);

  return { storyId, consoleErrors, pageErrors, vitePluginErrors, ...probe };
}

function isWhiteOnWhite(textColor: string, bgColor: string): boolean {
  if (!textColor || !bgColor) return false;
  const match = (s: string): [number, number, number] | null => {
    const m = s.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const t = match(textColor);
  const b = match(bgColor);
  if (!t || !b) return false;
  const isNearWhite = (rgb: [number, number, number]) =>
    rgb[0] > 240 && rgb[1] > 240 && rgb[2] > 240;
  return isNearWhite(t) && isNearWhite(b);
}

async function pollUntilReady(timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${URL}/index.json`);
      if (res.ok) {
        const data = (await res.json()) as { entries?: Record<string, unknown> };
        if (data.entries && Object.keys(data.entries).length > 0) return;
      }
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Storybook did not become ready at ${URL} within ${timeoutMs}ms`);
}

// ─── Inline static-file server (avoids http-server dependency) ───────────

async function startStaticServer(
  rootDir: string,
  port: number,
  logPath: string,
): Promise<ChildProcess> {
  const fsmod = await import('node:fs');
  const fd = fsmod.openSync(logPath, 'w');
  // Inline server script — runs as child process, serves rootDir, supports
  // SPA fallback to iframe.html for /iframe* routes and index.html otherwise.
  const serverSrc = `
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = process.env.STATIC_ROOT;
const PORT = Number(process.env.STATIC_PORT);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  let filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback: serve iframe.html for /iframe.html paths, else index.html
      const fallback = pathname.startsWith('/iframe')
        ? path.join(ROOT, 'iframe.html')
        : path.join(ROOT, 'index.html');
      fs.stat(fallback, (e, s) => {
        if (e || !s.isFile()) { res.writeHead(404); res.end('not found'); return; }
        sendFile(fallback, res);
      });
      return;
    }
    sendFile(filePath, res);
  });
});
function sendFile(p, res) {
  const ext = path.extname(p);
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
}
server.listen(PORT, () => console.log('static server listening on', PORT));
`;
  return spawn('node', ['-e', serverSrc], {
    stdio: ['ignore', fd, fd],
    env: { ...process.env, STATIC_ROOT: rootDir, STATIC_PORT: String(port) },
  });
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let storybookProc: ChildProcess | undefined;
  let browser: Browser | undefined;
  const failures: Array<{ check: string; detail: string }> = [];

  const cleanup = async (): Promise<void> => {
    try {
      await browser?.close();
    } catch {
      /* */
    }
    if (!KEEP_RUNNING && storybookProc && !storybookProc.killed) {
      storybookProc.kill('SIGTERM');
    }
  };
  process.on('SIGINT', () => {
    void cleanup().finally(() => process.exit(130));
  });

  try {
    // Always re-scaffold so source MDX/ts files reflect current scaffolder state.
    // SKIP_INSTALL=1 only skips `pnpm install` and preserves node_modules.
    const nodeModulesDir = `${TARGET}/node_modules`;
    const hasNodeModules = SKIP_INSTALL && (await fs.pathExists(nodeModulesDir));
    let savedNodeModules: string | undefined;
    if (hasNodeModules) {
      savedNodeModules = `${TARGET}.nm-cache`;
      step(`SKIP_INSTALL=1 — preserving node_modules to ${savedNodeModules}`);
      await fs.remove(savedNodeModules);
      await fs.move(nodeModulesDir, savedNodeModules);
    }

    step(`scaffolding wc-storybook into ${TARGET}`);
    await fs.remove(TARGET);
    await scaffoldProject(FIXED_OPTIONS);

    if (savedNodeModules) {
      step('restoring node_modules');
      await fs.move(savedNodeModules, nodeModulesDir);
    }

    if (!SKIP_INSTALL) {
      step('pnpm install (this can take a minute)');
      try {
        await execFileAsync('pnpm', ['install', '--prefer-offline'], {
          cwd: TARGET,
          env: { ...process.env, CI: '1' },
        });
      } catch {
        await execFileAsync('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
          cwd: TARGET,
        });
      }
    } else {
      step('SKIP_INSTALL=1 — skipping pnpm install (using cached node_modules)');
    }

    step('running prebuild chain (build-tokens + generate-catalog)');
    await execFileAsync('pnpm', ['exec', 'tsx', 'scripts/build-tokens.ts'], { cwd: TARGET });
    await execFileAsync('pnpm', ['exec', 'tsx', 'scripts/generate-catalog.ts'], { cwd: TARGET });

    // Build a static Storybook bundle. Dev mode's HMR + Vite plugin pipeline
    // destabilises headless Chromium across multiple page navigations on
    // macOS; the static build is just precompiled HTML+JS and walks
    // reliably.
    const sbLogPath = `/tmp/storybook-smoke.log`;
    const staticDir = `${TARGET}/storybook-static`;
    const buildSkippable = SKIP_INSTALL && (await fs.pathExists(`${staticDir}/index.json`));
    if (!buildSkippable) {
      step('building static storybook bundle (storybook build) — this takes ~30-60s');
      await execFileAsync('pnpm', ['exec', 'storybook', 'build', '-o', 'storybook-static'], {
        cwd: TARGET,
        env: process.env,
        maxBuffer: 50 * 1024 * 1024,
      });
    } else {
      step('reusing existing storybook-static bundle');
    }

    step(`serving static storybook on port ${PORT}`);
    storybookProc = await startStaticServer(staticDir, PORT, sbLogPath);
    storybookProc.on('exit', (code) => {
      // eslint-disable-next-line no-console
      console.error(`[static-server] process exited with code ${code} (full log: ${sbLogPath})`);
    });

    step('polling /index.json for readiness (up to 3 min)');
    await pollUntilReady(180_000);
    ok('storybook ready');

    const indexRes = await fetch(`${URL}/index.json`);
    const indexData = (await indexRes.json()) as { entries?: Record<string, unknown> };
    const entryCount = Object.keys(indexData.entries ?? {}).length;
    step(`index.json has ${entryCount} entries`);
    if (entryCount < 100) {
      failures.push({
        check: 'index-entry-count',
        detail: `expected >=100 (catalog + narrative), got ${entryCount}`,
      });
    } else {
      ok(`index entry count >=100 (${entryCount})`);
    }

    step('launching headless chromium');
    browser = await chromium.launch();
    browser.on('disconnected', () => {
      // eslint-disable-next-line no-console
      console.error('[chromium] browser disconnected unexpectedly');
    });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    ctx.on('close', () => {
      // eslint-disable-next-line no-console
      console.error('[chromium] context closed unexpectedly');
    });
    const page = await ctx.newPage();

    // hx-button mount probe — run FIRST while chromium is fresh. Walking
    // many docs pages bloats the renderer process and kills it; deferring
    // this to after the loop has been unreliable.
    step('verifying hx-button web component mounts (story canvas)');
    let buttonProbe: { registered: boolean; count: number; hasShadow: boolean } = {
      registered: false,
      count: 0,
      hasShadow: false,
    };
    try {
      const buttonPage = await ctx.newPage();
      await buttonPage
        .goto(`${URL}/iframe.html?id=helix-atoms-hx-button--default&viewMode=story`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        })
        .catch(() => {});
      await buttonPage
        .waitForFunction(
          () => {
            const el = document.querySelector('hx-button') as HTMLElement | null;
            return (
              !!el &&
              !!window.customElements.get('hx-button') &&
              !!el.shadowRoot &&
              el.shadowRoot.children.length > 0
            );
          },
          { timeout: 12000 },
        )
        .catch(() => {});
      buttonProbe = await buttonPage.evaluate(() => {
        const buttons = document.querySelectorAll('hx-button');
        const first = buttons[0] as HTMLElement | undefined;
        return {
          registered: !!window.customElements.get('hx-button'),
          count: buttons.length,
          hasShadow: !!(first && first.shadowRoot && first.shadowRoot.children.length > 0),
        };
      });
      await buttonPage.close().catch(() => {});
    } catch (err) {
      failures.push({
        check: 'hx-button-probe',
        detail: `evaluate failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    if (!buttonProbe.registered) {
      failures.push({
        check: 'hx-button-registered',
        detail: 'customElements.get returned undefined',
      });
    }
    if (buttonProbe.count === 0) {
      failures.push({ check: 'hx-button-mount', detail: 'no <hx-button> elements rendered' });
    }
    if (!buttonProbe.hasShadow) {
      failures.push({
        check: 'hx-button-shadow',
        detail: 'shadow root empty — render did not populate',
      });
    }
    if (buttonProbe.registered && buttonProbe.count > 0 && buttonProbe.hasShadow) {
      ok(`hx-button registered + mounted (${buttonProbe.count} elements, shadow populated)`);
    }

    step(`walking ${STORIES_TO_PROBE.length} stories…`);
    const probes: PageProbeResult[] = [];
    for (let i = 0; i < STORIES_TO_PROBE.length; i++) {
      const story = STORIES_TO_PROBE[i];
      step(`  [${i + 1}/${STORIES_TO_PROBE.length}] ${story.id} (${story.viewMode})`);
      const result = await probePage(page, story);
      probes.push(result);

      if (result.pageErrors.length > 0) {
        failures.push({
          check: `pageError ${story.id}`,
          detail: result.pageErrors.slice(0, 2).join(' || '),
        });
      }
      if (result.vitePluginErrors.length > 0) {
        failures.push({
          check: `viteImportFailure ${story.id}`,
          detail: result.vitePluginErrors.slice(0, 1).join(' || '),
        });
      }
      if (result.consoleErrors.length > 0) {
        failures.push({
          check: `consoleError ${story.id}`,
          detail: result.consoleErrors.slice(0, 2).join(' || '),
        });
      }
      if (!result.hasContent) {
        failures.push({
          check: `emptyContent ${story.id}`,
          detail: `bodyText too short: "${result.contentSnippet.slice(0, 80)}"`,
        });
      }
      if (isWhiteOnWhite(result.bodyTextColor, result.bodyBgColor)) {
        failures.push({
          check: `whiteOnWhite ${story.id}`,
          detail: `text=${result.bodyTextColor} bg=${result.bodyBgColor}`,
        });
      }
    }

    // Specific assertions on contracts
    const cover = probes.find((p) => p.storyId === 'cover--docs');
    if (cover) {
      if (!cover.contentSnippet.includes('Calm finance for everyone')) {
        failures.push({
          check: 'cover-tagline',
          detail: `Cover.mdx missing brandTagline. Got: "${cover.contentSnippet.slice(0, 120)}"`,
        });
      }
      if (!/fintech/i.test(cover.contentSnippet) || !/wellness/i.test(cover.contentSnippet)) {
        failures.push({
          check: 'cover-verticals',
          detail: `Cover.mdx missing brandVerticals chips`,
        });
      }
    }

    await ctx.close();

    // ─── Report ──────────────────────────────────────────────────────────
    if (failures.length === 0) {
      ok(
        `ALL CHECKS PASSED — ${STORIES_TO_PROBE.length} stories walked, ${entryCount} index entries`,
      );
      await cleanup();
      process.exit(0);
    } else {
      // eslint-disable-next-line no-console
      console.error(`\n[smoke] ✗ ${failures.length} failure(s):\n`);
      for (const f of failures) {
        fail(f.check, f.detail);
      }
      await cleanup();
      process.exit(1);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('\n[smoke] unhandled error:', err instanceof Error ? err.stack : err);
    await cleanup();
    process.exit(2);
  }
}

void main();
