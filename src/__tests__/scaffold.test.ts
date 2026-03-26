import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { scaffoldProject } from '../scaffold.js';
import type { ProjectOptions } from '../types.js';

const TEST_DIR = '/tmp/helix-test-scaffold';

function makeOptions(overrides: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name: 'test-app',
    directory: path.join(TEST_DIR, overrides.name ?? 'test-app'),
    framework: 'react-next',
    componentBundles: ['all'],
    typescript: true,
    eslint: true,
    designTokens: true,
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

// ─── Core scaffolding behavior ───────────────────────────────────────────────

describe('scaffoldProject — core', () => {
  it('creates the project directory', async () => {
    const opts = makeOptions({ name: 'dir-test' });
    await scaffoldProject(opts);
    expect(await fs.pathExists(opts.directory)).toBe(true);
  });

  it('throws for unknown framework', async () => {
    const opts = makeOptions({
      name: 'bad-framework',
      framework: 'ember' as ProjectOptions['framework'],
    });
    await expect(scaffoldProject(opts)).rejects.toThrow('Unknown framework: ember');
  });

  it('generates package.json with correct name', async () => {
    const opts = makeOptions({ name: 'pkg-name-test' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.name).toBe('pkg-name-test');
  });

  it('generates README.md', async () => {
    const opts = makeOptions({ name: 'readme-test' });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'README.md'))).toBe(true);
  });

  it('generates .gitignore', async () => {
    const opts = makeOptions({ name: 'gitignore-test' });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, '.gitignore'))).toBe(true);
  });

  it('generates helix-setup file in src/', async () => {
    const opts = makeOptions({ name: 'setup-test' });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'src', 'helix-setup.ts'))).toBe(true);
  });

  it('generates .js helix-setup when typescript is false', async () => {
    const opts = makeOptions({ name: 'js-setup-test', typescript: false });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'src', 'helix-setup.js'))).toBe(true);
  });
});

// ─── Optional features (designTokens, eslint, typescript) ────────────────────

describe('scaffoldProject — optional features', () => {
  it('generates helix-tokens.css when designTokens is true', async () => {
    const opts = makeOptions({ name: 'tokens-true' });
    await scaffoldProject(opts);
    const tokensPath = path.join(opts.directory, 'helix-tokens.css');
    expect(await fs.pathExists(tokensPath)).toBe(true);
    const content = await fs.readFile(tokensPath, 'utf-8');
    expect(content).toContain('@import');
    expect(content).toContain('--hx-color-primary');
  });

  it('does NOT generate helix-tokens.css when designTokens is false', async () => {
    const opts = makeOptions({ name: 'tokens-false', designTokens: false });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'helix-tokens.css'))).toBe(false);
  });

  it('includes dark mode section in tokens when darkMode is true', async () => {
    const opts = makeOptions({ name: 'dark-mode', darkMode: true });
    await scaffoldProject(opts);
    const content = await fs.readFile(path.join(opts.directory, 'helix-tokens.css'), 'utf-8');
    expect(content).toContain('prefers-color-scheme: dark');
    expect(content).toContain('data-theme="dark"');
  });

  it('generates eslint.config.js when eslint is true', async () => {
    const opts = makeOptions({ name: 'eslint-true' });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'eslint.config.js'))).toBe(true);
  });

  it('generates .prettierrc when eslint is true', async () => {
    const opts = makeOptions({ name: 'prettier-true' });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, '.prettierrc'))).toBe(true);
  });

  it('does NOT generate eslint.config.js when eslint is false', async () => {
    const opts = makeOptions({ name: 'eslint-false', eslint: false });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'eslint.config.js'))).toBe(false);
  });

  it('generates tsconfig.json for non-next frameworks when typescript is true', async () => {
    const opts = makeOptions({ name: 'ts-vue', framework: 'vue-vite' });
    await scaffoldProject(opts);
    const tsconfigPath = path.join(opts.directory, 'tsconfig.json');
    expect(await fs.pathExists(tsconfigPath)).toBe(true);
    const tsconfig = await fs.readJson(tsconfigPath);
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('does NOT generate tsconfig.json when typescript is false', async () => {
    // Use vanilla which has no framework-specific tsconfig generation
    const opts = makeOptions({
      name: 'no-ts',
      framework: 'vanilla',
      typescript: false,
    });
    await scaffoldProject(opts);
    expect(await fs.pathExists(path.join(opts.directory, 'tsconfig.json'))).toBe(false);
  });
});

