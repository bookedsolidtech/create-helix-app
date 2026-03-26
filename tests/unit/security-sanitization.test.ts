import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { sanitizeForHtml } from '../../src/scaffold.js';
import { scaffoldProject } from '../../src/scaffold.js';
import type { ProjectOptions } from '../../src/types.js';

const TEST_DIR = '/tmp/helix-test-security';

function makeOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name: 'test-app',
    directory: path.join(TEST_DIR, overrides.name ?? 'test-app'),
    framework: 'react-vite',
    componentBundles: ['core'],
    typescript: true,
    eslint: false,
    designTokens: false,
    darkMode: false,
    installDeps: false,
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(TEST_DIR);
});

afterAll(async () => {
  await fs.remove(TEST_DIR);
});

// ─── sanitizeForHtml unit tests ─────────────────────────────────────────────

describe('sanitizeForHtml', () => {
  it('encodes angle brackets', () => {
    expect(sanitizeForHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('encodes ampersands', () => {
    expect(sanitizeForHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('encodes double quotes', () => {
    expect(sanitizeForHtml('a "quoted" value')).toBe('a &quot;quoted&quot; value');
  });

  it('encodes single quotes', () => {
    expect(sanitizeForHtml("it's")).toBe('it&#39;s');
  });

  it('encodes all dangerous characters together', () => {
    expect(sanitizeForHtml('<img src="x" onerror=\'alert(1)\'>&')).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;',
    );
  });

  it('returns safe strings unchanged', () => {
    expect(sanitizeForHtml('my-project-123')).toBe('my-project-123');
  });

  it('handles empty string', () => {
    expect(sanitizeForHtml('')).toBe('');
  });
});

// ─── CSP meta tag in generated HTML ─────────────────────────────────────────

describe('CSP meta tag in generated index.html', () => {
  it('react-vite index.html contains CSP meta tag', async () => {
    const opts = makeOptions({ name: 'csp-react', framework: 'react-vite' });
    await scaffoldProject(opts);

    const html = await fs.readFile(path.join(opts.directory, 'index.html'), 'utf-8');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('vanilla index.html contains CSP meta tag', async () => {
    const opts = makeOptions({ name: 'csp-vanilla', framework: 'vanilla' });
    await scaffoldProject(opts);

    const html = await fs.readFile(path.join(opts.directory, 'index.html'), 'utf-8');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'self'");
  });

  it('vue-vite index.html contains CSP meta tag', async () => {
    const opts = makeOptions({ name: 'csp-vue', framework: 'vue-vite' });
    await scaffoldProject(opts);

    const html = await fs.readFile(path.join(opts.directory, 'index.html'), 'utf-8');
    expect(html).toContain('Content-Security-Policy');
  });

  it('solid-vite index.html contains CSP meta tag', async () => {
    const opts = makeOptions({ name: 'csp-solid', framework: 'solid-vite' });
    await scaffoldProject(opts);

    const html = await fs.readFile(path.join(opts.directory, 'index.html'), 'utf-8');
    expect(html).toContain('Content-Security-Policy');
  });
});

// ─── Sanitized project names in HTML output ─────────────────────────────────

describe('project name sanitization in generated HTML', () => {
  it('project name with angle brackets is encoded in title', async () => {
    // NOTE: Real project names are validated to be safe, but sanitizeForHtml
    // provides defense-in-depth for programmatic API callers.
    const opts = makeOptions({
      name: 'test<xss>app',
      framework: 'vanilla',
    });
    await scaffoldProject(opts);

    const html = await fs.readFile(path.join(opts.directory, 'index.html'), 'utf-8');
    expect(html).toContain('<title>test&lt;xss&gt;app</title>');
    expect(html).not.toContain('<title>test<xss>app</title>');
  });

  it('project name with ampersand is encoded in title', async () => {
    const opts = makeOptions({
      name: 'foo&bar',
      framework: 'react-vite',
    });
    await scaffoldProject(opts);

    const html = await fs.readFile(path.join(opts.directory, 'index.html'), 'utf-8');
    expect(html).toContain('<title>foo&amp;bar</title>');
  });

  it('project name with quotes is encoded in title', async () => {
    const opts = makeOptions({
      name: 'my"app',
      framework: 'vue-vite',
    });
    await scaffoldProject(opts);

    const html = await fs.readFile(path.join(opts.directory, 'index.html'), 'utf-8');
    expect(html).toContain('<title>my&quot;app</title>');
  });
});
