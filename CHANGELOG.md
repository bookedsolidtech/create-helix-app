# create-helix

## 0.4.0 (unreleased)

### Minor Changes

- **wc-storybook factory — brand-storytelling defaults**

  The flagship `wc-storybook` template now ships a fully-staged Storybook
  out of the box — Cover narrative + foundations IA + per-component AAA
  conformance pages + token-driven manager chrome with FOUC prevention.
  Same designer-grade experience the figma-tokens / Helix Web Component
  Starter Kit Figma library delivers in Figma.
  - **3 new brand prompts** — `brandTagline`, `brandVerticals`,
    `heroScenarios` (interactive only). All optional with cross-domain
    neutral defaults so `--yes` and CI flows continue to work.
  - **2 new CLI flags** — `--brand-tagline` and `--brand-verticals`
    (comma-separated). `heroScenarios` is interactive-only for v1.
  - **`helix.storybook.config.ts`** consumer knob with 5 sections:
    `components` / `docs` / `brand` / `aaa` / `narrative`. Default is
    "everything visible".
  - **4 new Storybook addons** matching upstream Helix —
    `@chromatic-com/storybook`, `@storybook/addon-designs`,
    `@storybook/addon-links`, `storybook-addon-pseudo-states`.
  - **5 React docs components** — `ConsumerObligations`,
    `InlineAuditPanel`, `APGPatternCard`, `A11yStatusCard`,
    `HelixDocsPage`. The `A11yStatusCard` auto-injects on every component
    autodocs page via the `HelixDocsPage` global container.
  - **FOUC sync scripts** — `manager-head.html` + `preview-head.html`
    pre-paint resolve theme/brand from URL globals → localStorage →
    `light` default. Same `helix:storybook:globals` localStorage key
    across both surfaces (regression guard test).
  - **Token-driven manager chrome** — `manager-theme.ts` reads
    `tokenEntries`, `darkTokenEntries`, `highContrastTokenEntries`,
    `resolveTokenRef` from `@helixui/tokens` and feeds resolved hex into
    `Storybook create()` ThemeVars. The previous hardcoded `#0066cc`
    primary is replaced with the consumer's per-mode brand color.
  - **3 docs CSS files** (a11y-card, brand-overrides, helix-docs;
    2,400 LOC total) bundled in `assets/wc-storybook/storybook-docs/`
    and copied into the consumer scaffold via `fs.copy`.
  - **10 narrative MDX pages** — `Cover.mdx`, `Overview.mdx`, 7 under
    `foundations/` (Tokens / Color / Typography / Spacing / Layout /
    Brand / Accessibility), and `patterns/Index.mdx`. All live-bind to
    consumer tokens via `var({prefix}-*)`.
  - **Reference per-component MDX** — `{ds}-button.mdx` with hero scene
    consuming `heroScenarios[0]` if matched, else neutral
    "Sign in to your workspace" default. Title resolves to
    `Components/{ClassName}Button/Conformance` to avoid Storybook
    indexer collision with auto-derived `.stories.ts` entries.
  - **Editorial-first storySort** in `preview.ts`:
    Cover → Overview → Accessibility → Foundations → Patterns →
    Playground → Components.
  - **52 new unit tests** in `wc-storybook-brand.test.ts` covering
    emitter outputs, prop-shape contracts, escape round-trip guards,
    FOUC localStorage-key contract, MDX-title disambiguation, brand
    prompt threading, and the 10-narrative-MDX file count.

  Existing `Welcome.stories.ts` + `HelixCatalog.stories.ts` +
  `design-tokens/*.stories.ts` continue to ship — storySort orders
  Cover above Welcome so the editorial flow leads.

## 0.3.0

### Minor Changes

- 3c199f0: Migrate Remix template from @remix-run v2 to React Router v7
  - Replace all @remix-run/_ packages with react-router and @react-router/_ equivalents
  - Add app/routes.ts with file-based routing via @react-router/fs-routes
  - Add react-router.config.ts for SSR configuration
  - Fix tilde alias imports for server build compatibility
  - Remix template now builds correctly out of the box without workarounds

## 0.2.1

### Patch Changes

- 0298524: Fix Angular template TypeScript version range to use tilde (~5.5.0) instead of caret (^5.5.0), ensuring compatibility with Angular 18's TypeScript <5.6 requirement. Add tilde range support to dependency registry validation tests. Add workflow_dispatch trigger to release workflow.

## 0.2.0

### Minor Changes

- aa24cd6: Release v0.2.0: comprehensive CLI improvements, security hardening, and expanded test coverage
  - Add `list` and `info` CLI commands for framework/preset discovery
  - Add input validation with path traversal protection
  - Add ecommerce Drupal preset
  - Add error boundary components for React and Vue scaffolds
  - Add .editorconfig and .prettierrc to generated projects
  - Expand test suite to 1,264 tests (unit, integration, security)
  - Fix release workflow npm authentication

## 0.12.0

### Minor Changes

- feat: error boundary components for React and Vue generated templates
  - React ErrorBoundary.tsx with getDerivedStateFromError + componentDidCatch for react-next, react-vite, remix, preact-vite
  - Vue ErrorBoundary.vue with onErrorCaptured composition API for vue-vite, vue-nuxt
  - 1190+ tests across 52 test files

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
