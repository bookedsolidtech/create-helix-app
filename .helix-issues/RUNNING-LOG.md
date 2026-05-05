---
title: Helix Bug Reports — Running Log (POINTER)
type: pointer
status: redirect
---

# This file is a pointer.

The canonical running log for Helix component issues lives in the BST Obsidian vault:

**`/Volumes/Development/booked/data/bst-cto-kb/Projects/HELiX/Bug Reports/Helix Bug Reports.md`**

It's helix-team-facing, curated, and follows the precedent set by `Projects/rea/Bug Reports/`.

## Why two surfaces

- **Vault doc** (the canonical running log) — helix-team facing, real-time append, status header, promotion workflow. This is what the Helix team reads.
- **`.helix-issues/`** (this directory) — local repo working tracker. Drafts in `incoming/`, formal entries with frontmatter in `filed/HX-NNN/`, top-10 in `PRIORITY.md`. Plugin-author tooling.

When a new issue surfaces:

1. Append entry to the **vault doc** with timestamp + tag (PROMOTE / WORKAROUND / INFO).
2. Drop a draft into `incoming/` if it's getting formal HX-NNN tracking.
3. Promote to `filed/HX-NNN-<slug>.md` after triage.
4. Update `PRIORITY.md` if top-10.

The vault doc never gets deleted from — only resolved-status updates. It's the chronological history.
