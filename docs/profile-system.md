# Profile System — Design Sketch

> **Status:** Specification, not yet built. Captures the plan for
> `pnpm create helix --profile=<name>` so a scaffolded project can pick up a
> curated bundle of Claude Code agents, skills, hooks, and rules without
> baking those choices into the scaffolder itself.
>
> This document is engine-agnostic by design — the profile system does not
> assume or require any particular governance engine. Consumers can layer
> governance on top later if they choose.

## Problem

`create-helix` already picks a **framework** (`wc-storybook`, `drupal-sdc`,
…) and a **Drupal preset**. Those two knobs decide what source code the
scaffolder writes. They do **not** decide what Claude Code agents / hooks /
skills ship inside the scaffolded project's `.claude/` directory.

Different engagements want different agent bundles. A healthcare engagement
with Figma-driven design hand-off wants the full design-system pipeline
(Figma-classify, Figma-identify-variants, Figma-map-to-lit, …). A
standalone component library with no designer in the loop wants none of it.
Hard-coding one bundle into the scaffolder forces every new project to take
the same agent kit; today the scaffolder ships no agents at all, which
means every new project rebuilds their `.claude/` from scratch or copies
from a neighboring repo.

A **profile** is a named bundle of agents / hooks / skills / rules / MCP
servers that `create-helix` can pull into a scaffolded project on request.

## CLI surface

```bash
# No profile — scaffold ships zero agents/hooks (current behavior, preserved).
pnpm create helix --framework=wc-storybook

# With a named profile — scaffold copies in the bundle listed in that
# profile's manifest.
pnpm create helix --framework=wc-storybook --profile=healthcare-figma

# Multiple profiles — later. Not v1.
pnpm create helix --framework=wc-storybook --profile=healthcare-figma --profile=a11y-strict
```

Profiles are **optional**. The default is "no profile" — the scaffolder
behaves exactly as today. Prompting when a framework is profile-capable
(`wc-storybook` with a known Figma engagement pattern, say) is a v2
concern; v1 is strictly flag-driven.

## Profile manifest shape

Profiles live in `src/profiles/<name>.yaml` inside `create-helix-app`.
Example:

```yaml
# src/profiles/healthcare-figma.yaml
name: healthcare-figma
description: |
  Healthcare-grade Figma → Lit pipeline for engagements like The Well /
  Northwell Health. Includes the design-system pipeline agents, HIPAA
  exclusion rules, and the Figma MCP server wiring.

# Which Claude agents to copy into .claude/agents/
agents:
  pack: '@bookedsolid/claude-pack-figma-pipeline'
  include:
    - principal-architect
    - architect
    - scaffolder
    - implementor
    - tdd-test-writer
    - optimizer
    - security-reviewer
    - accessibility-reviewer
    - performance-reviewer
    - functional-validator
    - researcher
    - review-triage
    - implementation-planner
    - issue-creator
    - scaffold-test-reviewer

# Which skills to copy into .claude/skills/
skills:
  pack: '@bookedsolid/claude-pack-figma-pipeline'
  # `include: all` is permitted; omit to take everything in the pack
  include: all

# Which rules to copy into .claude/rules/
rules:
  pack: '@bookedsolid/claude-pack-figma-pipeline'
  include:
    - testing
    - animations
    - fluid-sizing
    - pipeline-checkpoints
    - workflow
    - code-style
    - ui-core
    - ui-components
    - story-patterns
    - code-gen-template

# Which hooks to copy into .claude/hooks/
hooks:
  pack: '@bookedsolid/claude-pack-safety'
  include:
    - secret-scanner
    - env-file-protection

# Which MCP servers to add to .mcp.json
mcpServers:
  - figma
  - storybook
```

Keys:

- **`name`** — profile identifier. Matches the filename.
- **`description`** — free-form text; surfaced in `--help`.
- **`agents` / `skills` / `rules` / `hooks`** — each points at a published
  npm pack, optionally narrowed via `include`. Omit a key to take nothing
  from that dimension.
- **`mcpServers`** — list of MCP server names to append to the scaffolded
  project's `.mcp.json`. Actual server configuration (command, env) comes
  from a registry the scaffolder ships with. v1 registry lives in
  `create-helix-app`; can move to a separate package later.

## Pack packages — the shipping layer

