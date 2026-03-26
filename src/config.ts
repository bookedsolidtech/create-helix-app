import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Framework, ComponentBundle, DrupalPreset } from './types.js';
import { logger } from './logger.js';

export interface HelixConfigDefaults {
  template?: Framework;
  typescript?: boolean;
  eslint?: boolean;
  darkMode?: boolean;
  tokens?: boolean;
  bundles?: ComponentBundle[];
}

export interface HelixProfile {
  template?: Framework;
  typescript?: boolean;
  eslint?: boolean;
  darkMode?: boolean;
  tokens?: boolean;
  bundles?: ComponentBundle[];
  preset?: DrupalPreset;
}

export interface HelixConfig {
  defaults?: HelixConfigDefaults;
  profiles?: Record<string, HelixProfile>;
  /** Path to a directory containing custom template JSON definition files. */
  templateDir?: string;
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
  /** Path to a directory containing custom template JSON definition files. */
  templateDir?: string;
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

  if (env['HELIX_TEMPLATE_DIR']) result.templateDir = env['HELIX_TEMPLATE_DIR'];

  return result;
}

function readHelixRcFile(candidates: string[]): { raw: HelixConfig; configFile: string } | null {
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
      logger.warn(`Warning: .helixrc.json at "${candidate}" contains invalid JSON — skipping`);
      return { raw: {}, configFile: candidate };
    }

    return { raw: parsed as HelixConfig, configFile: candidate };
  }

  return null;
}

export function loadConfig(noConfig: boolean, profileName?: string): LoadConfigResult {
  if (noConfig) {
    return { config: {}, configFile: null };
  }

  const candidates = [
    path.resolve(process.cwd(), '.helixrc.json'),
    path.resolve(os.homedir(), '.helixrc.json'),
  ];

  const found = readHelixRcFile(candidates);

  if (found === null) {
    return { config: {}, configFile: null };
  }

  const { raw, configFile } = found;

  if (profileName === undefined) {
    return { config: raw, configFile };
  }

  // Profile merge: defaults < helixrc default section < selected profile
  const profiles = raw.profiles ?? {};
  if (!(profileName in profiles)) {
    throw new Error(`Unknown profile: ${profileName}`);
  }

  const selectedProfile = profiles[profileName] ?? {};
  const mergedDefaults: HelixConfigDefaults = {
    ...raw.defaults,
    ...selectedProfile,
  };

  const mergedConfig: HelixConfig = {
    ...raw,
    defaults: mergedDefaults,
  };

  return { config: mergedConfig, configFile };
}

export function listProfiles(configDir?: string): string[] {
  const dir = configDir ?? process.cwd();
  const candidates = [
    path.resolve(dir, '.helixrc.json'),
    path.resolve(os.homedir(), '.helixrc.json'),
  ];

  const found = readHelixRcFile(candidates);

  if (found === null) {
    return [];
  }

  const profiles = found.raw.profiles;
  if (profiles === undefined) {
    return [];
  }

  return Object.keys(profiles);
}
