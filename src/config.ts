import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Framework, ComponentBundle, DrupalPreset } from './types.js';

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

export interface EnvVarOverrides {
  template?: Framework;
  typescript?: boolean;
  eslint?: boolean;
  darkMode?: boolean;
  tokens?: boolean;
  bundles?: ComponentBundle[];
  outputDir?: string;
  preset?: DrupalPreset;
  verbose?: boolean;
  offline?: boolean;
}

function parseEnvBool(val: string | undefined): boolean | undefined {
  if (val === undefined) return undefined;
  const lower = val.toLowerCase();
  if (lower === '1' || lower === 'true' || lower === 'yes') return true;
  if (lower === '0' || lower === 'false' || lower === 'no') return false;
  return undefined;
}

export function readEnvVars(): EnvVarOverrides {
  const env = process.env;
  const result: EnvVarOverrides = {};

  if (env['HELIX_TEMPLATE']) result.template = env['HELIX_TEMPLATE'] as Framework;

  const typescript = parseEnvBool(env['HELIX_TYPESCRIPT']);
  if (typescript !== undefined) result.typescript = typescript;

  const eslint = parseEnvBool(env['HELIX_ESLINT']);
  if (eslint !== undefined) result.eslint = eslint;

  const darkMode = parseEnvBool(env['HELIX_DARK_MODE']);
  if (darkMode !== undefined) result.darkMode = darkMode;

  const tokens = parseEnvBool(env['HELIX_TOKENS']);
  if (tokens !== undefined) result.tokens = tokens;

  if (env['HELIX_BUNDLES']) {
    result.bundles = env['HELIX_BUNDLES'].split(',').map((s) => s.trim()) as ComponentBundle[];
  }

  if (env['HELIX_OUTPUT_DIR']) result.outputDir = env['HELIX_OUTPUT_DIR'];

  if (env['HELIX_PRESET']) result.preset = env['HELIX_PRESET'] as DrupalPreset;

  const verbose = parseEnvBool(env['HELIX_VERBOSE']);
  if (verbose !== undefined) result.verbose = verbose;

  const offline = parseEnvBool(env['HELIX_OFFLINE']);
  if (offline !== undefined) result.offline = offline;

  return result;
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
