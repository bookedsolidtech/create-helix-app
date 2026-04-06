import fs from 'node:fs';
import path from 'node:path';
import { VALID_FRAMEWORKS, VALID_BUNDLES, VALID_PRESETS } from '../validation.js';

export interface ConfigValidationError {
  field: string;
  message: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  configFile: string;
  errors: ConfigValidationError[];
}

/**
 * Validates the structure and values in a parsed HelixConfig object.
 * Returns a list of field-level errors; an empty list means the config is valid.
 */
export function validateHelixConfig(config: unknown): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    errors.push({ field: 'root', message: 'Config must be a JSON object' });
    return errors;
  }

  const cfg = config as Record<string, unknown>;

  // Validate defaults section
  if (cfg['defaults'] !== undefined) {
    if (typeof cfg['defaults'] !== 'object' || cfg['defaults'] === null) {
      errors.push({ field: 'defaults', message: 'defaults must be an object' });
    } else {
      const defaults = cfg['defaults'] as Record<string, unknown>;
      if (defaults['template'] !== undefined) {
        if (
          typeof defaults['template'] !== 'string' ||
          !(VALID_FRAMEWORKS as readonly string[]).includes(defaults['template'])
        ) {
          errors.push({
            field: 'defaults.template',
            message: `"${String(defaults['template'])}" is not a valid framework. Valid options: ${VALID_FRAMEWORKS.join(', ')}`,
          });
        }
      }
      for (const boolKey of ['typescript', 'eslint', 'darkMode', 'tokens'] as const) {
        if (defaults[boolKey] !== undefined && typeof defaults[boolKey] !== 'boolean') {
          errors.push({
            field: `defaults.${boolKey}`,
            message: `${boolKey} must be a boolean`,
          });
        }
      }
      if (defaults['bundles'] !== undefined) {
        if (!Array.isArray(defaults['bundles'])) {
          errors.push({ field: 'defaults.bundles', message: 'bundles must be an array' });
        } else {
          const invalid = (defaults['bundles'] as unknown[]).filter(
            (b) =>
              typeof b !== 'string' || !(VALID_BUNDLES as readonly string[]).includes(b as string),
          );
          if (invalid.length > 0) {
            errors.push({
              field: 'defaults.bundles',
              message: `Invalid bundle(s): ${invalid.map((b) => `"${String(b)}"`).join(', ')}. Valid: ${VALID_BUNDLES.join(', ')}`,
            });
          }
        }
      }
    }
  }

  // Validate profiles section
  if (cfg['profiles'] !== undefined) {
    if (typeof cfg['profiles'] !== 'object' || cfg['profiles'] === null) {
      errors.push({ field: 'profiles', message: 'profiles must be an object' });
    } else {
      const profiles = cfg['profiles'] as Record<string, unknown>;
      for (const [profileName, profileValue] of Object.entries(profiles)) {
        if (typeof profileValue !== 'object' || profileValue === null) {
          errors.push({ field: `profiles.${profileName}`, message: 'profile must be an object' });
          continue;
        }
        const profile = profileValue as Record<string, unknown>;
        if (profile['template'] !== undefined) {
          if (
            typeof profile['template'] !== 'string' ||
            !(VALID_FRAMEWORKS as readonly string[]).includes(profile['template'])
          ) {
            errors.push({
              field: `profiles.${profileName}.template`,
              message: `"${String(profile['template'])}" is not a valid framework`,
            });
          }
        }
        if (profile['preset'] !== undefined) {
          if (
            typeof profile['preset'] !== 'string' ||
            !(VALID_PRESETS as readonly string[]).includes(profile['preset'])
          ) {
            errors.push({
              field: `profiles.${profileName}.preset`,
              message: `"${String(profile['preset'])}" is not a valid preset`,
            });
          }
        }
      }
    }
  }

  // Validate templateDir
  if (cfg['templateDir'] !== undefined && typeof cfg['templateDir'] !== 'string') {
    errors.push({ field: 'templateDir', message: 'templateDir must be a string' });
  }

  return errors;
}

/**
 * Reads and validates the .helixrc.json at the given path.
 * Returns a ConfigValidationResult describing whether the file is valid.
 */
export function runConfigValidate(configFilePath: string): ConfigValidationResult {
  let raw: string;
  try {
    raw = fs.readFileSync(configFilePath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return {
        valid: false,
        configFile: configFilePath,
        errors: [{ field: 'file', message: `Config file not found: "${configFilePath}"` }],
      };
    }
    return {
      valid: false,
      configFile: configFilePath,
      errors: [
        {
          field: 'file',
          message: `Could not read config file: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      configFile: configFilePath,
      errors: [{ field: 'file', message: 'Config file contains invalid JSON' }],
    };
  }

  const errors = validateHelixConfig(parsed);
  return {
    valid: errors.length === 0,
    configFile: configFilePath,
    errors,
  };
}

/**
 * CLI entry point for the config validate command.
 * Prints results to stdout/stderr and exits with appropriate code.
 */
export function runConfigValidateCommand(dir: string): void {
  const configFilePath = path.join(dir, '.helixrc.json');
  const result = runConfigValidate(configFilePath);

  if (result.valid) {
    console.log(`✓ Config file is valid: "${result.configFile}"`);
    return;
  }

  console.error(`✗ Config validation failed: "${result.configFile}"`);
  for (const error of result.errors) {
    console.error(`  ${error.field}: ${error.message}`);
  }
  process.exit(1);
}
