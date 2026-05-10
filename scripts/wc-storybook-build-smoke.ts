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
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { scaffoldProject } from '../src/scaffold.js';
import type { ProjectOptions } from '../src/types.js';

const execFileAsync = promisify(execFile);

// ─── Config ──────────────────────────────────────────────────────────────

const TARGET = process.env.TARGET ?? '/tmp/helix-build-smoke';
const PORT = Number(process.env.PORT ?? 6116);
const URL = `http://localhost:${PORT}`;
const SKIP_INSTALL = process.env.SKIP_INSTALL === '1';
const KEEP_RUNNING = process.env.KEEP_RUNNING === '1';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? '/tmp/helix-smoke-screenshots';
const REPORT_PATH = process.env.REPORT_PATH ?? '/tmp/helix-smoke-report.json';
// Chromium dies after rendering ~3-5 pages on macOS when each navigation
// triggers Storybook's docs-page lazy compilation, MDX render, and an
// inline a11y scan. Rotating the browser every BATCH_SIZE pages dodges
// the renderer-process resource ceiling. Smaller batches = more browser
// startup overhead but bulletproof; bigger batches = faster but flaky.
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 4);
// Subset filter — env var to override (e.g. SUBSET=cover,foundations runs
// only ids whose title matches one of those substrings, case-insensitive).
const SUBSET = process.env.SUBSET ?? '';
const SKIP_A11Y = process.env.SKIP_A11Y === '1';

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
  title: string;
}

// Pull every entry out of /index.json and walk all of them. Chromium dies
// after 5-10 docs renders on macOS, so the loop launches a fresh browser
// every BATCH_SIZE pages — each batch starts with a clean renderer.
async function loadAllStories(): Promise<StoryProbe[]> {
  const res = await fetch(`${URL}/index.json`);
  const data = (await res.json()) as {
    entries?: Record<string, { id: string; title: string; type: string; name: string }>;
  };
  const entries = Object.values(data.entries ?? {});
  const stories: StoryProbe[] = entries.map((e) => ({
    id: e.id,
    viewMode: e.type === 'docs' ? 'docs' : 'story',
    title: e.title,
  }));
  // Deterministic order for reproducible reports
  stories.sort((a, b) => a.id.localeCompare(b.id));
  if (SUBSET) {
    const needles = SUBSET.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
    return stories.filter((s) =>
      needles.some(
        (n) => s.id.toLowerCase().includes(n) || s.title.toLowerCase().includes(n),
      ),
    );
  }
  return stories;
}

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

interface A11yViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  nodes: number;
}

interface PageProbeResult {
  storyId: string;
  title: string;
  viewMode: 'docs' | 'story';
  status: 'ok' | 'empty' | 'error' | 'crashed';
  consoleErrors: string[];
  pageErrors: string[];
  vitePluginErrors: string[];
  bodyTextColor: string;
  bodyBgColor: string;
  hasContent: boolean;
  contentSnippet: string;
  screenshotPath: string | null;
  a11yViolations: A11yViolation[];
  a11ySerious: number;
  a11yCritical: number;
}

