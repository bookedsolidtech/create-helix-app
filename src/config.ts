import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface HelixConfigDefaults {
  template?: string;
  typescript?: boolean;
  eslint?: boolean;
  darkMode?: boolean;
  tokens?: boolean;
  bundles?: string[];
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
      // File doesn't exist or can't be read — try next candidate
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`Warning: invalid JSON in config file "${candidate}" — ignoring`);
      return { config: {}, configFile: candidate };
    }

    return { config: parsed as HelixConfig, configFile: candidate };
  }

  return { config: {}, configFile: null };
}
