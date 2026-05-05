# Live Token Loop — Demo Runbook

End-to-end demonstration of the Figma → tokens.json → CSS → Storybook HMR loop, scaffolded via `create-helix` and powered by the HELiX Token Suite Figma plugin. **Audience: design crew + dev team.** Built for ~15-second feedback from designer click to developer screen.

This runbook is the canonical walkthrough for the wc-storybook framework's selling point: a designer changes a primitive in Figma, the developer's Storybook repaints in under 15 seconds, and the change cascades through every component variant automatically.

> **TL;DR runbook (after one-time setup):**
> 1. Designer opens HELiX Tokens Figma file → runs `Plugins → HELiX Token Suite → Custom HELiX Exporter → Generate → Download tokens.json`.
> 2. Developer drops `tokens.json` into `<project>/src/tokens/`.
> 3. Storybook (already running with `pnpm storybook` or `npm run storybook`) regenerates CSS automatically and HMR-updates the open browser tab.
> 4. Total time: **<15 seconds.**

---

## What gets demonstrated

| Layer | Tool | Output |
|---|---|---|
| Authoring | Figma + HELiX Token Suite plugin (Custom HELiX Exporter) | nested `tokens.json` with `action.*` semantic tier + 13 semantic groups |
| Scaffold | `create-helix` (this repo) | a working Storybook 10 design system extending HelixButton (Track 1) and HelixElement (Track 2) |
| Bridge | scaffolded `scripts/build-tokens.ts` | converts `tokens.json` → `tokens.css` (`--hx-*` custom properties) on file change |
| Live update | Vite HMR via Storybook 10 | repaints all stories in <1s after CSS change |

The architecture proves a single-source-of-truth model: a primitive change in Figma propagates through Helix's three-tier alias chain (Primitives → Semantics → Components) and into every consuming variant — no manual hunt-and-replace, no per-component CSS edits.

---

## One-time setup

### Figma side

1. **Figma Desktop** (web client cannot import development plugins).
2. Install the HELiX Token Suite plugin:
   - Clone `/Volumes/Development/booked/figma-tokens` (or check it out from the team repo).
   - In Figma Desktop: **Plugins → Development → Import plugin from manifest…** → select `figma-tokens/plugin/manifest.json`.
3. Open the HELiX Tokens Figma file (or any file with the right Variable collections).
4. **(One-time per file)** If the file is empty, populate it via the plugin first:
   - **Plugins → Development → HELiX Token Suite → Build Helix Starter → Build Tokens**.
   - This upserts **276 primitives + 71 semantics × 3 modes + 831 component-tier CSS-var entries across 72 components**. Non-destructive: existing variables of the same name are preserved. Component variables are created empty — runtime CSS cascade provides defaults; designers fill values to override per-component.

### Developer side

1. **Node 20+** and **pnpm 9+** (npm and yarn also work — scripts are runtime-agnostic).
2. **Scaffold a fresh design system:**
   ```bash
   npx create-helix wellds --template wc-storybook --ds-name well
   cd wellds
   pnpm install
   ```
3. **Start Storybook** (the watcher is bundled into the `storybook` script):
   ```bash
   pnpm storybook
   # opens http://localhost:6006 with all 6 button variants + token stories
   ```

That's it. Storybook is now watching `src/tokens/tokens.json` for changes and will regenerate `src/tokens/tokens.css` + HMR-repaint the browser on every save.

---

## The demo (live)

### Step 1 — designer exports

In Figma Desktop:

1. Open the HELiX Tokens file.
2. **Plugins → Development → HELiX Token Suite → Custom HELiX Exporter → Generate**.
3. Watch the status line report `✓ N tokens resolved — ready to save` and the developer console log:
   ```
   [export-tokens] collections: HELiX Primitives + HELiX Semantics + HELiX Components · action.*: 14 · 3.3.1 semantics: 6/6
   ```
   With the full manifest landed, expect Build Helix Starter to log totals near `Primitives: 276 · Semantics: 71 × 3 modes · Components: 831 / 831 tokens across 72 components`.
4. Click **Download tokens.json**.

The downloaded file is a nested `{category.group.scale.value}` tree containing color primitives, the `action.*` semantic tier, and all 13 semantic groups. Length-typed values are emitted as `${n}px`; unitless values (`font-weight`, `opacity`, `line-height`, `z-index`) emit raw numbers.

### Step 2 — developer drops it in

```bash
cp ~/Downloads/tokens.json wellds/src/tokens/tokens.json
```

That's the entire developer step. No build commands. No git ceremony. Just file replacement.

