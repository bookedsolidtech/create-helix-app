import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import pc from 'picocolors';
import { validateHelixConfig } from '../config-validator.js';
import type { ValidationResult } from '../config-validator.js';

export interface ConfigValidateOptions {
  filePath?: string;
  json?: boolean;
}

interface JsonOutput {
  valid: boolean;
  file: string | null;
  error?: string;
  errors: ValidationResult['errors'];
  warnings: ValidationResult['warnings'];
}

export function runConfigValidate(opts: ConfigValidateOptions = {}): void {
  const candidates = opts.filePath
    ? [path.resolve(process.cwd(), opts.filePath)]
    : [
        path.resolve(process.cwd(), '.helixrc.json'),
        path.resolve(os.homedir(), '.helixrc.json'),
      ];

  let raw: string | null = null;
  let resolvedPath: string | null = null;

  for (const candidate of candidates) {
    try {
      raw = fs.readFileSync(candidate, 'utf-8');
      resolvedPath = candidate;
      break;
    } catch {
      // not found, try next
    }
  }

  if (raw === null || resolvedPath === null) {
    if (opts.json) {
      const out: JsonOutput = {
        valid: false,
        file: null,
        error: 'No .helixrc.json found',
        errors: [],
        warnings: [],
      };
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.error('No .helixrc.json found in current directory or home directory.');
    }
    process.exit(1);
  }

  const result = validateHelixConfig(raw);

  if (opts.json) {
    const out: JsonOutput = {
      valid: result.valid,
      file: resolvedPath,
      errors: result.errors,
      warnings: result.warnings,
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(result.valid ? 0 : 1);
    return;
  }

  console.log(`Validating: ${pc.dim(resolvedPath)}`);
  console.log();

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.log(`  ${pc.yellow('⚠')}  Line ${warning.line}: ${warning.message}`);
    }
    console.log();
  }

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.log(`  ${pc.red('✖')}  Line ${error.line}: ${error.message}`);
      if (error.suggestion) {
        console.log(`     ${pc.dim('→')} ${error.suggestion}`);
      }
    }
    console.log();
    const eCount = result.errors.length;
    const wCount = result.warnings.length;
    console.log(
      pc.red(
        `  Config is invalid (${eCount} error${eCount !== 1 ? 's' : ''}, ${wCount} warning${wCount !== 1 ? 's' : ''})`,
      ),
    );
    process.exit(1);
  } else if (result.warnings.length > 0) {
    const wCount = result.warnings.length;
    console.log(
      pc.yellow(`  Config is valid with ${wCount} warning${wCount !== 1 ? 's' : ''}`),
    );
  } else {
    console.log(pc.green('  Config is valid ✓'));
  }
}
