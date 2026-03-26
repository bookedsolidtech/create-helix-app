import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import type { CustomTemplateConfig } from './types.js';
import { logger } from './logger.js';

/**
 * The raw JSON shape expected in each custom template definition file.
 * All fields are typed as `unknown` here so we can validate them at runtime.
 */
interface RawCustomTemplate {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  hint?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  features?: unknown;
}

/**
 * Validates a parsed JSON object and returns a fully-formed CustomTemplateConfig,
 * or null if any required field is missing or invalid.
 */
function validateCustomTemplate(
  raw: unknown,
  filePath: string,
): CustomTemplateConfig | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    logger.warn(`Custom template at "${filePath}" is not a valid object — skipping`);
    return null;
  }

  const obj = raw as RawCustomTemplate;

  if (typeof obj.id !== 'string' || obj.id.trim() === '') {
    logger.warn(`Custom template at "${filePath}" missing required string field "id" — skipping`);
    return null;
  }

  if (typeof obj.name !== 'string' || obj.name.trim() === '') {
    logger.warn(
      `Custom template at "${filePath}" missing required string field "name" — skipping`,
    );
    return null;
  }

  if (typeof obj.description !== 'string' || obj.description.trim() === '') {
    logger.warn(
      `Custom template at "${filePath}" missing required string field "description" — skipping`,
    );
    return null;
  }

  if (typeof obj.hint !== 'string' || obj.hint.trim() === '') {
    logger.warn(
      `Custom template at "${filePath}" missing required string field "hint" — skipping`,
    );
    return null;
  }

  if (
    typeof obj.dependencies !== 'object' ||
    obj.dependencies === null ||
    Array.isArray(obj.dependencies)
  ) {
    logger.warn(
      `Custom template at "${filePath}" missing required object field "dependencies" — skipping`,
    );
    return null;
  }

  if (
    typeof obj.devDependencies !== 'object' ||
    obj.devDependencies === null ||
    Array.isArray(obj.devDependencies)
  ) {
    logger.warn(
      `Custom template at "${filePath}" missing required object field "devDependencies" — skipping`,
    );
    return null;
  }

  if (!Array.isArray(obj.features) || obj.features.length === 0) {
    logger.warn(
      `Custom template at "${filePath}" missing required non-empty array field "features" — skipping`,
    );
    return null;
  }

  return {
    id: obj.id,
    name: obj.name,
    description: obj.description,
    hint: obj.hint,
    color: pc.white,
    dependencies: obj.dependencies as Record<string, string>,
    devDependencies: obj.devDependencies as Record<string, string>,
    features: obj.features as string[],
    isCustom: true,
  };
}

/**
 * Loads custom template definitions from a directory.
 *
 * Each `.json` file in the directory is treated as a template definition
 * following the TemplateConfig interface. Invalid files are warned about
 * and skipped. If the directory does not exist, a warning is logged and
 * an empty array is returned.
 *
 * @param templateDir - Absolute or relative path to the directory.
 * @returns Array of validated CustomTemplateConfig objects.
 */
export function loadCustomTemplates(templateDir: string): CustomTemplateConfig[] {
  let files: string[];
  try {
    files = fs.readdirSync(templateDir);
  } catch {
    logger.warn(
      `Custom template directory "${templateDir}" not found or not readable — skipping custom templates`,
    );
    return [];
  }

  const result: CustomTemplateConfig[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const filePath = path.join(templateDir, file);
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch {
      logger.warn(`Could not read custom template file "${filePath}" — skipping`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn(`Custom template file "${filePath}" contains invalid JSON — skipping`);
      continue;
    }

    const template = validateCustomTemplate(parsed, filePath);
    if (template !== null) {
      result.push(template);
    }
  }

  return result;
}
