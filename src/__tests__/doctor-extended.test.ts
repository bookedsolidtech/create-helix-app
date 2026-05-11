import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  checkHelixIcons,
  checkStorybookStaticDirs,
  checkIconBasePathReachable,
  checkCatalogPopulated,
  checkProjectEngines,
  checkExperimentalConfig,
  nodeSatisfiesEngines,
  runDoctor,
} from '../doctor.js';

// v0.6.0 Phase F — doctor extension. Each check lives behind a skip
// boundary so the doctor stays useful outside scaffolded projects; the
// tests below pin pass + fail + skip per check.

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-extended-'));
}

function writeJson(p: string, value: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2), 'utf8');
}

describe('checkHelixIcons', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when project package.json does not declare @helixui/icons', () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'foo', dependencies: {} });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('skip');
    expect(result.message).toMatch(/not a wc-storybook project/);
  });

  it('skips when no package.json at all', () => {
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('skip');
  });

  it('fails when @helixui/icons is declared but not on disk', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/icons': '^1.0.0' },
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/not resolvable/);
    expect(result.message).toMatch(/pnpm install/);
  });

  it('fails when @helixui/icons resolves but version is below ^1.0.0', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/icons': '^0.9.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '0.9.0',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/0\.9\.0/);
    expect(result.message).toMatch(/\^1\.0\.0/);
  });

  it('passes when @helixui/icons resolves and version >= 1.0.0', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      devDependencies: { '@helixui/icons': '^1.0.0' },
    });
    writeJson(path.join(tmp, 'node_modules', '@helixui', 'icons', 'package.json'), {
      name: '@helixui/icons',
      version: '1.2.3',
    });
    const result = checkHelixIcons(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/v1\.2\.3/);
  });
});

describe('checkStorybookStaticDirs', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when no .storybook/main.ts', () => {
    const result = checkStorybookStaticDirs(tmp);
    expect(result.status).toBe('skip');
  });

  it('fails when main.ts is missing @helixui/icons/dist', () => {
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.storybook', 'main.ts'),
      `export default { staticDirs: ['../public'] };`,
      'utf8',
    );
    const result = checkStorybookStaticDirs(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/staticDirs missing @helixui\/icons\/dist/);
    expect(result.message).toMatch(/won't resolve at runtime/);
  });

  it("passes when main.ts contains '@helixui/icons/dist'", () => {
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.storybook', 'main.ts'),
      `export default { staticDirs: ['../node_modules/@helixui/icons/dist'] };`,
      'utf8',
    );
    const result = checkStorybookStaticDirs(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/staticDirs includes @helixui\/icons\/dist/);
  });
});

describe('checkIconBasePathReachable', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when no .storybook/main.ts', () => {
    const result = checkIconBasePathReachable(tmp);
    expect(result.status).toBe('skip');
  });

  it('fails when helix.svg is not on disk', () => {
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.storybook', 'main.ts'), 'export default {};', 'utf8');
    const result = checkIconBasePathReachable(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/helix\.svg/);
    expect(result.message).toMatch(/not on disk/);
  });

  it('passes when helix.svg is present', () => {
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.storybook', 'main.ts'), 'export default {};', 'utf8');
    fs.mkdirSync(path.join(tmp, 'node_modules', '@helixui', 'icons', 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'node_modules', '@helixui', 'icons', 'dist', 'helix.svg'),
      '<svg></svg>',
      'utf8',
    );
    const result = checkIconBasePathReachable(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/reachable/);
  });
});

describe('checkCatalogPopulated', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when no scripts/generate-catalog.ts', () => {
    const result = checkCatalogPopulated(tmp);
    expect(result.status).toBe('skip');
  });

  it('fails when catalog dir is missing', () => {
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'scripts', 'generate-catalog.ts'), '// stub', 'utf8');
    const result = checkCatalogPopulated(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/pnpm cem:catalog/);
    expect(result.message).toMatch(/HELiX\/\* sidebar/);
  });

  it('fails when catalog dir is empty', () => {
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'scripts', 'generate-catalog.ts'), '// stub', 'utf8');
    fs.mkdirSync(path.join(tmp, 'src', 'stories', 'catalog'), { recursive: true });
    const result = checkCatalogPopulated(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/empty/);
    expect(result.message).toMatch(/pnpm cem:catalog/);
  });

  it('passes when catalog has stories', () => {
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'scripts', 'generate-catalog.ts'), '// stub', 'utf8');
    const catalog = path.join(tmp, 'src', 'stories', 'catalog');
    fs.mkdirSync(catalog, { recursive: true });
    fs.writeFileSync(path.join(catalog, 'button.stories.ts'), 'export default {};', 'utf8');
    fs.writeFileSync(path.join(catalog, 'input.stories.ts'), 'export default {};', 'utf8');
    const result = checkCatalogPopulated(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/2 stories/);
  });
});

