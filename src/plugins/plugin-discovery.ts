import fs from 'node:fs';
import fsExtra from 'fs-extra';
import path from 'node:path';
import type { HookFn } from './hooks.js';
import type { HookLifecycle, PluginModule } from '../types.js';

export interface DiscoveredPlugin {
  name: string;
  lifecycle: HookLifecycle;
  hook: HookFn;
}

export interface HelixPlugin {
  name: string;
  module: unknown;
}

const VALID_LIFECYCLES = new Set<string>([
  'pre-scaffold',
  'post-scaffold',
  'pre-write',
  'post-write',
]);

/**
 * Returns true when `name` matches the helix plugin naming convention:
 * - `helix-plugin-*`
 * - `create-helix-plugin-*`
 * - `@scope/helix-plugin-*`
 * - `@scope/create-helix-plugin-*`
 */
export function isHelixPluginName(name: string): boolean {
  if (!name) return false;
  if (name.startsWith('@')) {
    // Scoped: @scope/helix-plugin-* or @scope/create-helix-plugin-*
    const slashIdx = name.indexOf('/');
    if (slashIdx === -1) return false;
    const packageName = name.slice(slashIdx + 1);
    return (
      packageName.startsWith('helix-plugin-') || packageName.startsWith('create-helix-plugin-')
    );
  }
  return name.startsWith('helix-plugin-') || name.startsWith('create-helix-plugin-');
}

/**
 * Synchronously scans `nodeModulesDir` for packages matching the
 * helix-plugin-* naming convention (bare and scoped).
 */
export function findPluginPackageNames(nodeModulesDir: string): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(nodeModulesDir) as string[];
  } catch {
    return [];
  }

  const results: string[] = [];

  for (const entry of entries) {
    if (entry.startsWith('@')) {
      // Scoped directory — scan inside it
      const scopeDir = path.join(nodeModulesDir, entry);
      let scopeEntries: string[];
      try {
        scopeEntries = fs.readdirSync(scopeDir) as string[];
      } catch {
        continue;
      }
      for (const pkg of scopeEntries) {
        const fullName = `${entry}/${pkg}`;
        if (isHelixPluginName(fullName)) {
          results.push(fullName);
        }
      }
    } else if (isHelixPluginName(entry)) {
      results.push(entry);
    }
  }

  return results;
}

/**
 * Attempts to import a package by name. Returns `{ name, module }` on
 * success, or `null` if the import fails.
 */
export async function loadPlugin(packageName: string): Promise<HelixPlugin | null> {
  try {
    const mod = await import(packageName);
    return { name: packageName, module: mod };
  } catch {
    return null;
  }
}

/**
 * Discover and load all helix-plugin-* packages. Accepts either a project
 * root (will look for node_modules inside) or a node_modules directory
 * directly (detected when the last path segment is "node_modules").
 * Invalid or missing plugins are skipped with a console warning.
 */
export async function discoverPlugins(dir: string): Promise<DiscoveredPlugin[]> {
  // Detect whether `dir` is already the node_modules dir or a project root
  const nodeModulesDir =
    path.basename(dir) === 'node_modules' ? dir : path.join(dir, 'node_modules');

  const exists = await fsExtra.pathExists(nodeModulesDir);
  if (!exists) {
    return [];
  }

  const pluginNames = findPluginPackageNames(nodeModulesDir);
  const discovered: DiscoveredPlugin[] = [];

  for (const pluginName of pluginNames) {
    // For scoped packages like @scope/helix-plugin-foo, path.join handles the slash correctly
    const pluginDir = path.join(nodeModulesDir, ...pluginName.split('/'));
    let mod: unknown;
    try {
      mod = await loadPluginFromDir(pluginDir, pluginName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[create-helix] Warning: failed to load plugin "${pluginName}": ${msg}`);
      continue;
    }

    const plugin = extractPluginModule(mod);
    if (!plugin) {
      console.warn(
        `[create-helix] Warning: plugin "${pluginName}" does not export a valid plugin module (missing default export with hooks). Skipping.`,
      );
      continue;
    }

    if (!plugin.hooks || typeof plugin.hooks !== 'object') {
      console.warn(
        `[create-helix] Warning: plugin "${pluginName}" does not export hooks. Skipping.`,
      );
      continue;
    }

    let hasValidHook = false;
    for (const [lifecycle, hook] of Object.entries(plugin.hooks)) {
      if (!VALID_LIFECYCLES.has(lifecycle)) {
        console.warn(
          `[create-helix] Warning: plugin "${pluginName}" exports unknown lifecycle "${lifecycle}". Skipping this hook.`,
        );
        continue;
      }

      if (typeof hook !== 'function') {
        console.warn(
          `[create-helix] Warning: plugin "${pluginName}" hook for "${lifecycle}" is not a function. Skipping.`,
        );
        continue;
      }

      discovered.push({
        name: pluginName,
        lifecycle: lifecycle as HookLifecycle,
        hook: hook as HookFn,
      });
      hasValidHook = true;
    }

    if (!hasValidHook) {
      console.warn(`[create-helix] Warning: plugin "${pluginName}" has no valid hooks. Skipping.`);
    }
  }

  return discovered;
}

async function loadPluginFromDir(pluginDir: string, pluginName: string): Promise<unknown> {
  const pkgPath = path.join(pluginDir, 'package.json');
  let entryPoint: string | undefined;

  if (await fsExtra.pathExists(pkgPath)) {
    try {
      const pkg = (await fsExtra.readJson(pkgPath)) as Record<string, unknown>;
      if (typeof pkg['main'] === 'string') {
        entryPoint = path.join(pluginDir, pkg['main'] as string);
      }
    } catch {
      // ignore parse errors, fall through to index.js
    }
  }

  if (!entryPoint) {
    for (const candidate of ['index.js', 'index.mjs', 'index.cjs']) {
      const candidatePath = path.join(pluginDir, candidate);
      if (await fsExtra.pathExists(candidatePath)) {
        entryPoint = candidatePath;
        break;
      }
    }
  }

  if (!entryPoint) {
    throw new Error(`Cannot find entry point for plugin "${pluginName}" in ${pluginDir}`);
  }

  return import(entryPoint);
}

function extractPluginModule(mod: unknown): PluginModule | null {
  if (mod === null || typeof mod !== 'object') return null;

  const record = mod as Record<string, unknown>;

  // CommonJS/ESM default export
  if ('default' in record) {
    const def = record['default'];
    if (def !== null && typeof def === 'object') {
      return def as PluginModule;
    }
    return null;
  }

  // Direct export (e.g. { hooks: { ... } })
  if ('hooks' in record) {
    return record as PluginModule;
  }

  return null;
}
