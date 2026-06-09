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
 * The packages/design-system subdirectory inside a monorepo scaffold.
 * v0.7.0 Phase F — DS-package emit lands here when a react-next / react-vite
 * scaffold opts into includeDesignSystem alongside its apps/web emit.
 * Centralized for the same reason as APPS_WEB_REL — a future
 * "packages/<custom-ds-name>" override would only need to change here.
 */
export const DS_PACKAGE_REL = path.join('packages', 'design-system');

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

/**
 * Clone ProjectOptions with options.directory redirected at
 * <root>/packages/design-system. Used by Phase F's
 * scaffoldWcStorybookMonorepo to drive the existing wc-storybook flat
 * factory against the DS-package root without touching its 5366-LOC body.
 *
 * Per PE P1 (fork-don't-branch): mirror of cloneOptionsForAppsWeb — only
 * output-root logic forks between flat and monorepo paths. The redirect
 * keeps the wc-storybook factory's heredoc-emitting code byte-stable.
 */
export function cloneOptionsForDesignSystem(options: ProjectOptions): ProjectOptions {
  return {
    ...options,
    directory: path.join(options.directory, DS_PACKAGE_REL),
  };
}