### Step 3 — watch the cascade

Within ~1 second:
- `scripts/build-tokens.ts --watch` (running inside `pnpm storybook` via concurrently) detects the file change.
- It walks the nested tree and emits flattened CSS custom properties to `src/tokens/tokens.css`:
  ```css
  :root {
    --hx-color-primary-500: #429797;
    --hx-color-action-primary-bg: #429797;
    --hx-color-text-on-primary-strong: #FFFFFF;
    /* …276 primitives + 71 semantics + component tier… */
  }
  ```
- Vite HMR pushes the new `tokens.css` to the open Storybook tab.
- All buttons, design-token stories, and the HelixCatalog repaint with the new values.

**Total elapsed time: ~10–15s** from Figma click to browser repaint, dominated by the file-move step.

### Step 4 — change a primitive in Figma → repeat

The whole point of the demo is to show this loop is repeatable:

1. In Figma, select **HELiX Primitives → color/primary/500** → change hex value (e.g. red).
2. Click Custom HELiX Exporter → Generate → Download → drop into project.
3. Storybook repaints. The button — and every component using `var(--hx-color-action-primary-bg)` which aliases to `var(--hx-color-primary-500)` — turns red automatically. The cascade does the work.

---

## What to point out to viewers

- **Track 1 inheritance.** `wellds/src/components/well-button/well-button.ts` is empty body — `class WellButton extends HelixButton {}`. All 6 variants, 3 sizes, slots, parts, ARIA, form association, loading state are inherited at zero cost. The bridge layer in `well-button.styles.ts` is the only brand-specific code.

- **Two-level fallback chain.** Component CSS reads `var(--hx-button-bg, var(--hx-color-action-primary-bg))`. Override either layer:
  - Set `--hx-button-bg` on `:host` to override just this component.
  - Set `--hx-color-action-primary-bg` to override every component that uses primary action.

- **Three-tier alias chain in Figma.** Primitives mutate, Semantics + Components resolve via Figma's native alias mechanism, exporter walks the chain to hex leaves. Designers edit one layer; everything downstream cascades.

- **JSDoc IS the CEM data layer.** `well-button.ts`'s JSDoc enumerates all inherited `@attr`, `@slot`, `@csspart`, `@cssprop`, `@fires` from HelixButton — required for HELiXiR, Storybook autodocs, and IDE tooling to see the inherited API.

- **No client-side code changes.** Everything that happened in step 3 was the build tool reacting to a JSON file change. No TypeScript edits, no component edits, no rebuild commands.

---

## Troubleshooting

### "Storybook didn't repaint"

- Confirm `pnpm storybook` is still running (the watcher is part of the `storybook` script, not a separate process).
- Hard-reload the Storybook tab (`⌘⇧R`).
- `cat src/tokens/tokens.css` — is the timestamp recent? If not, `watch:tokens` isn't running. Restart Storybook.

### "Plugin doesn't show in Figma"

- Confirm Figma Desktop (not web).
- **Plugins → Development → Manage plugins in development** — the plugin should appear. If not, reimport the manifest.
- If the manifest is invalid, Figma reports the error in the developer console (Plugins → Development → Open console).

### "Custom HELiX Exporter: no action.* keys in output"

