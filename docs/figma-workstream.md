# Figma Workstream — Where It Lives, Where It's Going

> **Status:** Advisory. This document codifies the separation of concerns
> between `create-helix-app`, `@helixui/library`, the `figma-tokens` sandbox,
> and the Well's `figgy` PoC. It is the plan-of-record for why the scaffold
> does **not** yet ship a `--with-figma-kit` flag, and when that may change.
>
> The source-of-truth for the full separation ruleset is in the Well vault at
> `the-well/Deliverables/Figma/Figma Guide v2.0/Separation of Concerns — Helix · Figgy · Well · create-helix-app.md`.
> This file is the create-helix-facing summary.

## TL;DR

- **Now:** `booked/figma-tokens` is the sandbox for Figma REST + plugin work.
- **Next:** when the plugin stabilizes, promote it to `helix/packages/figma-plugin/`.
- **Later:** only after four promotion gates clear, add a `--with-figma-kit`
  flag to this scaffolder.

None of that work lands in `create-helix-app` today.

---

## Three horizons

### Short term — the sandbox stays where it is

`/Volumes/Development/booked/figma-tokens/` is the dedicated experimentation
space for Figma REST API integration and the `HELiX Token Suite` Figma plugin
(three menu commands: Build Button Grid, Apply Theme, Custom HELiX Exporter).
It has:

- Its own `.env` with Figma credentials — never promoted upstream.
- W3C-format token files — the working format for round-tripping.
- Four REST operation entry points: `export.ts`, `import.ts`, `reset.ts`,
  `verify.ts`.
- A Figma plugin directory (`plugin/`) with its own manifest and UI.

Scaffold output from `create-helix --template wc-storybook` deliberately
does **not** include any of this. Consumers who need Figma sync today should
fork `figma-tokens` directly or treat it as a read-only reference.

### Medium term — promotion to Helix

Once the plugin's command surface stabilizes and the token export/import
round-trip is verified against at least one production design file, the
plugin code moves to `helix/packages/figma-plugin/`. Rationale: the CEM
lives in `@helixui/library`, and the plugin's primary consumer of that CEM
is the inventory extractor that drives Figma component generation. Colocation
at the monorepo level keeps the CEM and its consumer in the same release
cadence.

At that point, `create-helix-app` scaffolds can reference the Helix-owned
plugin via a generated `figma-extensions.json` without bundling the plugin
itself. The scaffold remains framework-agnostic; the plugin is a Helix
package consumers install independently.

### Long term — scaffold integration

A `--with-figma-kit` flag (or equivalent preset option) lands in
`create-helix-app` **only** after the four gates below have all cleared:

1. **Pipeline ported to Lit.** The figma-to-code pipeline today emits
   React/Tailwind. A Lit variant (or a framework-agnostic IR) must exist
   and be validated against a production design file.
2. **Second Helix project with Figma need.** One use case is an engagement.
   Two is a pattern. `create-helix-app` absorbs the pattern; until then,
   the integration stays project-specific in Figgy.
3. **Figgy extension pattern stabilizes.** The Well's `figgy-button` /
   `figgy-card` / `figgy-tokens` shape needs to prove out in production,
   including the Separation-of-Concerns rules around which files Figgy
   owns vs. inherits.
4. **Token prefix conventions generalize.** The scaffold's `--token-prefix`
   flag today drives CSS custom property names. It needs to map cleanly to
   Figma variable namespaces for a second DS before we bake that mapping
   into codegen.

When all four clear, the scaffold picks up:

- A `figma-extensions.json` manifest scaffolded into the project root.
- A Storybook "Page 4b" override hook where designers can pin component
  variants for Figma sync without editing HelixCatalog.stories.ts.
- Optional `scripts/sync-figma.ts` wired into `package.json` that invokes
  the Helix-owned plugin CLI.

Until then: `booked/figma-tokens` stays the sandbox, Helix stays CEM-only,
and this scaffolder stays runtime-driven without Figma awareness.

---

## Four promotion gates, concretely

| Gate                           | Owner               | Evidence of clearance                                                                                                        |
| ------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Pipeline ported to Lit         | Gus / figma-to-code | One production design file rendered to Lit + Helix components with ≥95% visual parity.                                       |
| Second Helix + Figma project   | BST leadership      | Second engagement kickoff deck naming Figma-driven DS generation as a deliverable.                                           |
| Figgy extension pattern stable | Well engineering    | `figgy-*` components survive two Helix minor bumps without breaking extension overrides.                                     |
| Token prefix maps cleanly      | DS team             | `--token-prefix=foo` tokens round-trip through Figma variables and back without loss, verified on two distinct DS codenames. |

When all four cells show "cleared," cut a create-helix minor bump adding the
Figma-aware scaffolding path. Before then, feature requests go to the
sandbox repo.

---

## Footnote: figma-to-code's portable utilities

`booked/figma-to-code/packages/ui-core/src/utils/` ships four small utilities
that are framework-agnostic and would be at home in Helix directly:

- `use-scroll-reveal` — Intersection Observer wrapper for reveal-on-scroll.
- `use-count-up` — requestAnimationFrame number counter.
- `use-parallax` — scroll-coupled translate transform.
- `classname` — conditional className concatenator.

These are not tied to the Figma workstream timing — they can land in Helix
(or a consumer's brand layer) regardless of whether the full Figma pipeline
ships. `create-helix-app` picks them up automatically once they're part of
`@helixui/library`'s exports; no scaffold change needed.

## Related docs

- [`profile-system.md`](./profile-system.md) — spec for the future
  `--profile=<name>` CLI flag that will bring curated agent / hook / skill
  bundles into scaffolded `.claude/` directories. Engine-agnostic;
  depends on the Figma pipeline stabilizing in Figgy first.
- `the-well/Deliverables/Figma/Figma Guide v2.0/Separation of Concerns — Helix · Figgy · Well · create-helix-app.md` — full ruleset
- `the-well/Deliverables/Figma/Figma Guide v2.0/Figma Build Spec — From HELiX 3.0 CEM.md` — the CEM → figma-inventory.json contract (Helix-owned)
- `the-well/Deliverables/Figma/Figma Guide v2.0/Figma Development Plan for The Well.md` — day-by-day execution plan
- `the-well/Deliverables/Figma/Figma Guide v2.0/Figma Guide 2.0.md` — designer-facing working guide