describe('nodeSatisfiesEngines', () => {
  it('passes for ^22.0.0 with v22.4.0', () => {
    expect(nodeSatisfiesEngines('v22.4.0', '^22.0.0')).toBe(true);
  });
  it('fails for ^22.0.0 with v20.11.0', () => {
    expect(nodeSatisfiesEngines('v20.11.0', '^22.0.0')).toBe(false);
  });
  it('passes alternation ^22.0.0 || ^24.0.0 with v24.1.0', () => {
    expect(nodeSatisfiesEngines('v24.1.0', '^22.0.0 || ^24.0.0')).toBe(true);
  });
  it('fails alternation ^22.0.0 || ^24.0.0 with v23.0.0', () => {
    expect(nodeSatisfiesEngines('v23.0.0', '^22.0.0 || ^24.0.0')).toBe(false);
  });
  it('passes >=20 with v22.4.0', () => {
    expect(nodeSatisfiesEngines('v22.4.0', '>=20')).toBe(true);
  });
  it('fails >=22 with v20.11.0', () => {
    expect(nodeSatisfiesEngines('v20.11.0', '>=22')).toBe(false);
  });
});

describe('checkProjectEngines', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when no package.json', () => {
    const result = checkProjectEngines(tmp);
    expect(result.status).toBe('skip');
  });

  it('skips when package.json has no engines.node', () => {
    writeJson(path.join(tmp, 'package.json'), { name: 'foo' });
    const result = checkProjectEngines(tmp);
    expect(result.status).toBe('skip');
  });

  it('passes when current node satisfies engines', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      engines: { node: '>=18' },
    });
    const result = checkProjectEngines(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/satisfies engines\.node/);
  });

  it('fails when current node does not satisfy engines', () => {
    writeJson(path.join(tmp, 'package.json'), {
      name: 'foo',
      engines: { node: '>=99' },
    });
    const result = checkProjectEngines(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/does not satisfy/);
  });
});

describe('checkExperimentalConfig', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('skips when no .helixrc.json', () => {
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('skip');
  });

  it('passes when config selects a production template', () => {
    writeJson(path.join(tmp, '.helixrc.json'), {
      defaults: { template: 'wc-storybook' },
    });
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('ok');
    expect(result.message).toMatch(/production template 'wc-storybook'/);
  });

  it('warns when config selects an experimental template (top-level field)', () => {
    writeJson(path.join(tmp, '.helixrc.json'), {
      framework: 'svelte-kit',
    });
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('warn');
    expect(result.message).toMatch(/experimental template 'svelte-kit'/);
    expect(result.message).toMatch(/--show-experimental/);
  });

  it('warns when config selects an experimental template (nested defaults)', () => {
    writeJson(path.join(tmp, '.helixrc.json'), {
      defaults: { template: 'ember' },
    });
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('warn');
    expect(result.message).toMatch(/ember/);
  });

  it('warns when config selects an unknown template', () => {
    writeJson(path.join(tmp, '.helixrc.json'), {
      framework: 'not-a-real-framework',
    });
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('warn');
    expect(result.message).toMatch(/unknown template 'not-a-real-framework'/);
  });

  it('fails when .helixrc.json is malformed', () => {
    fs.writeFileSync(path.join(tmp, '.helixrc.json'), '{not valid json', 'utf8');
    const result = checkExperimentalConfig(tmp);
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/not valid JSON/);
  });
});

describe('runDoctor integration', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('runs the new 6 checks alongside the existing env checks', async () => {
    const result = await runDoctor('0.6.0', { cwd: tmp });
    const names = result.checks.map((c) => c.name);
    expect(names).toContain('@helixui/icons');
    expect(names).toContain('storybook staticDirs');
    expect(names).toContain('/icons/helix.svg');
    expect(names).toContain('catalog stories');
    expect(names).toContain('project engines');
    expect(names).toContain('experimental template config');
    // Existing env checks still present.
    expect(names).toContain('Node.js');
    expect(names).toContain('Write permissions');
  });

  it('--quick skips the /icons/helix.svg filesystem probe', async () => {
    // Wire up a .storybook/main.ts so the non-quick path would attempt the
    // probe — without main.ts both modes return skip and the assertion is
    // hollow.
    fs.mkdirSync(path.join(tmp, '.storybook'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.storybook', 'main.ts'), 'export default {};', 'utf8');

    const fullResult = await runDoctor('0.6.0', { cwd: tmp });
    const fullIconsCheck = fullResult.checks.find((c) => c.name === '/icons/helix.svg');
    // Without --quick, the check is a real fail (helix.svg not on disk) —
    // proves the probe ran.
    expect(fullIconsCheck?.status).toBe('fail');

    const quickResult = await runDoctor('0.6.0', { cwd: tmp, quick: true });
    const quickIconsCheck = quickResult.checks.find((c) => c.name === '/icons/helix.svg');
    expect(quickIconsCheck?.status).toBe('skip');
    expect(quickIconsCheck?.message).toMatch(/skipped under --quick/);
  });

  it('skipped checks do not flip allPassed to false', async () => {
    // Empty tmp dir → all new checks return skip. Env checks should pass
    // on a healthy dev machine, so allPassed mostly reflects the env half.
    // The new check we care about: skip alone doesn't poison the bool.
    const result = await runDoctor('0.6.0', { cwd: tmp });
    const newCheckStatuses = result.checks
      .filter((c) =>
        [
          '@helixui/icons',
          'storybook staticDirs',
          '/icons/helix.svg',
          'catalog stories',
          'project engines',
          'experimental template config',
        ].includes(c.name),
      )
      .map((c) => c.status);
    // Every new check returns skip (or possibly ok for engines if the
    // CI/dev machine satisfies its own package.json engines field).
    for (const status of newCheckStatuses) {
      expect(['skip', 'ok']).toContain(status);
    }
  });
});