async function probePage(
  ctx: BrowserContext,
  story: StoryProbe,
  index: number,
  total: number,
): Promise<PageProbeResult> {
  const storyId = story.id;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const vitePluginErrors: string[] = [];
  let screenshotPath: string | null = null;
  let a11yViolations: A11yViolation[] = [];
  let a11ySerious = 0;
  let a11yCritical = 0;
  let status: PageProbeResult['status'] = 'ok';

  // Fresh page per probe inside the batch. We're inside a fresh browser
  // (rotated every BATCH_SIZE), so creating a page here is cheap.
  const page = await ctx.newPage();

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

  const target = `${URL}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=${story.viewMode}`;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

  await page
    .waitForFunction(
      (mode: 'docs' | 'story') => {
        const skeleton = document.querySelector(
          '.sb-preparing-story, .sb-preparing-docs, .sb-loader',
        );
        if (skeleton) return false;
        if (mode === 'docs') {
          const root =
            document.querySelector('#storybook-docs') ??
            document.querySelector('#storybook-root') ??
            document.body;
          return (root.textContent ?? '').trim().length > 200;
        }
        // Story view: any rendered child under #storybook-root means the
        // story has mounted. No text-length threshold — icon-only stories
        // are valid.
        const storyRoot = document.querySelector('#storybook-root');
        return !!(storyRoot && storyRoot.children.length > 0);
      },
      story.viewMode,
      { timeout: 8000 },
    )
    .catch(() => {});

  let probe: Pick<
    PageProbeResult,
    'bodyTextColor' | 'bodyBgColor' | 'hasContent' | 'contentSnippet'
  >;
  try {
    probe = await page.evaluate((mode: 'docs' | 'story') => {
      // For story canvas pages we look at #storybook-root (the rendered
      // component); for docs pages we look at #storybook-docs (the MDX
      // page wrapper). Each has a different empty-vs-rendered threshold.
      const docsRoot = document.querySelector('#storybook-docs');
      const storyRoot = document.querySelector('#storybook-root');
      const root = mode === 'docs' ? (docsRoot ?? storyRoot ?? document.body) : (storyRoot ?? docsRoot ?? document.body);
      const bodyTextColor = window.getComputedStyle(document.body).color;
      const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;
      const text = (root.textContent ?? '').trim();
      // Story view: any rendered DOM element under #storybook-root is
      // success — text content can be 0 chars (e.g. an icon-only button).
      // Docs view: requires a substantive MDX render (>50 chars).
      const hasContent =
        mode === 'docs' ? text.length > 50 : root.children.length > 0 || text.length > 0;
      return {
        bodyTextColor,
        bodyBgColor,
        hasContent,
        contentSnippet: text.slice(0, 400),
      };
    }, story.viewMode);
  } catch (err) {
    probe = {
      bodyTextColor: 'eval-failed',
      bodyBgColor: 'eval-failed',
      hasContent: false,
      contentSnippet: `evaluate error: ${err instanceof Error ? err.message : String(err)}`,
    };
    status = 'crashed';
  }

  // Screenshot every page so the user can SEE every component.
  // Viewport-only (1280x900) — fullPage=true rasterizes the entire scroll
  // surface, which compounds chromium's renderer memory pressure across
  // a long walk and trips the resource ceiling sooner.
  try {
    const safeId = storyId.replace(/[^a-z0-9._-]/gi, '_');
    screenshotPath = `${SCREENSHOT_DIR}/${String(index).padStart(3, '0')}-${safeId}.png`;
    await page.screenshot({ path: screenshotPath, timeout: 6000 });
  } catch (err) {
    pageErrors.push(`screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Run axe-core a11y scan. Skipped via SKIP_A11Y=1 for fast smoke checks.
  if (!SKIP_A11Y && status !== 'crashed') {
    try {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      a11yViolations = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? null,
        description: v.description,
        nodes: v.nodes.length,
      }));
      a11ySerious = a11yViolations.filter((v) => v.impact === 'serious').length;
      a11yCritical = a11yViolations.filter((v) => v.impact === 'critical').length;
    } catch (err) {
      pageErrors.push(`axe failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (status === 'ok' && !probe.hasContent) status = 'empty';
  if (status === 'ok' && (consoleErrors.length || pageErrors.length || vitePluginErrors.length)) {
    status = 'error';
  }

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  await page.close().catch(() => {});

  return {
    storyId,
    title: story.title,
    viewMode: story.viewMode,
    status,
    consoleErrors,
    pageErrors,
    vitePluginErrors,
    screenshotPath,
    a11yViolations,
    a11ySerious,
    a11yCritical,
    ...probe,
  };
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

    step('loading every story from /index.json');
    const stories = await loadAllStories();
    step(
      `walking ${stories.length} stories in batches of ${BATCH_SIZE} (browser rotated per batch)`,
    );

    await fs.ensureDir(SCREENSHOT_DIR);
    await fs.emptyDir(SCREENSHOT_DIR);

    const probes: PageProbeResult[] = [];
    const totalBatches = Math.ceil(stories.length / BATCH_SIZE);

    // hx-button mount probe — runs once with its OWN browser before the
    // main walk so a freshly-bundled storybook is exercised first.
    step('verifying hx-button web component mounts (story canvas)');
    let buttonProbe: { registered: boolean; count: number; hasShadow: boolean } = {
      registered: false,
      count: 0,
      hasShadow: false,
    };
    {
      const probeBrowser = await chromium.launch();
      try {
        const probeCtx = await probeBrowser.newContext({ viewport: { width: 1280, height: 900 } });
        const buttonPage = await probeCtx.newPage();
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
      } finally {
        await probeBrowser.close().catch(() => {});
      }
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

    // Walk every story. Rotate the browser process every BATCH_SIZE pages
    // — Chromium's renderer process leaks resources across Storybook docs
    // navigations and dies after ~5-10 pages on macOS. Fresh browser per
    // batch is the only stable way to cover 200+ entries in one run.
    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const start = batchIdx * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, stories.length);
      const batchStories = stories.slice(start, end);
      step(
        `── batch ${batchIdx + 1}/${totalBatches} (${batchStories.length} pages, ${start + 1}–${end} of ${stories.length}) ──`,
      );

      browser = await chromium.launch();
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

      let crashedMidBatch = false;
      for (let i = 0; i < batchStories.length; i++) {
        const story = batchStories[i];
        const globalIdx = start + i;
        step(
          `  [${globalIdx + 1}/${stories.length}] ${story.viewMode}:${story.id} (${story.title})`,
        );
        let result: PageProbeResult;
        try {
          result = await probePage(ctx, story, globalIdx + 1, stories.length);
        } catch (err) {
          // Browser/context died mid-batch. Record the failure, abort the
          // rest of this batch, and fall through to the next iteration of
          // the outer loop which will spin up a fresh browser.
          crashedMidBatch = true;
          // eslint-disable-next-line no-console
          console.error(
            `[smoke] batch ${batchIdx + 1} crashed at ${story.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          result = {
            storyId: story.id,
            title: story.title,
            viewMode: story.viewMode,
            status: 'crashed',
            consoleErrors: [],
            pageErrors: [`browser-crash: ${err instanceof Error ? err.message : String(err)}`],
            vitePluginErrors: [],
            bodyTextColor: 'crashed',
            bodyBgColor: 'crashed',
            hasContent: false,
            contentSnippet: '',
            screenshotPath: null,
            a11yViolations: [],
            a11ySerious: 0,
            a11yCritical: 0,
          };
          probes.push(result);
          break;
        }
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
        if (result.a11yCritical > 0) {
          const ids = result.a11yViolations
            .filter((v) => v.impact === 'critical')
            .map((v) => v.id)
            .join(', ');
          failures.push({
            check: `a11yCritical ${story.id}`,
            detail: `${result.a11yCritical} critical violation(s): ${ids}`,
          });
        }
      }

      await ctx.close().catch(() => {});
      await browser.close().catch(() => {});
      browser = undefined;
      if (crashedMidBatch) {
        // eslint-disable-next-line no-console
        console.error(`[smoke] batch ${batchIdx + 1} aborted; continuing with next batch`);
      }
    }

    // Brand-prompt assertions on the cover entry
    const cover = probes.find((p) => p.storyId === 'welcome-cover--docs');
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

    // ─── Aggregate report ────────────────────────────────────────────────
    const seriousTotal = probes.reduce((acc, p) => acc + p.a11ySerious, 0);
    const criticalTotal = probes.reduce((acc, p) => acc + p.a11yCritical, 0);
    const okCount = probes.filter((p) => p.status === 'ok').length;
    const emptyCount = probes.filter((p) => p.status === 'empty').length;
    const errorCount = probes.filter((p) => p.status === 'error').length;
    const crashedCount = probes.filter((p) => p.status === 'crashed').length;

    const summary = {
      walkedAt: new Date().toISOString(),
      total: stories.length,
      ok: okCount,
      empty: emptyCount,
      error: errorCount,
      crashed: crashedCount,
      a11ySeriousTotal: seriousTotal,
      a11yCriticalTotal: criticalTotal,
      indexEntries: entryCount,
      failures,
      probes: probes.map((p) => ({
        id: p.storyId,
        title: p.title,
        viewMode: p.viewMode,
        status: p.status,
        consoleErrors: p.consoleErrors.length,
        pageErrors: p.pageErrors.length,
        vitePluginErrors: p.vitePluginErrors.length,
        a11ySerious: p.a11ySerious,
        a11yCritical: p.a11yCritical,
        a11yViolations: p.a11yViolations,
        screenshot: p.screenshotPath,
        contentSnippet: p.contentSnippet.slice(0, 120),
        bodyTextColor: p.bodyTextColor,
        bodyBgColor: p.bodyBgColor,
      })),
    };
    await fs.writeJson(REPORT_PATH, summary, { spaces: 2 });

    step(
      `summary: ${okCount} ok, ${emptyCount} empty, ${errorCount} error, ${crashedCount} crashed | a11y: ${criticalTotal} critical, ${seriousTotal} serious`,
    );
    step(`screenshots: ${SCREENSHOT_DIR}/  |  report: ${REPORT_PATH}`);

    if (failures.length === 0) {
      ok(
        `ALL CHECKS PASSED — ${stories.length} stories walked, ${entryCount} index entries, ${criticalTotal + seriousTotal} a11y issues`,
      );
      await cleanup();
      process.exit(0);
    } else {
      // eslint-disable-next-line no-console
      console.error(`\n[smoke] ✗ ${failures.length} failure(s):\n`);
      const grouped: Record<string, number> = {};
      for (const f of failures) {
        const kind = f.check.split(' ')[0];
        grouped[kind] = (grouped[kind] ?? 0) + 1;
      }
      // eslint-disable-next-line no-console
      console.error(
        `[smoke] failure breakdown: ${Object.entries(grouped)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}\n`,
      );
      // Print first 30 detailed; rest summarized in the JSON report.
      for (const f of failures.slice(0, 30)) {
        fail(f.check, f.detail);
      }
      if (failures.length > 30) {
        // eslint-disable-next-line no-console
        console.error(`[smoke] (... ${failures.length - 30} more in ${REPORT_PATH})`);
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
