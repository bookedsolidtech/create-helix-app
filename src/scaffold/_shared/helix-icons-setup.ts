/**
 * Cross-framework `@helixui/icons` sprite-path setup.
 *
 * Why this module exists: `@helixui/library@3.x`'s `<hx-icon>` resolves its
 * sprite SVGs through the `@helixui/icons` registry, whose `basePath`
 * defaults to `https://cdn.jsdelivr.net/npm/@helixui/icons@1.0.0/dist`. The
 * scaffolded landing pages render `<hx-icon library="fa-free" name="...">`
 * elements, so on every page load the browser tries to fetch
 * `${basePath}/fa-free-solid.svg` from a cross-origin CDN — and blocks it
 * ("Unsafe attempt to load URL ... Domains, protocols and ports must
 * match."). `scaffold + install + build` never catches this; only the
 * real-browser E2E visual sweep does. On `@helixui/library@1.x` it was
 * invisible (1.x `hx-icon` had no sprite/library API), so the v0.9.2
 * version bump is what exposed it.
 *
 * The fix is HELiX's own documented pattern (`@helixui/icons`'s
 * `registry.js`):
 *   1. Copy the package's bundled sprite SVGs into the app's static dir.
 *   2. Call `setBasePath('/icons')` before `@helixui/library` first loads,
 *      so the registry resolves sprites same-origin.
 *
 * This module is the single source for both halves so the eight emission
 * sites (flat + monorepo `apps/web`, across astro / sveltekit / react-next
 * / react-vite) stay in lockstep — mirrors how `monorepo-redirect.ts`
 * centralizes the apps/web output-root logic. A change to the copy-script
 * body or the base path lands here once.
 */
import type { Framework } from '../../types.js';

/**
 * The app frameworks whose scaffolds render `<hx-icon>` and therefore need
 * the local-sprite setup. wc-storybook is intentionally absent — it wires
 * `setBasePath('/icons')` + Storybook `staticDirs` through its own factory
 * (the reference pattern this module generalizes).
 */
export const HELIX_ICONS_FRAMEWORKS = [
  'astro',
  'svelte-kit',
  'react-next',
  'react-vite',
] as const satisfies readonly Framework[];

/** Framework covered by the shared `@helixui/icons` sprite setup. */
export type HelixIconsFramework = (typeof HELIX_ICONS_FRAMEWORKS)[number];

/** Narrowing guard — true when `framework` needs the local-sprite setup. */
export function isHelixIconsFramework(framework: Framework): framework is HelixIconsFramework {
  return (HELIX_ICONS_FRAMEWORKS as readonly Framework[]).includes(framework);
}

/**
 * The framework's static-asset directory, relative to the app root. The
 * sprite-copy script writes `<staticDir>/icons/*.svg`; `setBasePath('/icons')`
 * resolves against the served root, which maps to that directory.
 *
 *   - astro / react-next / react-vite → `public`
 *   - svelte-kit                      → `static`
 */
export function helixIconsStaticDir(framework: HelixIconsFramework): 'public' | 'static' {
  return framework === 'svelte-kit' ? 'static' : 'public';
}

/**
 * Relative path (POSIX separators — it lands in a generated `package.json`
 * script and an `.mjs` file path, both of which want `/`) of the emitted
 * sprite-copy script inside the scaffolded app.
 */
export const HELIX_ICONS_COPY_SCRIPT_REL = 'scripts/copy-helix-icons.mjs';

/**
 * The `package.json` `scripts.postinstall` command that runs the sprite-copy
 * script. Chained after any pre-existing `postinstall` via
 * {@link composePostinstall}.
 */
export const HELIX_ICONS_POSTINSTALL_CMD = `node ${HELIX_ICONS_COPY_SCRIPT_REL}`;

/**
 * Compose a `postinstall` value: if the template already declares one, keep
 * it and chain ours after with `&&`; otherwise just ours. Never clobbers.
 */
export function composePostinstall(existing: string | undefined): string {
  if (existing && existing.trim().length > 0) {
    return `${existing} && ${HELIX_ICONS_POSTINSTALL_CMD}`;
  }
  return HELIX_ICONS_POSTINSTALL_CMD;
}

