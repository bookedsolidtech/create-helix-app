/**
 * Plugin discovery — scans node_modules for packages whose names match the
 * "helix-plugin-*" or "@scope/helix-plugin-*" naming convention and attempts
 * to load them as ES modules.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface HelixPlugin {
  /** The resolved package name. */
  name: string;
  /** The default export of the plugin module (or undefined when absent). */
  module: unknown;
}

/**
 * Determine whether a directory entry name looks like a helix plugin package.
 *
 * Matches:
 *   - "helix-plugin-<anything>"
 *   - "@scope/helix-plugin-<anything>"  (only the inner segment is checked
 *     because readdir returns scoped entries as bare package names within the
 *     scope folder)
 */
export function isHelixPluginName(name: string): boolean {
  return name.startsWith('helix-plugin-') || (name.startsWith('@') && name.includes('/helix-plugin-'));
}

/**
 * Return an array of candidate package names found under `nodeModulesDir` that
 * match the helix-plugin naming convention.
 *
 * Scoped packages ("@scope/helix-plugin-*") are found by reading one level of
 * scope directories (directories whose name begins with "@").
 *
 * @param nodeModulesDir - Absolute path to a node_modules directory.
 */
export function findPluginPackageNames(nodeModulesDir: string): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(nodeModulesDir);
  } catch {
    return [];
  }

  const candidates: string[] = [];

  for (const entry of entries) {
    if (entry.startsWith('helix-plugin-')) {
      candidates.push(entry);
      continue;
    }

    // Scoped package directory: read its children
    if (entry.startsWith('@')) {
      const scopeDir = path.join(nodeModulesDir, entry);
      let scopedEntries: string[];
      try {
        scopedEntries = fs.readdirSync(scopeDir);
      } catch {
        continue;
      }
      for (const scoped of scopedEntries) {
        if (scoped.startsWith('helix-plugin-')) {
          candidates.push(`${entry}/${scoped}`);
        }
      }
    }
  }

  return candidates;
}

/**
 * Attempt to dynamically import() a plugin by package name and return a
 * HelixPlugin descriptor.  If the import fails the error is swallowed and
 * the function returns null so that a single bad plugin does not abort the
 * discovery pass.
 *
 * @param packageName - The npm package name to import.
 */
export async function loadPlugin(packageName: string): Promise<HelixPlugin | null> {
  try {
    const mod: unknown = await import(packageName);
    return { name: packageName, module: mod };
  } catch {
    return null;
  }
}

/**
 * Discover and load all helix plugins present in `nodeModulesDir`.
 *
 * @param nodeModulesDir - Absolute path to a node_modules directory.
 *                         Defaults to the node_modules sibling of process.cwd().
 */
export async function discoverPlugins(
  nodeModulesDir: string = path.join(process.cwd(), 'node_modules'),
): Promise<HelixPlugin[]> {
  const names = findPluginPackageNames(nodeModulesDir);
  const results = await Promise.all(names.map((n) => loadPlugin(n)));
  return results.filter((r): r is HelixPlugin => r !== null);
}
