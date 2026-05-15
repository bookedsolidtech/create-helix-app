---
'create-helix': patch
---

Wire `@helixui/tokens@3.x` into the Drupal scaffold (v0.9.3)

v0.9.2 deliberately left every Drupal preset pinned to `@helixui/tokens@^0.2.0`
with carve-outs in `doctor` + `upgrade` so they wouldn't push Drupal
scaffolds onto an unverified 3.x contract. Investigating that work for
v0.9.3 surfaced a deeper latent bug: the Drupal scaffold has **always**
declared `@helixui/tokens` as a dependency but **never** loaded its CSS,
so every `var(--hx-*, fallback)` reference in the generated theme silently
resolved to its inline fallback instead of the upstream brand token.

v0.9.3 closes that loop for **fresh** Drupal scaffolds:

- The generated `{theme}.libraries.yml` declares a dedicated `helix-tokens`
  library that loads `css/vendor/helix-tokens.css` at `weight: -200`, and
  `global` depends on it — tokens are in place before any theme CSS that
  references them loads.
- The generated `css/style.css` `@import`s `vendor/helix-tokens.css` FIRST,
  ahead of `helix-responsive.css` and `helix-overrides.css`. Cascade order
  is: upstream tokens → responsive defaults → consumer overrides.
- **`css/vendor/helix-tokens.css` is vendored at SCAFFOLD time from a
  BUILD-TIME-BUNDLED copy.** `scripts/add-shebang.mjs` runs at every
  create-helix build and copies `@helixui/tokens/dist/tokens.css` into
  `dist/assets/helix-tokens.css`. The published tarball ships that fixed
  copy, and `scaffoldDrupalTheme` reads from it at scaffold time. This
  makes the scaffold output deterministic per create-helix release — the
  same create-helix version always emits the same bytes, independent of
  how the installer's npm/pnpm/yarn resolves transitive deps. (A fallback
  to runtime `require.resolve` of the package's exported CSS subpaths
  covers vitest tests against `src/`, where the dist artifact doesn't
  exist.) Scaffold-time vendoring also matters because Drupal theme users
  typically don't run `npm install` inside the theme directory — the
  documented setup is `cp -r theme/` + `drush theme:enable`, neither of
  which fires a Node install.
- The scaffold also emits `scripts/copy-helix-tokens.mjs` and wires it to
  the `package.json` postinstall hook. This is the REFRESH path: when a
  developer does run `npm install` in the theme and gets a different
  `@helixui/tokens` version, the vendored copy is kept in sync. The script
  resolves `@helixui/tokens` via Node module resolution (`createRequire` +
  `require.resolve` of the exported CSS subpaths — NOT `package.json`,
  which `@helixui/tokens@3.x`'s exports map doesn't publish), so
  hoisted/workspace installs work the same as flat ones.
- `src/presets/loader.ts` now imports `HELIX_TOKENS_VERSION` from
  `helix-versions.ts` — Drupal joins every framework template on the
  centralized pin (`^3.9.1`). `create-helix`'s own `@helixui/tokens`
  dependency is bumped to the same range (and both lockfiles refreshed)
  so the build-time bundling picks up the 3.9.1 bytes.

**`doctor` and `upgrade` exempt `@helixui/tokens` for ALL Drupal scaffolds
in this release.** The runtime token layer for any Drupal theme is
`css/vendor/helix-tokens.css`, not the declared range in `package.json`
or the contents of `node_modules/@helixui/tokens`. Bumping the pin alone
would advance the declaration while the theme keeps serving stale token
bytes (the documented `cp -r theme/` + `drush theme:enable` flow doesn't
run `npm install`, so the theme's postinstall script never fires to
refresh the vendored CSS). No honest `@helixui/tokens` upgrade exists for
an existing Drupal theme yet, so both checks skip it. The v0.9.4 follow-up
will make `runUpgrade` Drupal-theme-aware — refresh `css/vendor/helix-tokens.css`
from create-helix's bundled copy and, for pre-v0.9.3 themes, also inject
the wiring files (`scripts/copy-helix-tokens.mjs`, the `helix-tokens`
library entry, the `style.css` `@import`). At that point the skips can be
dropped entirely.
