---
'create-helix': minor
---

Align `wc-storybook` template with Helix 3.0 and ship every `hx-*` component
in Storybook out of the box.

- Centralize Helix library/tokens version pins at the top of `src/templates.ts`
  (`HELIX_LIBRARY_VERSION`, `HELIX_TOKENS_VERSION`) and bump wc-storybook to
  `@helixui/library@^3.0.0` + `@helixui/tokens@^3.0.0`. Other 16 framework
  templates intentionally remain on older Helix pins.
- Ship `src/stories/HelixCatalog.stories.ts` (runtime overview) and
  `src/stories/_catalog-helpers.ts` (CEM walker, tier classifier, argTypes
  derivation, HIPAA exclusion per Figma Build Spec §5) in every scaffold.
- Ship `scripts/generate-catalog.ts` and a `cem:catalog` package script that
  reads `node_modules/@helixui/library/custom-elements.json` and emits one
  `.stories.ts` file per non-excluded `hx-*` tag under `src/stories/catalog/`.
  Wired to run automatically before `pnpm storybook` and `pnpm build-storybook`
  so designers get the full component catalog from the first run.
- Fix the Helix 3.0 `size` → `hx-size` attribute rename in the
  `${ds}-button` demo stories.
- Remove the `${ds}-card/` demo component from the scaffold. `${ds}-button`
  remains as the single minimal extension example; every other Helix
  component renders via the catalog without manual story authoring.
- Add `docs/figma-workstream.md` documenting the Separation-of-Concerns
  decision to keep Figma integration in the `booked/figma-tokens` sandbox
  until four promotion gates clear.

**Breaking for consumers who depended on:**

- `src/components/${ds}-card/` files existing in the scaffold output.
- `${ClassName}Card` / `${ClassName}CardStyles` exports from the scaffolded
  `src/index.ts`.
- The literal `size="sm|md|lg"` attribute working on Helix button demo
  stories (bind via `hx-size` in Helix 3.0).

Consumers should run `pnpm install && pnpm cem:catalog` after upgrade to
repopulate the catalog stories.
