import fs from 'fs-extra';
import path from 'node:path';
import type { HookFn, HookLifecycle, PluginModule } from '../types.js';

export interface DiscoveredPlugin {
  name: string;
  lifecycle: HookLifecycle;
  hook: HookFn;
}

const VALID_LIFECYCLES = new Set<string>([
  'pre-scaffold',
  'post-scaffold',
  'pre-write',
  'post-write',
]);

export async function discoverPlugins(projectRoot: string): Promise<DiscoveredPlugin[]> {
  const nodeModulesDir = path.join(projectRoot, 'node_modules');

  const exists = await fs.pathExists(nodeModulesDir);
  if (!exists) {
    return [];
  }

  let entries: string[];
  try {
    entries = await fs.readdir(nodeModulesDir);
  } catch {
    return [];
  }

  const pluginNames = entries.filter((name) => name.startsWith('create-helix-plugin-'));

  const discovered: DiscoveredPlugin[] = [];

  for (const pluginName of pluginNames) {
    const pluginDir = path.join(nodeModulesDir, pluginName);

    let mod: unknown;
    try {
      mod = await loadPlugin(pluginDir, pluginName);
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

async function loadPlugin(pluginDir: string, pluginName: string): Promise<unknown> {
  // Try to read package.json for main entry
  const pkgPath = path.join(pluginDir, 'package.json');
  let entryPoint: string | undefined;

  if (await fs.pathExists(pkgPath)) {
    try {
      const pkg = (await fs.readJson(pkgPath)) as Record<string, unknown>;
      // Prefer exports > main
      if (typeof pkg['main'] === 'string') {
        entryPoint = path.join(pluginDir, pkg['main'] as string);
      }
    } catch {
      // ignore parse errors, fall through to index.js
    }
  }

  if (!entryPoint) {
    // Try common entry points
    for (const candidate of ['index.js', 'index.mjs', 'index.cjs']) {
      const candidatePath = path.join(pluginDir, candidate);
      if (await fs.pathExists(candidatePath)) {
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
