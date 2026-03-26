import fs from 'fs-extra';
import path from 'node:path';
import type { HelixRc, HookFn, HookLifecycle } from '../types.js';

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

  const exists = await fs.pathExists(rcPath);
  if (!exists) {
    return [];
  }

  let rc: unknown;
  try {
    rc = await fs.readJson(rcPath);
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

    if (!(await fs.pathExists(resolvedPath))) {
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
  if (
    mod !== null &&
    typeof mod === 'object' &&
    'default' in mod
  ) {
    return (mod as Record<string, unknown>)['default'];
  }
  return mod;
}
