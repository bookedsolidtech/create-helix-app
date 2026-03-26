# Recovery Agent PR Tracking

## Background

When an agent fails repeatedly on a feature, the protoLabs Studio automation system
escalates by creating an `[Auto] Recovery escalated` feature. This recovery feature
runs a fresh agent with additional context about the original failure.

## The Bug (Fixed in protoMaker)

**Observed:** Feature `feature-1774546472031-mak4bgwgj` had PR #131 created and merged
by a recovery agent on 2026-03-26. The feature remained stuck in `review` status for
40+ minutes because `prNumber` was `null` — the reconciliation sweep could not detect
the merge.

**Root Cause — Two failure paths:**

1. **PostExecution safety net**: When `checkAndRecoverUncommittedWork` creates a recovery
   PR after an agent crash, it updated `status → review` but never persisted `prNumber`/
   `prUrl` to the feature store. The reconciliation sweep requires `prNumber` to match
   merged GitHub PRs to features.

2. **Recovery feature propagation**: When an `[Auto] Recovery escalated` feature delivers
   a PR on a _different branch_ than the original feature's `branchName`, the GitHub state
   checker cannot find the PR (it searches by `feature.branchName`). The original feature
   stays stuck in `review` indefinitely because neither `prNumber` nor `branchName` point
   to the recovery PR.

## The Fix (protoMaker commit 29061000c)

Four changes were made to `protoMaker`:

1. **`post-execution-middleware.ts`** — After successful safety-net recovery, call
   `updateFeaturePRInfo(projectPath, featureId, { prNumber, prUrl, prCreatedAt })` so
   the reconciliation sweep can detect and close the PR.

2. **`execution-service.ts`** — Wire `updateFeaturePRInfo` into the PostExecution context
   using `featureLoader.update`. Also: after the git workflow sets `prNumber` on a recovery
   feature that has `recoveryOfFeatureId`, propagate `prNumber`, `prUrl`, and `branchName`
   to the original feature.

3. **`issue-creation-service.ts`** — When creating a recovery bug feature, store
   `recoveryOfFeatureId: originalFeature.id` so the propagation path can find the
   original feature on completion.

4. **`feature.ts` (types)** — Added `recoveryOfFeatureId?: string` field to `Feature`.

## What Agents Should Know

When implementing a feature that was previously delivered by a recovery agent:

- Check if `tests/` or `src/` already contain the expected changes (a prior recovery may
  have delivered them via a different branch already merged to `main`).
- If work is already done, report "No changes needed" and exit cleanly. The system will
  handle moving the feature to `done`.
- Do NOT create a duplicate PR for changes already in `main`.
