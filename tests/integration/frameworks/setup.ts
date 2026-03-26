/**
 * Framework integration test utilities.
 *
 * Mirrors the shared integration setup at tests/integration/setup.ts
 * but lives alongside the framework-specific tests for locality.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';

/**
 * Create a uniquely-named temporary directory for integration tests.
 * Caller is responsible for cleanup via removeTempDir().
 */
export function makeTmpRoot(name: string): string {
  return path.join(os.tmpdir(), `helix-fw-${name}-${Date.now()}`);
}

/** Recursively remove a temp directory. */
export async function removeTempDir(dir: string): Promise<void> {
  await fs.remove(dir);
}

/** Read and parse a JSON file at the given absolute path. */
export async function readJson(filePath: string): Promise<unknown> {
  return fs.readJson(filePath);
}

/** Read a text file at the given absolute path. */
export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}