- The Figma file is missing the `HELiX Semantics` collection (or the action variables aren't named `action/{role}/{state}`).
- Run **Build Helix Starter → Build Tokens** first to populate the file with the canonical 3.3.1 shape.
- Or manually inspect the file's Variable collections: it needs `HELiX Primitives`, `HELiX Semantics`, and (optionally) `HELiX Components` collections.

### "Build Helix Starter logs `string value on non-STRING variable: body/bg (COLOR) / Light — skipped`"

- Resolved 2026-05-05 (figma-tokens commit `1d4bc23`). Helix has semantic-to-semantic aliases (`body/bg → color/surface/default`) that the prior single-pass resolver couldn't handle. Build Helix Starter is now a two-pass operation: pass 1 creates every variable + applies primitive aliases, pass 2 wires up semantic-to-semantic chains. Look for `[build-helix-starter] semantic-to-semantic aliases resolved: N / N` in the dev console.

### "I want to swap the whole color scheme, not just primary"

- Resolved 2026-05-05 (figma-tokens commit `1d4bc23`). The Apply Theme command now ships five fully-calibrated themes — each defines all 11 stops × primary + secondary + neutral (34 colors per theme), not the prior partial 7-stop overrides. Themes: **HELiX Default** (restore), **Royal Blue**, **Crimson**, **Forest**, **Mono Contrast**. UI shows a 5-stop swatch strip + description per theme card. Selected theme gets a teal border.

### "Build Button Grid is gone from the menu"

- Removed 2026-05-05 (figma-tokens commit `1d4bc23`). The 90-frame button matrix was superseded by Build Helix Starter + the registry-backed `buildOne('hx-button')` renderer. Three menu commands now: **Build Helix Starter**, **Apply Theme**, **Custom HELiX Exporter**.

### "Numeric tokens render as `500px` for font-weight"

- Outdated plugin. The fix landed 2026-05-05 in `figma-tokens` repo. Pull latest, reimport plugin manifest in Figma Desktop.

### "Color scale sorts wrong in Figma's Variables panel (50 lands between 400 and 500)"

- Resolved 2026-05-05 (figma-tokens commit `d9de40b`). Variable display names are now zero-padded so `color/primary/050` sorts before `100`. Reimport the plugin manifest and re-run **Build Helix Starter → Build Tokens** — existing un-padded variables are renamed in place (no duplicates created). Reported by Charles Attisano 2026-04-28.

### "Opacity variables show 0.5 but the name says 50 — designers can't tell which is which"

- Resolved 2026-05-05 (figma-tokens commit `d9de40b`). Opacity primitives now carry a Figma description like `"50% opacity. Stored as 0.5 (decimal) for direct binding to Figma fill/stroke opacity."` — visible by hovering the variable in Figma's panel. Reimport the plugin manifest and re-run **Build Helix Starter → Build Tokens**. Reported by Charles Attisano 2026-04-29.

### "build-tokens.ts emits `--hx-*` even though I scaffolded with `--token-prefix=--well`"

- Known issue (BUG draft `2026-05-05T040500Z-cli-token-prefix-leading-dashes.md`). The flag parser drops values that begin with `--`. Workaround: use the interactive prompt mode (`npx create-helix wellds --template wc-storybook` and let it ask), OR post-edit `scripts/build-tokens.ts` line `const PREFIX = '...'`.
- Functionally not a blocker for the live token loop — Helix's internal CSS reads `--hx-*` and the brand divergence is conveyed through the **values** in `tokens.json`, not the variable name. The choice between `--hx-*` and `--well-*` is largely cosmetic at the consumer-CSS layer.

---

## Recommended timing for the live demo

5 minutes total, including questions:

| Time | What |
|---|---|
| 0:00 | "Designer changes Figma. Developer doesn't even need to be in the room." |
| 0:30 | Show the Figma plugin button. Click. Download the JSON. |
| 1:00 | `cp` the JSON into the project. |
| 1:15 | Cut to Storybook tab — buttons have already repainted. |
| 1:30 | Change a different primitive (e.g. `space/4`). Show how spacing cascades. |
| 2:30 | Open well-button.ts — empty class body. Explain Track 1. |
| 3:30 | Open the JSDoc. Explain CEM inheritance limit + JSDoc-as-data-layer. |
| 4:30 | Q&A. |

---

## What's next (post-demo)

- **Northwell brand.** Replace `wellds/src/tokens/tokens.json` values with NWH brand once Monigle assets stabilize. Architecture is brand-agnostic — same scaffold, different values.
- **More components.** `well-card`, `well-input`, etc. — Track 1 if `@helixui/library` exports them, Track 2 (extends WellElement) otherwise.
- **CI integration.** `pnpm tokens:sync` (Enterprise REST path, requires `.env` with `FIGMA_TOKEN` + `FIGMA_FILE_KEY`) lets CI pull tokens directly from Figma without the manual download step.

---

## References

- Scaffold source: `src/scaffold.ts` in this repo (~9300–9700 for token pipeline).
- Plugin source: `/Volumes/Development/booked/figma-tokens/plugin/code.ts` (Custom HELiX Exporter).
- Plugin README: `/Volumes/Development/booked/figma-tokens/README.md` (setup, expected collections, output shape).
- Figgy round-trip runbook (the original instance): `/Volumes/Development/clients/huge/nwh/the-well/figgy/docs/figma-roundtrip.md`.
- Helix reference token shape: `/Volumes/Development/booked/helix/packages/hx-tokens/src/tokens.json`.
- Helix component reference (CSS prop pattern): `/Volumes/Development/booked/helix/packages/hx-library/src/components/hx-button/hx-button.ts:38-79`.
- Architecture docs (Obsidian): `bst-cto-kb/00-Planning/helix/figgy-test/` — `Figma → figgy Live Sync Loop`, `Why Custom Token Export`, `Foundational Findings`.
