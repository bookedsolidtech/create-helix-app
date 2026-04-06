---
'create-helix': minor
---

Add custom template override support via templateDir

Enterprises can now point a `templateDir` field in `.helixrc.json` (or set
`HELIX_TEMPLATE_DIR` env var) to a directory of JSON template definition files.
Custom templates follow the same `TemplateConfig` interface and are shown in the
interactive TUI selector with a `[custom]` badge. If a custom template shares an
ID with a built-in one, the custom version wins.
