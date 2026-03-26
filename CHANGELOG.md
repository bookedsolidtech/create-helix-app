# create-helix

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
