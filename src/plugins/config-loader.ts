import fsExtra from 'fs-extra';
import nodeFs from 'node:fs';
import path from 'node:path';
import type { HookFn } from './hooks.js';
import type { HelixRc, HookLifecycle } from '../types.js';

// ── Types from the simplified hook schema (used by src/__tests__) ─────────────

/** Shape of a single hook entry inside `.helixrc.json`. */
export interface HelixRcHookEntry {
  name: string;
  handler: string;
}

/** Shape of the `.helixrc.json` file. */
export interface HelixRcConfig {
  hooks?: HelixRcHookEntry[];
  [key: string]: unknown;
}

/**
 * Read and parse `.helixrc.json` from `projectRoot` using synchronous fs.
 * Returns the parsed config, or `null` when the file does not exist.
 * Throws `SyntaxError` when the file contains invalid JSON.
 */
export function readHelixRc(projectRoot: string): HelixRcConfig | null {
  const filePath = path.join(projectRoot, '.helixrc.json');
  let raw: string;
  try {
    raw = nodeFs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  return JSON.parse(raw) as HelixRcConfig;
}

export interface LoadedHook {
  lifecycle: HookLifecycle;
  hook: HookFn;
  source: string;
}

const VALID_LIFECYCLES: HookLifecycle[] = [
  'pre-scaffold',
  'post-scaffold',
  'pre-write',
  'post-write',
];

export async function loadHelixRcHooks(projectRoot: string): Promise<LoadedHook[]> {
  const rcPath = path.join(projectRoot, '.helixrc.json');

  const exists = await fsExtra.pathExists(rcPath);
  if (!exists) {
    return [];
  }

  let rc: unknown;
  try {
    rc = await fsExtra.readJson(rcPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse .helixrc.json at ${rcPath}: ${msg}`);
  }

  if (typeof rc !== 'object' || rc === null) {
    throw new Error(`.helixrc.json must be a JSON object. Found: ${JSON.stringify(rc)}`);
  }

  const helixRc = rc as HelixRc;
  if (!helixRc.hooks) {
    return [];
  }

  if (typeof helixRc.hooks !== 'object' || helixRc.hooks === null) {
    throw new Error(`.helixrc.json "hooks" must be an object`);
  }

  const loaded: LoadedHook[] = [];

  for (const lifecycle of VALID_LIFECYCLES) {
    const hookPath = helixRc.hooks[lifecycle];
    if (!hookPath) continue;

    if (typeof hookPath !== 'string') {
      throw new Error(
        `.helixrc.json hooks["${lifecycle}"] must be a string path, got: ${JSON.stringify(hookPath)}`,
      );
    }

    const resolvedPath = path.resolve(projectRoot, hookPath);

    if (!(await fsExtra.pathExists(resolvedPath))) {
      throw new Error(
        `Hook file not found: "${resolvedPath}" (from .helixrc.json hooks["${lifecycle}"] = "${hookPath}", project root: "${projectRoot}")`,
      );
    }

    let mod: unknown;
    try {
      mod = await import(resolvedPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load hook file "${resolvedPath}": ${msg}`);
    }

    const fn = extractDefaultExport(mod);
    if (typeof fn !== 'function') {
      throw new Error(
        `Hook file "${resolvedPath}" must export a default function. Got: ${typeof fn}`,
      );
    }

    loaded.push({ lifecycle, hook: fn as HookFn, source: resolvedPath });
  }

  return loaded;
}

function extractDefaultExport(mod: unknown): unknown {
  if (mod !== null && typeof mod === 'object' && 'default' in mod) {
    return (mod as Record<string, unknown>)['default'];
  }
  return mod;
}
