import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Framework, ComponentBundle } from './types.js';

export interface HelixConfigDefaults {
  template?: Framework;
  typescript?: boolean;
  eslint?: boolean;
  darkMode?: boolean;
  tokens?: boolean;
  bundles?: ComponentBundle[];
}

export interface HelixConfig {
  defaults?: HelixConfigDefaults;
}

export interface LoadConfigResult {
  config: HelixConfig;
  configFile: string | null;
}

export function loadConfig(noConfig: boolean): LoadConfigResult {
  if (noConfig) {
    return { config: {}, configFile: null };
  }

  const candidates = [
    path.resolve(process.cwd(), '.helixrc.json'),
    path.resolve(os.homedir(), '.helixrc.json'),
  ];

  for (const candidate of candidates) {
    let raw: string;
    try {
      raw = fs.readFileSync(candidate, 'utf-8');
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`Warning: .helixrc.json at "${candidate}" contains invalid JSON — skipping`);
      return { config: {}, configFile: candidate };
    }

    return { config: parsed as HelixConfig, configFile: candidate };
  }

  return { config: {}, configFile: null };
}
