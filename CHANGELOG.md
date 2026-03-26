# create-helix

## 0.11.0

### Minor Changes

- security: input validation hardening and new info/list commands
  - Input validation: path traversal, null byte injection, type guards for framework/preset
  - `create-helix info <template>` command with --json support
  - `create-helix list` extracted to dedicated commands module
  - Comprehensive test coverage: 1100+ tests across 51 files

## 0.10.0

### Minor Changes

- feat: add upgrade command, verbose flag, and ecommerce Drupal preset
  - New `create-helix upgrade` subcommand to update existing HELiX projects
  - `--verbose` flag for detailed scaffolding output
  - New ecommerce Drupal preset with 8 commerce SDCs (product-card, cart-summary, etc.)
  - Integration tests for all Drupal preset scaffolding

## 0.9.0

### Minor Changes

- 2158f41: feat: add config file support (.helixrc.json) for default CLI options
  security: add CSP meta tag and sanitized HTML output in generated templates

## 0.8.1

### Patch Changes

- b3145fe: Refactor: extract CLI argument parser into dedicated `src/args.ts` module for better testability and maintainability.

## 0.8.0

### Minor Changes

- 3f2cc48: Add `create-helix list` subcommand to show available templates and presets (with --json support). Add --quiet/-q flag for CI-friendly minimal output. Add CI Node.js 20+22 version matrix. Add E2E smoke test to CI workflow. Add CLI argument validation unit tests.

## 0.7.4

### Patch Changes

- 12ecb2a: Add unit tests for Drupal preset configuration validation
- 2b0ddfc: Add --output-dir flag to specify custom output directory
- 8cc2cf3: Add unit tests for template configuration validation
- 7933f85: Add post-scaffold success summary with next steps
- b51ec43: Raise test coverage thresholds to 80%

## 0.7.3

### Patch Changes

- 7c24bff: Add --eslint and --no-eslint flags for non-interactive mode

## 0.7.2

### Patch Changes

- 283e2f2: Add --tokens and --no-tokens flags for design tokens in non-interactive mode
- 2fcfeb1: Add --version flag to CLI
- 60ad293: Improve --help output with grouped commands and examples

## 0.7.1

### Patch Changes

- 6211fa9: Add --dark-mode and --no-dark-mode flags for non-interactive mode
- 57a627d: Add Drupal preset integration tests
- e3cbd4b: Add Lit framework integration test
- 3724581: Add React-Vite framework integration test
- e97454a: Add Stencil framework integration test
- ddf4b1c: Add --typescript and --no-typescript flags for non-interactive mode
- d2479f6: Add Vanilla framework integration test
- 7543259: Add Vue-Vite framework integration test

## 0.7.0

### Minor Changes

- 412da5e: Add --bundles flag for non-interactive component bundle selection
- 0117dca: Add Stencil as a 14th framework target. Stencil is a compiler for building standards-based web components created by the Ionic team. It produces vanilla web components that work everywhere without a runtime dependency.

  Scaffolds: stencil.config.ts, src/components/my-component/my-component.tsx, src/components/my-component/my-component.css, and src/index.ts.

### Patch Changes

- 222b518: Add Preact framework integration test
- 6d14050: Expand Vue-Nuxt framework integration test coverage

## 0.6.0

### Minor Changes

- 427fad5: Add --force flag to overwrite existing directories
- 5598d18: Add Preact + Vite as a 13th framework template option for lightweight React-compatible projects

### Patch Changes

- 444bc78: Add graceful error handling for scaffold failures
- 5a77fa6: Add Lit web components integration test
- ad2339e: Add Qwik framework integration test

## 0.5.1

### Patch Changes

- ef0c8e1: Expand Astro framework integration test coverage

## 0.5.0

### Minor Changes

- 00de3a0: Add Lit + Vite as a framework template option. Lit is Google's lightweight library for building fast, reusable web components — a natural fit for HELiX's web component focus.
- 5feae49: Add --preset flag for non-interactive Drupal preset selection

### Patch Changes

- f1253b9: Expand Angular framework integration test coverage
- e9e2c96: Expand SvelteKit framework integration test coverage
- b3c06cd: Raise test coverage thresholds

## 0.4.0

### Minor Changes

- 3c84683: Add --template flag for non-interactive framework selection

### Patch Changes

- 7b7368d: Add input validation for project names
- d2ea4f0: Add --no-install flag to skip dependency installation
- 8e0f5b0: Add CI coverage reporting and README badges

## 0.3.0

### Minor Changes

- 9cdc15a: Add Qwik + Vite as a new framework template option. Qwik uses resumability with zero hydration cost and native web component support.

### Patch Changes

- 8b586cc: Add Remix framework integration test
- 6d99895: Add Solid.js framework integration test

## 0.2.1

### Patch Changes

- 98d03d0: Add `--dry-run` flag that shows files that would be created without writing them

## 0.2.0

### Minor Changes

- 3f0bd66: Add Solid.js + Vite as a new framework target with fine-grained reactivity support, native web component integration, and full feature flag compatibility.

### Patch Changes

- 2dd3335: Add --version / -v and --help / -h CLI flags

## 0.1.1

### Patch Changes

- 1c20f66: fix: ensure dist/index.js has shebang after TypeScript compilation so npm preserves the bin entry and npx create-helix works correctly
