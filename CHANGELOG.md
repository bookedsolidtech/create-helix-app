# create-helix

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
