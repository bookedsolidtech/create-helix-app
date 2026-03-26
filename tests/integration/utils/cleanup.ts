import fs from 'fs-extra';

const registeredDirs: string[] = [];

/** Register a directory for cleanup. Call cleanupAll() in afterAll(). */
export function trackForCleanup(dir: string): void {
  registeredDirs.push(dir);
}

/** Remove all registered directories. Safe to call even if dirs don't exist. */
export async function cleanupAll(): Promise<void> {
  const toClean = registeredDirs.splice(0);
  await Promise.all(toClean.map((d) => fs.remove(d).catch(() => undefined)));
}
