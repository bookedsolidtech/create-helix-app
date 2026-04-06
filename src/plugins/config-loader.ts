/**
 * Config loader — reads `.helixrc.json` from a project root and extracts
 * hook configuration that can be fed into the `HookManager`.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { HookFn } from './hooks.js';

/** Shape of a single hook entry inside `.helixrc.json`. */
export interface HelixRcHookEntry {
  /** The hook name, e.g. "beforeScaffold" or "afterScaffold". */
  name: string;
  /** Absolute or relative path to a JS/TS module that default-exports a HookFn. */
  handler: string;
}

/** Shape of the `.helixrc.json` file. */
export interface HelixRcConfig {
  hooks?: HelixRcHookEntry[];
  [key: string]: unknown;
}

/** A resolved hook ready to be registered with HookManager. */
export interface ResolvedHook {
  name: string;
  fn: HookFn;
}

/**
 * Read and parse `.helixrc.json` from `projectRoot`.
 *
 * @returns The parsed config, or `null` when the file does not exist.
 * @throws  `SyntaxError` when the file exists but contains invalid JSON.
 */
export function readHelixRc(projectRoot: string): HelixRcConfig | null {
  const filePath = path.join(projectRoot, '.helixrc.json');
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  // Let SyntaxError propagate so callers can surface the problem to users.
  return JSON.parse(raw) as HelixRcConfig;
}

/**
 * Load hook functions declared in `.helixrc.json` under `projectRoot`.
 *
 * Each `hooks[].handler` path is resolved relative to `projectRoot` and
 * dynamically imported.  Handlers that fail to load are silently skipped
 * (the error is passed to the optional `onError` callback).
 *
 * @param projectRoot - Directory that contains `.helixrc.json`.
 * @param onError     - Optional callback invoked when a handler cannot be loaded.
 * @returns Array of `{ name, fn }` pairs ready for `HookManager.register()`.
 */
export async function loadHelixRcHooks(
  projectRoot: string,
  onError?: (entry: HelixRcHookEntry, err: unknown) => void,
): Promise<ResolvedHook[]> {
  const config = readHelixRc(projectRoot);
  if (!config || !Array.isArray(config.hooks) || config.hooks.length === 0) {
    return [];
  }

  const resolved: ResolvedHook[] = [];

  for (const entry of config.hooks) {
    if (!entry.name || !entry.handler) {
      continue;
    }

    const handlerPath = path.isAbsolute(entry.handler)
      ? entry.handler
      : path.resolve(projectRoot, entry.handler);

    try {
      const mod = await import(handlerPath);
      const fn = (mod.default ?? mod) as HookFn;
      resolved.push({ name: entry.name, fn });
    } catch (err) {
      onError?.(entry, err);
    }
  }

  return resolved;
}
