/**
 * Cross-framework monorepo redirect helpers.
 *
 * v0.7.0 Phase E: promoted from src/scaffold/react-next/_shared.ts when
 * Phase E (Vite monorepo emit) needed the exact same helper — the
 * cloneOptionsForAppsWeb body is framework-independent (every monorepo
 * emit lands its app under apps/web/, and the redirect is purely a
 * `path.join(options.directory, 'apps', 'web')` swap).
 *
 * Keeping the duplicate in both react-next/_shared.ts and
 * react-vite/_shared.ts would be a future-bug magnet: changes to where
 * the app lives (e.g. apps/<custom-name>) would have to land in two
 * places. The promotion is purely a refactor — Phase D's react-next
 * imports continue to work via a re-export from
 * react-next/_shared.ts.
 *
 * Per PE P1 (fork-don't-branch): only OUTPUT-ROOT logic differs between
 * flat and monorepo paths. This module IS that output-root logic, made
 * generic.
 */
import path from 'node:path';
import type { ProjectOptions } from '../../types.js';

/**
 * The apps/web subdirectory inside a monorepo scaffold. Centralized so a
 * future "apps/<custom-name>" override would only need to change here.
 */
export const APPS_WEB_REL = path.join('apps', 'web');

/**
 * Clone ProjectOptions with options.directory redirected at
 * <root>/apps/web. Used to drive the existing flat scaffolders
 * (scaffoldReactNextFlat, scaffoldReactViteFlat, ...) against the
 * apps/web root without touching their internals.
 */
export function cloneOptionsForAppsWeb(options: ProjectOptions): ProjectOptions {
  return {
    ...options,
    directory: path.join(options.directory, APPS_WEB_REL),
  };
}
