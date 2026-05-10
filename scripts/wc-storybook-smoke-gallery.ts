#!/usr/bin/env tsx
/**
 * Generate a single HTML gallery from a smoke-runner JSON report and the
 * /tmp/helix-smoke-screenshots/ directory.
 *
 * The smoke runner emits /tmp/helix-smoke-report.json (per-page status,
 * console errors, a11y violations) plus one PNG per probed page. This
 * script joins those into a single static HTML page so the user can
 * scroll the entire scaffolded design system in one tab and SEE every
 * component.
 *
 * Run after a smoke pass:
 *
 *   npx tsx scripts/wc-storybook-smoke-gallery.ts
 *   open /tmp/helix-smoke-gallery.html
 *
 * Env knobs (mirror the runner's):
 *   REPORT_PATH      — JSON report path     (default /tmp/helix-smoke-report.json)
 *   SCREENSHOT_DIR   — PNGs directory       (default /tmp/helix-smoke-screenshots)
 *   GALLERY_PATH     — output HTML path     (default /tmp/helix-smoke-gallery.html)
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const REPORT_PATH = process.env.REPORT_PATH ?? '/tmp/helix-smoke-report.json';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? '/tmp/helix-smoke-screenshots';
const GALLERY_PATH = process.env.GALLERY_PATH ?? '/tmp/helix-smoke-gallery.html';

interface ProbeSummary {
  id: string;
  title: string;
  viewMode: 'docs' | 'story';
  status: 'ok' | 'empty' | 'error' | 'crashed';
  consoleErrors: number;
  pageErrors: number;
  vitePluginErrors: number;
  a11ySerious: number;
  a11yCritical: number;
  a11yViolations: Array<{ id: string; impact: string | null; description: string; nodes: number }>;
  screenshot: string | null;
  contentSnippet: string;
  bodyTextColor: string;
  bodyBgColor: string;
}

interface Report {
  walkedAt: string;
  total: number;
  ok: number;
  empty: number;
  error: number;
  crashed: number;
  a11ySeriousTotal: number;
  a11yCriticalTotal: number;
  indexEntries: number;
  failures: Array<{ check: string; detail: string }>;
  probes: ProbeSummary[];
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(status: ProbeSummary['status']): string {
  const colors = {
    ok: '#10b981',
    empty: '#f59e0b',
    error: '#ef4444',
    crashed: '#7f1d1d',
  } as const;
  return `<span class="badge" style="background:${colors[status]}">${status}</span>`;
}

async function main(): Promise<void> {
  const report = JSON.parse(await fs.readFile(REPORT_PATH, 'utf8')) as Report;

  // Group probes by storybook section (slash-separated title prefix).
  const grouped = new Map<string, ProbeSummary[]>();
  for (const probe of report.probes) {
    const section = probe.title.split('/')[0] || 'Other';
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section)!.push(probe);
  }
  const sections = Array.from(grouped.keys()).sort();

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>wc-storybook smoke gallery — ${report.total} pages</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; padding: 1.5rem; background: #fafafa; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1117; color: #e6edf3; }
    .card { background: #161b22; }
    .card-meta { color: #8b949e; }
    nav { background: #161b22; border-color: #30363d; }
    nav a { color: #58a6ff; }
    .errors { background: #2d1010; border-color: #ef4444; }
  }
  h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
  .summary { display: flex; gap: 1.5rem; flex-wrap: wrap; padding: 1rem 1.25rem; background: #fff; border-radius: 8px; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  @media (prefers-color-scheme: dark) { .summary { background: #161b22; } }
  .summary-item { font-size: 0.9rem; }
  .summary-item strong { display: block; font-size: 1.6rem; margin-bottom: 2px; }
  nav { position: sticky; top: 0; z-index: 10; background: #fff; padding: 0.75rem 1rem; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap; }
  nav a { color: #0066cc; text-decoration: none; padding: 0.25rem 0.5rem; border-radius: 4px; }
  nav a:hover { background: rgba(0,102,204,0.1); }
  section { margin-bottom: 2.5rem; }
  section h2 { font-size: 1.2rem; margin: 0 0 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid currentColor; opacity: 0.85; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1.25rem; }
  .card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: flex; flex-direction: column; }
  .card img { width: 100%; height: auto; display: block; background: #fafafa; border-bottom: 1px solid #e0e0e0; }
  .card-body { padding: 0.75rem 1rem; }
  .card-title { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.25rem; }
  .card-meta { font-size: 0.75rem; color: #666; margin: 0; word-break: break-all; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 0.7rem; color: white; font-weight: 600; text-transform: uppercase; }
  .badges { display: flex; gap: 0.4rem; align-items: center; margin-top: 0.5rem; flex-wrap: wrap; }
  .badge-warn { background: #f59e0b; }
  .badge-error { background: #ef4444; }
  .errors { background: #fff5f5; border: 1px solid #ef4444; padding: 0.5rem 0.75rem; margin-top: 0.5rem; border-radius: 4px; font-size: 0.75rem; font-family: ui-monospace, monospace; }
  details summary { cursor: pointer; user-select: none; }
</style>
</head>
<body>
  <h1>wc-storybook smoke gallery — ${report.total} pages</h1>
  <div class="summary">
    <div class="summary-item"><strong>${report.ok}</strong>ok</div>
    <div class="summary-item"><strong style="color:#f59e0b">${report.empty}</strong>empty</div>
    <div class="summary-item"><strong style="color:#ef4444">${report.error}</strong>error</div>
    <div class="summary-item"><strong style="color:#7f1d1d">${report.crashed}</strong>crashed</div>
    <div class="summary-item"><strong style="color:#7f1d1d">${report.a11yCriticalTotal}</strong>a11y critical</div>
    <div class="summary-item"><strong style="color:#f59e0b">${report.a11ySeriousTotal}</strong>a11y serious</div>
    <div class="summary-item"><strong>${report.indexEntries}</strong>index entries</div>
    <div class="summary-item" style="margin-left:auto"><strong>${escape(new Date(report.walkedAt).toLocaleString())}</strong>walked at</div>
  </div>
  <nav>
    ${sections.map((s) => `<a href="#${escape(s.replace(/\s+/g, '-'))}">${escape(s)} (${grouped.get(s)!.length})</a>`).join('')}
  </nav>
`;

  for (const section of sections) {
    const probes = grouped.get(section)!;
    html += `  <section id="${escape(section.replace(/\s+/g, '-'))}">\n    <h2>${escape(section)} <span style="font-weight:400;font-size:0.85rem;opacity:0.7">(${probes.length})</span></h2>\n    <div class="grid">\n`;
    for (const probe of probes) {
      const screenshotName = probe.screenshot ? path.basename(probe.screenshot) : null;
      const imgSrc = screenshotName ? `screenshots/${screenshotName}` : '';
      html += `      <div class="card">
`;
      if (imgSrc) {
        html += `        <img src="${escape(imgSrc)}" alt="${escape(probe.title)}" loading="lazy">\n`;
      }
      html += `        <div class="card-body">
          <div class="card-title">${escape(probe.title)}</div>
          <p class="card-meta">${escape(probe.viewMode)} · <code>${escape(probe.id)}</code></p>
          <div class="badges">
            ${statusBadge(probe.status)}
            ${probe.a11yCritical > 0 ? `<span class="badge badge-error">a11y critical ${probe.a11yCritical}</span>` : ''}
            ${probe.a11ySerious > 0 ? `<span class="badge badge-warn">a11y serious ${probe.a11ySerious}</span>` : ''}
            ${probe.consoleErrors > 0 ? `<span class="badge badge-error">console ${probe.consoleErrors}</span>` : ''}
            ${probe.pageErrors > 0 ? `<span class="badge badge-error">pageerror ${probe.pageErrors}</span>` : ''}
          </div>`;
      if (probe.a11yViolations.length > 0) {
        html += `\n          <details class="errors"><summary>${probe.a11yViolations.length} a11y violations</summary><ul>`;
        for (const v of probe.a11yViolations) {
          html += `<li><strong>${escape(v.id)}</strong> [${escape(v.impact ?? 'n/a')}] (${v.nodes} nodes) — ${escape(v.description)}</li>`;
        }
        html += `</ul></details>`;
      }
      html += `\n        </div>\n      </div>\n`;
    }
    html += `    </div>\n  </section>\n`;
  }
  html += `</body>\n</html>\n`;

  // Copy screenshots into a sibling directory next to the HTML so it's a
  // self-contained artifact users can move around. Skip if HTML output is
  // already next to the screenshots directory.
  const galleryDir = path.dirname(GALLERY_PATH);
  const sidecarDir = path.join(galleryDir, 'screenshots');
  if (path.resolve(SCREENSHOT_DIR) !== path.resolve(sidecarDir)) {
    await fs.mkdir(sidecarDir, { recursive: true });
    const files = await fs.readdir(SCREENSHOT_DIR);
    for (const f of files) {
      if (f.endsWith('.png')) {
        await fs.copyFile(path.join(SCREENSHOT_DIR, f), path.join(sidecarDir, f));
      }
    }
  }
  await fs.writeFile(GALLERY_PATH, html, 'utf8');
  // eslint-disable-next-line no-console
  console.log(
    `gallery written: ${GALLERY_PATH} (${report.probes.length} cards across ${sections.length} sections)`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('gallery build failed:', err);
  process.exit(1);
});
