---
'create-helix': patch
---

Fix Angular template TypeScript version range to use tilde (~5.5.0) instead of caret (^5.5.0), ensuring compatibility with Angular 18's TypeScript <5.6 requirement. Add tilde range support to dependency registry validation tests. Add workflow_dispatch trigger to release workflow.
