import fs from 'fs-extra';
import path from 'node:path';
import { expect } from 'vitest';

/** Assert that a file exists relative to rootDir. */
export async function assertFileExists(rootDir: string, relativePath: string): Promise<void> {
  const full = path.join(rootDir, relativePath);
  expect(await fs.pathExists(full)).toBe(true);
}

/** Assert that all listed files exist relative to rootDir. */
export async function assertFilesExist(rootDir: string, files: string[]): Promise<void> {
  for (const f of files) {
    await assertFileExists(rootDir, f);
  }
}

/** Read and parse a JSON file relative to rootDir. */
export async function readJson<T = Record<string, unknown>>(
  rootDir: string,
  relativePath: string,
): Promise<T> {
  return fs.readJson(path.join(rootDir, relativePath)) as Promise<T>;
}

/** Read a text file relative to rootDir. */
export async function readText(rootDir: string, relativePath: string): Promise<string> {
  return fs.readFile(path.join(rootDir, relativePath), 'utf-8');
}

/** Read directories inside a directory, returning their names. */
export async function listSubdirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}