// ─── React + Next.js ─────────────────────────────────────────────────────────

describe('scaffoldProject — react-next', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'next-app', framework: 'react-next' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'next.config.ts',
      'tsconfig.json',
      'src/app/page.tsx',
      'src/app/layout.tsx',
      'src/app/globals.css',
      'src/components/helix/wrappers.tsx',
      'src/components/helix/provider.tsx',
      'src/helix.d.ts',
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('package.json has next scripts', async () => {
    const opts = makeOptions({ name: 'next-scripts', framework: 'react-next' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('next dev');
    expect(pkg.scripts.build).toBe('next build');
    expect(pkg.scripts.start).toBe('next start');
  });

  it('package.json includes react and next dependencies', async () => {
    const opts = makeOptions({ name: 'next-deps', framework: 'react-next' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.dependencies['next']).toBeDefined();
    expect(pkg.dependencies['react']).toBeDefined();
    expect(pkg.dependencies['react-dom']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies['@lit/react']).toBeDefined();
  });

  it('react-next generates its own tsconfig (not the generic one)', async () => {
    const opts = makeOptions({ name: 'next-tsconfig', framework: 'react-next' });
    await scaffoldProject(opts);
    const tsconfig = await fs.readJson(path.join(opts.directory, 'tsconfig.json'));
    // Next.js tsconfig has 'next' plugin
    expect(tsconfig.compilerOptions.plugins).toBeDefined();
    expect(tsconfig.compilerOptions.plugins[0].name).toBe('next');
  });
});

// ─── React + Vite ────────────────────────────────────────────────────────────

describe('scaffoldProject — react-vite', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'react-vite-app', framework: 'react-vite' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'vite.config.ts',
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/index.css',
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('package.json has vite scripts', async () => {
    const opts = makeOptions({ name: 'rv-scripts', framework: 'react-vite' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('vite');
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.preview).toBe('vite preview');
  });
});

// ─── Vue + Vite ──────────────────────────────────────────────────────────────

describe('scaffoldProject — vue-vite', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'vue-vite-app', framework: 'vue-vite' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'vite.config.ts',
      'index.html',
      'src/main.ts',
      'src/App.vue',
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('vite.config.ts configures custom element detection for hx-*', async () => {
    const opts = makeOptions({ name: 'vue-ce', framework: 'vue-vite' });
    await scaffoldProject(opts);
    const viteConfig = await fs.readFile(path.join(opts.directory, 'vite.config.ts'), 'utf-8');
    expect(viteConfig).toContain('isCustomElement');
    expect(viteConfig).toContain('hx-');
  });

  it('package.json has vite scripts', async () => {
    const opts = makeOptions({ name: 'vv-scripts', framework: 'vue-vite' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('vite');
    expect(pkg.scripts.build).toBe('vite build');
  });
});

// ─── SvelteKit ───────────────────────────────────────────────────────────────

describe('scaffoldProject — svelte-kit', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'svelte-app', framework: 'svelte-kit' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'svelte.config.js',
      'vite.config.ts',
      'src/routes/+page.svelte',
      'src/routes/+layout.svelte',
      'src/app.html',
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('package.json has sveltekit scripts', async () => {
    const opts = makeOptions({ name: 'sk-scripts', framework: 'svelte-kit' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('vite dev');
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.preview).toBe('vite preview');
  });

  it('svelte.config.js uses adapter-auto', async () => {
    const opts = makeOptions({ name: 'sk-adapter', framework: 'svelte-kit' });
    await scaffoldProject(opts);
    const config = await fs.readFile(path.join(opts.directory, 'svelte.config.js'), 'utf-8');
    expect(config).toContain('@sveltejs/adapter-auto');
  });
});

// ─── Angular ─────────────────────────────────────────────────────────────────

describe('scaffoldProject — angular', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'angular-app', framework: 'angular' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'angular.json',
      'src/index.html',
      'src/main.ts',
      'src/styles.css',
      'src/app/app.component.ts',
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('angular.json references the project name', async () => {
    const opts = makeOptions({ name: 'ng-proj', framework: 'angular' });
    await scaffoldProject(opts);
    const angularJson = await fs.readJson(path.join(opts.directory, 'angular.json'));
    expect(angularJson.projects['ng-proj']).toBeDefined();
    expect(angularJson.projects['ng-proj'].projectType).toBe('application');
  });

  it('app.component.ts uses CUSTOM_ELEMENTS_SCHEMA', async () => {
    const opts = makeOptions({ name: 'ng-schema', framework: 'angular' });
    await scaffoldProject(opts);
    const component = await fs.readFile(
      path.join(opts.directory, 'src', 'app', 'app.component.ts'),
      'utf-8',
    );
    expect(component).toContain('CUSTOM_ELEMENTS_SCHEMA');
  });

  it('package.json has angular scripts', async () => {
    const opts = makeOptions({ name: 'ng-scripts', framework: 'angular' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('ng serve');
    expect(pkg.scripts.build).toBe('ng build');
  });
});

// ─── Vanilla ─────────────────────────────────────────────────────────────────

describe('scaffoldProject — vanilla', () => {
  it('generates index.html with CDN links', async () => {
    const opts = makeOptions({ name: 'vanilla-app', framework: 'vanilla' });
    await scaffoldProject(opts);

    const htmlPath = path.join(opts.directory, 'index.html');
    expect(await fs.pathExists(htmlPath)).toBe(true);

    const html = await fs.readFile(htmlPath, 'utf-8');
    expect(html).toContain('cdn.jsdelivr.net');
    expect(html).toContain('@helixui/library');
    expect(html).toContain('@helixui/tokens');
  });

  it('package.json has http-server dev script', async () => {
    const opts = makeOptions({ name: 'vanilla-scripts', framework: 'vanilla' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toContain('http-server');
  });

  it('vanilla template has no build step dependencies', async () => {
    const opts = makeOptions({
      name: 'vanilla-deps',
      framework: 'vanilla',
      eslint: false,
      typescript: false,
      designTokens: false,
    });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    // Vanilla framework has empty dependencies in template
    // (designTokens is false so no @helixui/tokens added)
    expect(Object.keys(pkg.dependencies)).toHaveLength(0);
  });
});

// ─── Astro ───────────────────────────────────────────────────────────────────

describe('scaffoldProject — astro', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'astro-app', framework: 'astro' });
    await scaffoldProject(opts);

    const expectedFiles = ['package.json', 'astro.config.mjs', 'src/pages/index.astro'];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('package.json has astro scripts', async () => {
    const opts = makeOptions({ name: 'astro-scripts', framework: 'astro' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('astro dev');
    expect(pkg.scripts.build).toBe('astro build');
    expect(pkg.scripts.preview).toBe('astro preview');
  });

  it('index.astro imports @helixui/library', async () => {
    const opts = makeOptions({ name: 'astro-import', framework: 'astro' });
    await scaffoldProject(opts);
    const page = await fs.readFile(
      path.join(opts.directory, 'src', 'pages', 'index.astro'),
      'utf-8',
    );
    expect(page).toContain('@helixui/library');
  });
});

// ─── Vue + Nuxt ──────────────────────────────────────────────────────────────

describe('scaffoldProject — vue-nuxt', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'nuxt-app', framework: 'vue-nuxt' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'nuxt.config.ts',
      'plugins/helix.client.ts',
      'app/app.vue',
      'app/pages/index.vue',
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('nuxt.config.ts configures custom element detection', async () => {
    const opts = makeOptions({ name: 'nuxt-ce', framework: 'vue-nuxt' });
    await scaffoldProject(opts);
    const config = await fs.readFile(path.join(opts.directory, 'nuxt.config.ts'), 'utf-8');
    expect(config).toContain('isCustomElement');
    expect(config).toContain('hx-');
  });

  it('helix plugin imports @helixui/library', async () => {
    const opts = makeOptions({ name: 'nuxt-plugin', framework: 'vue-nuxt' });
    await scaffoldProject(opts);
    const plugin = await fs.readFile(
      path.join(opts.directory, 'plugins', 'helix.client.ts'),
      'utf-8',
    );
    expect(plugin).toContain('@helixui/library');
  });

  it('package.json has nuxt scripts', async () => {
    const opts = makeOptions({ name: 'nuxt-scripts', framework: 'vue-nuxt' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('nuxt dev');
    expect(pkg.scripts.build).toBe('nuxt build');
    expect(pkg.scripts.preview).toBe('nuxt preview');
  });
});

// ─── Remix ───────────────────────────────────────────────────────────────────

describe('scaffoldProject — remix', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'remix-app', framework: 'remix' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'vite.config.ts',
      'react-router.config.ts',
      'tsconfig.json',
      'app/routes.ts',
      'app/root.tsx',
      'app/routes/_index.tsx',
      'app/styles/globals.css',
      'app/components/helix/wrappers.tsx',
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('package.json has react-router scripts', async () => {
    const opts = makeOptions({ name: 'remix-scripts', framework: 'remix' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('react-router dev');
    expect(pkg.scripts.build).toBe('react-router build');
    expect(pkg.scripts.start).toBe('react-router-serve ./build/server/index.js');
  });

  it('package.json includes react-router and react dependencies', async () => {
    const opts = makeOptions({ name: 'remix-deps', framework: 'remix' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.dependencies['react-router']).toBeDefined();
    expect(pkg.dependencies['@react-router/node']).toBeDefined();
    expect(pkg.dependencies['react']).toBeDefined();
    expect(pkg.dependencies['react-dom']).toBeDefined();
    expect(pkg.dependencies['@helixui/library']).toBeDefined();
    expect(pkg.dependencies['@lit/react']).toBeDefined();
  });

  it('package.json has @react-router/dev in devDependencies', async () => {
    const opts = makeOptions({ name: 'remix-devdeps', framework: 'remix' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.devDependencies['@react-router/dev']).toBeDefined();
    expect(pkg.devDependencies['@react-router/serve']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
    expect(pkg.devDependencies['typescript']).toBeDefined();
  });

  it('vite.config.ts uses @react-router/dev/vite plugin', async () => {
    const opts = makeOptions({ name: 'remix-vite', framework: 'remix' });
    await scaffoldProject(opts);
    const viteConfig = await fs.readFile(path.join(opts.directory, 'vite.config.ts'), 'utf-8');
    expect(viteConfig).toContain('@react-router/dev/vite');
    expect(viteConfig).toContain('reactRouter()');
  });

  it('app/routes.ts uses @react-router/fs-routes for file-based routing', async () => {
    const opts = makeOptions({ name: 'remix-routes', framework: 'remix' });
    await scaffoldProject(opts);
    const routes = await fs.readFile(path.join(opts.directory, 'app', 'routes.ts'), 'utf-8');
    expect(routes).toContain('@react-router/fs-routes');
    expect(routes).toContain('flatRoutes()');
    expect(routes).toContain('RouteConfig');
  });

  it('package.json has @react-router/fs-routes in devDependencies', async () => {
    const opts = makeOptions({ name: 'remix-fsroutes', framework: 'remix' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.devDependencies['@react-router/fs-routes']).toBeDefined();
  });

  it('app/root.tsx contains Outlet and HELiX styles', async () => {
    const opts = makeOptions({ name: 'remix-root', framework: 'remix' });
    await scaffoldProject(opts);
    const root = await fs.readFile(path.join(opts.directory, 'app', 'root.tsx'), 'utf-8');
    expect(root).toContain('Outlet');
    expect(root).toContain("from 'react-router'");
    expect(root).toContain('globals.css');
  });

  it('app/routes/_index.tsx imports HELiX React wrappers', async () => {
    const opts = makeOptions({ name: 'remix-index', framework: 'remix' });
    await scaffoldProject(opts);
    const index = await fs.readFile(
      path.join(opts.directory, 'app', 'routes', '_index.tsx'),
      'utf-8',
    );
    expect(index).toContain('helix/wrappers');
    expect(index).toContain('HxButton');
    expect(index).toContain('HxCard');
  });

  it('wrappers.tsx imports @helixui/library components', async () => {
    const opts = makeOptions({ name: 'remix-wrappers', framework: 'remix' });
    await scaffoldProject(opts);
    const wrappers = await fs.readFile(
      path.join(opts.directory, 'app', 'components', 'helix', 'wrappers.tsx'),
      'utf-8',
    );
    expect(wrappers).toContain('@helixui/library');
    expect(wrappers).toContain('@lit/react');
    expect(wrappers).toContain('createComponent');
  });

  it('tsconfig.json has jsx: react-jsx', async () => {
    const opts = makeOptions({ name: 'remix-tsconfig', framework: 'remix' });
    await scaffoldProject(opts);
    const tsconfig = await fs.readJson(path.join(opts.directory, 'tsconfig.json'));
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });
});

// ─── Solid.js + Vite ─────────────────────────────────────────────────────────

describe('scaffoldProject — solid-vite', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'solid-vite-app', framework: 'solid-vite' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'vite.config.ts',
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/index.css',
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('package.json has vite scripts', async () => {
    const opts = makeOptions({ name: 'solid-scripts', framework: 'solid-vite' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('vite');
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.preview).toBe('vite preview');
  });

  it('vite.config.ts uses vite-plugin-solid', async () => {
    const opts = makeOptions({ name: 'solid-vite-config', framework: 'solid-vite' });
    await scaffoldProject(opts);
    const viteConfig = await fs.readFile(path.join(opts.directory, 'vite.config.ts'), 'utf-8');
    expect(viteConfig).toContain('vite-plugin-solid');
    expect(viteConfig).toContain('solidPlugin');
  });

  it('App.tsx uses createSignal and createEffect', async () => {
    const opts = makeOptions({ name: 'solid-app-tsx', framework: 'solid-vite' });
    await scaffoldProject(opts);
    const appContent = await fs.readFile(path.join(opts.directory, 'src', 'App.tsx'), 'utf-8');
    expect(appContent).toContain('createSignal');
    expect(appContent).toContain('createEffect');
  });

  it('index.html mounts to #app', async () => {
    const opts = makeOptions({ name: 'solid-html', framework: 'solid-vite' });
    await scaffoldProject(opts);
    const html = await fs.readFile(path.join(opts.directory, 'index.html'), 'utf-8');
    expect(html).toContain('<div id="app">');
  });

  it('tsconfig.json has jsx: preserve when typescript is true', async () => {
    const opts = makeOptions({ name: 'solid-tsconfig', framework: 'solid-vite' });
    await scaffoldProject(opts);
    const tsconfig = await fs.readJson(path.join(opts.directory, 'tsconfig.json'));
    expect(tsconfig.compilerOptions.jsx).toBe('preserve');
    expect(tsconfig.compilerOptions.jsxImportSource).toBe('solid-js');
  });

  it('package.json includes solid-js dependency', async () => {
    const opts = makeOptions({ name: 'solid-deps', framework: 'solid-vite' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.dependencies['solid-js']).toBeDefined();
    expect(pkg.devDependencies['vite-plugin-solid']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
  });
});

// ─── Preact + Vite ───────────────────────────────────────────────────────────

describe('scaffoldProject — preact-vite', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'preact-vite-app', framework: 'preact-vite' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'vite.config.ts',
      'index.html',
      'src/index.tsx',
      'src/app.tsx',
      'src/index.css',
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('package.json has vite scripts', async () => {
    const opts = makeOptions({ name: 'preact-scripts', framework: 'preact-vite' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('vite');
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.preview).toBe('vite preview');
  });

  it('vite.config.ts uses @preact/preset-vite plugin', async () => {
    const opts = makeOptions({ name: 'preact-vite-config', framework: 'preact-vite' });
    await scaffoldProject(opts);
    const viteConfig = await fs.readFile(path.join(opts.directory, 'vite.config.ts'), 'utf-8');
    expect(viteConfig).toContain('@preact/preset-vite');
    expect(viteConfig).toContain('preact()');
  });

  it('src/app.tsx uses preact/hooks useState', async () => {
    const opts = makeOptions({ name: 'preact-app-tsx', framework: 'preact-vite' });
    await scaffoldProject(opts);
    const appContent = await fs.readFile(path.join(opts.directory, 'src', 'app.tsx'), 'utf-8');
    expect(appContent).toContain('useState');
    expect(appContent).toContain('preact/hooks');
  });

  it('src/index.tsx renders with preact render()', async () => {
    const opts = makeOptions({ name: 'preact-index-tsx', framework: 'preact-vite' });
    await scaffoldProject(opts);
    const indexContent = await fs.readFile(path.join(opts.directory, 'src', 'index.tsx'), 'utf-8');
    expect(indexContent).toContain("from 'preact'");
    expect(indexContent).toContain('render(');
  });

  it('index.html mounts to #app', async () => {
    const opts = makeOptions({ name: 'preact-html', framework: 'preact-vite' });
    await scaffoldProject(opts);
    const html = await fs.readFile(path.join(opts.directory, 'index.html'), 'utf-8');
    expect(html).toContain('<div id="app">');
    expect(html).toContain('src/index.tsx');
  });

  it('tsconfig.json has jsx: react-jsx and jsxImportSource: preact when typescript is true', async () => {
    const opts = makeOptions({ name: 'preact-tsconfig', framework: 'preact-vite' });
    await scaffoldProject(opts);
    const tsconfig = await fs.readJson(path.join(opts.directory, 'tsconfig.json'));
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    expect(tsconfig.compilerOptions.jsxImportSource).toBe('preact');
  });

  it('package.json includes preact dependency and @preact/preset-vite devDependency', async () => {
    const opts = makeOptions({ name: 'preact-deps', framework: 'preact-vite' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.dependencies['preact']).toBeDefined();
    expect(pkg.devDependencies['@preact/preset-vite']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
  });
});

// ─── Security: path traversal prevention ─────────────────────────────────────

describe('scaffoldProject — path traversal security', () => {
  it('throws on ".." relative traversal', async () => {
    const opts = makeOptions({ name: 'traversal-test', directory: '../evil' });
    await expect(scaffoldProject(opts)).rejects.toThrow(/traversal|Security/i);
  });

  it('throws on multi-level "../.." traversal', async () => {
    const opts = makeOptions({ name: 'traversal-test2', directory: '../../etc/passwd' });
    await expect(scaffoldProject(opts)).rejects.toThrow(/traversal|Security/i);
  });

  it('throws on ".." as a path segment in a relative path', async () => {
    const opts = makeOptions({ name: 'traversal-test3', directory: 'projects/../../../secret' });
    await expect(scaffoldProject(opts)).rejects.toThrow(/traversal|Security/i);
  });

  it('throws on percent-encoded traversal that normalizes to ".."', async () => {
    // path.normalize treats this as a literal string with %2e segments,
    // but the guard also catches literal ".." after normalization
    const opts = makeOptions({ name: 'traversal-test4', directory: '../%2e%2e/secret' });
    await expect(scaffoldProject(opts)).rejects.toThrow(/traversal|Security/i);
  });

  it('does NOT throw for a safe directory path', async () => {
    const opts = makeOptions({
      name: 'safe-path',
      directory: '/tmp/helix-test-scaffold/safe-path',
    });
    await expect(scaffoldProject(opts)).resolves.not.toThrow();
  });
});

// ─── Package.json correctness across frameworks ──────────────────────────────

describe('scaffoldProject — package.json structure', () => {
  it('sets type to "module"', async () => {
    const opts = makeOptions({ name: 'pkg-type' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.type).toBe('module');
  });

  it('sets version to "0.1.0"', async () => {
    const opts = makeOptions({ name: 'pkg-version' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.version).toBe('0.1.0');
  });

  it('sets private to true', async () => {
    const opts = makeOptions({ name: 'pkg-private' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.private).toBe(true);
  });

  it('includes @helixui/tokens in dependencies when designTokens is true', async () => {
    const opts = makeOptions({ name: 'pkg-tokens', designTokens: true });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.dependencies['@helixui/tokens']).toBeDefined();
  });
});

// ─── scaffoldProject — qwik-vite ─────────────────────────────────────────────

describe('scaffoldProject — qwik-vite', () => {
  it('generates expected file structure', async () => {
    const opts = makeOptions({ name: 'qwik-vite-app', framework: 'qwik-vite' });
    await scaffoldProject(opts);

    const expectedFiles = [
      'package.json',
      'vite.config.ts',
      'index.html',
      'src/root.tsx',
      'src/entry.dev.tsx',
      'src/routes/layout.tsx',
      'src/routes/index.tsx',
      'src/index.css',
    ];

    for (const file of expectedFiles) {
      expect(await fs.pathExists(path.join(opts.directory, file))).toBe(true);
    }
  });

  it('package.json has vite scripts', async () => {
    const opts = makeOptions({ name: 'qwik-scripts', framework: 'qwik-vite' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.scripts.dev).toBe('vite');
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.preview).toBe('vite preview');
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
  });

  it('vite.config.ts uses qwikVite plugin', async () => {
    const opts = makeOptions({ name: 'qwik-vite-config', framework: 'qwik-vite' });
    await scaffoldProject(opts);
    const viteConfig = await fs.readFile(path.join(opts.directory, 'vite.config.ts'), 'utf-8');
    expect(viteConfig).toContain('@builder.io/qwik/optimizer');
    expect(viteConfig).toContain('qwikVite');
  });

  it('root.tsx imports QwikCityProvider and RouterOutlet', async () => {
    const opts = makeOptions({ name: 'qwik-root', framework: 'qwik-vite' });
    await scaffoldProject(opts);
    const root = await fs.readFile(path.join(opts.directory, 'src', 'root.tsx'), 'utf-8');
    expect(root).toContain('QwikCityProvider');
    expect(root).toContain('RouterOutlet');
  });

  it('routes/layout.tsx contains Slot', async () => {
    const opts = makeOptions({ name: 'qwik-layout', framework: 'qwik-vite' });
    await scaffoldProject(opts);
    const layout = await fs.readFile(
      path.join(opts.directory, 'src', 'routes', 'layout.tsx'),
      'utf-8',
    );
    expect(layout).toContain('Slot');
  });

  it('routes/index.tsx uses useSignal', async () => {
    const opts = makeOptions({ name: 'qwik-index', framework: 'qwik-vite' });
    await scaffoldProject(opts);
    const index = await fs.readFile(
      path.join(opts.directory, 'src', 'routes', 'index.tsx'),
      'utf-8',
    );
    expect(index).toContain('useSignal');
  });

  it('package.json includes @builder.io/qwik dependency', async () => {
    const opts = makeOptions({ name: 'qwik-deps', framework: 'qwik-vite' });
    await scaffoldProject(opts);
    const pkg = await fs.readJson(path.join(opts.directory, 'package.json'));
    expect(pkg.dependencies['@builder.io/qwik']).toBeDefined();
    expect(pkg.dependencies['@builder.io/qwik-city']).toBeDefined();
    expect(pkg.devDependencies['vite']).toBeDefined();
  });

  it('dryRun does not write files', async () => {
    const opts = makeOptions({ name: 'qwik-dry-run', framework: 'qwik-vite', dryRun: true });
    await scaffoldProject(opts);
    expect(await fs.pathExists(opts.directory)).toBe(false);
  });
});

// ─── --force flag behavior ────────────────────────────────────────────────────

describe('scaffoldProject — force flag', () => {
  it('exits with error when directory is non-empty and force is not set', async () => {
    const opts = makeOptions({ name: 'force-no-flag' });
    await fs.ensureDir(opts.directory);
    await fs.writeFile(path.join(opts.directory, 'existing.txt'), 'hello');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
      throw new Error('process.exit called');
    });

    await expect(scaffoldProject(opts)).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('proceeds when directory is non-empty and force is true', async () => {
    const opts = makeOptions({ name: 'force-with-flag', force: true });
    await fs.ensureDir(opts.directory);
    await fs.writeFile(path.join(opts.directory, 'existing.txt'), 'hello');

    await expect(scaffoldProject(opts)).resolves.not.toThrow();
    expect(await fs.pathExists(path.join(opts.directory, 'package.json'))).toBe(true);
  });

  it('succeeds without force when directory is empty', async () => {
    const opts = makeOptions({ name: 'force-empty-dir' });
    await fs.ensureDir(opts.directory);

    await expect(scaffoldProject(opts)).resolves.not.toThrow();
    expect(await fs.pathExists(path.join(opts.directory, 'package.json'))).toBe(true);
  });
});
