---
'create-helix': minor
---

Add `wc-storybook` framework — a Lit 3 + Storybook 10 design system factory. Scaffolds a parameterized component library with `HelixElement`-extending base class, Track 1/Track 2 inheritance patterns, full design token pipeline (`tokens.json` → `tokens.css` via `build-tokens.ts`, plus `tokens:sync` for Figma REST integration), and production-ready Storybook setup with a11y, autodocs, themes, and Playwright story tests.

Two new CLI flags: `--ds-name` (design system codename, e.g. `bolt` → `bolt-button`, `BoltButton`) and `--token-prefix` (CSS custom property prefix, e.g. `--bolt` → `--bolt-color-primary-500`). Both prompt interactively when selecting the `wc-storybook` framework.
