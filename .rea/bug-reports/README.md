# rea Bug Reports — Local Pipeline

This directory captures `@bookedsolid/rea` bug reports drafted from inside this repo, before they're ported upstream to the canonical BST vault.

## Why local

`/codex-review` and the `codex-adversarial` agent operate on the current working directory's git repo. Drafts that live here are visible to codex with zero path arguments, no cross-repo MCP gymnastics, no mixing of vault content into codex's repo-review context. We port outward only when the report is finalized.

## Layout

```
.rea/bug-reports/
├── incoming/          # Raw drafts written by the 1hr monitoring loop
├── filed/             # Codex-reviewed + finalized: BUG-XXX-<slug>.md
├── TEMPLATE.md        # Bug report template
└── README.md          # This file
```

- **`incoming/`** — the 1hr loop writes here when `rea doctor` fails on a new version, or the changelog flags a behavior we depend on. Filenames: `<UTC-timestamp>-rea-<version>-<one-word-topic>.md`.
- **`filed/`** — promoted drafts after `/codex-review` validation. Filenames: `BUG-XXX-<slug>.md` where XXX is the next sequential ID (check existing files to avoid collisions).

Both directories are committed to git — these are project artifacts, not secrets.

## Workflow

1. **Loop fires hourly.** If a new rea version is published and our smoke test surfaces an issue, a draft lands in `incoming/`. You'll get a notification.
2. **You triage.** Read the draft. If real, run `/codex-review` to get an adversarial second opinion on the reproduction, root cause, and suggested fix.
3. **Promote.** Rename the file: `mv incoming/<draft>.md filed/BUG-XXX-<slug>.md` with the next sequential ID.
4. **Port upstream.** Manually copy the filed report into `/Volumes/Development/booked/data/bst-cto-kb/Projects/rea/Bug Reports/Rea Bug Reports.md` as a new BUG-XXX entry. Your keystroke. The loop never writes to the vault directly.

## The 1hr loop

Armed with `/loop 1h <prompt>`. The loop skill auto-expires after 7 days — re-arm at the end of each week.

**Re-arm cadence:** every Sunday evening, or whenever a fresh Claude session starts and you want monitoring active.

**Loop prompt** (paste into `/loop 1h ...`):

> Check `npm view @bookedsolid/rea version` against the installed version in `/Volumes/Development/booked/create-helix-app/package.json`. If a newer version is available:
> 1. Fetch the changelog (npm or GitHub releases) and summarize what changed.
> 2. In a git worktree (NOT in the main checkout), attempt `pnpm update @bookedsolid/rea@<latest> && rea upgrade --force && rea doctor`.
> 3. If `rea doctor` fails or any step errors: capture the exact failure mode + reproduction commands into `.rea/bug-reports/incoming/<UTC-timestamp>-rea-<version>-<one-word-topic>.md` using `TEMPLATE.md`.
> 4. If `rea doctor` passes but the changelog flags a behavior we depend on (codex audit gate, hook architecture, cache layer): note as an "advisory" draft, same path.
> 5. Discard the worktree.
> 6. Send a notification only if a draft was written. Don't notify on no-op.
> 7. Never edit code, never run commits, never touch paths outside `.rea/bug-reports/incoming/`.

## Bug ID convention

`BUG-XXX` numbering is shared with the upstream BST vault. Before promoting a draft to `filed/`, scan both:
- `.rea/bug-reports/filed/` (local)
- `/Volumes/Development/booked/data/bst-cto-kb/Projects/rea/Bug Reports/Rea Bug Reports.md` (upstream)

…and pick the next available integer. As of 2026-05-04, upstream is at `BUG-013.0` (open, OPEN-upstream); next available is `BUG-014` or later — verify against the vault before assigning.

## Severity guide

- **critical** — repo cannot commit / cannot push / cannot run rea doctor. Blocks all work.
- **high** — major feature broken (cache, audit, hook); workaround exists but ugly.
- **medium** — defect in a non-critical path; intermittent or scoped to a specific workflow.
- **low** — cosmetic, documentation, or minor ergonomics issue.
