import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';

/**
 * Create a uniquely-named temporary directory for integration tests.
 * Caller is responsible for cleanup via removeTempDir().
 */
export function makeTmpRoot(label: string): string {
  return path.join(os.tmpdir(), `helix-int-${label}-${Date.now()}`);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.ensureDir(dir);
}

export async function removeTempDir(dir: string): Promise<void> {
  await fs.remove(dir);
}
