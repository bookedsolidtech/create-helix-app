---
'create-helix': patch
---

Deduplicate VALID_FRAMEWORKS and VALID_PRESETS arrays into single canonical definitions in src/validation.ts, eliminating drift risk between config-validator.ts and validation.ts.
