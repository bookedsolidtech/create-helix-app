# Migrating to create-helix

This guide is for consumers who already run `create-helix` and notice the
prompt looks different across v0.7.0 and v0.8.0. **Your existing scaffolds
are not broken.** The monorepo shape only applies to **new** scaffolds where
you opt in.

- [v0.7 → v0.8 — Astro is now a production-tier starter kit](#v07--v08--astro-is-now-a-production-tier-starter-kit)
- [v0.6 → v0.7 — Two-step prompt + monorepo by default](#what-changed-in-v070)

---

## v0.7 → v0.8 — Astro is now a production-tier starter kit

### What changed in v0.8.0

The Q1 starter-kit picker grows from four entries to five. Astro graduates
out of `--show-experimental` and becomes the **fourth production-tier app
target** alongside `wc-storybook`, `react-next`, and `react-vite`.

When you pick **`astro`** at Q1 and keep the design system at Q2 (the
default Y), `create-helix` emits a turbo + pnpm-workspaces monorepo with the
**same workspace shape** v0.7.0 introduced for Next/Vite:

```
my-project/
├── apps/
│   └── web/                  # Astro 5 — landing page, view transitions,
│                             # theme toggle, /about + /docs routes,
│                             # native <hx-*> consumption
├── packages/
│   ├── design-system/        # Lit web components + Storybook
│   ├── types/                # Shared TS types + brand utilities
│   └── utils/                # Shared helpers (cn, isPresent, …)
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── package.json
```

Running `pnpm dev` at the root runs `turbo run dev`, which boots **Astro at
port 4321** (not 3000 — Astro's default) and **Storybook at port 6006**
concurrently.

### What's different about the Astro monorepo vs. Next/Vite

Two things, both deliberate:

1. **WC-native consumption.** Next and Vite consume the design system
   through generated React wrappers at `packages/design-system/src/react.ts`
   (because React + custom elements need `createComponent` from `@lit/react`
   to lift web component events into React's synthetic-event model). Astro
   doesn't need that — Astro's island architecture renders web components
   natively. So `apps/web` for Astro consumes `<hx-button>`, `<hx-card>`,
   etc. **directly** as web components. No wrapper barrel imported, no
   React indirection.
2. **Dev port is 4321, not 3000.** Astro's default. `turbo run dev` reports
   both ports in its concurrent log.

Everything else — the workspace layout, the `workspace:*` deps, the
`tsconfig.base.json` extends pattern, the `packages/{design-system,types,utils}/`
triad — is identical to the Next/Vite monorepo flavor.

### Flat Astro is deprecated (but not removed)

If you were using flat Astro in v0.7.x:

```bash
npx create-helix --template astro --no-design-system
# or
scaffold({ framework: 'astro', monorepoMode: false })
```

**Your existing scaffolds keep working.** The flat scaffolder still emits
the same v0.7.x flat output. No breaking change.

**But future Astro investment lands in the monorepo path.** The flat
scaffolder is now in maintenance-only mode — bugs that affect it will still
be fixed, but new Astro features (and the visual gate baselines committed
in v0.8.0) target the monorepo emit.

**Recommendation.** New Astro scaffolds should use the monorepo default
(no flag needed):

```bash
npx create-helix --template astro
# or interactively, hit Enter through Q2 (default Y)
```

There is no automated `migrate-to-monorepo` for Astro — the manual recipe
below (originally for v0.6 → v0.7 Next/Vite migration) covers Astro too,
because the workspace shape is identical. Just substitute `astro` for
`react-next` and use Astro-specific app config in step 6.

### Visual baselines

v0.8.0 ships the first committed Playwright visual baselines in the
project at `tests/e2e/screenshots/astro/`. If you're curious what the Astro
starter looks like before you scaffold, browse those PNGs in the repo.

### Opt-out paths (preserve flat Astro behavior)

Three escape valves, same as Next/Vite:

| How                 | Where                                                   |
| ------------------- | ------------------------------------------------------- |
| Interactive         | Answer **"n"** at Q2 ("Include design-system package?") |
| Non-interactive CLI | Pass **`--no-design-system`**                           |
| Programmatic API    | `scaffold({ framework: 'astro', monorepoMode: false })` |

---

## What changed in v0.7.0

### Two-step starter-kit picker

The framework prompt is now a two-step starter-kit picker:

1. **Q1 — "What does this project build?"**
   - `wc-storybook` (design system factory)
   - `react-next` (Next.js app)
   - `react-vite` (Vite SPA)
   - `drupal-theme` (Drupal theme)

2. **Q2 — when Q1 is an app framework — "Include `@{scope}/design-system`
   package?"** (Y/n, default **yes**)

### Monorepo by default for app frameworks

When you pick an app framework (`react-next` or `react-vite`) **and keep the
design system at Q2**, the scaffold is now a **turbo + pnpm-workspaces
monorepo** modeled on the shadcn `apps/web` + `packages/ui` precedent.

Output shape:

```
my-project/
├── apps/
│   └── web/                  # Next.js or Vite app
├── packages/
│   ├── design-system/        # Lit web components + Storybook
│   ├── types/                # Shared TS types + brand utilities
│   └── utils/                # Shared helpers (cn, isPresent, …)
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── package.json
```

`apps/web` depends on the workspace packages via `workspace:*` declarations.

### `wc-storybook` always scaffolds flat

`wc-storybook` is itself a design system — wrapping it in a monorepo would
duplicate the layer. The Q2 prompt is skipped when you pick `wc-storybook`,
and the v0.6.x flat output is preserved.

---

## Existing scaffolds are NOT broken

- v0.5.x and v0.6.x scaffolds are **flat** (single-app directory).
- Their shape is **unchanged** in v0.7.0.
- They continue to build, type-check, and ship.
- There is **no automatic migration** from flat → monorepo. A
  `create-helix migrate-to-monorepo` subcommand is **deferred to v0.7.1**
  per the plan.

If you want to keep using the flat shape on new scaffolds, see the next
section.

---

## How to opt out of the new defaults

Three escape valves:

| How                 | Where                                                        |
| ------------------- | ------------------------------------------------------------ |
| Interactive         | Answer **"n"** at Q2 ("Include design-system package?")      |
| Non-interactive CLI | Pass **`--no-design-system`**                                |
| Programmatic API    | `scaffold({ framework: 'react-next', monorepoMode: false })` |

All three produce the v0.6.x flat single-app output. The DS package is not
emitted, and no workspace files (`pnpm-workspace.yaml`, `turbo.json`,
`tsconfig.base.json`) are created.

### Examples

**Flat react-next, non-interactive:**

```bash
npx create-helix --template react-next --no-design-system
```

**Flat react-vite, programmatic:**

```ts
import { scaffold } from 'create-helix/api';

await scaffold({
  name: 'my-app',
  directory: './my-app',
  framework: 'react-vite',
  monorepoMode: false, // <-- flat
});
```

**Explicit monorepo opt-in (same as default):**

```bash
npx create-helix --template react-next --monorepo
```

---

## Manual migration: flat → monorepo

For early adopters who want to convert an existing flat v0.6.x scaffold to
the v0.7.0 monorepo shape, here is the exact recipe. (A
`create-helix migrate-to-monorepo` subcommand will automate this in v0.7.1.)

### 1. Scaffold a reference monorepo

The easiest path is to scaffold a fresh monorepo to a temp dir and copy the
root-level files into your existing project.

```bash
cd /tmp
npx create-helix --template react-next --monorepo --ds-name myds --token-prefix --my reference-monorepo
```

### 2. Move your app under `apps/web/`

In your existing scaffold:

```bash
mkdir -p apps/web
git mv src apps/web/src
git mv public apps/web/public
git mv next.config.* apps/web/
git mv package.json apps/web/package.json
git mv tsconfig.json apps/web/tsconfig.json
# Move any other app-specific files: .env, .env.local, README, etc.
```

For a Vite scaffold, also move `vite.config.ts`, `index.html`, and
`tsconfig.node.json`.

### 3. Create the new root files

Copy these from your reference monorepo (`/tmp/reference-monorepo/`):

- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.json` (root — references `apps/*` and `packages/*`)
- `tsconfig.base.json` (shared compiler options + path aliases)
- `package.json` (root — workspace scripts + dev tooling only)
- `.editorconfig`, `.prettierrc`, `eslint.config.js`
- `README.md` (root — describes the monorepo)

### 4. Rename `apps/web/package.json`

Edit `apps/web/package.json`:

- Change `name` to `@<scope>/web` (where `<scope>` matches your monorepo
  root `name`).
- Add `workspace:*` declarations for the packages you'll consume:

```jsonc
{
  "name": "@myproject/web",
  "dependencies": {
    "@myproject/design-system": "workspace:*",
    "@myproject/types": "workspace:*",
    "@myproject/utils": "workspace:*",
  },
}
```

### 5. Update `apps/web/tsconfig.json`

Extend the new base config and point to the workspace packages:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@myproject/design-system": ["../../packages/design-system/src"],
      "@myproject/types": ["../../packages/types/src"],
      "@myproject/utils": ["../../packages/utils/src"],
    },
  },
  "include": ["src", "next-env.d.ts"],
}
```

### 6. Framework-specific wiring

**Next.js (`apps/web/next.config.ts`):**

```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@myproject/design-system', '@myproject/types', '@myproject/utils'],
  experimental: { externalDir: true },
};

export default config;
```

**Vite (`apps/web/vite.config.ts`):**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@myproject/design-system', '@myproject/types', '@myproject/utils'],
  },
  server: {
    fs: { allow: ['..', '../..'] },
  },
});
```

### 7. Copy in the packages

Copy `packages/design-system/`, `packages/types/`, `packages/utils/` from
your reference monorepo. Update the package `name` fields to match your
`<scope>` (`@myproject/design-system`, etc.).

### 8. Install and verify

```bash
pnpm install
pnpm type-check
pnpm dev      # boots apps/web (3000) + storybook (6006) concurrently
```

If `pnpm install` complains about missing peers (`@lit/react`, etc.), make
sure your `packages/design-system/package.json` carries the same
dependencies as the reference (the v0.7.0 Phase H follow-up locked these
down).

---

## Known v0.7.0 deferrals

These ship in a future release:

- **`create-helix migrate-to-monorepo` subcommand** → **v0.7.1**.
  Automates the manual recipe above.
- **Publishable design-system package** — in v0.7.0, `packages/design-system`
  is workspace-internal only. Publishing it to npm as a standalone package
  needs additional wiring (build pipeline, entry points, peer deps narrowed)
  and is queued for a later minor.
- **npm / yarn workspace support** — v0.7.0 emits a **pnpm-only** monorepo
  (`pnpm-workspace.yaml`, `workspace:*` protocol). npm workspaces and yarn
  workspaces use different conventions; multi-package-manager support is
  not on the v0.7.x roadmap.
- **`docs/FOLLOW-UP-v0.5.1-sync-tokens.md` punch list** — `sync-tokens.ts`
  hardening (validate output paths, dedupe writes, surface plugin version
  mismatches) carries forward to a later patch.

See also [`docs/FOLLOW-UP-shared-storybook-kit.md`](./docs/FOLLOW-UP-shared-storybook-kit.md)
for the bigger eventual `@helixui/storybook-kit` extraction — when (and if)
that lands, the `packages/design-system` emit will consume the shared kit
instead of inlining the Storybook depth.

---

## Questions?

- Open an issue: <https://github.com/bookedsolidtech/create-helix-app/issues>
- See the v0.7.0 entry in [`CHANGELOG.md`](./CHANGELOG.md) for the full
  phase-by-phase changelist.
