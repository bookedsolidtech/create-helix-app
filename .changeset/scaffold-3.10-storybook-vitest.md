---
'create-helix': minor
---

Scaffolded `wc-storybook` projects now target Storybook 10.4 + Vitest 4 (dropping the deprecated `@storybook/addon-designs`), and the generated templates are corrected for HELiX 3.10 — accurate component APIs and consistent `@helixui/*` version pins across every framework template. `create-helix doctor` now flags an `@helixui/library` install that sits below the 3.10 floor the templates target (even on the same 3.x major), and `create-helix upgrade` lifts a same-major install up to that floor.
