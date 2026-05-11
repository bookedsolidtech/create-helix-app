# Migrating to create-helix v0.7.0

This guide is for consumers who already run `create-helix` and notice the
prompt looks different in v0.7.0. **Your existing scaffolds are not broken.**
The new monorepo shape only applies to **new** scaffolds where you opt in.

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
