# Test Architecture

## Overview

Tests are organized in two directories:

- `src/__tests__/` — integration tests that run the real scaffold and filesystem operations
- `tests/unit/` — focused unit tests for specific behaviors (bundles, edge cases)

## Test Files

| File                                           | Coverage Area                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `src/__tests__/scaffold.test.ts`               | All 8 framework scaffolds, optional features, package.json structure        |
| `src/__tests__/drupal-presets.test.ts`         | All 4 Drupal theme presets (standard, blog, healthcare, intranet)           |
| `src/__tests__/presets.test.ts`                | Preset loader — validation, inheritance, SDC counts                         |
| `src/__tests__/templates.test.ts`              | TEMPLATES registry, COMPONENT_BUNDLES, getTemplate, getComponentsForBundles |
| `tests/unit/bundles/component-bundles.test.ts` | Bundle sizes, no-duplicate invariants, component lists                      |
| `tests/unit/edge-cases/project-names.test.ts`  | Name variants, existing directories, long names                             |

## Running Tests

```bash
# Run all tests
pnpm test

# Run only integration tests
pnpm test -- src/__tests__/

# Run only unit tests
pnpm test -- tests/unit/

# Run a specific test file
pnpm test -- tests/unit/bundles/

# Watch mode
pnpm test:watch
```

## Coverage

Coverage is configured in `vitest.config.ts`. To run with coverage (requires `@vitest/coverage-v8`):

```bash
pnpm test -- --coverage
```

The coverage threshold is 80% on statements, branches, functions, and lines.

Excluded from coverage:

- `src/index.ts` — entry point only
- `src/cli.ts` — TUI interactions (requires interactive terminal)
- `src/__tests__/` — test files themselves

## Test Design Principles

1. **Integration over mocks** — scaffold tests use real filesystem in `/tmp`. This catches real file generation issues.
2. **Fast teardown** — each test suite uses `beforeEach` and `afterAll` to clean up `/tmp` dirs.
3. **No TUI testing** — `cli.ts` is excluded; TUI interactions are not unit-testable without a terminal emulator.
4. **Exact assertions over fuzzy** — bundle sizes and component lists use exact matching to catch accidental additions/removals.
