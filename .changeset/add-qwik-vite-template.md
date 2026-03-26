---
'create-helix': minor
---

feat: add Qwik + Vite as the 11th framework target

Adds `qwik-vite` to the framework selection with resumability-based scaffolding
and zero-hydration support via Qwik City. Generated projects include:

- `vite.config.ts` with `qwikVite` and `qwikCity` plugins
- `src/root.tsx` entry with `QwikCityProvider` and `RouterOutlet`
- `src/routes/index.tsx` and `src/routes/layout.tsx` (file-based routing)
- TypeScript config with `jsxImportSource: '@builder.io/qwik'`
- Dark mode support via Qwik reactive signals (`useSignal$`)
- Design tokens integration via CSS custom properties