/**
 * Body of `scripts/copy-helix-icons.mjs` emitted into the scaffolded app.
 *
 * Resolves the two sprite SVGs `<hx-icon>` references (`helix.svg` for the
 * `helix` library, `fa-free-solid.svg` for the `fa-free` library) via
 * `createRequire(import.meta.url).resolve(...)` — that walks up the dep
 * tree, so it works for both a flat `node_modules` install and a
 * pnpm-hoisted monorepo layout. Both subpaths are in `@helixui/icons`'s
 * `exports` map, so the resolve is supported API, not a deep reach.
 *
 * Defensive by design: the whole resolve+copy is wrapped in try/catch and
 * exits 0 on failure with a clear warning. `@helixui/icons` is a declared
 * dependency wherever `@helixui/library` is consumed, so it should always
 * be present — but a broken postinstall must never fail a consumer's
 * `npm install`.
 *
 * @param staticDir - `'public'` (astro/react-next/react-vite) or `'static'`
 *   (svelte-kit). The script copies into `<staticDir>/icons/`.
 */
export function helixIconsCopyScript(staticDir: 'public' | 'static'): string {
  return `/**
 * Copy @helixui/icons sprite SVGs into ${staticDir}/icons/ so <hx-icon>
 * resolves them same-origin instead of from the cross-origin jsdelivr CDN
 * (the @helixui/icons registry default), which the browser blocks.
 *
 * Generated by create-helix. Runs as a postinstall step. Paired with a
 * setBasePath('/icons') call in the app's HELiX runtime loader.
 *
 * Safe to re-run; safe to delete and regenerate via \`npm install\`.
 */
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

// Both subpaths are published in @helixui/icons' "exports" map.
const SPRITES = ['@helixui/icons/dist/helix.svg', '@helixui/icons/dist/fa-free-solid.svg'];

const destDir = join(process.cwd(), '${staticDir}', 'icons');

try {
  mkdirSync(destDir, { recursive: true });
  for (const sprite of SPRITES) {
    const resolved = require.resolve(sprite);
    const fileName = sprite.slice(sprite.lastIndexOf('/') + 1);
    copyFileSync(resolved, join(destDir, fileName));
  }
  console.log('[helix-icons] copied sprite SVGs to ${staticDir}/icons/');
} catch (err) {
  // Never fail the consumer's install — log and move on. <hx-icon> will
  // fall back to the jsdelivr CDN (blocked cross-origin, but non-fatal to
  // install). Re-run \`npm install\` once @helixui/icons resolves.
  console.warn(
    '[helix-icons] could not copy sprite SVGs (' +
      (err instanceof Error ? err.message : String(err)) +
      ') — <hx-icon> sprites may not load. Ensure @helixui/icons is installed.',
  );
  process.exit(0);
}
`;
}

/**
 * The gitignore entry for the postinstall-generated sprite directory.
 * They're build artifacts, not source — `<staticDir>/icons/`.
 */
export function helixIconsGitignoreEntry(staticDir: 'public' | 'static'): string {
  return `${staticDir}/icons/`;
}

/**
 * ES-module `import` form that brings `setBasePath` into scope. Use in
 * loaders that are themselves ES modules with static imports (the Astro
 * `<script>` block).
 */
export const HELIX_ICONS_SETBASEPATH_IMPORT = "import { setBasePath } from '@helixui/icons';";

/**
 * The `setBasePath` call itself. Points the `@helixui/icons` registry at
 * the same-origin `/icons/` path the sprite-copy script populates. MUST run
 * before `@helixui/library` first loads.
 */
export const HELIX_ICONS_SETBASEPATH_CALL = "setBasePath('/icons');";

/**
 * Dynamic-import form for loaders that load `@helixui/library` lazily
 * (SvelteKit's `onMount`, React's effect-gated `import('@helixui/library')`).
 * Emits a single `await` statement that destructures `setBasePath` and
 * calls it — drop it in immediately before the `import('@helixui/library')`.
 *
 * @param indent - leading whitespace for each emitted line, matching the
 *   surrounding loader's indentation.
 */
export function helixIconsSetBasePathDynamic(indent: string): string {
  return (
    `${indent}// Point the @helixui/icons registry at the same-origin /icons/ path the\n` +
    `${indent}// postinstall sprite-copy populates, before @helixui/library loads —\n` +
    `${indent}// otherwise <hx-icon> sprites resolve to the blocked jsdelivr CDN.\n` +
    `${indent}const { setBasePath } = await import('@helixui/icons');\n` +
    `${indent}setBasePath('/icons');`
  );
}
