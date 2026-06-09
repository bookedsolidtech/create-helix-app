import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = 'dist/index.js';
const shebang = '#!/usr/bin/env node\n';
const content = readFileSync(file, 'utf8');

if (!content.startsWith(shebang)) {
  writeFileSync(file, shebang + content);
}

// ──────────────────────────────────────────────────────────────────────────
// Bundle @helixui/tokens/dist/tokens.css into dist/assets/helix-tokens.css.
//
// The Drupal scaffold vendors this CSS into its theme at scaffold time
// (see src/generators/drupal-theme.ts → readUpstreamHelixTokensCss). If the
// scaffold read directly from the installer's transitive node_modules at
// runtime, the same create-helix VERSION could emit different scaffold
// bytes depending on how npm/pnpm/yarn resolved @helixui/tokens at the
// installer's environment. Bundling here pins the bytes to whatever
// @helixui/tokens version is installed at create-helix's BUILD time, so
// the published tarball ships a fixed, deterministic copy.
//
// Resolved through the package's EXPORTED CSS subpaths — NOT package.json,
// which @helixui/tokens@3.x's exports map deliberately omits (resolving
// './package.json' throws ERR_PACKAGE_PATH_NOT_EXPORTED).
// ──────────────────────────────────────────────────────────────────────────
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const require = createRequire(import.meta.url);

let tokensCssSrc;
for (const subpath of ['@helixui/tokens/dist/tokens.css', '@helixui/tokens/tokens.css']) {
  try {
    tokensCssSrc = require.resolve(subpath);
    break;
  } catch {
    /* try next subpath */
  }
}

if (!tokensCssSrc) {
  console.error(
    '[build] @helixui/tokens not resolvable at build time — ' +
      'check that @helixui/tokens is declared in dependencies.',
  );
  process.exit(1);
}

const assetsDest = join(projectRoot, 'dist', 'assets');
const tokensCssDest = join(assetsDest, 'helix-tokens.css');
mkdirSync(assetsDest, { recursive: true });
copyFileSync(tokensCssSrc, tokensCssDest);
console.log('[build] bundled', tokensCssSrc, '->', tokensCssDest);