Profiles reference **packs** — published npm packages that contain the
actual agent / skill / hook / rule files. A pack has the shape:

```
@bookedsolid/claude-pack-figma-pipeline/
├── package.json
├── agents/
│   └── figma-pipeline/
│       ├── principal-architect.md
│       ├── architect.md
│       └── … (one file per agent)
├── skills/
│   └── figma-pipeline/
│       ├── figma-classify-component/
│       ├── figma-identify-variants/
│       └── … (one directory per skill)
├── rules/
│   └── figma-pipeline/
│       └── … (one file per rule)
└── hooks/
    └── figma-pipeline/
        └── … (one file per hook)
```

Scaffolding logic:

1. `pnpm create helix --profile=healthcare-figma` reads
   `src/profiles/healthcare-figma.yaml`.
2. For each agent/skill/hook/rule key, resolve the referenced pack
   (install it to a tmp dir, or use a pre-installed peer).
3. Copy the requested items from the pack into the scaffolded project's
   `.claude/<dimension>/<pack-namespace>/` subdirectory. Namespacing by
   pack keeps multiple profiles composable.
4. Append the requested MCP servers to `.mcp.json`.
5. Write a `.claude/profiles.json` receipt listing which profile(s) and
   packs were applied, so a future `create-helix update` can diff.

## Why packs instead of bundling into create-helix

1. **Independent release cadence.** A Figma pipeline update shouldn't force
   a `create-helix` release. Packs evolve on their own timeline.
2. **Engagement-specific packs.** `@bookedsolid/claude-pack-figma-pipeline`
   is one pack; a future `@clientname/claude-pack-engagement` could exist
   alongside it without Booked Solid's knowledge.
3. **Unpublished-pack support.** v1 CLI accepts `pack:` values that look
   like local paths (`pack: './packs/figma-pipeline'`) for iteration
   before publish.
4. **Smaller scaffolder surface.** create-helix remains a scaffolder, not
   a mirror of every agent library.

## v1 scope

Minimum viable implementation in `create-helix-app`:

1. `src/profiles/` loader — parse YAML, validate against a Zod schema,
   surface errors.
2. `--profile=<name>` CLI flag — single-profile support, error on
   unknown profile.
3. Pack resolver — support npm registry lookup + local path fallback.
4. Copy engine — materialize files into `.claude/` respecting namespaces,
   refusing to overwrite existing files (emit a warning and skip).
5. MCP merger — read existing `.mcp.json` (or create), append requested
   servers, keep the rest.
6. Receipt writer — emit `.claude/profiles.json`.
7. Tests — at minimum, one end-to-end test per known profile against a
   golden fixture `.claude/` tree.
8. Docs — update this file, add a `Profiles` section to the main README.

## v1 profile list

One profile to ship v1:

- **`healthcare-figma`** — once Figgy stabilizes its Figma-pipeline
  `.claude/` subtree, export that subtree as
  `@bookedsolid/claude-pack-figma-pipeline` and point this profile at it.
  Until the pack ships, the profile can reference a local path for
  internal testing.

No attempt to enumerate "all future profiles" here — that's a moving
target and better handled per-engagement.

## Dependencies

- **Workstream C (Figgy cleanup + lift)** must stabilize first. The
  first pack (`@bookedsolid/claude-pack-figma-pipeline`) is an export of
  Figgy's `.claude/*/figma-pipeline/` tree. Packaging that tree before
  Figgy runs the pipeline end-to-end would ship unverified content.
- **Pack publishing conventions** — need a team decision on npm org,
  semver policy, and whether packs ship `.claude/` files with zero
  transformation (preferred) or go through a build step.

## Non-goals (explicit)

- **No governance engine assumed.** Profiles declare what to copy; they
  do not declare a runtime policy. Projects can adopt a governance engine
  later if they choose.
- **Not a package manager.** Profiles don't manage npm dependencies
  inside the scaffolded project — that's what `package.json` is for.
  Profiles manage `.claude/` content only.
- **No runtime activation.** Applying a profile is a one-shot scaffold
  action; there's no "profile daemon" or "profile update" command in v1.

## Rough effort

1–2 weeks once Workstream C stabilizes. Bulk of the work is the pack
resolver + copy engine + tests; schema + CLI flag are small.
